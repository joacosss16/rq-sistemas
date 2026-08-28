-- ============================================================
-- MIGRACIÓN 74 · Durante el piloto no se transfiere el costo
-- ============================================================
--
-- DECISIÓN DEL DUEÑO, 28 ago 2026.
--
-- "Transferir al costo" cierra un préstamo dejando el material —y su costo— en
-- la obra que lo recibió. Cuando las dos obras son de la MISMA empresa eso es
-- un movimiento interno y no hay más que hablar.
--
-- Pero las obras de Grupo Copacabana pertenecen a **cuatro razones sociales
-- distintas**. Mover el costo de una empresa a otra sin emitir la factura
-- entre ellas no es un asiento contable válido: para SUNAT es una operación
-- entre contribuyentes diferentes, y necesita su comprobante. El sistema
-- estaba dejando registrar un hecho que la contabilidad no puede respaldar.
--
-- Esto ya estaba anotado como pendiente en CLAUDE.md —"facturación intercompany
-- entre las 4 razones sociales para Transferir al costo"— y sigue pendiente.
-- Hasta que exista, la opción se retira.
--
-- QUÉ PASA ENTONCES CON UN PRÉSTAMO CUYO MATERIAL YA SE CONSUMIÓ. Se queda
-- ABIERTO, en estado 'Prestado', y es lo correcto: refleja la verdad —hay una
-- deuda entre dos obras que todavía no se ha liquidado— en vez de cerrarla con
-- un movimiento que no existe en los libros. Gerencia los ve en su lista y se
-- liquidan todos juntos cuando el mecanismo intercompany esté hecho.
--
-- CÓMO SE VUELVE A HABILITAR, el día que exista: borrar este trigger.
--
--     drop trigger zz_sin_transferir_al_costo on public.prestamos;
--
-- Y no hace falta nada más: el estado 'Transferido' sigue existiendo en el
-- modelo, la pantalla solo tiene el botón oculto, y los préstamos que ya estén
-- transferidos de antes se quedan como están —no se tocan—.

create or replace function public.trg_sin_transferir_al_costo()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;                       -- cargas de datos y mantenimiento
  end if;
  if new.estado = 'Transferido' and old.estado is distinct from 'Transferido' then
    raise exception 'Durante el piloto no se transfiere el costo entre obras: son de empresas distintas y hace falta una factura entre ellas. Si la otra obra ya consumió el material, deja el préstamo abierto y avisa a gerencia.';
  end if;
  return new;
end;
$$;

drop trigger if exists zz_sin_transferir_al_costo on public.prestamos;
create trigger zz_sin_transferir_al_costo
  before update on public.prestamos
  for each row execute function public.trg_sin_transferir_al_costo();

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) El trigger existe:
--
--   select tgname from pg_trigger
--    where tgrelid = 'public.prestamos'::regclass and not tgisinternal
--    order by tgname;
--
-- 2) ¿Hay préstamos ya transferidos de antes? Se quedan como están; esto es
--    solo para saber cuántos son cuando llegue la liquidación intercompany:
--
--   select numero, fecha, origen, destino, codigo, cant, fecha_cierre
--     from public.prestamos where estado = 'Transferido' order by fecha;
--
-- 3) Y los que queden abiertos con el material ya consumido —los que antes se
--    habrían cerrado transfiriendo— son los que hay que vigilar. Gerencia los
--    ve en Almacén; esta consulta los saca de una:
--
--   select p.numero, p.fecha, p.origen, p.destino, p.codigo, p.cant,
--          public.stock_fisico(p.destino, p.codigo) as le_queda_al_destino
--     from public.prestamos p
--    where p.estado = 'Prestado' and p.anulacion is null
--      and public.stock_fisico(p.destino, p.codigo) < p.cant
--    order by p.fecha;
