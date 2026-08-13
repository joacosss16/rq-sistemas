-- ============================================================
-- MIGRACIÓN 40 · QUIÉN DECIDIÓ, Y QUE NADIE PUEDA BORRAR
--
-- Dos cosas sueltas de la etapa 1 de seguridad.
--
-- 1) QUIÉN APROBÓ O RECHAZÓ CADA ÍTEM
-- La migración 25 selló CUÁNDO se decide cada ítem, para medir el
-- tiempo de respuesta de Compras. Pero no guarda QUIÉN lo decidió.
-- Hoy, si alguien pregunta "¿quién aprobó esta compra de S/ 8.000?",
-- el sistema no lo sabe: solo sabe a qué hora fue.
-- Es la pieza que le falta a la trazabilidad justo en el punto donde
-- se compromete el dinero.
--
-- 2) BORRAR
-- Siete políticas están escritas `for all`, que en Postgres incluye
-- DELETE. Nadie borra desde la app —el catálogo se da de baja con
-- activo=false— pero el permiso está dado: una llamada directa a la
-- API con la sesión de Compras podría eliminar los 1.740 materiales
-- o los 255 proveedores. Y una fila borrada no deja rastro de nada.
--
-- La solución es partir cada política en dos: una de insertar y otra
-- de actualizar. Postgres deniega DELETE cuando no hay política que
-- lo permita, así que basta con no escribirla.
--
-- NO cambia nada de lo que hoy hace nadie en pantalla.
-- Se corre en el editor SQL de Supabase. Se puede repetir sin daño.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) QUIÉN DECIDIÓ
-- Lo estampa la base junto con la hora, en el mismo trigger. No
-- viaja desde el navegador: es una firma, y ya sabemos en qué acaban
-- las firmas que las escribe el cliente.
-- ------------------------------------------------------------
alter table public.rq_items
  add column if not exists decidido_por uuid references public.usuarios (id);

comment on column public.rq_items.decidido_por is
  'Quién aprobó o rechazó el ítem. Lo estampa el trigger sella_decision desde la sesión, nunca el cliente. Los ítems decididos antes de la migración 40 quedan en null.';

create or replace function public.trg_sella_decision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Primera vez que sale de Pendiente: se sella el momento y la persona.
  if coalesce(old.decision, 'Pendiente') = 'Pendiente'
     and new.decision <> 'Pendiente' then
    if new.decidido_en is null then
      new.decidido_en := now();
    end if;
    new.decidido_por := auth.uid();
  else
    -- En cualquier otro UPDATE la firma se conserva: que nadie la
    -- reescriba después para figurar como quien aprobó.
    new.decidido_por := old.decidido_por;
  end if;
  return new;
end;
$$;

drop trigger if exists sella_decision on public.rq_items;
create trigger sella_decision
  before update on public.rq_items
  for each row execute function public.trg_sella_decision();

-- ------------------------------------------------------------
-- 2) SIN BORRADO
-- Cada `for all` se parte en insertar + actualizar. Sin política de
-- delete, Postgres lo deniega solo.
--
-- Qué hacer en su lugar cuando algo "sobra":
--   · materiales  -> activo = false (así lo hace ya la app)
--   · proyectos   -> activo = false
--   · proveedores -> dejarlo; un proveedor con historial de compras
--                    no se borra nunca, se deja de usar
-- ------------------------------------------------------------

-- Proyectos: solo gerencia, y sin borrar una obra (arrastraría con
-- ella sus RQs, sus salidas y su historial entero).
drop policy if exists proyectos_write on public.proyectos;
drop policy if exists proyectos_insert on public.proyectos;
drop policy if exists proyectos_update on public.proyectos;
create policy proyectos_insert on public.proyectos
  for insert to authenticated
  with check (coalesce(public.mi_rol(), '') = 'gerente');
create policy proyectos_update on public.proyectos
  for update to authenticated
  using      (coalesce(public.mi_rol(), '') = 'gerente')
  with check (coalesce(public.mi_rol(), '') = 'gerente');

-- Catálogo de materiales: Compras. Se da de baja, no se borra.
drop policy if exists materiales_write on public.materiales;
drop policy if exists materiales_insert on public.materiales;
drop policy if exists materiales_update on public.materiales;
create policy materiales_insert on public.materiales
  for insert to authenticated
  with check (coalesce(public.mi_rol(), '') = 'compras');
create policy materiales_update on public.materiales
  for update to authenticated
  using      (coalesce(public.mi_rol(), '') = 'compras')
  with check (coalesce(public.mi_rol(), '') = 'compras');

-- Proveedores: Compras y el comprador (el alta es automática al facturar).
drop policy if exists proveedores_write on public.proveedores;
drop policy if exists proveedores_insert on public.proveedores;
drop policy if exists proveedores_update on public.proveedores;
create policy proveedores_insert on public.proveedores
  for insert to authenticated
  with check (coalesce(public.mi_rol(), '') in ('compras', 'comprador'));
create policy proveedores_update on public.proveedores
  for update to authenticated
  using      (coalesce(public.mi_rol(), '') in ('compras', 'comprador'))
  with check (coalesce(public.mi_rol(), '') in ('compras', 'comprador'));

-- Familias del catálogo: Compras.
drop policy if exists familias_write on public.familias;
drop policy if exists familias_insert on public.familias;
drop policy if exists familias_update on public.familias;
create policy familias_insert on public.familias
  for insert to authenticated
  with check (coalesce(public.mi_rol(), '') = 'compras');
create policy familias_update on public.familias
  for update to authenticated
  using      (coalesce(public.mi_rol(), '') = 'compras')
  with check (coalesce(public.mi_rol(), '') = 'compras');

-- Cajas chicas: gerencia. `monto_fondo` quedó obsoleta con la
-- migración 38, pero `tolerancia` sigue viva y es de gerencia.
drop policy if exists cajas_write on public.cajas_chicas;
drop policy if exists cajas_insert on public.cajas_chicas;
drop policy if exists cajas_update on public.cajas_chicas;
create policy cajas_insert on public.cajas_chicas
  for insert to authenticated
  with check (coalesce(public.mi_rol(), '') = 'gerente');
create policy cajas_update on public.cajas_chicas
  for update to authenticated
  using      (coalesce(public.mi_rol(), '') = 'gerente')
  with check (coalesce(public.mi_rol(), '') = 'gerente');

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- CÓMO COMPROBAR
--
-- 1) Con la sesión de Compras, aprobar un ítem desde la app y luego:
--      select decision, decidido_en, decidido_por from public.rq_items
--       where id = '<uuid>';
--    ESPERADO: decidido_por con el uuid de Lucía.
--
-- 2) Que la firma no se pueda reescribir después: cualquier UPDATE
--    posterior sobre ese ítem debe dejar `decidido_por` igual.
--
-- 3) Que ya no se pueda borrar, con la sesión de Compras:
--      delete from public.materiales where codigo = '<uno cualquiera>';
--    ESPERADO: 0 filas borradas (no hay política de delete).
--    Y que SÍ siga pudiendo dar de baja: update materiales set
--    activo = false where codigo = '...';  -> 1 fila.
--
-- 4) Que el catálogo se siga viendo y que Compras siga pudiendo
--    aprobar materiales nuevos desde su pantalla.
-- ============================================================
