-- ============================================================
-- Migración 11: 3 triggers de defensa (huecos detectados en la
-- ronda de pruebas: la app los validaba, la base no)
-- 1) recepción de perecedero exige fecha de caducidad
-- 2) solo se facturan ítems aprobados
-- 3) factura en efectivo coherente con su rendición (misma obra,
--    rendición existente y Abierta)
-- ============================================================

create or replace function public.trg_caducidad_perecedero()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.cant_recibida > coalesce(old.cant_recibida, 0)
     and new.fecha_caducidad is null
     and exists (select 1 from materiales m where m.codigo = new.codigo and m.perecedero) then
    raise exception 'Material perecedero: la recepción exige registrar la fecha de caducidad de la etiqueta';
  end if;
  return new;
end;
$$;

create trigger rq_items_caducidad
  before update on public.rq_items
  for each row execute function public.trg_caducidad_perecedero();

create or replace function public.trg_factura_item_aprobado()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (select 1 from rq_items i where i.id = new.rq_item_id and i.decision = 'Aprobado') then
    raise exception 'Solo se pueden facturar ítems aprobados por Compras';
  end if;
  return new;
end;
$$;

create trigger factura_items_aprobado
  before insert on public.factura_items
  for each row execute function public.trg_factura_item_aprobado();

create or replace function public.trg_factura_rendicion()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_ren rendiciones%rowtype;
begin
  if new.medio_pago = 'Efectivo' then
    if new.rendicion_id is null then
      raise exception 'Una factura pagada en efectivo debe vincularse a la rendición del día';
    end if;
    select * into v_ren from rendiciones where id = new.rendicion_id;
    if v_ren.id is null or v_ren.proyecto <> new.proyecto then
      raise exception 'La rendición vinculada no corresponde a la obra de la factura';
    end if;
    if v_ren.estado <> 'Abierta' then
      raise exception 'La rendición del día ya fue %; coordina con administración', lower(v_ren.estado);
    end if;
  elsif new.rendicion_id is not null then
    raise exception 'Solo las facturas pagadas en efectivo se vinculan a una rendición';
  end if;
  return new;
end;
$$;

create trigger facturas_rendicion
  before insert or update on public.facturas
  for each row execute function public.trg_factura_rendicion();

notify pgrst, 'reload schema';
