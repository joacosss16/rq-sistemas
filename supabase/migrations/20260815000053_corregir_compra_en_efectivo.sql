-- ============================================================
-- Migración 53 · Una compra en efectivo mal digitada se puede corregir
--                mientras la jornada siga abierta
--
-- EL PROBLEMA
-- Frank compra fierro por S/ 169 y teclea S/ 1,690. La factura en efectivo
-- nace "Pagada" por diseño. Gerencia intenta anularla y siempre recibe el
-- mismo mensaje: "ya está pagada, el dinero salió del banco". Pero no salió
-- del banco: salió de la caja chica, y la jornada todavía está abierta.
--
-- La migración 43 puso el control de "ya pagada" ANTES del control de
-- "¿la rendición sigue abierta?". Al ser el primero el que corta, el
-- segundo nunca llega a ejecutarse para una compra en efectivo: el camino
-- que sí debía dejar corregir quedó tapado.
--
-- Consecuencia real: no hay ninguna vía de corrección. El monto no se puede
-- editar, y la nota de crédito no aplica a algo pagado de la propia caja.
-- La rendición del día queda con S/ 1,690 de gasto contra S/ 600 de entregas,
-- el arqueo sube con un faltante falso de S/ 1,521, y AL DÍA SIGUIENTE la
-- caja de esa obra queda bloqueada, porque el sistema no deja registrar
-- compras en efectivo si quedó una rendición sin resolver. La única salida
-- era que administración aprobara a mano una rendición que sabe falsa.
--
-- EL ARREGLO
-- Se invierte el orden: primero se mira si el pago fue de caja chica.
--   · Si fue de caja chica  → se puede anular mientras la jornada esté
--     abierta; si ya se cerró, se rechaza como antes.
--   · Si fue por banco      → se rechaza como antes: ahí el dinero sí salió
--     de una cuenta y se corrige con nota de crédito.
--
-- QUÉ CONSERVA (repasado línea por línea contra la migración 43, vigente):
--   · Solo gerencia anula.                                        [igual]
--   · El motivo es obligatorio y no puede ser espacios en blanco.  [igual]
--   · No se anula dos veces la misma factura.                      [igual]
--   · No se anula una factura ya conciliada contra el banco.       [igual]
--   · No se anula una compra en efectivo de una jornada cerrada.   [igual]
--   · No se anula una factura pagada por banco.        [igual, ahora en su
--                                                       rama, no antes de todo]
--   · Firma la anulación con el nombre del servidor, no del navegador. [igual]
--   · Borra las líneas de la factura para liberar los ítems.        [igual]
-- Lo ÚNICO que cambia es el orden de dos controles.
-- ============================================================

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

  if f.conciliada then
    raise exception 'Esa factura ya fue conciliada contra el banco. Corrige con una nota de crédito, no anulando.';
  end if;

  if f.rendicion_id is not null then
    -- Pago de CAJA CHICA. El dinero no salió de una cuenta bancaria: salió
    -- del efectivo del día, que todavía se está rindiendo. Mientras la
    -- jornada esté abierta esto se corrige aquí, que es el único sitio donde
    -- se puede corregir.
    if exists (select 1 from public.rendiciones r
               where r.id = f.rendicion_id and r.estado <> 'Abierta') then
      raise exception 'La rendición de esa compra en efectivo ya fue cerrada. Coordina con administración.';
    end if;

  elsif f.estado_pago = 'Pagada' then
    -- Pago por BANCO. Aquí sí: el dinero salió de una cuenta y anularlo lo
    -- borraría del sistema dejando el banco descuadrado y sin rastro.
    raise exception 'Esa factura ya está pagada: el dinero salió del banco. Anularla lo borraría del sistema sin dejar rastro. Si el proveedor devuelve o descuenta, se registra con una nota de crédito.';
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

notify pgrst, 'reload schema';

-- ============================================================
-- CÓMO COMPROBAR
--
-- 1. Frank registra hoy una factura en efectivo con un monto equivocado.
--    Gerencia la anula con motivo: DEBE dejarla anular, y el gasto tiene
--    que desaparecer del cuadre de caja del día.
-- 2. Administración cierra la rendición del día. Gerencia intenta anular
--    otra factura en efectivo de ESE día: debe rechazarla diciendo que
--    coordine con administración.
-- 3. Pagos paga una factura por transferencia. Gerencia intenta anularla:
--    debe rechazarla y mandar a la nota de crédito. (Sin cambios.)
-- 4. Una factura sin pagar: se anula como siempre y sus ítems vuelven a
--    la cola de compras.
-- ============================================================
