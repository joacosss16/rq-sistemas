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
  public.salidas,
  public.prestamos,
  public.stock_inicial,
  public.solicitudes_material,
  public.rq_items,
  public.rqs
restart identity cascade;

-- Las alertas levantadas se borran APARTE, conservando los duplicados
-- descartados del catálogo (claves 'dup:...'). Esos no son movimiento de
-- prueba: son curaduría del catálogo REAL hecha por Lucía — cada par que
-- revisó y marcó "no son duplicados". Borrarlos le haría repetir todo el
-- trabajo, y el catálogo sobrevive al reset igual que ellos.
delete from public.alertas_levantadas where clave not like 'dup:%';

--    ⚠ OJO CON ESTO AHORA QUE EL CATÁLOGO SE REEMPLAZA ENTERO (paso 2).
--    Esas claves `dup:` son pares de códigos que Lucía revisó y marcó "no son
--    duplicados". Se guardaron mirando el catálogo VIEJO. Si el archivo nuevo
--    reutiliza los mismos códigos para los mismos materiales, la curaduría
--    sigue valiendo y conservarla ahorra todo ese trabajo. Si los códigos
--    cambiaron, una clave vieja **silencia una alerta que hoy sí importa** — y
--    la alerta más peligrosa es la que nadie llega a ver.
--    Si hay duda, borrarlas también y que Lucía las repase sobre el catálogo
--    nuevo:  delete from public.alertas_levantadas;

-- 2) TODO el catálogo de materiales.
--    Antes se borraba solo lo creado más de una hora después de la carga
--    original ("todo lo posterior es de prueba"). Esa regla tenía una víctima
--    silenciosa: **cualquier material legítimo que Lucía diera de alta después
--    también se iba**, y con él su unidad, su familia y su equivalencia de
--    caja. Nadie se enteraba hasta echarlo en falta.
--
--    **Decisión del dueño (30 ago 2026): se carga el catálogo NUEVO completo
--    después del reset.** Con eso, conservar el viejo a medias no sirve de
--    nada: se borra entero y entra una sola carga limpia.
--
--    Es seguro en este punto y no antes: las cinco tablas que apuntan a un
--    código de material —rq_items, salidas, prestamos, stock_inicial y
--    solicitudes_material— acaban de vaciarse en el truncate de arriba. Si se
--    corriera esta línea suelta, la clave ajena lo impediría.
--
--    NO se tocan las `familias` (58): son la estructura del código de 6
--    dígitos, no el catálogo. Si el archivo nuevo trae familias distintas,
--    hay que cargarlas ANTES que los materiales, porque cada material apunta
--    a la suya.
delete from public.materiales;

-- 3) TODOS los proveedores.
--    Antes solo se borraba el del harness de pruebas (RUC 20138651917) y los
--    demás sobrevivían, porque la idea era cargar los 255 reales ANTES del
--    reset. **Decisión del dueño (30 ago 2026): primero el reset, y recién
--    entonces se carga todo.** Con ese orden, dejar proveedores vivos solo
--    sirve para arrastrar basura.
--
--    Y había basura de verdad: al facturar, los proveedores nuevos SE DAN DE
--    ALTA SOLOS (migración 13). Cada prueba de Lucía o de Frank dejó uno. No
--    hay forma de distinguirlos de los buenos por fecha ni por nombre, porque
--    nacen igual. Borrarlos todos y cargar los 255 de una vez es la única
--    manera de que el maestro empiece limpio.
--
--    Ojo al orden: esto va DESPUÉS del truncate de facturas, o la clave ajena
--    lo impide.
delete from public.proveedores;

-- 4) BANCOS DE PRUEBA. Los cinco de la migración 10 son INVENTADOS
--    (191-1111111-0-11, 0011-0222-0200333, 200-3000444555…) y hasta hoy
--    sobrevivían al borrado, así que Pagos los mostraba como buenos.
--
--    Y es peor que un dato feo: la guarda de la migración 70 exige que
--    el pago use el banco de la obra, o sea que estaba OBLIGANDO a pagar
--    contra una cuenta que no existe. Ese banco queda además CONGELADO
--    dentro de cada factura al pagarla, y es justo lo que Auditoría
--    cruza después contra el extracto del banco.
--
--    Se borran por su número exacto, no la tabla entera: si las cuentas
--    reales ya estuvieran cargadas, este script no las toca. Mismo
--    criterio que el proveedor de prueba de arriba.
--
--    AL QUEDAR LA OBRA SIN CUENTA, EL SISTEMA EXIGE LA REAL POR SÍ SOLO:
--    Pagos no deja registrar el pago ("esta obra no tiene cuenta
--    configurada · no se puede pagar") hasta que se cargue. Es el fallo
--    ruidoso que se quiere: mejor no poder pagar que pagar contra una
--    ficción. Y para comprobarlo antes de que se entere el usuario, el
--    guardián está en `supabase/verificar_datos_reales.sql`, que hay
--    que correr DESPUÉS de cargar las cuentas del paso (a).
delete from public.proyectos_banco
 where nro_cuenta in ('191-1111111-0-11', '0011-0222-0200333',
                      '200-3000444555', '000-5566777', '191-8888888-0-88');

-- ============================================================
-- PASOS MANUALES QUE ESTE SCRIPT NO HACE (datos de prueba que se
-- REEMPLAZAN por reales, no se borran):
-- a) BANCOS REALES por obra. OJO: desde la migración 32 los datos
--    bancarios YA NO viven en `proyectos` sino en `proyectos_banco`
--    (tabla cerrada a gerencia y pagos). Escribir en la tabla vieja
--    NO tiene ningún efecto: la obra se queda sin cuenta y Pagos no
--    la deja pagar. Usar SIEMPRE esta forma:
--    insert into public.proyectos_banco (codigo, banco, nro_cuenta)
--    values ('2503', '<banco real>', '<cuenta real>')
--    on conflict (codigo) do update
--       set banco = excluded.banco, nro_cuenta = excluded.nro_cuenta;
--    (una línea por obra: 2501, 2502, 2503, 2504, 2601)
--    El paso 4 del borrado ya se llevó las cinco cuentas de prueba,
--    así que cada obra queda SIN cuenta hasta que se cargue la real.
--    Comprobarlo corriendo aparte: supabase/verificar_datos_reales.sql
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

-- Verificación tras ejecutar. TODO en 0 menos las familias: desde el 30 de
-- agosto el catálogo, los proveedores y los bancos también se borran, porque
-- se cargan enteros y nuevos justo después. Si algo no da 0, quedó una tabla
-- fuera del borrado: buscarla antes de cargar un solo dato real.
--
--   select 'rqs' t, count(*) from public.rqs
--   union all select 'rq_items',             count(*) from public.rq_items
--   union all select 'facturas',             count(*) from public.facturas
--   union all select 'factura_items',        count(*) from public.factura_items
--   union all select 'salidas',              count(*) from public.salidas
--   union all select 'prestamos',            count(*) from public.prestamos
--   union all select 'rendiciones',          count(*) from public.rendiciones
--   union all select 'entregas_caja',        count(*) from public.entregas_caja
--   union all select 'alertas (solo dup:)',   count(*) from public.alertas_levantadas where clave not like 'dup:%'
--   union all select 'solicitudes_material', count(*) from public.solicitudes_material
--   union all select 'stock_inicial',        count(*) from public.stock_inicial
--   union all select 'materiales (=0)',      count(*) from public.materiales
--   union all select 'proveedores (=0)',     count(*) from public.proveedores
--   union all select 'familias (=58)',      count(*) from public.familias
--   union all select 'bancos de prueba (=0)', count(*) from public.proyectos_banco where nro_cuenta in ('191-1111111-0-11','0011-0222-0200333','200-3000444555','000-5566777','191-8888888-0-88')
--   order by 1;
