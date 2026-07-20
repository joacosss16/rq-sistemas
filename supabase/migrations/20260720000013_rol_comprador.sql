-- ============================================================
-- Migración 13: rol COMPRADOR (Frank)
-- Ve solo lo que hay que comprar y factura (incluye efectivo/caja
-- chica); NO decide (aprobar/rechazar/anular es de Lucía), no ve
-- catálogo ni tablero. Rendiciones en consulta.
-- ============================================================

alter table public.usuarios drop constraint usuarios_rol_check;
alter table public.usuarios add constraint usuarios_rol_check
  check (rol in ('gerente','compras','residente','almacen','pagos','administracion','comprador'));

alter table public.usuarios drop constraint chk_rol_proyecto;
alter table public.usuarios add constraint chk_rol_proyecto
  check (rol in ('gerente','compras','pagos','administracion','comprador') or proyecto_asignado is not null);

-- Lecturas que necesita
drop policy rqs_select on public.rqs;
create policy rqs_select on public.rqs
  for select to authenticated
  using (public.mi_rol() in ('gerente','compras','pagos','comprador') or proyecto = public.mi_proyecto());

drop policy rq_items_select on public.rq_items;
create policy rq_items_select on public.rq_items
  for select to authenticated
  using (
    public.mi_rol() in ('gerente','compras','pagos','comprador')
    or exists (select 1 from public.rqs r
               where r.id = rq_id and r.proyecto = public.mi_proyecto())
  );

drop policy facturas_select on public.facturas;
create policy facturas_select on public.facturas
  for select to authenticated
  using (public.mi_rol() in ('gerente','compras','pagos','administracion','comprador'));

drop policy factura_items_select on public.factura_items;
create policy factura_items_select on public.factura_items
  for select to authenticated
  using (public.mi_rol() in ('gerente','compras','pagos','administracion','comprador'));

drop policy cajas_select on public.cajas_chicas;
create policy cajas_select on public.cajas_chicas
  for select to authenticated
  using (public.mi_rol() in ('gerente','compras','pagos','administracion','comprador'));

drop policy rendiciones_select on public.rendiciones;
create policy rendiciones_select on public.rendiciones
  for select to authenticated
  using (public.mi_rol() in ('gerente','compras','pagos','administracion','comprador'));

-- Escrituras del comprador: facturar (incluye proveedores nuevos y
-- rendiciones de caja chica). NADA sobre rq_items: no decide.
drop policy facturas_write on public.facturas;
create policy facturas_write on public.facturas
  for insert to authenticated
  with check (public.mi_rol() in ('compras','comprador') and registrado_por = auth.uid());

drop policy factura_items_write on public.factura_items;
create policy factura_items_write on public.factura_items
  for insert to authenticated
  with check (public.mi_rol() in ('compras','comprador'));

drop policy proveedores_write on public.proveedores;
create policy proveedores_write on public.proveedores
  for all to authenticated
  using (public.mi_rol() in ('compras','comprador'))
  with check (public.mi_rol() in ('compras','comprador'));

drop policy rendiciones_insert on public.rendiciones;
create policy rendiciones_insert on public.rendiciones
  for insert to authenticated
  with check (public.mi_rol() in ('compras','comprador') and responsable_id = auth.uid());

-- Frank pasa al rol comprador
update public.usuarios set rol = 'comprador'
 where id = '79b117c5-e9bb-4b64-8368-40abfce3a2ad';

notify pgrst, 'reload schema';
