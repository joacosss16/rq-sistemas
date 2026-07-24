-- ============================================================
-- Migración 17: reingreso a stock desde una salida de "uso incorrecto"
-- Cuando el material salió pero se usó mal (se encontró botado, no se
-- completó el trabajo…), el almacenero devuelve a stock lo recuperable
-- sin borrar el registro del mal uso. El stock resta (cant − reingresada).
-- ============================================================

alter table public.salidas
  add column cant_reingresada numeric(12,2) not null default 0,
  add column reingreso jsonb,
  add constraint chk_reingreso_rango
    check (cant_reingresada >= 0 and cant_reingresada <= cant);

-- Solo se reingresa desde una salida verificada como "Incorrecto"
create or replace function public.trg_reingreso_solo_incorrecto()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.cant_reingresada, 0) > coalesce(old.cant_reingresada, 0)
     and new.uso <> 'Incorrecto' then
    raise exception 'Solo se reingresa a stock lo de una salida marcada como uso incorrecto';
  end if;
  return new;
end;
$$;

create trigger salidas_reingreso_guard
  before update on public.salidas
  for each row execute function public.trg_reingreso_solo_incorrecto();

notify pgrst, 'reload schema';
