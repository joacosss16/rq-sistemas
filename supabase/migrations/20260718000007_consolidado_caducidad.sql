-- ============================================================
-- Migración 7: caducidad de materiales perecederos
-- - materiales.perecedero: lo marca Compras en el catálogo; solo
--   para esos materiales la recepción exige fecha de caducidad.
-- - rq_items.fecha_caducidad: se registra al recibir (si hay
--   varias recepciones se conserva la fecha más próxima).
-- Semáforo en la app: ≤30 días amarillo, ≤7 rojo, vencido bloquea
-- la salida. (El consolidado por comprar no requiere cambios de
-- esquema: es una vista de gestión sobre datos existentes.)
-- ============================================================

alter table public.materiales
  add column perecedero boolean not null default false;

alter table public.rq_items
  add column fecha_caducidad date;
