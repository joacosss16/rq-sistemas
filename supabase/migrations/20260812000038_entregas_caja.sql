-- ============================================================
-- MIGRACIÓN 38 · LA CAJA CHICA NO ES UN FONDO FIJO
--
-- CORRECCIÓN DE MODELO (dicha por el dueño el 12 ago 2026).
-- El sistema se construyó asumiendo que cada obra tiene un fondo fijo
-- de caja chica (hoy S/ 2.000 de prueba): Frank arranca el día con
-- ese monto, gasta, rinde, y Pagos le REPONE lo gastado para dejar el
-- fondo otra vez en su nivel.
--
-- En la obra no funciona así. El efectivo que necesita depende del
-- día —hay días mínimos y días fuertes—, y le entregan dinero UNA O
-- VARIAS VECES el mismo día, por transferencia o en efectivo. Al
-- cerrar el día devuelve el vuelto y al día siguiente empieza en cero.
--
-- POR QUÉ IMPORTA: el arqueo compara el efectivo contado contra
-- "fondo − gastado". Con el modelo viejo, ese número está mal TODOS
-- LOS DÍAS por la diferencia entre los S/ 2.000 supuestos y lo que de
-- verdad recibió. Un arqueo que siempre da diferencia es un arqueo
-- que nadie mira, y entonces no sirve para nada.
--
-- CÓMO QUEDA:
--     debe quedar = Σ entregas del día − Σ gastado del día
--     diferencia  = efectivo contado − debe quedar
-- (el gasto ya excluye las facturas anuladas)
--
-- Se corre en el editor SQL de Supabase. Se puede repetir sin daño.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) Las entregas de efectivo del día
--
-- Una fila por cada vez que le entregan dinero: 8:00 una
-- transferencia de 600, 11:20 efectivo de 250, 15:00 otra
-- transferencia de 900. La rendición del día suma las suyas.
-- ------------------------------------------------------------
create table if not exists public.entregas_caja (
  id             uuid primary key default gen_random_uuid(),
  numero         bigint generated always as identity unique,
  proyecto       text not null references public.proyectos (codigo),
  fecha          date not null default current_date,
  monto          numeric(12,2) not null check (monto > 0),
  medio          text not null check (medio in ('Transferencia', 'Efectivo', 'Cheque')),
  num_operacion  text,
  entregado_por  uuid not null references public.usuarios (id),
  recibido_por   uuid references public.usuarios (id),
  anulacion      jsonb,
  creado_en      timestamptz not null default now(),
  -- Una transferencia sin número de operación no se puede cuadrar con
  -- el banco; en efectivo no aplica.
  constraint chk_entrega_operacion check (
    medio = 'Efectivo' or coalesce(trim(num_operacion), '') <> ''
  ),
  -- Anular siempre con rastro completo, como en el resto del sistema
  constraint chk_entrega_anulacion check (
    anulacion is null or anulacion ?& array['motivo', 'por', 'fecha']
  )
);

comment on table public.entregas_caja is
  'Cada entrega de efectivo al comprador, con su medio y su número de operación. La caja chica NO es un fondo fijo: el disponible del día es la suma de estas entregas. Reemplaza el modelo de cajas_chicas.monto_fondo.';

create index if not exists idx_entregas_caja_obra_fecha
  on public.entregas_caja (proyecto, fecha);

-- ------------------------------------------------------------
-- 2) Quién las ve y quién las registra
--   · las registra PAGOS (es quien saca la plata de la cuenta)
--   · las ve además gerencia, administración (que cierra el día) y
--     el comprador (tiene que saber cuánto recibió)
-- ------------------------------------------------------------
alter table public.entregas_caja enable row level security;
revoke all on public.entregas_caja from anon, public;
grant select, insert, update on public.entregas_caja to authenticated;

drop policy if exists entregas_caja_select on public.entregas_caja;
create policy entregas_caja_select on public.entregas_caja
  for select to authenticated
  using (coalesce(public.mi_rol(), '') in
         ('gerente', 'pagos', 'administracion', 'compras', 'comprador'));

drop policy if exists entregas_caja_insert on public.entregas_caja;
create policy entregas_caja_insert on public.entregas_caja
  for insert to authenticated
  with check (coalesce(public.mi_rol(), '') in ('pagos', 'gerente'));

-- Modificar: solo para anularla. El monto, la obra y el día no se
-- editan nunca — eso reescribiría la caja de un día ya cerrado.
drop policy if exists entregas_caja_update on public.entregas_caja;
create policy entregas_caja_update on public.entregas_caja
  for update to authenticated
  using      (coalesce(public.mi_rol(), '') in ('pagos', 'gerente'))
  with check (coalesce(public.mi_rol(), '') in ('pagos', 'gerente'));

-- ------------------------------------------------------------
-- 3) Las guardas, con lo aprendido en las migraciones 34, 36 y 37:
--    la firma la pone la base, el alta también se vigila, y lo que
--    define el dinero no se toca después.
-- ------------------------------------------------------------
create or replace function public.trg_entrega_caja()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_nombre text;
begin
  if tg_op = 'INSERT' then
    -- Quién entregó es quien tiene la sesión, no lo que diga el
    -- navegador. Y nace sin anulación.
    if auth.uid() is not null then
      new.entregado_por := auth.uid();
    end if;
    new.anulacion := null;
    return new;
  end if;

  -- UPDATE: lo único que puede cambiar es la anulación.
  if new.proyecto      is distinct from old.proyecto
  or new.fecha         is distinct from old.fecha
  or new.monto         is distinct from old.monto
  or new.medio         is distinct from old.medio
  or new.num_operacion is distinct from old.num_operacion
  or new.entregado_por is distinct from old.entregado_por then
    raise exception 'Una entrega de efectivo no se edita: el monto, el día, el medio y el número de operación son el rastro que cuadra con el banco. Si está mal, anúlala con motivo y registra la correcta.';
  end if;

  if new.anulacion is distinct from old.anulacion then
    if old.anulacion is not null then
      raise exception 'Esa entrega ya estaba anulada.';
    end if;
    if coalesce(trim(new.anulacion ->> 'motivo'), '') = '' then
      raise exception 'Anular una entrega de efectivo exige explicar por qué.';
    end if;
    -- La firma la pone la base
    select nombre into v_nombre from public.usuarios where id = auth.uid();
    new.anulacion := jsonb_build_object(
      'motivo', trim(new.anulacion ->> 'motivo'),
      'por',    coalesce(v_nombre, 'desconocido'),
      'fecha',  current_date::text);
    -- No se anula la entrega de un día que ya se cerró: eso cambiaría
    -- el arqueo de una rendición aprobada.
    if exists (select 1 from public.rendiciones r
                where r.proyecto = old.proyecto
                  and r.fecha = old.fecha
                  and r.estado <> 'Abierta') then
      raise exception 'La rendición de ese día ya fue cerrada: anular esta entrega cambiaría un arqueo aprobado. Coordina con gerencia.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists entregas_caja_guarda on public.entregas_caja;
create trigger entregas_caja_guarda
  before insert or update on public.entregas_caja
  for each row execute function public.trg_entrega_caja();

-- ------------------------------------------------------------
-- 4) Las columnas del modelo viejo quedan marcadas, no borradas.
--    Se borran cuando la app ya no las lea, para poder volver atrás.
-- ------------------------------------------------------------
comment on column public.cajas_chicas.monto_fondo is
  'OBSOLETA desde la migración 38: la caja chica no es un fondo fijo. El disponible del día es la suma de entregas_caja de esa obra y fecha. La columna `tolerancia` de esta tabla SÍ sigue vigente.';

comment on column public.rendiciones.monto_fondo is
  'OBSOLETA desde la migración 38: el disponible del día se calcula sumando entregas_caja. Esta columna guarda lo que copiaba el modelo de fondo fijo y se conserva solo para las rendiciones antiguas.';

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- LO QUE FALTA DESPUÉS DE ESTA MIGRACIÓN (va en el código)
--   · Pagos: pantalla para registrar cada entrega (obra, monto,
--     medio, N° de operación). Reemplaza a "reponer el fondo".
--   · Frank y administración: ver las entregas del día y el
--     "debe devolver" calculado.
--   · El arqueo pasa a comparar contra (entregas − gastado).
--
-- Mientras el código no cambie, el sistema sigue funcionando con el
-- modelo viejo: esta migración solo agrega, no quita nada.
-- ============================================================
