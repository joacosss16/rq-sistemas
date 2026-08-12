-- ============================================================
-- MIGRACIÓN 37 · LA CUARTA PUERTA: RENDICIONES (EL EFECTIVO)
--
-- Es la tabla del dinero en efectivo y, hasta hoy, la única que NO
-- tiene ni un solo control: en las 36 migraciones anteriores no
-- existe ningún trigger sobre `rendiciones`. La política deja a
-- administración, pagos y gerencia escribir TODAS sus columnas.
--
-- Lo que eso permite hoy:
--   · `aprobado_por` y `fecha_aprobacion` son columnas libres, así
--     que el área de pagos puede sellar una rendición como aprobada
--     POR MÓNICA y acto seguido reponerse el fondo. Las dos puntas
--     del circuito del efectivo, con la firma de otra persona.
--   · `repuesto_por` también viaja desde el navegador.
--   · Administración puede aprobar una rendición "Con diferencia" sin
--     pasar por gerencia, que es justo el escalamiento que la
--     migración 27 puso para que un faltante de caja no lo cierre
--     quien lo tiene que explicar.
--   · Se puede reponer el fondo de una rendición que nadie aprobó.
--
-- EL PRINCIPIO, el mismo de la 34 y la 36: cada rol solo toca sus
-- columnas, y LAS FIRMAS NO VIAJAN DESDE EL NAVEGADOR.
--
-- ---- EL ALTA TAMBIÉN, que es por donde se robaba ----
-- La primera versión de esta migración volvió a poner la guarda solo
-- sobre la modificación, el mismo error que la 36 documentó una
-- migración antes. Y aquí el alta era el camino más caro de todos:
-- crear la rendición del día es de los roles que manejan el efectivo,
-- y `monto_fondo` es la base contra la que se compara el arqueo.
-- Creándola a mano con S/ 1.500 donde el fondo real es S/ 2.000, se
-- puede guardar S/ 500 y el arqueo del cierre dice "cuadra exacto".
-- Sin rastro, todos los días. Ahora la rendición nace SIEMPRE
-- abierta, sin firmas y con el fondo que dice la base.
--
-- ATENCIÓN: esto SÍ cambia una pantalla. Hoy el rol `pagos` puede
-- cerrar la caja (App.jsx: `puede = administracion || pagos`, porque
-- Mónica llevaba los dos frentes). Con este trigger esos botones
-- fallan. El código que los quita va en el MISMO despliegue, y el rol
-- de Mónica debe ser `administracion` ANTES de correr esto.
--
-- Se corre en el editor SQL de Supabase. Se puede repetir sin daño.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0) CÓMO NACE UNA RENDICIÓN
-- Abierta, sin arqueo, sin firmas, sin reposición, y con el fondo que
-- dice la tabla de cajas chicas — nunca el que mande el navegador.
-- Solo aplica a quien entra por la aplicación; las cargas de datos
-- desde el editor SQL no se tocan.
-- ------------------------------------------------------------
create or replace function public.trg_rendicion_nace_abierta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_fondo numeric;
begin
  if auth.uid() is null then return new; end if;   -- mantenimiento, no app
  new.estado               := 'Abierta';
  new.observacion          := null;
  new.correccion           := null;
  new.aprobado_por         := null;
  new.fecha_aprobacion     := null;
  new.efectivo_contado     := null;
  new.diferencia           := null;
  new.dif_motivo           := null;
  new.dif_resolucion       := null;
  new.reposicion_operacion := null;
  new.reposicion_fecha     := null;
  new.repuesto_por         := null;
  -- El fondo lo dice la base. Era la puerta del robo.
  select monto_fondo into v_fondo from public.cajas_chicas where proyecto = new.proyecto;
  new.monto_fondo := coalesce(v_fondo, 0);
  return new;
end;
$$;

drop trigger if exists rendiciones_nace_abierta on public.rendiciones;
create trigger rendiciones_nace_abierta
  before insert on public.rendiciones
  for each row execute function public.trg_rendicion_nace_abierta();

create or replace function public.trg_rendicion_guarda()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rol text := coalesce(public.mi_rol(), '');
  -- Administración cierra el día: arqueo, observación y corrección.
  campos_admin text[] := array[
    'estado', 'observacion', 'correccion',
    'efectivo_contado', 'diferencia', 'dif_motivo',
    'aprobado_por', 'fecha_aprobacion'
  ];
  -- Pagos solo repone el fondo. Nada más.
  campos_pagos text[] := array[
    'reposicion_operacion', 'reposicion_fecha', 'repuesto_por'
  ];
begin
  -- ---------- Las firmas las pone la base ----------
  -- Quién aprobó se estampa cuando cambia el estado; si no cambia, se
  -- conserva. Un UPDATE que solo toque `aprobado_por` no consigue
  -- nada: era el camino para firmar en nombre de Mónica.
  if new.estado is distinct from old.estado and auth.uid() is not null then
    new.aprobado_por     := auth.uid();
    new.fecha_aprobacion := current_date;
  else
    new.aprobado_por     := old.aprobado_por;
    new.fecha_aprobacion := old.fecha_aprobacion;
  end if;

  -- Quién repuso se estampa cuando se registra la operación bancaria.
  if new.reposicion_operacion is distinct from old.reposicion_operacion
     and new.reposicion_operacion is not null
     and auth.uid() is not null then
    new.repuesto_por := auth.uid();
  else
    new.repuesto_por := old.repuesto_por;
  end if;

  -- ---------- Reglas para todos ----------
  -- El fondo, la obra, el día y el responsable no se cambian nunca:
  -- eso convertiría la rendición del martes en la del miércoles.
  if new.proyecto       is distinct from old.proyecto
  or new.fecha          is distinct from old.fecha
  or new.responsable_id is distinct from old.responsable_id
  or new.monto_fondo    is distinct from old.monto_fondo then
    raise exception 'La obra, la fecha, el responsable y el monto del fondo de una rendición no se modifican.';
  end if;

  -- El fondo se repone contra una rendición APROBADA, no antes. Si
  -- quedó "Con diferencia", primero la resuelve gerencia.
  if new.reposicion_operacion is distinct from old.reposicion_operacion
     and new.reposicion_operacion is not null
     and new.estado <> 'Aprobada' then
    raise exception 'Esta rendición todavía no está aprobada (está %). El fondo se repone después de que administración la cierre y, si hay diferencia, de que gerencia la resuelva.', new.estado;
  end if;

  -- Una reposición ya hecha no se reescribe: es una operación
  -- bancaria real y su número es el que cuadra con el banco.
  if old.reposicion_operacion is not null
     and new.reposicion_operacion is distinct from old.reposicion_operacion then
    raise exception 'Esta rendición ya fue repuesta con la operación %. Si hubo un error, avisa a gerencia.', old.reposicion_operacion;
  end if;

  -- ---------- Qué toca cada rol ----------
  if rol = 'administracion' then
    if (to_jsonb(new) - campos_admin) is distinct from (to_jsonb(old) - campos_admin) then
      raise exception 'Administración cierra la rendición (arqueo, observación y corrección). Reponer el fondo es del área de pagos.';
    end if;
    -- Una diferencia que excede la tolerancia la resuelve gerencia:
    -- no la cierra quien tiene que explicarla. Es la regla de la
    -- migración 27, que hasta hoy vivía solo en la pantalla.
    if old.estado = 'Con diferencia' and new.estado <> old.estado then
      raise exception 'Esta rendición quedó con una diferencia de caja: la resuelve gerencia, no administración.';
    end if;

  elsif rol = 'pagos' then
    if (to_jsonb(new) - campos_pagos) is distinct from (to_jsonb(old) - campos_pagos) then
      raise exception 'El área de pagos solo registra la reposición del fondo (banco, número de operación y fecha). Aprobar la rendición es de administración.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists rendiciones_guarda on public.rendiciones;
create trigger rendiciones_guarda
  before update on public.rendiciones
  for each row execute function public.trg_rendicion_guarda();

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- LO QUE ESTA MIGRACIÓN **NO** ARREGLA TODAVÍA
--
-- La migración 27 dice que la diferencia de caja "nadie la digita:
-- se calcula". Hoy no es así: el navegador la manda ya calculada
-- (efectivo contado − sobrante teórico) y la base la acepta tal cual,
-- así que el arqueo se puede maquillar mandando otro número.
--
-- La duda que lo bloqueaba —si una factura anulada cuenta como gasto—
-- ya está resuelta: NO cuenta, y la app se corrigió (contarla producía
-- una diferencia de caja falsa igual al monto anulado). Con eso, la
-- base ya puede calcularla ella misma con la misma fórmula:
--
--   diferencia = efectivo_contado − (monto_fondo − Σ facturas de esa
--                rendición que NO estén anuladas)
--
-- Queda para la migración siguiente, junto con el rastro de las
-- correcciones de `stock_inicial`, que también quedó pendiente.
--
-- CÓMO COMPROBAR
--
-- EN LA APP, que nada se rompió:
--   · Administración: cerrar una rendición con arqueo, observar una,
--     corregir una observada.
--   · Gerencia: resolver una rendición "Con diferencia".
--   · Pagos: reponer el fondo de una rendición aprobada.
--
-- QUE LOS AGUJEROS ESTÁN CERRADOS, con la sesión del área de pagos:
--   1. update rendiciones set estado='Aprobada' where id='<abierta>';
--      ESPERADO: "El área de pagos solo registra la reposición…"
--   2. update rendiciones set aprobado_por='<uuid de Mónica>' where id='<...>';
--      ESPERADO: pasa sin error PERO no cambia nada: comprobar que
--      `aprobado_por` sigue igual.
--   3. Reponer una rendición que no esté aprobada.
--      ESPERADO: "Esta rendición todavía no está aprobada…"
-- Y con la sesión de administración:
--   4. Aprobar una rendición que esté "Con diferencia".
--      ESPERADO: "…la resuelve gerencia, no administración."
-- ============================================================
