# ESTADO DEL PROYECTO
**Actualizado: 30 ago 2026.** Aquí vive todo lo que cambia cada semana: lo
abierto, el plan, el backlog. Salió de CLAUDE.md el 30 ago para que el contexto
maestro no envejezca con él.

> **Si esto tiene más de siete días, no te fíes: compruébalo contra el código
> y la base antes de actuar.** Este archivo se actualiza al cerrar cada día de
> trabajo (regla de la casa). La comprobación que no depende de notas es
> `supabase/verificar_datos_reales.sql`: pregunta a la base, no a la memoria.

## Dónde está el sistema (30 ago 2026)

- **App multi-usuario en producción**: Vercel (https://rq-sistemas.vercel.app),
  repo GitHub `joacosss16/rq-sistemas`, base Supabase (Postgres + RLS + Auth).
- **77 migraciones corridas** (la 33 no existe: se descartó antes de correrse).
  La 77 (quién contó el efectivo) se corrió el 30 ago.
- **La rama `arqueo-y-reset` tiene 5 commits SIN mergear a main**: el código
  de la 77 (la alerta del arqueo y las dos firmas en pantalla), el reset que
  ahora borra catálogo/proveedores/bancos, el guardián
  `verificar_datos_reales.sql`, la reorganización de CLAUDE.md y los hooks.
  Mergear cuando el dueño lo decida — un push a main publica en Vercel.
  Mientras tanto la base va por delante del código en modo seguro: la firma
  nueva del arqueo se guarda, solo que la pantalla aún no la muestra.
- **Tres hooks instalados** (30 ago, en `.claude/hooks/`, versionados): al
  escribir una migración se avisa qué migraciones anteriores definen la misma
  función y cuál es la versión viva, y se exige el bloque de comprobación;
  editar `Residente.jsx` salta como pregunta de permiso al dueño; y todo
  `git commit` corre antes las pruebas y la compilación.
- **Alcance acotado hasta terminar el piloto: no se agregan funciones nuevas**,
  solo se arregla y endurece lo que existe. Todo lo demás —flete, cajas,
  órdenes de servicio, Almacén Central— está diseñado y apuntado, sin construir.
- Catálogo completo cargado: 58 familias + 1,740 materiales desde
  `datos/codificacion_de_almacen.xlsx` (hoja "Materiales 3.0").
- **El catálogo, los proveedores y las cuentas se van a recargar**: decisión
  del dueño (30 ago), primero el reset y RECIÉN entonces se carga todo — el
  catálogo nuevo de materiales, los 255 proveedores (CONTROL_RQ_LUZ.xlsx,
  **aún no está en `datos/`**), las cuentas bancarias reales y el stock inicial.

**Estado de los módulos** (método de cierre uno por uno), al 30 ago:
- **Compras — CERRADO.** Atacado por código (28 hallazgos) y probado a mano por
  el dueño en tres rondas.
- **Residente — arreglado**, a falta de dos comprobaciones que necesitan datos:
  el número de "Aprobaciones" con firmas pendientes y el aviso de ítems
  anulados. Se cubren al probar Almacén.
- **Gerencia — rediseñada y verificada**, PERO su informe mensual tiene dos
  números falsos (ver abajo): esa palabra quedó grande.
- **Almacén y Pagos — atacados y arreglados por código, SIN probar en
  pantalla.** Es lo siguiente. Ahí hay 22 guardas nuevas que nadie ha visto
  dispararse: el mensaje de error de la base tiene que llegar a la cara del
  usuario, y el precedente son los tres botones "muertos" de Compras.

## LO QUE SIGUE ABIERTO (30 ago 2026)

Fallos conocidos y sin arreglar, por lo que cuesta que salgan mal:

- **El RQ fantasma sigue vivo por el PEDIDO POR COTIZACIÓN.** La migración 76
  cerró el camino normal, pero `crearPedidoCotizacion` (`src/App.jsx`) no la
  usa: da de alta los materiales UNO A UNO, luego la cabecera, luego las
  líneas — tres escrituras sueltas sin transacción. Si falla la última quedan
  **materiales permanentes en el catálogo de Lucía y un RQ numerado y vacío**.
  Peor que el original, porque un código de material no se recicla nunca.
  Además el generador de códigos 97xxxx toma el máximo y suma uno **sin tope**:
  si la familia se llenara, desbordaría a la 98 en silencio.
- **El número de RQ es un contador global, no por obra.** Si MAIA crea el RQ-1,
  el siguiente de DANAUS es el RQ-2; "RQ-14" por WhatsApp no dice de qué obra
  es, y cada residente ve su lista saltar. **Decisión del dueño (30 ago): se
  cambia a numeración por obra.** Falta decidir el formato del número (¿con el
  código de obra delante?). Toca `crear_rq`, el PDF y 20+ sitios que lo pintan.
- **El informe mensual de gerencia trae dos números falsos** (señalados el 16
  ago en `docs/08`, vivos el 30). En `ReporteMensual.jsx`: "Facturas pagadas" y
  "Monto pagado" siguen contando las anuladas (falta el filtro que sí tienen
  las dos líneas de justo debajo), y la columna "Teórico" del faltante de caja
  se calcula con `monto_fondo`, el fondo fijo que dejó de existir el 12 de
  agosto. No sale "0": sale un número creíble e inventado, en la misma fila que
  la diferencia real.
- **Nadie puede responder "¿quién aprobó esta compra?"**: el dato se guarda
  desde el 12 ago y viaja hasta la pantalla (`decididoPor`), pero ninguna vista
  lo muestra ni está en el CSV.
- **La salida de material vencido solo se bloquea en pantalla.** La cabecera de
  la migración 7 promete "vencido bloquea la salida" y esa regla nunca se
  escribió: vive solo en `Almacen.jsx`.
- **La caducidad no viaja con un préstamo**: material por vencer llega al
  destino figurando como bueno.
- **El almacenero ve "S/ 0.00 valorizado"** porque su rol no puede leer
  `factura_items` (RLS de la migración 13; el residente tampoco). **Decisión
  del dueño (30 ago): el almacenero NO necesita el valorizado** — se quita el
  número en vez de abrir el acceso al dinero a dos roles más. Pendiente.
- **"Entrega a tiempo %" y "Holgura promedio" mejoran cuanto peor va**: se
  calculan solo sobre lo ya entregado, así que un material que nunca llega no
  empeora ninguna. Son los indicadores con los que se iba a medir el sistema.
- **Frank escribe el banco a mano** al facturar (consecuencia de la migración
  32: ya no ve qué banco usa cada obra). Dispara alertas falsas en Auditoría, y
  hasta que ese campo sea una lista fija, la guarda de la migración 70 no se
  puede extender al alta de facturas.
- **El sistema no guarda la cuenta bancaria de los proveedores**: al transferir
  hay que buscarla fuera. Es por donde se cuela el fraude de suplantación —el
  correo que dice "cambiamos de cuenta"— porque no hay contra qué compararla.
  Para la semana 2 del piloto, junto con la carga de los 255 proveedores.
- **La pantalla de Mónica habla de "reposición del fondo"** en cuatro sitios de
  `Rendiciones.jsx`; ese modelo murió el 12 ago. Instrucciones caducas para
  quien cierra el efectivo cada día.
- **Corregir una recepción** escribe directo a la tabla leyendo el historial de
  la memoria del navegador: dos correcciones simultáneas se pisan (la misma
  carrera que la migración 71 cerró para recepciones). Probabilidad baja.

**Decisiones del dueño, pendientes:**
- "Transferir al costo" cierra con **una sola firma** cuando la entrada exigió
  dos. (Hoy irrelevante: transferir está deshabilitado, migración 74.)
- La **fecha de pago** ya tiene tope en pantalla (`max={HOY_ISO}`) pero **no en
  la base**: por fuera admite 2030, y 1990 pasa por los dos lados.
- El cuadre de factura multi-ítem: la pantalla exige 10 céntimos, la base
  acepta 50. En la franja caen los redondeos de IGV y Lucía no tiene salida
  legítima (ver `docs/08`, decisión 1).
- ¿La curaduría de duplicados de Lucía sobrevive al reset? Depende de si el
  catálogo nuevo conserva los códigos (ver `reset_pruebas.sql`).
- Los enchapes: ¿familia 24 (CERÁMICA) o familia libre? Hoy caen en la 97
  (ACTIVOS FIJOS), que es el sitio equivocado.

**Lo que la prueba a mano confirmó y el código no veía:** que una factura
anulada libera su número, que los RQ íntegramente rechazados eran inalcanzables
(botón para archivar, ninguno para abrir), y que la partida no se validaba
contra la obra — hoy hay un aviso ⚠ en pantalla, pero **no bloquea**, y el
servidor solo exige que no esté vacía.

## EL PLAN DE LANZAMIENTO (acordado con el dueño el 28 ago, ajustado el 30)

En este orden, y **cada paso termina antes de empezar el siguiente**:

1. **Cerrar los módulos uno por uno.** Verificación en pantalla (el dueño con
   Claude in Chrome) → arreglar → **congelar** → siguiente. Faltan Almacén y
   Pagos.
2. **Una pasada global** al final: ataque al código y prueba a mano.
3. **Borrar los datos de prueba** (`supabase/reset_pruebas.sql`).
4. **Probar cada caso y cada ramificación** sobre el sistema limpio.
5. **Reset otra vez**, para borrar lo que generó esa prueba.
6. **AHORA sí, cargar los datos reales** — decisión del dueño (30 ago):
   primero el reset, y RECIÉN entonces se carga todo. El reset borra ahora el
   catálogo entero, todos los proveedores y las cinco cuentas de prueba (antes
   sobrevivían y arrastraban basura). Orden de carga: familias (si cambiaron) →
   materiales → proveedores (255) → cuentas bancarias → usuarios → stock
   inicial el último, el día del arranque.
7. **Correr `supabase/verificar_datos_reales.sql`** y que pase en silencio.
   Falla listando lo que falte. Sustituye a "creo que ya está todo".
8. `VITE_ENTORNO = produccion` en Vercel + Redeploy. **Lo último que se toca.**
9. **Anunciar y lanzar.**

**CONSECUENCIA A TENER PRESENTE:** mientras no esté el inventario, el stock
arranca en CERO y los almaceneros no pueden registrar salidas — el sistema dirá
que no hay stock, y tendrá razón. O se carga el mismo día del arranque antes de
que entre nadie, o pensarán que el sistema está roto.

**LO QUE FALTA ANTES DEL ARRANQUE, aparte del plan:**
- **El almacenero de DANAUS** — sin él, media parte del piloto no recibe ni
  saca material. (El guardián del paso 7 lo lista por su nombre.)
- Supabase **Pro** con recuperación a punto en el tiempo. Sin él no hay copias
  de seguridad, y reconstruir desde las 76 migraciones nunca se probó.
- Los **bancos reales** en `proyectos_banco` (2502 y 2503 para el piloto).
- Cuentas de correo reales por persona.
- Los **manuales por rol**. Incluir: que un préstamo consumido queda abierto a
  propósito (migración 74), o el primer almacenero que lo vea lo reportará
  como avería.

## Backlog acordado (18 jul 2026) — orden aprobado por el dueño

1. ✅ Desglose de precios por ítem + unidades base/factor caja (migración 5)
2. ✅ Módulo de Pagos: estado de pago a nivel factura (migración 6)
3. ✅ Consolidado por comprar + caducidad de perecederos (migración 7)
4. Historial/comparativa de precios por material y proveedor con CSV
5. Post-piloto: bitácora de cambios, auditoría cíclica ciega de almacén,
   liquidación de transferencia intercompany
6. Post-piloto — **Almacén Central (Huancaro)**, diseño acordado (20 jul):
   - Fase A (operativa, sin precios): obra especial `0000`; almacenero
     **Fernando** (rol almacen, proyecto 0000); inventario por cantidades.
     Alerta "CENTRAL tiene N" en el consolidado de Lucía con botón **Aceptar
     del central** (solo compras decide; atención parcial). Frank ve "Comprar:
     M · Recoger en CENTRAL: N". Fernando ve cola "Por despachar" y registra
     la salida; el almacén de obra recibe (doble punta). Requiere columna
     `rq_items.cant_central`.
   - Fase B (contable, con Yheyson): valorización de saldos, guía de remisión
     PDF con firmas, liquidación intercompany entre **Gold y Majser**.

Nuevos RQs (misma tanda): piso/nivel obligatorio (lista cerrada), fecha
necesitada única por RQ, PDF solo cuando todos los ítems están decididos.

**Casos especiales por fase.** Fase 2 tras piloto: rechazo en recepción por
material dañado, notas de crédito y devoluciones al proveedor, etapa
"Cotizado", merma en granel con tolerancia % por tipo. Arquitectura:
concurrencia de dos compradores sobre el mismo ítem, facturación intercompany
para "Transferir al costo" (asiento para Yheyson), días hábiles vs calendario
en el canal.

### SUNAT / SIRE: el Registro de Compras (idea del dueño, 14 ago 2026)

El sistema ya guarda casi todo lo que exige el Registro de Compras: serie, RUC
y razón social, fecha de emisión, monto, forma de pago, medio, N° de operación
y obra. **Faltaría**: el desglose de IGV (base imponible / IGV / total), el
tipo de comprobante (factura, boleta, nota de crédito), la fecha de vencimiento
y la **detracción** cuando aplique. Con eso, Yheyson exportaría el registro en
vez de re-digitarlo desde los PDFs.

**No tocar hasta terminar el piloto** (decisión del dueño). Va junto con los
cinco casos de compra pendientes —detracción, pago parcial, un pago para
varias facturas, anticipo y canje por letra— y la nota de crédito / saldo a
favor: son el mismo bloque contable. Ver `docs/09` y `docs/10`.

### Pendientes de Lucía (pedidos el 18 jul 2026, siguen abiertos)

Equivalencias caja→unidades de los ~29 materiales "CAJA" (y PQT/ROLLO/PAR), su
hoja de control de almacenes (inventarios iniciales por obra, ideal con
precios), confirmar nombres de las familias 62/73/91, y CONTROL_RQ_LUZ.xlsx
(255 proveedores). Todo esto entra ahora por la carga del paso 6 del plan.
