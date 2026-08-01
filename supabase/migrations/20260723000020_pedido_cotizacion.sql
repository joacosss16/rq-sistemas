-- ============================================================
-- Migración 20: Pedido por cotización (enchapes y similares)
-- Materiales personalizados que NO nacen de un RQ del residente sino
-- de una cotización que el arquitecto de diseño alcanza a Compras.
-- - Familia propia ENCHAPES (IU 97): cada modelo es un material 97xxxx.
-- - Lucía registra el "Pedido por cotización" (ella lo gestiona): nace
--   aprobado, con referencia de cotización y el arquitecto solicitante.
-- - Aguas abajo reúsa TODO: recepción, stock, salidas, factura, cierre.
-- ============================================================

-- Familia de enchapes (si no existe)
insert into public.familias (iu, nombre)
values ('97', 'ENCHAPES Y ACABADOS PERSONALIZADOS')
on conflict (iu) do nothing;

-- Marca de origen en el RQ
alter table public.rqs
  add column tipo text not null default 'RQ' check (tipo in ('RQ','Cotizacion')),
  add column cotizacion_ref text,
  add column solicitante_diseno text;

-- Cotización exige referencia; RQ normal no la lleva
alter table public.rqs add constraint chk_cotizacion
  check (tipo <> 'Cotizacion' or (cotizacion_ref is not null and length(trim(cotizacion_ref)) > 0));

-- INSERT de RQs: además del residente, Compras puede crear una Cotización
drop policy rqs_insert on public.rqs;
create policy rqs_insert on public.rqs
  for insert to authenticated
  with check (
    (public.mi_rol() = 'residente' and tipo = 'RQ'
     and proyecto = public.mi_proyecto()
     and residente_id = auth.uid() and creado_por = auth.uid())
    or (public.mi_rol() = 'compras' and tipo = 'Cotizacion' and creado_por = auth.uid())
  );

-- INSERT de ítems: el residente en su RQ; Compras en su Cotización
drop policy rq_items_insert on public.rq_items;
create policy rq_items_insert on public.rq_items
  for insert to authenticated
  with check (
    exists (select 1 from public.rqs r
      where r.id = rq_id and r.creado_por = auth.uid()
        and ((public.mi_rol() = 'residente' and r.tipo = 'RQ' and r.proyecto = public.mi_proyecto())
             or (public.mi_rol() = 'compras' and r.tipo = 'Cotizacion')))
  );

notify pgrst, 'reload schema';
