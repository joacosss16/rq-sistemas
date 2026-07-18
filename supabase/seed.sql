-- ============================================================
-- Sistema RQ — Seed inicial
-- Ejecutar DESPUÉS de las dos migraciones.
-- ============================================================

-- Proyectos (obras activas)
insert into public.proyectos (codigo, nombre) values
  ('2501', 'EMPERATRIZ'),
  ('2502', 'DANAUS'),
  ('2503', 'MAIA'),
  ('2504', 'LUZ'),
  ('2601', 'TORRE COPACABANA')
on conflict (codigo) do nothing;

-- ============================================================
-- USUARIOS — se cargan en dos pasos:
-- 1) Crear cada usuario en Supabase Dashboard → Authentication →
--    Users → "Add user" (correo @grupocopacabana.com.pe + contraseña).
-- 2) Copiar el UUID que genera Auth y ejecutar el insert del perfil.
--    Plantilla (reemplazar los UUID):
-- ============================================================
-- insert into public.usuarios (id, nombre, rol, proyecto_asignado) values
--   ('<uuid-auth>', 'Gerencia',           'gerente',   null),
--   ('<uuid-auth>', 'Lucía Arana',        'compras',   null),
--   ('<uuid-auth>', 'Andrés Chino',       'residente', '2502'),
--   ('<uuid-auth>', 'Edwin Salas',        'residente', '2503'),
--   ('<uuid-auth>', 'Anton Taucca',       'almacen',   '2503'),
--   ('<uuid-auth>', 'Brayan Huamán',      'almacen',   '2504');

-- ============================================================
-- CATÁLOGO (1,740 materiales) y PROVEEDORES (255) — pendiente:
-- se generan desde datos/NUEVO_RQ.xlsx (hoja "Materiales 3.0") y
-- datos/CONTROL_RQ_LUZ.xlsx cuando los archivos estén en datos/.
-- Formato destino:
--   insert into public.materiales (codigo, descripcion, und, familia) values (...);
--   insert into public.proveedores (ruc, razon_social) values (...);
-- ============================================================
