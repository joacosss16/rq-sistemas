-- ============================================================
-- MIGRACIÓN 75 · Reparaciones del mismo día
-- ============================================================
--
-- Una revisión adversarial al trabajo del 28 de agosto encontró que varias de
-- las migraciones de ese mismo día rompieron cosas que funcionaban. Todo lo de
-- aquí repara daño propio, hecho horas antes.
--
-- La causa de fondo fue el ritmo: OCHO migraciones en un día, cada una revisada
-- por separado y ninguna contra las otras. Queda dicho para no repetirlo.

-- ------------------------------------------------------------
-- 1) LA MIGRACIÓN 72 BORRÓ TRES GUARDAS DE LA ENTREGA DE EFECTIVO
-- ------------------------------------------------------------
--
-- Al reescribir `trg_entrega_caja` se copió la versión de la migración 38...
-- que ya había sido mejorada tres veces después. Se perdieron:
--
--   · (45) No se registra una entrega con FECHA FUTURA.
--   · (46) Una entrega ATRASADA exige explicar por qué no se registró en su
--          momento; el motivo queda con el nombre de quien la puso.
--   · (45) No se AGREGA una entrega a un día ya cerrado — distinto de anular
--          una existente, que es lo que la 72 sí contempló.
--   · (48) **LA ENTREGA ABRE LA JORNADA.** La más importante de las cuatro: si
--          a Frank le entregan dinero un día en que no compra nada, sin esto la
--          rendición no existe y ese efectivo **no tiene dónde constar que lo
--          devolvió**. La migración 48 se escribió justamente para eso.
--
-- Es exactamente el error contra el que existe la regla de la casa —leer la
-- versión viva antes de reemplazar— cometido el mismo día en que se escribió.
--
-- Se restaura la versión de la migración 48 ENTERA, y se le suma lo único que
-- la 72 aportaba de nuevo: la exención para que gerencia pueda corregir una
-- entrega de un día cerrado, y el bloqueo de `recibido_por` y `creado_en`.
create or replace function public.trg_entrega_caja()
returns trigger
language plpgsql
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
-- 2) DOS ENTREGAS EN EFECTIVO DEL MISMO MONTO ERAN IMPOSIBLES
-- ------------------------------------------------------------
--
-- La regla anti-doble-clic de la migración 70 compara el número de operación
-- para distinguir dos entregas legítimas de una duplicada. Pero **en efectivo
-- ese número va vacío**: una transferencia lo tiene, el efectivo no.
--
-- Así que dos entregas de efectivo del mismo monto el mismo día —cosa normal:
-- se le entrega dinero varias veces por jornada— quedaban bloqueadas.
--
-- Se acota: la comprobación solo aplica cuando HAY número de operación, que es
-- justo el caso en que se puede distinguir. Para el efectivo se avisa en la
-- pantalla en vez de bloquear, porque no hay forma de saber si es un duplicado
-- o una segunda entrega de verdad.
create or replace function public.trg_entrega_no_duplicada()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Sin número de operación (efectivo) no se puede distinguir un doble clic de
  -- una segunda entrega legítima: no se bloquea.
  if coalesce(trim(new.num_operacion), '') = '' then
    return new;
  end if;
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
    raise exception 'Ya hay una entrega igual hoy en esta obra (S/ %, mismo medio y N° de operación %). Si es una segunda entrega de verdad, tiene que llevar su propio N° de operación.',
      to_char(new.monto, 'FM999999990.00'), new.num_operacion;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3) EL REPARTO DEL AJUSTE NO PODÍA ESCRIBIR
-- ------------------------------------------------------------
--
-- `trg_ajuste_al_convertir` (migraciones 65 y 68) reparte el importe entre las
-- líneas de la factura cuando el compromiso llega por otro monto. Pero se
-- declaró SIN `security definer`, así que corría con los permisos de quien
-- paga — y `factura_items` no tiene política de UPDATE (a propósito: eso
-- abriría la edición de precios ya facturados a cualquiera).
--
-- Resultado: el reparto no escribía nada, el desglose quedaba en el importe
-- viejo, y el guardián de cuadre —que sí es `security definer` y ve la
-- realidad— abortaba el pago entero. **La funcionalidad que dos migraciones de
-- hoy existen para dar estaba muerta**, y la pantalla prometía en un cartel que
-- los precios se ajustarían.
--
-- Se le da `security definer`, igual que llevan sus hermanas del mismo día. NO
-- se abre una política de UPDATE sobre factura_items: sería mucho peor.
create or replace function public.trg_ajuste_al_convertir()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_nombre text;
  v_suma   numeric;
  v_factor numeric;
begin
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

  if new.monto > old.monto * 2 or new.monto < old.monto / 2 then
    raise exception
      'S/ % está muy lejos de los S/ % comprometidos: revisa si sobra o falta un dígito. Si de verdad cambió tanto, gerencia anula el compromiso y se registra de nuevo con su desglose.',
      to_char(new.monto, 'FM999999990.00'), to_char(old.monto, 'FM999999990.00');
  end if;

  select coalesce(sum(fi.precio_unitario * i.cant), 0) into v_suma
    from public.factura_items fi
    join public.rq_items i on i.id = fi.rq_item_id
   where fi.factura_id = new.id;

  if v_suma > 0 then
    v_factor := new.monto / v_suma;
    update public.factura_items fi
       set precio_unitario = round(fi.precio_unitario * v_factor, 4)
     where fi.factura_id = new.id;

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
    'comprometido', old.monto, 'real', new.monto,
    'diferencia',   new.monto - old.monto,
    'por',          coalesce(v_nombre, 'desconocido'),
    'fecha',        current_date::text,
    'reparto',      'proporcional al desglose comprometido');

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 4) LA NOTA DE CRÉDITO NO MUEVE EL BANCO DE LA OBRA
-- ------------------------------------------------------------
--
-- La guarda del banco (migración 70) solo eximía al efectivo, así que pagar
-- con una nota de crédito quedaba bloqueado pidiendo un banco que esa forma de
-- pago no usa. La salida bajo presión habría sido registrarla como
-- transferencia con un número de operación inventado, que es justo lo que el
-- sistema tiene escrito para impedir.
create or replace function public.trg_banco_de_la_obra()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_banco text;
begin
  if auth.uid() is null then return new; end if;
  if new.estado_pago is distinct from 'Pagada' then return new; end if;
  -- Los medios que NO salen de la cuenta de la obra.
  if coalesce(new.medio_pago, '') in ('Efectivo', 'Nota de crédito') then return new; end if;
  if new.banco is not distinct from old.banco
     and new.estado_pago is not distinct from old.estado_pago then
    return new;
  end if;

  select banco into v_banco from public.proyectos_banco where codigo = new.proyecto;
  if v_banco is null or trim(v_banco) = '' then
    return new;
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

-- ------------------------------------------------------------
-- 5) LA RECEPCIÓN PERDIÓ EL FILTRO POR OBRA
-- ------------------------------------------------------------
--
-- `recibir_material` (migración 71) comprueba el rol pero no que el ítem sea
-- de SU obra, así que el almacenero de MAIA podía recibir material de DANAUS.
-- El UPDATE directo que había antes sí estaba limitado por la política de la
-- tabla; al mover la operación a una función `security definer` esa protección
-- se saltó, porque estas funciones corren como su dueño.
--
-- Es el riesgo propio de las funciones del servidor: hay que reponer a mano lo
-- que la política hacía sola.
create or replace function public.recibir_material(
  p_item uuid, p_cant numeric, p_obs text default null, p_caducidad date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it        record;
  v_obra    text;
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

  select * into it from public.rq_items where id = p_item for update;
  if not found then raise exception 'Ese ítem no existe.'; end if;

  -- Cada almacenero recibe SOLO lo de su obra. Gerencia puede en cualquiera.
  select r.proyecto into v_obra from public.rqs r where r.id = it.rq_id;
  if v_rol = 'almacen' and v_obra is distinct from public.mi_proyecto() then
    raise exception 'Ese material es de otra obra (%): cada almacén recibe lo suyo.', v_obra;
  end if;

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

  v_saldo := (it.estado = 'Incompleto');

  update public.rq_items
     set cant_recibida = v_total,
         fecha_entrega       = case when v_saldo then fecha_entrega else coalesce(fecha_entrega, current_date) end,
         fecha_entrega_saldo = case when v_saldo then current_date else fecha_entrega_saldo end,
         obs_almacen = case
           when coalesce(trim(p_obs), '') = '' then obs_almacen
           when coalesce(trim(obs_almacen), '') = '' then trim(p_obs)
           else obs_almacen || ' · ' || trim(p_obs) end,
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

-- ------------------------------------------------------------
-- 6) `stock_fisico` QUEDÓ ABIERTA A LA CLAVE PÚBLICA
-- ------------------------------------------------------------
-- Igual que el resto de funciones del sistema.
revoke all on function public.stock_fisico(text, text) from public, anon;
grant execute on function public.stock_fisico(text, text) to authenticated;

-- ------------------------------------------------------------
-- 7) LAS UNIDADES ENTERAS, TAMBIÉN EN LA BASE
-- ------------------------------------------------------------
--
-- La pantalla ya lo comprueba, pero una regla que solo vive en la pantalla se
-- salta — y de hecho se saltaba: los atributos `min` y `step` de un campo solo
-- valen si hay envío de formulario, y aquí no lo hay. Se registraron "2.5
-- tornillos" en una prueba real.
--
-- Una cantidad imposible viaja al almacén, a la factura y al stock.
create or replace function public.trg_cantidad_entera()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_und text;
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.cant is not distinct from old.cant then
    return new;
  end if;

  v_und := upper(coalesce(new.und, ''));
  if v_und in ('UND','PZA','JUEGO','PAR','CAJA','ROLLO','PQT','VARILLA','BOLSA','BALDE','GALON','MILLAR','CIENTO','DOCENA','SET','BLISTER')
     and new.cant <> trunc(new.cant) then
    raise exception '% no admite decimales: no existen % %. Escribe una cantidad entera.',
      v_und, to_char(new.cant, 'FM999999990.##'), lower(v_und);
  end if;
  return new;
end;
$$;

drop trigger if exists zz_cantidad_entera on public.rq_items;
create trigger zz_cantidad_entera
  before insert or update on public.rq_items
  for each row execute function public.trg_cantidad_entera();

-- ------------------------------------------------------------
-- 8) APROBAR UNA SALIDA REVALIDA EL STOCK
-- ------------------------------------------------------------
--
-- Una salida se valida contra el stock al CREARLA, pero no al aprobarla. Entre
-- las dos cosas pueden pasar días, y en ese hueco el material se puede haber
-- ido: devuelto por un préstamo, sacado por otra salida, o transferido.
--
-- El caso concreto que encontró la revisión: el almacén saca una salida que
-- queda esperando firma, y mientras tanto se devuelve un préstamo que se lleva
-- ese material. El residente firma días después y **el stock queda NEGATIVO**,
-- que es una cifra imposible: dice que salió más de lo que entró, y desde ahí
-- ningún conteo cuadra.
--
-- Se revalida al aprobar, como ya hace el préstamo al activarse.
create or replace function public.trg_salida_revalida_al_aprobar()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;
  if new.aprobacion is not distinct from old.aprobacion then return new; end if;
  if new.aprobacion <> 'Aprobada' then return new; end if;

  -- La salida ya estaba descontando como reserva, así que el stock disponible
  -- ya la incluye. Lo que se comprueba es que no haya quedado en negativo: eso
  -- significa que algo se llevó el material mientras esperaba la firma.
  perform pg_advisory_xact_lock(hashtext(new.proyecto || '/' || new.codigo));
  if public.stock(new.proyecto, new.codigo) < 0 then
    raise exception 'Ya no hay material suficiente en % para esta salida: se consumió mientras esperaba tu aprobación. Revisa el stock con el almacenero antes de aprobarla.',
      new.proyecto;
  end if;
  return new;
end;
$$;

-- `zz_` para que corra al final: primero las guardas de rol y de transición
-- deciden si la aprobación es legítima, y solo entonces se mira el stock.
drop trigger if exists zz_salida_revalida_al_aprobar on public.salidas;
create trigger zz_salida_revalida_al_aprobar
  before update on public.salidas
  for each row execute function public.trg_salida_revalida_al_aprobar();

-- ------------------------------------------------------------
-- 9) EL BOTÓN DE CORRECCIÓN DE ADMINISTRACIÓN QUEDÓ MUERTO
-- ------------------------------------------------------------
--
-- La migración 67 puso que una jornada no se marque 'Aprobada' sin pasar por
-- el arqueo. Correcto — pero dejó fuera un camino legítimo que ya existía:
-- **corregir una rendición observada** (migración 26). Administración explica
-- qué se corrigió y la jornada queda aprobada con ese rastro.
--
-- Desde esta mañana, ese botón revienta. Se exime ese camino: se reconoce
-- porque escribe `correccion`, que es el rastro de lo que se arregló.
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

  -- Una jornada aprobada está cerrada: el efectivo se contó y se firmó.
  if old.estado = 'Aprobada' and new.estado is distinct from old.estado then
    raise exception 'Esa jornada ya está aprobada y cerrada: no se reabre. Si apareció algo después, se registra en la jornada de hoy y se explica.';
  end if;

  -- Se aprueba contando el efectivo. Las DOS excepciones son caminos que ya
  -- existían y que también dejan rastro:
  --   · gerencia resuelve una diferencia  (`dif_resolucion`, migración 27)
  --   · administración corrige una observada (`correccion`, migración 26)
  if new.estado = 'Aprobada' and old.estado <> 'Aprobada'
     and new.dif_resolucion is not distinct from old.dif_resolucion
     and new.correccion     is not distinct from old.correccion then
    raise exception 'Una jornada se aprueba contando el efectivo, no marcándola aprobada.';
  end if;

  return new;
end;
$$;

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) ¿Hay cantidades imposibles de antes de la regla? (deben salir las de las
--    pruebas; se van con el reset)
--
--   select i.id, i.codigo, i.cant, i.und
--     from public.rq_items i
--    where upper(coalesce(i.und,'')) in ('UND','PZA','JUEGO','PAR','CAJA','ROLLO','PQT','VARILLA')
--      and i.cant <> trunc(i.cant);
--
-- 2) Las funciones y el trigger:
--
--   select proname, prosecdef as es_security_definer from pg_proc
--    where proname in ('trg_entrega_caja','trg_ajuste_al_convertir','recibir_material',
--                      'trg_banco_de_la_obra','trg_entrega_no_duplicada','stock_fisico')
--    order by 1;
--
--   (trg_ajuste_al_convertir y recibir_material DEBEN decir true)
--
-- 3) La prueba de verdad, en la aplicación:
--    · Registrar una entrega de efectivo en un día SIN rendición → tiene que
--      crearse la jornada sola.
--    · Dos entregas de efectivo del mismo monto el mismo día → las dos entran.
--    · Convertir un compromiso ajustando el monto → el pago entra y los precios
--      unitarios suben en la misma proporción.
--    · Una compra parcial de 2.5 sobre un material en UND → rechazada.
