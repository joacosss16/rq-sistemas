-- ============================================================
-- Migración 6: módulo de Pagos (segregación de funciones)
-- Compras registra la factura; el área de Pagos la ejecuta.
-- El estado de pago vive en la FACTURA (no en el ítem): los
-- ítems lo heredan y es imposible que una misma factura tenga
-- ítems pagados y no pagados.
-- ============================================================

-- Nuevo rol 'pagos' (sin obra asignada, como gerente y compras)
alter table public.usuarios drop constraint usuarios_rol_check;
alter table public.usuarios add constraint usuarios_rol_check
  check (rol in ('gerente','compras','residente','almacen','pagos'));

alter table public.usuarios drop constraint chk_rol_proyecto;
alter table public.usuarios add constraint chk_rol_proyecto
  check (rol in ('gerente','compras','pagos') or proyecto_asignado is not null);

-- Estado de pago y datos bancarios en la factura
alter table public.facturas
  add column estado_pago text not null default 'Pendiente'
    check (estado_pago in ('Pendiente','Pagada')),
  add column banco text,
  add column numero_operacion text,
  add column fecha_pago date,
  add column pagado_por uuid references public.usuarios (id);

-- Pagada exige datos bancarios completos
alter table public.facturas add constraint chk_pago_completo
  check (estado_pago <> 'Pagada'
         or (banco is not null and numero_operacion is not null
             and fecha_pago is not null and pagado_por is not null));

-- Pagos solo completa el pago: los datos comerciales no se editan,
-- y una factura pagada queda congelada.
create or replace function public.trg_facturas_bu()
returns trigger
language plpgsql
as $$
begin
  if new.serie          is distinct from old.serie
  or new.proveedor_ruc  is distinct from old.proveedor_ruc
  or new.fecha          is distinct from old.fecha
  or new.monto          is distinct from old.monto
  or new.forma_pago     is distinct from old.forma_pago
  or new.proyecto       is distinct from old.proyecto
  or new.registrado_por is distinct from old.registrado_por then
    raise exception 'Los datos comerciales de la factura no se editan; solo se completa el pago';
  end if;
  if old.estado_pago = 'Pagada' then
    raise exception 'La factura ya está pagada; no se modifica';
  end if;
  return new;
end;
$$;

create trigger facturas_bu
  before update on public.facturas
  for each row execute function public.trg_facturas_bu();

-- ------------------------------------------------------------
-- RLS: el rol pagos ve facturas y su contexto; solo él las paga
-- ------------------------------------------------------------
drop policy facturas_select on public.facturas;
create policy facturas_select on public.facturas
  for select to authenticated
  using (public.mi_rol() in ('gerente','compras','pagos'));

create policy facturas_update_pagos on public.facturas
  for update to authenticated
  using (public.mi_rol() = 'pagos')
  with check (public.mi_rol() = 'pagos');

drop policy factura_items_select on public.factura_items;
create policy factura_items_select on public.factura_items
  for select to authenticated
  using (public.mi_rol() in ('gerente','compras','pagos'));

drop policy rqs_select on public.rqs;
create policy rqs_select on public.rqs
  for select to authenticated
  using (public.mi_rol() in ('gerente','compras','pagos') or proyecto = public.mi_proyecto());

drop policy rq_items_select on public.rq_items;
create policy rq_items_select on public.rq_items
  for select to authenticated
  using (
    public.mi_rol() in ('gerente','compras','pagos')
    or exists (select 1 from public.rqs r
               where r.id = rq_id and r.proyecto = public.mi_proyecto())
  );
