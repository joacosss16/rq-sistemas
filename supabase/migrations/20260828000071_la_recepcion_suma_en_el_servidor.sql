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
