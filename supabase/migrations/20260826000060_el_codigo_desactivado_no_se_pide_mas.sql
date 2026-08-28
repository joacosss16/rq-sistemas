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
