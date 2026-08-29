-- ============================================================
-- MIGRACIÓN 76 · Un RQ nace entero o no nace
-- ============================================================
--
-- EL FALLO, confirmado con un caso real el 28 ago 2026: el residente hizo dos
-- clics rápidos en "Enviar" y quedaron **dos RQ**. El primero, RQ-372, nació
-- URGENTE Y COMPLETAMENTE VACÍO —cabecera con número, sin una sola línea— y
-- sobrevivió a recargar la página, o sea que está grabado en la base.
--
-- Compras lo ve como un requerimiento urgente que no pide nada.
--
-- LA CAUSA: crear un RQ eran DOS escrituras sueltas. Primero la cabecera, y
-- después las líneas. Entre una y otra puede pasar cualquier cosa —un segundo
-- clic, la red de la obra, una guarda que rechace una línea— y la cabecera ya
-- quedó grabada, con su número consumido para siempre.
--
-- Y esto empeoró hoy: la migración 60 añadió un motivo más por el que una
-- línea puede ser rechazada (pedir un material desactivado), así que había más
-- formas de acabar con la cabecera sola.
--
-- LA CORRECCIÓN. Las dos escrituras pasan a ser UNA operación del servidor. Si
-- una línea falla, no queda ni la cabecera: el RQ no existe. Es lo mismo que
-- ya se hizo con las facturas en la migración 30 —"si algo falla no queda nada
-- a medias"— y que a los RQ no se les había aplicado.
--
-- Y de paso resuelve el doble clic sin ningún truco de pantalla: dos envíos
-- iguales del mismo residente, el mismo día, con la misma partida y los mismos
-- materiales, son un doble clic. El segundo devuelve el número del primero en
-- vez de crear otro.

create or replace function public.crear_rq(
  p_proyecto      text,
  p_partida       text,
  p_almacen       text,
  p_piso          text,
  p_canal         text,
  p_justificacion text,
  p_fecha         date,
  p_items         jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_rol    text := coalesce(public.mi_rol(), '');
  v_rq     record;
  v_huella text;
  v_previo record;
  it       jsonb;
  v_n      int := 0;
begin
  if v_uid is null then
    raise exception 'Sesión no válida.';
  end if;
  -- Solo el residente crea RQs (y gerencia, que puede hacerlo por él).
  if v_rol not in ('residente', 'gerente') then
    raise exception 'Los requerimientos los crea el residente de la obra.';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Un requerimiento tiene que pedir al menos un material.';
  end if;
  if coalesce(trim(p_partida), '') = '' then
    raise exception 'Falta la partida.';
  end if;
  if p_fecha is null or p_fecha < current_date then
    raise exception 'La fecha necesitada no puede ser anterior a hoy.';
  end if;

  -- ── El doble clic ────────────────────────────────────────
  -- Dos envíos idénticos del mismo residente el mismo día son un doble clic,
  -- no dos pedidos. La huella incluye los materiales y las cantidades: pedir
  -- lo mismo otra vez de verdad, más tarde, se distingue porque casi nunca
  -- coincide hasta la última cantidad — y si coincidiera, basta con cambiar
  -- algo o esperar al día siguiente.
  v_huella := md5(p_proyecto || '|' || trim(p_partida) || '|' || coalesce(p_piso,'') || '|' ||
                  p_fecha::text || '|' || v_uid::text || '|' || p_items::text);

  select r.* into v_previo
    from public.rqs r
   where r.creado_por = v_uid
     and r.huella = v_huella
     and r.creado_en > now() - interval '2 minutes'
   limit 1;
  if found then
    -- No es un error: es el mismo envío llegando dos veces. Se devuelve el
    -- número del primero para que la pantalla muestre lo mismo que mostraría.
    return jsonb_build_object('numero', v_previo.numero, 'repetido', true);
  end if;

  insert into public.rqs (proyecto, partida, residente_id, almacen_resp, piso,
                          canal, justificacion, creado_por, huella)
  values (p_proyecto, trim(p_partida), v_uid, p_almacen, p_piso,
          p_canal, nullif(trim(coalesce(p_justificacion, '')), ''), v_uid, v_huella)
  returning * into v_rq;

  for it in select * from jsonb_array_elements(p_items) loop
    insert into public.rq_items (rq_id, codigo, cant, fecha_necesitada, destino, color, obs)
    values (v_rq.id,
            it->>'cod',
            (it->>'cant')::numeric,
            p_fecha,
            nullif(trim(coalesce(it->>'destino', '')), ''),
            nullif(trim(coalesce(it->>'color', '')), ''),
            nullif(trim(coalesce(it->>'obs', '')), ''));
    v_n := v_n + 1;
  end loop;

  -- Si cualquiera de los inserts de arriba hubiera fallado, esta función entera
  -- se revierte y la cabecera no queda: ese es todo el punto.
  return jsonb_build_object('numero', v_rq.numero, 'items', v_n, 'repetido', false);
end;
$$;

-- La huella del envío, para reconocer el doble clic. Nula en todo lo anterior.
alter table public.rqs add column if not exists huella text;
create index if not exists ix_rqs_huella on public.rqs (creado_por, huella)
  where huella is not null;

revoke all on function public.crear_rq(text, text, text, text, text, text, date, jsonb) from public, anon;
grant execute on function public.crear_rq(text, text, text, text, text, text, date, jsonb) to authenticated;

-- ── LIMPIEZA: los RQ fantasma que ya existen ─────────────────
--
-- Cabeceras sin ninguna línea. No son requerimientos: son restos de un envío
-- que falló a medias. Se borran — y es de las poquísimas veces que en este
-- sistema se borra algo, porque no hay nada que conservar: no piden nada, no
-- decidieron nada, nadie firmó nada.
--
-- El número que consumieron NO se reutiliza (es una secuencia), así que en la
-- numeración quedará un hueco. Eso es correcto: refleja que ese intento
-- existió.
delete from public.rqs r
 where not exists (select 1 from public.rq_items i where i.rq_id = r.id);

-- ------------------------------------------------------------
-- DE PASO · EL MENSAJE DE LOS DECIMALES DECÍA UN NÚMERO EQUIVOCADO
-- ------------------------------------------------------------
--
-- El residente escribió 2.5 y el sistema respondió "no existen 3 und". El
-- rechazo era correcto; el número, no. La culpa es del formato que usé ayer en
-- la migración 75: `FM999999990.##` no es un patrón válido en Postgres —los
-- decimales opcionales no se escriben con almohadillas— y acababa redondeando.
--
-- Parece un detalle y no lo es: quien lee "no existen 3" busca de dónde salió
-- ese 3 que él no escribió, y desconfía del mensaje entero.
--
-- Se pasa a convertir el número tal cual, sin formato que lo interprete.
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
      v_und, trim(to_char(new.cant, 'FM999999999.999')), lower(v_und);
  end if;
  return new;
end;
$$;

-- Y lo mismo en la recepción y la compra parcial, que usan el mismo formato.
create or replace function public.recibir_material(
  p_item uuid, p_cant numeric, p_obs text default null, p_caducidad date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it record; v_obra text; v_ya numeric; v_total numeric; v_saldo boolean;
  v_rol text := coalesce(public.mi_rol(), '');
begin
  if v_rol not in ('almacen', 'gerente') then
    raise exception 'La recepción de material la registra el almacenero de la obra.';
  end if;
  if p_cant is null or p_cant <= 0 then
    raise exception 'La cantidad que llega tiene que ser mayor que cero.';
  end if;

  select * into it from public.rq_items where id = p_item for update;
  if not found then raise exception 'Ese ítem no existe.'; end if;

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
      trim(to_char(p_cant, 'FM999999999.999')), trim(to_char(v_ya, 'FM999999999.999')),
      trim(to_char(it.cant, 'FM999999999.999')), trim(to_char(it.cant - v_ya, 'FM999999999.999'));
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

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) ¿Cuántos fantasmas había? (después de correr esto debe dar 0)
--
--   select count(*) from public.rqs r
--    where not exists (select 1 from public.rq_items i where i.rq_id = r.id);
--
-- 2) La función y la columna existen:
--
--   select proname from pg_proc where proname = 'crear_rq';
--   select column_name from information_schema.columns
--    where table_name = 'rqs' and column_name = 'huella';
--
-- 3) La prueba de verdad, en la aplicación: dos clics rápidos en "Enviar".
--    Tiene que crearse UN solo RQ, con sus materiales, y el segundo clic
--    devolver el mismo número sin crear nada.
