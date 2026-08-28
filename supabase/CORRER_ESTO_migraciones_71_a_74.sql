-- ============================================================
-- MIGRACIONES 71 a 74 · 28 ago 2026
--
-- COMO SE CORRE: Ctrl+A, Ctrl+C, y pegar en el editor SQL de Supabase.
-- Van en este orden y en una sola pasada. Si se corre dos veces no hace dano.
--
-- LA MAS URGENTE ES LA 73: la migracion 70 (ya corrida) exige que el banco de
-- la factura coincida con el de la obra, y MONICA NO PUEDE VER CUAL ES. Hasta
-- correr esto, administracion no puede registrar pagos por banco.
--
-- QUE CIERRA CADA UNA:
--   71 · La recepcion suma EN LA BASE. Antes viajaba el total calculado con lo
--        que la pantalla tenia en memoria, asi que dos personas recibiendo el
--        mismo item se pisaban y la primera recepcion desaparecia sin rastro.
--   72 · El callejon de la entrega equivocada: el sistema decia "coordina con
--        gerencia" y gerencia no tenia con que. Ahora puede corregirla, y al
--        hacerlo se reabre la jornada para volver a contar el efectivo.
--   73 · Monica (administracion) ve el banco de la obra · un prestamo
--        Solicitado RESERVA el material en el origen · "el destino ya
--        consumio" mira el stock FISICO y ya no bloquea devoluciones
--        legitimas.
--   74 · "Transferir al costo" queda fuera durante el piloto: las obras son de
--        empresas distintas y hace falta factura entre ellas.
--
-- AL TERMINAR, esta consulta. Los cinco primeros deben dar 1 y los dos
-- ultimos 0. Si alguno de los dos ultimos da algo, mandamelo antes de seguir.
--
--   select
--     (select count(*) from pg_proc   where proname = 'recibir_material')              as m71,
--     (select count(*) from pg_proc   where proname = 'corregir_entrega_de_dia_cerrado') as m72,
--     (select count(*) from pg_proc   where proname = 'stock_fisico')                   as m73_a,
--     (select count(*) from pg_policy where polrelid = 'public.proyectos_banco'::regclass
--        and polname = 'proyectos_banco_select')                                        as m73_b,
--     (select count(*) from pg_trigger where tgname = 'zz_sin_transferir_al_costo')     as m74,
--     (select count(*) from public.prestamos p
--       where p.estado = 'Solicitado' and p.anulacion is null
--         and public.stock(p.origen, p.codigo) < 0)                                     as prometido_dos_veces,
--     (select count(*) from public.salidas
--       where coalesce(cant_reingresada, 0) > cant)                                     as reingresos_imposibles;
-- ============================================================



-- ############################################################
-- ##  MIGRACION 71 · La recepcion suma en el servidor
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
-- ##  MIGRACION 72 · Gerencia puede corregir una entrega de un dia cerrado
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



-- ############################################################
-- ##  MIGRACION 73 · Monica ve el banco · el prestamo solicitado reserva · stock fisico
-- ############################################################

-- ============================================================
-- MIGRACIÓN 73 · Los últimos cabos sueltos
-- ============================================================
--
-- Cierra los cuatro agujeros menores que quedaban de los ataques a Almacén y
-- Pagos, más uno nuevo que apareció al verificarlos y que sí es bloqueante
-- para el piloto.
--
-- ── A) MÓNICA PUEDE PAGAR PERO NO VE EL BANCO ────────────────
--
-- Esto NO es menor: es un bloqueante, y apareció comprobando lo demás.
--
-- La migración 32 cerró `proyectos_banco` a gerencia y pagos, con buen
-- criterio: las cuentas bancarias no tienen por qué estar al alcance de los
-- siete roles. Pero DESPUÉS, la migración 47 le dio a `administracion` el
-- permiso de pagar facturas — y nadie le dio el dato del banco.
--
-- Así que Mónica, que es quien paga de verdad en el día a día, puede ejecutar
-- el pago pero su pantalla ve el banco vacío. Con la migración 70 corriendo,
-- eso ahora además la BLOQUEA: la guarda exige que el banco coincida con el de
-- la obra, y ella no puede saber cuál es.
--
-- Se le da lectura, igual que a pagos. Escribir sigue siendo solo de gerencia.
drop policy if exists proyectos_banco_select on public.proyectos_banco;
create policy proyectos_banco_select on public.proyectos_banco
  for select to authenticated
  using (coalesce(public.mi_rol(), '') in ('gerente', 'pagos', 'administracion'));

-- ── B) UN PRÉSTAMO SOLICITADO RESERVA EL MATERIAL ────────────
--
-- Un préstamo nace 'Solicitado' y no mueve stock hasta que los dos residentes
-- firman — eso está bien—. Pero mientras espera, **no reserva nada**: el mismo
-- material se puede comprometer dos veces, o sacarlo por una salida normal.
--
-- Entonces el error revienta al final y en la cara de quien menos culpa tiene:
-- el residente de destino firma su lado, el sistema intenta mover el material
-- y descubre que ya no está. Lo mismo que hacen las salidas, que reservan
-- desde que nacen Pendientes.
--
-- Se reescribe `stock()` con UN cambio: los préstamos 'Solicitado' descuentan
-- del origen. NO suman al destino —el material todavía no ha llegado— así que
-- una reserva nunca infla el stock de nadie.
create or replace function public.stock(p_proyecto text, p_codigo text)
returns numeric
language sql stable
security definer set search_path = public
as $$
  select
    coalesce((select sum(cant) from stock_inicial
              where proyecto = p_proyecto and codigo = p_codigo), 0)
  + coalesce((select sum(i.cant_recibida)
              from rq_items i join rqs r on r.id = i.rq_id
              where r.proyecto = p_proyecto and i.codigo = p_codigo
                and i.decision = 'Aprobado'), 0)
  - coalesce((select sum(cant - coalesce(cant_reingresada, 0)) from salidas
              where proyecto = p_proyecto and codigo = p_codigo
                and anulacion is null
                and aprobacion in ('Pendiente','Aprobada')), 0)
  + coalesce((select sum(cant) from prestamos
              where destino = p_proyecto and codigo = p_codigo
                and estado in ('Prestado','Transferido')), 0)
  -- El origen descuenta también lo SOLICITADO: es material comprometido,
  -- aunque todavía no haya salido. Así no se promete dos veces.
  - coalesce((select sum(cant) from prestamos
              where origen = p_proyecto and codigo = p_codigo
                and estado in ('Solicitado','Prestado','Transferido')
                and anulacion is null), 0)
$$;

-- ── C) "EL DESTINO YA CONSUMIÓ" MIRABA MAL ───────────────────
--
-- Al devolver o anular un préstamo, el sistema comprueba que el destino
-- todavía tenga el material: si ya se lo gastó, corresponde "Transferir al
-- costo" en vez de devolverlo. La regla es correcta.
--
-- Pero la comprobación usa `stock()`, que descuenta las salidas PENDIENTES —las
-- que solo están reservadas, esperando la firma del residente—. Así que una
-- salida que nadie aprobó todavía, y que puede acabar rechazada, cuenta como
-- material consumido y bloquea una devolución legítima.
--
-- Aquí hace falta el stock FÍSICO: lo que de verdad está en el almacén ahora.
create or replace function public.stock_fisico(p_proyecto text, p_codigo text)
returns numeric
language sql stable
security definer set search_path = public
as $$
  select
    coalesce((select sum(cant) from stock_inicial
              where proyecto = p_proyecto and codigo = p_codigo), 0)
  + coalesce((select sum(i.cant_recibida)
              from rq_items i join rqs r on r.id = i.rq_id
              where r.proyecto = p_proyecto and i.codigo = p_codigo
                and i.decision = 'Aprobado'), 0)
  -- Solo lo que SALIÓ de verdad: una salida pendiente sigue en el almacén.
  - coalesce((select sum(cant - coalesce(cant_reingresada, 0)) from salidas
              where proyecto = p_proyecto and codigo = p_codigo
                and anulacion is null and aprobacion = 'Aprobada'), 0)
  + coalesce((select sum(cant) from prestamos
              where destino = p_proyecto and codigo = p_codigo
                and estado in ('Prestado','Transferido')), 0)
  - coalesce((select sum(cant) from prestamos
              where origen = p_proyecto and codigo = p_codigo
                and estado in ('Prestado','Transferido')), 0)
$$;

comment on function public.stock_fisico(text, text) is
  'Lo que hay FÍSICAMENTE en el almacén ahora: no descuenta las salidas pendientes de aprobación, que siguen ahí. Para decidir si un préstamo se puede devolver. Para saber de cuánto se puede disponer, usar stock().';

-- Y la comprobación del préstamo pasa a usarla. Se reescribe
-- `trg_prestamos_biu` entera copiada de su VERSIÓN VIVA, que es la de la
-- migración 19 —NO la del esquema inicial, que es distinta y ya no manda—,
-- con un único cambio marcado abajo.
--
-- (Escribiendo esta migración estuve a punto de copiar la del esquema inicial,
-- que no revalida el stock al activar el préstamo. Habría borrado esa guarda
-- sin que nada avisara. Por eso la regla de la casa es leer la versión
-- anterior línea por línea antes de reemplazar nada.)
create or replace function public.trg_prestamos_biu()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext(new.origen || '/' || new.codigo));
    if new.cant > stock(new.origen, new.codigo) then
      raise exception 'Stock insuficiente en % para prestar % de %',
        new.origen, new.cant, new.codigo;
    end if;
    return new;
  end if;

  if new.cant     is distinct from old.cant
  or new.codigo   is distinct from old.codigo
  or new.origen   is distinct from old.origen
  or new.destino  is distinct from old.destino then
    raise exception 'Los préstamos no se editan: anular y registrar de nuevo';
  end if;

  -- Solicitado (esperando aprobación) y Prestado (activo) son estados "abiertos"
  if old.estado not in ('Prestado','Solicitado') and new.estado is distinct from old.estado then
    raise exception 'El préstamo ya está cerrado (%)', old.estado;
  end if;

  -- Al activarse (ambos aprobaron), revalida el stock del origen. OJO CON LA
  -- FORMA DE LA COMPROBACIÓN: ahora que un préstamo Solicitado RESERVA, este
  -- préstamo ya está descontado de `stock()`. Preguntar `new.cant > stock()`
  -- lo contaría dos veces y bloquearía activaciones perfectamente legítimas
  -- (30 solicitados sobre 30 de stock darían "no hay suficiente" cuando sí
  -- hay). Lo que hay que comprobar es que la reserva siga cubierta: si algo se
  -- comió el material entre la solicitud y la firma, el stock queda NEGATIVO.
  if new.estado = 'Prestado' and old.estado = 'Solicitado' then
    perform pg_advisory_xact_lock(hashtext(new.origen || '/' || new.codigo));
    if stock(new.origen, new.codigo) < 0 then
      raise exception 'Ya no hay stock suficiente en % para activar el préstamo de %: el material se consumió mientras esperaba la firma.',
        new.origen, new.codigo;
    end if;
  end if;

  if new.estado in ('Devuelto','Anulado') and old.estado = 'Prestado' then
    perform pg_advisory_xact_lock(hashtext(new.destino || '/' || new.codigo));
    -- ÚNICO CAMBIO: stock FÍSICO. Una salida que el residente todavía no
    -- aprobó no es material consumido —sigue en el almacén— y no puede
    -- impedir que se devuelva un préstamo.
    if stock_fisico(new.destino, new.codigo) < new.cant then
      raise exception 'El destino % ya consumió el material: corresponde Transferir al costo',
        new.destino;
    end if;
  end if;

  if new.estado in ('Devuelto','Transferido') and new.fecha_cierre is null then
    new.fecha_cierre := current_date;
  end if;

  return new;
end;
$$;

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) Las dos funciones y la política existen:
--
--   select proname from pg_proc where proname in ('stock', 'stock_fisico') order by 1;
--   select polname from pg_policy
--    where polrelid = 'public.proyectos_banco'::regclass order by 1;
--
-- 2) ¿Alguna obra quedó con stock NEGATIVO al empezar a contar las reservas?
--    Sería material prometido dos veces de antes de esta regla (debe dar 0):
--
--   select p.origen, p.codigo, public.stock(p.origen, p.codigo) as disponible
--     from public.prestamos p
--    where p.estado = 'Solicitado' and p.anulacion is null
--      and public.stock(p.origen, p.codigo) < 0;
--
-- 3) En la aplicación: que Mónica (administración) vea el banco de la obra al
--    pagar, y que un préstamo pendiente de firma ya descuente del disponible
--    de la obra de origen.



-- ############################################################
-- ##  MIGRACION 74 · Sin transferir al costo durante el piloto
-- ############################################################

-- ============================================================
-- MIGRACIÓN 74 · Durante el piloto no se transfiere el costo
-- ============================================================
--
-- DECISIÓN DEL DUEÑO, 28 ago 2026.
--
-- "Transferir al costo" cierra un préstamo dejando el material —y su costo— en
-- la obra que lo recibió. Cuando las dos obras son de la MISMA empresa eso es
-- un movimiento interno y no hay más que hablar.
--
-- Pero las obras de Grupo Copacabana pertenecen a **cuatro razones sociales
-- distintas**. Mover el costo de una empresa a otra sin emitir la factura
-- entre ellas no es un asiento contable válido: para SUNAT es una operación
-- entre contribuyentes diferentes, y necesita su comprobante. El sistema
-- estaba dejando registrar un hecho que la contabilidad no puede respaldar.
--
-- Esto ya estaba anotado como pendiente en CLAUDE.md —"facturación intercompany
-- entre las 4 razones sociales para Transferir al costo"— y sigue pendiente.
-- Hasta que exista, la opción se retira.
--
-- QUÉ PASA ENTONCES CON UN PRÉSTAMO CUYO MATERIAL YA SE CONSUMIÓ. Se queda
-- ABIERTO, en estado 'Prestado', y es lo correcto: refleja la verdad —hay una
-- deuda entre dos obras que todavía no se ha liquidado— en vez de cerrarla con
-- un movimiento que no existe en los libros. Gerencia los ve en su lista y se
-- liquidan todos juntos cuando el mecanismo intercompany esté hecho.
--
-- CÓMO SE VUELVE A HABILITAR, el día que exista: borrar este trigger.
--
--     drop trigger zz_sin_transferir_al_costo on public.prestamos;
--
-- Y no hace falta nada más: el estado 'Transferido' sigue existiendo en el
-- modelo, la pantalla solo tiene el botón oculto, y los préstamos que ya estén
-- transferidos de antes se quedan como están —no se tocan—.

create or replace function public.trg_sin_transferir_al_costo()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;                       -- cargas de datos y mantenimiento
  end if;
  if new.estado = 'Transferido' and old.estado is distinct from 'Transferido' then
    raise exception 'Durante el piloto no se transfiere el costo entre obras: son de empresas distintas y hace falta una factura entre ellas. Si la otra obra ya consumió el material, deja el préstamo abierto y avisa a gerencia.';
  end if;
  return new;
end;
$$;

drop trigger if exists zz_sin_transferir_al_costo on public.prestamos;
create trigger zz_sin_transferir_al_costo
  before update on public.prestamos
  for each row execute function public.trg_sin_transferir_al_costo();

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) El trigger existe:
--
--   select tgname from pg_trigger
--    where tgrelid = 'public.prestamos'::regclass and not tgisinternal
--    order by tgname;
--
-- 2) ¿Hay préstamos ya transferidos de antes? Se quedan como están; esto es
--    solo para saber cuántos son cuando llegue la liquidación intercompany:
--
--   select numero, fecha, origen, destino, codigo, cant, fecha_cierre
--     from public.prestamos where estado = 'Transferido' order by fecha;
--
-- 3) Y los que queden abiertos con el material ya consumido —los que antes se
--    habrían cerrado transfiriendo— son los que hay que vigilar. Gerencia los
--    ve en Almacén; esta consulta los saca de una:
--
--   select p.numero, p.fecha, p.origen, p.destino, p.codigo, p.cant,
--          public.stock_fisico(p.destino, p.codigo) as le_queda_al_destino
--     from public.prestamos p
--    where p.estado = 'Prestado' and p.anulacion is null
--      and public.stock_fisico(p.destino, p.codigo) < p.cant
--    order by p.fecha;
