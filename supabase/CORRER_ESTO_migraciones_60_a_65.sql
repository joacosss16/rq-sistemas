-- ============================================================
-- LAS SEIS MIGRACIONES PENDIENTES, EN ORDEN · 27 ago 2026
--
-- COMO SE CORRE: selecciona TODO este archivo (Ctrl+A), copialo (Ctrl+C) y
-- pegalo en el editor SQL de Supabase. Ejecutar una sola vez basta; si se
-- corre dos veces tampoco hace dano.
--
-- Si algo falla, el editor dice en que linea: manda ese mensaje tal cual.
--
-- AL TERMINAR, comprobar con esto (los seis deben dar 1):
--
--   select
--     (select count(*) from pg_proc where proname = 'resolver_duplicado') as m60,
--     (select count(*) from public.rq_items
--       where compra_parcial is not null and estado = 'Comprado')         as m61,
--     (select count(*) from pg_trigger
--       where tgname = 'aa_decision_solo_desde_pendiente')                as m62,
--     (select count(*) from information_schema.columns
--       where table_name = 'rq_items' and column_name = 'factor_caja')    as m63,
--     (select count(*) from pg_indexes where indexname = 'uq_factura_viva') as m64,
--     (select count(*) from information_schema.columns
--       where table_name = 'facturas' and column_name = 'ajuste_monto')   as m65;
-- ============================================================



-- ############################################################
-- ##  MIGRACION 60 · Los duplicados del catalogo: los botones de Lucia
-- ############################################################

-- ============================================================
-- MIGRACIÓN 60 · Resolver duplicados del catálogo
--
-- Un material desactivado no se puede PEDIR más, pero todo lo suyo
-- sigue vivo. Y la decisión de Lucía viaja entera o no viaja.
-- ============================================================
--
-- CONTEXTO. El catálogo real trae duplicados de fábrica: se cargó desde
-- decenas de copias de Excel, y el detector encontró 40 pares en la primera
-- pasada. Cuando Lucía confirma que dos códigos son el mismo material,
-- desactiva el perdedor: `materiales.activo = false`.
--
-- Desactivar NO es borrar, y esa diferencia es todo el diseño:
--
--   · Lo YA REGISTRADO con ese código —RQs, facturas, salidas, stock—
--     conserva su nombre y su historia. La pantalla carga los materiales
--     desactivados igual que los activos justo para eso.
--   · El STOCK FÍSICO que exista de él se puede seguir sacando: el material
--     está en el almacén, la etiqueta dice ese código, y el almacenero no
--     tiene por qué pelear con el sistema por una decisión de catálogo.
--   · Lo único que se prohíbe es PEDIR MÁS: una línea de RQ nueva con un
--     código desactivado revive el duplicado que se acaba de resolver.
--
-- ============================================================
-- A) LA REGLA: no se pide un código desactivado
-- ============================================================
--
-- POR QUÉ EN LA BASE Y NO SOLO EN LA PANTALLA. El buscador del residente ya
-- filtra los activos, pero eso solo cubre a quien abre la pantalla DESPUÉS
-- de la desactivación. El residente que ya tenía su RQ a medio escribir
-- cuando Lucía desactivó el código sigue con la lista vieja cargada en su
-- navegador y su envío pasaría. Aquí no pasa.
--
-- LAS DOS EXENCIONES, y por qué existen. Las dos salieron de un ataque
-- adversarial a la primera versión de esta migración, que no las tenía:
--
--   1. LA COMPRA PARCIAL. Cuando Frank consigue 8 de 10 bolsas, la función
--      compra_parcial() deja el ítem original en 8 e INSERTA el saldo de 2
--      con el MISMO código. Sin esta exención, el trigger rechazaba ese
--      insert y la excepción abortaba la función entera: Frank ya había
--      pagado con el efectivo de la caja chica y se quedaba sin ninguna
--      forma de registrarlo. Un saldo no es pedir más — es partir en dos lo
--      que ya se pidió y Lucía ya aprobó. El mismo escape lo usan los
--      triggers de las migraciones 51 y 57 sobre esta misma tabla.
--
--   2. SIN SESIÓN (auth.uid() nulo). Una carga de datos o un arreglo desde
--      el editor SQL no puede quedar bloqueado por una decisión de catálogo
--      posterior. Mismo criterio que la migración 57.
--
-- QUÉ NO TOCA ESTE TRIGGER, también a propósito:
--   · UPDATE de rq_items. Un ítem viejo tiene que poder recibirse, decidirse,
--     facturarse y cerrarse aunque su código se haya desactivado ayer.
--   · salidas y prestamos. Mueven stock que YA existe; ver arriba.
--   · stock_inicial. Es la foto de lo que hay en el almacén el día uno, y si
--     hay diez bolsas de un código duplicado, hay diez bolsas.
create or replace function public.trg_no_pedir_desactivado()
returns trigger
language plpgsql
as $$
declare
  v_desc text;
begin
  -- El saldo de una compra parcial hereda el código del ítem original.
  if coalesce(current_setting('rq.compra_parcial', true), '') = '1' then
    return new;
  end if;
  -- Sin sesión: carga de datos o mantenimiento.
  if auth.uid() is null then
    return new;
  end if;

  select descripcion into v_desc
    from public.materiales
   where codigo = new.codigo and activo = false;

  if found then
    raise exception 'El material % (%) está desactivado: es un duplicado ya resuelto. Busca el código vigente en el catálogo.',
      new.codigo, v_desc;
  end if;

  return new;
end;
$$;

-- Nombre con prefijo `aa_`: los BEFORE de una misma tabla corren en orden
-- ALFABÉTICO, y este tiene que rechazar la fila antes de que los demás
-- triggers hagan cuentas sobre ella.
drop trigger if exists aa_no_pedir_desactivado on public.rq_items;
create trigger aa_no_pedir_desactivado
  before insert on public.rq_items
  for each row execute function public.trg_no_pedir_desactivado();

-- ============================================================
-- B) LA DECISIÓN VIAJA ENTERA: resolver, descartar, reabrir
-- ============================================================
--
-- EL PROBLEMA QUE ESTO ARREGLA, y que casi llega a producción: resolver un
-- duplicado son DOS escrituras —desactivar el material y dejar el rastro de
-- quién lo decidió— en DOS tablas con DOS dueños distintos. `materiales` es
-- de compras; `alertas_levantadas` era de gerencia y solo de gerencia.
--
-- Así que Lucía, la dueña del catálogo y la única persona que ve estos
-- botones, podía hacer la primera escritura y no la segunda. El material
-- quedaba desactivado SIN NINGÚN RASTRO de por qué, nadie más podía
-- pedirlo, y el botón de reabrir tampoco funcionaba —borrar el rastro
-- también era de gerencia—. Media decisión, irreversible, invisible.
--
-- La corrección no es repartir permisos sueltos: es que las dos escrituras
-- sean UNA operación del servidor. Estas tres funciones son SECURITY
-- DEFINER —corren como su dueño, saltándose la RLS— y por eso lo primero
-- que hace cada una es comprobar el rol por su cuenta.
--
-- La clave del par se arma SIEMPRE con los dos códigos ordenados, para que
-- 'dup:A:B' y 'dup:B:A' sean la misma cosa y no se puedan registrar dos
-- decisiones contradictorias sobre el mismo par.

-- Confirmado: son el mismo material. Se queda el ganador, se desactiva el
-- perdedor, y el rastro dice cuál por cuál.
create or replace function public.resolver_duplicado(
  p_ganador text, p_perdedor text, p_nota text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_g   record;
  v_p   record;
  v_cl  text;
  v_uid uuid := auth.uid();
begin
  if coalesce(public.mi_rol(), '') <> 'compras' then
    raise exception 'Solo el dueño del catálogo resuelve duplicados.';
  end if;
  if p_ganador = p_perdedor then
    raise exception 'El código que se queda y el que se desactiva no pueden ser el mismo.';
  end if;

  select * into v_g from public.materiales where codigo = p_ganador;
  if not found then raise exception 'El código % no existe.', p_ganador; end if;
  select * into v_p from public.materiales where codigo = p_perdedor;
  if not found then raise exception 'El código % no existe.', p_perdedor; end if;

  -- El que se queda tiene que estar vigente: dejar los dos de baja borraría
  -- el material del catálogo sin que nadie lo haya decidido.
  if not v_g.activo then
    raise exception 'El código % está desactivado: no puede ser el que se queda.', p_ganador;
  end if;
  -- Segundo clic sobre el mismo par: ya está hecho, no se hace dos veces.
  if not v_p.activo then
    raise exception 'El código % ya estaba desactivado.', p_perdedor;
  end if;

  v_cl := 'dup:' || least(p_ganador, p_perdedor) || ':' || greatest(p_ganador, p_perdedor);

  update public.materiales set activo = false where codigo = p_perdedor;

  insert into public.alertas_levantadas (clave, tipo, detalle, nota, levantada_por)
  values (v_cl, 'Duplicado confirmado',
          p_perdedor || ' ' || v_p.descripcion || ' = ' || p_ganador || ' ' || v_g.descripcion,
          coalesce(nullif(trim(p_nota), ''), 'Se desactivó ' || p_perdedor || ': usar ' || p_ganador),
          v_uid)
  on conflict (clave) do nothing;
end;
$$;

-- Revisado: NO son el mismo material. Solo se registra la decisión, para
-- que el par no vuelva a aparecer en la lista de nadie.
create or replace function public.descartar_duplicado(
  p_cod1 text, p_cod2 text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_1 text; v_2 text; v_cl text;
begin
  if coalesce(public.mi_rol(), '') <> 'compras' then
    raise exception 'Solo el dueño del catálogo revisa duplicados.';
  end if;
  if p_cod1 = p_cod2 then
    raise exception 'Un código no puede ser duplicado de sí mismo.';
  end if;

  select descripcion into v_1 from public.materiales where codigo = p_cod1;
  if not found then raise exception 'El código % no existe.', p_cod1; end if;
  select descripcion into v_2 from public.materiales where codigo = p_cod2;
  if not found then raise exception 'El código % no existe.', p_cod2; end if;

  v_cl := 'dup:' || least(p_cod1, p_cod2) || ':' || greatest(p_cod1, p_cod2);

  insert into public.alertas_levantadas (clave, tipo, detalle, nota, levantada_por)
  values (v_cl, 'Duplicado descartado',
          p_cod1 || ' ' || v_1 || ' ≠ ' || p_cod2 || ' ' || v_2,
          'Revisado: no son el mismo material', auth.uid())
  on conflict (clave) do nothing;
end;
$$;

-- Deshacer. Si la decisión fue "es duplicado", el código desactivado vuelve
-- a estar vigente; si fue "no lo son", el par vuelve a la lista. Las dos
-- cosas, en una sola transacción, igual que al decidirlas.
create or replace function public.reabrir_duplicado(p_clave text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a record;
  v_c1 text; v_c2 text;
begin
  if coalesce(public.mi_rol(), '') <> 'compras' then
    raise exception 'Solo el dueño del catálogo reabre duplicados.';
  end if;
  if p_clave !~ '^dup:\d{6}:\d{6}$' then
    raise exception 'Esta función solo reabre decisiones sobre duplicados.';
  end if;

  select * into v_a from public.alertas_levantadas where clave = p_clave;
  if not found then raise exception 'Esa decisión ya no existe.'; end if;

  -- Los dos códigos salen de la CLAVE, no de la nota: la clave es la que
  -- manda y no depende de cómo esté redactado el texto.
  v_c1 := split_part(p_clave, ':', 2);
  v_c2 := split_part(p_clave, ':', 3);

  -- Se reactiva el que esté de baja. Si los dos están vigentes (era un
  -- descarte), no se toca ninguno.
  update public.materiales set activo = true
   where codigo in (v_c1, v_c2) and activo = false;

  delete from public.alertas_levantadas where clave = p_clave;
end;
$$;

revoke all on function public.resolver_duplicado(text, text, text) from public, anon;
revoke all on function public.descartar_duplicado(text, text)      from public, anon;
revoke all on function public.reabrir_duplicado(text)              from public, anon;
grant execute on function public.resolver_duplicado(text, text, text) to authenticated;
grant execute on function public.descartar_duplicado(text, text)      to authenticated;
grant execute on function public.reabrir_duplicado(text)              to authenticated;

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) Ningún ítem existente apunta a un material desactivado (debe dar 0;
--    si diera más, son de antes de esta regla y se quedan: el trigger no
--    los toca, solo impide crear NUEVOS):
--
--   select count(*) from public.rq_items i
--     join public.materiales m on m.codigo = i.codigo
--    where m.activo = false;
--
-- 2) El trigger y las tres funciones existen:
--
--   select tgname from pg_trigger
--    where tgrelid = 'public.rq_items'::regclass and not tgisinternal
--    order by tgname;
--
--   select proname from pg_proc
--    where proname in ('resolver_duplicado','descartar_duplicado','reabrir_duplicado')
--    order by proname;



-- ############################################################
-- ##  MIGRACION 61 · La compra parcial cierra lo conseguido
-- ############################################################

-- ============================================================
-- MIGRACIÓN 61 · La compra parcial cierra lo que YA se consiguió
-- ============================================================
--
-- EL FALLO, encontrado probando el sistema con la mano el 27 ago 2026:
-- Frank consigue 8 de 10 kilos de clavos y lo registra. El ítem se parte
-- correctamente en 8 + 2... y las DOS líneas quedan "por comprar", con sus
-- botones de comprar intactos. Los 8 que ya están pagados y en la camioneta
-- siguen figurando como pendientes.
--
-- La prueba dura: el consolidado de Compras seguía pidiendo los 10 kilos
-- completos —8 del original más 2 del saldo—, así que Lucía manda comprar
-- otra vez lo que ya está comprado. Con dinero real, eso es comprar dos veces.
--
-- Tres arreglos, todos dentro de la misma función:
--
--   A) El ítem original pasa a 'Comprado'. Es lo que de verdad ocurrió: esa
--      cantidad ya se consiguió y lo único que le falta es la factura. Solo
--      el saldo vuelve a la cola.
--
--   B) El saldo hereda la UNIDAD CONGELADA del original (`und`). Antes no la
--      copiaba, así que el saldo la deducía otra vez del catálogo — que es
--      justo lo que la migración 59 salió a impedir: el día que se carguen las
--      equivalencias de caja, un saldo de '2 CAJA' se convertiría en '2 UND'
--      sin tocar el número y sin que nadie lo notara.
--
--      OJO: copiar `und` en el insert NO BASTA, y la primera versión de esta
--      migración lo daba por hecho. `aa_congelar_unidad` (migración 59) pisa
--      `new.und` en TODA inserción, sin mirar de dónde viene, así que borraba
--      la unidad heredada y volvía a deducirla del catálogo. Por eso abajo se
--      le añade la misma exención que ya usan sus dos triggers hermanos.
--
--   C) La fila se bloquea antes de partirla. Dos clics seguidos en "Registrar"
--      podían entrar a la vez, leer los dos el mismo ítem entero y crear DOS
--      saldos. La guarda de `compra_parcial is not null` no alcanzaba: ninguna
--      de las dos transacciones veía todavía lo que escribía la otra.
--
-- Lo demás de la función se conserva palabra por palabra: los roles, el
-- motivo obligatorio, las guardas de recibido y facturado, el rango de la
-- cantidad, el aviso `rq.compra_parcial` a los otros triggers y el cierre de
-- saldo de Compras. Se reescribe entera porque en PL/pgSQL no hay forma de
-- parchear un trozo.
-- ── A.0) La unidad heredada tiene que sobrevivir al trigger ──────
--
-- `trg_congelar_unidad` estampa la unidad desde el catálogo en cada inserción,
-- ignorando lo que mande el cliente. Esa regla es correcta y se conserva: si
-- se dejara elegir, se podría registrar "3 CAJA" de algo que se vende suelto.
--
-- Pero el saldo de una compra parcial no lo manda un cliente: lo manda esta
-- función, copiando la unidad que el ítem original ya tenía congelada. Sin
-- esta exención, un saldo de "2 CAJA" nacía como "2 UND": Frank compraba dos
-- unidades sueltas donde faltaban dos cajas de cien, y el día que llegara la
-- caja de verdad el almacenero no podría ni recibirla, porque la recepción
-- compara contra un pedido que dice 2.
--
-- La condición `new.und is not null` mantiene la regla en pie: solo se respeta
-- una unidad que venga puesta, y del cliente nunca viene puesta.
create or replace function public.trg_congelar_unidad()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(current_setting('rq.compra_parcial', true), '') = '1'
     and new.und is not null then
    return new;
  end if;
  select coalesce(m.und_base, m.und) into new.und
    from public.materiales m where m.codigo = new.codigo;
  return new;
end;
$$;

create or replace function public.compra_parcial(
  p_item uuid, p_cant numeric, p_motivo text, p_cerrar_saldo boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  it      record;
  v_resto numeric;
  v_rol   text := coalesce(public.mi_rol(), '');
  v_nombre text;
begin
  if v_rol not in ('compras', 'comprador') then
    raise exception 'Una compra parcial la registra Compras o el comprador.';
  end if;
  if coalesce(p_cerrar_saldo, false) and v_rol <> 'compras' then
    raise exception 'Dar por cerrado lo que falta es decisión de Compras. Registra la compra parcial y deja el saldo pendiente; Lucía decide si se sigue buscando.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Una compra parcial exige explicar por qué no se consiguió todo.';
  end if;

  -- (C) Bloqueo de la fila: el segundo clic espera aquí y, cuando entra, ya ve
  -- el ítem partido — así choca contra la guarda de abajo en vez de duplicar.
  select * into it from public.rq_items where id = p_item for update;
  if not found then raise exception 'Ítem no encontrado.'; end if;
  if it.decision <> 'Aprobado' then
    raise exception 'Solo se parte un ítem aprobado (este está %).', it.decision;
  end if;
  if coalesce(it.cant_recibida, 0) > 0 then
    raise exception 'Ese ítem ya tiene material recibido en almacén: la cantidad no se puede partir. Corrige primero la recepción.';
  end if;
  if exists (select 1 from public.factura_items where rq_item_id = p_item) then
    raise exception 'Ese ítem ya está facturado: no se puede partir. Si la factura está mal, gerencia la anula y se registra de nuevo.';
  end if;
  if it.compra_parcial is not null then
    raise exception 'Ese ítem ya se partió una vez. El saldo quedó como un ítem aparte: trabaja sobre ese.';
  end if;
  if not (p_cant > 0 and p_cant < it.cant) then
    raise exception 'Lo conseguido tiene que estar entre 1 y % (que es lo pedido). Si conseguiste todo, marca el ítem como comprado normalmente.', it.cant;
  end if;

  v_resto := it.cant - p_cant;
  select nombre into v_nombre from public.usuarios where id = auth.uid();

  -- Aviso a la guarda del comprador: este cambio viene de aquí.
  perform set_config('rq.compra_parcial', '1', true);

  update public.rq_items
     set cant = p_cant,
         -- (A) Lo conseguido queda COMPRADO: ya se pagó y está en la camioneta.
         -- Solo se marca si el ítem no traía ya un estado logístico propio.
         estado = case when coalesce(it.estado, '—') = '—' then 'Comprado' else it.estado end,
         compra_parcial = jsonb_build_object(
           'pedido',        it.cant,
           'conseguido',    p_cant,
           'saldo',         v_resto,
           'motivo',        trim(p_motivo),
           'por',           coalesce(v_nombre, 'desconocido'),
           'fecha',         current_date::text,
           'saldo_cerrado', coalesce(p_cerrar_saldo, false))
   where id = p_item;

  insert into public.rq_items (
    rq_id, codigo, cant, und, fecha_necesitada, destino, color, obs,
    decision, motivo_rechazo, fecha_caducidad, decidido_en, decidido_por)
  values (
    -- (B) `und` viaja del original al saldo: la unidad no se vuelve a deducir.
    it.rq_id, it.codigo, v_resto, it.und, it.fecha_necesitada, it.destino, it.color,
    trim(coalesce(it.obs || ' · ', '') || 'Saldo de compra parcial: ' || trim(p_motivo)),
    case when coalesce(p_cerrar_saldo, false) then 'Rechazado' else 'Aprobado' end,
    case when coalesce(p_cerrar_saldo, false) then trim(p_motivo) else null end,
    it.fecha_caducidad, it.decidido_en, it.decidido_por);

  -- Se apaga la marca. Muere sola con la transacción, pero dejarla encendida
  -- eximiría de sus guardas a cualquier inserción posterior que ocurriera
  -- dentro de la misma transacción.
  perform set_config('rq.compra_parcial', '', true);
end;
$$;

revoke all on function public.compra_parcial(uuid, numeric, text, boolean) from public, anon;
grant execute on function public.compra_parcial(uuid, numeric, text, boolean) to authenticated;

-- ── Arrastre de lo ya partido antes de esta migración ─────────
--
-- Las compras parciales registradas hasta hoy dejaron su original en '—'.
-- Si no se corrigen, el consolidado las sigue pidiendo enteras. Se marcan
-- como compradas: por definición, esa cantidad ya se consiguió.
--
-- VA EN DOS PASOS, y el motivo importa. Al pasar de '—' a 'Comprado', dos
-- triggers estampan la firma y la fecha de la compra: `comprado_por` con
-- `auth.uid()` y `fecha_compra` con el día de hoy. Corriendo esto desde el
-- editor SQL no hay sesión, así que `auth.uid()` es NULO — y un ítem comprado
-- por Frank con la firma vacía DESAPARECE de sus dos pantallas: sale de
-- "Compras del día" (que lista lo que aún no se compró) y nunca entra a su
-- pestaña de facturar (que filtra por lo que compró él). Habría pagado con el
-- efectivo de la caja chica y se quedaría sin dónde registrar la factura, con
-- la rendición de ese día sin cerrar y sin ningún aviso de por qué.
--
-- El segundo paso lo repone desde el rastro que la propia compra parcial ya
-- guardó: quién la registró y qué día. Y funciona sin desactivar nada, porque
-- los dos triggers solo actúan en la transición '—' → 'Comprado': en el
-- segundo UPDATE el ítem ya está 'Comprado', así que conservan lo que haya.
update public.rq_items
   set estado = 'Comprado'
 where compra_parcial is not null
   and coalesce(estado, '—') = '—'
   and decision = 'Aprobado';

update public.rq_items i
   set comprado_por = coalesce(
         i.comprado_por,
         (select u.id from public.usuarios u
           where u.nombre = i.compra_parcial->>'por' limit 1)),
       fecha_compra = coalesce(
         (i.compra_parcial->>'fecha')::date,
         i.fecha_compra)
 where i.compra_parcial is not null
   and i.estado = 'Comprado'
   and (i.comprado_por is null or i.fecha_compra is distinct from (i.compra_parcial->>'fecha')::date);

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) Ningún ítem partido se quedó sin estado (debe dar 0):
--
--   select count(*) from public.rq_items
--    where compra_parcial is not null and coalesce(estado,'—') = '—'
--      and decision = 'Aprobado';
--
-- 1b) Y NINGUNO se quedó sin la firma de quién compró (debe dar 0). Si alguno
--     sale, es que el nombre guardado en el rastro no coincide con ningún
--     usuario: hay que asignarlo a mano antes de que Frank lo eche en falta.
--
--   select id, codigo, compra_parcial->>'por' as decia_quien
--     from public.rq_items
--    where compra_parcial is not null and estado = 'Comprado'
--      and comprado_por is null;
--
-- 2) Los saldos creados desde ahora llevan unidad propia. Los de antes NO
--    (nacieron sin ella); se ven así, y su unidad se sigue deduciendo:
--
--   select id, codigo, cant, und, obs from public.rq_items
--    where obs like 'Saldo de compra parcial%' order by creado_en desc;



-- ############################################################
-- ##  MIGRACION 62 · Una decision no se deshace por la puerta de atras
-- ############################################################

-- ============================================================
-- MIGRACIÓN 62 · Una decisión no se deshace por la puerta de atrás
-- ============================================================
--
-- EL AGUJERO. `decision` no tenía ninguna guarda de transición: la base
-- aceptaba cualquier cambio de un valor a otro, y ninguno de los nueve
-- triggers que ya viven sobre rq_items lo miraba (los tres que tocan
-- `decision` abren con `if new.decision = 'Anulado'`, así que 'Rechazado'
-- pasaba de largo).
--
-- Consecuencia comprobada: un ítem YA APROBADO, YA COMPRADO, YA FACTURADO o
-- YA RECIBIDO EN ALMACÉN podía pasar a 'Rechazado'. Y entonces:
--
--   · `public.stock()` exige `decision = 'Aprobado'`, así que el material
--     DESAPARECE del stock — con las bolsas físicamente en la obra, y sin que
--     el almacenero lo vea ni pueda hacer nada.
--   · La factura sigue viva y se paga igual: la guarda de factura_items es
--     BEFORE INSERT y ya se ejecutó.
--   · La firma queda mintiendo: `decidido_por` conserva a quien APROBÓ, así
--     que el rechazo aparece firmado por otra persona y con la hora de la
--     aprobación.
--   · Y no hay vuelta atrás desde la aplicación: un ítem rechazado sale de
--     todas las listas de Compras. Hay que entrar a la base a mano.
--
-- LA REGLA. Solo se decide lo que está PENDIENTE. Un ítem ya decidido no
-- cambia de decisión: si hay que darlo de baja, se ANULA — que exige motivo,
-- pasa por gerencia, deja rastro y ya tiene sus propias guardas (no se anula
-- lo recibido, ni lo facturado).
--
-- LAS EXENCIONES, las mismas de siempre y por los mismos motivos:
--   · La compra parcial (marca `rq.compra_parcial`): parte un ítem aprobado y
--     puede dejar el saldo como 'Rechazado' cuando Compras cierra lo que falta.
--   · Sin sesión (auth.uid() nulo): cargas de datos y mantenimiento.
--   · Cualquier cambio HACIA 'Anulado', que es el camino legítimo y ya está
--     custodiado por las migraciones 22, 24, 29 y 31.
create or replace function public.trg_decision_solo_desde_pendiente()
returns trigger
language plpgsql
as $$
begin
  if new.decision is not distinct from old.decision then
    return new;                      -- no se está tocando la decisión
  end if;
  if coalesce(current_setting('rq.compra_parcial', true), '') = '1' then
    return new;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if new.decision = 'Anulado' then
    return new;                      -- la anulación tiene su propio camino
  end if;

  if old.decision <> 'Pendiente' then
    raise exception
      'Ese ítem ya está % y una decisión no se deshace: no se puede pasar a %. Si hay que darlo de baja, anúlalo — deja motivo, rastro y pasa por gerencia.',
      old.decision, new.decision;
  end if;

  return new;
end;
$$;

-- `aa_` para que corra antes que los demás BEFORE de esta tabla: si la fila se
-- va a rechazar, mejor que se rechace antes de que nadie haga cuentas con ella.
drop trigger if exists aa_decision_solo_desde_pendiente on public.rq_items;
create trigger aa_decision_solo_desde_pendiente
  before update on public.rq_items
  for each row execute function public.trg_decision_solo_desde_pendiente();

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) ¿Hay ítems rechazados que además tienen material recibido o factura?
--    Serían víctimas del agujero, de antes de esta regla. Si aparece alguno,
--    hay que revisarlo A MANO con Lucía: el material puede estar en obra.
--
--   select i.id, i.codigo, i.cant, i.cant_recibida, i.decision,
--          (select count(*) from public.factura_items fi where fi.rq_item_id = i.id) facturas
--     from public.rq_items i
--    where i.decision = 'Rechazado'
--      and (coalesce(i.cant_recibida,0) > 0
--           or exists (select 1 from public.factura_items fi where fi.rq_item_id = i.id));
--
-- 2) El trigger existe y corre primero:
--
--   select tgname from pg_trigger
--    where tgrelid = 'public.rq_items'::regclass and not tgisinternal
--    order by tgname;



-- ############################################################
-- ##  MIGRACION 63 · El factor de caja viaja congelado en la linea
-- ############################################################

-- ============================================================
-- MIGRACIÓN 63 · El factor de caja viaja congelado en la línea
-- ============================================================
--
-- Hermana de la migración 59, que hizo esto mismo con la unidad. Aquí va lo
-- que faltaba: CUÁNTAS UNIDADES TRAÍA LA CAJA el día que se registró la línea.
--
-- EL PROBLEMA. `materiales.factor_caja` es un dato del PRESENTE: dice cuántas
-- unidades trae hoy una caja de ese material. Pero se usa para interpretar el
-- PASADO — y un proveedor cambia el empaque cuando quiere. El día que la caja
-- de clavos pase de 100 a 120 y Lucía actualice la equivalencia, todo lo ya
-- registrado se reinterpreta solo, sin que nadie toque nada:
--
--   · El precio promedio y el historial con el que se negocia. La función que
--     normaliza precios a unidad base (src/App.jsx) divide el precio de la
--     caja entre el factor. Con el factor nuevo, una compra de hace tres meses
--     pasa de S/1.00 por unidad a S/0.83 — y el valorizado del almacén y el
--     cierre mensual ya firmado cambian con ella.
--   · La recepción. El almacenero ve "cajas × unidades por caja" con el factor
--     de hoy propuesto para un pedido de antes.
--
-- Nadie se entera, porque no hay error: solo cifras distintas de las de ayer.
--
-- LA REGLA, la misma de siempre en este sistema: el dato con el que se decidió
-- se guarda con la decisión. El catálogo dice cómo se compra HOY; la línea
-- dice cómo se compró ESE DÍA. Cambiar el catálogo no reescribe el pasado.

alter table public.rq_items
  add column if not exists factor_caja numeric(10,2) check (factor_caja > 0);

comment on column public.rq_items.factor_caja is
  'Unidades por caja el día que se creó la línea. Congelado: el catálogo puede cambiar, esta línea no. Nulo = el material no se compra por caja.';

-- ── Relleno de lo ya registrado ──────────────────────────────
-- Se copia el factor actual del catálogo. Para las líneas de antes es la mejor
-- suposición disponible —y hoy es exacta, porque ningún material tiene factor
-- cargado todavía: las equivalencias de Lucía aún no entraron. Desde el
-- momento en que las cargue, cada línea nueva guarda el suyo.
update public.rq_items i
   set factor_caja = m.factor_caja
  from public.materiales m
 where m.codigo = i.codigo
   and i.factor_caja is null
   and m.factor_caja is not null;

-- ── Y se congela al crear, igual que la unidad ───────────────
--
-- Se amplía `trg_congelar_unidad`, que ya hace exactamente esto con `und` y ya
-- corre sobre esta tabla: son el mismo dato visto de dos formas —en qué unidad
-- está la línea y cuántas unidades trae su envase— y separarlos en dos
-- triggers solo abre la puerta a que uno se actualice y el otro no.
--
-- La exención de la compra parcial (migración 61) se conserva y ahora cubre
-- las dos columnas: el saldo hereda del ítem original tanto la unidad como el
-- factor, en vez de volver a deducirlos del catálogo.
create or replace function public.trg_congelar_unidad()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(current_setting('rq.compra_parcial', true), '') = '1'
     and new.und is not null then
    return new;
  end if;
  select coalesce(m.und_base, m.und) into new.und
    from public.materiales m where m.codigo = new.codigo;
  -- Solo rq_items tiene esta columna; en salidas, préstamos y stock_inicial
  -- las cantidades ya viven en unidad de consumo y no hay nada que convertir.
  if tg_table_name = 'rq_items' then
    select m.factor_caja into new.factor_caja
      from public.materiales m where m.codigo = new.codigo;
  end if;
  return new;
end;
$$;

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) La columna existe y las líneas de materiales con caja la tienen puesta.
--    Hoy debe dar 0 filas (ningún material tiene factor cargado todavía);
--    después de que Lucía cargue las equivalencias, dará las que correspondan:
--
--   select i.codigo, count(*) lineas, count(i.factor_caja) con_factor
--     from public.rq_items i
--     join public.materiales m on m.codigo = i.codigo
--    where m.factor_caja is not null
--    group by i.codigo order by 1;
--
-- 2) Prueba de que el pasado ya no se mueve: cargar una equivalencia y
--    comprobar que las líneas anteriores conservan su factor.
--
--   -- antes:  select codigo, cant, und, factor_caja from public.rq_items where codigo = '<uno>';
--   -- cargar: update public.materiales set factor_caja = 100, und_base = 'UND' where codigo = '<uno>';
--   -- después: la MISMA consulta debe devolver exactamente lo mismo.



-- ############################################################
-- ##  MIGRACION 64 · Una factura anulada no ocupa su numero
-- ############################################################

-- ============================================================
-- MIGRACIÓN 64 · Una factura anulada no ocupa su número
-- ============================================================
--
-- EL CALLEJÓN SIN SALIDA. Lucía teclea S/ 1,690 donde el papel dice S/ 169.
-- Los datos comerciales de una factura están congelados a propósito, así que
-- el único camino es el que documentan las migraciones 29, 42 y 53: gerencia
-- la anula con motivo, y se registra de nuevo bien.
--
-- Gerencia la anula. Lucía abre el formulario, teclea el mismo número real —el
-- ÚNICO que existe, el impreso en el papel del proveedor— y el sistema
-- responde que esa factura ya está registrada. Y ahí se acaba: la anulada no
-- se edita, el número no se puede reusar, y el proveedor no va a emitir otro
-- documento porque nosotros nos equivocamos al digitar.
--
-- La salida natural bajo presión es inventar una variante —'F001-000123-B'—,
-- que es exactamente lo que el sistema le prohíbe por escrito a Pagos; o dejar
-- la compra fuera del sistema, rompiendo la regla de adopción: "RQ que no entra
-- por el sistema, no se compra".
--
-- LA CORRECCIÓN. La restricción pasa de "este número con este RUC no se repite
-- NUNCA" a "no se repite entre las VIVAS". Una factura anulada está muerta:
-- su rastro se conserva entero y visible tachado, pero deja de reservar el
-- número que en realidad pertenece al documento del proveedor, no a nosotros.
--
-- Lo que NO cambia: dos facturas vivas con el mismo número y RUC siguen siendo
-- imposibles, que es lo que la restricción vino a impedir.

-- (el begin/commit propio se quita: el editor ya abre su transaccion)

-- Antes de tocar nada: si ya hubiera duplicados vivos, esto falla y no se
-- aplica. No debería haberlos —la restricción actual los impide—, pero si el
-- índice no se puede crear es señal de que algo más pasó y hay que mirarlo.
alter table public.facturas drop constraint if exists uq_factura;

create unique index if not exists uq_factura_viva
  on public.facturas (serie, proveedor_ruc)
  where anulacion is null;

comment on index public.uq_factura_viva is
  'Serie + RUC únicos entre las facturas VIGENTES. Una anulada libera su número: es el del documento del proveedor, y la corrección oficial (anular y volver a registrar) necesita poder reusarlo.';


-- ── Comprobación tras correrla ────────────────────────────────
-- 1) No quedaron duplicados vivos (debe dar 0 filas):
--
--   select serie, proveedor_ruc, count(*)
--     from public.facturas where anulacion is null
--    group by 1, 2 having count(*) > 1;
--
-- 2) El índice existe y la restricción vieja ya no:
--
--   select indexname from pg_indexes
--    where tablename = 'facturas' and indexname like 'uq_factura%';
--
--   Debe aparecer `uq_factura_viva` y NO `uq_factura`.
--
-- 3) La prueba de verdad, en la aplicación: registrar una factura, que
--    gerencia la anule, y volver a registrarla con el MISMO número. Antes de
--    esta migración era imposible; ahora tiene que entrar.



-- ############################################################
-- ##  MIGRACION 65 · La factura real puede llegar por otro monto
-- ############################################################

-- ============================================================
-- MIGRACIÓN 65 · La factura real puede llegar por otro monto
-- ============================================================
--
-- EL CALLEJÓN. Lucía registra un compromiso de crédito por S/ 500: el
-- proveedor da crédito y emitirá la factura recién al cobrar. Llega el día del
-- pago y la factura real dice S/ 520 — un flete que no estaba, un redondeo, un
-- precio que se movió. Cosa de todos los días.
--
-- Al convertir el compromiso, hoy lo único que se puede escribir es la serie:
-- el trigger de la migración 54 rechaza cualquier cambio de monto. Así que la
-- deuda que el sistema registra y la que el proveedor cobra dejan de coincidir,
-- y una vez pagada la factura queda congelada para siempre. La única salida es
-- anular y rehacer, lo que además obliga a repetir el desglose por ítem.
--
-- LA CORRECCIÓN. El monto puede ajustarse EN EL MOMENTO DE LA CONVERSIÓN, que
-- es cuando el papel del proveedor llega y se sabe la cifra de verdad. Con tres
-- condiciones, y ninguna es adorno:
--
--   1. SOLO en esa transición. Una factura normal sigue sin poder cambiar de
--      monto, y una ya pagada tampoco. Este permiso no se hereda.
--   2. CON RASTRO, y lo estampa el SERVIDOR. Queda guardado cuánto se
--      comprometió, cuánto se pagó, quién lo ajustó y cuándo. Un ajuste de
--      importe sin rastro es justo lo que no puede existir en un sistema de
--      dinero — y si lo escribiera el navegador, no sería rastro sino adorno.
--   3. El desglose por ítem tiene que seguir cuadrando. De eso ya se encarga
--      el trigger de la migración 5 (tolerancia S/ 0.50), que no se toca: si
--      la factura real trae otro importe, hay que decir a qué ítem le
--      corresponde. Un ajuste global sin repartir no pasa.

alter table public.facturas
  add column if not exists ajuste_monto jsonb;

comment on column public.facturas.ajuste_monto is
  'Rastro del ajuste al convertir un compromiso en factura real: comprometido, real, quién y cuándo. Nulo = la factura llegó por el importe comprometido.';

create or replace function public.trg_ajuste_al_convertir()
returns trigger
language plpgsql
as $$
declare
  v_nombre text;
begin
  -- Solo interesa la conversión de compromiso a factura con cambio de importe.
  if not (old.tipo_doc = 'Compromiso' and new.tipo_doc = 'Factura') then
    -- Fuera de la conversión, el rastro es intocable: ni se inventa ni se borra.
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

  select nombre into v_nombre from public.usuarios where id = auth.uid();

  -- Lo escribe el servidor, con su propia hora y su propia firma.
  new.ajuste_monto := jsonb_build_object(
    'comprometido', old.monto,
    'real',         new.monto,
    'diferencia',   new.monto - old.monto,
    'por',          coalesce(v_nombre, 'desconocido'),
    'fecha',        current_date::text);

  return new;
end;
$$;

-- `zz_` para que corra AL FINAL, después de las guardas de la migración 54:
-- primero se comprueba que la conversión es legítima, y solo entonces se sella
-- el rastro. Si corriera antes, sellaría ajustes de operaciones que van a ser
-- rechazadas.
drop trigger if exists zz_ajuste_al_convertir on public.facturas;
create trigger zz_ajuste_al_convertir
  before update on public.facturas
  for each row execute function public.trg_ajuste_al_convertir();

-- ── Y la guarda de la 54 deja pasar el monto en la conversión ─
--
-- Se reescribe `trg_facturas_bu` ENTERA —en PL/pgSQL no se parchea un trozo—
-- copiada palabra por palabra de la migración 54, con UN SOLO cambio: en la
-- rama Compromiso → Factura, `new.monto is distinct from old.monto` sale de la
-- lista de campos intocables.
--
-- Todo lo demás queda igual, y conviene leer lo que NO cambia: la anulación
-- sigue siendo de gerencia y con motivo, una factura anulada sigue sin admitir
-- cambios, el RUC y la obra siguen congelados también en la conversión, la rama
-- Pendiente → Factura no se toca (ahí la compra YA está pagada, el dinero salió
-- del banco y no hay nada que ajustar), los datos comerciales de una factura
-- normal siguen sin editarse, no se paga un compromiso sin serie real, una
-- factura pagada sigue congelada salvo conciliación, y la conciliación sigue
-- siendo exclusiva de gerencia.
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

  if new.conciliada is distinct from old.conciliada and public.mi_rol() <> 'gerente' then
    raise exception 'La conciliación bancaria es exclusiva de gerencia.';
  end if;

  return new;
end;
$$;

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) La columna y el trigger nuevo existen:
--
--   select column_name from information_schema.columns
--    where table_name = 'facturas' and column_name = 'ajuste_monto';
--
--   select tgname from pg_trigger
--    where tgrelid = 'public.facturas'::regclass and not tgisinternal
--    order by tgname;
--
-- 2) Los ajustes que se vayan haciendo, para vigilarlos:
--
--   select serie, proveedor_ruc, monto,
--          ajuste_monto->>'comprometido' as se_comprometio,
--          ajuste_monto->>'diferencia'   as diferencia,
--          ajuste_monto->>'por'          as lo_ajusto,
--          ajuste_monto->>'fecha'        as cuando
--     from public.facturas
--    where ajuste_monto is not null
--    order by (ajuste_monto->>'fecha') desc;
