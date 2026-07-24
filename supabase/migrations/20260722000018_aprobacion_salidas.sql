-- ============================================================
-- Migración 18: aprobación del residente para salidas y préstamos
-- - Salida: nace "Pendiente", NO toca stock; el residente de la obra
--   aprueba o rechaza (con motivo). Solo la aprobada descuenta stock.
-- - Préstamo: nace "Solicitado"; aprueban AMBOS residentes (origen y
--   destino). Recién con los dos OK pasa a "Prestado" y mueve stock.
-- ============================================================

-- ---------- SALIDAS ----------
alter table public.salidas
  add column aprobacion text not null default 'Pendiente'
    check (aprobacion in ('Pendiente','Aprobada','Rechazada')),
  add column aprobado_por uuid references public.usuarios (id),
  add column fecha_aprobacion date,
  add column motivo_rechazo text;

-- Las salidas ya existentes ocurrieron: se dan por aprobadas
update public.salidas set aprobacion = 'Aprobada' where aprobacion = 'Pendiente';

-- El residente de la obra puede actualizar salidas (solo para aprobar)
drop policy salidas_update on public.salidas;
create policy salidas_update on public.salidas
  for update to authenticated
  using (
    (public.mi_rol() in ('almacen','residente') and proyecto = public.mi_proyecto())
    or public.mi_rol() in ('gerente','compras')
  )
  with check (
    (public.mi_rol() in ('almacen','residente') and proyecto = public.mi_proyecto())
    or public.mi_rol() in ('gerente','compras')
  );

-- Guard: el residente solo aprueba/rechaza (no toca cantidades ni datos);
-- estampa quién y cuándo aprobó.
create or replace function public.trg_salida_aprobacion()
returns trigger
language plpgsql
as $$
begin
  if public.mi_rol() = 'residente' then
    if new.cant         is distinct from old.cant
    or new.codigo       is distinct from old.codigo
    or new.hoja_trabajo is distinct from old.hoja_trabajo
    or new.zona         is distinct from old.zona
    or new.proyecto     is distinct from old.proyecto
    or new.uso          is distinct from old.uso
    or coalesce(new.cant_reingresada,0) is distinct from coalesce(old.cant_reingresada,0) then
      raise exception 'El residente solo aprueba o rechaza la salida';
    end if;
    if old.aprobacion <> 'Pendiente' then
      raise exception 'Esta salida ya fue resuelta';
    end if;
  end if;
  if new.aprobacion is distinct from old.aprobacion and new.aprobacion in ('Aprobada','Rechazada') then
    new.aprobado_por := auth.uid();
    new.fecha_aprobacion := current_date;
  end if;
  return new;
end;
$$;

create trigger salidas_aprobacion_guard
  before update on public.salidas
  for each row execute function public.trg_salida_aprobacion();

-- ---------- PRÉSTAMOS ----------
alter table public.prestamos drop constraint prestamos_estado_check;
alter table public.prestamos add constraint prestamos_estado_check
  check (estado in ('Solicitado','Prestado','Devuelto','Transferido','Anulado','Rechazado'));
alter table public.prestamos alter column estado set default 'Solicitado';
alter table public.prestamos alter column autoriza drop not null;

alter table public.prestamos
  add column aprob_origen  jsonb,
  add column aprob_destino jsonb,
  add column rechazo       jsonb;

-- Préstamos ya existentes activos: se dan por aprobados por ambos lados
update public.prestamos
  set aprob_origen  = jsonb_build_object('por','(histórico)','fecha',fecha),
      aprob_destino = jsonb_build_object('por','(histórico)','fecha',fecha)
  where estado in ('Prestado','Devuelto','Transferido');

-- El residente de origen o destino puede actualizar (solo su aprobación)
drop policy prestamos_update on public.prestamos;
create policy prestamos_update on public.prestamos
  for update to authenticated
  using (
    (public.mi_rol() in ('almacen','residente')
     and (origen = public.mi_proyecto() or destino = public.mi_proyecto()))
    or public.mi_rol() in ('gerente','compras')
  )
  with check (
    (public.mi_rol() in ('almacen','residente')
     and (origen = public.mi_proyecto() or destino = public.mi_proyecto()))
    or public.mi_rol() in ('gerente','compras')
  );

-- Guard + transición: cada residente aprueba SOLO su lado; con ambos OK
-- pasa a "Prestado"; un rechazo lo deja "Rechazado".
create or replace function public.trg_prestamo_aprobacion()
returns trigger
language plpgsql
as $$
begin
  if public.mi_rol() = 'residente' then
    if new.cant   is distinct from old.cant
    or new.codigo is distinct from old.codigo
    or new.origen is distinct from old.origen
    or new.destino is distinct from old.destino then
      raise exception 'El residente solo aprueba o rechaza el préstamo';
    end if;
    if public.mi_proyecto() = old.origen and new.aprob_destino is distinct from old.aprob_destino then
      raise exception 'El residente de origen solo aprueba su lado';
    end if;
    if public.mi_proyecto() = old.destino and new.aprob_origen is distinct from old.aprob_origen then
      raise exception 'El residente de destino solo aprueba su lado';
    end if;
    if public.mi_proyecto() not in (old.origen, old.destino) then
      raise exception 'No autorizado para este préstamo';
    end if;
  end if;
  -- rechazo de cualquiera de los dos
  if new.rechazo is not null and old.rechazo is null then
    new.estado := 'Rechazado';
  -- ambos aprobaron → préstamo activo
  elsif old.estado = 'Solicitado' and new.aprob_origen is not null and new.aprob_destino is not null then
    new.estado := 'Prestado';
  end if;
  return new;
end;
$$;

create trigger prestamos_aprobacion_guard
  before update on public.prestamos
  for each row execute function public.trg_prestamo_aprobacion();

notify pgrst, 'reload schema';
