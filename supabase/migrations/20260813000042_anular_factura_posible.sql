-- ============================================================
-- MIGRACIÓN 42 · ANULAR UNA FACTURA ERA IMPOSIBLE
--
-- EL FALLO: `anular_factura` borra las líneas del desglose y deja la
-- factura viva con su monto. Pero el control que valida que el
-- desglose cuadre con el total es un trigger DIFERIDO: corre al
-- cerrar la transacción, cuando las líneas ya no están. Suma cero,
-- lo compara contra el monto de la factura, y lanza la excepción.
-- La transacción entera se revierte.
--
-- Resultado: NINGUNA factura se puede anular. Y gerencia solo ve un
-- mensaje que no explica nada: "El desglose por ítem (S/ 0) no cuadra
-- con el total de la factura (S/ 850.00)".
--
-- POR QUÉ IMPORTA: una factura mal registrada —RUC equivocado, monto
-- equivocado, ítem equivocado— no tiene HOY ningún camino de
-- corrección. Los datos comerciales están congelados a propósito
-- ("si está mal, gerencia la anula y se registra de nuevo"), el ítem
-- no se puede anular porque está facturado, y la anulación revienta.
-- Queda deuda falsa en Pagos para siempre, un precio falso en el
-- historial con el que Frank negocia, y un ítem congelado.
--
-- Nadie lo había notado porque anular una factura estaba anotado
-- como "pendiente de probar en vivo" desde que se construyó.
--
-- SEGUNDO FALLO, del mismo trigger: usa `new.factura_id` y también
-- dispara en DELETE, donde NEW no existe en PL/pgSQL.
--
-- Se corre en el editor SQL de Supabase. Se puede repetir sin daño.
-- ============================================================

begin;

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
  -- En un DELETE, NEW no está asignado: hay que mirar OLD.
  v_factura := case when tg_op = 'DELETE' then old.factura_id else new.factura_id end;

  select monto into v_monto from facturas where id = v_factura;
  if v_monto is null then return null; end if;  -- factura borrada en cascada

  -- Una factura ANULADA no se valida: se anula justamente borrando su
  -- desglose, así que exigirle que cuadre es pedirle que siga viva.
  if exists (select 1 from facturas where id = v_factura and anulacion is not null) then
    return null;
  end if;

  -- Sin líneas no hay nada que cuadrar (y el camino normal siempre
  -- las crea dentro de la misma transacción que la factura).
  if not exists (select 1 from factura_items where factura_id = v_factura) then
    return null;
  end if;

  select count(*) filter (where fi.precio_unitario is null),
         coalesce(sum(fi.precio_unitario * ri.cant), 0)
    into v_sin_precio, v_suma
  from factura_items fi
  join rq_items ri on ri.id = fi.rq_item_id
  where fi.factura_id = v_factura;

  -- facturas anteriores a la migración 5 (sin desglose) no se validan
  if v_sin_precio > 0 then return null; end if;

  if abs(v_suma - v_monto) > 0.5 then
    raise exception 'El desglose por ítem (S/ %) no cuadra con el total de la factura (S/ %)', v_suma, v_monto;
  end if;
  return null;
end;
$$;

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- CÓMO COMPROBAR
--
-- 1. Con la sesión de GERENCIA, anular una factura de contado desde
--    Compras, con motivo.
--    ESPERADO: se anula, aparece tachada con su motivo, y sus ítems
--    quedan LIBRES para volver a facturarse.
--    (Antes: error de "el desglose no cuadra" y no pasaba nada.)
--
-- 2. Anular una factura en efectivo cuya rendición siga ABIERTA:
--    debe funcionar igual, y el monto debe desaparecer del gasto del
--    día en el arqueo de administración.
--
-- 3. Que la validación siga viva donde importa: registrar una factura
--    cuyo desglose NO sume el total debe seguir siendo rechazado con
--    el mensaje de siempre.
-- ============================================================
