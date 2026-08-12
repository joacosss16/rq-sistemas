-- ============================================================
-- MIGRACIÓN 36 · LAS OTRAS TRES PUERTAS DEL ALMACENERO
--
-- La migración 34 cerró `rq_items`. La verificación adversarial
-- encontró que el mismo agujero estaba en otras tres tablas, y que
-- dos son PEORES que la original, porque ahí el rastro no solo
-- falta: MIENTE.
--
-- 1) SALIDAS — el almacenero aprueba sus propias salidas de material,
--    saltándose al residente (la guarda de la migración 18 solo mira
--    `if mi_rol() = 'residente'`). Y puede escribir `aprobado_por`
--    con el identificador del residente: en pantalla figura que la
--    aprobó Edwin Salas.
--
-- 2) PRÉSTAMOS — aprueba LOS DOS LADOS él solo (aprob_origen y
--    aprob_destino son jsonb libre que viaja desde el navegador) y el
--    trigger, al ver las dos aprobaciones, pasa el préstamo a
--    "Prestado" y mueve el stock. Cruza razones sociales: un
--    almacenero con un faltante presta a otra obra, se autoaprueba
--    las dos puntas y lo cierra como "Transferido al costo" — su
--    inventario cuadra y el costo aterriza en la otra empresa.
--
-- 3) STOCK INICIAL — permiso completo, INCLUIDO BORRAR, sin un solo
--    control y sin rastro. La app ni siquiera escribe esa tabla, así
--    que nadie la mira.
--
-- ---- LO QUE LA PRIMERA VERSIÓN DE ESTA MIGRACIÓN NO VEÍA ----
-- Las guardas se pusieron sobre la MODIFICACIÓN, y el alta quedó
-- abierta. No hace falta aprobar una salida: basta con CREARLA ya
-- aprobada. Y es peor que por modificación, porque naciendo
-- "Aprobada" nunca aparece en la bandeja del residente y él ya no
-- puede rechazarla. Invisible e irreversible. Igual con los
-- préstamos: nacen en "Prestado" y el stock se mueve solo.
-- Por eso esta migración pone guardas en el ALTA y en la
-- modificación. Una regla que solo cubre la mitad de los caminos no
-- es una regla.
--
-- EL PRINCIPIO: comparar la fila ENTERA menos las columnas que ese
-- rol sí maneja. Y LAS FIRMAS NO VIAJAN DESDE EL NAVEGADOR: quién
-- aprobó y cuándo los estampa la base. Un dato que el cliente puede
-- escribir no es una firma, es una sugerencia.
--
-- NO cambia nada de lo que hoy hace nadie en pantalla.
-- Se corre en el editor SQL de Supabase. Se puede repetir sin daño.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- PUERTA 1 · SALIDAS — CÓMO NACEN
--
-- Una salida nace SIEMPRE pendiente de que el residente la apruebe,
-- sin uso, sin reingreso y sin anulación, diga lo que diga quien la
-- crea. Solo se aplica a quien entra por la aplicación (hay sesión);
-- las cargas de datos desde el editor SQL no se tocan.
-- ------------------------------------------------------------
create or replace function public.trg_salida_nace_pendiente()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;   -- mantenimiento, no app
  new.aprobacion       := 'Pendiente';
  new.aprobado_por     := null;
  new.fecha_aprobacion := null;
  new.motivo_rechazo   := null;
  new.uso              := 'Pendiente';
  new.motivo_uso       := null;
  new.cant_reingresada := 0;
  new.reingreso        := null;
  new.anulacion        := null;
  return new;
end;
$$;

-- El nombre importa: los BEFORE corren en orden alfabético y
-- `salidas_nace_pendiente` va después de `salidas_bi` (el que valida
-- el stock), que es el orden correcto.
drop trigger if exists salidas_nace_pendiente on public.salidas;
create trigger salidas_nace_pendiente
  before insert on public.salidas
  for each row execute function public.trg_salida_nace_pendiente();

-- ------------------------------------------------------------
-- PUERTA 1 · SALIDAS — QUIÉN TOCA QUÉ AL MODIFICARLAS
--   · almacén    → uso, motivo_uso, reingreso a stock, anulación
--   · residente  → aprobar o rechazar (con motivo)
--   · la base    → quién aprobó y cuándo
-- ------------------------------------------------------------
create or replace function public.trg_salida_aprobacion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rol text := coalesce(public.mi_rol(), '');
  campos_almacen   text[] := array['uso', 'motivo_uso', 'cant_reingresada', 'reingreso', 'anulacion'];
  campos_residente text[] := array['aprobacion', 'motivo_rechazo', 'aprobado_por', 'fecha_aprobacion'];
begin
  -- La firma la pone la base. Si la aprobación cambió (y hay sesión),
  -- se estampa a quien la tiene abierta; si no, se conserva la que
  -- había. Así, un UPDATE que solo toque `aprobado_por` no consigue
  -- nada: era el camino para firmar con el nombre del residente.
  -- El `auth.uid() is not null` evita que una corrección de
  -- mantenimiento BORRE la firma en silencio.
  if new.aprobacion is distinct from old.aprobacion
     and new.aprobacion in ('Aprobada', 'Rechazada')
     and auth.uid() is not null then
    new.aprobado_por     := auth.uid();
    new.fecha_aprobacion := current_date;
  else
    new.aprobado_por     := old.aprobado_por;
    new.fecha_aprobacion := old.fecha_aprobacion;
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

drop trigger if exists salidas_aprobacion_guard on public.salidas;
create trigger salidas_aprobacion_guard
  before update on public.salidas
  for each row execute function public.trg_salida_aprobacion();

-- ------------------------------------------------------------
-- PUERTA 2 · PRÉSTAMOS — CÓMO NACEN
-- Nace "Solicitado", sin ninguna aprobación puesta. Era el camino
-- más caro de todos: naciendo en "Prestado", el stock se mueve de
-- una obra a otra en el acto, sin que nadie apruebe nada.
-- ------------------------------------------------------------
create or replace function public.trg_prestamo_nace_solicitado()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;   -- mantenimiento, no app
  new.estado        := 'Solicitado';
  new.aprob_origen  := null;
  new.aprob_destino := null;
  new.rechazo       := null;
  new.fecha_cierre  := null;
  new.anulacion     := null;
  return new;
end;
$$;

-- `prestamos_nace_solicitado` va después de `prestamos_biu` en orden
-- alfabético: primero se valida el stock, después se sanea el alta.
drop trigger if exists prestamos_nace_solicitado on public.prestamos;
create trigger prestamos_nace_solicitado
  before insert on public.prestamos
  for each row execute function public.trg_prestamo_nace_solicitado();

-- ------------------------------------------------------------
-- PUERTA 2 · PRÉSTAMOS — QUIÉN TOCA QUÉ AL MODIFICARLOS
--   · almacén    → cerrar un préstamo YA activo (devuelto,
--                  transferido al costo, anulado)
--   · residente  → aprobar SU lado, o rechazar
--   · la base    → quién aprobó y cuándo, y el paso a "Prestado"
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
  -- OJO: `estado` NO está en ninguna de las dos listas. Lo mueve la
  -- base sola, más abajo. En la primera versión estaba en la del
  -- residente y eso le permitía activar un préstamo él solo —
  -- exactamente el agujero que esta migración cierra para el almacén.
  campos_almacen   text[] := array['estado', 'anulacion'];
  campos_residente text[] := array['aprob_origen', 'aprob_destino', 'rechazo'];
begin
  select nombre into v_nombre from public.usuarios where id = auth.uid();

  -- La fecha de cierre la estampa la base (trg_prestamos_biu, que
  -- corre justo después): que no llegue del navegador.
  new.fecha_cierre := old.fecha_cierre;

  -- ---------- Las aprobaciones las firma la base ----------
  -- Antes eran jsonb libre que llegaba del navegador: el almacenero
  -- podía escribir el nombre del residente que quisiera. Ahora solo
  -- se lee la INTENCIÓN de aprobar; el contenido lo arma la base.
  if new.aprob_origen is distinct from old.aprob_origen then
    if old.aprob_origen is not null then
      -- Doble clic del mismo firmante: no es un error, se conserva.
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

  -- ---------- Qué puede tocar cada rol ----------
  if rol = 'residente' then
    if (to_jsonb(new) - campos_residente) is distinct from (to_jsonb(old) - campos_residente) then
      raise exception 'El residente solo aprueba o rechaza el préstamo, no modifica sus datos.';
    end if;

  elsif rol = 'almacen' then
    if (to_jsonb(new) - campos_almacen) is distinct from (to_jsonb(old) - campos_almacen) then
      raise exception 'El almacén cierra un préstamo ya activo (devuelto, transferido o anulado). Aprobarlo es de los residentes de las dos obras.';
    end if;
  end if;

  -- ---------- Sacar un préstamo de "Solicitado" ES aprobarlo ----------
  -- Vale para TODOS los roles, no solo para el almacén: en la primera
  -- versión esta guarda vivía dentro de la rama del almacén y el
  -- residente podía activar el préstamo él solo. Se permite anularlo
  -- o rechazarlo, que son cierres, no activaciones.
  if old.estado = 'Solicitado'
     and new.estado is distinct from old.estado
     and new.estado not in ('Anulado', 'Rechazado') then
    raise exception 'Un préstamo pasa a activo cuando lo aprueban los residentes de las dos obras, no marcándolo a mano.';
  end if;

  -- ---------- Transiciones automáticas (como antes) ----------
  if new.rechazo is not null and old.rechazo is null then
    new.estado := 'Rechazado';
  elsif old.estado = 'Solicitado'
        and new.aprob_origen is not null and new.aprob_destino is not null then
    new.estado := 'Prestado';
  end if;

  return new;
end;
$$;

drop trigger if exists prestamos_aprobacion_guard on public.prestamos;
create trigger prestamos_aprobacion_guard
  before update on public.prestamos
  for each row execute function public.trg_prestamo_aprobacion();

-- ------------------------------------------------------------
-- PUERTA 3 · STOCK INICIAL
--
-- Es la única pieza de la fórmula del stock sin ningún control:
--     stock = inicial + recibido − salidas ± préstamos
-- La migración 34 prohíbe bajar una cantidad recibida porque
-- "descuadraría el stock sin dejar rastro", y la fila de al lado
-- —que suma en la MISMA fórmula— se podía poner a cero o borrar sin
-- explicar nada. Se cierra a medias, y conviene decirlo claro:
--   · SÍ se arregla QUIÉN puede tocarla (Compras y gerencia; el
--     almacenero ya no: contar el inventario y poder editarlo uno
--     mismo es lo que hace inútil un inventario).
--   · NO queda rastro todavía de las correcciones. La tabla no tiene
--     columna de historial y su clave es (proyecto, código), así que
--     un update pisa la fila igual que un borrado. Eso se cierra con
--     el mismo patrón de la migración 35 (columna `correcciones`)
--     ANTES de cargar los inventarios reales de las 5 obras.
--
-- La app no escribe esta tabla (solo la lee), así que esto no cambia
-- ninguna pantalla.
-- ------------------------------------------------------------
drop policy if exists stock_inicial_write  on public.stock_inicial;
drop policy if exists stock_inicial_insert on public.stock_inicial;
drop policy if exists stock_inicial_update on public.stock_inicial;

create policy stock_inicial_insert on public.stock_inicial
  for insert to authenticated
  with check (coalesce(public.mi_rol(), '') in ('compras', 'gerente'));

create policy stock_inicial_update on public.stock_inicial
  for update to authenticated
  using      (coalesce(public.mi_rol(), '') in ('compras', 'gerente'))
  with check (coalesce(public.mi_rol(), '') in ('compras', 'gerente'));

-- Borrar: nadie desde la app. Una fila borrada no deja ni el valor
-- anterior. Sin política de delete, Postgres lo deniega por defecto.

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- ANTES DE CORRER ESTA MIGRACIÓN
--
-- Hoy solo 2502 y 2503 tienen residente. Un préstamo que toque una
-- obra SIN residente no lo podrá aprobar nadie: LUZ (2504) tiene
-- almacenero pero no residente. Crear esos usuarios es el arreglo de
-- verdad; si hace falta destrabar uno a mano, gerencia puede hacerlo
-- desde el editor SQL identificándose:
--   begin;
--     set local role authenticated;
--     set local request.jwt.claims to '{"sub":"<uuid de gerencia>"}';
--     update public.prestamos set aprob_origen = '{}'::jsonb where id = '<uuid>';
--   commit;
--
-- CÓMO COMPROBAR
--
-- EN LA APP, que nada se rompió (esto primero):
--   · Almacén: dar una salida, marcar uso correcto/incorrecto,
--     reingresar a stock, anular una salida. Pedir un préstamo y
--     cerrar uno activo como devuelto o transferido.
--   · Residente: aprobar y rechazar una salida; aprobar su lado de un
--     préstamo. Comprobar que la salida nueva le aparece pendiente.
--
-- QUE LOS AGUJEROS ESTÁN CERRADOS, con la sesión de un almacenero:
--   1. Crear una salida con aprobacion='Aprobada' desde la API.
--      ESPERADO: la fila queda 'Pendiente'. Es el agujero más grave.
--   2. Crear un préstamo con estado='Prestado' y las dos aprobaciones.
--      ESPERADO: queda 'Solicitado' y el stock NO se mueve.
--   3. update salidas set aprobacion='Aprobada' …
--      ESPERADO: "El almacén registra el uso, el reingreso y la
--      anulación… Aprobarla es del residente de la obra."
--   4. update salidas set aprobado_por='<uuid del residente>' …
--      ESPERADO: pasa sin error PERO no cambia nada: comprobar
--      después que `aprobado_por` sigue igual.
--   5. delete from stock_inicial where proyecto='2503';
--      ESPERADO: 0 filas borradas.
-- ============================================================
