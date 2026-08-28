-- ============================================================
-- MIGRACIÓN 65 · La factura real puede llegar por otro monto
-- ============================================================
--
-- EL CALLEJÓN. Lucía registra un compromiso de crédito por S/ 500: el
-- proveedor da crédito y emitirá la factura recién al cobrar. Llega el día del
-- pago y la factura real dice S/ 520 — un flete que no estaba, un redondeo, un
-- precio que se movió. Cosa de todos los días.
--
-- Al convertir el compromiso, hoy lo único que se puede escribir es la serie:
-- el trigger de la migración 54 rechaza cualquier cambio de monto. Así que la
-- deuda que el sistema registra y la que el proveedor cobra dejan de coincidir,
-- y una vez pagada la factura queda congelada para siempre. La única salida es
-- anular y rehacer, lo que además obliga a repetir el desglose por ítem.
--
-- LA CORRECCIÓN. El monto puede ajustarse EN EL MOMENTO DE LA CONVERSIÓN, que
-- es cuando el papel del proveedor llega y se sabe la cifra de verdad. Con tres
-- condiciones, y ninguna es adorno:
--
--   1. SOLO en esa transición. Una factura normal sigue sin poder cambiar de
--      monto, y una ya pagada tampoco. Este permiso no se hereda.
--   2. CON RASTRO, y lo estampa el SERVIDOR. Queda guardado cuánto se
--      comprometió, cuánto se pagó, quién lo ajustó y cuándo. Un ajuste de
--      importe sin rastro es justo lo que no puede existir en un sistema de
--      dinero — y si lo escribiera el navegador, no sería rastro sino adorno.
--   3. El desglose por ítem tiene que seguir cuadrando. De eso ya se encarga
--      el trigger de la migración 5 (tolerancia S/ 0.50), que no se toca: si
--      la factura real trae otro importe, hay que decir a qué ítem le
--      corresponde. Un ajuste global sin repartir no pasa.

alter table public.facturas
  add column if not exists ajuste_monto jsonb;

comment on column public.facturas.ajuste_monto is
  'Rastro del ajuste al convertir un compromiso en factura real: comprometido, real, quién y cuándo. Nulo = la factura llegó por el importe comprometido.';

create or replace function public.trg_ajuste_al_convertir()
returns trigger
language plpgsql
as $$
declare
  v_nombre text;
begin
  -- Solo interesa la conversión de compromiso a factura con cambio de importe.
  if not (old.tipo_doc = 'Compromiso' and new.tipo_doc = 'Factura') then
    -- Fuera de la conversión, el rastro es intocable: ni se inventa ni se borra.
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

  select nombre into v_nombre from public.usuarios where id = auth.uid();

  -- Lo escribe el servidor, con su propia hora y su propia firma.
  new.ajuste_monto := jsonb_build_object(
    'comprometido', old.monto,
    'real',         new.monto,
    'diferencia',   new.monto - old.monto,
    'por',          coalesce(v_nombre, 'desconocido'),
    'fecha',        current_date::text);

  return new;
end;
$$;

-- `zz_` para que corra AL FINAL, después de las guardas de la migración 54:
-- primero se comprueba que la conversión es legítima, y solo entonces se sella
-- el rastro. Si corriera antes, sellaría ajustes de operaciones que van a ser
-- rechazadas.
drop trigger if exists zz_ajuste_al_convertir on public.facturas;
create trigger zz_ajuste_al_convertir
  before update on public.facturas
  for each row execute function public.trg_ajuste_al_convertir();

-- ── Y la guarda de la 54 deja pasar el monto en la conversión ─
--
-- Se reescribe `trg_facturas_bu` ENTERA —en PL/pgSQL no se parchea un trozo—
-- copiada palabra por palabra de la migración 54, con UN SOLO cambio: en la
-- rama Compromiso → Factura, `new.monto is distinct from old.monto` sale de la
-- lista de campos intocables.
--
-- Todo lo demás queda igual, y conviene leer lo que NO cambia: la anulación
-- sigue siendo de gerencia y con motivo, una factura anulada sigue sin admitir
-- cambios, el RUC y la obra siguen congelados también en la conversión, la rama
-- Pendiente → Factura no se toca (ahí la compra YA está pagada, el dinero salió
-- del banco y no hay nada que ajustar), los datos comerciales de una factura
-- normal siguen sin editarse, no se paga un compromiso sin serie real, una
-- factura pagada sigue congelada salvo conciliación, y la conciliación sigue
-- siendo exclusiva de gerencia.
create or replace function public.trg_facturas_bu()
returns trigger
language plpgsql
as $$
declare
  v_campos text[] := array['anulacion', 'actualizado_en'];
begin
  -- Anular: solo se escribe el rastro, nada más.
  if old.anulacion is null and new.anulacion is not null then
    if coalesce(public.mi_rol(), '') <> 'gerente' then
      raise exception 'La anulación de una factura la confirma gerencia.';
    end if;
    if coalesce(trim(new.anulacion->>'motivo'), '') = '' then
      raise exception 'La anulación exige un motivo.';
    end if;
    if (to_jsonb(new) - v_campos) is distinct from (to_jsonb(old) - v_campos) then
      raise exception 'Al anular solo se escribe el rastro: ningún otro dato de la factura se toca en la misma operación.';
    end if;
    return new;
  end if;
  if old.anulacion is not null then
    raise exception 'Esa factura está anulada: no admite cambios.';
  end if;

  -- COMPROMISO -> FACTURA: ocurre AL PAGAR, así que en la misma
  -- operación llegan la serie real y los datos del pago (como hoy).
  --
  -- EL MONTO SÍ SE PUEDE AJUSTAR AQUÍ (migración 65): es el momento en que
  -- llega el papel del proveedor y se sabe la cifra de verdad. El rastro de
  -- ese ajuste lo estampa el servidor en `ajuste_monto`, y el desglose por
  -- ítem tiene que seguir cuadrando (migración 5) — así que un importe nuevo
  -- obliga a decir a qué ítem le corresponde.
  if old.tipo_doc = 'Compromiso' and new.tipo_doc = 'Factura' then
    if new.serie like 'CRED-%' or new.serie like 'PEND-%' then
      raise exception 'Digita la serie real de la factura que entregó el proveedor.';
    end if;
    if new.proveedor_ruc is distinct from old.proveedor_ruc
       or new.proyecto is distinct from old.proyecto
       or new.registrado_por is distinct from old.registrado_por then
      raise exception 'Al convertir el compromiso se digita la serie real y, si la factura llegó por otro importe, el monto. El proveedor y la obra no cambian: si esos están mal, gerencia anula y se registra de nuevo.';
    end if;
    return new;
  end if;

  -- PENDIENTE -> FACTURA: la compra YA está pagada; solo llega el papel.
  -- Aquí no se toca ni un dato del pago.
  if old.tipo_doc = 'Pendiente' and new.tipo_doc = 'Factura' then
    if new.serie like 'CRED-%' or new.serie like 'PEND-%' then
      raise exception 'Digita la serie real de la factura que entregó el proveedor.';
    end if;
    if new.monto is distinct from old.monto
       or new.proveedor_ruc is distinct from old.proveedor_ruc
       or new.proyecto is distinct from old.proyecto
       or new.forma_pago is distinct from old.forma_pago
       or new.estado_pago is distinct from old.estado_pago
       or new.medio_pago is distinct from old.medio_pago
       or new.banco is distinct from old.banco
       or new.numero_operacion is distinct from old.numero_operacion
       or new.fecha_pago is distinct from old.fecha_pago
       or new.pagado_por is distinct from old.pagado_por
       or new.rendicion_id is distinct from old.rendicion_id then
      raise exception 'Esta compra ya está pagada: al llegar la factura solo se digita su serie.';
    end if;
    return new;
  end if;

  if new.tipo_doc is distinct from old.tipo_doc then
    raise exception 'Una factura no cambia de tipo de documento.';
  end if;

  -- Datos comerciales congelados
  if new.serie is distinct from old.serie
     or new.proveedor_ruc is distinct from old.proveedor_ruc
     or new.fecha is distinct from old.fecha
     or new.monto is distinct from old.monto
     or new.forma_pago is distinct from old.forma_pago
     or new.proyecto is distinct from old.proyecto
     or new.registrado_por is distinct from old.registrado_por then
    raise exception 'Los datos comerciales de la factura no se editan. Si está mal, gerencia la anula y se registra de nuevo.';
  end if;

  -- Para pagar un compromiso hay que tener la serie real
  if new.estado_pago = 'Pagada' and new.tipo_doc = 'Compromiso' then
    raise exception 'Para pagar, registra primero la serie de la factura real.';
  end if;

  -- Factura pagada: congelada salvo conciliación
  if old.estado_pago = 'Pagada' then
    if new.estado_pago is distinct from old.estado_pago
       or new.medio_pago is distinct from old.medio_pago
       or new.banco is distinct from old.banco
       or new.numero_operacion is distinct from old.numero_operacion
       or new.fecha_pago is distinct from old.fecha_pago
       or new.pagado_por is distinct from old.pagado_por
       or new.rendicion_id is distinct from old.rendicion_id then
      raise exception 'La factura ya está pagada; solo se puede conciliar.';
    end if;
  end if;

  if new.conciliada is distinct from old.conciliada and public.mi_rol() <> 'gerente' then
    raise exception 'La conciliación bancaria es exclusiva de gerencia.';
  end if;

  return new;
end;
$$;

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) La columna y el trigger nuevo existen:
--
--   select column_name from information_schema.columns
--    where table_name = 'facturas' and column_name = 'ajuste_monto';
--
--   select tgname from pg_trigger
--    where tgrelid = 'public.facturas'::regclass and not tgisinternal
--    order by tgname;
--
-- 2) Los ajustes que se vayan haciendo, para vigilarlos:
--
--   select serie, proveedor_ruc, monto,
--          ajuste_monto->>'comprometido' as se_comprometio,
--          ajuste_monto->>'diferencia'   as diferencia,
--          ajuste_monto->>'por'          as lo_ajusto,
--          ajuste_monto->>'fecha'        as cuando
--     from public.facturas
--    where ajuste_monto is not null
--    order by (ajuste_monto->>'fecha') desc;
