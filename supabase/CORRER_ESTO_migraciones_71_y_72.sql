-- ============================================================
-- MIGRACIONES 71 y 72 · 28 ago 2026
--
-- COMO SE CORRE: Ctrl+A, Ctrl+C, y pegar en el editor SQL de Supabase.
--
-- QUE CIERRAN:
--   71 · La recepcion de material suma EN LA BASE, no en la pantalla. Antes
--        viajaba el total calculado con lo que la pantalla tenia en memoria,
--        asi que dos personas recibiendo el mismo item se pisaban y la primera
--        recepcion desaparecia sin error ni rastro.
--   72 · El callejon sin salida de la entrega equivocada: el sistema decia
--        "coordina con gerencia" y gerencia no tenia con que. Ahora puede
--        corregirla, y al hacerlo se reabre la jornada para volver a contar.
--        De paso, `recibido_por` y `creado_en` de una entrega dejan de ser
--        editables.
--
-- AL TERMINAR (los cuatro deben dar 1):
--
--   select
--     (select count(*) from pg_proc where proname = 'recibir_material')  as m71,
--     (select count(*) from pg_proc
--       where proname = 'corregir_entrega_de_dia_cerrado')               as m72,
--     (select count(*) from pg_trigger
--       where tgrelid = 'public.entregas_caja'::regclass and not tgisinternal)
--                                                                        as guardias_entregas;
--
-- (el ultimo debe dar 2 o mas: los guardianes de entregas)
-- ============================================================



-- ############################################################
-- ##  MIGRACION 71 · La recepcion suma en el servidor (dos personas ya no se pisan)
-- ############################################################

-- ============================================================
-- MIGRACIÓN 71 · La recepción suma en el servidor
-- ============================================================
--
-- EL FALLO. Al registrar una recepción, la pantalla no manda lo que ACABA de
-- llegar: manda el TOTAL acumulado, calculado con el número que tenía cargado
-- en memoria.
--
--     total = lo que la pantalla creía que había + lo que llegó ahora
--
-- Si dos personas reciben el mismo ítem con pocos minutos de diferencia —el
-- almacenero desde la computadora y Compras desde el celular, o el mismo
-- almacenero con dos pestañas abiertas— la segunda manda un total calculado
-- sobre una foto vieja, y **pisa lo que registró la primera**:
--
--     Pedido 100. El almacenero registra 10 → la base guarda 10.
--     Compras, con la pantalla sin refrescar (creía que había 0), registra 30
--     → manda 0 + 30 = 30. La base guarda 30.
--     Entraron 40 bolsas. El sistema dice 30. Las 10 primeras desaparecen.
--
-- Y no salta ninguna alarma: 30 es mayor que 10 (pasa la regla de "el recibido
-- nunca baja") y menor que 100 (pasa la de sobre-recepción). Ningún error,
-- ningún aviso, ningún rastro. El descuadre aparece semanas después en un
-- conteo de almacén, cuando ya nadie puede reconstruir qué pasó.
--
-- La ventana no es teórica: la pantalla se refresca cada 40 segundos y **solo
-- si está visible**, así que un celular con la pestaña en segundo plano puede
-- tener datos de hace horas.
--
-- LA CORRECCIÓN. Que viaje lo que llegó —el incremento— y que **sume la
-- base**, bloqueando la fila mientras lo hace. Es lo mismo que ya hace la
-- compra parcial desde la migración 61: `select ... for update` serializa a
-- los dos que llegan a la vez, y el segundo trabaja sobre lo que el primero
-- acaba de escribir.
--
-- La observación tenía el mismo problema —se concatenaba sobre el texto de la
-- pantalla, así que la anotación del otro también se perdía— y se arregla
-- igual: se concatena sobre lo que hay en la base.

create or replace function public.recibir_material(
  p_item uuid, p_cant numeric, p_obs text default null, p_caducidad date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it        record;
  v_ya      numeric;
  v_total   numeric;
  v_saldo   boolean;
  v_rol     text := coalesce(public.mi_rol(), '');
begin
  if v_rol not in ('almacen', 'gerente') then
    raise exception 'La recepción de material la registra el almacenero de la obra.';
  end if;
  if p_cant is null or p_cant <= 0 then
    raise exception 'La cantidad que llega tiene que ser mayor que cero.';
  end if;

  -- El bloqueo: quien llegue segundo espera aquí y, cuando entra, ya ve lo que
  -- escribió el primero. Es la pieza que impide que se pisen.
  select * into it from public.rq_items where id = p_item for update;
  if not found then raise exception 'Ese ítem no existe.'; end if;

  if it.decision <> 'Aprobado' then
    raise exception 'Ese ítem está %: no se puede recibir material de algo que no está aprobado.', lower(it.decision);
  end if;

  v_ya    := coalesce(it.cant_recibida, 0);
  v_total := v_ya + p_cant;

  if v_total > it.cant then
    raise exception
      'No se puede recibir %: ya hay % de % recibidos, así que faltan %. Si el proveedor entregó de más, hay que corregirlo con Compras.',
      to_char(p_cant, 'FM999999990.##'), to_char(v_ya, 'FM999999990.##'),
      to_char(it.cant, 'FM999999990.##'), to_char(it.cant - v_ya, 'FM999999990.##');
  end if;

  -- ¿Es el saldo de una entrega incompleta? Se mira el estado REAL de la base,
  -- no el que traía la pantalla.
  v_saldo := (it.estado = 'Incompleto');

  update public.rq_items
     set cant_recibida = v_total,
         -- La fecha del PRIMER lote no se toca nunca; la del saldo se estampa
         -- cuando llega el saldo.
         fecha_entrega       = case when v_saldo then fecha_entrega else coalesce(fecha_entrega, current_date) end,
         fecha_entrega_saldo = case when v_saldo then current_date else fecha_entrega_saldo end,
         -- La observación se concatena sobre lo que HAY EN LA BASE, no sobre
         -- lo que tenía la pantalla: si no, la anotación del otro se pierde.
         obs_almacen = case
           when coalesce(trim(p_obs), '') = '' then obs_almacen
           when coalesce(trim(obs_almacen), '') = '' then trim(p_obs)
           else obs_almacen || ' · ' || trim(p_obs) end,
         -- Perecederos: se conserva la caducidad MÁS PRÓXIMA de todas las
         -- recepciones, que es la que manda para el semáforo.
         fecha_caducidad = case
           when p_caducidad is null then fecha_caducidad
           when fecha_caducidad is null then p_caducidad
           when fecha_caducidad < p_caducidad then fecha_caducidad
           else p_caducidad end
   where id = p_item;

  return jsonb_build_object(
    'recibidoAhora', p_cant, 'yaHabia', v_ya, 'total', v_total,
    'pedido', it.cant, 'falta', it.cant - v_total,
    'completo', v_total >= it.cant);
end;
$$;

revoke all on function public.recibir_material(uuid, numeric, text, date) from public, anon;
grant execute on function public.recibir_material(uuid, numeric, text, date) to authenticated;

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) La función existe:
--
--   select proname from pg_proc where proname = 'recibir_material';
--
-- 2) ¿Hay señales de recepciones que se hayan pisado en el pasado? No se puede
--    saber con certeza —el dato pisado no dejó rastro— pero un ítem
--    'Incompleto' cuyo faltante no cuadre con ninguna entrega parcial
--    razonable es candidato a revisarlo con el almacenero:
--
--   select r.numero rq, i.codigo, i.cant pedido, i.cant_recibida recibido,
--          i.cant - coalesce(i.cant_recibida,0) falta, i.estado, i.obs_almacen
--     from public.rq_items i join public.rqs r on r.id = i.rq_id
--    where i.estado = 'Incompleto'
--    order by r.numero;
--
-- 3) La prueba de verdad, en la aplicación: recibir un lote parcial y luego el
--    saldo. El total tiene que sumar, las dos observaciones tienen que estar,
--    y el ítem pasar de Incompleto a Entregado.



-- ############################################################
-- ##  MIGRACION 72 · Gerencia puede corregir una entrega de un dia ya cerrado
-- ############################################################

-- ============================================================
-- MIGRACIÓN 72 · Gerencia puede corregir una entrega de un día
--                ya cerrado
-- ============================================================
--
-- EL CALLEJÓN SIN SALIDA. Se registra una entrega equivocada a las 6 de la
-- tarde —un monto mal digitado, o una duplicada—. Mónica cierra el arqueo a
-- las 7 sin notarlo, o lo nota y cierra igual porque Frank está esperando para
-- irse. Al día siguiente alguien se da cuenta.
--
-- El sistema responde: *"La rendición de ese día ya fue cerrada: anular esta
-- entrega cambiaría un arqueo aprobado. Coordina con gerencia."*
--
-- Y gerencia **no tiene con qué**. No hay ningún botón, ninguna pantalla,
-- ninguna función. El mensaje manda a una puerta que no existe. La única
-- salida real es entrar a la base a mano, en plena jornada, con el riesgo que
-- eso trae — o dejar el error ahí para siempre, arrastrando un descuadre que
-- nadie sabe explicar.
--
-- La regla que lo bloquea es correcta y no se toca: un arqueo aprobado no
-- cambia solo. Lo que faltaba era la **puerta legítima**, con su llave y su
-- registro.
--
-- CÓMO FUNCIONA. Gerencia —y solo gerencia— anula la entrega con motivo, y el
-- sistema **reabre la jornada de ese día** para que se vuelva a arquear con el
-- dato correcto. Las dos cosas juntas, en una sola operación: dejar la entrega
-- anulada con el arqueo viejo en pie sería peor que el problema original.
--
-- Queda rastro de las dos: el motivo firmado en la entrega, y en la rendición
-- una observación que dice por qué se reabrió y quién lo hizo. El arqueo viejo
-- se borra —porque ya no es cierto— pero la observación cuenta la historia.
--
-- Y OJO CON LO QUE NO HACE: no toca las facturas de ese día ni el efectivo que
-- Frank devolvió. Solo corrige el dato de la entrega y obliga a rehacer la
-- cuenta. Quién puso o se quedó con la diferencia se resuelve hablando, como
-- debe ser; el sistema solo deja de mentir sobre el número.

create or replace function public.corregir_entrega_de_dia_cerrado(
  p_entrega uuid, p_motivo text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e        record;
  r        record;
  v_nombre text;
begin
  if coalesce(public.mi_rol(), '') <> 'gerente' then
    raise exception 'Corregir una entrega de un día ya cerrado es decisión de gerencia: reabre un arqueo aprobado.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Hay que explicar por qué se corrige: es lo que va a leer quien revise ese día dentro de seis meses.';
  end if;

  select * into e from public.entregas_caja where id = p_entrega for update;
  if not found then raise exception 'Esa entrega no existe.'; end if;
  if e.anulacion is not null then
    raise exception 'Esa entrega ya estaba anulada.';
  end if;

  select nombre into v_nombre from public.usuarios where id = auth.uid();

  select * into r from public.rendiciones
   where proyecto = e.proyecto and fecha = e.fecha for update;

  -- Si el día NO está cerrado, esto no hace falta: se anula por la vía normal,
  -- desde la pantalla de Pagos, que es más simple y no reabre nada.
  if not found or r.estado = 'Abierta' then
    raise exception 'La jornada de ese día no está cerrada: anula la entrega desde la pantalla de Pagos, sin reabrir nada.';
  end if;

  -- 1) La entrega queda anulada, firmada por el servidor. La marca le avisa al
  -- guardián de entregas que esta anulación viene por el camino legítimo.
  perform set_config('rq.arqueo', '1', true);

  update public.entregas_caja
     set anulacion = jsonb_build_object(
           'motivo', 'Corrección de gerencia: ' || trim(p_motivo),
           'por',    coalesce(v_nombre, 'desconocido'),
           'fecha',  current_date::text)
   where id = p_entrega;

  -- 2) Y la jornada se reabre, limpiando el arqueo: ya no es cierto, porque
  -- el dinero entregado que decía no era el real. Hay que contarlo de nuevo.
  update public.rendiciones
     set estado           = 'Abierta',
         efectivo_contado = null,
         diferencia       = null,
         dif_motivo       = null,
         aprobado_por     = null,
         fecha_aprobacion = null,
         observacion      = coalesce(observacion || ' · ', '')
           || 'Reabierta el ' || current_date::text || ' por ' || coalesce(v_nombre, 'gerencia')
           || ': se anuló una entrega de S/ ' || to_char(e.monto, 'FM999999990.00')
           || ' (' || trim(p_motivo) || '). Hay que volver a contar el efectivo de este día.'
   where id = r.id;

  perform set_config('rq.arqueo', '', true);

  return jsonb_build_object(
    'entrega', e.numero, 'monto', e.monto, 'proyecto', e.proyecto,
    'fecha', e.fecha, 'rendicion', r.numero, 'estadoAnterior', r.estado);
end;
$$;

revoke all on function public.corregir_entrega_de_dia_cerrado(uuid, text) from public, anon;
grant execute on function public.corregir_entrega_de_dia_cerrado(uuid, text) to authenticated;

-- ── Y el guardián de entregas reconoce el camino legítimo ────
--
-- Se reescribe `trg_entrega_caja` entera (migración 38) con UN cambio: la
-- prohibición de anular una entrega de un día cerrado se exime cuando el
-- cambio viene de la función de arriba. Todo lo demás queda palabra por
-- palabra — sigue sin poderse editar el monto, el día, el medio, el número de
-- operación ni quién entregó; y la firma de la anulación la sigue poniendo la
-- base.
create or replace function public.trg_entrega_caja()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_nombre text;
begin
  if tg_op = 'INSERT' then
    -- Quién entregó es quien tiene la sesión, no lo que diga el
    -- navegador. Y nace sin anulación.
    if auth.uid() is not null then
      new.entregado_por := auth.uid();
    end if;
    new.anulacion := null;
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

  -- NUEVO (migración 70): tampoco se reescriben estas dos, que también son
  -- rastro de lo que pasó.
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
    -- La firma la pone la base
    select nombre into v_nombre from public.usuarios where id = auth.uid();
    new.anulacion := jsonb_build_object(
      'motivo', trim(new.anulacion ->> 'motivo'),
      'por',    coalesce(v_nombre, 'desconocido'),
      'fecha',  current_date::text);
    -- No se anula la entrega de un día que ya se cerró: eso cambiaría el
    -- arqueo de una rendición aprobada. La ÚNICA excepción es la función
    -- `corregir_entrega_de_dia_cerrado`, que es de gerencia y reabre la
    -- jornada en la misma operación para que se vuelva a contar.
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

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) La función existe y el guardián sigue en pie:
--
--   select proname from pg_proc where proname = 'corregir_entrega_de_dia_cerrado';
--   select tgname from pg_trigger
--    where tgrelid = 'public.entregas_caja'::regclass and not tgisinternal
--    order by tgname;
--
-- 2) La prueba de verdad, en la aplicación y en este orden:
--    · Pagos anula una entrega de HOY (jornada abierta) → tiene que funcionar
--      igual que siempre, sin reabrir nada.
--    · Administración cierra una jornada. Pagos intenta anular una entrega de
--      ese día → tiene que salir el mensaje nuevo.
--    · Gerencia usa la corrección → la entrega queda anulada, la jornada
--      vuelve a 'Abierta' con su observación explicando por qué, y hay que
--      volver a contar el efectivo.
