-- ============================================================
-- Migración 55 · La firma del pago la pone el servidor, no el navegador
--
-- EL PROBLEMA
-- Las columnas que dicen QUIÉN hizo qué —pagado_por, conciliada_por y
-- fecha_conciliacion— las mandaba el navegador y el servidor le creía.
-- Un mensaje directo a la base podía firmar un pago con el nombre de
-- otra persona. Justo las columnas cuyo valor se usa para responder
-- "¿quién autorizó esta salida de dinero?".
--
-- EL ARREGLO
-- El servidor las estampa siempre, con el usuario de la sesión, e
-- ignora lo que venga del navegador. Mismo patrón que ya usan
-- decidido_por (migración 40) y la firma de anulaciones (migración 41).
--
-- ORDEN DE DESPLIEGUE — IMPORTANTE
-- Esta migración se corre ANTES de subir la pantalla. La base exige que
-- una factura pagada tenga siempre quién la pagó (chk_pago_completo,
-- migración 43). Si la pantalla nueva llegara primero, cada "Registrar
-- pago" fallaría y Pagos quedaría muerto para administración y pagos.
-- Corriendo el SQL primero no se rompe nada: mientras tanto el servidor
-- simplemente confirma la firma que ya manda el navegador.
--
-- POR QUÉ EL PREFIJO aa_ EN EL NOMBRE
-- Los triggers BEFORE de una tabla corren en ORDEN ALFABÉTICO por su
-- nombre. Este tiene que ejecutarse ANTES que facturas_bu, para que las
-- comprobaciones de "esto no cambió" vean ya el valor normalizado. Si
-- alguien lo renombra sin el prefijo, empieza a correr después y puede
-- convertir un pago legítimo en un error. (Es el mismo motivo por el
-- que zz_actualizado_en lleva zz: ese tiene que ser el último.)
-- ============================================================

create or replace function public.trg_firma_del_pago()
returns trigger
language plpgsql
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- Sin sesión (editor SQL, semillas, mantenimiento) no se toca nada:
  -- registrado_por es obligatorio y forzarlo reventaría esos usos.
  if v_uid is null then
    return new;
  end if;

  -- El que paga es quien tiene la sesión abierta. Solo se estampa en la
  -- TRANSICIÓN a Pagada: si se estampara en cualquier cambio, se rompería
  -- "administración digita la serie real", porque el guardián de facturas
  -- exige que pagado_por y fecha_pago no cambien en ese paso.
  if tg_op = 'UPDATE' and new.estado_pago = 'Pagada' and old.estado_pago is distinct from 'Pagada' then
    new.pagado_por := v_uid;
    new.fecha_pago := coalesce(new.fecha_pago, current_date);
  end if;

  -- Conciliar es exclusivo de gerencia (lo exige facturas_bu). Aquí solo
  -- se deriva la firma del booleano, para que no se pueda inventar.
  if tg_op = 'UPDATE' and new.conciliada is distinct from old.conciliada then
    if new.conciliada then
      new.conciliada_por      := v_uid;
      new.fecha_conciliacion  := current_date;
    else
      new.conciliada_por      := null;
      new.fecha_conciliacion  := null;
    end if;
  end if;

  -- Quien registra la factura es quien la crea. En los UPDATE se
  -- conserva el original: reescribirlo dispararía "los datos comerciales
  -- de la factura no se editan" en CADA pago.
  if tg_op = 'INSERT' then
    new.registrado_por := coalesce(new.registrado_por, v_uid);
  else
    new.registrado_por := old.registrado_por;
  end if;

  return new;
end;
$$;

drop trigger if exists aa_facturas_firma on public.facturas;
create trigger aa_facturas_firma
  before insert or update on public.facturas
  for each row execute function public.trg_firma_del_pago();

notify pgrst, 'reload schema';

-- ============================================================
-- CÓMO COMPROBAR (correr ESTE SQL antes de subir la pantalla)
--
-- 1. Pagos paga una factura por transferencia: entra normal y la firma
--    que queda es la de quien pagó.
-- 2. Administración digita la serie real de un compromiso: sigue
--    funcionando (no debe decir que los datos del pago cambiaron).
-- 3. Gerencia concilia y desconcilia una factura: la firma y la fecha
--    de conciliación aparecen y se limpian solas.
-- 4. Frank registra una compra en efectivo: entra normal.
-- 5. Gerencia anula una compra en efectivo con la jornada abierta
--    (migración 53): debe seguir pudiendo.
-- ============================================================
