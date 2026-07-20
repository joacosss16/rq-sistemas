-- ============================================================
-- Migración 9: aprobación de material nuevo en UNA transacción
-- Antes: la app insertaba el material y luego actualizaba la
-- solicitud (2 pasos). Si el segundo fallaba, quedaba un material
-- creado con la solicitud aún Pendiente (pasó en pruebas).
-- Requiere migración 8 (solicitudes_material.perecedero).
-- ============================================================

create or replace function public.aprobar_material(
  p_solicitud   uuid,
  p_codigo      text,
  p_descripcion text,
  p_und         text,
  p_familia_iu  text,
  p_perecedero  boolean
) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if public.mi_rol() <> 'compras' then
    raise exception 'Solo Compras aprueba y codifica materiales';
  end if;

  insert into materiales (codigo, descripcion, und, perecedero)
  values (p_codigo, p_descripcion, p_und, coalesce(p_perecedero, false));

  update solicitudes_material
     set estado = 'Aprobado', codigo_asignado = p_codigo,
         descripcion = p_descripcion, und = p_und,
         familia_iu = p_familia_iu, perecedero = coalesce(p_perecedero, false)
   where id = p_solicitud and estado = 'Pendiente';

  if not found then
    raise exception 'La solicitud ya no está pendiente (¿otro usuario la resolvió?)';
  end if;
end;
$$;

revoke execute on function public.aprobar_material(uuid, text, text, text, text, boolean) from anon;
grant execute on function public.aprobar_material(uuid, text, text, text, text, boolean) to authenticated;
