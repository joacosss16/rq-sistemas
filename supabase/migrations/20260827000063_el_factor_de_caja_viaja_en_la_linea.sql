-- ============================================================
-- MIGRACIÓN 63 · El factor de caja viaja congelado en la línea
-- ============================================================
--
-- Hermana de la migración 59, que hizo esto mismo con la unidad. Aquí va lo
-- que faltaba: CUÁNTAS UNIDADES TRAÍA LA CAJA el día que se registró la línea.
--
-- EL PROBLEMA. `materiales.factor_caja` es un dato del PRESENTE: dice cuántas
-- unidades trae hoy una caja de ese material. Pero se usa para interpretar el
-- PASADO — y un proveedor cambia el empaque cuando quiere. El día que la caja
-- de clavos pase de 100 a 120 y Lucía actualice la equivalencia, todo lo ya
-- registrado se reinterpreta solo, sin que nadie toque nada:
--
--   · El precio promedio y el historial con el que se negocia. La función que
--     normaliza precios a unidad base (src/App.jsx) divide el precio de la
--     caja entre el factor. Con el factor nuevo, una compra de hace tres meses
--     pasa de S/1.00 por unidad a S/0.83 — y el valorizado del almacén y el
--     cierre mensual ya firmado cambian con ella.
--   · La recepción. El almacenero ve "cajas × unidades por caja" con el factor
--     de hoy propuesto para un pedido de antes.
--
-- Nadie se entera, porque no hay error: solo cifras distintas de las de ayer.
--
-- LA REGLA, la misma de siempre en este sistema: el dato con el que se decidió
-- se guarda con la decisión. El catálogo dice cómo se compra HOY; la línea
-- dice cómo se compró ESE DÍA. Cambiar el catálogo no reescribe el pasado.

alter table public.rq_items
  add column if not exists factor_caja numeric(10,2) check (factor_caja > 0);

comment on column public.rq_items.factor_caja is
  'Unidades por caja el día que se creó la línea. Congelado: el catálogo puede cambiar, esta línea no. Nulo = el material no se compra por caja.';

-- ── Relleno de lo ya registrado ──────────────────────────────
-- Se copia el factor actual del catálogo. Para las líneas de antes es la mejor
-- suposición disponible —y hoy es exacta, porque ningún material tiene factor
-- cargado todavía: las equivalencias de Lucía aún no entraron. Desde el
-- momento en que las cargue, cada línea nueva guarda el suyo.
update public.rq_items i
   set factor_caja = m.factor_caja
  from public.materiales m
 where m.codigo = i.codigo
   and i.factor_caja is null
   and m.factor_caja is not null;

-- ── Y se congela al crear, igual que la unidad ───────────────
--
-- Se amplía `trg_congelar_unidad`, que ya hace exactamente esto con `und` y ya
-- corre sobre esta tabla: son el mismo dato visto de dos formas —en qué unidad
-- está la línea y cuántas unidades trae su envase— y separarlos en dos
-- triggers solo abre la puerta a que uno se actualice y el otro no.
--
-- La exención de la compra parcial (migración 61) se conserva y ahora cubre
-- las dos columnas: el saldo hereda del ítem original tanto la unidad como el
-- factor, en vez de volver a deducirlos del catálogo.
create or replace function public.trg_congelar_unidad()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(current_setting('rq.compra_parcial', true), '') = '1'
     and new.und is not null then
    return new;
  end if;
  select coalesce(m.und_base, m.und) into new.und
    from public.materiales m where m.codigo = new.codigo;
  -- Solo rq_items tiene esta columna; en salidas, préstamos y stock_inicial
  -- las cantidades ya viven en unidad de consumo y no hay nada que convertir.
  if tg_table_name = 'rq_items' then
    select m.factor_caja into new.factor_caja
      from public.materiales m where m.codigo = new.codigo;
  end if;
  return new;
end;
$$;

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) La columna existe y las líneas de materiales con caja la tienen puesta.
--    Hoy debe dar 0 filas (ningún material tiene factor cargado todavía);
--    después de que Lucía cargue las equivalencias, dará las que correspondan:
--
--   select i.codigo, count(*) lineas, count(i.factor_caja) con_factor
--     from public.rq_items i
--     join public.materiales m on m.codigo = i.codigo
--    where m.factor_caja is not null
--    group by i.codigo order by 1;
--
-- 2) Prueba de que el pasado ya no se mueve: cargar una equivalencia y
--    comprobar que las líneas anteriores conservan su factor.
--
--   -- antes:  select codigo, cant, und, factor_caja from public.rq_items where codigo = '<uno>';
--   -- cargar: update public.materiales set factor_caja = 100, und_base = 'UND' where codigo = '<uno>';
--   -- después: la MISMA consulta debe devolver exactamente lo mismo.
