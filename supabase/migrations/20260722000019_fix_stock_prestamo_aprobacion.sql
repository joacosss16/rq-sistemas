-- ============================================================
-- Migración 19: corrige la interacción de la aprobación (mig. 18)
--  con las funciones/triggers antiguos.
-- 1) stock() debe descontar solo salidas Pendiente (reserva) o
--    Aprobada (comprometida), NUNCA las Rechazadas; y neto de reingreso.
-- 2) trg_prestamos_biu debe permitir la transición Solicitado→Prestado
--    / Solicitado→Rechazado (antes trataba "Solicitado" como cerrado).
-- ============================================================

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
  - coalesce((select sum(cant) from prestamos
              where origen = p_proyecto and codigo = p_codigo
                and estado in ('Prestado','Transferido')), 0)
$$;

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

  -- al activarse (ambos aprobaron), revalida stock en el origen
  if new.estado = 'Prestado' and old.estado = 'Solicitado' then
    perform pg_advisory_xact_lock(hashtext(new.origen || '/' || new.codigo));
    if new.cant > stock(new.origen, new.codigo) then
      raise exception 'Ya no hay stock suficiente en % para activar el préstamo de %',
        new.origen, new.codigo;
    end if;
  end if;

  if new.estado in ('Devuelto','Anulado') and old.estado = 'Prestado' then
    perform pg_advisory_xact_lock(hashtext(new.destino || '/' || new.codigo));
    if stock(new.destino, new.codigo) < new.cant then
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

notify pgrst, 'reload schema';
