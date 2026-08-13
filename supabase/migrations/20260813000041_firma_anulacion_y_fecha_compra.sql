-- ============================================================
-- MIGRACIÓN 41 · LA FIRMA DE LAS ANULACIONES, Y LA FECHA DE COMPRA
--
-- Dos cosas que encontró la barrida de perfiles sobre el trabajo de
-- ayer. Las dos nacen de lo mismo: un cambio nuevo destapó un hueco
-- que antes era difícil de alcanzar.
--
-- 1) LA ANULACIÓN SIGUE FIRMÁNDOSE DESDE EL NAVEGADOR
-- La migración 36 dice, con todas sus letras, que "un dato que el
-- cliente puede escribir no es una firma, es una sugerencia", y lo
-- aplicó a las aprobaciones de salidas y préstamos. Pero dejó fuera
-- la ANULACIÓN — que es precisamente la operación que MUEVE
-- INVENTARIO: anular una salida aprobada devuelve el material al
-- stock. Hoy el almacenero puede anular una salida firmando con el
-- nombre del residente y con la fecha que quiera.
--
-- 2) CORREGIR UNA RECEPCIÓN A CERO REESCRIBE LA FECHA DE COMPRA
-- La migración 35 devuelve el ítem a "Comprado" cuando la cantidad
-- recibida baja a cero. El trigger que sella la fecha de compra ve
-- esa vuelta atrás como una compra nueva y le pone la fecha de hoy.
-- Efecto: el ítem que Frank compró el lunes y que el almacenero
-- corrige el jueves pasa a figurar comprado el jueves, y el aviso de
-- "comprado hace más de 48 h y sigue sin factura" se reinicia — que
-- es justo el control que evita que una compra no llegue a Pagos.
--
-- Se corre en el editor SQL de Supabase. Se puede repetir sin daño.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) LA FECHA DE COMPRA SOLO SE SELLA AL COMPRAR DE VERDAD
-- La transición legítima es desde "—", que además es la única que
-- estampa quién compró (migración 16). Una vuelta atrás desde
-- Entregado o Incompleto no es una compra.
-- ------------------------------------------------------------
create or replace function public.trg_sella_fecha_compra()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado = 'Comprado' and coalesce(old.estado, '') = '—' then
    new.fecha_compra := current_date;
  end if;
  -- Si el ítem vuelve del todo al principio, se limpia el sello.
  if new.estado = '—' then
    new.fecha_compra := null;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2) SALIDAS: la anulación la firma la base
-- Igual que las aprobaciones. Se lee solo el MOTIVO que se escribió;
-- el quién y el cuándo los pone el servidor.
-- ------------------------------------------------------------
create or replace function public.trg_salida_aprobacion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rol text := coalesce(public.mi_rol(), '');
  v_nombre text;
  campos_almacen   text[] := array['uso', 'motivo_uso', 'cant_reingresada', 'reingreso', 'anulacion'];
  campos_residente text[] := array['aprobacion', 'motivo_rechazo', 'aprobado_por', 'fecha_aprobacion'];
begin
  -- Quién aprobó y cuándo (migración 36)
  if new.aprobacion is distinct from old.aprobacion
     and new.aprobacion in ('Aprobada', 'Rechazada')
     and auth.uid() is not null then
    new.aprobado_por     := auth.uid();
    new.fecha_aprobacion := current_date;
  else
    new.aprobado_por     := old.aprobado_por;
    new.fecha_aprobacion := old.fecha_aprobacion;
  end if;

  -- Quién anuló: anular una salida aprobada DEVUELVE material al stock,
  -- así que es la firma que menos puede venir del navegador.
  if new.anulacion is distinct from old.anulacion and new.anulacion is not null then
    if old.anulacion is not null then
      raise exception 'Esa salida ya estaba anulada.';
    end if;
    if coalesce(trim(new.anulacion ->> 'motivo'), '') = '' then
      raise exception 'Anular una salida exige explicar por qué.';
    end if;
    select nombre into v_nombre from public.usuarios where id = auth.uid();
    new.anulacion := jsonb_build_object(
      'motivo', trim(new.anulacion ->> 'motivo'),
      'por',    coalesce(v_nombre, 'desconocido'),
      'fecha',  current_date::text);
  end if;

  if rol = 'residente' then
    if (to_jsonb(new) - campos_residente) is distinct from (to_jsonb(old) - campos_residente) then
      raise exception 'El residente solo aprueba o rechaza la salida, no modifica sus datos.';
    end if;
    if old.aprobacion <> 'Pendiente' then
      raise exception 'Esta salida ya fue resuelta.';
    end if;
    if new.aprobacion = 'Rechazada' and coalesce(trim(new.motivo_rechazo), '') = '' then
      raise exception 'Rechazar una salida exige explicar por qué.';
    end if;

  elsif rol = 'almacen' then
    if (to_jsonb(new) - campos_almacen) is distinct from (to_jsonb(old) - campos_almacen) then
      raise exception 'El almacén registra el uso, el reingreso y la anulación de la salida. Aprobarla es del residente de la obra.';
    end if;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3) PRÉSTAMOS: igual con la anulación
-- ------------------------------------------------------------
create or replace function public.trg_prestamo_aprobacion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rol      text := coalesce(public.mi_rol(), '');
  mi_obra  text := public.mi_proyecto();
  v_nombre text;
  campos_almacen   text[] := array['estado', 'anulacion'];
  campos_residente text[] := array['aprob_origen', 'aprob_destino', 'rechazo'];
begin
  select nombre into v_nombre from public.usuarios where id = auth.uid();

  new.fecha_cierre := old.fecha_cierre;

  if new.aprob_origen is distinct from old.aprob_origen then
    if old.aprob_origen is not null then
      if old.aprob_origen ->> 'por' is not distinct from coalesce(v_nombre, 'desconocido') then
        new.aprob_origen := old.aprob_origen;
      else
        raise exception 'El lado de origen ya lo aprobó %; una aprobación no se reescribe.', old.aprob_origen ->> 'por';
      end if;
    else
      if rol <> 'gerente' and not (rol = 'residente' and mi_obra is not distinct from old.origen) then
        raise exception 'El lado de origen lo aprueba el residente de esa obra.';
      end if;
      new.aprob_origen := jsonb_build_object('por', coalesce(v_nombre, 'desconocido'),
                                             'fecha', current_date::text);
    end if;
  end if;

  if new.aprob_destino is distinct from old.aprob_destino then
    if old.aprob_destino is not null then
      if old.aprob_destino ->> 'por' is not distinct from coalesce(v_nombre, 'desconocido') then
        new.aprob_destino := old.aprob_destino;
      else
        raise exception 'El lado de destino ya lo aprobó %; una aprobación no se reescribe.', old.aprob_destino ->> 'por';
      end if;
    else
      if rol <> 'gerente' and not (rol = 'residente' and mi_obra is not distinct from old.destino) then
        raise exception 'El lado de destino lo aprueba el residente de esa obra.';
      end if;
      new.aprob_destino := jsonb_build_object('por', coalesce(v_nombre, 'desconocido'),
                                              'fecha', current_date::text);
    end if;
  end if;

  if new.rechazo is distinct from old.rechazo and new.rechazo is not null then
    if rol <> 'gerente' and not (rol = 'residente'
        and (mi_obra is not distinct from old.origen or mi_obra is not distinct from old.destino)) then
      raise exception 'Un préstamo lo rechaza el residente de una de las dos obras.';
    end if;
    if coalesce(trim(new.rechazo ->> 'motivo'), '') = '' then
      raise exception 'Rechazar un préstamo exige explicar por qué.';
    end if;
    new.rechazo := jsonb_build_object('por', coalesce(v_nombre, 'desconocido'),
                                      'fecha', current_date::text,
                                      'motivo', trim(new.rechazo ->> 'motivo'));
  end if;

  -- Quién anuló: anular un préstamo devuelve el material a la obra de
  -- origen, así que va firmado por la base como todo lo demás.
  if new.anulacion is distinct from old.anulacion and new.anulacion is not null then
    if old.anulacion is not null then
      raise exception 'Ese préstamo ya estaba anulado.';
    end if;
    if coalesce(trim(new.anulacion ->> 'motivo'), '') = '' then
      raise exception 'Anular un préstamo exige explicar por qué.';
    end if;
    new.anulacion := jsonb_build_object(
      'motivo', trim(new.anulacion ->> 'motivo'),
      'por',    coalesce(v_nombre, 'desconocido'),
      'fecha',  current_date::text);
  end if;

  if rol = 'residente' then
    if (to_jsonb(new) - campos_residente) is distinct from (to_jsonb(old) - campos_residente) then
      raise exception 'El residente solo aprueba o rechaza el préstamo, no modifica sus datos.';
    end if;

  elsif rol = 'almacen' then
    if (to_jsonb(new) - campos_almacen) is distinct from (to_jsonb(old) - campos_almacen) then
      raise exception 'El almacén cierra un préstamo ya activo (devuelto, transferido o anulado). Aprobarlo es de los residentes de las dos obras.';
    end if;
  end if;

  if old.estado = 'Solicitado'
     and new.estado is distinct from old.estado
     and new.estado not in ('Anulado', 'Rechazado') then
    raise exception 'Un préstamo pasa a activo cuando lo aprueban los residentes de las dos obras, no marcándolo a mano.';
  end if;

  if new.rechazo is not null and old.rechazo is null then
    new.estado := 'Rechazado';
  elsif old.estado = 'Solicitado'
        and new.aprob_origen is not null and new.aprob_destino is not null then
    new.estado := 'Prestado';
  end if;

  return new;
end;
$$;

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- CÓMO COMPROBAR
--
-- EN LA APP, que nada se rompió: anular una salida y un préstamo con
-- motivo desde la vista del almacén; el rastro debe seguir mostrando
-- su nombre y la fecha de hoy.
--
-- QUE LA FIRMA NO SE PUEDE FALSEAR, con la sesión del almacenero:
--   update public.salidas
--      set anulacion = '{"motivo":"prueba","por":"Edwin Salas","fecha":"2020-01-01"}'
--    where id = '<uuid de una salida suya>';
--   ESPERADO: se guarda, pero con el nombre REAL del almacenero y la
--   fecha de HOY. Comprobar leyendo la fila después.
--
-- QUE LA FECHA DE COMPRA YA NO SE PISA:
--   1. Marcar un ítem como Comprado (queda fecha_compra = hoy).
--   2. Recibirlo y luego corregir la recepción a 0.
--   3. select estado, fecha_compra from rq_items where id = '<uuid>';
--   ESPERADO: vuelve a 'Comprado' con la fecha de compra ORIGINAL,
--   no la de hoy.
-- ============================================================
