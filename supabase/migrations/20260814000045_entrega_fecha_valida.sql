-- ============================================================
-- MIGRACIÓN 45 · HASTA DÓNDE PUEDE IR LA FECHA DE UNA ENTREGA
--
-- La migración 38 dejó la fecha de la entrega abierta a propósito:
-- si Pagos se olvida de registrar la de ayer, tiene que poder
-- ponerla. Si no, la rendición de ese día se queda en cero y el
-- arqueo saca todo el efectivo como faltante, para siempre.
--
-- Pero quedaron dos huecos:
--
-- 1) Se podía registrar una entrega con fecha de un día cuya
--    rendición YA ESTÁ CERRADA. Eso cambia el "debe devolver" de un
--    arqueo que administración ya contó, aprobó y firmó. Es el mismo
--    caso que sí se guardó para la ANULACIÓN de una entrega — y se
--    olvidó que agregar una hace exactamente el mismo daño.
--
-- 2) Se podía poner una fecha futura. No se entrega dinero mañana.
--
-- Se corre en el editor SQL de Supabase. Se puede repetir sin daño.
-- ============================================================

begin;

create or replace function public.trg_entrega_caja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_nombre text;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.entregado_por := auth.uid();
    end if;
    new.anulacion := null;

    if new.fecha > current_date then
      raise exception 'No se puede registrar una entrega con fecha futura.';
    end if;

    -- El día ya cerrado no se toca: cambiaría un arqueo ya aprobado.
    if exists (select 1 from public.rendiciones r
                where r.proyecto = new.proyecto
                  and r.fecha = new.fecha
                  and r.estado <> 'Abierta') then
      raise exception 'La rendición de % del % ya fue cerrada. Agregar una entrega ahí cambiaría un arqueo que administración ya aprobó: coordina con gerencia.', new.proyecto, to_char(new.fecha, 'DD/MM/YYYY');
    end if;

    return new;
  end if;

  -- UPDATE: lo único que puede cambiar es la anulación.
  if new.proyecto      is distinct from old.proyecto
  or new.fecha         is distinct from old.fecha
  or new.monto         is distinct from old.monto
  or new.medio         is distinct from old.medio
  or new.num_operacion is distinct from old.num_operacion
  or new.entregado_por is distinct from old.entregado_por then
    raise exception 'Una entrega de efectivo no se edita: el monto, el día, el medio y el número de operación son el rastro que cuadra con el banco. Si está mal, anúlala con motivo y registra la correcta.';
  end if;

  if new.anulacion is distinct from old.anulacion then
    if old.anulacion is not null then
      raise exception 'Esa entrega ya estaba anulada.';
    end if;
    if coalesce(trim(new.anulacion ->> 'motivo'), '') = '' then
      raise exception 'Anular una entrega de efectivo exige explicar por qué.';
    end if;
    select nombre into v_nombre from public.usuarios where id = auth.uid();
    new.anulacion := jsonb_build_object(
      'motivo', trim(new.anulacion ->> 'motivo'),
      'por',    coalesce(v_nombre, 'desconocido'),
      'fecha',  current_date::text);
    if exists (select 1 from public.rendiciones r
                where r.proyecto = old.proyecto
                  and r.fecha = old.fecha
                  and r.estado <> 'Abierta') then
      raise exception 'La rendición de ese día ya fue cerrada: anular esta entrega cambiaría un arqueo aprobado. Coordina con gerencia.';
    end if;
  end if;

  return new;
end;
$$;

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- CÓMO COMPROBAR
--  · Registrar una entrega con la fecha de AYER, si la rendición de
--    ese día sigue abierta o no existe: debe entrar.
--  · Registrar una con fecha de MAÑANA: debe rechazarla.
--  · Registrar una con la fecha de un día cuya rendición ya está
--    Aprobada: debe rechazarla explicando por qué.
-- ============================================================
