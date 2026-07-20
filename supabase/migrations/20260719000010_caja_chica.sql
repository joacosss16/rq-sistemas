-- ============================================================
-- Migración 10: caja chica (habilitos diarios) + medio de pago
-- + banco fijo por obra + rol administracion (Mónica)
-- Modelo de fondo fijo: cada obra tiene un fondo diario; las
-- facturas pagadas en efectivo nacen Pagadas contra la rendición
-- del día; administración la aprueba; Pagos ejecuta la reposición.
-- ============================================================

-- Rol administracion (aprueba rendiciones)
alter table public.usuarios drop constraint usuarios_rol_check;
alter table public.usuarios add constraint usuarios_rol_check
  check (rol in ('gerente','compras','residente','almacen','pagos','administracion'));

alter table public.usuarios drop constraint chk_rol_proyecto;
alter table public.usuarios add constraint chk_rol_proyecto
  check (rol in ('gerente','compras','pagos','administracion') or proyecto_asignado is not null);

-- Banco y cuenta por obra (datos de PRUEBA; reemplazar con los reales)
alter table public.proyectos add column banco text;
alter table public.proyectos add column nro_cuenta text;

update public.proyectos set banco = 'BCP',        nro_cuenta = '191-1111111-0-11' where codigo = '2501';
update public.proyectos set banco = 'BBVA',       nro_cuenta = '0011-0222-0200333' where codigo = '2502';
update public.proyectos set banco = 'Interbank',  nro_cuenta = '200-3000444555'    where codigo = '2503';
update public.proyectos set banco = 'Scotiabank', nro_cuenta = '000-5566777'       where codigo = '2504';
update public.proyectos set banco = 'BCP',        nro_cuenta = '191-8888888-0-88'  where codigo = '2601';

-- Medio de pago en la factura (N° de operación / cheque / voucher
-- comparten el campo numero_operacion)
alter table public.facturas add column medio_pago text
  check (medio_pago in ('Transferencia','Cheque','Tarjeta','Efectivo'));
alter table public.facturas add column rendicion_id uuid;

-- Las facturas pagadas ANTES de esta migración quedan como Transferencia
update public.facturas set medio_pago = 'Transferencia'
 where estado_pago = 'Pagada' and medio_pago is null;

-- Pagada exige: siempre medio + fecha + quién; banco y N° solo si NO es efectivo
alter table public.facturas drop constraint chk_pago_completo;
alter table public.facturas add constraint chk_pago_completo
  check (
    estado_pago <> 'Pagada'
    or (
      medio_pago is not null and fecha_pago is not null and pagado_por is not null
      and (medio_pago = 'Efectivo' or (banco is not null and numero_operacion is not null))
    )
  );

-- Fondo fijo de caja chica por obra (monto de arranque de PRUEBA: S/ 2,000)
create table public.cajas_chicas (
  proyecto       text primary key references public.proyectos (codigo),
  monto_fondo    numeric(12,2) not null check (monto_fondo > 0),
  responsable_id uuid references public.usuarios (id)
);

insert into public.cajas_chicas (proyecto, monto_fondo)
select codigo, 2000 from public.proyectos
on conflict (proyecto) do nothing;

-- Rendición diaria: una por obra y día
create table public.rendiciones (
  id                   uuid primary key default gen_random_uuid(),
  numero               bigint generated always as identity unique,
  proyecto             text not null references public.proyectos (codigo),
  fecha                date not null default current_date,
  responsable_id       uuid not null references public.usuarios (id),
  monto_fondo          numeric(12,2) not null,
  estado               text not null default 'Abierta'
                         check (estado in ('Abierta','Aprobada','Observada')),
  observacion          text,
  aprobado_por         uuid references public.usuarios (id),
  fecha_aprobacion     date,
  reposicion_operacion text,
  reposicion_fecha     date,
  repuesto_por         uuid references public.usuarios (id),
  creado_en            timestamptz not null default now(),
  constraint uq_rendicion unique (proyecto, fecha),
  constraint chk_observada check (estado <> 'Observada' or observacion is not null)
);

alter table public.facturas
  add constraint facturas_rendicion_fkey
  foreign key (rendicion_id) references public.rendiciones (id);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.cajas_chicas enable row level security;
alter table public.rendiciones  enable row level security;

create policy cajas_select on public.cajas_chicas
  for select to authenticated
  using (public.mi_rol() in ('gerente','compras','pagos','administracion'));

create policy cajas_write on public.cajas_chicas
  for all to authenticated
  using (public.mi_rol() = 'gerente')
  with check (public.mi_rol() = 'gerente');

create policy rendiciones_select on public.rendiciones
  for select to authenticated
  using (public.mi_rol() in ('gerente','compras','pagos','administracion'));

create policy rendiciones_insert on public.rendiciones
  for insert to authenticated
  with check (public.mi_rol() = 'compras' and responsable_id = auth.uid());

-- administración aprueba/observa; pagos registra la reposición
create policy rendiciones_update on public.rendiciones
  for update to authenticated
  using (public.mi_rol() in ('administracion','pagos'))
  with check (public.mi_rol() in ('administracion','pagos'));

-- administración ve las facturas (para revisar la rendición)
drop policy facturas_select on public.facturas;
create policy facturas_select on public.facturas
  for select to authenticated
  using (public.mi_rol() in ('gerente','compras','pagos','administracion'));

drop policy factura_items_select on public.factura_items;
create policy factura_items_select on public.factura_items
  for select to authenticated
  using (public.mi_rol() in ('gerente','compras','pagos','administracion'));

notify pgrst, 'reload schema';
