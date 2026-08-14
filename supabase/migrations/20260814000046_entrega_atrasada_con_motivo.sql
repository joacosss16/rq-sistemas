-- ============================================================
-- MIGRACIÓN 46 · UNA ENTREGA CON FECHA ATRASADA LLEVA MOTIVO
--
-- Registrar una entrega con fecha de un día anterior es legítimo:
-- si nadie apuntó la de ayer, hay que poder ponerla o la rendición
-- de ese día queda en cero.
--
-- Pero es la excepción, y conviene que quede explicada. El riesgo no
-- es el que parece: añadir una entrega SUBE el "debe devolver", así
-- que empeora un faltante en vez de taparlo. Lo que sí permite es
-- explicar un SOBRANTE — si al cerrar aparece efectivo de más sin
-- justificación, una entrega puesta después con fecha de ese día lo
-- convierte en algo normal. Y ahí está el punto débil: una
-- transferencia la respalda el extracto del banco; una entrega en
-- EFECTIVO no la respalda nada.
--
-- Por eso: motivo obligatorio SOLO si la fecha no es hoy. El caso
-- normal —registrar la entrega del día, varias veces por jornada— no
-- pide nada extra. La fricción va donde está la excepción.
--
-- Se corre en el editor SQL de Supabase. Se puede repetir sin daño.
-- ============================================================

begin;

alter table public.entregas_caja
  add column if not exists motivo_atraso text;

comment on column public.entregas_caja.motivo_atraso is
  'Por qué esta entrega no se registró el mismo día. Obligatorio cuando la fecha es anterior a la de registro; nulo en el caso normal.';

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

    -- Fecha atrasada: se admite, pero explicada.
    if new.fecha < current_date then
      if coalesce(trim(new.motivo_atraso), '') = '' then
        raise exception 'Esta entrega lleva fecha del %, no de hoy. Explica por qué no se registró en su momento: queda anotado con tu nombre.', to_char(new.fecha, 'DD/MM/YYYY');
      end if;
      new.motivo_atraso := trim(new.motivo_atraso);
    else
      new.motivo_atraso := null;   -- entrega del día: no aplica
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
  or new.motivo_atraso is distinct from old.motivo_atraso
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
--  · Entrega con la fecha de HOY: no pide motivo, entra igual que antes.
--  · Entrega con fecha de ayer SIN motivo: la rechaza y explica.
--  · Entrega con fecha de ayer CON motivo: entra, y el motivo queda
--    visible en la lista y en la rendición de ese día.
-- ============================================================
