-- ============================================================
-- Sistema RQ — Grupo Copacabana
-- Migración 2: Row Level Security
-- residente: solo su obra · almacenero: solo su almacén ·
-- compras: global · gerente: todo (facturas solo lectura)
-- Sin política = denegado. anon no tiene ninguna política.
-- ============================================================

-- Helpers (SECURITY DEFINER para leer usuarios sin recursión de RLS)
create or replace function public.mi_rol()
returns text
language sql stable
security definer set search_path = public
as $$
  select rol from usuarios where id = auth.uid() and activo
$$;

create or replace function public.mi_proyecto()
returns text
language sql stable
security definer set search_path = public
as $$
  select proyecto_asignado from usuarios where id = auth.uid() and activo
$$;

-- Activar RLS en todo
alter table public.proyectos            enable row level security;
alter table public.usuarios             enable row level security;
alter table public.materiales           enable row level security;
alter table public.proveedores          enable row level security;
alter table public.rqs                  enable row level security;
alter table public.rq_items             enable row level security;
alter table public.facturas             enable row level security;
alter table public.factura_items        enable row level security;
alter table public.salidas              enable row level security;
alter table public.prestamos            enable row level security;
alter table public.stock_inicial        enable row level security;
alter table public.solicitudes_material enable row level security;

-- ------------------------------------------------------------
-- PROYECTOS: todos leen; solo gerente administra
-- ------------------------------------------------------------
create policy proyectos_select on public.proyectos
  for select to authenticated using (true);

create policy proyectos_write on public.proyectos
  for all to authenticated
  using (public.mi_rol() = 'gerente')
  with check (public.mi_rol() = 'gerente');

-- ------------------------------------------------------------
-- USUARIOS: todos leen (nombres en pantallas). Altas/bajas solo
-- con service role (dashboard/admin), no desde la app.
-- ------------------------------------------------------------
create policy usuarios_select on public.usuarios
  for select to authenticated using (true);

-- ------------------------------------------------------------
-- MATERIALES: todos leen; solo Compras (dueña del catálogo) escribe
-- ------------------------------------------------------------
create policy materiales_select on public.materiales
  for select to authenticated using (true);

create policy materiales_write on public.materiales
  for all to authenticated
  using (public.mi_rol() = 'compras')
  with check (public.mi_rol() = 'compras');

-- ------------------------------------------------------------
-- PROVEEDORES: todos leen; Compras escribe (alta automática al facturar)
-- ------------------------------------------------------------
create policy proveedores_select on public.proveedores
  for select to authenticated using (true);

create policy proveedores_write on public.proveedores
  for all to authenticated
  using (public.mi_rol() = 'compras')
  with check (public.mi_rol() = 'compras');

-- ------------------------------------------------------------
-- RQS: gerente/compras ven todo; residente y almacenero solo su obra.
-- Solo el residente crea, para su obra y a su nombre.
-- ------------------------------------------------------------
create policy rqs_select on public.rqs
  for select to authenticated
  using (
    public.mi_rol() in ('gerente','compras')
    or proyecto = public.mi_proyecto()
  );

create policy rqs_insert on public.rqs
  for insert to authenticated
  with check (
    public.mi_rol() = 'residente'
    and proyecto = public.mi_proyecto()
    and residente_id = auth.uid()
    and creado_por = auth.uid()
  );

create policy rqs_update on public.rqs
  for update to authenticated
  using (public.mi_rol() in ('gerente','compras'))
  with check (public.mi_rol() in ('gerente','compras'));

-- ------------------------------------------------------------
-- RQ_ITEMS: visibilidad hereda del RQ. Residente inserta en sus RQs;
-- Compras/gerente deciden y anulan; almacenero registra recepciones
-- de su obra (qué columnas toca cada rol lo controla la app).
-- ------------------------------------------------------------
create policy rq_items_select on public.rq_items
  for select to authenticated
  using (
    public.mi_rol() in ('gerente','compras')
    or exists (select 1 from public.rqs r
               where r.id = rq_id and r.proyecto = public.mi_proyecto())
  );

create policy rq_items_insert on public.rq_items
  for insert to authenticated
  with check (
    public.mi_rol() = 'residente'
    and exists (select 1 from public.rqs r
                where r.id = rq_id
                  and r.creado_por = auth.uid()
                  and r.proyecto = public.mi_proyecto())
  );

create policy rq_items_update_compras on public.rq_items
  for update to authenticated
  using (public.mi_rol() in ('gerente','compras'))
  with check (public.mi_rol() in ('gerente','compras'));

create policy rq_items_update_almacen on public.rq_items
  for update to authenticated
  using (
    public.mi_rol() = 'almacen'
    and exists (select 1 from public.rqs r
                where r.id = rq_id and r.proyecto = public.mi_proyecto())
  )
  with check (
    public.mi_rol() = 'almacen'
    and exists (select 1 from public.rqs r
                where r.id = rq_id and r.proyecto = public.mi_proyecto())
  );

-- ------------------------------------------------------------
-- FACTURAS: Compras registra; gerente solo lectura financiera
-- ------------------------------------------------------------
create policy facturas_select on public.facturas
  for select to authenticated
  using (public.mi_rol() in ('gerente','compras'));

create policy facturas_write on public.facturas
  for insert to authenticated
  with check (public.mi_rol() = 'compras' and registrado_por = auth.uid());

create policy factura_items_select on public.factura_items
  for select to authenticated
  using (public.mi_rol() in ('gerente','compras'));

create policy factura_items_write on public.factura_items
  for insert to authenticated
  with check (public.mi_rol() = 'compras');

-- ------------------------------------------------------------
-- SALIDAS: almacenero registra y gestiona en su obra;
-- gerente/compras ven todo; residente ve su obra
-- ------------------------------------------------------------
create policy salidas_select on public.salidas
  for select to authenticated
  using (
    public.mi_rol() in ('gerente','compras')
    or proyecto = public.mi_proyecto()
  );

create policy salidas_insert on public.salidas
  for insert to authenticated
  with check (
    public.mi_rol() = 'almacen'
    and proyecto = public.mi_proyecto()
    and registrado_por = auth.uid()
  );

create policy salidas_update on public.salidas
  for update to authenticated
  using (
    (public.mi_rol() = 'almacen' and proyecto = public.mi_proyecto())
    or public.mi_rol() in ('gerente','compras')
  )
  with check (
    (public.mi_rol() = 'almacen' and proyecto = public.mi_proyecto())
    or public.mi_rol() in ('gerente','compras')
  );

-- ------------------------------------------------------------
-- PRÉSTAMOS: el almacén de origen presta; origen o destino gestionan
-- el cierre; gerente/compras ven todo
-- ------------------------------------------------------------
create policy prestamos_select on public.prestamos
  for select to authenticated
  using (
    public.mi_rol() in ('gerente','compras')
    or origen  = public.mi_proyecto()
    or destino = public.mi_proyecto()
  );

create policy prestamos_insert on public.prestamos
  for insert to authenticated
  with check (
    public.mi_rol() = 'almacen'
    and origen = public.mi_proyecto()
    and registrado_por = auth.uid()
  );

create policy prestamos_update on public.prestamos
  for update to authenticated
  using (
    (public.mi_rol() = 'almacen'
     and (origen = public.mi_proyecto() or destino = public.mi_proyecto()))
    or public.mi_rol() in ('gerente','compras')
  )
  with check (
    (public.mi_rol() = 'almacen'
     and (origen = public.mi_proyecto() or destino = public.mi_proyecto()))
    or public.mi_rol() in ('gerente','compras')
  );

-- ------------------------------------------------------------
-- STOCK INICIAL: almacenero carga su inventario; Compras también puede
-- ------------------------------------------------------------
create policy stock_inicial_select on public.stock_inicial
  for select to authenticated
  using (
    public.mi_rol() in ('gerente','compras')
    or proyecto = public.mi_proyecto()
  );

create policy stock_inicial_write on public.stock_inicial
  for all to authenticated
  using (
    public.mi_rol() = 'compras'
    or (public.mi_rol() = 'almacen' and proyecto = public.mi_proyecto())
  )
  with check (
    public.mi_rol() = 'compras'
    or (public.mi_rol() = 'almacen' and proyecto = public.mi_proyecto())
  );

-- ------------------------------------------------------------
-- SOLICITUDES DE MATERIAL: residente crea y ve las suyas;
-- Compras resuelve; gerente ve todo
-- ------------------------------------------------------------
create policy solicitudes_select on public.solicitudes_material
  for select to authenticated
  using (
    public.mi_rol() in ('gerente','compras')
    or solicitante_id = auth.uid()
  );

create policy solicitudes_insert on public.solicitudes_material
  for insert to authenticated
  with check (
    public.mi_rol() = 'residente'
    and solicitante_id = auth.uid()
    and proyecto = public.mi_proyecto()
  );

create policy solicitudes_update on public.solicitudes_material
  for update to authenticated
  using (public.mi_rol() = 'compras')
  with check (public.mi_rol() = 'compras');

-- ------------------------------------------------------------
-- Permisos de funciones: solo usuarios autenticados
-- ------------------------------------------------------------
revoke execute on function public.stock(text, text)         from anon;
revoke execute on function public.mi_rol()                  from anon;
revoke execute on function public.mi_proyecto()             from anon;
revoke execute on function public.calcular_canal(date,date) from anon;

grant execute on function public.stock(text, text)          to authenticated;
grant execute on function public.mi_rol()                   to authenticated;
grant execute on function public.mi_proyecto()              to authenticated;
grant execute on function public.calcular_canal(date,date)  to authenticated;
