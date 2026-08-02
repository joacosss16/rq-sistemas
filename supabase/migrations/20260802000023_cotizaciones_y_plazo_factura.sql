-- ============================================================
-- Migración 23:
-- A) Etapa COTIZADO: Lucía registra las cotizaciones que pidió por
--    ítem (proveedor, precio, plazo) y marca cuál ganó. Queda la
--    evidencia de que comparó y cuánto ahorró.
-- B) Plazo de 48 h: se guarda la fecha en que el ítem se marcó
--    Comprado, para alertar lo comprado que sigue sin factura
--    (y por lo tanto no entra a Pagos).
-- ============================================================

-- ── B) fecha en que se marcó Comprado
alter table public.rq_items
  add column if not exists fecha_compra date;

create or replace function public.trg_sella_fecha_compra()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'Comprado' and coalesce(old.estado, '') <> 'Comprado' then
    new.fecha_compra := current_date;
  end if;
  -- si el ítem retrocede de estado, se limpia el sello
  if new.estado <> 'Comprado' and new.estado = '—' then
    new.fecha_compra := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sella_fecha_compra on public.rq_items;
create trigger sella_fecha_compra
  before update on public.rq_items
  for each row execute function public.trg_sella_fecha_compra();

-- los ítems ya comprados antes de esta migración: se sella con su fecha de RQ
update public.rq_items i
   set fecha_compra = r.fecha_rq
  from public.rqs r
 where r.id = i.rq_id and i.estado = 'Comprado' and i.fecha_compra is null;

-- ── A) Cotizaciones por ítem
create table if not exists public.cotizaciones (
  id              uuid primary key default gen_random_uuid(),
  rq_item_id      uuid not null references public.rq_items (id) on delete cascade,
  proveedor       text not null,
  ruc             text,
  precio_unitario numeric(12,2) not null check (precio_unitario > 0),
  plazo_dias      int check (plazo_dias >= 0),
  observacion     text,
  ganadora        boolean not null default false,
  registrado_por  uuid references public.usuarios (id),
  creado_en       timestamptz not null default now(),
  constraint chk_ruc_cotiz check (ruc is null or ruc ~ '^[0-9]{11}$')
);

create index if not exists idx_cotizaciones_item on public.cotizaciones (rq_item_id);

-- Una sola ganadora por ítem
create unique index if not exists idx_cotiz_una_ganadora
  on public.cotizaciones (rq_item_id) where ganadora;

alter table public.cotizaciones enable row level security;

create policy cotizaciones_select on public.cotizaciones
  for select to authenticated using (true);

create policy cotizaciones_write on public.cotizaciones
  for all to authenticated
  using (public.mi_rol() in ('gerente','compras'))
  with check (public.mi_rol() in ('gerente','compras'));

notify pgrst, 'reload schema';
