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
