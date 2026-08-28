-- ============================================================
-- MIGRACIONES 67 a 70 · 28 ago 2026
--
-- COMO SE CORRE: selecciona TODO (Ctrl+A), copia (Ctrl+C) y pega en el editor
-- SQL de Supabase. Una sola vez basta; si se corre dos veces tampoco hace dano.
--
-- QUE CIERRAN, en una linea cada una:
--   67 · el arqueo de caja chica lo calcula la base, no el navegador
--   68 · ajustar el importe de un compromiso reparte el desglose por item
--        (arregla un fallo de la migracion 65, que decia validarlo y no lo hacia)
--   69 · en almacen: no se des-anula, no se re-decide, el reingreso no retrocede,
--        y un prestamo entregado no vuelve atras
--   70 · la firma del pago tambien al CREAR una factura, el banco tiene que ser
--        el de la obra, una jornada aprobada no se reabre, y una entrega no se
--        registra dos veces por un doble clic
--
-- AL TERMINAR, comprobar con esto (los cuatro deben dar 1):
--
--   select
--     (select count(*) from pg_proc where proname = 'cerrar_con_arqueo')         as m67,
--     (select count(*) from pg_trigger where tgname = 'facturas_cuadre_por_monto') as m68,
--     (select count(*) from pg_trigger where tgname = 'zz_prestamo_transicion')   as m69,
--     (select count(*) from pg_trigger where tgname = 'aa_entrega_no_duplicada')  as m70;
--
-- Y estas dos, que miran datos y DEBEN dar 0 filas. Si alguna devuelve algo,
-- mandamelo antes de seguir:
--
--   -- entregas duplicadas de antes de la regla (puede ser dinero de Frank):
--   select proyecto, fecha, monto, medio, num_operacion, count(*)
--     from public.entregas_caja where anulacion is null
--    group by 1,2,3,4,5 having count(*) > 1;
--
--   -- salidas con mas reingresado de lo que salio:
--   select id, numero, cant, cant_reingresada from public.salidas
--    where coalesce(cant_reingresada, 0) > cant;
-- ============================================================



-- ############################################################
-- ##  MIGRACION 67 · El arqueo lo calcula la base, no el navegador
-- ############################################################

-- ============================================================
-- MIGRACIÓN 67 · El arqueo lo calcula la base, no el navegador
-- ============================================================
--
-- EL AGUJERO, y es el más serio que queda abierto. Al cerrar la jornada de
-- caja chica, el navegador manda TRES cosas ya decididas:
--
--     efectivo_contado  ← lo que Mónica contó          (legítimo: es su dato)
--     diferencia        ← calculada en la pantalla     (no debería mandarse)
--     estado            ← 'Con diferencia' o 'Aprobada'  ← LA DECISIÓN ENTERA
--
-- La base las guardaba tal cual, sin recalcular nada. O sea que **quien
-- decidía si la caja cuadra era la misma pantalla que estaba siendo
-- controlada**. Un mensaje directo a la base podía cerrar un día con S/ 500
-- faltantes marcándolo 'Aprobada' y diferencia 0: sin escalar a gerencia, sin
-- bloquear la caja del día siguiente, y sin que nadie se enterara nunca.
--
-- Y la caja chica es lo ÚNICO donde el dinero se mueve sin banco de por
-- medio. Una transferencia deja rastro en el extracto y se concilia; el
-- efectivo solo tiene este arqueo. Era el punto más débil del sistema.
--
-- LA CORRECCIÓN. Una función del servidor que recibe SOLO lo que Mónica
-- aporta de verdad —cuánto contó, y el motivo si hay diferencia— y calcula
-- ella misma todo lo demás, con la misma aritmética que la pantalla:
--
--     debe devolver = Σ entregas del día − Σ gastado del día
--     diferencia    = contado − debe devolver
--     ¿escala?      = |diferencia| > tolerancia de esa obra
--
-- Es el mismo patrón de las migraciones 41, 55 y 66: el dato que decide no
-- viaja desde el navegador.
--
-- OJO CON LAS RENDICIONES HISTÓRICAS. Las anteriores al 12 ago 2026 se
-- cerraron con el modelo de fondo fijo (`monto_fondo`), antes de que
-- existieran las entregas. Se leen con ESE criterio, igual que hace
-- src/caja.js: recalcularlas con el modelo nuevo las dejaría todas en
-- negativo. Aquí solo importa para las que aún estén abiertas.

create or replace function public.cerrar_con_arqueo(
  p_rendicion uuid, p_contado numeric, p_motivo text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record; v_gastado numeric; v_recibido numeric; v_entregas int;
  v_historica boolean; v_debe numeric; v_dif numeric; v_tol numeric;
  v_excede boolean; v_estado text;
begin
  if coalesce(public.mi_rol(), '') not in ('administracion', 'gerente') then
    raise exception 'El arqueo de la caja chica lo cierra administración.';
  end if;
  if p_contado is null or p_contado < 0 then
    raise exception 'Escribe cuánto efectivo contaste (no puede ser negativo).';
  end if;

  select * into r from public.rendiciones where id = p_rendicion for update;
  if not found then raise exception 'Esa jornada no existe.'; end if;
  if r.estado not in ('Abierta', 'Observada') then
    raise exception 'Esa jornada ya está %: no se vuelve a arquear.', r.estado;
  end if;

  select coalesce(sum(monto), 0) into v_gastado
    from public.facturas where rendicion_id = r.id and anulacion is null;
  select coalesce(sum(monto), 0), count(*) into v_recibido, v_entregas
    from public.entregas_caja
   where proyecto = r.proyecto and fecha = r.fecha and anulacion is null;

  v_historica := (r.fecha < date '2026-08-12') and v_entregas = 0;
  if v_historica then v_recibido := coalesce(r.monto_fondo, 0); end if;

  v_debe := v_recibido - v_gastado;
  v_dif  := p_contado - v_debe;

  select coalesce(tolerancia, 20) into v_tol
    from public.cajas_chicas where proyecto = r.proyecto;
  v_tol := coalesce(v_tol, 20);

  v_excede := abs(v_dif) > v_tol;
  v_estado := case when v_excede then 'Con diferencia' else 'Aprobada' end;

  if v_excede and coalesce(trim(p_motivo), '') = '' then
    raise exception
      'La diferencia es de S/ % y la tolerancia de esta obra es S/ %: hay que explicar a qué se debe antes de cerrar.',
      to_char(abs(v_dif), 'FM999999990.00'), to_char(v_tol, 'FM999999990.00');
  end if;

  perform set_config('rq.arqueo', '1', true);

  update public.rendiciones
     set efectivo_contado = p_contado,
         diferencia       = v_dif,
         dif_motivo       = nullif(trim(p_motivo), ''),
         estado           = v_estado,
         aprobado_por     = case when v_excede then null else auth.uid() end,
         fecha_aprobacion = case when v_excede then null else current_date end
   where id = p_rendicion;

  perform set_config('rq.arqueo', '', true);

  return jsonb_build_object(
    'recibido', v_recibido, 'gastado', v_gastado, 'debeDevolver', v_debe,
    'contado', p_contado, 'diferencia', v_dif, 'tolerancia', v_tol,
    'excede', v_excede, 'estado', v_estado);
end;
$$;

revoke all on function public.cerrar_con_arqueo(uuid, numeric, text) from public, anon;
grant execute on function public.cerrar_con_arqueo(uuid, numeric, text) to authenticated;

-- ── Y la puerta de atrás se cierra ───────────────────────────
--
-- Sin esto, la función de arriba sería solo una sugerencia: el UPDATE directo
-- sobre la tabla sigue existiendo y es el que tenía el agujero. Estas tres
-- columnas —lo contado, la diferencia y el estado— solo las escribe la
-- función, que se identifica con una marca de transacción.
--
-- Lo que SÍ sigue pudiendo hacer un UPDATE normal: que administración observe
-- o corrija una jornada, y que gerencia resuelva una diferencia
-- (`dif_resolucion`), que son caminos legítimos con su propia pantalla.
create or replace function public.trg_arqueo_solo_del_servidor()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('rq.arqueo', true), '') = '1' then
    return new;                       -- viene de cerrar_con_arqueo()
  end if;
  if auth.uid() is null then
    return new;                       -- cargas de datos y mantenimiento
  end if;

  if new.efectivo_contado is distinct from old.efectivo_contado
     or new.diferencia is distinct from old.diferencia then
    raise exception 'El arqueo se cierra desde la pantalla de rendiciones: la diferencia la calcula el sistema, no se digita.';
  end if;

  -- El estado sí puede cambiar por otros caminos (observar, corregir,
  -- resolver la diferencia), pero NUNCA hacia 'Aprobada' sin pasar por el
  -- arqueo — salvo que gerencia esté resolviendo una diferencia, que es el
  -- camino documentado de la migración 27.
  if new.estado = 'Aprobada' and old.estado <> 'Aprobada'
     and new.dif_resolucion is not distinct from old.dif_resolucion then
    raise exception 'Una jornada se aprueba contando el efectivo, no marcándola aprobada.';
  end if;

  return new;
end;
$$;

drop trigger if exists zz_arqueo_solo_del_servidor on public.rendiciones;
create trigger zz_arqueo_solo_del_servidor
  before update on public.rendiciones
  for each row execute function public.trg_arqueo_solo_del_servidor();

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) La función y el trigger existen:
--
--   select proname from pg_proc where proname = 'cerrar_con_arqueo';
--   select tgname from pg_trigger
--    where tgrelid = 'public.rendiciones'::regclass and not tgisinternal
--    order by tgname;
--
-- 2) Las jornadas ya cerradas NO se tocan: esta migración solo cambia cómo se
--    cierran las próximas. Para ver si alguna vieja quedó con una diferencia
--    que no cuadra con su propia aritmética (señal de que se maquilló antes):
--
--   select r.numero, r.proyecto, r.fecha, r.estado,
--          r.efectivo_contado, r.diferencia as dice,
--          r.efectivo_contado - (
--            coalesce((select sum(monto) from public.entregas_caja e
--                       where e.proyecto = r.proyecto and e.fecha = r.fecha
--                         and e.anulacion is null), 0)
--          - coalesce((select sum(monto) from public.facturas f
--                       where f.rendicion_id = r.id and f.anulacion is null), 0)
--          ) as deberia_decir
--     from public.rendiciones r
--    where r.efectivo_contado is not null and r.fecha >= date '2026-08-12'
--    order by r.fecha desc;
--
--   Las columnas `dice` y `deberia_decir` tienen que coincidir en todas.



-- ############################################################
-- ##  MIGRACION 68 · Ajustar el monto reparte el desglose (arregla la 65)
-- ############################################################

-- ============================================================
-- MIGRACIÓN 68 · Ajustar el monto reparte el desglose
--                (arregla un fallo de la migración 65)
-- ============================================================
--
-- EL FALLO, y es mío. La migración 65 abrió la puerta a ajustar el importe al
-- convertir un compromiso en factura real, y su comentario afirma: "el
-- desglose por ítem tiene que seguir cuadrando · de eso ya se encarga el
-- trigger de la migración 5".
--
-- ES FALSO, y lo encontró un ataque al día siguiente. Ese trigger es un
-- constraint trigger definido sobre `factura_items`:
--
--     after insert or update or delete on public.factura_items
--
-- Un UPDATE que solo cambia `facturas.monto` NO modifica ninguna fila de
-- factura_items, así que el trigger no se encola ni corre jamás.
--
-- Resultado: un compromiso de S/ 500 ajustado a S/ 520 quedaba con monto 520 y
-- desglose 500 — S/ 20 de descuadre, cuarenta veces la tolerancia— y al pagar
-- se congelaba así para siempre. Ese desglose falso alimenta el precio
-- unitario del historial con el que se negocia, el valorizado del almacén y el
-- futuro Registro de Compras de SUNAT. Y peor: cualquier operación legítima
-- futura sobre esas líneas reventaría con el error de cuadre, sin que nadie
-- entendiera por qué.
--
-- LA CORRECCIÓN. En vez de exigirle a Pagos que reparta a mano —no conoce los
-- materiales ni tiene por qué—, el servidor reparte el ajuste **en proporción
-- a lo que ya valía cada línea**. Si la factura sube un 4 %, cada precio
-- unitario sube un 4 %.
--
-- Por qué proporcional y no de otra forma: es la única repartición defendible
-- sin información que el sistema no tiene. Un ajuste suele ser un redondeo, un
-- flete prorrateado o una variación de precio general; atribuirlo entero a un
-- material al azar sería peor. Y el rastro guarda el importe comprometido y el
-- real, así que la diferencia siempre se puede ver y explicar.
--
-- LA COTA. También se pone un límite de cordura: un ajuste que MULTIPLIQUE el
-- importe es un dedazo, no un ajuste. S/ 500 → S/ 5,200 (un cero de más) se
-- rechaza; S/ 500 → S/ 520 pasa. El tope es el doble o la mitad.

create or replace function public.trg_ajuste_al_convertir()
returns trigger
language plpgsql
as $$
declare
  v_nombre text;
  v_suma   numeric;
  v_factor numeric;
begin
  -- Fuera de la conversión, el rastro es intocable: ni se inventa ni se borra.
  if not (old.tipo_doc = 'Compromiso' and new.tipo_doc = 'Factura') then
    new.ajuste_monto := old.ajuste_monto;
    return new;
  end if;
  if new.monto is not distinct from old.monto then
    new.ajuste_monto := old.ajuste_monto;
    return new;
  end if;

  if new.monto is null or new.monto <= 0 then
    raise exception 'El monto de la factura real tiene que ser mayor que cero.';
  end if;

  -- Cota de cordura: un ajuste no multiplica ni parte por la mitad el importe.
  if new.monto > old.monto * 2 or new.monto < old.monto / 2 then
    raise exception
      'S/ % está muy lejos de los S/ % comprometidos: revisa si sobra o falta un dígito. Si de verdad cambió tanto, gerencia anula el compromiso y se registra de nuevo con su desglose.',
      to_char(new.monto, 'FM999999990.00'), to_char(old.monto, 'FM999999990.00');
  end if;

  -- ── El desglose se reparte en proporción ──────────────────
  select coalesce(sum(fi.precio_unitario * i.cant), 0) into v_suma
    from public.factura_items fi
    join public.rq_items i on i.id = fi.rq_item_id
   where fi.factura_id = new.id;

  if v_suma > 0 then
    v_factor := new.monto / v_suma;
    update public.factura_items fi
       set precio_unitario = round(fi.precio_unitario * v_factor, 4)
     where fi.factura_id = new.id;

    -- El redondeo a 4 decimales puede dejar unos céntimos sueltos. Se cargan a
    -- la línea más grande, que es donde menos se notan en el precio unitario.
    -- Sin esto, el trigger de cuadre (migración 5) rechazaría la operación
    -- entera por una diferencia de céntimos.
    select coalesce(sum(fi.precio_unitario * i.cant), 0) into v_suma
      from public.factura_items fi
      join public.rq_items i on i.id = fi.rq_item_id
     where fi.factura_id = new.id;

    if abs(new.monto - v_suma) >= 0.005 then
      update public.factura_items fi
         set precio_unitario = round(
               (fi.precio_unitario * i.cant + (new.monto - v_suma)) / i.cant, 4)
        from public.rq_items i
       where i.id = fi.rq_item_id
         and fi.factura_id = new.id
         and fi.rq_item_id = (
           select fi2.rq_item_id from public.factura_items fi2
             join public.rq_items i2 on i2.id = fi2.rq_item_id
            where fi2.factura_id = new.id
            order by fi2.precio_unitario * i2.cant desc, fi2.rq_item_id
            limit 1);
    end if;
  end if;

  select nombre into v_nombre from public.usuarios where id = auth.uid();

  new.ajuste_monto := jsonb_build_object(
    'comprometido', old.monto,
    'real',         new.monto,
    'diferencia',   new.monto - old.monto,
    'por',          coalesce(v_nombre, 'desconocido'),
    'fecha',        current_date::text,
    'reparto',      'proporcional al desglose comprometido');

  return new;
end;
$$;

-- ── Y una red por si el reparto no alcanza ───────────────────
--
-- El reparto de arriba cubre el camino previsto. Esta guarda cubre CUALQUIER
-- otro: si por la vía que sea el monto de una factura acaba sin cuadrar con su
-- desglose, la transacción no pasa. Es constraint trigger DIFERIDO —como el de
-- la migración 5— para que se compruebe al final, cuando el monto y las líneas
-- ya se movieron los dos.
create or replace function public.trg_factura_cuadre_por_monto()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_suma numeric;
  v_sin  int;
begin
  if new.anulacion is not null then return null; end if;   -- anulada: no se valida
  if new.monto is not distinct from old.monto then return null; end if;

  select coalesce(sum(fi.precio_unitario * i.cant), 0),
         count(*) filter (where fi.precio_unitario is null)
    into v_suma, v_sin
    from public.factura_items fi
    join public.rq_items i on i.id = fi.rq_item_id
   where fi.factura_id = new.id;

  -- Sin líneas todavía (o sin precios) no hay nada que cuadrar: de eso se
  -- encarga el trigger de la migración 5 cuando lleguen.
  if v_sin > 0 then return null; end if;
  if not exists (select 1 from public.factura_items where factura_id = new.id) then
    return null;
  end if;

  if abs(new.monto - v_suma) > 0.5 then
    raise exception
      'El monto de la factura (S/ %) no cuadra con el desglose por ítem (S/ %). El precio de cada material tiene que sumar el total.',
      to_char(new.monto, 'FM999999990.00'), to_char(v_suma, 'FM999999990.00');
  end if;
  return null;
end;
$$;

drop trigger if exists facturas_cuadre_por_monto on public.facturas;
create constraint trigger facturas_cuadre_por_monto
  after update on public.facturas
  deferrable initially deferred
  for each row execute function public.trg_factura_cuadre_por_monto();

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) ¿Quedó alguna factura descuadrada de antes de este arreglo? Debe dar 0
--    filas. Si sale alguna, es de un ajuste hecho con la migración 65 sin
--    corregir, y hay que repartirla a mano:
--
--   select f.serie, f.proveedor_ruc, f.monto,
--          (select coalesce(sum(fi.precio_unitario * i.cant), 0)
--             from public.factura_items fi
--             join public.rq_items i on i.id = fi.rq_item_id
--            where fi.factura_id = f.id) as desglose
--     from public.facturas f
--    where f.anulacion is null
--      and exists (select 1 from public.factura_items x where x.factura_id = f.id)
--      and abs(f.monto - (select coalesce(sum(fi.precio_unitario * i.cant), 0)
--                           from public.factura_items fi
--                           join public.rq_items i on i.id = fi.rq_item_id
--                          where fi.factura_id = f.id)) > 0.5;
--
-- 2) El trigger existe:
--
--   select tgname from pg_trigger
--    where tgrelid = 'public.facturas'::regclass and not tgisinternal
--    order by tgname;



-- ############################################################
-- ##  MIGRACION 69 · Lo hecho en el almacen no se deshace a escondidas
-- ############################################################

-- ============================================================
-- MIGRACIÓN 69 · Lo hecho en el almacén no se deshace a escondidas
-- ============================================================
--
-- Cierra cinco agujeros que un ataque al módulo de Almacén encontró y verificó
-- uno por uno (28 ago 2026). Los cinco son la misma enfermedad, y es la que ya
-- se curó en Compras con las migraciones 62 y 66: **una transición sin guarda
-- en la base**. Ninguno es alcanzable desde la pantalla —no hay botón para
-- eso— pero sí hablándole directo a la base con una sesión iniciada.
--
-- Y OJO CON EL MOTIVO, porque no es el que parece: estas guardas no están aquí
-- por miedo a que alguien del equipo actúe de mala fe. Están porque **la base
-- tiene que atrapar los errores de quien programa**. Esta misma semana la
-- migración 65 afirmó por escrito que revalidaba un cuadre que en realidad no
-- revalidaba, y nada lo detectó: ni al escribirla, ni al correrla, ni al
-- usarla. Habría dejado facturas descuadradas para siempre. Una guarda en la
-- base es la red que atrapa eso.
--
-- ── LOS CINCO ─────────────────────────────────────────────────
--
-- 1. DES-ANULAR UNA SALIDA (`anulacion = null`). La salida resucita, vuelve a
--    descontar stock sin revalidar nada —puede quedar NEGATIVO— y el motivo,
--    el nombre y la fecha de la anulación DESAPARECEN. No quedan tachados: se
--    borran. El trigger vigente solo mira cuando se ESCRIBE una anulación; que
--    se borre pasaba de largo.
--
-- 2. RE-DECIDIR UNA SALIDA YA RESUELTA. La guarda "esta salida ya fue
--    resuelta" vive DENTRO de la rama del residente, así que compras y
--    gerencia caían fuera: podían pasar una Rechazada a Aprobada, revirtiendo
--    la decisión del residente sin que se entere, descontando stock otra vez y
--    pisando su firma.
--
-- 3. DESHACER UN REINGRESO bajando `cant_reingresada`. El guardia existente
--    solo mira los AUMENTOS. Bajarla vuelve a sacar material del stock, sin
--    motivo y sin rastro.
--
-- 4. DEGRADAR UN PRÉSTAMO de 'Prestado' a 'Solicitado' o 'Rechazado': des-mueve
--    el stock de las dos obras sin ninguna comprobación.
--
-- 5. RECHAZAR UN PRÉSTAMO YA PRESTADO: revierte el stock saltándose el control
--    de "el destino ya consumió", que es justo lo que impide devolver material
--    que la otra obra ya se gastó.
--
-- QUÉ NO SE TOCA, a propósito: todos los caminos legítimos. El residente sigue
-- aprobando y rechazando lo que está Pendiente; el almacén sigue registrando
-- uso, reingreso y anulación; gerencia sigue pudiendo destrabar; y las
-- transiciones normales de un préstamo (Prestado → Devuelto / Transferido /
-- Anulado) siguen igual.

-- ------------------------------------------------------------
-- SALIDAS
-- ------------------------------------------------------------
-- Se reescribe `trg_salida_aprobacion` ENTERA —en PL/pgSQL no se parchea un
-- trozo— copiada de la migración 41 con TRES añadidos marcados abajo. Todo lo
-- demás queda palabra por palabra: la firma de la aprobación, la firma de la
-- anulación con su motivo obligatorio, y las dos guardas de columnas (el
-- residente solo decide, el almacén solo registra).
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
  -- ── AÑADIDO 1: una anulación no se borra ────────────────────
  -- Anular devolvió material al stock y dejó un motivo firmado. Deshacerlo en
  -- silencio vuelve a descontar y borra el rastro. Si la anulación estuvo mal,
  -- se registra una salida nueva: así queda la historia de las dos cosas.
  if old.anulacion is not null and new.anulacion is null then
    raise exception 'Una salida anulada no se des-anula: el material ya volvió al stock y la anulación tiene motivo y firma. Si hace falta sacarlo otra vez, registra una salida nueva.';
  end if;
  -- Y estando anulada, no se le cambia nada más: está cerrada.
  if old.anulacion is not null
     and (to_jsonb(new) - array['anulacion', 'actualizado_en']) is distinct from (to_jsonb(old) - array['anulacion', 'actualizado_en']) then
    raise exception 'Esa salida está anulada: no admite cambios.';
  end if;

  -- ── AÑADIDO 2: la decisión solo se toma una vez ─────────────
  -- Antes esta guarda vivía dentro de la rama del residente, así que compras y
  -- gerencia podían re-decidir una salida ya resuelta. Ahora aplica a todos.
  if new.aprobacion is distinct from old.aprobacion
     and old.aprobacion <> 'Pendiente'
     and auth.uid() is not null then
    raise exception 'Esta salida ya fue %: una decisión no se cambia. Si hay que revertirla, se anula con motivo y se registra de nuevo.', lower(old.aprobacion);
  end if;

  -- ── AÑADIDO 3: el reingreso no retrocede ────────────────────
  -- Bajar la cantidad reingresada vuelve a sacar material del stock sin motivo
  -- ni rastro. Solo puede crecer, y nunca pasar de lo que salió.
  if coalesce(new.cant_reingresada, 0) < coalesce(old.cant_reingresada, 0)
     and auth.uid() is not null then
    raise exception 'El reingreso no se puede reducir: ese material ya volvió al almacén. Si se registró de más, anula la salida y regístrala bien.';
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

-- ------------------------------------------------------------
-- PRÉSTAMOS
-- ------------------------------------------------------------
-- Guarda de transición aparte, para no reescribir la función de las firmas
-- (que es larga y funciona).
--
-- `zz_` PARA QUE CORRA DESPUÉS, y el motivo importa: **la pantalla nunca manda
-- el estado de un préstamo**. Manda una firma o un rechazo, y es la función de
-- las firmas la que deriva el estado —a 'Prestado' cuando llegan las dos
-- aprobaciones, a 'Rechazado' en cuanto llega un rechazo—. Un guardián que
-- corriera antes vería el estado todavía sin cambiar y dejaría pasar todo.
--
-- (La primera versión de esta migración lo puso como `aa_` y por eso no
-- atrapaba el caso 5, que es justo el que va por ese camino: rechazar un
-- préstamo YA entregado. El orden alfabético de los triggers no es un detalle.)
--
-- Las transiciones legítimas, y no hay más:
--     Solicitado  → Prestado (con las dos firmas) · Rechazado · Anulado
--     Prestado    → Devuelto · Transferido · Anulado
--     Devuelto / Transferido / Rechazado / Anulado → (nada: están cerrados)
create or replace function public.trg_prestamo_transicion()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;                       -- cargas de datos y mantenimiento
  end if;
  if new.estado is not distinct from old.estado then
    -- No cambia el estado, pero sí puede estar borrándose la anulación.
    if old.anulacion is not null and new.anulacion is null then
      raise exception 'Un préstamo anulado no se des-anula: el material ya volvió a su almacén y la anulación tiene motivo y firma.';
    end if;
    return new;
  end if;

  -- Un préstamo cerrado no vuelve atrás. Devolver o transferir movió stock;
  -- rechazar y anular lo dejaron donde estaba. Cualquiera de las cuatro es
  -- definitiva: si hay que corregir, se registra un préstamo nuevo.
  if old.estado in ('Devuelto', 'Transferido', 'Rechazado', 'Anulado') then
    raise exception 'Ese préstamo ya está %: no se puede volver a %. Si hay que corregirlo, registra un préstamo nuevo.',
      lower(old.estado), lower(new.estado);
  end if;

  -- Un préstamo ya entregado no retrocede a "por aprobar" ni se rechaza: el
  -- material YA se movió. Rechazarlo revertía el stock saltándose el control
  -- de si el destino lo consumió.
  if old.estado = 'Prestado' and new.estado in ('Solicitado', 'Rechazado') then
    raise exception 'Ese préstamo ya está entregado y el material está en la otra obra: no se puede rechazar ahora. Se devuelve (si no lo consumieron), se transfiere al costo, o se anula con motivo.';
  end if;

  -- Y uno solicitado no puede saltar directo a devuelto o transferido sin
  -- haberse entregado nunca.
  if old.estado = 'Solicitado' and new.estado in ('Devuelto', 'Transferido') then
    raise exception 'Ese préstamo todavía no se ha entregado: no puede darse por devuelto ni transferido.';
  end if;

  return new;
end;
$$;

drop trigger if exists aa_prestamo_transicion on public.prestamos;
drop trigger if exists zz_prestamo_transicion on public.prestamos;
create trigger zz_prestamo_transicion
  before update on public.prestamos
  for each row execute function public.trg_prestamo_transicion();

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) Los cambios NO tocan nada de lo ya registrado; solo cambian lo que se
--    puede hacer de aquí en adelante. Para ver que no haya quedado ningún
--    dato imposible de antes (debe dar 0 filas):
--
--    -- salidas con más reingresado de lo que salió:
--    select id, numero, cant, cant_reingresada from public.salidas
--     where coalesce(cant_reingresada, 0) > cant;
--
--    -- préstamos en un estado que ya no se podrá alcanzar:
--    select numero, origen, destino, estado, aprob_origen is not null o,
--           aprob_destino is not null d
--      from public.prestamos
--     where estado = 'Prestado' and (aprob_origen is null or aprob_destino is null);
--
-- 2) Los dos guardias existen:
--
--    select tgname from pg_trigger
--     where tgrelid in ('public.salidas'::regclass, 'public.prestamos'::regclass)
--       and not tgisinternal
--     order by tgrelid::text, tgname;
--
-- 3) La prueba de verdad, en la aplicación: que el almacenero pueda seguir
--    recibiendo, sacando, verificando uso, reingresando y anulando; que el
--    residente siga aprobando y rechazando lo pendiente; y que un préstamo
--    complete su ciclo normal. Nada de eso debe haber cambiado.



-- ############################################################
-- ##  MIGRACION 70 · La firma del pago al crear, el banco de cada obra, entregas sin duplicar
-- ############################################################

-- ============================================================
-- MIGRACIÓN 70 · La firma del pago también al crear, el banco de
--                cada obra, y una entrega no se duplica
-- ============================================================
--
-- Cierra cinco agujeros del ataque al módulo de Pagos (28 ago 2026). Como los
-- de la migración 69, todos son de la misma familia: reglas que la pantalla
-- respeta y la base no comprobaba.
--
-- ── 1) LA FIRMA DEL PAGO SE SALTABA POR EL CAMINO DE CREAR ────
--
-- La migración 55 dice, con todas sus letras, que "un mensaje directo a la
-- base podía firmar un pago con el nombre de otra persona", y lo cerró... solo
-- para el UPDATE. En el INSERT su único cuidado es `registrado_por`.
--
-- Así que se podía CREAR de cero una factura ya nacida 'Pagada', con
-- `pagado_por` apuntando a otra persona, su fecha de pago inventada, banco y
-- número de operación a gusto. Una factura pagada que nunca pasó por el módulo
-- de Pagos, atribuida a alguien que no la pagó.
--
-- ── 2) EL RASTRO DEL AJUSTE, IGUAL ───────────────────────────
--
-- `ajuste_monto` (migración 65) lo blinda un trigger que también es solo de
-- UPDATE, así que al crear se podía inventar: un rastro que dice que alguien
-- ajustó un importe que nunca ajustó. Un rastro forjable es peor que no tener
-- rastro, porque se le cree.
--
-- ── 3) EL BANCO DE CADA OBRA ─────────────────────────────────
--
-- Cada obra tiene su cuenta (`proyectos_banco`) y la pantalla nunca deja
-- elegir: lo deriva de la obra de la factura. Pero `facturas.banco` es texto
-- libre y nada lo comparaba, así que por la base se podía pagar una obra con
-- la cuenta de otra —o con el banco en blanco—. Y ese dato queda congelado
-- dentro de la factura al pagarla: es lo que Auditoría cruza después contra el
-- extracto.
--
-- ── 4) NO SE REABRE UN ARQUEO YA APROBADO ────────────────────
--
-- La migración 67 hizo que el arqueo lo calcule la base. Faltaba lo otro: que
-- una jornada aprobada no se pueda volver a abrir. Reabriéndola, el candado
-- que impide tocar las entregas de un día cerrado deja de proteger, y el
-- efectivo de ese día se vuelve editable otra vez.
--
-- ── 5) UNA ENTREGA NO SE REGISTRA DOS VECES ──────────────────
--
-- Con la red lenta de una obra: clic, no pasa nada visible, segundo clic. Dos
-- entregas idénticas de S/ 600. La jornada cree que Frank recibió S/ 1,200 y
-- al cerrar le sale un faltante de S/ 600 que **se lo come él**. Ninguna
-- pantalla y ninguna tabla lo impedían.

-- ------------------------------------------------------------
-- 1 y 2) LA FIRMA Y EL RASTRO, TAMBIÉN AL CREAR
-- ------------------------------------------------------------
-- Se reescribe `trg_firma_del_pago` entera (migración 55) con la rama del
-- INSERT completa. Todo lo del UPDATE queda palabra por palabra.
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
-- 3) EL BANCO TIENE QUE SER EL DE LA OBRA
-- ------------------------------------------------------------
-- Solo se comprueba cuando la obra TIENE cuenta cargada. Si no la tiene, no se
-- bloquea el pago: se avisa en la pantalla. Bloquear aquí dejaría a una obra
-- nueva sin poder pagar hasta que alguien recuerde cargarle el banco, y ese
-- alguien no está a mano un viernes por la tarde.
create or replace function public.trg_banco_de_la_obra()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_banco text;
begin
  if auth.uid() is null then return new; end if;
  -- Solo interesa cuando se está pagando por banco.
  if new.estado_pago is distinct from 'Pagada' then return new; end if;
  if coalesce(new.medio_pago, '') = 'Efectivo' then return new; end if;
  if new.banco is not distinct from old.banco
     and new.estado_pago is not distinct from old.estado_pago then
    return new;                       -- no se está tocando el pago
  end if;

  select banco into v_banco from public.proyectos_banco where codigo = new.proyecto;
  if v_banco is null or trim(v_banco) = '' then
    return new;                       -- esa obra aún no tiene cuenta cargada
  end if;

  if coalesce(trim(new.banco), '') = '' then
    raise exception 'Falta el banco del pago. Esta obra paga por %.', v_banco;
  end if;
  if trim(new.banco) <> trim(v_banco) then
    raise exception 'Esta obra paga por % y el pago dice %. Cada obra tiene su cuenta: si de verdad se pagó desde otra, hay que corregir la cuenta de la obra antes.',
      v_banco, new.banco;
  end if;

  return new;
end;
$$;

-- SOLO EN UPDATE, y es deliberado. El pago de verdad lo hace Pagos con el
-- banco DERIVADO de la obra, y ese es el camino que hay que blindar. En el
-- INSERT quedaría atrapado Frank, que hoy escribe el banco A MANO al registrar
-- una factura suya (consecuencia conocida de la migración 32: él ya no ve qué
-- banco usa cada obra). Bloquearlo aquí lo dejaría sin poder registrar sus
-- compras el día uno. Su campo tiene que convertirse en una lista fija de
-- bancos —está apuntado— y entonces esta guarda se extiende al INSERT.
drop trigger if exists zz_banco_de_la_obra on public.facturas;
create trigger zz_banco_de_la_obra
  before update on public.facturas
  for each row execute function public.trg_banco_de_la_obra();

-- ------------------------------------------------------------
-- 4) UNA JORNADA APROBADA NO SE REABRE
-- ------------------------------------------------------------
-- Se amplía el guardián de la migración 67. Reabrir un arqueo aprobado
-- desbloquea las entregas de ese día —el candado mira si la jornada está
-- cerrada— y deja el efectivo ya contado otra vez editable.
--
-- Sí se conserva el camino legítimo: gerencia resuelve una jornada 'Con
-- diferencia' (`dif_resolucion`), y administración observa o corrige una que
-- todavía no está aprobada.
create or replace function public.trg_arqueo_solo_del_servidor()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('rq.arqueo', true), '') = '1' then
    return new;                       -- viene de cerrar_con_arqueo()
  end if;
  if auth.uid() is null then
    return new;                       -- cargas de datos y mantenimiento
  end if;

  if new.efectivo_contado is distinct from old.efectivo_contado
     or new.diferencia is distinct from old.diferencia then
    raise exception 'El arqueo se cierra desde la pantalla de rendiciones: la diferencia la calcula el sistema, no se digita.';
  end if;

  -- NUEVO: una jornada aprobada está cerrada. El efectivo se contó, se firmó,
  -- y las entregas de ese día quedaron cuadradas.
  if old.estado = 'Aprobada' and new.estado is distinct from old.estado then
    raise exception 'Esa jornada ya está aprobada y cerrada: no se reabre. Si apareció algo después, se registra en la jornada de hoy y se explica.';
  end if;

  -- El estado sí puede cambiar por otros caminos (observar, corregir,
  -- resolver la diferencia), pero NUNCA hacia 'Aprobada' sin pasar por el
  -- arqueo — salvo que gerencia esté resolviendo una diferencia, que es el
  -- camino documentado de la migración 27.
  if new.estado = 'Aprobada' and old.estado <> 'Aprobada'
     and new.dif_resolucion is not distinct from old.dif_resolucion then
    raise exception 'Una jornada se aprueba contando el efectivo, no marcándola aprobada.';
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 5) UNA ENTREGA NO SE REGISTRA DOS VECES
-- ------------------------------------------------------------
-- Dos entregas iguales el mismo día a la misma obra, por el mismo medio y
-- monto, son casi con seguridad un doble clic. Y el que paga el error es
-- Frank, con un faltante que no puede explicar.
--
-- Se bloquea en la base y no solo en la pantalla porque el doble clic ocurre
-- justamente cuando la pantalla no responde.
--
-- OJO: sí puede haber DOS entregas legítimas del mismo monto el mismo día —se
-- le entrega dinero varias veces por jornada—, pero entonces tendrán distinto
-- número de operación. Por eso la comprobación incluye ese número, y solo
-- salta cuando TODO coincide.
create or replace function public.trg_entrega_no_duplicada()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (
    select 1 from public.entregas_caja e
     where e.proyecto = new.proyecto
       and e.fecha    = new.fecha
       and e.monto    = new.monto
       and coalesce(e.medio, '') = coalesce(new.medio, '')
       and coalesce(e.num_operacion, '') = coalesce(new.num_operacion, '')
       and e.anulacion is null
       and e.id is distinct from new.id
  ) then
    raise exception 'Ya hay una entrega igual hoy en esta obra (S/ %, mismo medio y N° de operación). Si es una segunda entrega de verdad, tiene que llevar su propio N° de operación.',
      to_char(new.monto, 'FM999999990.00');
  end if;
  return new;
end;
$$;

drop trigger if exists aa_entrega_no_duplicada on public.entregas_caja;
create trigger aa_entrega_no_duplicada
  before insert on public.entregas_caja
  for each row execute function public.trg_entrega_no_duplicada();

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) ¿Hay entregas duplicadas de antes de esta regla? Si sale alguna, hay que
--    mirarla con Pagos: puede ser un doble clic que Frank ya pagó de su
--    bolsillo.
--
--   select proyecto, fecha, monto, medio, num_operacion, count(*)
--     from public.entregas_caja where anulacion is null
--    group by 1,2,3,4,5 having count(*) > 1;
--
-- 2) ¿Alguna factura pagada tiene un banco que no es el de su obra? (de antes
--    de la regla; debe dar 0 filas)
--
--   select f.serie, f.proyecto, f.banco, b.banco as banco_de_la_obra
--     from public.facturas f
--     join public.proyectos_banco b on b.codigo = f.proyecto
--    where f.estado_pago = 'Pagada' and coalesce(f.medio_pago,'') <> 'Efectivo'
--      and f.anulacion is null
--      and coalesce(trim(f.banco),'') is distinct from coalesce(trim(b.banco),'');
--
-- 3) Los triggers existen:
--
--   select tgname from pg_trigger
--    where tgrelid in ('public.facturas'::regclass, 'public.entregas_caja'::regclass,
--                      'public.rendiciones'::regclass)
--      and not tgisinternal
--    order by tgrelid::text, tgname;
