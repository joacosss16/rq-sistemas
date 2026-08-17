-- ============================================================
-- BORRAR TODOS LOS DATOS DE PRUEBA (ejecutar en el SQL Editor)
-- Deja el sistema listo para cargar datos reales y arrancar el
-- piloto. Ejecutar SOLO cuando el dueño lo pida explícitamente.
-- ============================================================

-- 1) TODO el movimiento transaccional (RQs, facturas, salidas,
--    préstamos, rendiciones, entregas de caja, solicitudes, stock inicial)
--
--    OJO AL AGREGAR TABLAS NUEVAS: este script se escribió cuando había
--    nueve tablas de movimiento y se quedó atrás. `entregas_caja`
--    (migración 38) y `alertas_levantadas` (39) nacieron después y
--    sobrevivían al borrado. Las dos hacen daño distinto:
--
--    · Una ENTREGA de prueba que sobreviva deja una jornada de caja con
--      dinero entregado y sin gastos: el cuadre dice que el comprador
--      debe ese dinero, días después y sin que nadie lo relacione.
--    · Una ALERTA levantada de prueba lleva la MISMA clave que una
--      situación real equivalente, así que gerencia recibiría una alerta
--      real ya marcada como vista. La alerta más peligrosa es la que
--      nadie llega a ver.
--
--    Regla: toda tabla de movimiento nueva se agrega AQUÍ el mismo día
--    que se crea.
truncate table
  public.factura_items,
  public.facturas,
  public.rendiciones,
  public.entregas_caja,
  public.alertas_levantadas,
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
-- b) cajas_chicas.tolerancia -> confirmar la tolerancia REAL del arqueo
--    por obra: update public.cajas_chicas set tolerancia=<real> where proyecto='2503';
--    (monto_fondo quedó OBSOLETA con la migración 38: la caja chica ya no
--     es un fondo fijo, son entregas variables por día. No hace falta
--     tocarla, pero tampoco fiarse de lo que diga.)
-- c) Cuentas *@rq-test.com (contraseña compartida de prueba):
--    reemplazar por correos corporativos reales en Authentication y
--    actualizar/insertar los perfiles en public.usuarios; desactivar
--    las de prueba: update public.usuarios set activo=false where id='<uuid>';
-- d) Familias 62/73/91 tienen nombres PROPUESTOS: confirmarlos con
--    Lucía o renombrar: update public.familias set nombre='<real>' where iu='62';
-- e) La clasificación de 205 perecederos fue automática: Lucía la
--    revisa/ajusta desde la vista Catálogo (checkbox por material).
-- ============================================================

-- Verificación tras ejecutar. Todo lo de movimiento en 0, y el catálogo
-- intacto. Si alguna de las de arriba no da 0, quedó una tabla fuera del
-- borrado: buscarla antes de cargar un solo dato real.
--
--   select 'rqs' t, count(*) from public.rqs
--   union all select 'rq_items',             count(*) from public.rq_items
--   union all select 'facturas',             count(*) from public.facturas
--   union all select 'factura_items',        count(*) from public.factura_items
--   union all select 'salidas',              count(*) from public.salidas
--   union all select 'prestamos',            count(*) from public.prestamos
--   union all select 'rendiciones',          count(*) from public.rendiciones
--   union all select 'entregas_caja',        count(*) from public.entregas_caja
--   union all select 'alertas_levantadas',   count(*) from public.alertas_levantadas
--   union all select 'solicitudes_material', count(*) from public.solicitudes_material
--   union all select 'stock_inicial',        count(*) from public.stock_inicial
--   union all select 'materiales (=1740)',   count(*) from public.materiales
--   union all select 'proveedores (=0)',     count(*) from public.proveedores
--   order by 1;
