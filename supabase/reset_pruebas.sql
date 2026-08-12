-- ============================================================
-- BORRAR TODOS LOS DATOS DE PRUEBA (ejecutar en el SQL Editor)
-- Deja el sistema listo para cargar datos reales y arrancar el
-- piloto. Ejecutar SOLO cuando el dueño lo pida explícitamente.
-- ============================================================

-- 1) TODO el movimiento transaccional (RQs, facturas, salidas,
--    préstamos, rendiciones, solicitudes, stock inicial)
truncate table
  public.factura_items,
  public.facturas,
  public.rendiciones,
  public.salidas,
  public.prestamos,
  public.stock_inicial,
  public.solicitudes_material,
  public.rq_items,
  public.rqs
restart identity cascade;

-- 2) Materiales creados DURANTE las pruebas (aprobaciones de ensayo).
--    El catálogo seed se cargó en un solo lote: todo lo posterior a
--    esa primera hora es de prueba.
delete from public.materiales
 where creado_en > (select min(creado_en) + interval '1 hour' from public.materiales);

-- 3) Proveedor insertado por el harness de pruebas
--    (SANICENTER volverá con el seed real de los 255 proveedores)
delete from public.proveedores where ruc = '20138651917';

-- ============================================================
-- PASOS MANUALES QUE ESTE SCRIPT NO HACE (datos de prueba que se
-- REEMPLAZAN por reales, no se borran):
-- a) BANCOS REALES por obra. OJO: desde la migración 32 los datos
--    bancarios YA NO viven en `proyectos` sino en `proyectos_banco`
--    (tabla cerrada a gerencia y pagos). Escribir en la tabla vieja
--    NO tiene ningún efecto: Pagos seguiría usando los datos falsos
--    de prueba y los grabaría dentro de cada factura al pagarla,
--    donde quedan congelados. Usar SIEMPRE esta forma:
--    insert into public.proyectos_banco (codigo, banco, nro_cuenta)
--    values ('2503', '<banco real>', '<cuenta real>')
--    on conflict (codigo) do update
--       set banco = excluded.banco, nro_cuenta = excluded.nro_cuenta;
--    (una línea por obra: 2501, 2502, 2503, 2504, 2601)
--    Comprobar después que no quede ninguna cuenta de prueba:
--    select * from public.proyectos_banco order by codigo;
-- b) cajas_chicas.monto_fondo      -> poner los fondos REALES por obra:
--    update public.cajas_chicas set monto_fondo=<real> where proyecto='2503'; (etc.)
-- c) Cuentas *@rq-test.com (contraseña compartida de prueba):
--    reemplazar por correos corporativos reales en Authentication y
--    actualizar/insertar los perfiles en public.usuarios; desactivar
--    las de prueba: update public.usuarios set activo=false where id='<uuid>';
-- d) Familias 62/73/91 tienen nombres PROPUESTOS: confirmarlos con
--    Lucía o renombrar: update public.familias set nombre='<real>' where iu='62';
-- e) La clasificación de 205 perecederos fue automática: Lucía la
--    revisa/ajusta desde la vista Catálogo (checkbox por material).
-- ============================================================

-- Verificación tras ejecutar:
-- select count(*) from rqs;                -- 0
-- select count(*) from facturas;          -- 0
-- select count(*) from rendiciones;       -- 0
-- select count(*) from materiales;        -- 1740 (solo el catálogo seed)
-- select count(*) from proveedores;       -- 0 (hasta cargar los 255 reales)
