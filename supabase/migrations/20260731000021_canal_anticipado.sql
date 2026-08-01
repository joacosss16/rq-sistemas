-- ============================================================
-- Migración 21: renombrar el canal "ESPECIAL LIMA" → "ANTICIPADO"
-- (mismo criterio: > 7 días de anticipación). Suena mejor y no ata
-- el canal a una ciudad.
-- ============================================================

-- 1) La función de canal ahora devuelve ANTICIPADO
create or replace function public.calcular_canal(p_fecha_rq date, p_fecha_necesitada date)
returns text
language sql immutable
as $$
  select case
    when p_fecha_necesitada - p_fecha_rq < 2 then 'URGENTE'
    when p_fecha_necesitada - p_fecha_rq <= 7 then 'GENERAL'
    else 'ANTICIPADO'
  end
$$;

-- 2) Soltar las restricciones para poder renombrar los datos existentes
alter table public.rqs      drop constraint rqs_canal_check;
alter table public.rq_items drop constraint rq_items_canal_check;

-- 3) Renombrar los datos existentes
update public.rqs      set canal = 'ANTICIPADO' where canal = 'ESPECIAL LIMA';
update public.rq_items set canal = 'ANTICIPADO' where canal = 'ESPECIAL LIMA';

-- 4) Volver a poner las restricciones con el nuevo valor
alter table public.rqs      add constraint rqs_canal_check      check (canal in ('URGENTE','GENERAL','ANTICIPADO'));
alter table public.rq_items add constraint rq_items_canal_check check (canal in ('URGENTE','GENERAL','ANTICIPADO'));

notify pgrst, 'reload schema';
