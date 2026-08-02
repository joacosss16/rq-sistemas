-- ============================================================
-- Migración 22: la ANULACIÓN de un ítem la confirma GERENCIA.
-- Compras deja de anular directo: registra una SOLICITUD con motivo
-- y gerencia la aprueba o la rechaza. El ítem sigue vivo mientras
-- se decide (no se pierde nada si gerencia dice que no).
-- ============================================================

alter table public.rq_items
  add column if not exists anulacion_solicitud jsonb,  -- {motivo, por, fecha}
  add column if not exists anulacion_rechazo   jsonb;  -- {motivo, por, fecha}

-- Rastro completo en ambos casos
alter table public.rq_items
  drop constraint if exists chk_anulacion_solicitud;
alter table public.rq_items
  add constraint chk_anulacion_solicitud check (
    anulacion_solicitud is null
    or anulacion_solicitud ?& array['motivo','por','fecha']
  );

alter table public.rq_items
  drop constraint if exists chk_anulacion_rechazo;
alter table public.rq_items
  add constraint chk_anulacion_rechazo check (
    anulacion_rechazo is null
    or anulacion_rechazo ?& array['motivo','por','fecha']
  );

-- Compras NO puede anular por su cuenta: solo gerencia confirma.
create or replace function public.trg_anulacion_solo_gerencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.decision = 'Anulado' and coalesce(old.decision, '') <> 'Anulado'
     and public.mi_rol() <> 'gerente' then
    raise exception 'La anulación la confirma gerencia: registra la solicitud con motivo y espera el visto bueno.';
  end if;
  return new;
end;
$$;

drop trigger if exists anulacion_solo_gerencia on public.rq_items;
create trigger anulacion_solo_gerencia
  before update on public.rq_items
  for each row execute function public.trg_anulacion_solo_gerencia();

notify pgrst, 'reload schema';
