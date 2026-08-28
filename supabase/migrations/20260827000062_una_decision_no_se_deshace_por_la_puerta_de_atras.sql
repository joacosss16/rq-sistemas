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
