-- ============================================================
-- MIGRACIÓN 69 · Lo hecho en el almacén no se deshace a escondidas
-- ============================================================
--
-- Cierra cinco agujeros que un ataque al módulo de Almacén encontró y verificó
-- uno por uno (28 ago 2026). Los cinco son la misma enfermedad, y es la que ya
-- se curó en Compras con las migraciones 62 y 66: **una transición sin guarda
-- en la base**. Ninguno es alcanzable desde la pantalla —no hay botón para
-- eso— pero sí hablándole directo a la base con una sesión iniciada.
--
-- Y OJO CON EL MOTIVO, porque no es el que parece: estas guardas no están aquí
-- por miedo a que alguien del equipo actúe de mala fe. Están porque **la base
-- tiene que atrapar los errores de quien programa**. Esta misma semana la
-- migración 65 afirmó por escrito que revalidaba un cuadre que en realidad no
-- revalidaba, y nada lo detectó: ni al escribirla, ni al correrla, ni al
-- usarla. Habría dejado facturas descuadradas para siempre. Una guarda en la
-- base es la red que atrapa eso.
--
-- ── LOS CINCO ─────────────────────────────────────────────────
--
-- 1. DES-ANULAR UNA SALIDA (`anulacion = null`). La salida resucita, vuelve a
--    descontar stock sin revalidar nada —puede quedar NEGATIVO— y el motivo,
--    el nombre y la fecha de la anulación DESAPARECEN. No quedan tachados: se
--    borran. El trigger vigente solo mira cuando se ESCRIBE una anulación; que
--    se borre pasaba de largo.
--
-- 2. RE-DECIDIR UNA SALIDA YA RESUELTA. La guarda "esta salida ya fue
--    resuelta" vive DENTRO de la rama del residente, así que compras y
--    gerencia caían fuera: podían pasar una Rechazada a Aprobada, revirtiendo
--    la decisión del residente sin que se entere, descontando stock otra vez y
--    pisando su firma.
--
-- 3. DESHACER UN REINGRESO bajando `cant_reingresada`. El guardia existente
--    solo mira los AUMENTOS. Bajarla vuelve a sacar material del stock, sin
--    motivo y sin rastro.
--
-- 4. DEGRADAR UN PRÉSTAMO de 'Prestado' a 'Solicitado' o 'Rechazado': des-mueve
--    el stock de las dos obras sin ninguna comprobación.
--
-- 5. RECHAZAR UN PRÉSTAMO YA PRESTADO: revierte el stock saltándose el control
--    de "el destino ya consumió", que es justo lo que impide devolver material
--    que la otra obra ya se gastó.
--
-- QUÉ NO SE TOCA, a propósito: todos los caminos legítimos. El residente sigue
-- aprobando y rechazando lo que está Pendiente; el almacén sigue registrando
-- uso, reingreso y anulación; gerencia sigue pudiendo destrabar; y las
-- transiciones normales de un préstamo (Prestado → Devuelto / Transferido /
-- Anulado) siguen igual.

-- ------------------------------------------------------------
-- SALIDAS
-- ------------------------------------------------------------
-- Se reescribe `trg_salida_aprobacion` ENTERA —en PL/pgSQL no se parchea un
-- trozo— copiada de la migración 41 con TRES añadidos marcados abajo. Todo lo
-- demás queda palabra por palabra: la firma de la aprobación, la firma de la
-- anulación con su motivo obligatorio, y las dos guardas de columnas (el
-- residente solo decide, el almacén solo registra).
create or replace function public.trg_salida_aprobacion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rol text := coalesce(public.mi_rol(), '');
  v_nombre text;
  campos_almacen   text[] := array['uso', 'motivo_uso', 'cant_reingresada', 'reingreso', 'anulacion'];
  campos_residente text[] := array['aprobacion', 'motivo_rechazo', 'aprobado_por', 'fecha_aprobacion'];
begin
  -- ── AÑADIDO 1: una anulación no se borra ────────────────────
  -- Anular devolvió material al stock y dejó un motivo firmado. Deshacerlo en
  -- silencio vuelve a descontar y borra el rastro. Si la anulación estuvo mal,
  -- se registra una salida nueva: así queda la historia de las dos cosas.
  if old.anulacion is not null and new.anulacion is null then
    raise exception 'Una salida anulada no se des-anula: el material ya volvió al stock y la anulación tiene motivo y firma. Si hace falta sacarlo otra vez, registra una salida nueva.';
  end if;
  -- Y estando anulada, no se le cambia nada más: está cerrada.
  if old.anulacion is not null
     and (to_jsonb(new) - array['anulacion', 'actualizado_en']) is distinct from (to_jsonb(old) - array['anulacion', 'actualizado_en']) then
    raise exception 'Esa salida está anulada: no admite cambios.';
  end if;

  -- ── AÑADIDO 2: la decisión solo se toma una vez ─────────────
  -- Antes esta guarda vivía dentro de la rama del residente, así que compras y
  -- gerencia podían re-decidir una salida ya resuelta. Ahora aplica a todos.
  if new.aprobacion is distinct from old.aprobacion
     and old.aprobacion <> 'Pendiente'
     and auth.uid() is not null then
    raise exception 'Esta salida ya fue %: una decisión no se cambia. Si hay que revertirla, se anula con motivo y se registra de nuevo.', lower(old.aprobacion);
  end if;

  -- ── AÑADIDO 3: el reingreso no retrocede ────────────────────
  -- Bajar la cantidad reingresada vuelve a sacar material del stock sin motivo
  -- ni rastro. Solo puede crecer, y nunca pasar de lo que salió.
  if coalesce(new.cant_reingresada, 0) < coalesce(old.cant_reingresada, 0)
     and auth.uid() is not null then
    raise exception 'El reingreso no se puede reducir: ese material ya volvió al almacén. Si se registró de más, anula la salida y regístrala bien.';
  end if;

  -- Quién aprobó y cuándo (migración 36)
  if new.aprobacion is distinct from old.aprobacion
     and new.aprobacion in ('Aprobada', 'Rechazada')
     and auth.uid() is not null then
    new.aprobado_por     := auth.uid();
    new.fecha_aprobacion := current_date;
  else
    new.aprobado_por     := old.aprobado_por;
    new.fecha_aprobacion := old.fecha_aprobacion;
  end if;

  -- Quién anuló: anular una salida aprobada DEVUELVE material al stock,
  -- así que es la firma que menos puede venir del navegador.
  if new.anulacion is distinct from old.anulacion and new.anulacion is not null then
    if old.anulacion is not null then
      raise exception 'Esa salida ya estaba anulada.';
    end if;
    if coalesce(trim(new.anulacion ->> 'motivo'), '') = '' then
      raise exception 'Anular una salida exige explicar por qué.';
    end if;
    select nombre into v_nombre from public.usuarios where id = auth.uid();
    new.anulacion := jsonb_build_object(
      'motivo', trim(new.anulacion ->> 'motivo'),
      'por',    coalesce(v_nombre, 'desconocido'),
      'fecha',  current_date::text);
  end if;

  if rol = 'residente' then
    if (to_jsonb(new) - campos_residente) is distinct from (to_jsonb(old) - campos_residente) then
      raise exception 'El residente solo aprueba o rechaza la salida, no modifica sus datos.';
    end if;
    if old.aprobacion <> 'Pendiente' then
      raise exception 'Esta salida ya fue resuelta.';
    end if;
    if new.aprobacion = 'Rechazada' and coalesce(trim(new.motivo_rechazo), '') = '' then
      raise exception 'Rechazar una salida exige explicar por qué.';
    end if;

  elsif rol = 'almacen' then
    if (to_jsonb(new) - campos_almacen) is distinct from (to_jsonb(old) - campos_almacen) then
      raise exception 'El almacén registra el uso, el reingreso y la anulación de la salida. Aprobarla es del residente de la obra.';
    end if;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- PRÉSTAMOS
-- ------------------------------------------------------------
-- Guarda de transición aparte, para no reescribir la función de las firmas
-- (que es larga y funciona).
--
-- `zz_` PARA QUE CORRA DESPUÉS, y el motivo importa: **la pantalla nunca manda
-- el estado de un préstamo**. Manda una firma o un rechazo, y es la función de
-- las firmas la que deriva el estado —a 'Prestado' cuando llegan las dos
-- aprobaciones, a 'Rechazado' en cuanto llega un rechazo—. Un guardián que
-- corriera antes vería el estado todavía sin cambiar y dejaría pasar todo.
--
-- (La primera versión de esta migración lo puso como `aa_` y por eso no
-- atrapaba el caso 5, que es justo el que va por ese camino: rechazar un
-- préstamo YA entregado. El orden alfabético de los triggers no es un detalle.)
--
-- Las transiciones legítimas, y no hay más:
--     Solicitado  → Prestado (con las dos firmas) · Rechazado · Anulado
--     Prestado    → Devuelto · Transferido · Anulado
--     Devuelto / Transferido / Rechazado / Anulado → (nada: están cerrados)
create or replace function public.trg_prestamo_transicion()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;                       -- cargas de datos y mantenimiento
  end if;
  if new.estado is not distinct from old.estado then
    -- No cambia el estado, pero sí puede estar borrándose la anulación.
    if old.anulacion is not null and new.anulacion is null then
      raise exception 'Un préstamo anulado no se des-anula: el material ya volvió a su almacén y la anulación tiene motivo y firma.';
    end if;
    return new;
  end if;

  -- Un préstamo cerrado no vuelve atrás. Devolver o transferir movió stock;
  -- rechazar y anular lo dejaron donde estaba. Cualquiera de las cuatro es
  -- definitiva: si hay que corregir, se registra un préstamo nuevo.
  if old.estado in ('Devuelto', 'Transferido', 'Rechazado', 'Anulado') then
    raise exception 'Ese préstamo ya está %: no se puede volver a %. Si hay que corregirlo, registra un préstamo nuevo.',
      lower(old.estado), lower(new.estado);
  end if;

  -- Un préstamo ya entregado no retrocede a "por aprobar" ni se rechaza: el
  -- material YA se movió. Rechazarlo revertía el stock saltándose el control
  -- de si el destino lo consumió.
  if old.estado = 'Prestado' and new.estado in ('Solicitado', 'Rechazado') then
    raise exception 'Ese préstamo ya está entregado y el material está en la otra obra: no se puede rechazar ahora. Se devuelve (si no lo consumieron), se transfiere al costo, o se anula con motivo.';
  end if;

  -- Y uno solicitado no puede saltar directo a devuelto o transferido sin
  -- haberse entregado nunca.
  if old.estado = 'Solicitado' and new.estado in ('Devuelto', 'Transferido') then
    raise exception 'Ese préstamo todavía no se ha entregado: no puede darse por devuelto ni transferido.';
  end if;

  return new;
end;
$$;

drop trigger if exists aa_prestamo_transicion on public.prestamos;
drop trigger if exists zz_prestamo_transicion on public.prestamos;
create trigger zz_prestamo_transicion
  before update on public.prestamos
  for each row execute function public.trg_prestamo_transicion();

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) Los cambios NO tocan nada de lo ya registrado; solo cambian lo que se
--    puede hacer de aquí en adelante. Para ver que no haya quedado ningún
--    dato imposible de antes (debe dar 0 filas):
--
--    -- salidas con más reingresado de lo que salió:
--    select id, numero, cant, cant_reingresada from public.salidas
--     where coalesce(cant_reingresada, 0) > cant;
--
--    -- préstamos en un estado que ya no se podrá alcanzar:
--    select numero, origen, destino, estado, aprob_origen is not null o,
--           aprob_destino is not null d
--      from public.prestamos
--     where estado = 'Prestado' and (aprob_origen is null or aprob_destino is null);
--
-- 2) Los dos guardias existen:
--
--    select tgname from pg_trigger
--     where tgrelid in ('public.salidas'::regclass, 'public.prestamos'::regclass)
--       and not tgisinternal
--     order by tgrelid::text, tgname;
--
-- 3) La prueba de verdad, en la aplicación: que el almacenero pueda seguir
--    recibiendo, sacando, verificando uso, reingresando y anulando; que el
--    residente siga aprobando y rechazando lo pendiente; y que un préstamo
--    complete su ciclo normal. Nada de eso debe haber cambiado.
