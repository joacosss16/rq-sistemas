-- ============================================================
-- Migración 14: compromiso de crédito
-- Hay proveedores que dan crédito y recién emiten la factura al
-- pagar. La compra se registra desde el día 1 como COMPROMISO
-- (sin serie: el sistema asigna una interna CRED-####). La deuda
-- es visible en Pagos/KPIs/auditoría. Al pagar, Pagos digita la
-- serie real y el compromiso se convierte en factura.
-- ============================================================

alter table public.facturas
  add column tipo_doc text not null default 'Factura'
    check (tipo_doc in ('Factura','Compromiso'));

-- Al insertar un compromiso: solo al crédito, nunca en efectivo,
-- y serie interna correlativa
create or replace function public.trg_compromiso_bi()
returns trigger
language plpgsql
as $$
begin
  if new.tipo_doc = 'Compromiso' then
    if new.forma_pago <> 'Crédito' then
      raise exception 'Un compromiso sin factura solo puede ser al crédito';
    end if;
    if new.medio_pago = 'Efectivo' or new.rendicion_id is not null then
      raise exception 'Una compra en efectivo siempre lleva comprobante: registra la factura';
    end if;
    new.serie := 'CRED-' || lpad(new.numero::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger facturas_compromiso_bi
  before insert on public.facturas
  for each row execute function public.trg_compromiso_bi();

-- Reglas de edición (reemplaza la versión de la migración 12):
-- 1) los datos comerciales nunca cambian, con UNA excepción:
--    convertir un compromiso en factura real (serie y fecha nuevas)
-- 2) un compromiso no se puede marcar Pagada sin la serie real
-- 3) una factura pagada solo admite cambios de conciliación
-- 4) conciliar es exclusivo de gerencia
create or replace function public.trg_facturas_bu()
returns trigger
language plpgsql
as $$
begin
  if old.tipo_doc = 'Compromiso' and new.tipo_doc = 'Factura' then
    -- conversión: la serie real llega con la factura física
    if new.serie like 'CRED-%' then
      raise exception 'Digita la serie real de la factura que entregó el proveedor';
    end if;
  else
    if new.tipo_doc is distinct from old.tipo_doc then
      raise exception 'Una factura no se convierte en compromiso';
    end if;
    if new.serie is distinct from old.serie
    or new.fecha is distinct from old.fecha then
      raise exception 'Los datos comerciales de la factura no se editan; solo se completa el pago';
    end if;
  end if;

  if new.proveedor_ruc  is distinct from old.proveedor_ruc
  or new.monto          is distinct from old.monto
  or new.forma_pago     is distinct from old.forma_pago
  or new.proyecto       is distinct from old.proyecto
  or new.registrado_por is distinct from old.registrado_por then
    raise exception 'Los datos comerciales de la factura no se editan; solo se completa el pago';
  end if;

  if new.estado_pago = 'Pagada' and new.tipo_doc = 'Compromiso' then
    raise exception 'Para pagar, registra primero la serie de la factura real que entrega el proveedor';
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
