-- ============================================================
-- Migración 57 · Una línea de RQ nace SIEMPRE pendiente y sin recibir
--
-- EL AGUJERO
-- Las reglas "solo Compras aprueba" y "solo el almacén recibe" estaban
-- puestas como guarda sobre la MODIFICACIÓN de una línea (migración 34,
-- rq_items_almacen_guard, que es `before update`). Nunca sobre el ALTA.
-- Y la política de alta (migración 20) solo comprueba de quién es el RQ:
-- no restringe ni una columna.
--
-- Resultado: un residente, con su sesión normal y sin la contraseña de
-- nadie, podía grabar una línea que nace ya 'Aprobado' — Frank la ve al
-- día siguiente en su lista y la compra, sin que Lucía la haya visto — y
-- ya con cant_recibida, fabricando stock que nunca entró, del que después
-- cuelgan salidas y préstamos entre razones sociales. Sin firma de quién
-- aprobó, porque decidido_por quedaba vacío. Y sin forma de limpiarlo
-- desde la aplicación: hay que entrar a la base a mano.
--
-- Es EL MISMO patrón que ya se cerró en salidas y préstamos (migración
-- 36), en rendiciones (37) y en facturas (54). Nunca se cerró en el punto
-- de entrada de todo el sistema, que es justo el que más importa: lo que
-- nace mal aquí lo hereda el stock, el Tablero y la contabilidad.
--
-- LA REGLA
-- Toda línea nueva nace Pendiente, sin recibir, sin pagar, sin firmas y
-- sin rastros de decisiones que todavía no ocurrieron. El cliente puede
-- decir QUÉ se pide (material, cantidad, fecha, destino, color, obs,
-- caducidad); todo lo demás lo pone el sistema más adelante, cada cosa
-- por su camino y con su firma.
--
-- LOS DOS CAMINOS LEGÍTIMOS QUE SÍ CREAN LÍNEAS YA DECIDIDAS
-- Se comprobaron leyendo el código antes de escribir esta guarda:
--   1. El PEDIDO POR COTIZACIÓN de Lucía (enchapes). Nace aprobado por
--      diseño: la cotización ya viene decidida por el arquitecto. Se
--      reconoce porque su RQ tiene tipo = 'Cotizacion'.
--   2. El SALDO DE COMPRA PARCIAL (migraciones 49/51). Hereda la decisión
--      del ítem original, que Lucía ya aprobó. Se reconoce por la marca
--      de transacción rq.compra_parcial, el mismo mecanismo que ya usa
--      la migración 51.
-- Cualquier otro camino nace limpio.
--
-- SIN SESIÓN NO SE TOCA NADA: las cargas desde el editor SQL (semillas,
-- mantenimiento, reconstrucción de la base) tienen auth.uid() nulo y
-- pasan sin modificar. Es la misma excepción de la migración 36.
-- ============================================================

begin;

create or replace function public.trg_rq_items_nacen_pendientes()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_tipo text;
begin
  -- Sin sesión: carga de datos, no operación de negocio.
  if auth.uid() is null then
    return new;
  end if;

  -- El saldo de una compra parcial hereda la decisión del ítem original.
  if coalesce(current_setting('rq.compra_parcial', true), '') = '1' then
    return new;
  end if;

  -- El pedido por cotización nace aprobado por diseño.
  select tipo into v_tipo from public.rqs where id = new.rq_id;
  if v_tipo = 'Cotizacion' then
    -- La cotización nace decidida, pero la FIRMA la pone el servidor: si
    -- se dejara pasar la del cliente, este mismo camino permitiría grabar
    -- "la aprobó Lucía a tal hora" sin que fuera verdad — el agujero que
    -- esta migración vino a cerrar, colado por la puerta de al lado.
    new.decidido_por      := auth.uid();
    new.decidido_en       := now();
    new.motivo_rechazo    := null;
    -- Y lo que no decide la cotización se limpia igual: nadie recibe ni
    -- paga en el momento de crear el pedido.
    new.estado            := '—';
    new.pago              := '—';
    new.cant_recibida     := 0;
    new.fecha_entrega     := null;
    new.obs_almacen       := null;
    new.correcciones      := '[]'::jsonb;
    new.comprado_por      := null;
    new.fecha_compra      := null;
    new.tomado_por        := null;
    new.tomado_en         := null;
    new.compra_parcial    := null;
    new.anulacion         := null;
    return new;
  end if;

  -- Camino normal: la línea nace limpia, diga lo que diga el cliente.
  new.decision            := 'Pendiente';
  new.motivo_rechazo      := null;
  new.decidido_por        := null;
  new.decidido_en         := null;
  new.estado              := '—';
  new.pago                := '—';
  new.cant_recibida       := 0;
  new.fecha_entrega       := null;
  new.fecha_recojo_saldo  := null;
  new.fecha_entrega_saldo := null;
  new.destino_saldo       := null;
  new.comunico_residente  := null;
  new.obs_almacen         := null;
  new.correcciones        := '[]'::jsonb;
  new.comprado_por        := null;
  new.fecha_compra        := null;
  new.tomado_por          := null;
  new.tomado_en           := null;
  new.compra_parcial      := null;
  new.anulacion           := null;
  new.anulacion_solicitud := null;
  new.anulacion_rechazo   := null;

  return new;
end;
$$;

-- El prefijo aa_ lo hace correr ANTES que rq_items_biu (los triggers
-- BEFORE de una tabla corren en orden alfabético por su nombre). Así
-- rq_items_biu calcula el canal y valida la fecha sobre la fila ya
-- limpia. Si alguien lo renombra sin el prefijo, la limpieza pasa a
-- ocurrir después de las validaciones y el orden deja de ser el pensado.
drop trigger if exists aa_rq_items_nacen_pendientes on public.rq_items;
create trigger aa_rq_items_nacen_pendientes
  before insert on public.rq_items
  for each row execute function public.trg_rq_items_nacen_pendientes();

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- ANTES DE CORRER, comprobar si el agujero ya se usó.
--
-- Una línea decidida SIN firma de quién la decidió es la huella exacta.
-- Hay que descartar dos casos legítimos: los saldos de compra parcial
-- (que heredan la decisión del original) y todo lo anterior al 12 de
-- agosto, que es cuando la migración 40 empezó a guardar la firma.
--
-- OJO: la marca `compra_parcial` se queda en el ítem ORIGINAL, no en el
-- saldo — por eso el saldo se identifica buscando a su hermano, no por
-- esa columna. (Una primera versión de esta consulta filtraba al revés
-- y habría dado falsas alarmas.)
--
--   with saldos as (
--     select h.id from public.rq_items h
--       join public.rq_items o
--         on o.rq_id = h.rq_id and o.codigo = h.codigo and o.id <> h.id
--        and o.compra_parcial is not null
--        and (o.compra_parcial ->> 'saldo')::numeric = h.cant
--   )
--   select r.numero as rq, r.proyecto, i.codigo, i.cant,
--          i.decision, i.estado, i.cant_recibida,
--          i.creado_en at time zone 'America/Lima' as creado_hora_cusco
--     from public.rq_items i
--     join public.rqs r on r.id = i.rq_id
--    where r.tipo = 'RQ'
--      and i.id not in (select id from saldos)
--      and i.decision <> 'Pendiente'
--      and i.decidido_por is null
--    order by i.creado_en desc;
--
-- Cómo leerla: filas creadas ANTES del 12 de agosto son normales. Una
-- posterior a esa fecha sí usó el agujero — mirarla una por una y avisar
-- antes de seguir. Cerrar la puerta no limpia lo que ya entró.
--
-- CÓMO COMPROBAR DESPUÉS
-- 1. Un residente crea un RQ normal: la línea nace Pendiente. Igual que antes.
-- 2. Lucía aprueba y Frank compra: el circuito completo sigue funcionando.
-- 3. Lucía registra un pedido por cotización: sus líneas siguen naciendo
--    Aprobadas (es el camino legítimo 1).
-- 4. Frank registra una compra parcial: el saldo sigue naciendo con la
--    decisión heredada (camino legítimo 2).
-- 5. El agujero cerrado: una línea creada por fuera de la pantalla con
--    decision='Aprobado' y cant_recibida=500 tiene que quedar guardada
--    igual, pero como Pendiente, sin recibir y sin firma.
-- ============================================================
