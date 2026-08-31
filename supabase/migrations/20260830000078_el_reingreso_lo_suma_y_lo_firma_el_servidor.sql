-- ============================================================
-- MIGRACIÓN 78 · El reingreso lo suma y lo firma el servidor,
--                y el uso se verifica una sola vez
-- ============================================================
--
-- Tres agujeros del módulo de Almacén, los tres en la misma tabla y dos de
-- ellos en la misma función. Van juntos a propósito: `trg_salida_aprobacion`
-- se reescribe ENTERA (en PL/pgSQL no se parchea un trozo), y reescribirla dos
-- veces en dos sesiones distintas es exactamente lo que pasó con la migración
-- 72 —copiada de una versión vieja, veinte hallazgos esa tarde—.
--
-- ── A) EL REINGRESO MANDA EL TOTAL DESDE EL NAVEGADOR ────────
--
-- Es la migración 71 otra vez, en la operación de al lado. La pantalla no manda
-- lo que se devuelve al almacén: manda el TOTAL acumulado, calculado con el
-- número que tenía en memoria (`src/vistas/Almacen.jsx`):
--
--     const total = Number(sa.reingresada || 0) + cant;
--     api.updSalida(sa.id, { cant_reingresada: total, ... })
--
-- Dos personas devolviendo material de la misma salida con pantallas
-- desincronizadas:
--
--     Salieron 20, se usaron mal. El almacenero registra que vuelven 3
--     → la base guarda 3.
--     Otro, con la pantalla sin refrescar (creía 0), registra que vuelven 5
--     → manda 0 + 5 = 5. La base guarda 5.
--     Volvieron 8 al estante. El sistema dice 5. Tres se pierden.
--
-- Y no salta nada: 5 es mayor que 3 (pasa el añadido 3 de la migración 69, "el
-- reingreso no retrocede") y menor que 20 (pasa `chk_reingreso_rango`). Ningún
-- error, ningún aviso, ningún rastro. Aparece semanas después en un conteo.
--
-- El caso inverso —que el segundo mande un total MENOR— sí lo atrapa la 69,
-- pero con un mensaje que culpa a quien no tiene culpa: "El reingreso no se
-- puede reducir: ese material ya volvió al almacén."
--
-- LA CORRECCIÓN, la misma que la 71: que viaje lo que se devuelve —el
-- incremento— y que sume la base bloqueando la fila. `select ... for update`
-- serializa a los dos que llegan a la vez, y el segundo trabaja sobre lo que
-- el primero acaba de escribir.
--
-- ── B) LA FIRMA DEL REINGRESO LA ESCRIBE EL NAVEGADOR ────────
--
-- El jsonb `reingreso` viaja entero desde la pantalla, con el nombre y la
-- fecha puestos por el cliente:
--
--     reingreso: { cant: total, por: user.nombre, fecha: HOY_ISO }
--
-- La base nunca lo reconstruye: en las migraciones 17, 36, 41 y 69 la columna
-- `reingreso` solo aparece dentro de `campos_almacen`. Se puede firmar con el
-- nombre de otro y con la fecha que se quiera, y la pantalla lo muestra tal
-- cual ("↩ 5 UND reingresado a stock (Fulano)").
--
-- Contradice de frente el principio que la migración 41 escribió para el caso
-- gemelo: "anular una salida aprobada DEVUELVE material al stock, así que es la
-- firma que menos puede venir del navegador". **El reingreso también devuelve
-- material al stock.** Se le da el mismo trato que a la anulación.
--
-- ── C) LA VERIFICACIÓN DE USO NO TIENE NINGUNA GUARDA ────────
--
-- Buscando `new.uso` en las 77 migraciones solo aparece en la 17 (para el
-- reingreso) y dentro de las listas de columnas. No existe ninguna regla que
-- diga que el uso se marca sobre una salida que de verdad SALIÓ, ni que la
-- verificación no se rehaga. Lo único que hay en la base es
-- `chk_uso check (uso <> 'Incorrecto' or motivo_uso is not null)`.
--
-- La pantalla sí lo comprueba (`sa.aprobacion === 'Aprobada' && sa.uso ===
-- 'Pendiente'`), y ya sabemos lo que vale eso: la migración 75 tuvo que bajar a
-- la base la validación de cantidades enteras porque "una regla que solo vive
-- en la pantalla se salta — y de hecho se saltaba".
--
-- Qué deja pasar: marcar como mal usado material de una salida PENDIENTE o
-- RECHAZADA —material que nunca salió del almacén— y rehacer la verificación
-- de Correcto a Incorrecto y vuelta, borrando el motivo anterior sin rastro.
-- Además envenena los indicadores del propio módulo: el % de uso incorrecto y
-- el desglose por causa filtran por 'Aprobada' en el navegador, pero la fila
-- sucia se queda en la base para siempre.
--
-- ── D) RECHAZAR SIN MOTIVO, Y QUIÉN PUEDE RECHAZAR ──────────
--
-- Dos mitades del mismo agujero, encontradas en la misma auditoría.
--
-- D.1 · La guarda que exige el motivo al rechazar vive DENTRO de la rama del
-- residente, así que gerencia y compras rechazan con el motivo vacío. Es
-- literalmente el error que la migración 69 corrigió para el caso de
-- re-decidir —"antes esta guarda vivía dentro de la rama del residente, así
-- que compras y gerencia caían fuera"— y que en el motivo se quedó sin
-- corregir. Efecto: el almacenero ve su salida rechazada sin una palabra, no
-- sabe qué arreglar, y vuelve a pedirla igual.
--
-- D.2 · La política RLS de la migración 18 deja que **compras** apruebe y
-- rechace salidas y préstamos de CUALQUIER obra:
--
--     or public.mi_rol() in ('gerente','compras')
--
-- Gerencia sí es deliberado: es la red para el día que una obra no tenga
-- residente dado de alta, y tiene pantalla para hacerlo (Aprobaciones, que se
-- le abre sin obra propia). Compras no: no aparece justificado en ninguna
-- migración, y su rol ni siquiera tiene la pestaña —sus vistas son Compras,
-- Catálogo y Tablero—. Es un permiso latente que nadie usa y que rompe la
-- regla del negocio: quien aprueba una salida es el residente de esa obra.
--
-- DECISIÓN DEL DUEÑO, 31 ago 2026: quitárselo. Se le retira en salidas Y en
-- préstamos, que es el mismo agujero por la puerta de al lado.
--
-- LO QUE COMPRAS NO PIERDE: la LECTURA. `salidas_select` y `prestamos_select`
-- son políticas aparte y no se tocan — las necesita para el consolidado por
-- comprar, que mira el stock de todas las obras antes de mandar comprar.
--
-- QUÉ NO SE TOCA, a propósito: todos los caminos legítimos. El almacenero
-- sigue verificando el uso de una salida aprobada y devolviendo a stock lo
-- recuperable; el residente sigue aprobando y rechazando; la anulación sigue
-- igual. Ninguna pantalla cambia de sitio.

-- ------------------------------------------------------------
-- 1) LA SUMA DEL REINGRESO, EN EL SERVIDOR
-- ------------------------------------------------------------
-- Calcada de `recibir_material` (migraciones 71 → 75 → 76), incluida la
-- lección de la 75: al mover una operación a una función `security definer` se
-- pierde la política RLS de la tabla —estas funciones corren como su dueño—,
-- así que el filtro por obra hay que reponerlo A MANO. Sin esta línea, el
-- almacenero de MAIA reingresa material de DANAUS.
create or replace function public.reingresar_material(
  p_salida uuid, p_cant numeric
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
  if p_cant is null or p_cant <= 0 then
    raise exception 'La cantidad que vuelve al almacén tiene que ser mayor que cero.';
  end if;

  -- El bloqueo: quien llegue segundo espera aquí y, cuando entra, ya ve lo que
  -- escribió el primero. Es la pieza que impide que se pisen.
  select * into sa from public.salidas where id = p_salida for update;
  if not found then raise exception 'Esa salida no existe.'; end if;

  -- Cada almacenero, solo lo de su obra. Gerencia, en cualquiera.
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

  -- `reingreso` NO se arma aquí: lo estampa el trigger (bloque 2, añadido 4),
  -- para que la firma sea la misma venga por esta función o por un UPDATE
  -- directo. Aquí solo se mueve la cantidad.
  update public.salidas
     set cant_reingresada = v_total
   where id = p_salida;

  return jsonb_build_object(
    'devueltoAhora', p_cant, 'yaHabia', v_ya, 'total', v_total,
    'salio', sa.cant, 'puedeVolver', sa.cant - v_total,
    'completo', v_total >= sa.cant);
end;
$$;

revoke all on function public.reingresar_material(uuid, numeric) from public, anon;
grant execute on function public.reingresar_material(uuid, numeric) to authenticated;

-- ------------------------------------------------------------
-- 2) LA GUARDA DE LAS SALIDAS, CON LA FIRMA Y EL USO
-- ------------------------------------------------------------
-- Se reescribe `trg_salida_aprobacion` ENTERA, copiada de su VERSIÓN VIVA —la
-- de la migración 69, NO la de la 41 ni la de la 36, que ya no mandan— con
-- TRES añadidos marcados abajo. Todo lo demás queda palabra por palabra: los
-- tres añadidos de la 69 (la anulación no se borra, la decisión solo se toma
-- una vez, el reingreso no retrocede), la firma de la aprobación (36), la
-- firma de la anulación con su motivo obligatorio (41) y las dos guardas de
-- columnas (el residente solo decide, el almacén solo registra).
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
  -- ── (69) AÑADIDO 1: una anulación no se borra ───────────────
  if old.anulacion is not null and new.anulacion is null then
    raise exception 'Una salida anulada no se des-anula: el material ya volvió al stock y la anulación tiene motivo y firma. Si hace falta sacarlo otra vez, registra una salida nueva.';
  end if;
  -- Y estando anulada, no se le cambia nada más: está cerrada.
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

  -- ── AÑADIDO 4 (78): la firma del reingreso la pone la base ──
  -- Devolver material a stock lo MUEVE, igual que anular. La migración 41 dejó
  -- escrito por qué esa firma no puede venir del navegador; el reingreso se
  -- quedó fuera de aquella pasada. Se arma aquí y no dentro de
  -- `reingresar_material` para que valga también si alguien escribe la columna
  -- por su cuenta: lo que llegue en `reingreso` se descarta siempre.
  if coalesce(new.cant_reingresada, 0) > coalesce(old.cant_reingresada, 0)
     and auth.uid() is not null then
    select nombre into v_nombre from public.usuarios where id = auth.uid();
    new.reingreso := jsonb_build_object(
      'cant',  new.cant_reingresada,
      'por',   coalesce(v_nombre, 'desconocido'),
      'fecha', current_date::text);
  elsif new.reingreso is distinct from old.reingreso
        and auth.uid() is not null then
    -- Tocar el rastro sin devolver material es intentar reescribir la firma.
    raise exception 'El rastro del reingreso lo escribe el sistema cuando el material vuelve al almacén; no se edita por separado.';
  end if;

  -- ── AÑADIDO 5 (78): el uso se verifica sobre lo que SALIÓ ───
  -- Fuera de las ramas de rol, como enseñó el añadido 2 de la 69: una guarda
  -- metida dentro de `if rol = ...` deja fuera a los demás roles.
  if new.uso is distinct from old.uso and auth.uid() is not null then
    if new.aprobacion <> 'Aprobada' then
      raise exception 'Esa salida está %: el uso se verifica sobre material que salió del almacén, no sobre una salida sin aprobar.', lower(new.aprobacion);
    end if;
    -- ── AÑADIDO 6 (78): y no se re-verifica ──────────────────
    if old.uso <> 'Pendiente' then
      raise exception 'El uso de esa salida ya se verificó como %: no se cambia. Si se registró mal, anula la salida con motivo y regístrala de nuevo.', lower(old.uso);
    end if;
  end if;

  -- El motivo del uso incorrecto se escribe al verificar, con la decisión. Si
  -- se pudiera editar después, la decisión sería reversible por la puerta de
  -- atrás: mismo `uso`, otra explicación.
  if new.motivo_uso is distinct from old.motivo_uso
     and new.uso is not distinct from old.uso
     and auth.uid() is not null then
    raise exception 'El motivo del uso incorrecto se escribe al verificar, no se edita después.';
  end if;

  -- ── AÑADIDO 7 (78): rechazar exige motivo, sea quien sea ───
  -- La misma guarda existe abajo, dentro de la rama del residente, y ahí se
  -- queda —no se quita nada de la versión viva—. Pero metida solo ahí dejaba
  -- fuera a gerencia y a compras, que es el error que la 69 ya corrigió para
  -- el caso de re-decidir y que aquí se quedó pendiente. Una salida rechazada
  -- sin motivo deja al almacenero sin saber qué arreglar.
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

-- El trigger ya existe con este nombre desde la migración 36 y apunta a esta
-- misma función; `create or replace` basta y no hay que recrearlo. Se deja la
-- comprobación abajo por si alguna base quedó sin él.

-- ------------------------------------------------------------
-- 3) COMPRAS NO APRUEBA SALIDAS NI PRÉSTAMOS
-- ------------------------------------------------------------
-- Las dos políticas se copian de su VERSIÓN VIVA —la migración 18, que nadie
-- ha vuelto a tocar— palabra por palabra, con un único cambio: `compras` sale
-- de la lista. Todo lo demás idéntico, incluido que gerencia se queda.
--
-- OJO: solo se toca el UPDATE. `salidas_select` y `prestamos_select` siguen
-- exactamente como están (migración 2), así que compras conserva la lectura
-- que necesita para el consolidado por comprar.
drop policy if exists salidas_update on public.salidas;
create policy salidas_update on public.salidas
  for update to authenticated
  using (
    (public.mi_rol() in ('almacen','residente') and proyecto = public.mi_proyecto())
    or public.mi_rol() = 'gerente'
  )
  with check (
    (public.mi_rol() in ('almacen','residente') and proyecto = public.mi_proyecto())
    or public.mi_rol() = 'gerente'
  );

drop policy if exists prestamos_update on public.prestamos;
create policy prestamos_update on public.prestamos
  for update to authenticated
  using (
    (public.mi_rol() in ('almacen','residente')
     and (origen = public.mi_proyecto() or destino = public.mi_proyecto()))
    or public.mi_rol() = 'gerente'
  )
  with check (
    (public.mi_rol() in ('almacen','residente')
     and (origen = public.mi_proyecto() or destino = public.mi_proyecto()))
    or public.mi_rol() = 'gerente'
  );

notify pgrst, 'reload schema';

-- ── Comprobación tras correrla ────────────────────────────────
--
-- 1) La función nueva existe y los cuatro guardias de salidas siguen en pie:
--
--   select proname from pg_proc where proname = 'reingresar_material';
--
--   select tgname from pg_trigger
--    where tgrelid = 'public.salidas'::regclass and not tgisinternal
--    order by tgname;
--   -- ESPERADO, en este orden: salidas_aprobacion_guard, salidas_bu,
--   -- salidas_reingreso_guard, zz_salida_revalida_al_aprobar
--   -- (más aa_congelar_unidad y salidas_nace_pendiente, que son de INSERT).
--
-- 2) ¿Hay datos imposibles de antes de estas reglas? Los tres deben dar 0:
--
--   -- uso verificado sobre una salida que nunca se aprobó:
--   select numero, proyecto, aprobacion, uso from public.salidas
--    where uso <> 'Pendiente' and aprobacion <> 'Aprobada';
--
--   -- reingreso sobre una salida no aprobada o anulada:
--   select numero, proyecto, aprobacion, cant_reingresada from public.salidas
--    where coalesce(cant_reingresada, 0) > 0
--      and (aprobacion <> 'Aprobada' or anulacion is not null);
--
--   -- rastro de reingreso sin cantidad devuelta:
--   select numero, cant_reingresada, reingreso from public.salidas
--    where reingreso is not null and coalesce(cant_reingresada, 0) = 0;
--
--   Si alguna devuelve filas, NO las arregla esta migración: son de antes y
--   hay que mirarlas con el almacenero antes de tocarlas.
--
-- 3) QUE LA FIRMA NO SE PUEDE FALSEAR, con la sesión de un almacenero y una
--    salida suya con uso Incorrecto:
--
--   update public.salidas
--      set cant_reingresada = coalesce(cant_reingresada,0) + 1,
--          reingreso = '{"cant":99,"por":"Edwin Salas","fecha":"2020-01-01"}'
--    where id = '<uuid>';
--   -- ESPERADO: se guarda, pero leyendo la fila después `reingreso` tiene el
--   -- nombre REAL del almacenero, la fecha de HOY y la cantidad REAL.
--
--   update public.salidas set reingreso = '{"cant":1,"por":"X","fecha":"2020-01-01"}'
--    where id = '<uuid>';
--   -- ESPERADO: error "El rastro del reingreso lo escribe el sistema...".
--
-- 4) QUE EL USO NO SE INVENTA NI SE REHACE, misma sesión:
--
--   update public.salidas set uso = 'Incorrecto', motivo_uso = 'prueba'
--    where id = '<uuid de una salida PENDIENTE de aprobación>';
--   -- ESPERADO: error "Esa salida está pendiente: el uso se verifica sobre
--   -- material que salió del almacén...".
--
--   update public.salidas set uso = 'Correcto'
--    where id = '<uuid de una salida ya verificada como Incorrecto>';
--   -- ESPERADO: error "El uso de esa salida ya se verificó como incorrecto...".
--
--   update public.salidas set motivo_uso = 'otra cosa'
--    where id = '<uuid de una salida ya verificada como Incorrecto>';
--   -- ESPERADO: error "El motivo del uso incorrecto se escribe al verificar...".
--
-- 4bis) RECHAZAR SIN MOTIVO, con la sesión de GERENCIA (no del residente:
--    el residente ya lo tenía prohibido, y ese es justo el punto):
--
--   begin;
--     select set_config('request.jwt.claims', json_build_object('sub',
--       (select id from public.usuarios where rol = 'gerente' and activo limit 1)
--     )::text, true);
--     set local role authenticated;
--     update public.salidas set aprobacion = 'Rechazada'
--      where aprobacion = 'Pendiente';
--   rollback;
--
--   ESPERADO: error "Rechazar una salida exige explicar por qué...".
--   (Si no hay ninguna salida Pendiente el update afecta 0 filas y no salta
--    nada: eso NO es un fallo, es que no había qué rechazar.)
--
-- 4ter) COMPRAS YA NO APRUEBA, PERO SIGUE LEYENDO. Las dos mitades importan:
--
--   begin;
--     select set_config('request.jwt.claims', json_build_object('sub',
--       (select id from public.usuarios where rol = 'compras' and activo limit 1)
--     )::text, true);
--     set local role authenticated;
--     select count(*) from public.salidas;    -- ESPERADO: sigue leyendo
--     update public.salidas set aprobacion = 'Aprobada'
--      where aprobacion = 'Pendiente';        -- ESPERADO: 0 filas (RLS lo tapa)
--   rollback;
--
--   OJO CON CÓMO FALLA: RLS no da error, simplemente no ve la fila. "UPDATE 0"
--   ES el resultado correcto. Si dijera "UPDATE 1", la política no se aplicó.
--
--   Y la comprobación de que compras no se quedó ciego, que es lo que de
--   verdad podría romper su pantalla:
--
--   select polname, polcmd from pg_policy
--    where polrelid in ('public.salidas'::regclass, 'public.prestamos'::regclass)
--    order by polname;
--   -- ESPERADO: siguen existiendo salidas_select y prestamos_select.
--
-- 5) QUE DOS REINGRESOS NO SE PISAN (es el fallo que motiva la migración).
--    En dos pestañas del SQL Editor, sobre la misma salida de 20 con uso
--    Incorrecto y 0 devuelto:
--
--   select public.reingresar_material('<uuid>', 3);   -- devuelve total 3
--   select public.reingresar_material('<uuid>', 5);   -- devuelve total 8, NO 5
--
--   ESPERADO: 8. Antes de esta migración la pantalla mandaba totales y el
--   segundo pisaba al primero dejando 5.
--
-- 6) LA PRUEBA DE VERDAD, EN LA APLICACIÓN (esto es lo que cuenta, y es lo que
--    falta: estas guardas nadie las ha visto dispararse en pantalla):
--    · Almacenero: dar una salida, que el residente la apruebe, marcar uso
--      incorrecto con motivo, reingresar una parte y luego el resto. El total
--      tiene que sumar y el rastro mostrar SU nombre y la fecha de hoy.
--    · Que los botones de "Correcto uso" / "Uso incorrecto" desaparezcan una
--      vez verificado, como hasta ahora.
--    · Anular una salida con motivo: igual que siempre.
--
-- ── PARA EL DUEÑO, una pregunta que esta migración NO decide ──
--    `reingresar_material` admite 'almacen' y 'gerente', igual que
--    `recibir_material` (migraciones 75 y 76). Pero CLAUDE.md dice "Gerencia
--    mira, no registra: no recibe material, no factura, no paga". Las dos
--    cosas no pueden ser ciertas a la vez, y la contradicción es anterior a
--    esta migración —hoy gerencia ya puede hacer las dos por la API, solo que
--    no tiene botón—. Aquí se deja como está para no abrir ni cerrar una
--    puerta de tapadillo. Decidirlo aparte, para las dos funciones a la vez.
-- ============================================================
