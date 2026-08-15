-- ============================================================
-- MIGRACIÓN 49 · COMPRA PARCIAL
--
-- EL CASO, planteado por el dueño: el RQ pide 10 y el proveedor solo
-- tiene 8. Pasa todos los días en obra.
--
-- LO QUE PASABA HASTA HOY, y las dos salidas eran malas:
--
--  · El desglose de la factura se calcula como precio × cantidad
--    PEDIDA. Comprando 8 por S/ 400, para que cuadre había que poner
--    S/ 40 de precio unitario en vez de los S/ 50 reales. Cuadra
--    mintiendo — y ese precio falso entra al historial con el que el
--    comprador negocia la próxima vez. El sistema se envenena solo.
--
--  · O se recibían 8 de 10 y el ítem quedaba "Incompleto" esperando
--    un saldo que nunca iba a llegar: para siempre en el consolidado
--    como pendiente de comprar, e inflando el indicador de
--    incompletos.
--
-- LA SOLUCIÓN: partir el ítem. Los 8 quedan en su ítem —que la
-- factura cubre entero, con el precio REAL— y los 2 que faltan vuelven
-- a la cola de compras como un ítem propio. Nadie tiene que acordarse
-- del saldo: aparece solo donde se mira todos los días.
--
-- Y si Compras decide que esos 2 ya no se van a comprar, se cierran
-- ahí mismo con su motivo. Esa decisión es de Compras, no del
-- comprador: uno reporta lo que encontró, la otra decide si se sigue
-- buscando.
--
-- Se corre en el editor SQL de Supabase. Se puede repetir sin daño.
-- ============================================================

begin;

alter table public.rq_items
  add column if not exists compra_parcial jsonb;

comment on column public.rq_items.compra_parcial is
  'Rastro de una compra parcial: {pedido, conseguido, saldo, motivo, por, fecha, saldo_cerrado}. Lo estampa la función compra_parcial(), nunca el cliente.';

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

  -- Dar por cerrado lo que falta es una decisión de compra, no del que
  -- fue a buscar el material.
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

  -- El ítem original se queda con lo que sí se consiguió.
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

  -- Y el saldo nace como un ítem propio: aprobado si se sigue buscando,
  -- cerrado con su motivo si Compras decidió que ya no se compra.
  insert into public.rq_items (
    rq_id, codigo, cant, fecha_necesitada, destino, color, obs,
    decision, motivo_rechazo, fecha_caducidad, decidido_en, decidido_por)
  values (
    it.rq_id, it.codigo, v_resto, it.fecha_necesitada, it.destino, it.color,
    trim(coalesce(it.obs || ' · ', '') || 'Saldo de compra parcial: ' || trim(p_motivo)),
    case when coalesce(p_cerrar_saldo, false) then 'Rechazado' else 'Aprobado' end,
    case when coalesce(p_cerrar_saldo, false) then trim(p_motivo) else null end,
    it.fecha_caducidad, it.decidido_en, it.decidido_por);
end;
$$;

revoke execute on function public.compra_parcial(uuid, numeric, text, boolean) from anon, public;
grant  execute on function public.compra_parcial(uuid, numeric, text, boolean) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- CÓMO COMPROBAR
--
-- 1. Sobre un ítem aprobado de 10 unidades, registrar una compra
--    parcial de 8 con motivo.
--    ESPERADO: el ítem queda en 8 y aparece uno nuevo de 2 en el
--    mismo RQ, aprobado y en la cola de compras.
--
-- 2. Facturar el de 8 con su precio real: el desglose debe cuadrar
--    sin tener que inventar el precio unitario.
--
-- 3. Con la cuenta del comprador, intentar cerrar el saldo:
--    ESPERADO: lo rechaza — esa decisión es de Compras.
--
-- 4. Intentar partir un ítem ya facturado o con material recibido:
--    ESPERADO: lo rechaza explicando qué hacer en su lugar.
-- ============================================================
