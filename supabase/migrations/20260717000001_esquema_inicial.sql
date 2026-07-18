-- ============================================================
-- Sistema RQ — Grupo Copacabana
-- Migración 1: esquema (tablas, checks, funciones, triggers)
-- Replica el modelo del prototipo (docs/02_modelo_datos.md)
-- + casos especiales de día 1 (docs/03, docs/04)
-- ============================================================

-- ------------------------------------------------------------
-- PROYECTOS (obras). No estaba en el roadmap pero da integridad
-- referencial a todo lo que hoy es texto libre ("proyecto").
-- ------------------------------------------------------------
create table public.proyectos (
  codigo      text primary key check (codigo ~ '^\d{4}$'),
  nombre      text not null,
  activo      boolean not null default true
);

-- ------------------------------------------------------------
-- USUARIOS (perfil sobre auth.users)
-- ------------------------------------------------------------
create table public.usuarios (
  id                 uuid primary key references auth.users (id) on delete cascade,
  nombre             text not null,
  rol                text not null check (rol in ('gerente','compras','residente','almacen')),
  proyecto_asignado  text references public.proyectos (codigo),
  activo             boolean not null default true,
  creado_en          timestamptz not null default now(),
  -- residente y almacenero siempre tienen obra fija
  constraint chk_rol_proyecto
    check (rol in ('gerente','compras') or proyecto_asignado is not null)
);

-- ------------------------------------------------------------
-- MATERIALES (catálogo: 1,740 desde NUEVO_RQ.xlsx)
-- Código 6 dígitos: IU(2) + GRUPO(2) + correlativo(2)
-- ------------------------------------------------------------
create table public.materiales (
  codigo       text primary key check (codigo ~ '^\d{6}$'),
  descripcion  text not null,
  und          text not null,
  familia      text not null,
  activo       boolean not null default true,
  creado_en    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- PROVEEDORES (maestro: 255 desde CONTROL_RQ_LUZ.xlsx;
-- los nuevos se agregan al registrar factura)
-- ------------------------------------------------------------
create table public.proveedores (
  ruc           text primary key check (ruc ~ '^\d{11}$'),
  razon_social  text not null,
  creado_en     timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Función de canal: automático por fecha necesitada vs fecha RQ
-- < 2 días URGENTE · <= 7 días GENERAL · > 7 días ESPECIAL LIMA
-- ------------------------------------------------------------
create or replace function public.calcular_canal(p_fecha_rq date, p_fecha_necesitada date)
returns text
language sql immutable
as $$
  select case
    when p_fecha_necesitada - p_fecha_rq < 2 then 'URGENTE'
    when p_fecha_necesitada - p_fecha_rq <= 7 then 'GENERAL'
    else 'ESPECIAL LIMA'
  end
$$;

-- ------------------------------------------------------------
-- RQS (cabecera). canal = el más urgente de sus ítems (lo fija la app)
-- ------------------------------------------------------------
create table public.rqs (
  id            uuid primary key default gen_random_uuid(),
  numero        bigint generated always as identity unique,
  proyecto      text not null references public.proyectos (codigo),
  partida       text not null,
  residente_id  uuid not null references public.usuarios (id),
  almacen_resp  text,
  canal         text not null check (canal in ('URGENTE','GENERAL','ESPECIAL LIMA')),
  justificacion text,
  fecha_rq      date not null default current_date,
  creado_por    uuid not null references public.usuarios (id),
  creado_en     timestamptz not null default now(),
  -- URGENTE exige justificación ("¿por qué no se previó?")
  constraint chk_urgente_justifica
    check (canal <> 'URGENTE' or (justificacion is not null and length(trim(justificacion)) > 0))
);

-- ------------------------------------------------------------
-- RQ_ITEMS (flujo por ítem). Estados con el mismo shape del prototipo.
-- canal por ítem: lo fija un trigger (caso especial 1 día-1: RQ mixto)
-- ------------------------------------------------------------
create table public.rq_items (
  id                  uuid primary key default gen_random_uuid(),
  rq_id               uuid not null references public.rqs (id) on delete cascade,
  codigo              text not null references public.materiales (codigo),
  cant                numeric(12,2) not null check (cant > 0),
  fecha_necesitada    date not null,
  destino             text not null check (length(trim(destino)) > 0),
  color               text,
  obs                 text,
  canal               text not null check (canal in ('URGENTE','GENERAL','ESPECIAL LIMA')),
  decision            text not null default 'Pendiente'
                        check (decision in ('Pendiente','Aprobado','Rechazado','Anulado')),
  estado              text not null default '—'
                        check (estado in ('—','En camino','Entregado','Incompleto')),
  motivo_rechazo      text,
  anulacion           jsonb,
  pago                text not null default '—'
                        check (pago in ('—','Pagado','Crédito','Falta')),
  fecha_entrega       date,
  fecha_recojo_saldo  date,
  fecha_entrega_saldo date,
  comunico_residente  boolean,
  destino_saldo       text,
  cant_recibida       numeric(12,2) not null default 0,
  obs_almacen         text,
  creado_en           timestamptz not null default now(),
  -- sobre-recepción bloqueada (invariante 2 del harness)
  constraint chk_recepcion check (cant_recibida >= 0 and cant_recibida <= cant),
  -- rechazo exige motivo (se comunica al residente)
  constraint chk_rechazo check (decision <> 'Rechazado' or motivo_rechazo is not null),
  -- anulación siempre con rastro completo {motivo, por, fecha}
  constraint chk_anulacion check (
    (decision <> 'Anulado' and anulacion is null)
    or (decision = 'Anulado' and anulacion ?& array['motivo','por','fecha'])
  )
);

create index idx_rq_items_rq     on public.rq_items (rq_id);
create index idx_rq_items_codigo on public.rq_items (codigo);

-- ------------------------------------------------------------
-- FACTURAS. Una factura cubre N ítems (mismo proyecto en el piloto;
-- el puente N:M ya soporta compra consolidada multi-proyecto — caso 3)
-- ------------------------------------------------------------
create table public.facturas (
  id             uuid primary key default gen_random_uuid(),
  numero         bigint generated always as identity unique,
  serie          text not null check (length(trim(serie)) > 0),
  proveedor_ruc  text not null references public.proveedores (ruc),
  fecha          date not null,
  monto          numeric(14,2) not null check (monto > 0),
  forma_pago     text not null,
  proyecto       text not null references public.proyectos (codigo),
  registrado_por uuid not null references public.usuarios (id),
  creado_en      timestamptz not null default now(),
  -- duplicado serie+RUC bloqueado (invariante 7)
  constraint uq_factura unique (serie, proveedor_ruc)
);

create table public.factura_items (
  factura_id  uuid not null references public.facturas (id) on delete cascade,
  rq_item_id  uuid not null references public.rq_items (id),
  primary key (factura_id, rq_item_id),
  -- un ítem pertenece a una sola factura
  constraint uq_item_factura unique (rq_item_id)
);

-- ------------------------------------------------------------
-- SALIDAS de almacén (exigen hoja de trabajo + zona; no exceden stock)
-- ------------------------------------------------------------
create table public.salidas (
  id             uuid primary key default gen_random_uuid(),
  numero         bigint generated always as identity unique,
  fecha          date not null default current_date,
  proyecto       text not null references public.proyectos (codigo),
  codigo         text not null references public.materiales (codigo),
  cant           numeric(12,2) not null check (cant > 0),
  hoja_trabajo   text not null check (length(trim(hoja_trabajo)) > 0),
  zona           text not null check (length(trim(zona)) > 0),
  uso            text not null default 'Pendiente'
                   check (uso in ('Pendiente','Correcto','Incorrecto')),
  motivo_uso     text,
  registrado_por uuid not null references public.usuarios (id),
  anulacion      jsonb,
  creado_en      timestamptz not null default now(),
  -- uso incorrecto exige motivo (No se completó / Botado / Uso inadecuado / Otro)
  constraint chk_uso check (uso <> 'Incorrecto' or motivo_uso is not null),
  constraint chk_anulacion_salida check (
    anulacion is null or anulacion ?& array['motivo','por','fecha']
  )
);

create index idx_salidas_stock on public.salidas (proyecto, codigo);

-- ------------------------------------------------------------
-- PRÉSTAMOS entre almacenes
-- Prestado → Devuelto / Transferido al costo / Anulado
-- ------------------------------------------------------------
create table public.prestamos (
  id             uuid primary key default gen_random_uuid(),
  numero         bigint generated always as identity unique,
  fecha          date not null default current_date,
  origen         text not null references public.proyectos (codigo),
  destino        text not null references public.proyectos (codigo),
  codigo         text not null references public.materiales (codigo),
  cant           numeric(12,2) not null check (cant > 0),
  autoriza       text not null check (length(trim(autoriza)) > 0),
  estado         text not null default 'Prestado'
                   check (estado in ('Prestado','Devuelto','Transferido','Anulado')),
  fecha_cierre   date,
  anulacion      jsonb,
  registrado_por uuid not null references public.usuarios (id),
  creado_en      timestamptz not null default now(),
  constraint chk_origen_destino check (origen <> destino),
  constraint chk_anulacion_prestamo check (
    (estado <> 'Anulado' and anulacion is null)
    or (estado = 'Anulado' and anulacion ?& array['motivo','por','fecha'])
  )
);

create index idx_prestamos_origen  on public.prestamos (origen, codigo);
create index idx_prestamos_destino on public.prestamos (destino, codigo);

-- ------------------------------------------------------------
-- STOCK INICIAL (caso especial 1: los almacenes ya tienen material
-- sin RQ de origen; carga por inventario físico)
-- ------------------------------------------------------------
create table public.stock_inicial (
  proyecto         text not null references public.proyectos (codigo),
  codigo           text not null references public.materiales (codigo),
  cant             numeric(12,2) not null check (cant >= 0),
  fecha_inventario date not null,
  registrado_por   uuid not null references public.usuarios (id),
  creado_en        timestamptz not null default now(),
  primary key (proyecto, codigo)
);

-- ------------------------------------------------------------
-- SOLICITUDES DE MATERIAL NUEVO (solo Compras/Arana aprueba)
-- ------------------------------------------------------------
create table public.solicitudes_material (
  id              uuid primary key default gen_random_uuid(),
  numero          bigint generated always as identity unique,
  fecha           date not null default current_date,
  descripcion     text not null,
  und             text not null,
  familia         text not null,
  solicitante_id  uuid not null references public.usuarios (id),
  proyecto        text not null references public.proyectos (codigo),
  estado          text not null default 'Pendiente'
                    check (estado in ('Pendiente','Aprobado','Rechazado')),
  motivo          text,
  codigo_asignado text references public.materiales (codigo),
  creado_en       timestamptz not null default now()
);

-- ============================================================
-- FUNCIÓN DE STOCK
-- stock = inicial + recibido − salidas (no anuladas) ± préstamos
-- (Prestado y Transferido restan al origen y suman al destino;
--  Devuelto y Anulado no afectan)
-- SECURITY DEFINER: los triggers la llaman con usuarios cuya RLS
-- no ve todas las filas; el cálculo debe ser global.
-- ============================================================
create or replace function public.stock(p_proyecto text, p_codigo text)
returns numeric
language sql stable
security definer set search_path = public
as $$
  select
    coalesce((select sum(cant) from stock_inicial
              where proyecto = p_proyecto and codigo = p_codigo), 0)
  + coalesce((select sum(i.cant_recibida)
              from rq_items i join rqs r on r.id = i.rq_id
              where r.proyecto = p_proyecto and i.codigo = p_codigo
                and i.decision = 'Aprobado'), 0)
  - coalesce((select sum(cant) from salidas
              where proyecto = p_proyecto and codigo = p_codigo
                and anulacion is null), 0)
  + coalesce((select sum(cant) from prestamos
              where destino = p_proyecto and codigo = p_codigo
                and estado in ('Prestado','Transferido')), 0)
  - coalesce((select sum(cant) from prestamos
              where origen = p_proyecto and codigo = p_codigo
                and estado in ('Prestado','Transferido')), 0)
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- RQ_ITEMS: fecha necesitada >= fecha RQ (invariante 1) y canal
-- automático por ítem. Recepción parcial → Incompleto; total → Entregado.
create or replace function public.trg_rq_items_biu()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_fecha_rq date;
begin
  select fecha_rq into v_fecha_rq from rqs where id = new.rq_id;

  if new.fecha_necesitada < v_fecha_rq then
    raise exception 'La fecha necesitada (%) no puede ser anterior a la fecha del RQ (%)',
      new.fecha_necesitada, v_fecha_rq;
  end if;

  new.canal := calcular_canal(v_fecha_rq, new.fecha_necesitada);

  if tg_op = 'UPDATE' and new.cant_recibida is distinct from old.cant_recibida then
    if new.cant_recibida >= new.cant then
      new.estado := 'Entregado';
    elsif new.cant_recibida > 0 then
      new.estado := 'Incompleto';
    end if;
  end if;

  return new;
end;
$$;

create trigger rq_items_biu
  before insert or update on public.rq_items
  for each row execute function public.trg_rq_items_biu();

-- RQ_ITEMS: "Pagado exige factura completa". Constraint trigger
-- diferido: la app puede marcar Pagado e insertar la factura en la
-- misma transacción, en cualquier orden.
create or replace function public.trg_pago_exige_factura()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.pago = 'Pagado'
     and not exists (select 1 from factura_items where rq_item_id = new.id) then
    raise exception 'Ítem % marcado Pagado sin factura asociada', new.id;
  end if;
  return null;
end;
$$;

create constraint trigger rq_items_pagado
  after insert or update of pago on public.rq_items
  deferrable initially deferred
  for each row execute function public.trg_pago_exige_factura();

-- FACTURA_ITEMS: no se puede quitar la factura a un ítem ya Pagado
create or replace function public.trg_factura_items_del()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (select 1 from rq_items where id = old.rq_item_id and pago = 'Pagado') then
    raise exception 'No se puede desvincular la factura de un ítem Pagado';
  end if;
  return old;
end;
$$;

create trigger factura_items_bd
  before delete on public.factura_items
  for each row execute function public.trg_factura_items_del();

-- SALIDAS: no exceder stock (invariante 3). Advisory lock para que
-- dos salidas simultáneas del mismo material no pasen ambas.
create or replace function public.trg_salidas_bi()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.proyecto || '/' || new.codigo));
  if new.cant > stock(new.proyecto, new.codigo) then
    raise exception 'Stock insuficiente de % en %: disponible %, solicitado %',
      new.codigo, new.proyecto, stock(new.proyecto, new.codigo), new.cant;
  end if;
  return new;
end;
$$;

create trigger salidas_bi
  before insert on public.salidas
  for each row execute function public.trg_salidas_bi();

-- SALIDAS: nunca edición silenciosa — solo se actualiza uso o anulación
create or replace function public.trg_salidas_bu()
returns trigger
language plpgsql
as $$
begin
  if new.cant     is distinct from old.cant
  or new.codigo   is distinct from old.codigo
  or new.proyecto is distinct from old.proyecto
  or new.fecha    is distinct from old.fecha then
    raise exception 'Las salidas no se editan: anular con motivo y registrar de nuevo';
  end if;
  return new;
end;
$$;

create trigger salidas_bu
  before update on public.salidas
  for each row execute function public.trg_salidas_bu();

-- PRÉSTAMOS: al crear, el origen debe tener stock. Al devolver o anular,
-- el destino debe conservar el material (invariante 4); si ya lo consumió,
-- el sistema obliga "Transferir al costo". Un préstamo cerrado no se reabre.
create or replace function public.trg_prestamos_biu()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext(new.origen || '/' || new.codigo));
    if new.cant > stock(new.origen, new.codigo) then
      raise exception 'Stock insuficiente en % para prestar % de %',
        new.origen, new.cant, new.codigo;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.cant     is distinct from old.cant
  or new.codigo   is distinct from old.codigo
  or new.origen   is distinct from old.origen
  or new.destino  is distinct from old.destino then
    raise exception 'Los préstamos no se editan: anular y registrar de nuevo';
  end if;

  if old.estado <> 'Prestado' and new.estado is distinct from old.estado then
    raise exception 'El préstamo ya está cerrado (%)', old.estado;
  end if;

  if new.estado in ('Devuelto','Anulado') and old.estado = 'Prestado' then
    perform pg_advisory_xact_lock(hashtext(new.destino || '/' || new.codigo));
    if stock(new.destino, new.codigo) < new.cant then
      raise exception 'El destino % ya consumió el material: corresponde Transferir al costo',
        new.destino;
    end if;
  end if;

  if new.estado in ('Devuelto','Transferido') and new.fecha_cierre is null then
    new.fecha_cierre := current_date;
  end if;

  return new;
end;
$$;

create trigger prestamos_biu
  before insert or update on public.prestamos
  for each row execute function public.trg_prestamos_biu();
