-- ============================================================
-- Migración 8: la solicitud de material nuevo pregunta si es
-- perecedero. El residente lo propone, Compras lo puede corregir
-- antes de aprobar, y el material se crea con ese valor.
-- ============================================================
alter table public.solicitudes_material
  add column perecedero boolean not null default false;
