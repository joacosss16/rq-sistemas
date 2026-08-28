-- ============================================================
-- MIGRACIÓN 66 · Las firmas de los ítems las pone el servidor
-- ============================================================
--
-- LO QUE FALTABA. La migración 41 dice, con todas sus letras, que "un dato que
-- el cliente puede escribir no es una firma, es una sugerencia", y lo arregló
-- para las salidas y los préstamos. Los ÍTEMS DE RQ se quedaron fuera, y ahí
-- el navegador sigue escribiendo tres cosas que deberían ser firmas:
--
--   · Quién anuló un ítem y qué día  (`anulacion`)
--   · Quién pidió esa anulación      (`anulacion_solicitud`)
--   · Quién la rechazó               (`anulacion_rechazo`)
--
-- Los tres viajan desde la pantalla con `user.nombre` y la fecha del reloj del
-- navegador. Cualquiera de esos valores se puede cambiar antes de enviarlos, y
-- la base los guarda tal cual. Así que el rastro de una anulación —el único
-- documento de por qué un material dejó de comprarse— puede decir un nombre y
-- un día que no son.
--
-- Y no es teórico: anular es la operación que cierra un ítem para siempre. Si
-- el rastro miente, no queda ningún otro sitio donde mirar.
--
-- LA REGLA. El motivo lo escribe la persona; el nombre y la fecha los pone el
-- servidor, siempre, ignorando lo que llegue. Idéntico a lo que ya hacen las
-- salidas y los préstamos desde la migración 41.
--
-- Una excepción deliberada: `solicitado_por`, dentro de la anulación
-- confirmada, guarda a quien la PIDIÓ (Compras), que no es quien la confirma
-- (gerencia). Ese dato ya está guardado en la solicitud previa y se copia de
-- ahí — no se acepta desde el navegador.
create or replace function public.trg_firma_anulacion_item()
returns trigger
language plpgsql
as $$
declare
  v_nombre text;
begin
  -- Sin sesión (cargas de datos, mantenimiento) no se toca nada.
  if auth.uid() is null then
    return new;
  end if;
  select nombre into v_nombre from public.usuarios where id = auth.uid();

  -- 1) Anulación confirmada
  if new.anulacion is not null and old.anulacion is null then
    if coalesce(trim(new.anulacion ->> 'motivo'), '') = '' then
      raise exception 'Anular un ítem exige explicar por qué.';
    end if;
    new.anulacion := jsonb_build_object(
      'motivo', trim(new.anulacion ->> 'motivo'),
      'por',    coalesce(v_nombre, 'desconocido'),
      'fecha',  current_date::text)
      -- Quién la pidió sale de la solicitud que ya está guardada, no del
      -- navegador. Si no hubo solicitud previa, no se inventa.
      || case when old.anulacion_solicitud ? 'por'
              then jsonb_build_object('solicitado_por', old.anulacion_solicitud ->> 'por')
              else '{}'::jsonb end;
  elsif old.anulacion is not null then
    new.anulacion := old.anulacion;          -- una firma puesta no se reescribe
  end if;

  -- 2) Solicitud de anulación (Compras la pide, gerencia la confirma)
  if new.anulacion_solicitud is not null
     and new.anulacion_solicitud is distinct from old.anulacion_solicitud then
    if coalesce(trim(new.anulacion_solicitud ->> 'motivo'), '') = '' then
      raise exception 'Pedir la anulación de un ítem exige explicar por qué.';
    end if;
    new.anulacion_solicitud := jsonb_build_object(
      'motivo', trim(new.anulacion_solicitud ->> 'motivo'),
      'por',    coalesce(v_nombre, 'desconocido'),
      'fecha',  current_date::text);
  end if;

  -- 3) Rechazo de la solicitud
  if new.anulacion_rechazo is not null
     and new.anulacion_rechazo is distinct from old.anulacion_rechazo then
    if coalesce(trim(new.anulacion_rechazo ->> 'motivo'), '') = '' then
      raise exception 'Rechazar una solicitud de anulación exige explicar por qué.';
    end if;
    new.anulacion_rechazo := jsonb_build_object(
      'motivo', trim(new.anulacion_rechazo ->> 'motivo'),
      'por',    coalesce(v_nombre, 'desconocido'),
      'fecha',  current_date::text);
  end if;

  return new;
end;
$$;

-- `zz_` para que corra AL FINAL: las guardas de rol y de estado deciden primero
-- si la operación es legítima; solo entonces se sella la firma. Sellar antes
-- sería firmar cosas que van a ser rechazadas.
drop trigger if exists zz_firma_anulacion_item on public.rq_items;
create trigger zz_firma_anulacion_item
  before update on public.rq_items
  for each row execute function public.trg_firma_anulacion_item();

-- ── Y el motivo de rechazo tampoco puede ir en blanco ────────
--
-- `chk_rechazo` (esquema inicial) solo exige que `motivo_rechazo` no sea nulo:
-- una cadena de espacios pasa. El recorte vive únicamente en la pantalla, y
-- una regla que solo vive en la pantalla se salta. El motivo de un rechazo es
-- lo ÚNICO que se le comunica al residente sobre por qué no llega su material.
alter table public.rq_items drop constraint if exists chk_rechazo;
alter table public.rq_items add constraint chk_rechazo
  check (decision <> 'Rechazado' or coalesce(trim(motivo_rechazo), '') <> '');

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) No hay rechazos con el motivo en blanco (si los hubiera, el ALTER de
--    arriba habría fallado y hay que mirarlos):
--
--   select id, codigo, motivo_rechazo from public.rq_items
--    where decision = 'Rechazado' and coalesce(trim(motivo_rechazo), '') = '';
--
-- 2) La prueba de verdad, en la aplicación: anular un ítem y comprobar que el
--    rastro dice el nombre de quien lo hizo DE VERDAD y la fecha de hoy,
--    aunque el navegador mandara otra cosa.
