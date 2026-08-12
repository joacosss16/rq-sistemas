-- ============================================================
-- MIGRACIÓN 39 · LEVANTAR UNA ALERTA DE AUDITORÍA
--
-- EL PROBLEMA: las alertas de Auditoría se calculan solas y no hay
-- forma de cerrarlas. Una vez que aparece "banco distinto al de la
-- obra", se queda ahí para siempre — aunque gerencia lo haya revisado
-- y esté justificado. El resultado es una lista que solo crece, que
-- nadie termina de leer, y donde la alerta nueva que sí importa queda
-- enterrada entre las viejas ya resueltas.
--
-- LA DIFERENCIA CON "ENTERADO": dar por leído es del navegador y es
-- personal ("ya lo vi"). LEVANTAR es una decisión de gerencia sobre
-- el negocio ("esto está revisado y resuelto"), y como toda decisión
-- en este sistema, lleva motivo, nombre y fecha.
--
-- LO IMPORTANTE, y es lo que evita que esto se convierta en una forma
-- de tapar problemas: la alerta se levanta para UNA SITUACIÓN
-- CONCRETA, no para un tipo de alerta. La clave incluye el contenido
-- —la obra, los bancos, cuántas facturas—, así que si mañana aparece
-- una factura más, la clave cambia y la alerta VUELVE. Levantar no
-- silencia el futuro.
--
-- Se corre en el editor SQL de Supabase. Se puede repetir sin daño.
-- ============================================================

begin;

create table if not exists public.alertas_levantadas (
  clave         text primary key,
  tipo          text not null,
  detalle       text not null,
  nota          text not null check (length(trim(nota)) > 0),
  levantada_por uuid not null references public.usuarios (id),
  fecha         date not null default current_date,
  creado_en     timestamptz not null default now()
);

comment on table public.alertas_levantadas is
  'Alertas de Auditoría que gerencia dio por resueltas, con su motivo. La clave incluye el contenido de la situación: si esta cambia, la alerta reaparece. Levantar no silencia el futuro.';

alter table public.alertas_levantadas enable row level security;
revoke all on public.alertas_levantadas from anon, public;
grant select, insert, delete on public.alertas_levantadas to authenticated;

-- La ven los que ven Auditoría y las finanzas; así nadie descubre que
-- una alerta fue levantada solo porque desapareció de su pantalla.
drop policy if exists alertas_levantadas_select on public.alertas_levantadas;
create policy alertas_levantadas_select on public.alertas_levantadas
  for select to authenticated
  using (coalesce(public.mi_rol(), '') in ('gerente', 'compras', 'pagos', 'administracion'));

-- Solo gerencia levanta.
drop policy if exists alertas_levantadas_insert on public.alertas_levantadas;
create policy alertas_levantadas_insert on public.alertas_levantadas
  for insert to authenticated
  with check (coalesce(public.mi_rol(), '') = 'gerente');

-- Y solo gerencia puede volver a abrirla (borrar el levantamiento).
drop policy if exists alertas_levantadas_delete on public.alertas_levantadas;
create policy alertas_levantadas_delete on public.alertas_levantadas
  for delete to authenticated
  using (coalesce(public.mi_rol(), '') = 'gerente');

-- No hay política de UPDATE a propósito: un levantamiento no se edita.
-- Si la nota estaba mal, se vuelve a abrir y se levanta de nuevo, y
-- las dos cosas quedan.

-- Quién levanta lo pone la base, no el navegador. Misma regla que en
-- las migraciones 36, 37 y 38.
create or replace function public.trg_alerta_levantada()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.levantada_por := auth.uid();
  end if;
  new.fecha := current_date;
  return new;
end;
$$;

drop trigger if exists alertas_levantadas_firma on public.alertas_levantadas;
create trigger alertas_levantadas_firma
  before insert on public.alertas_levantadas
  for each row execute function public.trg_alerta_levantada();

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- CÓMO COMPROBAR
--   · Gerencia levanta una alerta con una nota: desaparece de la
--     lista activa y pasa a "levantadas", con su nombre y la fecha.
--   · Volver a abrirla la devuelve a la lista.
--   · Que otro rol (compras, pagos) NO pueda levantar ninguna.
--   · Que levantar una alerta de "3 facturas" y luego aparecer una
--     cuarta haga VOLVER la alerta: es lo que impide que levantar
--     sirva para tapar lo que venga después.
-- ============================================================
