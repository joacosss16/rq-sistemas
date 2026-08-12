-- ============================================================
-- VERIFICADOR DE POLÍTICAS RLS — Sistema RQ
--
-- El otro verificador (verificar_esquema.sql) comprueba columnas,
-- funciones y triggers. NO comprobaba las políticas RLS, que son
-- las que deciden quién puede hacer qué. Daba 47/47 en verde con
-- una política rota.
--
-- Hace falta porque varias migraciones hacen `drop policy X` y
-- luego `create policy X` sin red: si la ejecución se corta en
-- medio, la tabla queda SIN política. Y una tabla con RLS activo
-- y sin política deniega TODO en silencio — el usuario solo ve
-- "new row violates row-level security policy".
--
-- Son dos consultas cortas. Córrelas por separado.
-- No modifican nada.
-- ============================================================


-- ── CONSULTA 1 ──────────────────────────────────────────────
-- Tablas con RLS activo que se quedaron sin alguna política.
-- Todo debe salir OK. Un FALTA = esa operación está bloqueada
-- para TODO el mundo, incluida gerencia.

with esperado (tabla, cmd) as (values
  ('rqs','SELECT'), ('rqs','INSERT'), ('rqs','UPDATE'),
  ('rq_items','SELECT'), ('rq_items','INSERT'), ('rq_items','UPDATE'),
  ('facturas','SELECT'), ('facturas','INSERT'), ('facturas','UPDATE'),
  ('factura_items','SELECT'), ('factura_items','INSERT'),
  ('salidas','SELECT'), ('salidas','INSERT'), ('salidas','UPDATE'),
  ('prestamos','SELECT'), ('prestamos','INSERT'), ('prestamos','UPDATE'),
  ('solicitudes_material','SELECT'), ('solicitudes_material','INSERT'),
  ('materiales','SELECT'),
  ('proveedores','SELECT'),
  ('proyectos','SELECT'),
  ('usuarios','SELECT'),
  ('rendiciones','SELECT'), ('rendiciones','INSERT'), ('rendiciones','UPDATE'),
  ('cajas_chicas','SELECT'),
  ('stock_inicial','SELECT')
)
select e.tabla, e.cmd,
       case when exists (
         select 1 from pg_policies p
          where p.schemaname = 'public'
            and p.tablename  = e.tabla
            and p.cmd in (e.cmd, 'ALL')
       ) then 'OK' else '❌ FALTA' end as estado
  from esperado e
 order by (case when exists (
         select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = e.tabla
            and p.cmd in (e.cmd, 'ALL')) then 1 else 0 end), e.tabla, e.cmd;


-- ── CONSULTA 2 ──────────────────────────────────────────────
-- Red de seguridad: cualquier tabla con RLS encendido y CERO
-- políticas. Eso deniega absolutamente todo.
-- Lo correcto es que NO devuelva ninguna fila.

select c.relname as tabla_bloqueada_por_completo
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relrowsecurity
   and not exists (
     select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = c.relname
   )
 order by 1;
