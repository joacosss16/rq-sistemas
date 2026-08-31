-- ============================================================
-- MIGRACIÓN 79 · La verificación del uso se cierra, y deja la hora
-- ============================================================
--
-- PEDIDO DEL DUEÑO, 31 ago 2026, después de mirar la pantalla del almacenero:
-- "Salidas registradas hace ruido". Y tiene razón: esa tabla lo enseña TODO
-- para siempre —lo verificado hace dos meses junto a lo que llegó hoy—, así
-- que el almacenero tiene que buscar su trabajo dentro de su propio historial.
--
-- La tabla debería ser una BANDEJA: lo que falta por hacer. Lo hecho, archivado
-- detrás de un clic. Para eso hay que poder responder "¿esto ya está cerrado?",
-- y hoy la base no lo sabe en un caso concreto:
--
--     Salieron 10, se usaron mal, volvieron 3.
--     ¿Los 7 que faltan van a volver, o se perdieron?
--
-- Nadie lo ha dicho nunca. Sin ese dato, o se archiva material que todavía
-- puede volver, o se deja a la vista para siempre algo que ya terminó. Las dos
-- cosas están mal, y la segunda es el ruido que hay que quitar.
--
-- LO QUE SE AÑADE, y por qué cada cosa:
--
--   · `reingreso_cerrado` — el almacenero DECLARA que no espera más material.
--     No se deduce: se pregunta. Cuando registra que vuelven 3 de 10, él ya
--     sabe si el resto está tirado en obra o se perdió; es información que
--     tiene en la mano en ese momento y que hoy se tira a la basura.
--
--   · `uso_en` y `reingreso_en` — la HORA de cada acción, no solo el día.
--     Pedido explícito del dueño, para auditoría. El reingreso guardaba
--     `fecha` (un día suelto) y la verificación del uso no guardaba NADA: no
--     se podía saber si el almacenero verificó al recibir el parte o tres
--     semanas después, que es justo lo que distingue un control de un trámite.
--
-- LAS TRES LAS PONE EL SERVIDOR. Es la lección de las migraciones 41, 55, 66,
-- 70 y 77, y aquí importa igual: `reingreso_cerrado` decide si una salida
-- desaparece de la bandeja de alguien. Un dato que el navegador puede escribir
-- no es una declaración, es una sugerencia.
--
-- QUÉ SE LEYÓ ANTES DE ESCRIBIR ESTO (regla de la casa). Las dos funciones que
-- se reemplazan tienen su versión VIVA en la migración 78, corrida hoy mismo:
-- `reingresar_material` nació allí, y `trg_salida_aprobacion` se reescribió
-- allí por cuarta vez (18 → 36 → 41 → 69 → 78). Se parte de ESA, no de la 69.
--
-- ------------------------------------------------------------
-- 1) LAS TRES COLUMNAS
-- ------------------------------------------------------------
alter table public.salidas
  add column if not exists uso_en           timestamptz,
  add column if not exists reingreso_en     timestamptz,
  add column if not exists reingreso_cerrado boolean not null default false;

comment on column public.salidas.reingreso_cerrado is
  'El almacenero declaró que no espera que vuelva más material de esta salida. Lo pone reingresar_material(), nunca el cliente. Con esto la salida sale de la bandeja de verificación.';
comment on column public.salidas.uso_en is
  'Cuándo se verificó el uso, con hora. Lo estampa el trigger. Distinto de la fecha de la salida: mide cuánto tarda el almacén en revisar lo que entregó.';

-- ------------------------------------------------------------
-- 2) LO QUE SE PUEDE DAR POR CERRADO DEL PASADO, Y LO QUE NO
-- ------------------------------------------------------------
-- Si ya volvió TODO lo que salió, no puede volver más: eso está cerrado y se
-- puede afirmar sin preguntar a nadie.
update public.salidas
   set reingreso_cerrado = true
 where not reingreso_cerrado
   and cant_reingresada >= cant;

-- Lo que NO se toca, a propósito: las de uso incorrecto con reingreso parcial
-- o sin reingreso. Nadie ha declarado nunca si esperaba más material, y
-- suponerlo sería inventar. Se quedan en la bandeja hasta que alguien lo diga.
--
-- Y las HORAS del pasado no se rellenan: no existen. Poner la fecha a mediodía
-- para que "quede bonito" sería fabricar un dato de auditoría, que es peor que
-- no tenerlo. Quedan nulas y la pantalla dirá "sin hora registrada".

-- ------------------------------------------------------------
-- 3) EL REINGRESO, CON SU HORA Y SU CIERRE
-- ------------------------------------------------------------
-- Copiada ENTERA de la migración 78 (su única definición viva) con dos
-- añadidos: el parámetro `p_cerrar` y el sello de la hora. Todo lo demás queda
-- palabra por palabra, incluidos el `for update` que impide que dos reingresos
-- se pisen y el filtro por obra que repone lo que la RLS no cubre en una
-- función `security definer`.
--
-- `p_cant` puede ser 0 SOLO si `p_cerrar` es true: es el camino de "no va a
-- volver nada". Así no hace falta una segunda función que repita las seis
-- guardas de arriba — y una guarda repetida es una guarda que algún día se
-- corrige en un sitio y no en el otro.
create or replace function public.reingresar_material(
  p_salida uuid, p_cant numeric, p_cerrar boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sa      record;
  v_ya    numeric;
  v_total numeric;
  v_rol   text := coalesce(public.mi_rol(), '');
begin
  if v_rol not in ('almacen', 'gerente') then
    raise exception 'El reingreso a stock lo registra el almacenero de la obra.';
  end if;
  if p_cant is null or p_cant < 0 then
    raise exception 'La cantidad que vuelve al almacén no puede ser negativa.';
  end if;
  if p_cant = 0 and not coalesce(p_cerrar, false) then
    raise exception 'O vuelve material, o se declara que no volverá: un reingreso de cero sin cerrar no dice nada.';
  end if;

  select * into sa from public.salidas where id = p_salida for update;
  if not found then raise exception 'Esa salida no existe.'; end if;

  if v_rol = 'almacen' and sa.proyecto is distinct from public.mi_proyecto() then
    raise exception 'Esa salida es de otra obra (%): cada almacén registra lo suyo.', sa.proyecto;
  end if;

  if sa.anulacion is not null then
    raise exception 'Esa salida está anulada: el material ya volvió al stock entero cuando se anuló.';
  end if;
  if sa.aprobacion <> 'Aprobada' then
    raise exception 'Esa salida está %: no puede volver material de algo que no salió del almacén.', lower(sa.aprobacion);
  end if;
  if sa.uso <> 'Incorrecto' then
    raise exception 'Solo se reingresa a stock lo de una salida verificada como uso incorrecto.';
  end if;

  v_ya    := coalesce(sa.cant_reingresada, 0);
  v_total := v_ya + p_cant;

  if v_total > sa.cant then
    raise exception
      'No pueden volver %: salieron % y ya se devolvieron %, así que como mucho pueden volver %.',
      trim(to_char(p_cant,   'FM999999999.999')), trim(to_char(sa.cant, 'FM999999999.999')),
      trim(to_char(v_ya,     'FM999999999.999')), trim(to_char(sa.cant - v_ya, 'FM999999999.999'));
  end if;

  -- La marca que le dice al trigger "estas columnas vienen de aquí, déjalas
  -- pasar". Mismo mecanismo que `rq.arqueo` en la migración 77.
  perform set_config('rq.reingreso', '1', true);

  update public.salidas
     set cant_reingresada  = v_total,
         reingreso_en      = now(),
         -- Si volvió todo, está cerrado por aritmética: no puede volver más.
         -- Si no, se cierra solo cuando la persona lo dice.
         reingreso_cerrado = (v_total >= sa.cant) or coalesce(p_cerrar, false)
   where id = p_salida;

  perform set_config('rq.reingreso', '', true);

  return jsonb_build_object(
    'devueltoAhora', p_cant, 'yaHabia', v_ya, 'total', v_total,
    'salio', sa.cant, 'puedeVolver', sa.cant - v_total,
    'completo', v_total >= sa.cant,
    'cerrado', (v_total >= sa.cant) or coalesce(p_cerrar, false));
end;
$$;

-- La firma vieja (dos parámetros) se retira: si se quedara, una llamada
-- antigua entraría por ella y nunca cerraría nada, en silencio.
drop function if exists public.reingresar_material(uuid, numeric);
revoke all on function public.reingresar_material(uuid, numeric, boolean) from public, anon;
grant execute on function public.reingresar_material(uuid, numeric, boolean) to authenticated;

-- ------------------------------------------------------------
-- 4) LA GUARDA, CON LA HORA DEL USO Y LAS COLUMNAS PROTEGIDAS
-- ------------------------------------------------------------
-- Reescrita ENTERA desde su versión VIVA —la migración 78, de hoy— con DOS
-- añadidos marcados. Todo lo demás queda palabra por palabra: los tres
-- añadidos de la 69, los tres de la 78, las dos firmas y las guardas de rol.
create or replace function public.trg_salida_aprobacion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rol text := coalesce(public.mi_rol(), '');
  v_nombre text;
  campos_almacen   text[] := array['uso', 'motivo_uso', 'uso_en', 'cant_reingresada', 'reingreso', 'reingreso_en', 'reingreso_cerrado', 'anulacion'];
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
    raise exception 'El reingreso no se puede reducir: ese material ya volvió al almacén. Si se registró de más, anula la salida y regístrala bien.';
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

  -- ── (78) AÑADIDO 5: el uso se verifica sobre lo que SALIÓ ───
  if new.uso is distinct from old.uso and auth.uid() is not null then
    if new.aprobacion <> 'Aprobada' then
      raise exception 'Esa salida está %: el uso se verifica sobre material que salió del almacén, no sobre una salida sin aprobar.', lower(new.aprobacion);
    end if;
    -- ── (78) AÑADIDO 6: y no se re-verifica ──────────────────
    if old.uso <> 'Pendiente' then
      raise exception 'El uso de esa salida ya se verificó como %: no se cambia. Si se registró mal, anula la salida con motivo y regístrala de nuevo.', lower(old.uso);
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
-- 1) Las columnas y la función nueva existen, y la firma vieja ya no:
--
--   select column_name from information_schema.columns
--    where table_name = 'salidas'
--      and column_name in ('uso_en','reingreso_en','reingreso_cerrado')
--    order by 1;                          -- ESPERADO: las tres
--
--   select pg_get_function_identity_arguments(oid) from pg_proc
--    where proname = 'reingresar_material';
--   -- ESPERADO: UNA sola fila, "uuid, numeric, boolean". Si salen dos, la
--   -- vieja quedó viva y las llamadas antiguas no cerrarían nada.
--
-- 2) Cómo quedó la bandeja del almacenero (esto es lo que verá en pantalla):
--
--   select s.numero, s.proyecto, s.aprobacion, s.uso, s.cant,
--          s.cant_reingresada, s.reingreso_cerrado, s.uso_en,
--          case
--            when s.anulacion is not null                     then 'archivada: anulada'
--            when s.aprobacion = 'Rechazada'                  then 'archivada: rechazada'
--            when s.uso = 'Correcto'                          then 'archivada: uso correcto'
--            when s.uso = 'Incorrecto' and s.reingreso_cerrado then 'archivada: reingreso cerrado'
--            when s.uso = 'Pendiente'                         then 'BANDEJA: falta verificar el uso'
--            else                                                  'BANDEJA: falta cerrar el reingreso'
--          end as donde
--     from public.salidas s
--    order by s.proyecto, s.numero;
--
-- 3) QUE EL CIERRE NO SE PUEDE FALSEAR, con la sesión de un almacenero. Es la
--    guarda que sostiene todo: sin ella, cualquiera vacía su bandeja sin
--    devolver un tornillo.
--
--   begin;
--     select set_config('request.jwt.claims', json_build_object('sub',
--       (select id from public.usuarios where rol = 'almacen' and activo limit 1)
--     )::text, true);
--     set local role authenticated;
--     update public.salidas set reingreso_cerrado = true
--      where uso = 'Incorrecto' and not reingreso_cerrado;
--   rollback;
--
--   ESPERADO: error "El cierre del reingreso lo registra el sistema...".
--
-- 4) QUE LA HORA DEL USO NO SE ESCRIBE A MANO, misma sesión:
--
--   begin;
--     select set_config('request.jwt.claims', json_build_object('sub',
--       (select id from public.usuarios where rol = 'almacen' and activo limit 1)
--     )::text, true);
--     set local role authenticated;
--     update public.salidas set uso_en = '2020-01-01'::timestamptz
--      where uso <> 'Pendiente';
--   rollback;
--
--   ESPERADO: pasa sin error PERO no cambia nada — el trigger repone el valor
--   anterior. Compruébalo leyendo la fila dentro de la misma transacción antes
--   del rollback; `uso_en` debe seguir como estaba.
--
-- 5) LOS DOS CAMINOS NUEVOS, sobre una salida aprobada con uso Incorrecto de
--    10 unidades (desde el SQL Editor, identificándose como su almacenero):
--
--   select public.reingresar_material('<uuid>', 3, false);
--   -- ESPERADO: total 3, cerrado = false. Sigue en la bandeja.
--   select public.reingresar_material('<uuid>', 2, true);
--   -- ESPERADO: total 5, cerrado = TRUE. Sale de la bandeja con 5 sin volver.
--
--   Y el camino de "no va a volver nada", sobre otra salida:
--   select public.reingresar_material('<uuid2>', 0, true);
--   -- ESPERADO: total 0, cerrado = true.
--   select public.reingresar_material('<uuid2>', 0, false);
--   -- ESPERADO: error "O vuelve material, o se declara que no volverá...".
--
-- 6) LA PRUEBA DE VERDAD, EN LA APLICACIÓN: verificar un uso correcto y ver
--    que la salida desaparece de la bandeja; marcar uno incorrecto, decir que
--    NO habrá reingreso y ver que también desaparece; y hacer un reingreso
--    parcial diciendo que puede volver más, y ver que se QUEDA.
-- ============================================================
