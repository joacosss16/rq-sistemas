-- ============================================================
-- Migración 54 · La anulación deja de ser un atajo que salta todo
--
-- EL PROBLEMA
-- La primera línea del guardián de facturas decía, en efecto:
-- "si esto trae una anulación, déjalo pasar" — y salía ahí mismo, sin
-- ejecutar ninguna de las once comprobaciones que vienen después.
--
-- Consecuencia: en UN MISMO mensaje directo a la base podían viajar la
-- anulación Y un monto nuevo, otro proveedor, otra obra, la marca de
-- "pagada" o la de "conciliada", y todo entraba sin que nadie lo mirara.
-- Eso le daba a administración y a Pagos un poder que se decidió que
-- fuera solo de gerencia. Y de paso se saltaba el procedimiento oficial
-- (anular_factura), que es el único que libera los ítems del RQ.
--
-- SEGUNDA PUERTA, que el primer análisis no vio: este guardián es
-- BEFORE UPDATE solamente. El INSERT no lo mira nadie, así que Compras
-- o el comprador podían insertar una factura que NACE anulada, con la
-- firma "gerencia" puesta a mano. Se cubre abajo, en el punto B.
--
-- QUÉ CONSERVA (repasado línea por línea contra la migración 29, vigente):
--   1. Factura ya anulada: no admite cambios.
--   2. Compromiso → Factura: exige serie real (no CRED-/PEND-).
--   3. Compromiso → Factura: RUC, monto, obra y registrador congelados.
--   4. Pendiente → Factura: exige serie real.
--   5. Pendiente → Factura: los once campos del pago congelados.
--   6. El tipo de documento no cambia fuera de esas dos transiciones.
--   7. Datos comerciales congelados (serie, RUC, fecha, monto, forma,
--      obra, registrador).
--   8. Para pagar un compromiso hay que tener la serie real.
--   9. Factura pagada: congelada salvo conciliación.
--  10. Conciliar es exclusivo de gerencia.
--  11. El return new final.
-- Los once siguen ahí, en el mismo orden y con el mismo texto.
--
-- LO QUE CAMBIA: la rama de anulación ya no devuelve a ciegas. Ahora
-- exige ser gerencia, rechaza el motivo vacío, y comprueba que NINGUNA
-- otra columna haya cambiado en el mismo mensaje.
--
-- VERIFICADO que NO rompe la anulación legítima: anular_factura es
-- SECURITY DEFINER, y en Postgres eso cambia el dueño de la ejecución
-- pero NO toca auth.uid(), que sale del JWT de la sesión. Y su UPDATE
-- escribe UNA sola columna (anulacion), así que la comparación de "nada
-- más cambió" pasa limpia.
-- ============================================================

create or replace function public.trg_facturas_bu()
returns trigger
language plpgsql
as $$
declare
  v_campos text[] := array['anulacion', 'actualizado_en'];
begin
  -- Anular: solo se escribe el rastro, nada más.
  -- Antes esta rama devolvía sin mirar nada; ahora se comprueba que sea
  -- gerencia, que el motivo diga algo, y que en el mismo mensaje no
  -- viaje ningún otro cambio escondido.
  if old.anulacion is null and new.anulacion is not null then
    if coalesce(public.mi_rol(), '') <> 'gerente' then
      raise exception 'La anulación de una factura la confirma gerencia.';
    end if;
    if coalesce(trim(new.anulacion->>'motivo'), '') = '' then
      raise exception 'La anulación exige un motivo.';
    end if;
    if (to_jsonb(new) - v_campos) is distinct from (to_jsonb(old) - v_campos) then
      raise exception 'Al anular solo se escribe el rastro: ningún otro dato de la factura se toca en la misma operación.';
    end if;
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

-- ── B) Una factura no puede NACER anulada ───────────────────────
--
-- El guardián de arriba solo mira las modificaciones. Sin esto, Compras
-- o el comprador podían INSERTAR directamente una factura ya anulada,
-- con motivo y firma inventados, y ninguna guarda la miraba. Una
-- anulación es siempre un acto posterior de gerencia, nunca un dato de
-- nacimiento.
create or replace function public.trg_factura_no_nace_anulada()
returns trigger
language plpgsql
as $$
begin
  if new.anulacion is not null then
    raise exception 'Una factura no nace anulada: la anula gerencia después, con su motivo.';
  end if;
  return new;
end;
$$;

drop trigger if exists facturas_no_nace_anulada on public.facturas;
create trigger facturas_no_nace_anulada
  before insert on public.facturas
  for each row execute function public.trg_factura_no_nace_anulada();

notify pgrst, 'reload schema';

-- ============================================================
-- CÓMO COMPROBAR
--
-- 1. Gerencia anula una factura sin pagar desde el botón: debe seguir
--    funcionando igual, y sus ítems vuelven a la cola de compras.
-- 2. Gerencia anula una compra en efectivo con la jornada abierta
--    (migración 53): debe seguir funcionando.
-- 3. Pagos paga una factura normal: sin cambios.
-- 4. Administración digita la serie real de un compromiso: sin cambios.
-- ============================================================
