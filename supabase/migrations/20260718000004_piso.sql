-- ============================================================
-- Migración 4: piso/nivel del RQ (análisis de gasto por piso)
-- Obligatorio en la app para RQs nuevos; los RQs de prueba
-- anteriores quedan con null (se muestran como "—").
-- ============================================================
alter table public.rqs add column piso text;
