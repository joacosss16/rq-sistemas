-- ============================================================
-- Migración 3: tabla FAMILIAS + familia estructural
-- La familia de un material se deriva de los 2 primeros dígitos
-- de su código (IU) — una sola fuente de verdad.
-- Ejecutar ANTES de seed_catalogo.sql.
-- ============================================================

create table public.familias (
  iu        text primary key check (iu ~ '^\d{2}$'),
  nombre    text not null,
  creado_en timestamptz not null default now()
);

-- MATERIALES: fuera la familia como texto libre; entra columna
-- generada desde el código, con FK a familias (no se puede crear
-- un material cuya familia no exista).
alter table public.materiales drop column familia;
alter table public.materiales
  add column iu text generated always as (left(codigo, 2)) stored
  references public.familias (iu);

-- SOLICITUDES: el residente elige la familia de la lista y
-- Compras puede reasignarla antes de aprobar.
alter table public.solicitudes_material drop column familia;
alter table public.solicitudes_material
  add column familia_iu text references public.familias (iu);

-- RLS: todos leen; solo Compras (dueña del catálogo) administra
alter table public.familias enable row level security;

create policy familias_select on public.familias
  for select to authenticated using (true);

create policy familias_write on public.familias
  for all to authenticated
  using (public.mi_rol() = 'compras')
  with check (public.mi_rol() = 'compras');
