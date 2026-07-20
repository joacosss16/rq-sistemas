-- ============================================================
-- Migración 12: auditoría semanal de pagos (gerencia)
-- Nivel 1: alertas automáticas (solo app, sin cambios de esquema)
-- Nivel 2: conciliación bancaria — cada pago se marca "conciliado"
-- contra el estado de cuenta; exclusivo de gerencia.
-- ============================================================

alter table public.facturas
  add column conciliada boolean not null default false,
  add column conciliada_por uuid references public.usuarios (id),
  add column fecha_conciliacion date;

-- Gerencia puede actualizar facturas (el trigger limita a conciliación)
create policy facturas_update_gerente on public.facturas
  for update to authenticated
  using (public.mi_rol() = 'gerente')
  with check (public.mi_rol() = 'gerente');

-- Reglas endurecidas:
-- 1) los datos comerciales nunca cambian
-- 2) una factura pagada solo admite cambios de conciliación
-- 3) conciliar es exclusivo de gerencia
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
    if new.estado_pago <> 'Pagada'
    or new.medio_pago       is distinct from old.medio_pago
    or new.banco            is distinct from old.banco
    or new.numero_operacion is distinct from old.numero_operacion
    or new.fecha_pago       is distinct from old.fecha_pago
    or new.pagado_por       is distinct from old.pagado_por
    or new.rendicion_id     is distinct from old.rendicion_id then
      raise exception 'La factura ya está pagada; solo se puede conciliar';
    end if;
  end if;

  if new.conciliada is distinct from old.conciliada
     and public.mi_rol() <> 'gerente' then
    raise exception 'La conciliación bancaria es exclusiva de gerencia';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
