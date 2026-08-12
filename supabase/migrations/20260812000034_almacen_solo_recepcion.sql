-- ============================================================
-- MIGRACIÓN 34 · EL ALMACÉN SOLO REGISTRA LA RECEPCIÓN
--
-- EL PROBLEMA, en una frase: hoy el almacenero puede aprobarse
-- material a sí mismo.
--
-- La regla `rq_items_update_almacen` (migración 2) le deja MODIFICAR
-- CUALQUIER COLUMNA de cualquier ítem de su obra. El comentario de
-- aquella migración lo decía sin darse cuenta de lo que significaba:
-- "qué columnas toca cada rol lo controla la app". O sea, la regla
-- vive solo en la pantalla — y la pantalla se salta llamando directo
-- a la API desde el navegador, sin ningún conocimiento técnico raro.
--
-- Con eso, un almacenero puede hoy:
--   · poner decision = 'Aprobado' en su propio pedido  ← lo más grave:
--     salta por encima de "solo Compras aprueba", que es el eje del
--     sistema, y además queda sin rastro de quién aprobó
--   · poner pago = 'Pagado' sin que exista ninguna factura
--   · cambiar la cantidad pedida, el material o el destino
--   · anular un ítem
--
-- LA SOLUCIÓN: la misma que ya se usó con el comprador (migración
-- 15). La base comprueba que el almacén solo toque las columnas de
-- la recepción, que son exactamente cinco:
--     cant_recibida · fecha_entrega · fecha_entrega_saldo
--     obs_almacen   · fecha_caducidad
-- (`estado` va además en la lista del trigger, pero NO lo escribe el
--  almacén: lo calcula el sistema. Se controla aparte, en el punto 2.)
--
-- NO cambia nada de lo que el almacén hace hoy en pantalla: la única
-- escritura que hace la app desde su vista es `recibir`, y escribe
-- justo esas columnas. Recibir sigue funcionando igual.
--
-- POR QUÉ ES LA 34 Y NO LA 33: el número 33 está reservado para
-- borrar las columnas bancarias viejas de `proyectos` (ver el pie de
-- la migración 32). No falta ninguna migración.
--
-- Se corre en el editor SQL de Supabase. Se puede repetir sin daño.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) La guarda de columnas
--
-- En vez de ir enumerando las columnas prohibidas —lista que se
-- queda vieja en cuanto alguien agregue una— se compara la fila
-- ENTERA quitándole las de recepción. Si algo más cambió, se rechaza.
-- Así, una columna nueva que se agregue mañana queda protegida sola,
-- sin que nadie se acuerde de volver aquí.
--
-- `estado` va fuera de la comparación porque NO lo escribe el
-- almacenero: lo calcula el trigger `rq_items_biu` a partir de la
-- cantidad recibida (parcial → Incompleto, completo → Entregado).
-- Por eso se controla aparte, en el punto 2.
-- ------------------------------------------------------------
-- (Sin `security definer`: esta función no lee ninguna tabla, solo
--  llama a mi_rol(), que ya lo es. Igual que la guarda del comprador.)
create or replace function public.trg_almacen_solo_recepcion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  campos_recepcion text[] := array[
    'cant_recibida', 'fecha_entrega', 'fecha_entrega_saldo',
    'obs_almacen', 'fecha_caducidad', 'estado'
  ];
begin
  -- coalesce: sin sesión o sin ficha, mi_rol() es NULL y la comparación
  -- directa dejaría pasar (ese fue el agujero de la migración 31).
  if coalesce(public.mi_rol(), '') <> 'almacen' then
    return new;
  end if;

  if (to_jsonb(new) - campos_recepcion) is distinct from (to_jsonb(old) - campos_recepcion) then
    raise exception 'El almacén solo registra la recepción: cantidad recibida, su fecha, la observación y la caducidad. Aprobar, anular, cambiar cantidades o marcar pagos lo hace Compras.';
  end if;

  -- 2) El estado sale de la cantidad, no se fija a mano. Sin esto, el
  --    almacén podría marcar "Entregado" un material que nunca llegó.
  if new.estado is distinct from old.estado
     and new.cant_recibida is not distinct from old.cant_recibida then
    raise exception 'El estado del ítem lo calcula el sistema a partir de la cantidad recibida; no se fija a mano.';
  end if;

  -- 3) Recibir suma, nunca resta. Deshacer una recepción ya registrada
  --    descuadraría el stock sin dejar rastro.
  if coalesce(new.cant_recibida, 0) < coalesce(old.cant_recibida, 0) then
    raise exception 'No se puede reducir una cantidad ya recibida. Si te equivocaste al digitar, avisa a gerencia: la corrección se hace desde la base dejando registrado el motivo.';
  end if;

  -- 4) No se recibe más de lo pedido. Ya existe el constraint
  --    `chk_recepcion` (migración 1), pero su mensaje es el texto crudo
  --    de Postgres en inglés y le llega tal cual al almacenero. Este
  --    control gana la carrera y explica qué hacer. El caso real que lo
  --    dispara: otra persona ya registró parte y la pantalla está vieja.
  if coalesce(new.cant_recibida, 0) > new.cant then
    raise exception 'No se puede recibir más de lo pedido: el RQ pide % y con esto quedarían %. Puede que alguien ya haya registrado parte: actualiza la pantalla. Si el proveedor entregó de más, corrígelo con Compras.', new.cant, new.cant_recibida;
  end if;

  -- 5) Las fechas de entrega solo se mueven cuando la recepción avanza.
  --    Sin esto, el almacén podría reescribir la fecha de llegada de un
  --    ítem ya cerrado sin mover un gramo de material — y esas fechas
  --    alimentan la holgura, "llegaron tarde" y "entrega a tiempo %".
  --    Es decir, quien recibe podría maquillar los indicadores con los
  --    que se juzga a la cadena de compras. La app siempre las escribe
  --    una sola vez, con la fecha de hoy, así que esto no le estorba.
  if (new.fecha_entrega       is distinct from old.fecha_entrega
   or new.fecha_entrega_saldo is distinct from old.fecha_entrega_saldo
   or new.obs_almacen         is distinct from old.obs_almacen)
     and coalesce(new.cant_recibida, 0) <= coalesce(old.cant_recibida, 0) then
    raise exception 'Las fechas y observaciones de la recepción se registran al recibir material, no se editan después.';
  end if;

  -- 6) Solo se recibe material de un ítem APROBADO.
  --    Esto va en el TRIGGER y no en la política a propósito: si
  --    estuviera en la política, la fila quedaría invisible, el UPDATE
  --    afectaría 0 filas, PostgREST devolvería 204 SIN error y la app
  --    le cantaría "recepción registrada" al almacenero sin haber
  --    guardado nada. Descargaría el camión y el material entraría a la
  --    obra invisible. Un error explícito es la diferencia entre que
  --    falle y que MIENTA.
  if new.decision <> 'Aprobado' then
    raise exception 'Este ítem ya no está aprobado (Compras o gerencia lo cambió). Actualiza la pantalla y consulta antes de descargar el material.';
  end if;

  return new;
end;
$$;

drop trigger if exists rq_items_almacen_guard on public.rq_items;

-- El nombre importa: los triggers `before` corren en orden alfabético
-- y `rq_items_almacen_guard` va antes que `rq_items_biu`, así que la
-- guarda ve lo que envió la persona, no lo que ya calculó el sistema.
create trigger rq_items_almacen_guard
  before update on public.rq_items
  for each row execute function public.trg_almacen_solo_recepcion();

-- ------------------------------------------------------------
-- 4) La política se deja COMO ESTABA (rol + obra), solo se le agrega
--    el coalesce por lo de la migración 31.
--
--    Se pensó en meterle aquí "y que el ítem esté Aprobado", y se
--    descartó: una política que no se cumple no da error, hace la fila
--    invisible. El UPDATE afectaría 0 filas y la app diría "recepción
--    registrada" sin haber guardado nada. Esa comprobación vive en el
--    trigger (punto 6), donde sí falla a la vista de todos.
-- ------------------------------------------------------------
drop policy if exists rq_items_update_almacen on public.rq_items;
create policy rq_items_update_almacen on public.rq_items
  for update to authenticated
  using (
    coalesce(public.mi_rol(), '') = 'almacen'
    and exists (select 1 from public.rqs r
                where r.id = rq_id and r.proyecto = public.mi_proyecto())
  )
  with check (
    coalesce(public.mi_rol(), '') = 'almacen'
    and exists (select 1 from public.rqs r
                where r.id = rq_id and r.proyecto = public.mi_proyecto())
  );

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- CÓMO COMPROBAR QUE QUEDÓ CERRADO
--
-- 1) Con la cuenta de un ALMACENERO, en la app: recibir material
--    normalmente (parcial y completo). Debe funcionar igual que
--    siempre. Si algo falla aquí, DETENERSE: la obra no puede
--    quedarse sin poder recibir.
--
-- 2) La prueba de que el agujero está cerrado, desde el SQL Editor.
--    IMPORTANTE: hacerla sobre un ítem YA APROBADO de la obra de ese
--    almacenero. Sobre un ítem Pendiente la política lo filtra antes y
--    Postgres responde "UPDATE 0" sin ningún error — daría un falso
--    negativo y parecería que el parche no se aplicó.
--
--      begin;
--        set local role authenticated;
--        set local request.jwt.claims to '{"sub":"<uuid del almacenero>"}';
--        update public.rq_items set pago = 'Pagado'
--         where id = '<uuid de un ítem APROBADO de esa obra>';
--      rollback;
--
--    ESPERADO: error "El almacén solo registra la recepción...".
--    Si el update pasa sin error, el trigger no se creó.
--
--    Segunda prueba, el agujero original:
--      update public.rq_items set decision = 'Anulado' where id = '<mismo uuid>';
--    ESPERADO: el mismo error.
-- ============================================================
