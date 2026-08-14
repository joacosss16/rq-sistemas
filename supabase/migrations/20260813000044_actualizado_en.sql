-- ============================================================
-- MIGRACIÓN 44 · LA MARCA DE ÚLTIMA MODIFICACIÓN
--
-- PARA QUÉ: que el navegador pueda pedir "dame solo lo que cambió
-- desde la última vez" en vez de bajar las diez tablas enteras cada
-- 40 segundos y además tras cada clic.
--
-- El problema medido en producción: 838 KB por ciclo, unos 75 MB por
-- hora y por persona. Con 5 obras eso agota el plan de Supabase en
-- días y hace que cada botón tarde segundos con datos móviles en
-- obra — que es lo que hace que un equipo diga "el sistema es lento"
-- la primera semana.
--
-- POR QUÉ NO SE PODÍA RESOLVER "NO CARGANDO LO ARCHIVADO": porque
-- `db.rqs` alimenta también el stock, el historial de precios, el
-- reporte mensual y los 14 KPIs del Tablero. Filtrarlo encogería
-- todos esos números sin ningún error visible. Con esta marca, el
-- navegador conserva la foto completa en memoria y solo pide los
-- cambios: los números siguen exactos.
--
-- ⚠ EL NOMBRE DEL TRIGGER EMPIEZA POR ZZ A PROPÓSITO.
-- Los triggers `before` corren en orden alfabético, y este tiene que
-- ser el ÚLTIMO. Las guardas de las migraciones 34, 36, 37 y 41
-- comparan la fila ENTERA menos sus columnas permitidas; si esta
-- marca cambiara antes que ellas, la tomarían por una modificación
-- no autorizada y rechazarían la operación. NO renombrar sin revisar
-- eso, y comprobar el orden con la consulta del final.
--
-- Se corre en el editor SQL de Supabase. Se puede repetir sin daño.
-- ============================================================

begin;

alter table public.rqs                  add column if not exists actualizado_en timestamptz not null default now();
alter table public.rq_items             add column if not exists actualizado_en timestamptz not null default now();
alter table public.facturas             add column if not exists actualizado_en timestamptz not null default now();
alter table public.salidas              add column if not exists actualizado_en timestamptz not null default now();
alter table public.prestamos            add column if not exists actualizado_en timestamptz not null default now();
alter table public.solicitudes_material add column if not exists actualizado_en timestamptz not null default now();
alter table public.rendiciones          add column if not exists actualizado_en timestamptz not null default now();
alter table public.entregas_caja        add column if not exists actualizado_en timestamptz not null default now();

create or replace function public.trg_marca_actualizado()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['rqs', 'rq_items', 'facturas', 'salidas', 'prestamos',
                           'solicitudes_material', 'rendiciones', 'entregas_caja'] loop
    execute format('drop trigger if exists zz_actualizado_en on public.%I', t);
    execute format('create trigger zz_actualizado_en before insert or update on public.%I
                    for each row execute function public.trg_marca_actualizado()', t);
    execute format('create index if not exists idx_%s_actualizado on public.%I (actualizado_en)', t, t);
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- QUÉ TABLAS **NO** LLEVAN LA MARCA, Y POR QUÉ
--
-- `factura_items` y `alertas_levantadas`: de las dos se BORRAN filas
-- (anular una factura borra sus líneas; reabrir una alerta borra su
-- levantamiento). Una fila borrada no puede llegar como "cambio": el
-- navegador no se enteraría nunca de que desapareció. Se siguen
-- trayendo enteras.
--
-- `stock_inicial` y `cajas_chicas`: no tienen columna `id` propia
-- (su clave es compuesta), así que la mezcla por id no aplica. Pesan
-- muy poco.
--
-- CÓMO COMPROBAR QUE EL ORDEN QUEDÓ BIEN
-- `zz_actualizado_en` debe salir el ÚLTIMO en cada tabla:
--
--   select c.relname as tabla, t.tgname as trigger
--     from pg_trigger t join pg_class c on c.oid = t.tgrelid
--    where not t.tgisinternal
--      and c.relname in ('rq_items','salidas','prestamos','rendiciones')
--    order by c.relname, t.tgname;
-- ============================================================
