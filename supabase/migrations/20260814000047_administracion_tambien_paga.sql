-- ============================================================
-- MIGRACIÓN 47 · MÓNICA TIENE UNA SOLA CUENTA
--
-- DECISIÓN DEL DUEÑO (14 ago 2026): Mónica no va a tener dos
-- cuentas. Una sola, que cierra la caja y además ejecuta los pagos.
--
-- Es razonable: en una empresa de este tamaño no hay dos personas de
-- administración, y fingir que las hay solo produce cuentas
-- compartidas — que es peor, porque entonces la firma no vale nada.
--
-- LO QUE SE PIERDE, y conviene tenerlo escrito: la misma persona
-- cuenta el efectivo que devuelve el comprador, aprueba la rendición,
-- decide cuánto se le entrega y libera el pago de las facturas. Es el
-- circuito del dinero completo en una mano. No es una acusación a
-- nadie: es que el sistema deja de poder demostrar lo contrario si
-- algún día hace falta.
--
-- EL CONTROL QUE LO COMPENSA: como no se puede separar, se hace
-- VISIBLE. La app avisa a gerencia cuando la misma persona registró
-- las entregas de un día y además cerró el arqueo de esa jornada. No
-- bloquea nada; solo pone el dato delante de quien debe mirarlo. Es
-- lo que corresponde cuando una organización es demasiado pequeña
-- para repartir funciones.
--
-- El rol `pagos` se queda en el sistema sin usar. El día que haya una
-- persona de tesorería, se separan sin tocar una línea de código.
--
-- Se corre en el editor SQL de Supabase. Se puede repetir sin daño.
-- ============================================================

begin;

-- Pagar facturas: antes solo `pagos`.
drop policy if exists facturas_update_pagos on public.facturas;
create policy facturas_update_pagos on public.facturas
  for update to authenticated
  using      (coalesce(public.mi_rol(), '') in ('pagos', 'administracion'))
  with check (coalesce(public.mi_rol(), '') in ('pagos', 'administracion'));

-- Registrar y anular entregas de efectivo: antes solo `pagos` y gerencia.
drop policy if exists entregas_caja_insert on public.entregas_caja;
create policy entregas_caja_insert on public.entregas_caja
  for insert to authenticated
  with check (coalesce(public.mi_rol(), '') in ('pagos', 'administracion', 'gerente'));

drop policy if exists entregas_caja_update on public.entregas_caja;
create policy entregas_caja_update on public.entregas_caja
  for update to authenticated
  using      (coalesce(public.mi_rol(), '') in ('pagos', 'administracion', 'gerente'))
  with check (coalesce(public.mi_rol(), '') in ('pagos', 'administracion', 'gerente'));

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- CÓMO COMPROBAR
--  · Con la cuenta de Mónica (rol administracion): debe aparecer la
--    pestaña Pagos, poder registrar entregas de efectivo y poder
--    pagar una factura pendiente.
--  · Y debe seguir pudiendo cerrar la rendición del día con arqueo.
--  · En Auditoría, gerencia debe ver la alerta cuando la misma
--    persona registró las entregas de un día y cerró su arqueo.
-- ============================================================
