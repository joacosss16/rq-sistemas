-- ============================================================
-- MIGRACIÓN 48 · LA ENTREGA ABRE LA JORNADA
--
-- EL AGUJERO, encontrado por el dueño probando: se le entregaron
-- S/ 600 al comprador el 11 de agosto y ese día no compró nada en
-- efectivo. La rendición del día se crea al registrar la primera
-- factura en efectivo — sin compra, no hay rendición. Resultado: ese
-- dinero salió del banco y NO EXISTE NINGÚN SITIO donde conste que
-- lo devolvió. Ni rendido, ni gastado, ni cuadrado.
--
-- Y no es un caso raro en obra: se adelanta plata para una compra que
-- al final no se hace, el proveedor no tenía el material, o se cerró
-- antes de llegar.
--
-- LA CAUSA: el modelo asumía que la jornada la abre LA COMPRA. Pero
-- el dinero no sale del banco cuando el comprador compra: sale cuando
-- se le entrega. La jornada tiene que abrirla la entrega.
--
-- QUÉ HACE ESTA MIGRACIÓN:
--   1. Al registrar una entrega, si no hay rendición de esa obra y
--      ese día, se crea abierta. Administración la ve, cuenta lo que
--      el comprador devuelve —todo, si no gastó— y la cierra.
--   2. Rellena las jornadas que ya quedaron huérfanas, para que el
--      dinero que hoy está en el limbo aparezca y se pueda cerrar.
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
declare
  v_nombre text;
  v_quien  uuid;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.entregado_por := auth.uid();
    end if;
    new.anulacion := null;

    if new.fecha > current_date then
      raise exception 'No se puede registrar una entrega con fecha futura.';
    end if;

    if new.fecha < current_date then
      if coalesce(trim(new.motivo_atraso), '') = '' then
        raise exception 'Esta entrega lleva fecha del %, no de hoy. Explica por qué no se registró en su momento: queda anotado con tu nombre.', to_char(new.fecha, 'DD/MM/YYYY');
      end if;
      new.motivo_atraso := trim(new.motivo_atraso);
    else
      new.motivo_atraso := null;
    end if;

    if exists (select 1 from public.rendiciones r
                where r.proyecto = new.proyecto
                  and r.fecha = new.fecha
                  and r.estado <> 'Abierta') then
      raise exception 'La rendición de % del % ya fue cerrada. Agregar una entrega ahí cambiaría un arqueo que administración ya aprobó: coordina con gerencia.', new.proyecto, to_char(new.fecha, 'DD/MM/YYYY');
    end if;

    -- ---- La entrega abre la jornada ----
    -- Quien rinde es quien recibe el dinero. Mientras haya un solo
    -- comprador se resuelve solo; el día que haya varios habrá que
    -- pedirlo en el formulario (la columna `recibido_por` ya existe).
    if not exists (select 1 from public.rendiciones r
                    where r.proyecto = new.proyecto and r.fecha = new.fecha) then
      v_quien := new.recibido_por;
      if v_quien is null then
        select id into v_quien from public.usuarios
         where rol = 'comprador' and activo order by creado_en limit 1;
      end if;
      v_quien := coalesce(v_quien, auth.uid());
      if v_quien is not null then
        insert into public.rendiciones (proyecto, fecha, responsable_id, monto_fondo)
        values (new.proyecto, new.fecha, v_quien, 0);
      end if;
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

-- ------------------------------------------------------------
-- Las jornadas que ya quedaron huérfanas: se abren para que ese
-- dinero deje de estar en el limbo y administración pueda cerrarlas.
-- ------------------------------------------------------------
insert into public.rendiciones (proyecto, fecha, responsable_id, monto_fondo)
select distinct e.proyecto, e.fecha,
       coalesce(e.recibido_por,
                (select id from public.usuarios where rol = 'comprador' and activo order by creado_en limit 1)),
       0
  from public.entregas_caja e
 where e.anulacion is null
   and not exists (select 1 from public.rendiciones r
                    where r.proyecto = e.proyecto and r.fecha = e.fecha)
   and coalesce(e.recibido_por,
                (select id from public.usuarios where rol = 'comprador' and activo order by creado_en limit 1)) is not null;

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- CÓMO COMPROBAR
--
-- 1. Esta consulta no debe devolver NINGUNA fila (entregas sin
--    jornada donde rendirlas):
--
--      select e.fecha, e.proyecto, e.monto
--        from public.entregas_caja e
--        left join public.rendiciones r
--               on r.proyecto = e.proyecto and r.fecha = e.fecha
--       where e.anulacion is null and r.id is null;
--
-- 2. En la pantalla de administración debe aparecer ahora la
--    rendición del 11 de agosto de MAIA, ABIERTA, con S/ 600
--    recibidos y S/ 600 por devolver. Cerrarla contando lo que el
--    comprador devolvió.
--
-- 3. Registrar una entrega nueva en una obra que no haya comprado
--    nada hoy: debe aparecer su rendición abierta al instante.
-- ============================================================
