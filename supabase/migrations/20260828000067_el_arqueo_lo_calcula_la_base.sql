-- ============================================================
-- MIGRACIÓN 67 · El arqueo lo calcula la base, no el navegador
-- ============================================================
--
-- EL AGUJERO, y es el más serio que queda abierto. Al cerrar la jornada de
-- caja chica, el navegador manda TRES cosas ya decididas:
--
--     efectivo_contado  ← lo que Mónica contó          (legítimo: es su dato)
--     diferencia        ← calculada en la pantalla     (no debería mandarse)
--     estado            ← 'Con diferencia' o 'Aprobada'  ← LA DECISIÓN ENTERA
--
-- La base las guardaba tal cual, sin recalcular nada. O sea que **quien
-- decidía si la caja cuadra era la misma pantalla que estaba siendo
-- controlada**. Un mensaje directo a la base podía cerrar un día con S/ 500
-- faltantes marcándolo 'Aprobada' y diferencia 0: sin escalar a gerencia, sin
-- bloquear la caja del día siguiente, y sin que nadie se enterara nunca.
--
-- Y la caja chica es lo ÚNICO donde el dinero se mueve sin banco de por
-- medio. Una transferencia deja rastro en el extracto y se concilia; el
-- efectivo solo tiene este arqueo. Era el punto más débil del sistema.
--
-- LA CORRECCIÓN. Una función del servidor que recibe SOLO lo que Mónica
-- aporta de verdad —cuánto contó, y el motivo si hay diferencia— y calcula
-- ella misma todo lo demás, con la misma aritmética que la pantalla:
--
--     debe devolver = Σ entregas del día − Σ gastado del día
--     diferencia    = contado − debe devolver
--     ¿escala?      = |diferencia| > tolerancia de esa obra
--
-- Es el mismo patrón de las migraciones 41, 55 y 66: el dato que decide no
-- viaja desde el navegador.
--
-- OJO CON LAS RENDICIONES HISTÓRICAS. Las anteriores al 12 ago 2026 se
-- cerraron con el modelo de fondo fijo (`monto_fondo`), antes de que
-- existieran las entregas. Se leen con ESE criterio, igual que hace
-- src/caja.js: recalcularlas con el modelo nuevo las dejaría todas en
-- negativo. Aquí solo importa para las que aún estén abiertas.

create or replace function public.cerrar_con_arqueo(
  p_rendicion uuid, p_contado numeric, p_motivo text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record; v_gastado numeric; v_recibido numeric; v_entregas int;
  v_historica boolean; v_debe numeric; v_dif numeric; v_tol numeric;
  v_excede boolean; v_estado text;
begin
  if coalesce(public.mi_rol(), '') not in ('administracion', 'gerente') then
    raise exception 'El arqueo de la caja chica lo cierra administración.';
  end if;
  if p_contado is null or p_contado < 0 then
    raise exception 'Escribe cuánto efectivo contaste (no puede ser negativo).';
  end if;

  select * into r from public.rendiciones where id = p_rendicion for update;
  if not found then raise exception 'Esa jornada no existe.'; end if;
  if r.estado not in ('Abierta', 'Observada') then
    raise exception 'Esa jornada ya está %: no se vuelve a arquear.', r.estado;
  end if;

  select coalesce(sum(monto), 0) into v_gastado
    from public.facturas where rendicion_id = r.id and anulacion is null;
  select coalesce(sum(monto), 0), count(*) into v_recibido, v_entregas
    from public.entregas_caja
   where proyecto = r.proyecto and fecha = r.fecha and anulacion is null;

  v_historica := (r.fecha < date '2026-08-12') and v_entregas = 0;
  if v_historica then v_recibido := coalesce(r.monto_fondo, 0); end if;

  v_debe := v_recibido - v_gastado;
  v_dif  := p_contado - v_debe;

  select coalesce(tolerancia, 20) into v_tol
    from public.cajas_chicas where proyecto = r.proyecto;
  v_tol := coalesce(v_tol, 20);

  v_excede := abs(v_dif) > v_tol;
  v_estado := case when v_excede then 'Con diferencia' else 'Aprobada' end;

  if v_excede and coalesce(trim(p_motivo), '') = '' then
    raise exception
      'La diferencia es de S/ % y la tolerancia de esta obra es S/ %: hay que explicar a qué se debe antes de cerrar.',
      to_char(abs(v_dif), 'FM999999990.00'), to_char(v_tol, 'FM999999990.00');
  end if;

  perform set_config('rq.arqueo', '1', true);

  update public.rendiciones
     set efectivo_contado = p_contado,
         diferencia       = v_dif,
         dif_motivo       = nullif(trim(p_motivo), ''),
         estado           = v_estado,
         aprobado_por     = case when v_excede then null else auth.uid() end,
         fecha_aprobacion = case when v_excede then null else current_date end
   where id = p_rendicion;

  perform set_config('rq.arqueo', '', true);

  return jsonb_build_object(
    'recibido', v_recibido, 'gastado', v_gastado, 'debeDevolver', v_debe,
    'contado', p_contado, 'diferencia', v_dif, 'tolerancia', v_tol,
    'excede', v_excede, 'estado', v_estado);
end;
$$;

revoke all on function public.cerrar_con_arqueo(uuid, numeric, text) from public, anon;
grant execute on function public.cerrar_con_arqueo(uuid, numeric, text) to authenticated;

-- ── Y la puerta de atrás se cierra ───────────────────────────
--
-- Sin esto, la función de arriba sería solo una sugerencia: el UPDATE directo
-- sobre la tabla sigue existiendo y es el que tenía el agujero. Estas tres
-- columnas —lo contado, la diferencia y el estado— solo las escribe la
-- función, que se identifica con una marca de transacción.
--
-- Lo que SÍ sigue pudiendo hacer un UPDATE normal: que administración observe
-- o corrija una jornada, y que gerencia resuelva una diferencia
-- (`dif_resolucion`), que son caminos legítimos con su propia pantalla.
create or replace function public.trg_arqueo_solo_del_servidor()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('rq.arqueo', true), '') = '1' then
    return new;                       -- viene de cerrar_con_arqueo()
  end if;
  if auth.uid() is null then
    return new;                       -- cargas de datos y mantenimiento
  end if;

  if new.efectivo_contado is distinct from old.efectivo_contado
     or new.diferencia is distinct from old.diferencia then
    raise exception 'El arqueo se cierra desde la pantalla de rendiciones: la diferencia la calcula el sistema, no se digita.';
  end if;

  -- El estado sí puede cambiar por otros caminos (observar, corregir,
  -- resolver la diferencia), pero NUNCA hacia 'Aprobada' sin pasar por el
  -- arqueo — salvo que gerencia esté resolviendo una diferencia, que es el
  -- camino documentado de la migración 27.
  if new.estado = 'Aprobada' and old.estado <> 'Aprobada'
     and new.dif_resolucion is not distinct from old.dif_resolucion then
    raise exception 'Una jornada se aprueba contando el efectivo, no marcándola aprobada.';
  end if;

  return new;
end;
$$;

drop trigger if exists zz_arqueo_solo_del_servidor on public.rendiciones;
create trigger zz_arqueo_solo_del_servidor
  before update on public.rendiciones
  for each row execute function public.trg_arqueo_solo_del_servidor();

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) La función y el trigger existen:
--
--   select proname from pg_proc where proname = 'cerrar_con_arqueo';
--   select tgname from pg_trigger
--    where tgrelid = 'public.rendiciones'::regclass and not tgisinternal
--    order by tgname;
--
-- 2) Las jornadas ya cerradas NO se tocan: esta migración solo cambia cómo se
--    cierran las próximas. Para ver si alguna vieja quedó con una diferencia
--    que no cuadra con su propia aritmética (señal de que se maquilló antes):
--
--   select r.numero, r.proyecto, r.fecha, r.estado,
--          r.efectivo_contado, r.diferencia as dice,
--          r.efectivo_contado - (
--            coalesce((select sum(monto) from public.entregas_caja e
--                       where e.proyecto = r.proyecto and e.fecha = r.fecha
--                         and e.anulacion is null), 0)
--          - coalesce((select sum(monto) from public.facturas f
--                       where f.rendicion_id = r.id and f.anulacion is null), 0)
--          ) as deberia_decir
--     from public.rendiciones r
--    where r.efectivo_contado is not null and r.fecha >= date '2026-08-12'
--    order by r.fecha desc;
--
--   Las columnas `dice` y `deberia_decir` tienen que coincidir en todas.
