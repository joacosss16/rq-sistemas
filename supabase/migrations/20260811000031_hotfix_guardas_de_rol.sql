-- ============================================================
-- MIGRACIÓN 31 · PARCHE DE SEGURIDAD — CORRER CUANTO ANTES
--
-- PROBLEMA: las guardas de rol están escritas así:
--     if public.mi_rol() <> 'gerente' then raise exception ...
--
-- `mi_rol()` devuelve NULL cuando no hay sesión, cuando el usuario
-- no tiene ficha en `usuarios`, o cuando está desactivado.
-- Y en SQL, NULL <> 'gerente' NO es verdadero: es NULL. PL/pgSQL
-- trata un `if NULL` como falso, así que LA EXCEPCIÓN NUNCA SE
-- LANZA y la ejecución sigue de largo. La guarda falla ABIERTA:
-- protege a los usuarios legítimos y deja pasar a los que no tienen
-- ninguna credencial.
--
-- El caso más grave es `anular_factura`: además es SECURITY DEFINER
-- (ignora RLS) y nunca se le revocó el permiso a `anon`, cuya clave
-- es pública y viaja en el navegador. Es decir: hoy cualquiera puede
-- anular facturas y borrar sus líneas sin iniciar sesión.
--
-- SOLUCIÓN: comparar contra un valor que nunca es NULL, con
-- `coalesce(public.mi_rol(), '')`, y revocar a `anon` el permiso de
-- ejecutar las funciones que escriben.
--
-- Este parche NO cambia ninguna regla de negocio: las mismas personas
-- siguen pudiendo hacer exactamente lo mismo. Solo deja de dejar pasar
-- a quien no debía.
-- ============================================================

begin;

-- ── 1) anular_factura: el agujero explotable sin credenciales
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
  -- coalesce: sin sesión, sin ficha o desactivado -> '' -> se rechaza
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

-- ── 2) aprobar_material: mismo patrón
-- OJO: los nombres de los parámetros deben ser IDÉNTICOS a los de la
-- migración 9; Postgres no permite renombrarlos con create or replace.
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
  if coalesce(public.mi_rol(), '') <> 'compras' then
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

-- ── 3) Las guardas dentro de los triggers (conciliación y anulación)
--     Mismo fallo: sin sesión válida, dejaban pasar.
create or replace function public.trg_anulacion_solo_gerencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.decision = 'Anulado' and coalesce(old.decision, '') <> 'Anulado'
     and coalesce(public.mi_rol(), '') <> 'gerente' then
    raise exception 'La anulación la confirma gerencia: registra la solicitud con motivo y espera el visto bueno.';
  end if;
  return new;
end;
$$;

-- ── 4) Quitarle a `anon` el permiso de ejecutar lo que escribe.
--     La clave anon es pública: viaja en el navegador de cualquiera.
revoke execute on function public.anular_factura(uuid, text) from anon, public;
grant  execute on function public.anular_factura(uuid, text) to authenticated;

revoke execute on function public.registrar_factura(
  text, text, text, date, numeric, text, text, boolean, boolean, boolean, text, text, text, jsonb) from anon, public;
grant  execute on function public.registrar_factura(
  text, text, text, date, numeric, text, text, boolean, boolean, boolean, text, text, text, jsonb) to authenticated;

revoke execute on function public.aprobar_material(uuid, text, text, text, text, boolean) from anon, public;
grant  execute on function public.aprobar_material(uuid, text, text, text, text, boolean) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- CÓMO COMPROBAR QUE QUEDÓ CERRADO (correr después, aparte):
--
-- 1) La guarda ya no deja pasar sin sesión. Debe dar ERROR:
--      begin;
--        set local role anon;
--        select public.anular_factura(
--          (select id from public.facturas limit 1), 'prueba de seguridad');
--      rollback;
--    ESPERADO: "permission denied for function anular_factura".
--    Si en vez de eso anula la factura, el parche NO se aplicó.
--
-- 2) Gerencia sigue pudiendo anular (que el arreglo no rompa el trabajo):
--    probarlo desde la app con la sesión de gerencia sobre una factura
--    de prueba; debe funcionar igual que antes.
-- ============================================================
