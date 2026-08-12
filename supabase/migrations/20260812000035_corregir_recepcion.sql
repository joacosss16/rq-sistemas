-- ============================================================
-- MIGRACIÓN 35 · CORREGIR UNA CANTIDAD MAL DIGITADA
--
-- EL CASO REAL: llega el camión, el almacenero digita 40 donde iba 4.
-- Hasta ahora eso no tenía arreglo desde el sistema: la recepción solo
-- sumaba, y el stock quedaba inflado en 36 para siempre. La migración
-- 34 lo dejó explícito ("recibir suma, nunca resta") pero mandaba a la
-- persona a un remedio que no existía.
--
-- LA DECISIÓN (del dueño, 12 ago 2026): que pueda corregir, PERO CON
-- MOTIVO. Es el mismo principio que rige todo el sistema: nunca una
-- edición silenciosa. Una anulación, una salida y un préstamo se
-- corrigen con motivo + quién + cuándo; una recepción también.
--
-- CÓMO QUEDA:
--   · Se puede bajar la cantidad recibida, pero SOLO si el mismo
--     movimiento trae anotada una corrección con su motivo.
--   · Quién y cuándo NO los escribe la app: los estampa la base. Así
--     el rastro no se puede falsear ni llamando directo a la API.
--   · Queda el historial completo: cada corrección guarda de cuánto a
--     cuánto, por qué, quién y qué día. No se pisa la anterior.
--
-- Se corre en el editor SQL de Supabase. Se puede repetir sin daño.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) Dónde vive el rastro.
--    Una lista, no un solo valor: puede haber más de una corrección
--    sobre el mismo ítem y ninguna debe borrar a la anterior.
--    Cada entrada: {de, a, motivo, por, fecha}
-- ------------------------------------------------------------
alter table public.rq_items
  add column if not exists correcciones jsonb not null default '[]'::jsonb;

comment on column public.rq_items.correcciones is
  'Historial de correcciones de la cantidad recibida: [{de, a, motivo, por, fecha}]. `por` y `fecha` los estampa el trigger, nunca el cliente.';

-- ------------------------------------------------------------
-- 2) Si la cantidad recibida baja a 0, el ítem no puede seguir
--    figurando como Entregado.
--
--    El trigger que calcula el estado (migración 1) solo contempla
--    subir: si la cantidad queda en 0 no hace nada y el ítem se
--    quedaría en "Entregado" con cero material recibido, envenenando
--    el stock y los indicadores de entrega. Se completa el caso.
-- ------------------------------------------------------------
create or replace function public.trg_rq_items_biu()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare v_fecha_rq date;
begin
  select fecha_rq into v_fecha_rq from rqs where id = new.rq_id;

  if new.fecha_necesitada < v_fecha_rq then
    raise exception 'La fecha necesitada (%) no puede ser anterior a la fecha del RQ (%)',
      new.fecha_necesitada, v_fecha_rq;
  end if;

  new.canal := calcular_canal(v_fecha_rq, new.fecha_necesitada);

  if tg_op = 'UPDATE' and new.cant_recibida is distinct from old.cant_recibida then
    if new.cant_recibida >= new.cant then
      new.estado := 'Entregado';
    elsif new.cant_recibida > 0 then
      new.estado := 'Incompleto';
    else
      -- Corregido a cero: el material se compró pero no hay nada
      -- recibido. Vuelve a la cola del almacén.
      new.estado := 'Comprado';
      new.fecha_entrega := null;
      new.fecha_entrega_saldo := null;
    end if;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3) La guarda del almacén, con la corrección permitida.
--    Reemplaza la de la migración 34 (misma función, todo lo demás
--    igual). Los cambios son dos: `correcciones` entra en la lista de
--    columnas que el almacén puede tocar, y la regla de "nunca resta"
--    pasa a ser "no resta SIN motivo".
-- ------------------------------------------------------------
create or replace function public.trg_almacen_solo_recepcion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  campos_recepcion text[] := array[
    'cant_recibida', 'fecha_entrega', 'fecha_entrega_saldo',
    'obs_almacen', 'fecha_caducidad', 'estado', 'correcciones'
  ];
  n_old int := jsonb_array_length(coalesce(old.correcciones, '[]'::jsonb));
  n_new int := jsonb_array_length(coalesce(new.correcciones, '[]'::jsonb));
  ultima jsonb;
  v_nombre text;
begin
  -- ---------- Reglas para TODOS los roles ----------
  -- El historial de correcciones no se reescribe ni se borra: solo
  -- crece, y de una en una. Vale también para Compras y gerencia.
  if n_new < n_old
     or (n_new > n_old + 1)
     or (n_old > 0 and (new.correcciones -> (n_old - 1)) is distinct from (old.correcciones -> (n_old - 1))) then
    raise exception 'El historial de correcciones no se puede reescribir ni borrar: solo se le agregan entradas.';
  end if;

  -- Si se agregó una corrección, la base la firma. Lo que haya mandado
  -- el cliente en `por`, `fecha`, `de` y `a` se descarta y se
  -- reemplaza por lo real. Así el rastro no se puede falsear.
  if n_new = n_old + 1 then
    ultima := new.correcciones -> n_old;
    if coalesce(trim(ultima ->> 'motivo'), '') = '' then
      raise exception 'La corrección de una cantidad recibida exige un motivo.';
    end if;
    select nombre into v_nombre from public.usuarios where id = auth.uid();
    new.correcciones := jsonb_set(new.correcciones, array[n_old::text],
      jsonb_build_object(
        'de',     coalesce(old.cant_recibida, 0),
        'a',      coalesce(new.cant_recibida, 0),
        'motivo', trim(ultima ->> 'motivo'),
        'por',    coalesce(v_nombre, 'desconocido'),
        'fecha',  current_date::text));
  end if;

  -- ---------- De aquí abajo, solo el almacén ----------
  if coalesce(public.mi_rol(), '') <> 'almacen' then
    return new;
  end if;

  if (to_jsonb(new) - campos_recepcion) is distinct from (to_jsonb(old) - campos_recepcion) then
    raise exception 'El almacén solo registra la recepción: cantidad recibida, su fecha, la observación y la caducidad. Aprobar, anular, cambiar cantidades o marcar pagos lo hace Compras.';
  end if;

  if new.estado is distinct from old.estado
     and new.cant_recibida is not distinct from old.cant_recibida then
    raise exception 'El estado del ítem lo calcula el sistema a partir de la cantidad recibida; no se fija a mano.';
  end if;

  -- Bajar la cantidad recibida: permitido, pero nunca en silencio.
  if coalesce(new.cant_recibida, 0) < coalesce(old.cant_recibida, 0)
     and n_new <> n_old + 1 then
    raise exception 'Para corregir una cantidad ya recibida hay que explicar por qué. Usa "Corregir recepción" y escribe el motivo: queda registrado con tu nombre y la fecha.';
  end if;

  if coalesce(new.cant_recibida, 0) > new.cant then
    raise exception 'No se puede recibir más de lo pedido: el RQ pide % y con esto quedarían %. Puede que alguien ya haya registrado parte: actualiza la pantalla. Si el proveedor entregó de más, corrígelo con Compras.', new.cant, new.cant_recibida;
  end if;

  -- Las fechas y la observación solo se mueven cuando entra material.
  -- Se exceptúa la corrección, que es el otro sentido legítimo.
  if (new.fecha_entrega       is distinct from old.fecha_entrega
   or new.fecha_entrega_saldo is distinct from old.fecha_entrega_saldo
   or new.obs_almacen         is distinct from old.obs_almacen)
     and coalesce(new.cant_recibida, 0) <= coalesce(old.cant_recibida, 0)
     and n_new = n_old then
    raise exception 'Las fechas y observaciones de la recepción se registran al recibir material, no se editan después.';
  end if;

  if new.decision <> 'Aprobado' then
    raise exception 'Este ítem ya no está aprobado (Compras o gerencia lo cambió). Actualiza la pantalla y consulta antes de descargar el material.';
  end if;

  return new;
end;
$$;

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- CÓMO COMPROBAR
--
-- 1) En la app, con la cuenta de un almacenero: recibir material
--    normalmente (debe seguir funcionando igual), y después corregir
--    una cantidad. Sin motivo no debe dejar; con motivo sí, y el
--    rastro debe quedar visible.
--
-- 2) Que el rastro no se pueda falsear, desde el SQL Editor: intentar
--    una corrección poniendo `por` a mano con el nombre de otra
--    persona. La base debe guardar igualmente el nombre real de quien
--    hizo el cambio, no el que se envió.
--
-- 3) Que el historial no se pueda borrar:
--      update public.rq_items set correcciones = '[]'::jsonb where id = '<uuid>';
--    ESPERADO: error "El historial de correcciones no se puede
--    reescribir ni borrar...". Y esta regla vale para TODOS los roles,
--    también para gerencia.
-- ============================================================
