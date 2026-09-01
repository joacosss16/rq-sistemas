-- ============================================================
-- MIGRACIÓN 83 · Dos controles del dinero que no controlaban nada
-- ============================================================
--
-- Salen de los ataques a PAGOS y a COMPRAS DEL DÍA (31 ago 2026). Los dos son
-- del mismo tipo: una regla que existe, que la gente cree que le protege, y que
-- se salta por un camino que la propia pantalla ofrece. Ninguno impide
-- trabajar, y por eso son más difíciles de ver que los dos de la migración 82:
-- aquellos se notaban al instante, estos no se notan nunca.
--
-- ── 1 · LA FECHA DE PAGO NO LA VALIDABA NADIE ────────────────
--
-- El campo de la pantalla tiene `max` con la fecha de hoy, pero **no hay
-- formulario**, así que ese atributo no rechaza nada: se teclea el año y pasa.
-- Es literalmente lo que la migración 75 documentó para `min` y `step` ("los
-- atributos solo valen si hay envío de formulario, y aquí no lo hay. Se
-- registraron 2.5 tornillos en una prueba real").
--
-- Y en la base no había NINGUNA comprobación: solo
-- `new.fecha_pago := coalesce(new.fecha_pago, current_date)`, que acepta lo que
-- llegue. El contraste lo dice todo: la ENTREGA de efectivo sí tiene guarda de
-- fecha futura desde la migración 45. El pago, que mueve mucho más dinero, no.
--
-- QUÉ PASA CON UN PAGO FECHADO EN 2027:
--   · No sale en el CSV de conciliación de ninguna semana real.
--   · NO dispara la alerta de "sin conciliar hace 14+ días": esa alerta compara
--     los días transcurridos contra un umbral, y con una fecha que todavía no
--     ha llegado esa cuenta nunca alcanza el umbral.
--   · Y NO TIENE CORRECCIÓN: una factura pagada queda congelada y
--     `anular_factura` rechaza las pagadas.
-- Desaparece del control de gerencia, en silencio y para siempre, por un
-- dedazo en el año.
--
-- Se añade también que el pago no sea anterior a la factura, que es el otro
-- extremo del mismo dedazo. SE COMPROBÓ que eso no rompe el compromiso de
-- crédito —donde la factura llega después del pago—: al convertir el
-- compromiso, `pagarFactura` no manda `fecha`, así que la de la factura sigue
-- siendo la del registro, anterior al pago.
--
-- ── 2 · LA CONCILIACIÓN "EXCLUSIVA DE GERENCIA" SE SALTABA ───
--
-- `trg_facturas_bu` tiene al final la guarda "la conciliación bancaria es
-- exclusiva de gerencia". Pero antes hay tres `return new`, y DOS de ellos son
-- exactamente las operaciones que hace ADMINISTRACIÓN: pagar un compromiso
-- (digitando la serie real) y completar la serie de una factura pendiente.
--
-- Un update que incluya `conciliada = true` por esos caminos pasaba la guarda,
-- y el trigger de firma le estampaba obedientemente `conciliada_por` y la
-- fecha.
--
-- Y había una segunda mitad, que el ataque encontró: **la guarda del final solo
-- miraba el booleano**. Aunque `conciliada` quede sellada, `conciliada_por` y
-- `fecha_conciliacion` seguían escribiéndose por el camino normal — o sea, se
-- podía falsear o BORRAR quién concilió una factura ya conciliada. Y una
-- factura con `conciliada_por` nulo desaparece de la consulta de auditoría, que
-- la busca por ese join. Ahora la guarda mira las tres.
--
-- Importa porque Mónica concentra el circuito entero —entrega el efectivo,
-- cierra el arqueo, ejecuta el pago (migración 47)— y la conciliación contra el
-- extracto es EL ÚNICO control que le queda a gerencia sobre eso.
--
-- Es el patrón de las migraciones 69 y 78: la guarda quedó al final y las ramas
-- salieron por delante.
--
-- (La TERCERA rama temprana, la de anulación, NO necesita el arreglo: ya tiene
-- su propia guarda de columnas que impide tocar cualquier otro dato. Se
-- comprobó antes de tocar nada.)
--
-- DECISIÓN CONSCIENTE: en las dos ramas de conversión el valor se PISA en
-- silencio, no se rechaza. Choca con la regla de la casa de "nunca edición
-- silenciosa", y se hace así a propósito: esas ramas las recorre la pantalla de
-- administración en cada pago de compromiso, y lanzar una excepción ahí
-- convertiría un intento improbable en un botón roto para todos. Lo que se
-- pierde es un acto que nadie tiene motivo legítimo para intentar por ese
-- camino: gerencia concilia por el suyo, que no se ha tocado.
--
-- ── LO QUE SE QUITÓ DE ESTA MIGRACIÓN, Y POR QUÉ ─────────────
--
-- La primera versión traía un tercer arreglo: impedir aprobar una jornada de
-- caja sin haber contado el efectivo. El agujero es real —con la jornada
-- abierta, "Observar" y después "Guardar corrección y aprobar" la deja
-- Aprobada con `efectivo_contado` NULO, y eso apaga hasta la alerta de
-- auditoría, que mira `arqueo_por`— pero la guarda tal como estaba escrita
-- habría dejado ese botón FALLANDO EL 100% DE LAS VECES desde el primer día:
--
--   · "Observar" solo se ofrece sobre una jornada 'Abierta'.
--   · Una 'Abierta' SIEMPRE tiene el efectivo sin contar.
--   · Luego una 'Observada' nunca puede cumplir la condición.
--
-- Y contar primero no es una salida: `cerrar_con_arqueo` saca la jornada de
-- 'Observada' y el cuadro de corrección desaparece de la pantalla.
--
-- Arreglarlo de verdad pide que el texto de la corrección viaje DENTRO de
-- `cerrar_con_arqueo` (un `p_correccion` opcional), para poder contar y
-- explicar en el mismo acto. Eso es una migración propia y una pantalla, no un
-- añadido a esta. Queda apuntado en ESTADO.md.
--
-- ── QUÉ SE LEYÓ ANTES (regla de la casa) ─────────────────────
--   · `trg_firma_del_pago`: definida en 55 y 70. VIVA la de la **70**.
--     Único cambio: las dos comprobaciones de fecha, en los DOS sitios donde se
--     estampa `fecha_pago` (el alta que nace pagada y el update que paga).
--   · `trg_facturas_bu`: definida en 6, 12, 14, 29, 54 y 65. VIVA la de la
--     **65**. Dos cambios: conservar las tres columnas de conciliación en las
--     dos ramas de conversión, y que la guarda del final mire las tres.
--
-- Y EL ORDEN DE LOS TRIGGERS JUEGA A FAVOR: `aa_facturas_firma` corre ANTES que
-- `facturas_bu` (orden alfabético), así que el reset de la conciliación pisa lo
-- que la firma acabara de estampar. Comprobado.

begin;

-- ------------------------------------------------------------
-- 1) LA FECHA DE PAGO, VALIDADA EN LA BASE
-- ------------------------------------------------------------
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

  if tg_op = 'INSERT' then
    -- Quien registra la factura es quien la crea.
    new.registrado_por := coalesce(new.registrado_por, v_uid);

    -- Si nace PAGADA —el caso legítimo de una compra en efectivo o de una
    -- factura por llegar— la firma es de quien la está creando, y punto. No
    -- se acepta un `pagado_por` que venga de fuera: esa era la puerta.
    if new.estado_pago = 'Pagada' then
      new.pagado_por := v_uid;
      new.fecha_pago := coalesce(new.fecha_pago, current_date);
      -- LA FECHA DE PAGO NO SE VALIDABA EN NINGUN SITIO. El `max` del campo de la
      -- pantalla no rechaza nada porque no hay formulario -- lo mismo que la
      -- migracion 75 documento con los "2.5 tornillos" -- y aqui solo habia un
      -- coalesce. Contraste: la ENTREGA de efectivo tiene esta guarda desde la
      -- migracion 45; el pago, que mueve mas dinero, no la tenia.
      if new.fecha_pago > current_date then
        raise exception 'La fecha de pago no puede ser futura (llegó %). Un pago fechado adelante desaparece de la conciliación bancaria y de la alerta de facturas sin conciliar, y una factura pagada ya no se puede corregir ni anular.', to_char(new.fecha_pago, 'DD/MM/YYYY');
      end if;
      if new.fecha_pago < new.fecha then
        raise exception 'La fecha de pago (%) es anterior a la de la factura (%). Revisa cuál de las dos está mal.', to_char(new.fecha_pago, 'DD/MM/YYYY'), to_char(new.fecha, 'DD/MM/YYYY');
      end if;
    else
      -- Y si no nace pagada, no puede traer datos de pago puestos.
      new.pagado_por := null;
      new.fecha_pago := null;
    end if;

    -- Una factura no NACE con rastro de ajuste ni de conciliación: los dos
    -- son actos posteriores, y si se pudieran inventar al crear no serían
    -- rastro sino adorno.
    new.ajuste_monto       := null;
    new.conciliada         := coalesce(new.conciliada, false);
    if new.conciliada then
      raise exception 'Una factura no nace conciliada: conciliar es un acto posterior de gerencia.';
    end if;
    new.conciliada_por     := null;
    new.fecha_conciliacion := null;

    return new;
  end if;

  -- El que paga es quien tiene la sesión abierta. Solo se estampa en la
  -- TRANSICIÓN a Pagada: si se estampara en cualquier cambio, se rompería
  -- "administración digita la serie real", porque el guardián de facturas
  -- exige que pagado_por y fecha_pago no cambien en ese paso.
  if new.estado_pago = 'Pagada' and old.estado_pago is distinct from 'Pagada' then
    new.pagado_por := v_uid;
    new.fecha_pago := coalesce(new.fecha_pago, current_date);
    -- LA FECHA DE PAGO NO SE VALIDABA EN NINGUN SITIO. El `max` del campo de la
    -- pantalla no rechaza nada porque no hay formulario -- lo mismo que la
    -- migracion 75 documento con los "2.5 tornillos" -- y aqui solo habia un
    -- coalesce. Contraste: la ENTREGA de efectivo tiene esta guarda desde la
    -- migracion 45; el pago, que mueve mas dinero, no la tenia.
    if new.fecha_pago > current_date then
      raise exception 'La fecha de pago no puede ser futura (llegó %). Un pago fechado adelante desaparece de la conciliación bancaria y de la alerta de facturas sin conciliar, y una factura pagada ya no se puede corregir ni anular.', to_char(new.fecha_pago, 'DD/MM/YYYY');
    end if;
    if new.fecha_pago < new.fecha then
      raise exception 'La fecha de pago (%) es anterior a la de la factura (%). Revisa cuál de las dos está mal.', to_char(new.fecha_pago, 'DD/MM/YYYY'), to_char(new.fecha, 'DD/MM/YYYY');
    end if;
  end if;

  -- Conciliar es exclusivo de gerencia (lo exige facturas_bu). Aquí solo
  -- se deriva la firma del booleano, para que no se pueda inventar.
  if new.conciliada is distinct from old.conciliada then
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
  new.registrado_por := old.registrado_por;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2) LA CONCILIACION NO SE ESCAPA POR LAS RAMAS DE CONVERSION
-- ------------------------------------------------------------
create or replace function public.trg_facturas_bu()
returns trigger
language plpgsql
as $$
declare
  v_campos text[] := array['anulacion', 'actualizado_en'];
begin
  -- Anular: solo se escribe el rastro, nada más.
  if old.anulacion is null and new.anulacion is not null then
    if coalesce(public.mi_rol(), '') <> 'gerente' then
      raise exception 'La anulación de una factura la confirma gerencia.';
    end if;
    if coalesce(trim(new.anulacion->>'motivo'), '') = '' then
      raise exception 'La anulación exige un motivo.';
    end if;
    if (to_jsonb(new) - v_campos) is distinct from (to_jsonb(old) - v_campos) then
      raise exception 'Al anular solo se escribe el rastro: ningún otro dato de la factura se toca en la misma operación.';
    end if;
    return new;
  end if;
  if old.anulacion is not null then
    raise exception 'Esa factura está anulada: no admite cambios.';
  end if;

  -- COMPROMISO -> FACTURA: ocurre AL PAGAR, así que en la misma
  -- operación llegan la serie real y los datos del pago (como hoy).
  --
  -- EL MONTO SÍ SE PUEDE AJUSTAR AQUÍ (migración 65): es el momento en que
  -- llega el papel del proveedor y se sabe la cifra de verdad. El rastro de
  -- ese ajuste lo estampa el servidor en `ajuste_monto`, y el desglose por
  -- ítem tiene que seguir cuadrando (migración 5) — así que un importe nuevo
  -- obliga a decir a qué ítem le corresponde.
  if old.tipo_doc = 'Compromiso' and new.tipo_doc = 'Factura' then
    if new.serie like 'CRED-%' or new.serie like 'PEND-%' then
      raise exception 'Digita la serie real de la factura que entregó el proveedor.';
    end if;
    if new.proveedor_ruc is distinct from old.proveedor_ruc
       or new.proyecto is distinct from old.proyecto
       or new.registrado_por is distinct from old.registrado_por then
      raise exception 'Al convertir el compromiso se digita la serie real y, si la factura llegó por otro importe, el monto. El proveedor y la obra no cambian: si esos están mal, gerencia anula y se registra de nuevo.';
    end if;
    -- La conciliación NO viaja por aquí. Esta rama sale con `return new` antes
    -- de la guarda "la conciliación bancaria es exclusiva de gerencia", que
    -- vive al final de la función -- y es una de las dos ramas que usa
    -- ADMINISTRACIÓN. Sin estas tres líneas, quien ejecuta el pago podía
    -- auto-conciliárselo en el mismo update y apagar el único control que le
    -- queda a gerencia sobre un circuito que está entero en una mano.
    -- (La rama de anulación, más arriba, no lo necesita: ya tiene su guarda
    -- de columnas que impide tocar cualquier otro dato.)
    new.conciliada         := old.conciliada;
    new.conciliada_por     := old.conciliada_por;
    new.fecha_conciliacion := old.fecha_conciliacion;
    return new;
  end if;

  -- PENDIENTE -> FACTURA: la compra YA está pagada; solo llega el papel.
  -- Aquí no se toca ni un dato del pago.
  if old.tipo_doc = 'Pendiente' and new.tipo_doc = 'Factura' then
    if new.serie like 'CRED-%' or new.serie like 'PEND-%' then
      raise exception 'Digita la serie real de la factura que entregó el proveedor.';
    end if;
    if new.monto is distinct from old.monto
       or new.proveedor_ruc is distinct from old.proveedor_ruc
       or new.proyecto is distinct from old.proyecto
       or new.forma_pago is distinct from old.forma_pago
       or new.estado_pago is distinct from old.estado_pago
       or new.medio_pago is distinct from old.medio_pago
       or new.banco is distinct from old.banco
       or new.numero_operacion is distinct from old.numero_operacion
       or new.fecha_pago is distinct from old.fecha_pago
       or new.pagado_por is distinct from old.pagado_por
       or new.rendicion_id is distinct from old.rendicion_id then
      raise exception 'Esta compra ya está pagada: al llegar la factura solo se digita su serie.';
    end if;
    -- La conciliación NO viaja por aquí. Esta rama sale con `return new` antes
    -- de la guarda "la conciliación bancaria es exclusiva de gerencia", que
    -- vive al final de la función -- y es una de las dos ramas que usa
    -- ADMINISTRACIÓN. Sin estas tres líneas, quien ejecuta el pago podía
    -- auto-conciliárselo en el mismo update y apagar el único control que le
    -- queda a gerencia sobre un circuito que está entero en una mano.
    -- (La rama de anulación, más arriba, no lo necesita: ya tiene su guarda
    -- de columnas que impide tocar cualquier otro dato.)
    new.conciliada         := old.conciliada;
    new.conciliada_por     := old.conciliada_por;
    new.fecha_conciliacion := old.fecha_conciliacion;
    return new;
  end if;

  if new.tipo_doc is distinct from old.tipo_doc then
    raise exception 'Una factura no cambia de tipo de documento.';
  end if;

  -- Datos comerciales congelados
  if new.serie is distinct from old.serie
     or new.proveedor_ruc is distinct from old.proveedor_ruc
     or new.fecha is distinct from old.fecha
     or new.monto is distinct from old.monto
     or new.forma_pago is distinct from old.forma_pago
     or new.proyecto is distinct from old.proyecto
     or new.registrado_por is distinct from old.registrado_por then
    raise exception 'Los datos comerciales de la factura no se editan. Si está mal, gerencia la anula y se registra de nuevo.';
  end if;

  -- Para pagar un compromiso hay que tener la serie real
  if new.estado_pago = 'Pagada' and new.tipo_doc = 'Compromiso' then
    raise exception 'Para pagar, registra primero la serie de la factura real.';
  end if;

  -- Factura pagada: congelada salvo conciliación
  if old.estado_pago = 'Pagada' then
    if new.estado_pago is distinct from old.estado_pago
       or new.medio_pago is distinct from old.medio_pago
       or new.banco is distinct from old.banco
       or new.numero_operacion is distinct from old.numero_operacion
       or new.fecha_pago is distinct from old.fecha_pago
       or new.pagado_por is distinct from old.pagado_por
       or new.rendicion_id is distinct from old.rendicion_id then
      raise exception 'La factura ya está pagada; solo se puede conciliar.';
    end if;
  end if;

  -- LAS TRES COLUMNAS, no solo `conciliada`. La guarda original solo miraba el
  -- booleano, así que quien no es gerencia podía falsear o BORRAR quién
  -- concilió una factura ya conciliada: la firma seguía en pie pero con otro
  -- nombre, o sin ninguno. Y una factura con `conciliada_por` nulo desaparece
  -- de la consulta de auditoría, que la busca por ese join.
  if (new.conciliada         is distinct from old.conciliada
   or new.conciliada_por     is distinct from old.conciliada_por
   or new.fecha_conciliacion is distinct from old.fecha_conciliacion)
     and public.mi_rol() <> 'gerente' then
    raise exception 'La conciliación bancaria es exclusiva de gerencia.';
  end if;

  return new;
end;
$$;
commit;

notify pgrst, 'reload schema';

-- ── Comprobación tras correrla ────────────────────────────────
--
-- 0) QUE LAS DOS ESTÁN:
--
--   select
--     (select prosrc like '%no puede ser futura%' from pg_proc
--       where proname = 'trg_firma_del_pago')                     as fecha_pago_validada,
--     (select prosrc like '%new.conciliada         := old.conciliada%' from pg_proc
--       where proname = 'trg_facturas_bu')                        as conciliacion_protegida;
--   -- ESPERADO: true, true.
--
-- 1) ¿HAY DATOS DE ANTES QUE YA ESTÉN MAL? Los dos deben dar 0 filas. Si
--    devuelven algo, NO lo arregla esta migración: son de antes y hay que
--    mirarlos uno a uno con Mónica.
--
--   -- pagos con fecha imposible:
--   select serie, proyecto, fecha, fecha_pago, monto
--     from public.facturas
--    where estado_pago = 'Pagada'
--      and (fecha_pago > current_date or fecha_pago < fecha)
--    order by fecha_pago desc;
--
--   -- facturas conciliadas por quien no es gerencia:
--   select f.serie, f.proyecto, u.nombre as concilio, u.rol
--     from public.facturas f join public.usuarios u on u.id = f.conciliada_por
--    where f.conciliada and u.rol <> 'gerente';
--
-- 2) QUE MUERDEN. Con la sesión de ADMINISTRACIÓN (Mónica), que es quien
--    recorre estos caminos. Las dos pruebas eligen la fila con un `select`
--    previo para que no puedan "pasar" sin tocar nada.
--
--   -- (a) pagar con fecha futura -> DEBE FALLAR
--   begin;
--     select set_config('request.jwt.claims', json_build_object('sub',
--       (select id from public.usuarios where rol = 'administracion' and activo limit 1))::text, true);
--     update public.facturas
--        set estado_pago = 'Pagada', banco = 'BCP', numero_operacion = 'PRUEBA83',
--            fecha_pago = current_date + 400
--      where id = (select id from public.facturas
--                   where estado_pago <> 'Pagada' and anulacion is null limit 1)
--     returning serie, fecha_pago;
--   rollback;
--   -- ESPERADO: error "La fecha de pago no puede ser futura...".
--   -- Si devuelve 0 filas: no hay ninguna factura sin pagar, no se probó nada.
--
--   -- (b) auto-conciliarse al completar la serie -> NO DEBE CONCILIAR
--   begin;
--     select set_config('request.jwt.claims', json_build_object('sub',
--       (select id from public.usuarios where rol = 'administracion' and activo limit 1))::text, true);
--     update public.facturas
--        set tipo_doc = 'Factura', serie = 'F001-99999', conciliada = true
--      where id = (select id from public.facturas where tipo_doc = 'Pendiente' limit 1)
--     returning serie, conciliada;
--   rollback;
--   -- ESPERADO: la fila se actualiza PERO `conciliada` sale FALSE. No lanza
--   -- error: el valor simplemente no entra (ver la decisión consciente arriba).
--   -- Si sale true, el escape sigue abierto.
--
--   -- (c) falsear quién concilió -> DEBE FALLAR
--   begin;
--     select set_config('request.jwt.claims', json_build_object('sub',
--       (select id from public.usuarios where rol = 'administracion' and activo limit 1))::text, true);
--     update public.facturas set conciliada_por = null
--      where id = (select id from public.facturas where conciliada limit 1);
--   rollback;
--   -- ESPERADO: error "La conciliación bancaria es exclusiva de gerencia.".
--   -- Si devuelve 0 filas: no hay ninguna factura conciliada todavía.
--
-- 3) QUE NO SE ROMPIÓ NADA. Es lo que más importa, porque estas dos funciones
--    gobiernan el pago entero. EN LA APLICACIÓN:
--    · Mónica: pagar una factura normal con fecha de hoy.
--    · Mónica: pagar un COMPROMISO digitando su serie real — es el camino que
--      más me preocupaba con la guarda de fecha, y el que hay que probar sí o sí.
--    · Mónica: completar la serie de una factura "por llegar".
--    · Frank: registrar una compra en efectivo del día (nace pagada).
--    · Gerencia: conciliar una factura pagada. Ese camino NO se ha tocado.
--    · Gerencia: anular una factura no pagada.
-- ============================================================
