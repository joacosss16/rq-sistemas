-- ============================================================
-- Migración 29: tres huecos de facturación que comparten triggers.
--
-- A) "Se paga hoy y la factura llega mañana" — NO es crédito: la
--    plata ya salió. Nuevo tipo_doc 'Pendiente', con serie interna
--    PEND-####, forma de pago REAL y nacida Pagada. Cuando llega el
--    documento, ADMINISTRACIÓN digita la serie real.
-- B) Una factura mal registrada no se podía corregir ni anular.
--    Ahora se ANULA con motivo y lo confirma GERENCIA; los ítems
--    quedan libres para volver a facturarse bien. Nunca se borra.
-- C) Un ítem con factura activa ya NO se puede anular: primero se
--    deshace el efecto (la factura), después la causa (el ítem).
-- ============================================================

-- ── A) Tipo documental nuevo -------------------------------------

alter table public.facturas drop constraint if exists facturas_tipo_doc_check;
alter table public.facturas
  add constraint facturas_tipo_doc_check
    check (tipo_doc in ('Factura','Compromiso','Pendiente'));

-- Serie interna PEND-#### derivada del correlativo, igual que CRED-####.
-- Un texto fijo reventaría en la segunda compra al mismo proveedor
-- (uq_factura es serie+RUC).
create or replace function public.trg_compromiso_bi()
returns trigger
language plpgsql
as $$
begin
  if new.tipo_doc = 'Compromiso' then
    if new.forma_pago <> 'Crédito' then
      raise exception 'Un compromiso siempre es al crédito.';
    end if;
    if new.medio_pago = 'Efectivo' or new.rendicion_id is not null then
      raise exception 'Un compromiso no puede pagarse en efectivo de caja chica.';
    end if;
    new.serie := 'CRED-' || lpad(new.numero::text, 4, '0');

  elsif new.tipo_doc = 'Pendiente' then
    -- Ya se pagó: exige que venga como Pagada y NUNCA al crédito
    if new.forma_pago = 'Crédito' then
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

-- ── B) Anulación de factura, confirmada por gerencia --------------

alter table public.facturas
  add column if not exists anulacion jsonb;   -- {motivo, por, fecha}

alter table public.facturas drop constraint if exists chk_anulacion_factura;
alter table public.facturas
  add constraint chk_anulacion_factura check (
    anulacion is null or anulacion ?& array['motivo','por','fecha']
  );

-- Una factura anulada libera sus ítems: se borran sus líneas para que
-- el ítem pueda facturarse de nuevo (uq_item_factura lo impedía).
-- security definer porque tiene que borrar las líneas para liberar los
-- ítems (nadie tiene DELETE sobre factura_items, y así sigue siendo).
-- El permiso real lo pone el chequeo de rol de la primera línea.
create or replace function public.anular_factura(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f record;
  v_nombre text;
begin
  if public.mi_rol() <> 'gerente' then
    raise exception 'La anulación de una factura la confirma gerencia.';
  end if;
  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'La anulación exige un motivo.';
  end if;

  select * into f from public.facturas where id = p_id;
  if not found then raise exception 'Factura no encontrada.'; end if;
  if f.anulacion is not null then raise exception 'Esa factura ya está anulada.'; end if;

  -- El dinero ya se movió y se cuadró contra el banco: no se toca
  if f.conciliada then
    raise exception 'Esa factura ya fue conciliada contra el banco. Corrige con una nota de crédito, no anulando.';
  end if;

  -- Efectivo: solo mientras la rendición del día siga abierta
  if f.rendicion_id is not null then
    if exists (select 1 from public.rendiciones r
               where r.id = f.rendicion_id and r.estado <> 'Abierta') then
      raise exception 'La rendición de esa compra en efectivo ya fue cerrada. Coordina con administración.';
    end if;
  end if;

  select nombre into v_nombre from public.usuarios where id = auth.uid();

  delete from public.factura_items where factura_id = p_id;

  update public.facturas
     set anulacion = jsonb_build_object(
           'motivo', trim(p_motivo),
           'por', coalesce(v_nombre, 'gerencia'),
           'fecha', current_date::text)
   where id = p_id;
end;
$$;

comment on function public.anular_factura is
  'Anula una factura con motivo (solo gerencia) y libera sus ítems. La factura queda con su rastro, nunca se borra.';

-- ── Reglas de edición: abre la conversión Pendiente -> Factura -----

create or replace function public.trg_facturas_bu()
returns trigger
language plpgsql
as $$
begin
  -- Anular: solo se escribe el rastro, nada más
  if old.anulacion is null and new.anulacion is not null then
    return new;
  end if;
  if old.anulacion is not null then
    raise exception 'Esa factura está anulada: no admite cambios.';
  end if;

  -- COMPROMISO -> FACTURA: ocurre AL PAGAR, así que en la misma
  -- operación llegan la serie real y los datos del pago (como hoy).
  if old.tipo_doc = 'Compromiso' and new.tipo_doc = 'Factura' then
    if new.serie like 'CRED-%' or new.serie like 'PEND-%' then
      raise exception 'Digita la serie real de la factura que entregó el proveedor.';
    end if;
    if new.proveedor_ruc is distinct from old.proveedor_ruc
       or new.monto is distinct from old.monto
       or new.proyecto is distinct from old.proyecto
       or new.registrado_por is distinct from old.registrado_por then
      raise exception 'Al pagar solo se digita la serie real: el resto de la factura no se edita.';
    end if;
    return new;
  end if;

  -- PENDIENTE -> FACTURA: la compra YA está pagada; solo llega el papel.
  -- Aquí no se toca ni un dato del pago.
  if old.tipo_doc = 'Pendiente' and new.tipo_doc = 'Factura' then
    if new.serie like 'CRED-%' or new.serie like 'PEND-%' then
      raise exception 'Digita la serie real de la factura que entregó el proveedor.';
    end if;
    if new.monto is distinct from old.monto
       or new.proveedor_ruc is distinct from old.proveedor_ruc
       or new.proyecto is distinct from old.proyecto
       or new.forma_pago is distinct from old.forma_pago
       or new.estado_pago is distinct from old.estado_pago
       or new.medio_pago is distinct from old.medio_pago
       or new.banco is distinct from old.banco
       or new.numero_operacion is distinct from old.numero_operacion
       or new.fecha_pago is distinct from old.fecha_pago
       or new.pagado_por is distinct from old.pagado_por
       or new.rendicion_id is distinct from old.rendicion_id then
      raise exception 'Esta compra ya está pagada: al llegar la factura solo se digita su serie.';
    end if;
    return new;
  end if;

  if new.tipo_doc is distinct from old.tipo_doc then
    raise exception 'Una factura no cambia de tipo de documento.';
  end if;

  -- Datos comerciales congelados
  if new.serie is distinct from old.serie
     or new.proveedor_ruc is distinct from old.proveedor_ruc
     or new.fecha is distinct from old.fecha
     or new.monto is distinct from old.monto
     or new.forma_pago is distinct from old.forma_pago
     or new.proyecto is distinct from old.proyecto
     or new.registrado_por is distinct from old.registrado_por then
    raise exception 'Los datos comerciales de la factura no se editan. Si está mal, gerencia la anula y se registra de nuevo.';
  end if;

  -- Para pagar un compromiso hay que tener la serie real
  if new.estado_pago = 'Pagada' and new.tipo_doc = 'Compromiso' then
    raise exception 'Para pagar, registra primero la serie de la factura real.';
  end if;

  -- Factura pagada: congelada salvo conciliación
  if old.estado_pago = 'Pagada' then
    if new.estado_pago is distinct from old.estado_pago
       or new.medio_pago is distinct from old.medio_pago
       or new.banco is distinct from old.banco
       or new.numero_operacion is distinct from old.numero_operacion
       or new.fecha_pago is distinct from old.fecha_pago
       or new.pagado_por is distinct from old.pagado_por
       or new.rendicion_id is distinct from old.rendicion_id then
      raise exception 'La factura ya está pagada; solo se puede conciliar.';
    end if;
  end if;

  if new.conciliada is distinct from old.conciliada and public.mi_rol() <> 'gerente' then
    raise exception 'La conciliación bancaria es exclusiva de gerencia.';
  end if;

  return new;
end;
$$;

-- La rendición solo se valida cuando la factura NACE o cambia de pago,
-- no cuando el día siguiente se digita la serie real.
create or replace function public.trg_factura_rendicion()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.rendicion_id is not distinct from old.rendicion_id
     and new.medio_pago is not distinct from old.medio_pago then
    return new;   -- no se tocó el pago: nada que revalidar
  end if;

  if new.medio_pago = 'Efectivo' then
    if new.rendicion_id is null then
      raise exception 'Una compra en efectivo tiene que ir contra la rendición del día.';
    end if;
    if not exists (select 1 from public.rendiciones r
                   where r.id = new.rendicion_id
                     and r.proyecto = new.proyecto
                     and r.estado = 'Abierta') then
      raise exception 'La rendición del día ya fue cerrada o es de otra obra.';
    end if;
  elsif new.rendicion_id is not null then
    raise exception 'Solo las compras en efectivo van contra una rendición.';
  end if;
  return new;
end;
$$;

-- Administración digita la serie real: quien compró no cierra su propio documento
drop policy if exists facturas_update_admin on public.facturas;
create policy facturas_update_admin on public.facturas
  for update to authenticated
  using (public.mi_rol() in ('administracion','gerente'))
  with check (public.mi_rol() in ('administracion','gerente'));

-- ── C) Un ítem con factura activa no se anula --------------------

create or replace function public.trg_no_anular_facturado()
returns trigger
language plpgsql
as $$
declare v_serie text;
begin
  if new.decision = 'Anulado' and coalesce(old.decision, '') <> 'Anulado' then
    select f.serie into v_serie
      from public.factura_items fi
      join public.facturas f on f.id = fi.factura_id
     where fi.rq_item_id = new.id and f.anulacion is null
     limit 1;
    if v_serie is not null then
      raise exception 'No se puede anular: este ítem está en la factura %. Anula primero la factura.', v_serie;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists no_anular_facturado on public.rq_items;
create trigger no_anular_facturado
  before update on public.rq_items
  for each row execute function public.trg_no_anular_facturado();

notify pgrst, 'reload schema';
