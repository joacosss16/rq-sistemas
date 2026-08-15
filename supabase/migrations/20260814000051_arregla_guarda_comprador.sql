-- ============================================================
-- MIGRACIÓN 51 · ARREGLA DOS COSAS QUE ROMPIÓ LA 50
--
-- Al reescribir `trg_comprador_solo_estado` en la migración 50 se
-- perdieron dos cosas. Las dos están rotas en producción ahora mismo.
--
-- 1) SE BORRÓ EL SELLO DE QUIÉN COMPRÓ
-- La migración 16 estampaba `comprado_por := auth.uid()` en la
-- transición —→Comprado. La reescritura no lo conservó, y la app
-- nunca manda esa columna (solo envía {estado:'Comprado'}). Efecto:
--   · `comprado_por` queda NULL en todas las compras.
--   · La pestaña Facturar del comprador filtra por esa columna, así
--     que le sale VACÍA: no puede registrar sus facturas en efectivo
--     y la rendición del día no cierra.
--   · Se apagan el "por Fulano" bajo el estado y la tabla por
--     comprador del reporte mensual.
--   · Y como la columna quedó en la lista blanca sin que nadie la
--     reescriba, el comprador podía mandarla con el uuid de otra
--     persona: la firma pasó de imposible de falsificar a opcional.
--
-- Se repone con el patrón de conservación que ya usan las demás
-- firmas: se estampa al comprar, se limpia si el ítem vuelve atrás,
-- y en cualquier otro caso se conserva la que había — que es lo que
-- impide reescribirla después.
--
-- 2) EL COMPRADOR NO PODÍA REGISTRAR UNA COMPRA PARCIAL
-- `compra_parcial()` (migración 49) admite al comprador, pero el
-- UPDATE que hace cambia `cant` y `compra_parcial`, que no están en
-- su lista blanca. Ser SECURITY DEFINER no cambia `mi_rol()`, así que
-- el trigger lo rechazaba y la función abortaba. El caso principal
-- —el comprador vuelve del proveedor con 8 de 10 y lo reporta— estaba
-- muerto.
--
-- No se arregla ampliando la lista blanca: eso le abriría cambiar
-- cantidades a mano, que es justo lo que la guarda evita. Se arregla
-- marcando la transacción desde la función, para que el trigger sepa
-- que ese cambio viene de un camino que YA validó lo suyo.
--
-- Se corre en el editor SQL de Supabase. Se puede repetir sin daño.
-- ============================================================

begin;

create or replace function public.trg_comprador_solo_estado()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  campos_comprador text[] := array['estado', 'comprado_por', 'fecha_compra',
                                   'tomado_por', 'tomado_en', 'actualizado_en'];
begin
  -- ---- Quién tomó el ítem: lo pone la base, para cualquier rol ----
  if new.tomado_en is distinct from old.tomado_en then
    if new.tomado_en is null then
      new.tomado_por := null;
    else
      new.tomado_por := auth.uid();
      new.tomado_en  := now();
    end if;
  else
    new.tomado_por := old.tomado_por;
  end if;

  -- ---- Quién compró: repuesto de la migración 16 ----
  -- El `else` es lo que la vuelve infalsificable: fuera del momento
  -- exacto de comprar, la firma es siempre la que ya había.
  if new.estado = 'Comprado' and coalesce(old.estado, '') = '—' then
    new.comprado_por := auth.uid();
  elsif new.estado = '—' then
    new.comprado_por := null;
  else
    new.comprado_por := old.comprado_por;
  end if;

  if coalesce(public.mi_rol(), '') <> 'comprador' then
    return new;
  end if;

  -- El cambio viene de compra_parcial(), que ya comprobó el rol, el
  -- motivo, que el ítem no esté facturado ni recibido y que la
  -- cantidad tenga sentido. No hay que volver a juzgarlo aquí.
  if coalesce(current_setting('rq.compra_parcial', true), '') = '1' then
    return new;
  end if;

  if (to_jsonb(new) - campos_comprador) is distinct from (to_jsonb(old) - campos_comprador) then
    raise exception 'El comprador marca un ítem como comprado, o lo toma para comprarlo. Aprobar, cambiar cantidades o facturar es de Compras.';
  end if;

  if new.estado is distinct from old.estado
     and not (old.estado = '—' and new.estado = 'Comprado') then
    raise exception 'El comprador solo puede marcar "Comprado" un ítem por comprar.';
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- La función marca su propia transacción antes de tocar el ítem.
-- `true` = solo dura esta transacción: no se filtra a nada más.
-- ------------------------------------------------------------
create or replace function public.compra_parcial(
  p_item         uuid,
  p_cant         numeric,
  p_motivo       text,
  p_cerrar_saldo boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  it       record;
  v_rol    text := coalesce(public.mi_rol(), '');
  v_nombre text;
  v_resto  numeric;
begin
  if v_rol not in ('compras', 'comprador') then
    raise exception 'Una compra parcial la registra Compras o el comprador.';
  end if;
  if coalesce(p_cerrar_saldo, false) and v_rol <> 'compras' then
    raise exception 'Dar por cerrado lo que falta es decisión de Compras. Registra la compra parcial y deja el saldo pendiente; Lucía decide si se sigue buscando.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Una compra parcial exige explicar por qué no se consiguió todo.';
  end if;

  select * into it from public.rq_items where id = p_item;
  if not found then raise exception 'Ítem no encontrado.'; end if;
  if it.decision <> 'Aprobado' then
    raise exception 'Solo se parte un ítem aprobado (este está %).', it.decision;
  end if;
  if coalesce(it.cant_recibida, 0) > 0 then
    raise exception 'Ese ítem ya tiene material recibido en almacén: la cantidad no se puede partir. Corrige primero la recepción.';
  end if;
  if exists (select 1 from public.factura_items where rq_item_id = p_item) then
    raise exception 'Ese ítem ya está facturado: no se puede partir. Si la factura está mal, gerencia la anula y se registra de nuevo.';
  end if;
  if it.compra_parcial is not null then
    raise exception 'Ese ítem ya se partió una vez. El saldo quedó como un ítem aparte: trabaja sobre ese.';
  end if;
  if not (p_cant > 0 and p_cant < it.cant) then
    raise exception 'Lo conseguido tiene que estar entre 1 y % (que es lo pedido). Si conseguiste todo, marca el ítem como comprado normalmente.', it.cant;
  end if;

  v_resto := it.cant - p_cant;
  select nombre into v_nombre from public.usuarios where id = auth.uid();

  -- Aviso a la guarda del comprador: este cambio viene de aquí.
  perform set_config('rq.compra_parcial', '1', true);

  update public.rq_items
     set cant = p_cant,
         compra_parcial = jsonb_build_object(
           'pedido',        it.cant,
           'conseguido',    p_cant,
           'saldo',         v_resto,
           'motivo',        trim(p_motivo),
           'por',           coalesce(v_nombre, 'desconocido'),
           'fecha',         current_date::text,
           'saldo_cerrado', coalesce(p_cerrar_saldo, false))
   where id = p_item;

  insert into public.rq_items (
    rq_id, codigo, cant, fecha_necesitada, destino, color, obs,
    decision, motivo_rechazo, fecha_caducidad, decidido_en, decidido_por)
  values (
    it.rq_id, it.codigo, v_resto, it.fecha_necesitada, it.destino, it.color,
    trim(coalesce(it.obs || ' · ', '') || 'Saldo de compra parcial: ' || trim(p_motivo)),
    case when coalesce(p_cerrar_saldo, false) then 'Rechazado' else 'Aprobado' end,
    case when coalesce(p_cerrar_saldo, false) then trim(p_motivo) else null end,
    it.fecha_caducidad, it.decidido_en, it.decidido_por);

  perform set_config('rq.compra_parcial', '', true);
end;
$$;

revoke execute on function public.compra_parcial(uuid, numeric, text, boolean) from anon, public;
grant  execute on function public.compra_parcial(uuid, numeric, text, boolean) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- LOS ÍTEMS QUE QUEDARON SIN FIRMA
-- Los marcados como Comprado entre la migración 50 y esta quedaron
-- con `comprado_por` en nulo y NO se puede saber quién fue. Para
-- verlos:
--   select id, codigo, fecha_compra from public.rq_items
--    where estado in ('Comprado','Entregado','Incompleto')
--      and comprado_por is null and fecha_compra is not null;
-- Son datos de prueba; con datos reales habría que reconstruirlo a
-- mano y dejarlo anotado.
--
-- CÓMO COMPROBAR
--  1. Con la cuenta del comprador, marcar un ítem como Comprado.
--     select comprado_por from rq_items where id='<uuid>'; -> su uuid.
--  2. Que su pestaña Facturar vuelva a mostrarle lo que compró.
--  3. Con la cuenta del comprador, registrar una compra parcial:
--     debe funcionar, y el saldo aparecer como ítem nuevo.
--  4. Que siga sin poder cambiar una cantidad a mano.
-- ============================================================
