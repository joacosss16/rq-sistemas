-- ============================================================
-- MIGRACIÓN 80 · Anular una salida verificada infla el stock
--                (y la corrección que eso obliga a dar)
-- ============================================================
--
-- LO ENCONTRÓ EL DUEÑO, 31 ago 2026, probando la pantalla — no salió del
-- ataque al código, que revisó esta misma función y no lo vio.
--
-- EL FALLO. Anular una salida hace que `stock()` deje de restarla, o sea
-- DEVUELVE al almacén lo que salió y no volvió. Eso es correcto cuando la
-- salida se registró por error y el material nunca se movió. Pero si el uso YA
-- se verificó, ese material se consumió (uso correcto) o se perdió (incorrecto
-- sin recuperar), y devolverlo INVENTA existencias:
--
--     Salen 10. Se verifican como uso correcto: se gastaron en la obra.
--     Alguien anula la salida → esas 10 vuelven al stock.
--     Diez unidades que no están en ningún estante.
--
-- Y es peor que un descuadre normal, porque NO deja negativo: deja el stock
-- INFLADO, que es el error que nadie va a buscar. Un negativo salta a la vista
-- y manda a contar; un sobrante se descubre el día que hace falta el material
-- y no está.
--
-- (La cuenta exacta es (cant − cant_reingresada), no `cant`: `stock()` ya resta
-- solo lo que no volvió. Por eso el ejemplo usa un uso CORRECTO, donde no hay
-- reingreso y vuelven las diez. Una primera versión de esta cabecera dijo que
-- una salida de 10 con 5 recuperados metía 10 al stock; mete 5. Importa porque
-- la comprobación 1 manda revisar las filas heredadas con el almacenero, y con
-- el número equivocado el ajuste de inventario sale mal.)
--
-- ── LO QUE EL ATAQUE A ESTA MIGRACIÓN OBLIGÓ A AÑADIR ────────
--
-- La primera versión solo ponía la prohibición, y creaba una trampa peor que el
-- fallo: "Correcto uso" se marca con UN CLIC, sin confirmación, en una tabla
-- larga. Un clic en la fila equivocada dejaba esa salida CONGELADA MAL PARA
-- SIEMPRE — no se podía re-verificar (migración 78), ni anular (esta), ni
-- reingresar (`reingresar_material` exige uso Incorrecto). Y el mensaje que
-- bloqueaba la re-verificación mandaba, con todas sus letras, a "anula la
-- salida y regístrala de nuevo": la misma función prescribía 43 líneas después
-- lo que ella misma prohibía. Es la enfermedad del "Transferir al costo" que la
-- migración 74 dejó abierta y que seguimos arrastrando.
--
-- Así que la migración trae TRES cosas, no una:
--
--   1. La prohibición (AÑADIDO 9 y 10).
--   2. `corregir_uso()`: el camino que faltaba. Devuelve el uso a 'Pendiente'
--      con motivo y firma. Es SEGURO para el inventario porque `stock()` NO
--      MIRA `uso` — verificar o des-verificar no mueve ni una unidad; solo
--      cambia lo que se sabe de ese material.
--   3. Los mensajes reescritos, para que ninguno mande a una puerta tapiada.
--
-- LA EXCEPCIÓN de la prohibición: si volvió TODO (cant_reingresada = cant),
-- anular no devuelve nada y se permite. Sin esa excepción la regla sería más
-- ancha que el daño que dice evitar.
--
-- QUÉ SE LEYÓ ANTES (regla de la casa). `trg_salida_aprobacion` va por su
-- SÉPTIMA versión: 18 → 36 → 41 → 69 → 78 → 79 → 80. La VIVA es la de la 79,
-- de hoy mismo, y de esa se parte. Se copia entera; los cambios son los cinco
-- marcados: AÑADIDO 9, 10 y 11, más los mensajes de los AÑADIDOS 3 y 6 —esos
-- dos SÍ se reescriben a propósito, porque prescribían acciones que esta misma
-- migración deja imposibles— y `uso_correcciones` en `campos_almacen`.

-- ------------------------------------------------------------
-- 1) DÓNDE VIVE EL RASTRO DE LA CORRECCIÓN
-- ------------------------------------------------------------
-- Una lista, no un valor: se puede corregir más de una vez y ninguna
-- corrección debe borrar a la anterior. Mismo patrón que
-- `rq_items.correcciones` (migración 35).
alter table public.salidas
  add column if not exists uso_correcciones jsonb not null default '[]'::jsonb;

comment on column public.salidas.uso_correcciones is
  'Historial de verificaciones de uso deshechas: [{de, motivo, por, fecha}]. Lo escribe corregir_uso(), nunca el cliente.';

-- ------------------------------------------------------------
-- 2) CORREGIR UNA VERIFICACIÓN DE USO
-- ------------------------------------------------------------
-- Devuelve la salida a "por verificar". No toca stock ni puede tocarlo: el
-- `uso` no entra en la fórmula de `stock()`.
--
-- EXIGE que no haya habido reingreso. Si volvió material, ese movimiento SÍ
-- tocó el stock y no se deshace por aquí: eso se corrige con una salida nueva
-- por la diferencia, que es lo que dice el mensaje del AÑADIDO 3.
create or replace function public.corregir_uso(
  p_salida uuid, p_motivo text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  sa       record;
  v_rol    text := coalesce(public.mi_rol(), '');
  v_nombre text;
begin
  if v_rol not in ('almacen', 'gerente') then
    raise exception 'La verificación de uso la corrige el almacenero de la obra.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Corregir una verificación exige explicar por qué: queda registrado con tu nombre y la fecha.';
  end if;

  select * into sa from public.salidas where id = p_salida for update;
  if not found then raise exception 'Esa salida no existe.'; end if;

  -- Igual que en `recibir_material` y `reingresar_material`: al ser una función
  -- SECURITY DEFINER se pierde la política RLS de la tabla, así que el filtro
  -- por obra hay que reponerlo a mano (lección de la migración 75).
  if v_rol = 'almacen' and sa.proyecto is distinct from public.mi_proyecto() then
    raise exception 'Esa salida es de otra obra (%): cada almacén corrige lo suyo.', sa.proyecto;
  end if;

  if sa.anulacion is not null then
    raise exception 'Esa salida está anulada: ya no admite cambios.';
  end if;
  if sa.uso = 'Pendiente' then
    raise exception 'Esa salida todavía está por verificar: no hay nada que corregir.';
  end if;
  if coalesce(sa.cant_reingresada, 0) > 0 then
    raise exception 'Esa salida ya tiene % devueltos al almacén, y eso sí movió stock: no se deshace por aquí. Si la cantidad devuelta está mal, se corrige con una salida nueva por la diferencia.',
      trim(to_char(sa.cant_reingresada, 'FM999999999.999'));
  end if;

  select nombre into v_nombre from public.usuarios where id = auth.uid();

  perform set_config('rq.corregir_uso', '1', true);
  update public.salidas
     set uso               = 'Pendiente',
         motivo_uso        = null,
         reingreso_cerrado = false,
         uso_correcciones  = coalesce(uso_correcciones, '[]'::jsonb) || jsonb_build_object(
           'de',     sa.uso,
           'motivo', trim(p_motivo),
           'por',    coalesce(v_nombre, 'desconocido'),
           'fecha',  now())
   where id = p_salida;
  perform set_config('rq.corregir_uso', '', true);

  return jsonb_build_object('de', sa.uso, 'salida', sa.numero, 'hoja', sa.hoja_trabajo);
end;
$fn$;

revoke all on function public.corregir_uso(uuid, text) from public, anon;
grant execute on function public.corregir_uso(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 3) LA GUARDA, CON LA PROHIBICIÓN Y SU PUERTA DE SALIDA
-- ------------------------------------------------------------
create or replace function public.trg_salida_aprobacion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rol text := coalesce(public.mi_rol(), '');
  v_nombre text;
  campos_almacen   text[] := array['uso', 'motivo_uso', 'uso_en', 'uso_correcciones', 'cant_reingresada', 'reingreso', 'reingreso_en', 'reingreso_cerrado', 'anulacion'];
  campos_residente text[] := array['aprobacion', 'motivo_rechazo', 'aprobado_por', 'fecha_aprobacion'];
begin
  -- ── (69) AÑADIDO 1: una anulación no se borra ───────────────
  if old.anulacion is not null and new.anulacion is null then
    raise exception 'Una salida anulada no se des-anula: el material ya volvió al stock y la anulación tiene motivo y firma. Si hace falta sacarlo otra vez, registra una salida nueva.';
  end if;
  if old.anulacion is not null
     and (to_jsonb(new) - array['anulacion', 'actualizado_en']) is distinct from (to_jsonb(old) - array['anulacion', 'actualizado_en']) then
    raise exception 'Esa salida está anulada: no admite cambios.';
  end if;

  -- ── (69) AÑADIDO 2: la decisión solo se toma una vez ────────
  if new.aprobacion is distinct from old.aprobacion
     and old.aprobacion <> 'Pendiente'
     and auth.uid() is not null then
    raise exception 'Esta salida ya fue %: una decisión no se cambia. Si hay que revertirla, se anula con motivo y se registra de nuevo.', lower(old.aprobacion);
  end if;

  -- ── (69) AÑADIDO 3: el reingreso no retrocede ───────────────
  if coalesce(new.cant_reingresada, 0) < coalesce(old.cant_reingresada, 0)
     and auth.uid() is not null then
    raise exception 'El reingreso no se puede reducir: ese material ya volvió al almacén. Si se registró de más, el stock queda inflado y se corrige con una salida nueva por la diferencia, firmada por el residente: así queda el rastro de los dos movimientos.';
  end if;

  -- ── AÑADIDO 7 (79): la hora del uso la pone la base ─────────
  -- Va ANTES de estampar nada más porque `uso_en` entra en la comparación de
  -- columnas de más abajo. Si el uso cambia, se sella; si no cambia, se
  -- conserva lo que hubiera. Nunca lo escribe el cliente.
  if new.uso is distinct from old.uso and auth.uid() is not null then
    new.uso_en := now();
  else
    new.uso_en := old.uso_en;
  end if;

  -- ── AÑADIDO 8 (79): el cierre del reingreso viene de la función ──
  -- `reingreso_cerrado` decide si la salida desaparece de la bandeja del
  -- almacenero, y `reingreso_en` es su hora. Fuera de reingresar_material()
  -- no se tocan: si se pudieran escribir a mano, cualquiera vaciaría su
  -- bandeja de trabajo sin devolver un solo tornillo.
  if coalesce(current_setting('rq.reingreso', true), '') <> '1'
     and auth.uid() is not null
     and (new.reingreso_cerrado is distinct from old.reingreso_cerrado
       or new.reingreso_en      is distinct from old.reingreso_en) then
    raise exception 'El cierre del reingreso lo registra el sistema cuando el almacenero declara si volverá más material; no se escribe a mano.';
  end if;

  -- ── (78) AÑADIDO 4: la firma del reingreso la pone la base ──
  if coalesce(new.cant_reingresada, 0) > coalesce(old.cant_reingresada, 0)
     and auth.uid() is not null then
    select nombre into v_nombre from public.usuarios where id = auth.uid();
    new.reingreso := jsonb_build_object(
      'cant',  new.cant_reingresada,
      'por',   coalesce(v_nombre, 'desconocido'),
      'fecha', current_date::text);
  elsif new.reingreso is distinct from old.reingreso
        and auth.uid() is not null then
    raise exception 'El rastro del reingreso lo escribe el sistema cuando el material vuelve al almacén; no se edita por separado.';
  end if;

  -- AÑADIDO 11 (80): la correccion del uso entra por su funcion.
  -- `corregir_uso()` devuelve el uso a 'Pendiente' y marca este ajuste para
  -- pasar por delante del ANADIDO 6, que si no lo bloquearia. Mismo mecanismo
  -- que `rq.reingreso`. Fuera de esa funcion la regla sigue entera.
  if coalesce(current_setting('rq.corregir_uso', true), '') = '1' then
    new.uso_en := null;
    return new;
  end if;

  -- ── (78) AÑADIDO 5: el uso se verifica sobre lo que SALIÓ ───
  if new.uso is distinct from old.uso and auth.uid() is not null then
    if new.aprobacion <> 'Aprobada' then
      raise exception 'Esa salida está %: el uso se verifica sobre material que salió del almacén, no sobre una salida sin aprobar.', lower(new.aprobacion);
    end if;
    -- ── (78) AÑADIDO 6: y no se re-verifica ──────────────────
    if old.uso <> 'Pendiente' then
      raise exception 'El uso de esa salida ya se verificó como %: no se cambia a mano. Si te equivocaste de fila, usa "Corregir verificación" y explica por qué: la salida vuelve a quedar por verificar y queda el rastro.', lower(old.uso);
    end if;
  end if;

  if new.motivo_uso is distinct from old.motivo_uso
     and new.uso is not distinct from old.uso
     and auth.uid() is not null then
    raise exception 'El motivo del uso incorrecto se escribe al verificar, no se edita después.';
  end if;

  -- ── (78) AÑADIDO 7: rechazar exige motivo, sea quien sea ───
  if new.aprobacion is distinct from old.aprobacion
     and new.aprobacion = 'Rechazada'
     and coalesce(trim(new.motivo_rechazo), '') = ''
     and auth.uid() is not null then
    raise exception 'Rechazar una salida exige explicar por qué: el almacenero necesita saber qué corregir.';
  end if;

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
    -- AÑADIDO 9 (80): anular solo ANTES de verificar el uso.
    -- Anular hace que `stock()` deje de restar (cant - cant_reingresada), o sea
    -- DEVUELVE lo que salio y no volvio. Si el uso ya se verifico, ese material
    -- se consumio o se perdio, y devolverlo INVENTA existencias.
    -- LA EXCEPCION IMPORTA: si volvio TODO, `stock()` ya restaba cero, asi que
    -- anular no devuelve nada y no hay dano. Sin ella la regla seria mas ancha
    -- que el dano que dice evitar, y una guarda que estorba sin motivo es una
    -- guarda que la gente aprende a rodear.
    if old.uso <> 'Pendiente'
       and coalesce(old.cant_reingresada, 0) < old.cant
       and auth.uid() is not null then
      raise exception 'Esa salida ya tiene el uso verificado como % y quedan % sin devolver: anularla metería ese material al stock sin que exista en ningún estante. Si te equivocaste al verificar, usa "Corregir verificación" primero.',
        lower(old.uso), trim(to_char(old.cant - coalesce(old.cant_reingresada, 0), 'FM999999999.999'));
    end if;
    -- AÑADIDO 10 (80): una rechazada nunca movio stock.
    -- Va numerado a proposito: una regla sin numero es una regla que la
    -- proxima reescritura de esta funcion no sabe que debe conservar, y asi
    -- fue como se rompio la migracion 72.
    if old.aprobacion = 'Rechazada' and auth.uid() is not null then
      raise exception 'Esa salida está rechazada: el residente no la autorizó y nunca salió material, así que no hay nada que anular. (Si acabas de pulsar anular sobre una que estaba pendiente, es que el residente la rechazó mientras tanto.)';
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
notify pgrst, 'reload schema';

-- ── Comprobación tras correrla ────────────────────────────────
--
-- 0) QUE LA MIGRACIÓN SE APLICÓ. Sin esto, las pruebas de abajo podrían pasar
--    por casualidad sobre la función vieja:
--
--   select proname from pg_proc where proname = 'corregir_uso';
--   select column_name from information_schema.columns
--    where table_name = 'salidas' and column_name = 'uso_correcciones';
--   select prosrc like '%AÑADIDO 10%' as tiene_la_80
--     from pg_proc where proname = 'trg_salida_aprobacion';
--   -- ESPERADO: la función, la columna, y true.
--
-- 1) ¿HAY YA SALIDAS ANULADAS DESPUÉS DE VERIFICAR EL USO? Serían inventario
--    inflado de antes de esta regla. La migración NO las arregla. Cada fila
--    infló el stock de su obra en (cant − cant_reingresada) unidades — ese es
--    el número que hay que llevarle al almacenero, NO `cant`:
--
--   select numero, proyecto, codigo, uso,
--          cant - coalesce(cant_reingresada, 0) as unidades_inventadas,
--          anulacion ->> 'por' as anulo, anulacion ->> 'fecha' as cuando
--     from public.salidas
--    where anulacion is not null and uso <> 'Pendiente'
--      and cant - coalesce(cant_reingresada, 0) > 0
--    order by proyecto, numero;
--
--   ESPERADO: 0 filas.
--
-- 2) QUE LAS GUARDAS MUERDEN **Y QUE LA PRUEBA TOCÓ UNA FILA DE VERDAD**.
--    Esto último es la mitad que faltaba en la primera versión: un UPDATE que
--    afecta a 0 filas no lanza error, así que "pasó sin error" podía significar
--    "no se probó nada". Cada bloque revienta si no encuentra sobre qué probar.
--
--   -- (a) anular una YA VERIFICADA con material sin devolver -> DEBE FALLAR
--   do $t$
--   declare v_id uuid;
--   begin
--     perform set_config('request.jwt.claims', json_build_object('sub',
--       (select id from public.usuarios where rol = 'almacen' and activo limit 1))::text, true);
--     select id into v_id from public.salidas
--      where uso <> 'Pendiente' and anulacion is null
--        and cant - coalesce(cant_reingresada,0) > 0
--        and proyecto = public.mi_proyecto() limit 1;
--     if v_id is null then
--       raise notice 'PRUEBA NO EJECUTADA: no hay ninguna salida asi en esta obra';
--     else
--       begin
--         update public.salidas set anulacion = '{"motivo":"prueba 80"}'::jsonb where id = v_id;
--         raise notice 'FALLO: la guarda NO mordio';
--       exception when others then raise notice 'OK, mordio: %', sqlerrm;
--       end;
--     end if;
--     raise exception 'rollback a proposito';
--   end $t$;
--   -- ESPERADO: 'OK, mordio: Esa salida ya tiene el uso verificado como ...'.
--   -- Si dice 'PRUEBA NO EJECUTADA', no has probado nada: crea el caso primero.
--
--   -- (b) anular una SIN verificar -> DEBE SEGUIR FUNCIONANDO (camino legítimo)
--   do $t$
--   declare v_id uuid;
--   begin
--     perform set_config('request.jwt.claims', json_build_object('sub',
--       (select id from public.usuarios where rol = 'almacen' and activo limit 1))::text, true);
--     select id into v_id from public.salidas
--      where uso = 'Pendiente' and anulacion is null and aprobacion = 'Aprobada'
--        and proyecto = public.mi_proyecto() limit 1;
--     if v_id is null then
--       raise notice 'PRUEBA NO EJECUTADA: no hay ninguna salida aprobada sin verificar';
--     else
--       update public.salidas set anulacion = '{"motivo":"prueba 80 camino legitimo"}'::jsonb where id = v_id;
--       raise notice 'OK: el camino legitimo sigue abierto';
--     end if;
--     raise exception 'rollback a proposito';
--   end $t$;
--   -- ESPERADO: 'OK: el camino legitimo sigue abierto'. Cualquier otra cosa
--   -- significa que la migración rompió el trabajo del almacén: NO seguir.
--
-- 3) LA CORRECCIÓN DEL USO, que es la parte nueva y la que evita la trampa:
--
--   -- sobre una salida verificada SIN reingreso:
--   select public.corregir_uso('<uuid>', 'me equivoqué de fila');
--   select uso, uso_en, uso_correcciones from public.salidas where id = '<uuid>';
--   -- ESPERADO: uso = 'Pendiente', uso_en = null, y una entrada en el historial
--   -- con el nombre REAL de quien corrigió y la hora.
--
--   -- sobre una CON reingreso -> DEBE FALLAR:
--   select public.corregir_uso('<uuid con cant_reingresada > 0>', 'prueba');
--   -- ESPERADO: 'Esa salida ya tiene N devueltos al almacén...'.
--
-- 4) EN LA APLICACIÓN: que el almacenero siga anulando salidas sin verificar,
--    que en las verificadas lea que no se anulan, y que pueda corregir una
--    verificación equivocada y volver a marcarla bien.
--
-- ── LA PANTALLA QUE ACOMPAÑA A ESTA MIGRACIÓN ────────────────
--   `corregir_uso()` YA tiene botón: "↺ Corregir verificación", en la columna
--   de acción de cada salida ya verificada, y solo mientras no haya vuelto
--   material. Van juntos en el mismo commit a propósito: sin el botón, el
--   mensaje que dice "usa Corregir verificación" apuntaría a algo que el
--   almacenero no ve — exactamente el error que esta migración vino a quitar.
-- ============================================================
