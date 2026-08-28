-- ============================================================
-- MIGRACIÓN 68 · Ajustar el monto reparte el desglose
--                (arregla un fallo de la migración 65)
-- ============================================================
--
-- EL FALLO, y es mío. La migración 65 abrió la puerta a ajustar el importe al
-- convertir un compromiso en factura real, y su comentario afirma: "el
-- desglose por ítem tiene que seguir cuadrando · de eso ya se encarga el
-- trigger de la migración 5".
--
-- ES FALSO, y lo encontró un ataque al día siguiente. Ese trigger es un
-- constraint trigger definido sobre `factura_items`:
--
--     after insert or update or delete on public.factura_items
--
-- Un UPDATE que solo cambia `facturas.monto` NO modifica ninguna fila de
-- factura_items, así que el trigger no se encola ni corre jamás.
--
-- Resultado: un compromiso de S/ 500 ajustado a S/ 520 quedaba con monto 520 y
-- desglose 500 — S/ 20 de descuadre, cuarenta veces la tolerancia— y al pagar
-- se congelaba así para siempre. Ese desglose falso alimenta el precio
-- unitario del historial con el que se negocia, el valorizado del almacén y el
-- futuro Registro de Compras de SUNAT. Y peor: cualquier operación legítima
-- futura sobre esas líneas reventaría con el error de cuadre, sin que nadie
-- entendiera por qué.
--
-- LA CORRECCIÓN. En vez de exigirle a Pagos que reparta a mano —no conoce los
-- materiales ni tiene por qué—, el servidor reparte el ajuste **en proporción
-- a lo que ya valía cada línea**. Si la factura sube un 4 %, cada precio
-- unitario sube un 4 %.
--
-- Por qué proporcional y no de otra forma: es la única repartición defendible
-- sin información que el sistema no tiene. Un ajuste suele ser un redondeo, un
-- flete prorrateado o una variación de precio general; atribuirlo entero a un
-- material al azar sería peor. Y el rastro guarda el importe comprometido y el
-- real, así que la diferencia siempre se puede ver y explicar.
--
-- LA COTA. También se pone un límite de cordura: un ajuste que MULTIPLIQUE el
-- importe es un dedazo, no un ajuste. S/ 500 → S/ 5,200 (un cero de más) se
-- rechaza; S/ 500 → S/ 520 pasa. El tope es el doble o la mitad.

create or replace function public.trg_ajuste_al_convertir()
returns trigger
language plpgsql
as $$
declare
  v_nombre text;
  v_suma   numeric;
  v_factor numeric;
begin
  -- Fuera de la conversión, el rastro es intocable: ni se inventa ni se borra.
  if not (old.tipo_doc = 'Compromiso' and new.tipo_doc = 'Factura') then
    new.ajuste_monto := old.ajuste_monto;
    return new;
  end if;
  if new.monto is not distinct from old.monto then
    new.ajuste_monto := old.ajuste_monto;
    return new;
  end if;

  if new.monto is null or new.monto <= 0 then
    raise exception 'El monto de la factura real tiene que ser mayor que cero.';
  end if;

  -- Cota de cordura: un ajuste no multiplica ni parte por la mitad el importe.
  if new.monto > old.monto * 2 or new.monto < old.monto / 2 then
    raise exception
      'S/ % está muy lejos de los S/ % comprometidos: revisa si sobra o falta un dígito. Si de verdad cambió tanto, gerencia anula el compromiso y se registra de nuevo con su desglose.',
      to_char(new.monto, 'FM999999990.00'), to_char(old.monto, 'FM999999990.00');
  end if;

  -- ── El desglose se reparte en proporción ──────────────────
  select coalesce(sum(fi.precio_unitario * i.cant), 0) into v_suma
    from public.factura_items fi
    join public.rq_items i on i.id = fi.rq_item_id
   where fi.factura_id = new.id;

  if v_suma > 0 then
    v_factor := new.monto / v_suma;
    update public.factura_items fi
       set precio_unitario = round(fi.precio_unitario * v_factor, 4)
     where fi.factura_id = new.id;

    -- El redondeo a 4 decimales puede dejar unos céntimos sueltos. Se cargan a
    -- la línea más grande, que es donde menos se notan en el precio unitario.
    -- Sin esto, el trigger de cuadre (migración 5) rechazaría la operación
    -- entera por una diferencia de céntimos.
    select coalesce(sum(fi.precio_unitario * i.cant), 0) into v_suma
      from public.factura_items fi
      join public.rq_items i on i.id = fi.rq_item_id
     where fi.factura_id = new.id;

    if abs(new.monto - v_suma) >= 0.005 then
      update public.factura_items fi
         set precio_unitario = round(
               (fi.precio_unitario * i.cant + (new.monto - v_suma)) / i.cant, 4)
        from public.rq_items i
       where i.id = fi.rq_item_id
         and fi.factura_id = new.id
         and fi.rq_item_id = (
           select fi2.rq_item_id from public.factura_items fi2
             join public.rq_items i2 on i2.id = fi2.rq_item_id
            where fi2.factura_id = new.id
            order by fi2.precio_unitario * i2.cant desc, fi2.rq_item_id
            limit 1);
    end if;
  end if;

  select nombre into v_nombre from public.usuarios where id = auth.uid();

  new.ajuste_monto := jsonb_build_object(
    'comprometido', old.monto,
    'real',         new.monto,
    'diferencia',   new.monto - old.monto,
    'por',          coalesce(v_nombre, 'desconocido'),
    'fecha',        current_date::text,
    'reparto',      'proporcional al desglose comprometido');

  return new;
end;
$$;

-- ── Y una red por si el reparto no alcanza ───────────────────
--
-- El reparto de arriba cubre el camino previsto. Esta guarda cubre CUALQUIER
-- otro: si por la vía que sea el monto de una factura acaba sin cuadrar con su
-- desglose, la transacción no pasa. Es constraint trigger DIFERIDO —como el de
-- la migración 5— para que se compruebe al final, cuando el monto y las líneas
-- ya se movieron los dos.
create or replace function public.trg_factura_cuadre_por_monto()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_suma numeric;
  v_sin  int;
begin
  if new.anulacion is not null then return null; end if;   -- anulada: no se valida
  if new.monto is not distinct from old.monto then return null; end if;

  select coalesce(sum(fi.precio_unitario * i.cant), 0),
         count(*) filter (where fi.precio_unitario is null)
    into v_suma, v_sin
    from public.factura_items fi
    join public.rq_items i on i.id = fi.rq_item_id
   where fi.factura_id = new.id;

  -- Sin líneas todavía (o sin precios) no hay nada que cuadrar: de eso se
  -- encarga el trigger de la migración 5 cuando lleguen.
  if v_sin > 0 then return null; end if;
  if not exists (select 1 from public.factura_items where factura_id = new.id) then
    return null;
  end if;

  if abs(new.monto - v_suma) > 0.5 then
    raise exception
      'El monto de la factura (S/ %) no cuadra con el desglose por ítem (S/ %). El precio de cada material tiene que sumar el total.',
      to_char(new.monto, 'FM999999990.00'), to_char(v_suma, 'FM999999990.00');
  end if;
  return null;
end;
$$;

drop trigger if exists facturas_cuadre_por_monto on public.facturas;
create constraint trigger facturas_cuadre_por_monto
  after update on public.facturas
  deferrable initially deferred
  for each row execute function public.trg_factura_cuadre_por_monto();

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) ¿Quedó alguna factura descuadrada de antes de este arreglo? Debe dar 0
--    filas. Si sale alguna, es de un ajuste hecho con la migración 65 sin
--    corregir, y hay que repartirla a mano:
--
--   select f.serie, f.proveedor_ruc, f.monto,
--          (select coalesce(sum(fi.precio_unitario * i.cant), 0)
--             from public.factura_items fi
--             join public.rq_items i on i.id = fi.rq_item_id
--            where fi.factura_id = f.id) as desglose
--     from public.facturas f
--    where f.anulacion is null
--      and exists (select 1 from public.factura_items x where x.factura_id = f.id)
--      and abs(f.monto - (select coalesce(sum(fi.precio_unitario * i.cant), 0)
--                           from public.factura_items fi
--                           join public.rq_items i on i.id = fi.rq_item_id
--                          where fi.factura_id = f.id)) > 0.5;
--
-- 2) El trigger existe:
--
--   select tgname from pg_trigger
--    where tgrelid = 'public.facturas'::regclass and not tgisinternal
--    order by tgname;
