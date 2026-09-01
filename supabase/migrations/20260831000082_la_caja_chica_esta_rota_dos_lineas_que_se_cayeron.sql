-- ============================================================
-- MIGRACIÓN 82 · La caja chica está rota HOY: dos líneas que se cayeron
-- ============================================================
--
-- URGENTE. Los dos fallos de abajo están VIVOS en la base ahora mismo y
-- bloquean el circuito del efectivo de punta a punta. Con datos reales mañana,
-- ninguna de las dos personas que manejan el dinero podría trabajar:
--
--   · Mónica no puede registrar la primera entrega de efectivo del día.
--   · Mónica no puede cerrar NINGÚN arqueo.
--
-- Los encontró un ataque adversarial al módulo de Compras del día (31 ago
-- 2026). Ninguno de los dos había salido en las pruebas, y el motivo importa:
-- los dos se rompieron al REPARAR otra cosa, y en los dos casos la reparación
-- copió las guardas correctamente y se dejó una línea de alrededor.
--
-- ── FALLO 1 · `trg_entrega_caja` perdió su `security definer` ──
--
-- "La entrega abre la jornada" (migración 48): cuando administración registra
-- la primera entrega de efectivo de un día, el trigger CREA la rendición de esa
-- jornada. Ese insert solo funciona con `security definer`, porque la política
-- de la tabla exige otra cosa:
--
--     create policy rendiciones_insert on public.rendiciones
--       for insert to authenticated
--       with check (public.mi_rol() in ('compras','comprador')
--                   and responsable_id = auth.uid());
--
-- El responsable de la rendición es FRANK y quien registra la entrega es
-- MÓNICA, así que la política falla por las dos condiciones a la vez.
--
-- Las migraciones 45, 46 y 48 llevaban `security definer` justo por eso. La 72
-- reescribió la función sin él, y **la 75 —que existe para reparar el daño de
-- la 72— tampoco lo puso**. Restauró las cuatro guardas palabra por palabra y
-- se dejó la línea que las hacía ejecutables.
--
-- EFECTO: la primera entrega del día de cualquier obra revienta con un error de
-- RLS opaco. Sin entrega no hay jornada, y sin jornada el arqueo saca todo el
-- efectivo como faltante. Es la primera acción del día de caja chica.
--
-- ── FALLO 2 · `campos_admin` no conoce las columnas de la 77 ──
--
-- `trg_rendicion_guarda` (migración 37) compara la fila ENTERA menos las
-- columnas que administración sí maneja. Ayer la migración 77 añadió dos
-- columnas al update de `cerrar_con_arqueo`:
--
--     arqueo_por = auth.uid(),
--     arqueo_en  = now(),
--
-- y esa lista no se actualizó. Así que administración cierra el arqueo, el
-- trigger ve dos columnas cambiadas que no reconoce, y lanza:
--
--     "Administración cierra la rendición (arqueo, observación y corrección).
--      Reponer el fondo es del área de pagos."
--
-- Un mensaje que no tiene NADA que ver con lo que pasó, que es lo que hace que
-- este fallo sea especialmente caro de diagnosticar en caliente.
--
-- Y OJO CON EL ORDEN, que es la razón de que la exención de la 77 no salve
-- esto: `rendiciones_guarda` corre ANTES que `zz_arqueo_solo_del_servidor`
-- (orden alfabético), así que la marca `rq.arqueo = '1'` que la 77 usa para
-- identificar sus propios updates llega tarde. La migración 44 documenta este
-- mismo riesgo y por eso su trigger se llama `zz_`.
--
-- EFECTO: NINGÚN día se puede cerrar. El único que podría es gerencia —su rol
-- no entra en esa rama— y eso rompe "gerencia mira, no registra" y deja la
-- alerta de Auditoría firmada por la persona equivocada.
--
-- ESTABA ANOTADO Y NO SE VIO. `docs/ESTADO.md` dice que la 77 se probó a
-- medias: se comprobó el rescate de datos y que la firma no se puede falsear,
-- pero "falta la prueba real —una jornada nueva con descuadre—". Esa prueba que
-- faltaba es exactamente la que revienta. La lección no es que faltara una
-- prueba: es que se dio por buena una migración porque las DOS comprobaciones
-- que sí se hicieron salieron bien.
--
-- ── QUÉ SE LEYÓ ANTES (regla de la casa) ─────────────────────
--
--   · `trg_entrega_caja` se define en las migraciones 38, 45, 46, 48, 72 y 75.
--     La VIVA es la de la **75**, y de esa se parte. El ÚNICO cambio es añadir
--     `security definer`; ni una línea más.
--   · `trg_rendicion_guarda` se define SOLO en la 37 — nadie la ha tocado desde
--     entonces. El ÚNICO cambio son las dos entradas nuevas de `campos_admin`.
--
-- Las dos funciones son independientes entre sí y van juntas porque el fallo es
-- el mismo circuito y hay que probarlas de una pasada.

-- ------------------------------------------------------------
-- 1) LA ENTREGA VUELVE A PODER ABRIR LA JORNADA
-- ------------------------------------------------------------
create or replace function public.trg_entrega_caja()
returns trigger
language plpgsql
security definer                      -- ← LA LINEA QUE SE PERDIO (ver cabecera)
set search_path = public
as $$
declare
  v_nombre text;
  v_quien  uuid;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.entregado_por := auth.uid();
    end if;
    new.anulacion := null;

    if new.fecha > current_date then
      raise exception 'No se puede registrar una entrega con fecha futura.';
    end if;

    if new.fecha < current_date then
      if coalesce(trim(new.motivo_atraso), '') = '' then
        raise exception 'Esta entrega lleva fecha del %, no de hoy. Explica por qué no se registró en su momento: queda anotado con tu nombre.', to_char(new.fecha, 'DD/MM/YYYY');
      end if;
      new.motivo_atraso := trim(new.motivo_atraso);
    else
      new.motivo_atraso := null;
    end if;

    if exists (select 1 from public.rendiciones r
                where r.proyecto = new.proyecto
                  and r.fecha = new.fecha
                  and r.estado <> 'Abierta') then
      raise exception 'La rendición de % del % ya fue cerrada. Agregar una entrega ahí cambiaría un arqueo que administración ya aprobó: coordina con gerencia.', new.proyecto, to_char(new.fecha, 'DD/MM/YYYY');
    end if;

    -- ---- La entrega abre la jornada (migración 48) ----
    -- Quien rinde es quien recibe el dinero. Mientras haya un solo
    -- comprador se resuelve solo; el día que haya varios habrá que
    -- pedirlo en el formulario (la columna `recibido_por` ya existe).
    if not exists (select 1 from public.rendiciones r
                    where r.proyecto = new.proyecto and r.fecha = new.fecha) then
      v_quien := new.recibido_por;
      if v_quien is null then
        select id into v_quien from public.usuarios
         where rol = 'comprador' and activo order by creado_en limit 1;
      end if;
      v_quien := coalesce(v_quien, auth.uid());
      if v_quien is not null then
        insert into public.rendiciones (proyecto, fecha, responsable_id, monto_fondo)
        values (new.proyecto, new.fecha, v_quien, 0);
      end if;
    end if;

    return new;
  end if;

  -- UPDATE: lo único que puede cambiar es la anulación.
  if new.proyecto      is distinct from old.proyecto
  or new.fecha         is distinct from old.fecha
  or new.monto         is distinct from old.monto
  or new.medio         is distinct from old.medio
  or new.num_operacion is distinct from old.num_operacion
  or new.entregado_por is distinct from old.entregado_por then
    raise exception 'Una entrega de efectivo no se edita: el monto, el día, el medio y el número de operación son el rastro que cuadra con el banco. Si está mal, anúlala con motivo y registra la correcta.';
  end if;

  -- (migración 70) Quién recibió y cuándo se registró también son rastro.
  if new.recibido_por is distinct from old.recibido_por
  or new.creado_en    is distinct from old.creado_en then
    raise exception 'Quién recibió el dinero y cuándo se registró la entrega no se editan: son parte del rastro.';
  end if;

  if new.anulacion is distinct from old.anulacion then
    if old.anulacion is not null then
      raise exception 'Esa entrega ya estaba anulada.';
    end if;
    if coalesce(trim(new.anulacion ->> 'motivo'), '') = '' then
      raise exception 'Anular una entrega de efectivo exige explicar por qué.';
    end if;
    select nombre into v_nombre from public.usuarios where id = auth.uid();
    new.anulacion := jsonb_build_object(
      'motivo', trim(new.anulacion ->> 'motivo'),
      'por',    coalesce(v_nombre, 'desconocido'),
      'fecha',  current_date::text);
    -- No se anula la entrega de un día cerrado, salvo por la vía de gerencia
    -- (`corregir_entrega_de_dia_cerrado`, migración 72), que reabre la jornada
    -- en la misma operación para que se vuelva a contar.
    if coalesce(current_setting('rq.arqueo', true), '') <> '1'
       and exists (select 1 from public.rendiciones r
                where r.proyecto = old.proyecto
                  and r.fecha = old.fecha
                  and r.estado <> 'Abierta') then
      raise exception 'La rendición de ese día ya fue cerrada: anular esta entrega cambiaría un arqueo aprobado. Solo gerencia puede corregirlo, y al hacerlo se reabre la jornada para volver a contar el efectivo.';
    end if;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2) ADMINISTRACION PUEDE VOLVER A CERRAR EL ARQUEO
-- ------------------------------------------------------------
create or replace function public.trg_rendicion_guarda()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rol text := coalesce(public.mi_rol(), '');
  -- Administración cierra el día: arqueo, observación y corrección.
  campos_admin text[] := array[
    'estado', 'observacion', 'correccion',
    'efectivo_contado', 'diferencia', 'dif_motivo',
    'aprobado_por', 'fecha_aprobacion',
    -- Las dos que anadio la migracion 77 y que esta lista no conocia. Sin
    -- ellas, cerrar_con_arqueo() -- que las escribe SIEMPRE -- reventaba aqui
    -- y Monica no podia cerrar NINGUN arqueo. Las escribe la base, no el
    -- cliente: `zz_arqueo_solo_del_servidor` lo impide.
    'arqueo_por', 'arqueo_en'
  ];
  -- Pagos solo repone el fondo. Nada más.
  campos_pagos text[] := array[
    'reposicion_operacion', 'reposicion_fecha', 'repuesto_por'
  ];
begin
  -- ---------- Las firmas las pone la base ----------
  -- Quién aprobó se estampa cuando cambia el estado; si no cambia, se
  -- conserva. Un UPDATE que solo toque `aprobado_por` no consigue
  -- nada: era el camino para firmar en nombre de Mónica.
  if new.estado is distinct from old.estado and auth.uid() is not null then
    new.aprobado_por     := auth.uid();
    new.fecha_aprobacion := current_date;
  else
    new.aprobado_por     := old.aprobado_por;
    new.fecha_aprobacion := old.fecha_aprobacion;
  end if;

  -- Quién repuso se estampa cuando se registra la operación bancaria.
  if new.reposicion_operacion is distinct from old.reposicion_operacion
     and new.reposicion_operacion is not null
     and auth.uid() is not null then
    new.repuesto_por := auth.uid();
  else
    new.repuesto_por := old.repuesto_por;
  end if;

  -- ---------- Reglas para todos ----------
  -- El fondo, la obra, el día y el responsable no se cambian nunca:
  -- eso convertiría la rendición del martes en la del miércoles.
  if new.proyecto       is distinct from old.proyecto
  or new.fecha          is distinct from old.fecha
  or new.responsable_id is distinct from old.responsable_id
  or new.monto_fondo    is distinct from old.monto_fondo then
    raise exception 'La obra, la fecha, el responsable y el monto del fondo de una rendición no se modifican.';
  end if;

  -- El fondo se repone contra una rendición APROBADA, no antes. Si
  -- quedó "Con diferencia", primero la resuelve gerencia.
  if new.reposicion_operacion is distinct from old.reposicion_operacion
     and new.reposicion_operacion is not null
     and new.estado <> 'Aprobada' then
    raise exception 'Esta rendición todavía no está aprobada (está %). El fondo se repone después de que administración la cierre y, si hay diferencia, de que gerencia la resuelva.', new.estado;
  end if;

  -- Una reposición ya hecha no se reescribe: es una operación
  -- bancaria real y su número es el que cuadra con el banco.
  if old.reposicion_operacion is not null
     and new.reposicion_operacion is distinct from old.reposicion_operacion then
    raise exception 'Esta rendición ya fue repuesta con la operación %. Si hubo un error, avisa a gerencia.', old.reposicion_operacion;
  end if;

  -- ---------- Qué toca cada rol ----------
  if rol = 'administracion' then
    if (to_jsonb(new) - campos_admin) is distinct from (to_jsonb(old) - campos_admin) then
      raise exception 'Administración cierra la rendición (arqueo, observación y corrección). Reponer el fondo es del área de pagos.';
    end if;
    -- Una diferencia que excede la tolerancia la resuelve gerencia:
    -- no la cierra quien tiene que explicarla. Es la regla de la
    -- migración 27, que hasta hoy vivía solo en la pantalla.
    if old.estado = 'Con diferencia' and new.estado <> old.estado then
      raise exception 'Esta rendición quedó con una diferencia de caja: la resuelve gerencia, no administración.';
    end if;

  elsif rol = 'pagos' then
    if (to_jsonb(new) - campos_pagos) is distinct from (to_jsonb(old) - campos_pagos) then
      raise exception 'El área de pagos solo registra la reposición del fondo (banco, número de operación y fecha). Aprobar la rendición es de administración.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists rendiciones_guarda on public.rendiciones;
create trigger rendiciones_guarda
  before update on public.rendiciones
  for each row execute function public.trg_rendicion_guarda();

notify pgrst, 'reload schema';

-- ── Comprobación tras correrla ────────────────────────────────
--
-- 0) QUE LAS DOS LÍNEAS ESTÁN. Es literalmente lo que se cayó:
--
--   select proname, prosecdef as tiene_security_definer
--     from pg_proc where proname = 'trg_entrega_caja';
--   -- ESPERADO: true. Si sale false, la migración no se aplicó.
--
--   select prosrc like '%arqueo_por%' as campos_admin_al_dia
--     from pg_proc where proname = 'trg_rendicion_guarda';
--   -- ESPERADO: true.
--
-- 1) LA PRUEBA DE VERDAD ES EN LA APLICACIÓN, y son cinco minutos. Las dos
--    cosas que hoy están rotas, en orden:
--
--    a) Con la cuenta de ADMINISTRACIÓN (Mónica), en Pagos: registrar una
--       entrega de efectivo a una obra **en un día que no tenga jornada
--       abierta todavía**. Hoy eso revienta con un error de RLS.
--       ESPERADO: se registra, y aparece la jornada de esa obra y ese día.
--
--    b) Con la misma cuenta, en Rendiciones: cerrar el arqueo de esa jornada
--       contando el efectivo. Hoy eso revienta diciendo "Administración cierra
--       la rendición... Reponer el fondo es del área de pagos", que no tiene
--       nada que ver.
--       ESPERADO: la jornada se cierra.
--
--    c) Y el caso que la migración 77 nunca llegó a probar: cerrar un arqueo
--       con una diferencia que EXCEDA la tolerancia de la obra.
--       ESPERADO: la jornada queda "Con diferencia" para que la resuelva
--       gerencia, y `arqueo_por` guarda a MÓNICA (no a gerencia), que es todo
--       el propósito de la 77.
--
--       select fecha, proyecto, estado, efectivo_contado, diferencia,
--              (select nombre from public.usuarios where id = arqueo_por) as conto,
--              (select nombre from public.usuarios where id = aprobado_por) as aprobo
--         from public.rendiciones order by fecha desc limit 5;
--
-- 2) QUE NO SE ABRIÓ NADA DE MÁS con el `security definer`. La función corre
--    ahora con los permisos de su dueño, así que conviene mirar que sigue
--    haciendo solo lo suyo: valida la fecha, exige motivo si la entrega es de
--    un día pasado, y crea la rendición del día si no existe. No toca ninguna
--    otra tabla. (Está a la vista arriba: son 90 líneas.)
--
-- 3) QUE LAS DEMÁS GUARDAS DE RENDICIONES SIGUEN VIVAS. `campos_admin` se
--    amplió con dos columnas que escribe la BASE, no el cliente — el trigger
--    `zz_arqueo_solo_del_servidor` sigue impidiendo que nadie las escriba a
--    mano. Compruébelo, porque es lo único que sostiene la alerta de auditoría:
--
--   begin;
--     select set_config('request.jwt.claims', json_build_object('sub',
--       (select id from public.usuarios where rol = 'administracion' and activo limit 1)
--     )::text, true);
--     set local role authenticated;
--     update public.rendiciones set arqueo_por = null where arqueo_por is not null;
--   rollback;
--
--   ESPERADO: error "Quién contó el efectivo lo firma el sistema al cerrar el
--   arqueo: no se escribe a mano."
--
-- ── LO QUE ESTA MIGRACIÓN NO ARREGLA, y sale del mismo ataque ─
--   · Se puede aprobar una jornada SIN contar el efectivo: con la jornada
--     abierta, "Observar" y después "Guardar corrección y aprobar" la deja
--     Aprobada con `efectivo_contado` nulo y `arqueo_por` nulo — así que la
--     alerta de "entregó y arqueó la misma persona" tampoco salta. Es el mismo
--     agujero que la migración 67 vino a cerrar, por otra puerta.
--   · Nada avisa a Frank de cuánto efectivo le queda al registrar una compra.
--   · Si Mónica cierra la jornada y Frank compra después, Frank queda atrapado
--     el resto del día sin poder registrar esa factura.
--   Los tres están anotados en ESTADO.md. Ninguno impide arrancar; los dos de
--   arriba sí.
-- ============================================================
