-- ============================================================
-- MIGRACIÓN 77 · Quién contó el efectivo no se borra
-- ============================================================
--
-- EL FALLO. La migración 47 concentró el circuito del dinero en Mónica —
-- decisión del dueño, y bien razonada: en una empresa de este tamaño no hay
-- dos personas de administración, y fingir que las hay produce cuentas
-- compartidas, que es peor. A cambio prometió un control:
--
--   "La app avisa a gerencia cuando la misma persona registró las entregas
--    de un día y además cerró el arqueo de esa jornada."
--
-- Esa alerta existe y funciona (Auditoría, "Entregó y aprobó la misma
-- persona"). Compara quién entregó el efectivo contra `aprobado_por`.
--
-- El problema es que `aprobado_por` significa DOS cosas distintas:
--
--   · En un día normal → Mónica, que contó el efectivo. La alerta salta. ✓
--   · En un día con descuadre → la migración 67 lo deja en NULO, y cuando
--     gerencia resuelve la diferencia la aplicación escribe encima el id de
--     GERENCIA. La comparación da falso y la alerta NO salta.
--
-- O sea: el control que vigila que una sola persona no tenga las dos puntas
-- del efectivo está callado exactamente los días en que el efectivo no
-- cuadró. Los días tranquilos avisa; el día raro, no. Es la inversión
-- completa de lo que debería hacer.
--
-- Y de paso la jornada queda mostrando "Aprobada por gerencia", perdiendo de
-- vista que quien contó los billetes fue Mónica.
--
-- LA CAUSA no es un error de la 47 ni de la 67: es que una sola columna
-- guarda dos hechos que no son el mismo. Quién CONTÓ el efectivo y quién dio
-- el VISTO BUENO final son dos firmas distintas, y en el único caso que
-- importa —el descuadre— son dos personas distintas.
--
-- LA CORRECCIÓN. Dos hechos, dos columnas.
--   · `arqueo_por` / `arqueo_en` → quién contó el efectivo. Lo pone SIEMPRE
--     el servidor al cerrar el arqueo, haya descuadre o no.
--   · `aprobado_por` → quién dio el visto bueno final. Conserva su
--     significado actual, y ahora es honesto: en un descuadre es gerencia,
--     porque es gerencia quien lo aprobó.
--
-- La alerta pasa a mirar `arqueo_por`, que ya nadie sobrescribe.
--
-- QUÉ SE LEYÓ ANTES DE ESCRIBIR ESTO (la regla de la casa, después de lo del
-- 28 de agosto): `cerrar_con_arqueo` solo se define en la migración 67 — ni
-- la 70 ni la 75 la tocan. `trg_arqueo_solo_del_servidor`, en cambio, se
-- reescribió TRES veces: 67, 70 y 75. La versión viva es la de la 75, y es
-- esa —no la de la 67— la que se conserva aquí palabra por palabra.
--
-- Se corre en el editor SQL de Supabase. Se puede repetir sin daño.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) LAS DOS COLUMNAS
-- ------------------------------------------------------------
alter table public.rendiciones
  add column if not exists arqueo_por uuid references public.usuarios (id),
  add column if not exists arqueo_en  timestamptz;

comment on column public.rendiciones.arqueo_por is
  'Quién CONTÓ el efectivo al cerrar la jornada. Lo pone siempre cerrar_con_arqueo(), haya descuadre o no. No confundir con aprobado_por, que es el visto bueno final y en un descuadre lo firma gerencia.';

-- ------------------------------------------------------------
-- 2) LO QUE SE PUEDE RECUPERAR DEL PASADO, Y LO QUE NO
-- ------------------------------------------------------------
-- Las jornadas aprobadas SIN resolución de diferencia se cerraron por el
-- camino normal: quien aparece como aprobador es quien contó. Ese dato sí se
-- puede rescatar.
--
-- Las que pasaron por `dif_resolucion` NO: su `aprobado_por` ya fue pisado
-- por gerencia y el nombre original no se guardó en ningún sitio. Se quedan
-- con `arqueo_por` nulo, y es lo correcto — inventarlo sería peor que no
-- tenerlo. Son todas datos de prueba anteriores al piloto.
update public.rendiciones
   set arqueo_por = aprobado_por,
       arqueo_en  = coalesce(arqueo_en, fecha_aprobacion::timestamptz)
 where arqueo_por is null
   and aprobado_por is not null
   and dif_resolucion is null;

-- ------------------------------------------------------------
-- 3) EL ARQUEO FIRMA QUIÉN CONTÓ
-- ------------------------------------------------------------
-- Se reescribe `cerrar_con_arqueo` ENTERA a partir de la migración 67, su
-- única definición viva. Todo lo suyo queda palabra por palabra; lo único
-- nuevo son las dos líneas de `arqueo_por` / `arqueo_en` dentro del update.
create or replace function public.cerrar_con_arqueo(
  p_rendicion uuid, p_contado numeric, p_motivo text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
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
         -- NUEVO (migración 77): quién contó el efectivo se firma SIEMPRE,
         -- haya descuadre o no. Es el dato del que depende la alerta de
         -- "entregó y arqueó la misma persona", y hasta hoy se perdía justo
         -- en los días con diferencia, que son los que importan.
         arqueo_por       = auth.uid(),
         arqueo_en        = now(),
         aprobado_por     = case when v_excede then null else auth.uid() end,
         fecha_aprobacion = case when v_excede then null else current_date end
   where id = p_rendicion;

  perform set_config('rq.arqueo', '', true);

  return jsonb_build_object(
    'recibido', v_recibido, 'gastado', v_gastado, 'debeDevolver', v_debe,
    'contado', p_contado, 'diferencia', v_dif, 'tolerancia', v_tol,
    'excede', v_excede, 'estado', v_estado);
end;
$fn$;

revoke all on function public.cerrar_con_arqueo(uuid, numeric, text) from public, anon;
grant execute on function public.cerrar_con_arqueo(uuid, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- 4) Y LA FIRMA NUEVA TAMPOCO SE ESCRIBE A MANO
-- ------------------------------------------------------------
-- Una firma que el cliente puede escribir no es una firma — la lección de las
-- migraciones 41, 55, 66 y 70. `arqueo_por` nace protegida, o mañana alguien
-- apaga la alerta poniéndole otro nombre desde fuera de la pantalla.
--
-- Se reescribe `trg_arqueo_solo_del_servidor` a partir de la versión VIVA,
-- que es la de la migración 75 (la 67 la creó, la 70 la amplió, la 75 la
-- corrigió para que no matara el botón de corrección de administración). Todo
-- lo de la 75 queda palabra por palabra; lo único nuevo es el bloque de
-- `arqueo_por` / `arqueo_en`.
create or replace function public.trg_arqueo_solo_del_servidor()
returns trigger
language plpgsql
as $fn$
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

  -- NUEVO (migración 77): quién contó el efectivo lo firma el servidor.
  -- Fuera de cerrar_con_arqueo() estas dos columnas no se tocan, ni para
  -- ponerlas ni para borrarlas. Es lo que sostiene la alerta de Auditoría.
  if new.arqueo_por is distinct from old.arqueo_por
     or new.arqueo_en is distinct from old.arqueo_en then
    raise exception 'Quién contó el efectivo lo firma el sistema al cerrar el arqueo: no se escribe a mano.';
  end if;

  -- Una jornada aprobada está cerrada: el efectivo se contó y se firmó.
  if old.estado = 'Aprobada' and new.estado is distinct from old.estado then
    raise exception 'Esa jornada ya está aprobada y cerrada: no se reabre. Si apareció algo después, se registra en la jornada de hoy y se explica.';
  end if;

  -- Se aprueba contando el efectivo. Las DOS excepciones son caminos que ya
  -- existían y que también dejan rastro:
  --   · gerencia resuelve una diferencia  (`dif_resolucion`, migración 27)
  --   · administración corrige una observada (`correccion`, migración 26)
  if new.estado = 'Aprobada' and old.estado <> 'Aprobada'
     and new.dif_resolucion is not distinct from old.dif_resolucion
     and new.correccion     is not distinct from old.correccion then
    raise exception 'Una jornada se aprueba contando el efectivo, no marcándola aprobada.';
  end if;

  return new;
end;
$fn$;

commit;

-- ── Comprobación tras correrla ────────────────────────────────
--
-- 1) Las columnas existen y el rescate del pasado se hizo:
--
--   select count(*) filter (where arqueo_por is not null) as con_firma,
--          count(*) filter (where arqueo_por is null and estado = 'Aprobada') as sin_firma,
--          count(*) as total
--     from public.rendiciones;
--
--   (`sin_firma` solo debe contar jornadas viejas resueltas por gerencia)
--
-- 2) Dónde arqueo_por y aprobado_por NO coinciden — que es justo lo que antes
--    se perdía. Deben salir las jornadas que gerencia resolvió:
--
--   select r.numero, r.proyecto, r.fecha, r.estado,
--          ua.nombre as conto_el_efectivo, up.nombre as visto_bueno_final
--     from public.rendiciones r
--     left join public.usuarios ua on ua.id = r.arqueo_por
--     left join public.usuarios up on up.id = r.aprobado_por
--    where r.arqueo_por is distinct from r.aprobado_por
--      and r.arqueo_por is not null
--    order by r.fecha desc;
--
-- 3) La firma no se puede escribir a mano (debe DAR ERROR):
--
--   update public.rendiciones set arqueo_por = null where estado = 'Aprobada';
--
-- 4) La prueba de verdad, en la aplicación:
--    · Cerrar una jornada que CUADRA → Auditoría muestra "Entregó y arqueó la
--      misma persona" con el nombre de administración.
--    · Cerrar una jornada que NO cuadra (fuera de tolerancia), que gerencia la
--      resuelva → la jornada dice "Arqueo de <administración> · resuelta por
--      <gerencia>", y la alerta SIGUE saliendo. Antes desaparecía aquí.
