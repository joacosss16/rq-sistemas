-- ============================================================
-- MIGRACIÓN 43 · NOTA DE CRÉDITO, Y NO ANULAR LO YA PAGADO
--
-- 1) NO SE ANULA UNA FACTURA YA PAGADA
-- `anular_factura` bloquea las conciliadas contra el banco y las de
-- efectivo con la rendición cerrada, pero deja pasar las PAGADAS sin
-- conciliar. Anularlas borra el pago del sistema aunque el dinero ya
-- salió del banco: no queda saldo a favor, no queda nada, solo un
-- descuadre que aparece semanas después sin que nadie sepa de dónde
-- salió.
--
-- Anular sirve para una factura MAL REGISTRADA, antes de que el
-- dinero se mueva. Una vez que salió, ya no es un error de registro:
-- es una devolución, y eso se documenta, no se borra.
--
-- 2) LA NOTA DE CRÉDITO COMO MEDIO DE PAGO
-- El proveedor emite una nota de crédito que cancela la factura (por
-- devolución, por error suyo, por descuento posterior). La factura
-- queda saldada SIN que salga dinero del banco.
--
-- Hoy no hay forma de registrarlo: marcar una factura como pagada
-- exige banco y N° de operación, y una nota de crédito no tiene
-- ninguno de los dos — tiene su propia serie. Registrarla como
-- transferencia sería inventar un movimiento bancario que no existe,
-- y la conciliación de contabilidad no cuadraría nunca.
--
-- Se agrega el medio 'Nota de crédito', que en vez de banco pide la
-- SERIE de la nota (va en el mismo campo del N° de documento) y no
-- necesita banco. En la app queda fuera del CSV de conciliación
-- bancaria, porque ahí solo debe aparecer lo que movió plata.
--
-- LÍMITE CONOCIDO: esto sirve cuando la nota cubre la factura
-- ENTERA. Si la cubre en parte, eso es un pago parcial, y el sistema
-- todavía no lo modela (el estado de pago es todo o nada).
--
-- Se corre en el editor SQL de Supabase. Se puede repetir sin daño.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) El medio nuevo
-- ------------------------------------------------------------
alter table public.facturas drop constraint if exists facturas_medio_pago_check;
alter table public.facturas add constraint facturas_medio_pago_check
  check (medio_pago in ('Transferencia', 'Cheque', 'Tarjeta', 'Efectivo', 'Nota de crédito'));

-- Pagada exige medio + fecha + quién. El banco solo cuando de verdad
-- hubo un movimiento bancario: en efectivo no hay, y con nota de
-- crédito tampoco — pero la nota SÍ tiene número, y es obligatorio:
-- es el documento con el que contabilidad justifica que la deuda se
-- cerró sin plata de por medio.
alter table public.facturas drop constraint if exists chk_pago_completo;
alter table public.facturas add constraint chk_pago_completo
  check (
    estado_pago <> 'Pagada'
    or (
      medio_pago is not null and fecha_pago is not null and pagado_por is not null
      and (
        medio_pago = 'Efectivo'
        or (medio_pago = 'Nota de crédito' and numero_operacion is not null)
        or (banco is not null and numero_operacion is not null)
      )
    )
  );

-- ------------------------------------------------------------
-- 2) No anular una factura ya pagada
-- ------------------------------------------------------------
create or replace function public.anular_factura(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f record;
  v_nombre text;
begin
  if coalesce(public.mi_rol(), '') <> 'gerente' then
    raise exception 'La anulación de una factura la confirma gerencia.';
  end if;
  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'La anulación exige un motivo.';
  end if;

  select * into f from public.facturas where id = p_id;
  if not found then raise exception 'Factura no encontrada.'; end if;
  if f.anulacion is not null then raise exception 'Esa factura ya está anulada.'; end if;

  -- NUEVO: el dinero ya salió. Anular aquí lo borraría del sistema
  -- dejando el banco descuadrado y sin rastro de por qué.
  if f.estado_pago = 'Pagada' then
    raise exception 'Esa factura ya está pagada: el dinero salió del banco. Anularla lo borraría del sistema sin dejar rastro. Si el proveedor devuelve o descuenta, se registra con una nota de crédito.';
  end if;

  if f.conciliada then
    raise exception 'Esa factura ya fue conciliada contra el banco. Corrige con una nota de crédito, no anulando.';
  end if;

  if f.rendicion_id is not null then
    if exists (select 1 from public.rendiciones r
               where r.id = f.rendicion_id and r.estado <> 'Abierta') then
      raise exception 'La rendición de esa compra en efectivo ya fue cerrada. Coordina con administración.';
    end if;
  end if;

  select nombre into v_nombre from public.usuarios where id = auth.uid();

  delete from public.factura_items where factura_id = p_id;

  update public.facturas
     set anulacion = jsonb_build_object(
           'motivo', trim(p_motivo),
           'por', coalesce(v_nombre, 'gerencia'),
           'fecha', current_date::text)
   where id = p_id;
end;
$$;

revoke execute on function public.anular_factura(uuid, text) from anon, public;
grant  execute on function public.anular_factura(uuid, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- CÓMO COMPROBAR
--
-- 1. Anular una factura SIN pagar: sigue funcionando, los ítems
--    quedan libres.
-- 2. Anular una factura YA PAGADA: debe rechazarla explicando que se
--    corrige con una nota de crédito.
-- 3. Pagar una factura eligiendo el medio "Nota de crédito": pide la
--    serie de la nota y NO pide banco. La factura queda Pagada.
-- 4. Descargar el CSV de conciliación de Auditoría: esa factura NO
--    debe aparecer, porque no movió dinero del banco.
-- ============================================================
