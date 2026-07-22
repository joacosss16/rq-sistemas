-- ============================================================
-- Migración 16: registrar QUIÉN marcó "Comprado" cada ítem
-- (Frank o Lucía). Lo estampa un trigger con auth.uid() en la
-- transición —→Comprado, así el rol comprador no necesita escribir
-- la columna (sigue tocando solo el estado).
-- ============================================================

alter table public.rq_items
  add column comprado_por uuid references public.usuarios (id);

-- Reemplaza el guard de la migración 15: además de restringir al
-- comprador, estampa quién marcó Comprado (para cualquier rol).
create or replace function public.trg_comprador_solo_estado()
returns trigger
language plpgsql
as $$
begin
  -- estampar quién marcó "Comprado" en la transición —→Comprado
  if new.estado = 'Comprado' and old.estado = '—' then
    new.comprado_por := auth.uid();
  end if;

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

notify pgrst, 'reload schema';
