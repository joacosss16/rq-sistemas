-- ============================================================
-- Migración 5: valorización + unidades base
-- a) factura_items.precio_unitario: cada línea de factura lleva
--    su precio (S/ por unidad de consumo). La suma de líneas debe
--    cuadrar con el monto total de la factura (tolerancia S/ 0.50
--    por redondeos de IGV).
-- b) materiales.factor_caja + und_base: materiales que se compran
--    en caja/paquete pero se consumen en unidades. El factor lo
--    define Compras en el catálogo; la recepción lo precarga.
-- ============================================================

alter table public.factura_items
  add column precio_unitario numeric(12,4) check (precio_unitario > 0);

alter table public.materiales
  add column factor_caja numeric(10,2) check (factor_caja > 0);
alter table public.materiales
  add column und_base text;

-- Cuadre del desglose: suma(precio × cantidad) = monto de la factura.
-- Diferido: la app inserta la factura y todas sus líneas en la misma
-- transacción y el cuadre se verifica al final.
create or replace function public.trg_factura_cuadre()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_factura uuid;
  v_monto   numeric;
  v_suma    numeric;
  v_sin_precio int;
begin
  v_factura := coalesce(new.factura_id, old.factura_id);
  select monto into v_monto from facturas where id = v_factura;
  if v_monto is null then return null; end if;  -- factura borrada en cascada

  select count(*) filter (where fi.precio_unitario is null),
         coalesce(sum(fi.precio_unitario * ri.cant), 0)
    into v_sin_precio, v_suma
  from factura_items fi
  join rq_items ri on ri.id = fi.rq_item_id
  where fi.factura_id = v_factura;

  -- facturas anteriores a esta migración (sin desglose) no se validan
  if v_sin_precio > 0 then return null; end if;

  if abs(v_suma - v_monto) > 0.5 then
    raise exception 'El desglose por ítem (S/ %) no cuadra con el total de la factura (S/ %)', v_suma, v_monto;
  end if;
  return null;
end;
$$;

create constraint trigger factura_items_cuadre
  after insert or update or delete on public.factura_items
  deferrable initially deferred
  for each row execute function public.trg_factura_cuadre();
