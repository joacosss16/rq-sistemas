-- ============================================================
-- Migración 26: administración puede CORREGIR una rendición observada.
-- Antes, "Observada" era un callejón sin salida: cerraba la rendición
-- y nadie podía arreglarla. Ahora Mónica anota qué corrigió y la
-- rendición vuelve a Aprobada; Pagos ve que fue corregida y cuándo,
-- para saber que el monto que repone salió de una corrección.
-- ============================================================

alter table public.rendiciones
  add column if not exists correccion jsonb;   -- {detalle, por, fecha}

alter table public.rendiciones
  drop constraint if exists chk_correccion_rendicion;
alter table public.rendiciones
  add constraint chk_correccion_rendicion check (
    correccion is null
    or correccion ?& array['detalle','por','fecha']
  );

notify pgrst, 'reload schema';
