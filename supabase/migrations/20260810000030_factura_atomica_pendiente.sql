-- ============================================================
-- Migración 30: la función atómica de la migración 28 no conocía
-- el documento "Pendiente" (pagado hoy, factura por llegar), que
-- llegó recién en la 29. Se reemplaza con la versión completa.
--
-- Cambia la firma (3 parámetros nuevos), así que primero se borra
-- la anterior: si no, Postgres las trataría como dos funciones
-- distintas y la app llamaría a la vieja.
-- ============================================================

drop function if exists public.registrar_factura(
  text, text, text, date, numeric, text, text, boolean, boolean, jsonb);

create or replace function public.registrar_factura(
  p_serie      text,
  p_ruc        text,
  p_prov       text,
  p_fecha      date,
  p_monto      numeric,
  p_forma      text,
  p_proyecto   text,          -- código de obra (2503), no el nombre
  p_compromiso boolean,       -- el proveedor da crédito y factura al pagar
  p_efectivo   boolean,       -- pagado con caja chica
  p_pendiente  boolean,       -- YA se pagó, la factura llega después
  p_medio      text,          -- medio real cuando es pendiente no efectivo
  p_banco      text,          -- exigido si el medio no es Efectivo
  p_num_op     text,
  p_lineas     jsonb          -- [{"item":"<uuid>","precio":12.50}, ...]
)
returns jsonb
language plpgsql
as $$
declare
  v_user   uuid := auth.uid();
  v_fact   uuid;
  v_rend   uuid;
  v_fondo  numeric;
  v_estado text := 'Pendiente';
  v_medio  text;
  v_tipo   text := 'Factura';
  v_serie  text;
  v_trab   record;
  l        jsonb;
begin
  if v_user is null then
    raise exception 'Sesión no válida.';
  end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La factura tiene que cubrir al menos un ítem.';
  end if;
  if p_compromiso and p_pendiente then
    raise exception 'O el proveedor da crédito, o ya pagaste. No las dos cosas.';
  end if;

  insert into public.proveedores (ruc, razon_social)
  values (p_ruc, upper(trim(p_prov)))
  on conflict (ruc) do nothing;

  if p_compromiso then
    v_tipo := 'Compromiso';
  elsif p_pendiente then
    v_tipo := 'Pendiente';
  end if;

  -- ── Efectivo: engancha a la rendición del día de la obra
  if p_efectivo then
    select r.fecha, r.estado into v_trab
      from public.rendiciones r
     where r.proyecto = p_proyecto
       and r.fecha < current_date
       and r.estado in ('Con diferencia', 'Observada')
     order by r.fecha
     limit 1;
    if found then
      raise exception 'Caja de la obra bloqueada: la rendición del % está en "%" y nadie la ha resuelto.',
        to_char(v_trab.fecha, 'DD/MM/YYYY'), v_trab.estado;
    end if;

    select id into v_rend
      from public.rendiciones
     where proyecto = p_proyecto and fecha = current_date;

    if v_rend is null then
      select monto_fondo into v_fondo
        from public.cajas_chicas where proyecto = p_proyecto;
      insert into public.rendiciones (proyecto, fecha, responsable_id, monto_fondo)
      values (p_proyecto, current_date, v_user, coalesce(v_fondo, 2000))
      returning id into v_rend;
    end if;

    v_estado := 'Pagada';
    v_medio  := 'Efectivo';

  -- ── Pendiente sin efectivo: la plata salió del banco
  elsif p_pendiente then
    v_estado := 'Pagada';
    v_medio  := coalesce(p_medio, 'Transferencia');
    if v_medio <> 'Efectivo' and (p_banco is null or p_num_op is null
        or length(trim(p_banco)) = 0 or length(trim(p_num_op)) = 0) then
      raise exception 'Si ya pagaste por banco, registra el banco y el N° de operación.';
    end if;
  end if;

  insert into public.facturas (
    serie, proveedor_ruc, fecha, monto, forma_pago, proyecto, registrado_por,
    tipo_doc, estado_pago, medio_pago, banco, numero_operacion,
    fecha_pago, pagado_por, rendicion_id
  ) values (
    p_serie, p_ruc, p_fecha, p_monto, p_forma, p_proyecto, v_user,
    v_tipo, v_estado, v_medio,
    case when v_medio is not null and v_medio <> 'Efectivo' then p_banco end,
    case when v_medio is not null and v_medio <> 'Efectivo' then p_num_op end,
    case when v_estado = 'Pagada' then current_date end,
    case when v_estado = 'Pagada' then v_user end,
    v_rend
  )
  returning id, serie into v_fact, v_serie;

  for l in select * from jsonb_array_elements(p_lineas) loop
    insert into public.factura_items (factura_id, rq_item_id, precio_unitario)
    values (v_fact, (l->>'item')::uuid, (l->>'precio')::numeric);
  end loop;

  return jsonb_build_object('id', v_fact, 'serie', v_serie, 'tipo', v_tipo);
end;
$$;

comment on function public.registrar_factura is
  'Registra factura + líneas (+ rendición si es efectivo) en una sola transacción. Soporta factura normal, compromiso de crédito y documento pendiente. Invoker: respeta RLS y triggers.';

notify pgrst, 'reload schema';
