-- ============================================================
-- Migración 28: registrar la factura en UNA SOLA TRANSACCIÓN.
--
-- Hoy la app hace 3 llamadas separadas (proveedor, rendición,
-- factura, líneas). Si una falla después de que otra ya grabó,
-- queda basura imposible de limpiar:
--   · factura HUÉRFANA (sin ítems): consume la serie+RUC, aparece
--     como deuda en Pagos, y no se puede borrar ni corregir.
--   · rendición HUÉRFANA: se abre el día de la obra sin ninguna
--     factura, y el arqueo la cierra con sobrante = fondo completo.
--
-- Una función de Postgres es atómica: si algo revienta, NO queda
-- nada a medias. Corre con los permisos de quien llama (invoker),
-- así que TODAS las políticas RLS y los triggers siguen aplicando
-- igual que antes: esto no abre ningún permiso nuevo.
-- ============================================================

create or replace function public.registrar_factura(
  p_serie      text,
  p_ruc        text,
  p_prov       text,
  p_fecha      date,
  p_monto      numeric,
  p_forma      text,
  p_proyecto   text,          -- código de obra (2503), no el nombre
  p_compromiso boolean,
  p_efectivo   boolean,
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
  v_trab   record;
  l        jsonb;
begin
  if v_user is null then
    raise exception 'Sesión no válida.';
  end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La factura tiene que cubrir al menos un ítem.';
  end if;

  -- Proveedor nuevo: se da de alta solo (idempotente)
  insert into public.proveedores (ruc, razon_social)
  values (p_ruc, upper(trim(p_prov)))
  on conflict (ruc) do nothing;

  if p_compromiso then
    v_tipo := 'Compromiso';
  end if;

  -- ── Efectivo: engancha a la rendición del día de la obra
  if p_efectivo then
    -- Un descuadre sin resolver de días anteriores cierra la caja
    select r.fecha, r.estado, r.diferencia into v_trab
      from public.rendiciones r
     where r.proyecto = p_proyecto
       and r.fecha < current_date
       and r.estado in ('Con diferencia', 'Observada')
     order by r.fecha
     limit 1;
    if found then
      raise exception 'Caja de la obra bloqueada: la rendición del % está en "%" y nadie la ha resuelto. No se puede seguir comprando en efectivo.',
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
  end if;

  -- ── Cabecera
  insert into public.facturas (
    serie, proveedor_ruc, fecha, monto, forma_pago, proyecto, registrado_por,
    tipo_doc, estado_pago, medio_pago, fecha_pago, pagado_por, rendicion_id
  ) values (
    p_serie, p_ruc, p_fecha, p_monto, p_forma, p_proyecto, v_user,
    v_tipo, v_estado, v_medio,
    case when v_estado = 'Pagada' then current_date end,
    case when v_estado = 'Pagada' then v_user end,
    v_rend
  )
  returning id into v_fact;

  -- ── Líneas con su precio unitario
  for l in select * from jsonb_array_elements(p_lineas) loop
    insert into public.factura_items (factura_id, rq_item_id, precio_unitario)
    values (v_fact, (l->>'item')::uuid, (l->>'precio')::numeric);
  end loop;

  -- El trigger diferido de cuadre (migración 5) valida aquí, al cerrar
  -- la transacción: si el desglose no cuadra, se revierte TODO.
  return jsonb_build_object('id', v_fact, 'serie', (select serie from public.facturas where id = v_fact));
end;
$$;

comment on function public.registrar_factura is
  'Registra factura + líneas (+ rendición si es efectivo) de forma atómica. Invoker: respeta RLS y triggers.';

notify pgrst, 'reload schema';
