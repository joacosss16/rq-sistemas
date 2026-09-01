-- ============================================================
-- MIGRACIÓN 81 · Devolver un préstamo lo confirman los DOS almacenes
-- ============================================================
--
-- DECISIÓN DEL DUEÑO, 31 ago 2026, al repasar cómo funciona el préstamo entre
-- obras.
--
-- LA ASIMETRÍA. Prestar exige DOS firmas —el residente de origen autoriza que
-- salga el material, el de destino acepta la deuda—. Devolver se hacía con UNA
-- sola: bastaba con que un almacenero pulsara "Devuelto".
--
-- Y lo que lo hace grave es QUIÉN puede pulsarlo. La tabla de préstamos muestra
-- los de la obra propia como origen O como destino, así que el botón lo tienen
-- los dos almaceneros. En la práctica:
--
--     LUZ tiene 40 bolsas prestadas de MAIA. El almacenero de LUZ pulsa
--     "Devuelto" sin mover nada. El stock vuelve a MAIA. MAIA no tiene las
--     bolsas, pero el sistema dice que sí.
--
-- La guarda que existe no lo impide: comprueba que el destino TENGA el material
-- (para que no se devuelva lo ya consumido), no que lo haya ENTREGADO. Tener y
-- entregar no son lo mismo, y esa diferencia es justo la que se cuela.
--
-- No hace falta mala fe: basta con que el almacenero de LUZ dé por hecho que el
-- camión sale mañana y lo registre hoy. El descuadre aparece en MAIA semanas
-- después, cuando alguien pide esas bolsas.
--
-- LA CORRECCIÓN. Las mismas dos firmas que para entrar, pero de los
-- ALMACENEROS, no de los residentes:
--
--   · `devol_destino` — "lo entregué". Lo firma quien tiene el material.
--   · `devol_origen`  — "lo recibí de vuelta y lo conté". Lo firma quien lo
--                        recupera.
--
-- Con las dos, el préstamo pasa a 'Devuelto' y el stock se mueve. Con una sola,
-- queda A MEDIAS: el material sigue contando en el destino, porque nadie ha
-- confirmado que se movió — que es exactamente la verdad.
--
-- POR QUÉ LOS ALMACENEROS Y NO LOS RESIDENTES. La ENTRADA es una decisión
-- (¿autorizo que salga material de mi obra?), y por eso la firma quien decide.
-- La DEVOLUCIÓN es un hecho físico: alguien cuenta las bolsas. Quien las cuenta
-- es quien firma. Es el mismo criterio que rige toda la casa — la recepción la
-- registra el almacenero, no Compras.
--
-- LO QUE NO CAMBIA. La guarda de "el destino ya consumió el material" sigue
-- igual (`trg_prestamos_biu`, migración 73), solo que ahora se dispara al
-- llegar la SEGUNDA firma, que es cuando el préstamo se cierra de verdad. Si
-- entre una firma y otra el destino se gasta el material, salta ahí.
--
-- LA PANTALLA la acompaña en el mismo commit: una devolución a medias se pinta
-- en ROJO a partir de las 16:00 en las dos obras, con los días que lleva
-- esperando. Sin eso, media firma se queda dormida para siempre — y este
-- sistema no manda avisos, así que lo único que despierta a alguien es el color
-- de un número que ya está mirando.
--
-- QUÉ SE LEYÓ ANTES (regla de la casa). `trg_prestamo_aprobacion` se define en
-- las migraciones 18, 36 y 41. **La VIVA es la de la 41** —ni la 69 ni la 73 ni
-- la 74 la tocan; esas trabajan sobre `trg_prestamos_biu` y sobre triggers
-- `zz_` aparte— y de esa se parte, copiada entera.
--
-- Y EL ORDEN DE LOS TRIGGERS IMPORTA, como siempre en esta tabla:
--     prestamos_aprobacion_guard  (esta)  -> deriva el estado
--     prestamos_biu               (73)    -> valida el consumo del destino
--     zz_actualizado_en           (44)    -> sella la marca de tiempo
--     zz_prestamo_transicion      (69)    -> vigila las transiciones
--     zz_sin_transferir_al_costo  (74)
-- Van en orden alfabético, así que el estado ya está derivado cuando la 73 lo
-- comprueba. Es lo que permite que la guarda del consumo siga funcionando.

-- ------------------------------------------------------------
-- 1) LAS DOS FIRMAS
-- ------------------------------------------------------------
alter table public.prestamos
  add column if not exists devol_origen  jsonb,
  add column if not exists devol_destino jsonb;

comment on column public.prestamos.devol_destino is
  'Confirmación del almacén que TENÍA el material: "lo entregué". La firma el servidor, nunca el cliente.';
comment on column public.prestamos.devol_origen is
  'Confirmación del almacén que lo RECUPERA: "lo recibí de vuelta y lo conté". La firma el servidor.';

-- ------------------------------------------------------------
-- 2) LOS PRÉSTAMOS YA DEVUELTOS DE ANTES
-- ------------------------------------------------------------
-- Se cerraron con el criterio de entonces y no se reabren: quedan marcados como
-- confirmados por los dos, con la anotación de que vienen del modelo anterior.
-- No se inventa quién firmó —ese dato nunca existió— y por eso dice
-- "(histórico)" en vez de un nombre, igual que hizo la migración 18 con las
-- aprobaciones antiguas.
update public.prestamos
   set devol_origen  = jsonb_build_object('por', '(histórico)', 'fecha', coalesce(fecha_cierre, fecha)),
       devol_destino = jsonb_build_object('por', '(histórico)', 'fecha', coalesce(fecha_cierre, fecha))
 where estado = 'Devuelto'
   and fecha_cierre is not null          -- ver la nota de abajo
   and (devol_origen is null or devol_destino is null);

-- OJO CON LOS DEVUELTOS SIN FECHA DE CIERRE. Se dejan fuera a propósito: al
-- tocarlos, `trg_prestamos_biu` les estamparía `fecha_cierre = current_date`
-- (migración 73), y un préstamo devuelto en julio pasaría a figurar cerrado
-- HOY. Antes de correr esta migración conviene mirar cuántos hay:
--   select count(*) from public.prestamos where estado='Devuelto' and fecha_cierre is null;
-- Si sale 0 —lo esperable—, esta línea no cambia nada. Si sale más, esos
-- quedarán sin las dos firmas históricas y habrá que decidir qué hacer con
-- ellos, que es mejor que falsearles la fecha de cierre en silencio.

-- ------------------------------------------------------------
-- 3) LA GUARDA, CON LAS FIRMAS DE LA DEVOLUCIÓN
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
  campos_almacen   text[] := array['estado', 'anulacion', 'devol_origen', 'devol_destino'];
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

  -- ── AÑADIDO (81): LAS DOS FIRMAS DE LA DEVOLUCIÓN ──────────
  -- Calcado de aprob_origen/aprob_destino de arriba, y por el mismo motivo:
  -- entrar exigía DOS firmas y salir se hacía con UNA, y encima podía ser la
  -- del almacén que tenía el material. Ahora firman los dos: el destino
  -- ("lo entregué") y el origen ("lo recibí de vuelta y lo conté").
  --
  -- LOS FIRMAN LOS ALMACENEROS, no los residentes. La ENTRADA es una decisión
  -- —¿autorizo que salga material de mi obra?— y por eso la firman ellos. La
  -- DEVOLUCIÓN es un hecho físico: alguien cuenta las bolsas. Quien las cuenta
  -- es quien firma.
  -- NADIE FIRMA LOS DOS LADOS A LA VEZ. Gerencia conserva su excepción abajo
  -- —es la red para el día que un almacenero esté de baja— pero mandando las
  -- DOS columnas en una sola sentencia cerraba el préstamo ella sola, sin que
  -- nadie contara nada, y la cabecera afirmaba que eso no se podía. Dos firmas
  -- que pone la misma persona en el mismo acto no son dos firmas.
  if new.devol_origen  is distinct from old.devol_origen
 and new.devol_destino is distinct from old.devol_destino
 and auth.uid() is not null then
    raise exception 'Las dos confirmaciones de la devolución se registran por separado: primero el almacén que entrega, después el que recibe. Cada una la firma quien contó el material.';
  end if;

  if new.devol_origen is distinct from old.devol_origen then
    if old.devol_origen is not null then
      if old.devol_origen ->> 'por' is not distinct from coalesce(v_nombre, 'desconocido') then
        new.devol_origen := old.devol_origen;      -- doble clic del mismo firmante
      else
        raise exception 'La devolución ya la confirmó % por el lado de origen; una firma no se reescribe.', old.devol_origen ->> 'por';
      end if;
    else
      if old.estado <> 'Prestado' then
        raise exception 'Solo se confirma la devolución de un préstamo que está entregado (este está %).', lower(old.estado);
      end if;
      if rol <> 'gerente' and not (rol = 'almacen' and mi_obra is not distinct from old.origen) then
        raise exception 'La vuelta del material la confirma el almacenero de % , que es quien lo recibe y lo cuenta.', old.origen;
      end if;
      new.devol_origen := jsonb_build_object('por', coalesce(v_nombre, 'desconocido'),
                                             'fecha', current_date::text);
    end if;
  end if;

  if new.devol_destino is distinct from old.devol_destino then
    if old.devol_destino is not null then
      if old.devol_destino ->> 'por' is not distinct from coalesce(v_nombre, 'desconocido') then
        new.devol_destino := old.devol_destino;
      else
        raise exception 'La devolución ya la confirmó % por el lado de destino; una firma no se reescribe.', old.devol_destino ->> 'por';
      end if;
    else
      if old.estado <> 'Prestado' then
        raise exception 'Solo se confirma la devolución de un préstamo que está entregado (este está %).', lower(old.estado);
      end if;
      if rol <> 'gerente' and not (rol = 'almacen' and mi_obra is not distinct from old.destino) then
        raise exception 'La entrega del material la confirma el almacenero de %, que es quien lo devuelve.', old.destino;
      end if;
      -- SE COMPRUEBA AQUÍ, EN LA PRIMERA FIRMA, y no solo al cerrar.
      -- Sin esto: el destino firma "lo entregué" sin tener el material, el
      -- origen firma después, y la guarda de la migración 73 revienta al
      -- cerrar. A partir de ahí el préstamo NO TIENE SALIDA -- devolver
      -- bloqueado, transferir bloqueado (74), anular bloqueado por la MISMA
      -- guarda de la 73, y la firma puesta no se puede retirar-- y encima se
      -- queda en rojo todos los días sin que nadie pueda quitarlo. Fallar
      -- pronto y con un mensaje claro es mucho mejor que fallar tarde y sin
      -- puerta.
      if public.stock_fisico(old.destino, old.codigo) < old.cant then
        raise exception 'En % ya no quedan % de % para devolver: el material se consumió. Este préstamo no se puede cerrar todavía — queda abierto como deuda entre las dos obras hasta que se liquide. Avisa a gerencia.',
          old.destino, trim(to_char(old.cant, 'FM999999999.999')), old.codigo;
      end if;
      new.devol_destino := jsonb_build_object('por', coalesce(v_nombre, 'desconocido'),
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

  -- ── AÑADIDO (81): 'Devuelto' tampoco se marca a mano ───────
  -- Vale para TODOS los roles, igual que la guarda gemela de 'Prestado' que
  -- hay justo debajo: si viviera dentro de la rama del almacén, gerencia
  -- podría cerrar un préstamo sin que nadie confirmara nada.
  if new.estado = 'Devuelto' and old.estado is distinct from 'Devuelto'
     and (new.devol_origen is null or new.devol_destino is null) then
    raise exception 'Un préstamo se da por devuelto cuando lo confirman los almaceneros de las DOS obras: el que entrega y el que recibe. Falta la confirmación de %.',
      case when new.devol_origen is null then old.origen else old.destino end;
  end if;

  if old.estado = 'Solicitado'
     and new.estado is distinct from old.estado
     and new.estado not in ('Anulado', 'Rechazado') then
    raise exception 'Un préstamo pasa a activo cuando lo aprueban los residentes de las dos obras, no marcándolo a mano.';
  end if;

  -- Con las DOS confirmaciones, el préstamo se cierra solo. Va antes que el
  -- resto para que la guarda de "el destino ya consumió" (trg_prestamos_biu,
  -- que corre después) tenga el estado ya derivado y pueda comprobarlo.
  if old.estado = 'Prestado'
     and new.devol_origen is not null and new.devol_destino is not null then
    new.estado := 'Devuelto';
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
notify pgrst, 'reload schema';

-- ── Comprobación tras correrla ────────────────────────────────
--
-- 0) QUE SE APLICÓ (primero esto, o lo de abajo puede pasar por casualidad
--    sobre la función vieja):
--
--   select column_name from information_schema.columns
--    where table_name = 'prestamos' and column_name in ('devol_origen','devol_destino')
--    order by 1;                        -- ESPERADO: las dos
--   select prosrc like '%devol_destino%' as tiene_la_81
--     from pg_proc where proname = 'trg_prestamo_aprobacion';   -- ESPERADO: true
--
-- 1) CÓMO QUEDÓ CADA PRÉSTAMO. Esto es lo que verá la pantalla:
--
--   select numero, origen, destino, estado,
--          devol_destino ->> 'por' as entrego,
--          devol_origen  ->> 'por' as recibio,
--          case
--            when estado <> 'Prestado'                            then '—'
--            when devol_origen is null and devol_destino is null  then 'sin devolver'
--            when devol_origen is null                            then 'A MEDIAS: falta que ' || origen  || ' confirme que lo recibió'
--            when devol_destino is null                           then 'A MEDIAS: falta que ' || destino || ' confirme que lo entregó'
--            else 'las dos firmas (revisar: deberia estar Devuelto)'
--          end as situacion
--     from public.prestamos
--    order by numero desc;
--
--   Los ya devueltos de antes deben salir con "(histórico)" en las dos
--   columnas. Los activos, con "sin devolver".
--
-- OJO AL CORRER LAS PRUEBAS 2 Y 3: elige UN préstamo y usa su id en las dos.
-- Escritas con dos subconsultas independientes podían caer en préstamos
-- distintos y dar un error confuso que parecía un fallo de la migración:
--
--   select id, numero, origen, destino from public.prestamos
--    where estado = 'Prestado' order by numero limit 1;
--
-- 2) QUE UNA SOLA FIRMA NO CIERRA NADA — es el fallo que motiva la migración.
--    Con la sesión del almacenero del DESTINO, sobre un préstamo 'Prestado':
--
--   begin;
--     select set_config('request.jwt.claims', json_build_object('sub',
--       (select u.id from public.usuarios u
--         where u.rol = 'almacen' and u.activo
--           and u.proyecto_asignado = (select destino from public.prestamos
--                                       where estado = 'Prestado' limit 1)
--         limit 1))::text, true);
--     update public.prestamos set devol_destino = '{}'::jsonb
--      where id = (select id from public.prestamos where estado = 'Prestado' limit 1)
--     returning numero, estado, devol_destino ->> 'por' as firmo;
--   rollback;
--
--   ESPERADO: devuelve 1 fila, `estado` sigue siendo **Prestado** y `firmo` es
--   el nombre REAL del almacenero (no el '{}' que se mandó). Si el estado
--   saliera 'Devuelto', una sola firma estaría cerrando el préstamo y la
--   migración no sirve.
--   Si devuelve 0 filas: no hay ningún préstamo Prestado, no se probó nada.
--
-- 3) QUE CADA UNO SOLO FIRMA SU LADO. Misma sesión (almacén de DESTINO),
--    intentando firmar el lado del origen:
--
--   begin;
--     select set_config('request.jwt.claims', json_build_object('sub',
--       (select u.id from public.usuarios u
--         where u.rol = 'almacen' and u.activo
--           and u.proyecto_asignado = (select destino from public.prestamos
--                                       where estado = 'Prestado' limit 1)
--         limit 1))::text, true);
--     update public.prestamos set devol_origen = '{}'::jsonb
--      where id = (select id from public.prestamos where estado = 'Prestado' limit 1);
--   rollback;
--
--   ESPERADO: error "La vuelta del material la confirma el almacenero de ...".
--
-- 4) QUE 'Devuelto' NO SE MARCA A MANO, con cualquiera de los dos almacenes:
--
--   begin;
--     select set_config('request.jwt.claims', json_build_object('sub',
--       (select id from public.usuarios where rol = 'almacen' and activo limit 1))::text, true);
--     update public.prestamos set estado = 'Devuelto'
--      where id = (select id from public.prestamos where estado = 'Prestado' limit 1);
--   rollback;
--
--   ESPERADO: error "Un préstamo se da por devuelto cuando lo confirman los
--   almaceneros de las DOS obras...".
--
-- 5) QUE LAS DOS FIRMAS SÍ CIERRAN, y que la guarda del consumo sigue viva.
--    En la APLICACIÓN, que es donde importa: el almacenero del destino confirma
--    que entregó, el del origen que recibió, y el préstamo pasa a Devuelto con
--    el stock movido. Y si el destino ya se había gastado el material, la
--    segunda firma debe fallar con "El destino ya consumió el material".
--
-- 6) QUE NO SE ROMPIÓ NADA DE LO ANTERIOR — esto es lo que más cuesta y lo que
--    más importa, porque esta función gobierna TODO el ciclo del préstamo:
--    · pedir un préstamo (nace Solicitado y reserva en el origen)
--    · que los DOS residentes lo aprueben y pase a Prestado moviendo stock
--    · que uno de los dos lo rechace con motivo
--    · anular uno Solicitado y anular uno Prestado, con motivo
--    Todo eso tiene que seguir funcionando igual que esta mañana.
-- ============================================================
