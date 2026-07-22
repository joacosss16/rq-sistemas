-- ============================================================
-- Migración 15: estado "En camino" → "Comprado"
-- El comprador (Frank) marca "Comprado" al comprar o recoger un
-- ítem; el estado se ve para todo el equipo. Entregado/Incompleto
-- los sigue fijando el almacén al recibir.
-- ============================================================

-- 1) Renombrar el estado (primero los datos, luego la restricción)
alter table public.rq_items drop constraint rq_items_estado_check;
update public.rq_items set estado = 'Comprado' where estado = 'En camino';
alter table public.rq_items add constraint rq_items_estado_check
  check (estado in ('—','Comprado','Entregado','Incompleto'));

-- 2) El comprador puede marcar "Comprado" un ítem aprobado por comprar
create policy rq_items_update_comprador on public.rq_items
  for update to authenticated
  using (public.mi_rol() = 'comprador' and decision = 'Aprobado' and estado = '—')
  with check (public.mi_rol() = 'comprador' and estado = 'Comprado');

-- 3) Defensa: el comprador SOLO cambia el estado (—→Comprado), nada más
create or replace function public.trg_comprador_solo_estado()
returns trigger
language plpgsql
as $$
begin
  if public.mi_rol() = 'comprador' then
    if old.estado <> '—' or new.estado <> 'Comprado' then
      raise exception 'El comprador solo puede marcar "Comprado" un ítem por comprar';
    end if;
    if new.codigo   is distinct from old.codigo
    or new.cant     is distinct from old.cant
    or new.decision is distinct from old.decision
    or new.destino  is distinct from old.destino
    or coalesce(new.cant_recibida, 0) is distinct from coalesce(old.cant_recibida, 0) then
      raise exception 'El comprador solo cambia el estado del ítem, nada más';
    end if;
  end if;
  return new;
end;
$$;

create trigger rq_items_comprador_guard
  before update on public.rq_items
  for each row execute function public.trg_comprador_solo_estado();

notify pgrst, 'reload schema';
