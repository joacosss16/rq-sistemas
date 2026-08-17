-- ============================================================
-- Migración 56 · Un ítem solo se cuelga a una factura de SU obra y viva
--
-- EL PROBLEMA
-- El permiso para agregar líneas a una factura solo comprobaba el rol
-- de quien lo pedía. No miraba que la factura estuviera viva, ni que el
-- ítem fuera de la misma obra.
--
-- Con un mensaje directo a la base (no desde la pantalla: hay que
-- armarlo a propósito) se podía colgar un ítem de acero de S/ 3,000 de
-- MAIA a una factura de S/ 120 ya cerrada. Ese ítem pasaba a figurar
-- como facturado y pagado sin que hubiera salido un sol, desaparecía de
-- la lista de "por comprar" de Lucía y quedaba muerto: como la factura
-- está pagada no se puede anular, y como el ítem tiene factura tampoco.
-- El mismo hueco permitía que una factura de MAIA cubriera ítems de LUZ,
-- con el costo cayendo en la obra equivocada y pagándolo la cuenta
-- bancaria equivocada.
--
-- EL ARREGLO
-- El permiso ahora exige dos cosas: que la factura NO esté anulada, y
-- que el ítem pertenezca a la misma obra que la factura.
--
-- LO QUE **NO** SE PUEDE EXIGIR, y por qué: que la factura esté sin
-- pagar. Las compras en efectivo de Frank y las de "ya pagué, el papel
-- llega después" NACEN pagadas por diseño; exigirlo rompería su trabajo
-- por completo.
--
-- TODO EN UNA TRANSACCIÓN: reemplazar un permiso es quitarlo y volver a
-- ponerlo. Si el script se cortara en medio, la facturación quedaría
-- CAÍDA para todos — registrar_factura corre con los permisos de quien
-- llama y depende de esta política para insertar sus líneas. Con begin
-- y commit, o entran los dos pasos o no entra ninguno.
--
-- CONSECUENCIA FUTURA, dicha en voz alta: esto cierra la puerta a una
-- factura que cubra ítems de DOS obras. Hoy no existe (la pantalla ya lo
-- impide), pero está en la lista de casos pendientes como "compra
-- consolidada multi-proyecto". Cuando llegue, habrá que reabrir esta
-- política a propósito, no por sorpresa.
-- ============================================================

begin;

drop policy if exists factura_items_write on public.factura_items;

create policy factura_items_write on public.factura_items
  for insert to authenticated
  with check (
    public.mi_rol() in ('compras', 'comprador')
    and exists (
      select 1
        from public.facturas f
        join public.rq_items i on i.id = factura_items.rq_item_id
        join public.rqs r      on r.id = i.rq_id
       where f.id = factura_items.factura_id
         and f.anulacion is null
         and r.proyecto = f.proyecto
    )
  );

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- CÓMO COMPROBAR
--
-- 1. Lucía registra una factura normal con varios ítems de la misma
--    obra: entra igual que siempre.
-- 2. Frank registra una compra en efectivo: entra igual (nace pagada,
--    y eso ya no se comprueba).
-- 3. Lucía registra un compromiso de crédito (CRED-) y una factura por
--    llegar (PEND-): las dos entran.
-- 4. Un ítem partido por compra parcial se factura normal.
--
-- ANTES DE CORRER, revisar si ya existe alguna factura con ítems de
-- otra obra (no rompe las que ya están, pero conviene saberlo):
--
--   select f.serie, f.proyecto as obra_factura, r.proyecto as obra_item
--     from public.factura_items fi
--     join public.facturas f on f.id = fi.factura_id
--     join public.rq_items i on i.id = fi.rq_item_id
--     join public.rqs r      on r.id = i.rq_id
--    where r.proyecto <> f.proyecto;
--
-- Si devuelve filas, avisar antes de seguir.
-- ============================================================
