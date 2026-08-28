-- ============================================================
-- MIGRACIÓN 64 · Una factura anulada no ocupa su número
-- ============================================================
--
-- EL CALLEJÓN SIN SALIDA. Lucía teclea S/ 1,690 donde el papel dice S/ 169.
-- Los datos comerciales de una factura están congelados a propósito, así que
-- el único camino es el que documentan las migraciones 29, 42 y 53: gerencia
-- la anula con motivo, y se registra de nuevo bien.
--
-- Gerencia la anula. Lucía abre el formulario, teclea el mismo número real —el
-- ÚNICO que existe, el impreso en el papel del proveedor— y el sistema
-- responde que esa factura ya está registrada. Y ahí se acaba: la anulada no
-- se edita, el número no se puede reusar, y el proveedor no va a emitir otro
-- documento porque nosotros nos equivocamos al digitar.
--
-- La salida natural bajo presión es inventar una variante —'F001-000123-B'—,
-- que es exactamente lo que el sistema le prohíbe por escrito a Pagos; o dejar
-- la compra fuera del sistema, rompiendo la regla de adopción: "RQ que no entra
-- por el sistema, no se compra".
--
-- LA CORRECCIÓN. La restricción pasa de "este número con este RUC no se repite
-- NUNCA" a "no se repite entre las VIVAS". Una factura anulada está muerta:
-- su rastro se conserva entero y visible tachado, pero deja de reservar el
-- número que en realidad pertenece al documento del proveedor, no a nosotros.
--
-- Lo que NO cambia: dos facturas vivas con el mismo número y RUC siguen siendo
-- imposibles, que es lo que la restricción vino a impedir.

begin;

-- Antes de tocar nada: si ya hubiera duplicados vivos, esto falla y no se
-- aplica. No debería haberlos —la restricción actual los impide—, pero si el
-- índice no se puede crear es señal de que algo más pasó y hay que mirarlo.
alter table public.facturas drop constraint if exists uq_factura;

create unique index if not exists uq_factura_viva
  on public.facturas (serie, proveedor_ruc)
  where anulacion is null;

comment on index public.uq_factura_viva is
  'Serie + RUC únicos entre las facturas VIGENTES. Una anulada libera su número: es el del documento del proveedor, y la corrección oficial (anular y volver a registrar) necesita poder reusarlo.';

commit;

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) No quedaron duplicados vivos (debe dar 0 filas):
--
--   select serie, proveedor_ruc, count(*)
--     from public.facturas where anulacion is null
--    group by 1, 2 having count(*) > 1;
--
-- 2) El índice existe y la restricción vieja ya no:
--
--   select indexname from pg_indexes
--    where tablename = 'facturas' and indexname like 'uq_factura%';
--
--   Debe aparecer `uq_factura_viva` y NO `uq_factura`.
--
-- 3) La prueba de verdad, en la aplicación: registrar una factura, que
--    gerencia la anule, y volver a registrarla con el MISMO número. Antes de
--    esta migración era imposible; ahora tiene que entrar.
