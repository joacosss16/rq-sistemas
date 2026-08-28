-- ============================================================
-- MIGRACIÓN 70 · La firma del pago también al crear, el banco de
--                cada obra, y una entrega no se duplica
-- ============================================================
--
-- Cierra cinco agujeros del ataque al módulo de Pagos (28 ago 2026). Como los
-- de la migración 69, todos son de la misma familia: reglas que la pantalla
-- respeta y la base no comprobaba.
--
-- ── 1) LA FIRMA DEL PAGO SE SALTABA POR EL CAMINO DE CREAR ────
--
-- La migración 55 dice, con todas sus letras, que "un mensaje directo a la
-- base podía firmar un pago con el nombre de otra persona", y lo cerró... solo
-- para el UPDATE. En el INSERT su único cuidado es `registrado_por`.
--
-- Así que se podía CREAR de cero una factura ya nacida 'Pagada', con
-- `pagado_por` apuntando a otra persona, su fecha de pago inventada, banco y
-- número de operación a gusto. Una factura pagada que nunca pasó por el módulo
-- de Pagos, atribuida a alguien que no la pagó.
--
-- ── 2) EL RASTRO DEL AJUSTE, IGUAL ───────────────────────────
--
-- `ajuste_monto` (migración 65) lo blinda un trigger que también es solo de
-- UPDATE, así que al crear se podía inventar: un rastro que dice que alguien
-- ajustó un importe que nunca ajustó. Un rastro forjable es peor que no tener
-- rastro, porque se le cree.
--
-- ── 3) EL BANCO DE CADA OBRA ─────────────────────────────────
--
-- Cada obra tiene su cuenta (`proyectos_banco`) y la pantalla nunca deja
-- elegir: lo deriva de la obra de la factura. Pero `facturas.banco` es texto
-- libre y nada lo comparaba, así que por la base se podía pagar una obra con
-- la cuenta de otra —o con el banco en blanco—. Y ese dato queda congelado
-- dentro de la factura al pagarla: es lo que Auditoría cruza después contra el
-- extracto.
--
-- ── 4) NO SE REABRE UN ARQUEO YA APROBADO ────────────────────
--
-- La migración 67 hizo que el arqueo lo calcule la base. Faltaba lo otro: que
-- una jornada aprobada no se pueda volver a abrir. Reabriéndola, el candado
-- que impide tocar las entregas de un día cerrado deja de proteger, y el
-- efectivo de ese día se vuelve editable otra vez.
--
-- ── 5) UNA ENTREGA NO SE REGISTRA DOS VECES ──────────────────
--
-- Con la red lenta de una obra: clic, no pasa nada visible, segundo clic. Dos
-- entregas idénticas de S/ 600. La jornada cree que Frank recibió S/ 1,200 y
-- al cerrar le sale un faltante de S/ 600 que **se lo come él**. Ninguna
-- pantalla y ninguna tabla lo impedían.

-- ------------------------------------------------------------
-- 1 y 2) LA FIRMA Y EL RASTRO, TAMBIÉN AL CREAR
-- ------------------------------------------------------------
-- Se reescribe `trg_firma_del_pago` entera (migración 55) con la rama del
-- INSERT completa. Todo lo del UPDATE queda palabra por palabra.
create or replace function public.trg_firma_del_pago()
returns trigger
language plpgsql
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- Sin sesión (editor SQL, semillas, mantenimiento) no se toca nada:
  -- registrado_por es obligatorio y forzarlo reventaría esos usos.
  if v_uid is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Quien registra la factura es quien la crea.
    new.registrado_por := coalesce(new.registrado_por, v_uid);

    -- Si nace PAGADA —el caso legítimo de una compra en efectivo o de una
    -- factura por llegar— la firma es de quien la está creando, y punto. No
    -- se acepta un `pagado_por` que venga de fuera: esa era la puerta.
    if new.estado_pago = 'Pagada' then
      new.pagado_por := v_uid;
      new.fecha_pago := coalesce(new.fecha_pago, current_date);
    else
      -- Y si no nace pagada, no puede traer datos de pago puestos.
      new.pagado_por := null;
      new.fecha_pago := null;
    end if;

    -- Una factura no NACE con rastro de ajuste ni de conciliación: los dos
    -- son actos posteriores, y si se pudieran inventar al crear no serían
    -- rastro sino adorno.
    new.ajuste_monto       := null;
    new.conciliada         := coalesce(new.conciliada, false);
    if new.conciliada then
      raise exception 'Una factura no nace conciliada: conciliar es un acto posterior de gerencia.';
    end if;
    new.conciliada_por     := null;
    new.fecha_conciliacion := null;

    return new;
  end if;

  -- El que paga es quien tiene la sesión abierta. Solo se estampa en la
  -- TRANSICIÓN a Pagada: si se estampara en cualquier cambio, se rompería
  -- "administración digita la serie real", porque el guardián de facturas
  -- exige que pagado_por y fecha_pago no cambien en ese paso.
  if new.estado_pago = 'Pagada' and old.estado_pago is distinct from 'Pagada' then
    new.pagado_por := v_uid;
    new.fecha_pago := coalesce(new.fecha_pago, current_date);
  end if;

  -- Conciliar es exclusivo de gerencia (lo exige facturas_bu). Aquí solo
  -- se deriva la firma del booleano, para que no se pueda inventar.
  if new.conciliada is distinct from old.conciliada then
    if new.conciliada then
      new.conciliada_por      := v_uid;
      new.fecha_conciliacion  := current_date;
    else
      new.conciliada_por      := null;
      new.fecha_conciliacion  := null;
    end if;
  end if;

  -- Quien registra la factura es quien la crea. En los UPDATE se
  -- conserva el original: reescribirlo dispararía "los datos comerciales
  -- de la factura no se editan" en CADA pago.
  new.registrado_por := old.registrado_por;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3) EL BANCO TIENE QUE SER EL DE LA OBRA
-- ------------------------------------------------------------
-- Solo se comprueba cuando la obra TIENE cuenta cargada. Si no la tiene, no se
-- bloquea el pago: se avisa en la pantalla. Bloquear aquí dejaría a una obra
-- nueva sin poder pagar hasta que alguien recuerde cargarle el banco, y ese
-- alguien no está a mano un viernes por la tarde.
create or replace function public.trg_banco_de_la_obra()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_banco text;
begin
  if auth.uid() is null then return new; end if;
  -- Solo interesa cuando se está pagando por banco.
  if new.estado_pago is distinct from 'Pagada' then return new; end if;
  if coalesce(new.medio_pago, '') = 'Efectivo' then return new; end if;
  if new.banco is not distinct from old.banco
     and new.estado_pago is not distinct from old.estado_pago then
    return new;                       -- no se está tocando el pago
  end if;

  select banco into v_banco from public.proyectos_banco where codigo = new.proyecto;
  if v_banco is null or trim(v_banco) = '' then
    return new;                       -- esa obra aún no tiene cuenta cargada
  end if;

  if coalesce(trim(new.banco), '') = '' then
    raise exception 'Falta el banco del pago. Esta obra paga por %.', v_banco;
  end if;
  if trim(new.banco) <> trim(v_banco) then
    raise exception 'Esta obra paga por % y el pago dice %. Cada obra tiene su cuenta: si de verdad se pagó desde otra, hay que corregir la cuenta de la obra antes.',
      v_banco, new.banco;
  end if;

  return new;
end;
$$;

-- SOLO EN UPDATE, y es deliberado. El pago de verdad lo hace Pagos con el
-- banco DERIVADO de la obra, y ese es el camino que hay que blindar. En el
-- INSERT quedaría atrapado Frank, que hoy escribe el banco A MANO al registrar
-- una factura suya (consecuencia conocida de la migración 32: él ya no ve qué
-- banco usa cada obra). Bloquearlo aquí lo dejaría sin poder registrar sus
-- compras el día uno. Su campo tiene que convertirse en una lista fija de
-- bancos —está apuntado— y entonces esta guarda se extiende al INSERT.
drop trigger if exists zz_banco_de_la_obra on public.facturas;
create trigger zz_banco_de_la_obra
  before update on public.facturas
  for each row execute function public.trg_banco_de_la_obra();

-- ------------------------------------------------------------
-- 4) UNA JORNADA APROBADA NO SE REABRE
-- ------------------------------------------------------------
-- Se amplía el guardián de la migración 67. Reabrir un arqueo aprobado
-- desbloquea las entregas de ese día —el candado mira si la jornada está
-- cerrada— y deja el efectivo ya contado otra vez editable.
--
-- Sí se conserva el camino legítimo: gerencia resuelve una jornada 'Con
-- diferencia' (`dif_resolucion`), y administración observa o corrige una que
-- todavía no está aprobada.
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

  -- NUEVO: una jornada aprobada está cerrada. El efectivo se contó, se firmó,
  -- y las entregas de ese día quedaron cuadradas.
  if old.estado = 'Aprobada' and new.estado is distinct from old.estado then
    raise exception 'Esa jornada ya está aprobada y cerrada: no se reabre. Si apareció algo después, se registra en la jornada de hoy y se explica.';
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

-- ------------------------------------------------------------
-- 5) UNA ENTREGA NO SE REGISTRA DOS VECES
-- ------------------------------------------------------------
-- Dos entregas iguales el mismo día a la misma obra, por el mismo medio y
-- monto, son casi con seguridad un doble clic. Y el que paga el error es
-- Frank, con un faltante que no puede explicar.
--
-- Se bloquea en la base y no solo en la pantalla porque el doble clic ocurre
-- justamente cuando la pantalla no responde.
--
-- OJO: sí puede haber DOS entregas legítimas del mismo monto el mismo día —se
-- le entrega dinero varias veces por jornada—, pero entonces tendrán distinto
-- número de operación. Por eso la comprobación incluye ese número, y solo
-- salta cuando TODO coincide.
create or replace function public.trg_entrega_no_duplicada()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (
    select 1 from public.entregas_caja e
     where e.proyecto = new.proyecto
       and e.fecha    = new.fecha
       and e.monto    = new.monto
       and coalesce(e.medio, '') = coalesce(new.medio, '')
       and coalesce(e.num_operacion, '') = coalesce(new.num_operacion, '')
       and e.anulacion is null
       and e.id is distinct from new.id
  ) then
    raise exception 'Ya hay una entrega igual hoy en esta obra (S/ %, mismo medio y N° de operación). Si es una segunda entrega de verdad, tiene que llevar su propio N° de operación.',
      to_char(new.monto, 'FM999999990.00');
  end if;
  return new;
end;
$$;

drop trigger if exists aa_entrega_no_duplicada on public.entregas_caja;
create trigger aa_entrega_no_duplicada
  before insert on public.entregas_caja
  for each row execute function public.trg_entrega_no_duplicada();

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) ¿Hay entregas duplicadas de antes de esta regla? Si sale alguna, hay que
--    mirarla con Pagos: puede ser un doble clic que Frank ya pagó de su
--    bolsillo.
--
--   select proyecto, fecha, monto, medio, num_operacion, count(*)
--     from public.entregas_caja where anulacion is null
--    group by 1,2,3,4,5 having count(*) > 1;
--
-- 2) ¿Alguna factura pagada tiene un banco que no es el de su obra? (de antes
--    de la regla; debe dar 0 filas)
--
--   select f.serie, f.proyecto, f.banco, b.banco as banco_de_la_obra
--     from public.facturas f
--     join public.proyectos_banco b on b.codigo = f.proyecto
--    where f.estado_pago = 'Pagada' and coalesce(f.medio_pago,'') <> 'Efectivo'
--      and f.anulacion is null
--      and coalesce(trim(f.banco),'') is distinct from coalesce(trim(b.banco),'');
--
-- 3) Los triggers existen:
--
--   select tgname from pg_trigger
--    where tgrelid in ('public.facturas'::regclass, 'public.entregas_caja'::regclass,
--                      'public.rendiciones'::regclass)
--      and not tgisinternal
--    order by tgrelid::text, tgname;
