-- ============================================================
-- Migración 25: sellar CUÁNDO se decide cada ítem, para medir el
-- tiempo de respuesta real de Compras en HORAS (no en días).
-- En un RQ urgente que se atiende el mismo día, medir en días
-- da 0 y no dice nada; la hora sí.
--
-- Nota: los ítems ya decididos ANTES de esta migración quedan con
-- decidido_en null (no hay forma de saber cuándo se decidieron).
-- Se excluyen del promedio y se muestran como "—".
-- ============================================================

alter table public.rq_items
  add column if not exists decidido_en timestamptz;

create or replace function public.trg_sella_decision()
returns trigger
language plpgsql
as $$
begin
  -- primera vez que sale de Pendiente: se sella el momento
  if coalesce(old.decision, 'Pendiente') = 'Pendiente'
     and new.decision <> 'Pendiente'
     and new.decidido_en is null then
    new.decidido_en := now();
  end if;
  return new;
end;
$$;

drop trigger if exists sella_decision on public.rq_items;
create trigger sella_decision
  before update on public.rq_items
  for each row execute function public.trg_sella_decision();

notify pgrst, 'reload schema';
