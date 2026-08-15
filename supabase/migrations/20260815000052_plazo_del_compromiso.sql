-- ============================================================
-- Migración 52 · El compromiso de crédito conserva su PLAZO
--
-- Problema: un compromiso se guardaba con forma_pago = 'Crédito' pelado.
-- El vencimiento se calcula como fecha + días de crédito, y 'Crédito' sin
-- plazo suma 0 días: TODO compromiso nacía venciendo el mismo día, o sea
-- en rojo. Pagos no tenía forma de saber si debía pagarlo hoy o en un mes,
-- que es justamente el dato por el que uno acepta un crédito.
--
-- Ahora Compras elige el plazo (15 o 30 días) también en los compromisos,
-- y se guarda 'Crédito 15 días' / 'Crédito 30 días', igual que en una
-- factura normal al crédito.
--
-- Qué conserva esta versión de trg_compromiso_bi (repasado contra la
-- migración 29, que es la vigente):
--   · Compromiso: sigue exigiendo crédito, sigue prohibiendo efectivo y
--     rendición, y sigue asignando la serie interna CRED-####.
--   · Pendiente ("ya pagué, falta la factura"): sigue prohibiendo el
--     crédito, sigue exigiendo que nazca Pagada, y sigue asignando PEND-####.
-- Lo ÚNICO que cambia: las dos comparaciones de forma_pago pasan de
-- igualdad exacta a "empieza por Crédito", para que los plazos entren.
--
-- Compatible hacia atrás: 'Crédito' pelado sigue siendo válido, así que
-- los compromisos ya registrados no se rompen. Se quedan venciendo el
-- mismo día — que es el lado seguro: Pagos los ve antes, no después.
-- ============================================================

create or replace function public.trg_compromiso_bi()
returns trigger
language plpgsql
as $$
begin
  if new.tipo_doc = 'Compromiso' then
    if new.forma_pago not like 'Crédito%' then
      raise exception 'Un compromiso siempre es al crédito.';
    end if;
    if new.medio_pago = 'Efectivo' or new.rendicion_id is not null then
      raise exception 'Un compromiso no puede pagarse en efectivo de caja chica.';
    end if;
    new.serie := 'CRED-' || lpad(new.numero::text, 4, '0');

  elsif new.tipo_doc = 'Pendiente' then
    -- Ya se pagó: exige que venga como Pagada y NUNCA al crédito
    if new.forma_pago like 'Crédito%' then
      raise exception 'Si el proveedor da crédito no es una factura por llegar: es un compromiso.';
    end if;
    if new.estado_pago <> 'Pagada' then
      raise exception 'Una factura por llegar nace pagada: el dinero ya salió.';
    end if;
    new.serie := 'PEND-' || lpad(new.numero::text, 4, '0');
  end if;
  return new;
end;
$$;

-- ── B) La caja chica es de Frank: Lucía no paga en efectivo ──────
--
-- A Compras no se le entrega dinero: la caja chica la recibe el comprador.
-- Si Lucía registrara una factura "pagada en efectivo", el sistema le
-- abriría una rendición del día a su nombre que nadie va a cerrar, y ese
-- gasto entraría a un arqueo que ella nunca hace.
--
-- Se oculta la casilla en pantalla, pero la regla vive aquí porque una
-- regla que solo vive en la pantalla se salta. Para levantarla el día que
-- Compras sí maneje efectivo, basta con borrar este trigger.
create or replace function public.trg_efectivo_solo_comprador()
returns trigger
language plpgsql
as $$
begin
  if new.rendicion_id is not null and coalesce(public.mi_rol(), '') = 'compras' then
    raise exception 'Compras no maneja caja chica: el pago en efectivo lo registra el comprador.';
  end if;
  return new;
end;
$$;

drop trigger if exists facturas_efectivo_solo_comprador on public.facturas;
create trigger facturas_efectivo_solo_comprador
  before insert or update on public.facturas
  for each row execute function public.trg_efectivo_solo_comprador();
