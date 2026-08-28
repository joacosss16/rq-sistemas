# Sistema RQ — Grupo Copacabana

Contexto maestro del proyecto. Leer completo antes de tocar código.

## Qué es
Sistema digital de requerimientos de materiales (RQ) para Grupo Copacabana: grupo de construcción e inmobiliaria de Cusco, Perú. 4 razones sociales, ~65 trabajadores, 5 proyectos activos:

| Código | Proyecto | Residente | Almacenero |
|---|---|---|---|
| 2501 | EMPERATRIZ | — | — |
| 2502 | DANAUS | Andrés Chino (benchmark interno) | — |
| 2503 | MAIA | Edwin Salas | Anton Taucca |
| 2504 | LUZ | — | Brayan Huamán |
| 2601 | TORRE COPACABANA | — | — |

**Toda obra tiene SIEMPRE un residente y un almacenero** (regla del negocio, confirmada por el dueño el 12 ago 2026). Las guardas de aprobación se apoyan en eso: quien aprueba una salida o su lado de un préstamo es el residente de esa obra. Una obra sin residente dado de alta deja sus salidas y préstamos sin poder aprobarse — hay que crear los usuarios que faltan antes de arrancar.

**EL PILOTO ARRANCA CON DOS OBRAS: MAIA + DANAUS** (decisión del dueño, 27 ago 2026). Eso reduce lo que hay que preparar a dos bancos (2502, 2503), dos cajas chicas y las cuentas de esas dos obras. **BLOQUEANTE ABIERTO: DANAUS no tiene almacenero dado de alta** — comprobado en el sistema el 27 ago. Sin él, esa obra no puede registrar recepciones ni salidas, y es la mitad del piloto.

Personas clave: Lucía Arana (logística/compras centralizada, dueña del catálogo), Mónica Del Castillo (administración), Yheyson Ccoiccosi (contabilidad), Rodrigo Curo (BIM).

## Problema que resuelve
Antes: RQs como PDFs sueltos por WhatsApp, sin trazabilidad, catálogo desactualizado en decenas de copias de Excel, compras identificado como el principal dolor al escalar de 2 a 5 obras. Regla de adopción acordada: **"RQ que no entra por el sistema, no se compra".**

## Estado actual
- **App multi-usuario en producción**: Vite + React + Tailwind + Supabase (`src/App.jsx`), desplegada en Vercel (https://rq-sistemas.vercel.app) desde el repo GitHub `joacosss16/rq-sistemas`. Login con Supabase Auth, datos compartidos vía Postgres + RLS. Migraciones en `supabase/migrations/`.
- `prototipo/sistema_rq.html`: prototipo standalone original (localStorage, mono-usuario). Se conserva como referencia; probado con 140+ corridas automatizadas (jsdom).
- **Código separado en módulos** (ago 2026): `src/App.jsx` pasó de 5,651 a ~1,030 líneas (era la app entera; hoy es la capa de datos, la cabecera y el montaje de vistas). Las 16 vistas viven en `src/vistas/` y la lógica compartida en ocho módulos propios (ver Estructura del repo). Ni una regla de negocio cambió en la mudanza.
- Alcance acotado hasta terminar el piloto: **no se agregan funciones nuevas**,
  solo se arregla y se endurece lo que existe. Lo que ha entrado desde agosto
  no son funciones sino cierres de agujeros (ver las migraciones 49–74) y
  ayudas para ver mejor lo que ya había: contadores de vigilancia, avisos en
  las pestañas, la detección de duplicados del catálogo. Todo lo demás
  —flete, cajas, órdenes de servicio, Almacén Central— está **diseñado y
  apuntado, sin construir**.
- Diferencias deliberadas con el prototipo: solo los residentes crean RQs (RLS); **Compras y el comprador (Frank) registran facturas** — Frank las suyas en efectivo, contra su rendición; solo Compras aprueba materiales nuevos; "Reiniciar datos" se hace con `supabase/reset_pruebas.sql`; **gerencia mira, no registra**.
- **MÉTODO DE TRABAJO (27 ago 2026): se cierra módulo por módulo.** Se ataca (código + el dueño probándolo a mano con Claude in Chrome), se arregla, se CONGELA, y se pasa al siguiente. Una mejora de un módulo ya congelado —o de uno que aún no toca— se **apunta y se pospone**. Orden seguido: Residente → Gerencia → Compras → Almacén → Pagos.
- **No tocar la vista del residente sin avisar al dueño antes** (regla suya del 27 ago), aunque esté descongelada.
- Catálogo completo cargado: tabla `familias` (58, IU de 2 dígitos) + 1,740 materiales desde `datos/codificacion_de_almacen.xlsx` (hoja "Materiales 3.0"); la familia de un material se deriva de los 2 primeros dígitos del código. Compras puede editar solicitudes de material nuevo (descripción, unidad, familia) antes de aprobar; código correlativo por familia.
- Pendiente: seed de proveedores (255) desde CONTROL_RQ_LUZ.xlsx — **el archivo aún no está en `datos/`**.

## Cómo se corre y cómo se despliega

```bash
npm install          # una vez
npm run dev          # desarrollo, en localhost:5173
npm run build        # compila a dist/
npm run preview      # sirve lo compilado en localhost:4173 (para probar de verdad)
npm test             # 61 pruebas de la lógica pura (caja, fechas, stock, pago, búsqueda)
```

**Las migraciones NO se corren solas.** Hay que abrir el archivo
`supabase/migrations/<la que toque>.sql`, copiar **todo** su contenido y
pegarlo en el **editor SQL de Supabase**. Están escritas para poder repetirse
sin daño, y cada una lleva al pie las consultas de comprobación de antes y
después. Correrlas **en orden**.

**El despliegue es automático**: un `push` a `main` publica en Vercel
(https://rq-sistemas.vercel.app). Por eso el trabajo a medias se queda en la
rama, y a producción solo va lo probado.

**Ojo con la base**: hay UNA sola. Lo que se corre en Supabase afecta tanto a
`localhost` como a producción — el código puede estar sin desplegar, la base
nunca. Al correr una migración, las reglas nuevas rigen para todos de
inmediato.

**Variables de entorno** (`.env.local`, ver `src/supabaseClient.js`):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_ENTORNO`. Esa última
decide el banner: mientras no diga `produccion`, la aplicación muestra arriba
la franja **"ENTORNO DE PRUEBAS · ESTOS NO SON LOS DATOS REALES"**. Al
arrancar el piloto con datos reales hay que cambiarla, o el equipo trabajará
creyendo que está practicando.

## Modelo de negocio del sistema

### Catálogo
1,740 materiales (145 en el prototipo como muestra) y **58 familias** en la
tabla `familias`. Código de 6 dígitos: IU(2) + GRUPO(2) + correlativo(2). Solo
el dueño del catálogo (Arana) aprueba materiales nuevos; los residentes los
solicitan desde su vista. Código sugerido automático por familia; validación de
6 dígitos únicos. **Un código nunca se recicla**: el correlativo mira todos los
asignados alguna vez, incluidos los de materiales desactivados. La fuente es
`datos/codificacion_de_almacen.xlsx`, hoja "Materiales 3.0" (es el único
archivo que hay en `datos/`; `NUEVO_RQ.xlsx` y `CONTROL_RQ_LUZ.xlsx` se
mencionan en varios sitios pero **todavía no están copiados**).

### Canales de RQ (automático por fecha necesitada mínima vs hoy)
- **URGENTE**: < 2 días → justificación obligatoria ("¿por qué no se previó?")
- **GENERAL**: ≤ 7 días
- **ANTICIPADO**: > 7 días (compras planificadas con anticipación / importación, 1-4 semanas; antes "ESPECIAL LIMA", migración 21)

### Flujo por ítem
1. Residente crea RQ (proyecto fijo por login, partida auto-prefijada con código de obra, fecha necesitada ≥ hoy obligatoria, destino detallado obligatorio, color opcional con nota "dejar vacío si no aplica"). Al enviar se genera PDF formal (réplica de la HOJA RQ con membrete y bloque de 4 firmas: Residente → V°B° Gerente de Operaciones → Recepción en obra → Entregado por). El PDF también se puede regenerar desde "Mis requerimientos" y desde Compras (clic en RQ-xxx).
2. Compras decide: **Aprobar / Rechazar (motivo obligatorio, se comunica al residente, cierra el ítem)**. La decisión es PASO PREVIO separado del estado logístico.
3. Aprobado → estado logístico: — / Comprado / Entregado / Incompleto. "Comprado" lo marca Compras o el comprador (Frank) al comprar o recoger el ítem, con botón por ítem (migración 15, reemplaza al antiguo "En camino"); visible para todo el equipo. Entregado/Incompleto los fija el almacén al recibir. Pago: — / Pagado / Crédito / Falta.
4. **Facturación y pago separados** (desde jul 2026): Compras registra la factura completa — serie, proveedor (maestro con RUC; los nuevos se agregan solos), RUC 11 dígitos, fecha, monto total, forma de pago, y **desglose de precio unitario por ítem** (la suma debe cuadrar con el total; trigger lo valida, tolerancia S/ 0.50). **Una factura puede cubrir varios ítems** del mismo proyecto. Duplicados serie+RUC bloqueados. **Compromiso de crédito** (migración 14): si el proveedor da crédito y emite la factura recién al pagar, Compras marca "SIN factura aún" — serie interna CRED-#### automática, forma fija Crédito, nunca efectivo; la deuda es visible en Pagos/KPIs desde el día 1, y Pagos NO puede marcar Pagada sin digitar la serie real (el compromiso se convierte en factura; trigger lo exige). El **pago lo ejecuta el rol `pagos`** en su propia vista: banco + N° de operación + fecha, filtrable por proyecto (cada obra su cuenta). El estado de pago vive en la FACTURA; los ítems lo heredan: sin factura "—", factura pendiente a crédito "Crédito", pendiente contado "Falta", pagada "Pagado". Factura pagada queda congelada (trigger).
5. Almacén recibe: solo cantidad + observaciones. Parcial → Incompleto automático (visible en Compras y Almacén); al llegar el saldo se registra otra recepción → Entregado. **Sobre-recepción bloqueada** (no se puede recibir más de lo pedido; si el proveedor entregó de más, se corrige con Compras).
6. Ítem Entregado + Pagado → se CIERRA (sale de la vista de Compras, queda solo en Tablero).
7. Salidas de almacén: exigen N° de hoja de trabajo + zona de trabajo; no exceden stock. **Aprobación del residente** (migración 18): la salida nace "Pendiente" y NO descuenta stock (solo lo reserva) hasta que el residente de la obra la aprueba o rechaza con motivo; el almacenero ve el botón pasar a verde "Salida aprobada". Recién aprobada admite verificación de uso: Correcto / Incorrecto (motivos: No se completó el trabajo / Se encontró botado / Uso inadecuado / Otro con texto obligatorio). Reingreso a stock desde una salida de uso incorrecto (migración 17). Anular restaura stock completo.
8. Préstamos entre almacenes: material + cantidad + destino (sin campo "autoriza": lo reemplaza la aprobación). **Doble aprobación** (migración 18): nace "Solicitado", aprueban AMBOS residentes (origen y destino); con los dos OK pasa a "Prestado" y mueve stock; un rechazo lo deja "Rechazado" y nunca toca stock. Ya activo: Prestado → Devuelto (BLOQUEADO si el destino ya consumió → "Transferir al costo") / Transferido al costo / Anulado.

### Anulaciones (nunca edición silenciosa)
Ítems de RQ (desde Compras), salidas y préstamos se anulan con motivo obligatorio + usuario + fecha. La salida anulada restaura stock. El préstamo solo se anula si el destino no consumió. Todo queda visible tachado con rastro completo en tablas, Tablero y CSV.

### Stock
stock = recibido − salidas (no anuladas) ± préstamos netos (activos). Por almacén/obra. Los ítems rechazados o anulados no generan stock.

### Roles y login (demo: contraseña 1234 para todos)
- `gerencia` → todas las vistas, entra al Tablero. Único con "Reiniciar datos".
- `compras` (Lucía Arana) → Compras + Catálogo + Tablero
- `residente.danaus` (Andrés Chino), `residente.maia` (Edwin Salas) → solo su vista; proyecto y nombre fijos (no puede pedir para otra obra)
- `almacen.luz` (Brayan Huamán), `almacen.maia` (Anton Taucca) → solo su almacén, sin selector de proyecto
- `pagos` (área de pagos) → solo vista Pagos: ejecuta el pago de facturas por medio (Transferencia/Cheque/Tarjeta; banco fijo según la obra) + reposiciones de caja chica; no edita datos comerciales
- `administracion` (Mónica Del Castillo) → solo vista Rendiciones: aprueba/observa la rendición diaria de caja chica
- Caja chica (**NO es un fondo fijo** — corregido por el dueño el 12 ago 2026, migración 38): el efectivo que necesita el comprador depende del día, y Pagos le **entrega** dinero una o varias veces la misma jornada (transferencia, efectivo o cheque), cada entrega en `entregas_caja` con su N° de operación. **La jornada la abre la ENTREGA, no la compra** (migración 48): si se le entrega dinero un día en que no compra nada, la rendición se crea igual, o ese efectivo quedaría sin ningún sitio donde constar que lo devolvió. Al cerrar el día devuelve el vuelto y al siguiente empieza en cero. Frank (rol `comprador`) compra con efectivo; la factura en efectivo nace Pagada contra la rendición del día (única por obra+fecha); administración la cierra con arqueo. **Fórmula: debe quedar = Σ entregas − Σ gastado (sin las anuladas); diferencia = contado − debe quedar.** `cajas_chicas.monto_fondo` y `rendiciones.monto_fondo` quedaron obsoletas; `cajas_chicas.tolerancia` sigue vigente. Bancos por obra en la tabla `proyectos_banco` (migración 32; salió de `proyectos` porque esa la leen los 7 roles para el nombre de la obra y las cuentas quedaban expuestas). Solo la leen gerencia y pagos. **Al abrir una obra nueva hay que cargarle ahí su cuenta, o Pagos no podrá pagarla.** Datos de prueba hasta tener los reales.

### Tablero
14 KPIs: RQs, ítems, % urgentes, entregados, llegaron tarde, rechazados, anulados, incompletos, facturado S/, préstamos activos, holgura promedio, entrega a tiempo %, uso incorrecto %, falta de pago más antiguo. KPIs clicables Pago Crédito / Pago Falta filtran el consolidado. Tablas: **Planificación por residente** (% urgentes con semáforo: verde <25%, amarillo <50%, rojo ≥50% — mide quién planifica y quién apaga incendios) y **Resumen por proyecto** (RQs, % urg, facturado, holgura, uso incorrecto, préstamos). Descarga CSV: botón global + botón por proyecto (27 columnas, BOM UTF-8, abre directo en Excel).

Indicador estrella (fase 2): **costo del desorden** = (uso incorrecto × valor) + (compras urgentes × sobreprecio) + (saldos incompletos × días de obra parada).

## Fórmulas de días
- Llegó en = fechaEntrega − fechaRQ
- Holgura = fechaNecesitada − fechaEntrega (negativa = llegó tarde, en rojo)
- Saldo en = fechaEntregaSaldo − fechaEntrega

## LO QUE SIGUE ABIERTO (28 ago 2026)

**Fallos conocidos y sin arreglar.** No son todos los que hubo: son los que
quedan después de cerrar los 22 de Almacén y Pagos.

- **Un RQ puede quedar fantasma**: la cabecera se crea antes que las líneas y
  no hay transacción, así que si una línea se rechaza queda un RQ numerado y
  vacío. Empeoró con la migración 60, que añadió un motivo más de rechazo. Es
  el arreglo pendiente más grande: mover la creación entera a una función del
  servidor.
- **La salida de material vencido solo se bloquea en pantalla.**
- **La caducidad no viaja con un préstamo**: material por vencer llega al
  destino figurando como bueno.
- **El almacenero ve "S/ 0.00 valorizado"** porque su rol no puede leer
  `factura_items`.
- **"Entrega a tiempo %" mejora cuanto peor va**: solo cuenta lo entregado, así
  que un material que nunca llega no empeora el indicador.
- **Frank escribe el banco a mano** al facturar (consecuencia de la migración
  32: ya no ve qué banco usa cada obra). Dispara alertas falsas en Auditoría, y
  hasta que ese campo sea una lista fija, la guarda de la migración 70 no se
  puede extender al alta de facturas.
- **El sistema no guarda la cuenta bancaria de los proveedores**: al transferir
  hay que buscarla fuera. Es por donde se cuela el fraude de suplantación —el
  correo que dice "cambiamos de cuenta"— porque no hay contra qué compararla.
  Semana 2, junto con la carga de los 255 proveedores.

**Dos decisiones del dueño, pendientes:**
- El cierre de un préstamo es **de una sola firma**: "Transferir al costo"
  decide a qué empresa aterriza el costo y lo firma un solo almacenero, cuando
  la entrada exigió a los dos residentes. (Hoy irrelevante: transferir está
  deshabilitado.)
- La **fecha de pago** acepta 2030 o 1990: falta ponerle tope, como se hizo con
  la fecha de factura.

**Estado de los módulos** (método de cierre uno por uno):
Residente atacado · Gerencia rediseñada · **Compras: arreglado, pendiente de la
verificación final del dueño para congelarlo** · Almacén y Pagos: atacados y
arreglados, sin verificación en pantalla todavía.

## Decisiones del dueño que no estaban escritas (ago 2026)

- **Gerencia mira, no registra.** Criterio con el que se rediseñaron sus ocho
  vistas prestadas (26 ago): se queda lo que informa, se quita lo que
  registra. Cada vista prestada abre con contadores de vigilancia y guarda el
  detalle tras un clic. Sus formularios se retiraron: gerencia no recibe
  material, no factura, no paga. La suplencia por vacaciones se resolverá
  aparte, post-piloto (cuentas de emergencia).
- **El sistema NO manda notificaciones.** Ni correo ni WhatsApp: solo avisa a
  quien ya está mirando. Cada pestaña lleva el número de **lo que le toca a
  esa persona** —no de todo lo que hay—, en rojo si alguien está parado
  esperando. Durante el piloto lo suple una rutina acordada: Lucía abre el
  sistema a primera hora y después de almuerzo; lo urgente se avisa por
  WhatsApp **con el número de RQ, no con el PDF**. Correo automático, semana 2.
- **El flete: Lucía registra, Frank paga.** La agencia cobra al recoger; a
  Lucía le llega la boleta y ella anuncia el monto, Frank paga en efectivo y
  lo rinde. La diferencia entre lo anunciado y lo pagado es control cruzado
  gratis. **Descartada una caja chica aparte para flete**: el efectivo de
  Frank es un solo bolsillo y el arqueo se volvería ficción; lo que se quiere
  saber se resuelve marcando el gasto, no partiendo el efectivo.
- **Cajas y unidades** (aprobado, post-piloto): el stock vive SIEMPRE en
  unidades sueltas; el residente elegirá pedir en UND o CAJA viendo la
  equivalencia al lado; Lucía podrá cargarla al aprobar; **el sobrante se
  queda en el almacén de la obra**.
- **Los enchapes van en M²**, unidad fija, para evitar el desorden de tres
  unidades. OJO: hoy se crean en la familia **97, que en el catálogo real es
  ACTIVOS FIJOS** (reflectores, megáfonos). El sitio correcto es la familia
  **24 · CERÁMICA Y PORCELANATO**. Pendiente de decidir si van siempre a 24 o
  a familia libre.
- **SUNAT / SIRE**: el sistema ya guarda casi todo el Registro de Compras
  (serie, RUC, razón social, fecha, monto, forma de pago, medio, N° de
  operación y obra). Faltan el desglose de IGV, el tipo de comprobante, la
  fecha de vencimiento y la detracción. **El valorizado del almacén sale CON
  IGV** y así está rotulado en pantalla, en el PDF del cierre y en Auditoría.
  Ver `docs/09_sire_rce_viabilidad.md` y `10_sire_donde_estamos.md`.

## Decisiones tomadas (NO reabrir)
- ERP solo después de definir procesos. Este sistema ES la definición del proceso de compras.
- Almacén de excedentes → se convierte en Almacén Central de Tránsito.
- Logística centralizada en Arana.
- Tres tipos de RQ con sus plazos. OJO: los nombres cambiaron — hoy son **URGENTE / GENERAL / ANTICIPADO** ("Especial Lima" se renombró en la migración 21) y el canal lo **deriva el sistema** de la fecha necesitada, ya no lo declara el navegador.
- Alcance congelado hasta terminar piloto: 1 obra, 2 residentes, 2 semanas.

## Casos especiales pendientes (por fase)
**Diseñar en el esquema Supabase desde el día 1:** stock inicial de almacenes existentes, RQ mixto multi-canal (gestión de tiempos por ítem), compra consolidada multi-RQ/multi-proyecto (factura ya soporta multi-ítem mono-proyecto).
**Fase 2 tras piloto:** rechazo en recepción por material dañado/equivocado, notas de crédito y devoluciones al proveedor, etapa "Cotizado" (existía en CONTROL_RQ_LUZ: PENDIENTE→COTIZADO→COMPRADO→ATENDIDO), merma en granel con tolerancia % por tipo de material.
**Arquitectura:** idempotencia (doble clic no duplica), concurrencia (dos compradores mismo ítem), facturación intercompany entre las 4 razones sociales para "Transferir al costo" (asiento contable para Yheyson), días hábiles vs calendario en el cálculo del canal.

## Backlog acordado (18 jul 2026) — orden aprobado por el dueño
1. ✅ Desglose de precios por ítem en facturas + unidades base/factor caja (migración 5)
2. ✅ Módulo de Pagos: rol `pagos`, estado de pago a nivel factura (migración 6)
3. ✅ Consolidado por comprar en Compras + caducidad de perecederos (migración 7: materiales.perecedero, rq_items.fecha_caducidad; semáforo 30/7, vencido bloquea salida; sugerencia de transferencia antes de comprar)
4. Historial/comparativa de precios por material y proveedor con CSV
5. Post-piloto: bitácora de cambios (historial), auditoría cíclica ciega de almacén, liquidación de transferencia intercompany
6. Post-piloto — **Almacén Central (Huancaro)**, diseño ya acordado con el dueño (20 jul 2026), pospuesto porque los saldos antiguos no están valorizados:
   - Fase A (operativa, sin precios): obra especial `0000 · ALMACÉN CENTRAL (HUANCARO)`; almacenero **Fernando** (rol almacen, proyecto 0000); inventario físico por cantidades. Alerta en el consolidado de Lucía "CENTRAL tiene N" con botón **Aceptar del central** (solo compras decide; atención parcial con campo de cantidad). Frank (chofer) ve en Compras del día "Comprar: M · Recoger en ALMACÉN CENTRAL: N" — su rendición no cambia. Fernando ve cola "Por despachar" (material, cantidad, obra, N° RQ) y registra la salida; el almacén de obra recibe el ítem (doble punta). Requiere columna rq_items.cant_central.
   - Fase B (contable, con Yheyson): valorización de saldos de Huancaro, guía de remisión PDF con firmas (Fernando entrega / Frank transporta / obra recibe), liquidación intercompany entre las empresas adjuntas **Gold y Majser**.
Nuevos RQs: piso/nivel obligatorio (lista cerrada), fecha necesitada única por RQ (Compras gestiona por ítem), PDF solo cuando todos los ítems están decididos y solo con aprobados.

### Punto extra (idea del dueño, 14 ago 2026): el Registro de Compras para SUNAT
El sistema ya guarda, sin habérselo propuesto, casi todo lo que exige el Registro de Compras: serie, RUC y razón social del proveedor, fecha de emisión, monto, forma de pago, medio, N° de operación y obra. **Faltaría** el desglose de IGV (base imponible / IGV / total), el tipo de comprobante (factura, boleta, nota de crédito), la fecha de vencimiento del comprobante y la **detracción** cuando aplique. Con eso, Yheyson podría exportar el registro en vez de re-digitarlo desde los PDFs.
**No tocar hasta terminar el piloto** (decisión del dueño). Va junto con los cinco casos de compra pendientes —detracción, pago parcial, un pago para varias facturas, anticipo y canje por letra— y con la nota de crédito / saldo a favor, porque son el mismo bloque contable.

**Pendientes de Lucía (lunes):** equivalencias caja→unidades de los ~29 materiales "CAJA" (y PQT/ROLLO/PAR), su hoja de control de almacenes (inventarios iniciales por obra, ideal con precios), confirmar nombres de familias 62/73/91, y CONTROL_RQ_LUZ.xlsx (255 proveedores). Falta crear usuario del rol `pagos` en Auth + tabla usuarios.

## Esquema Supabase propuesto (siguiente tarea)
Tablas: `materiales`, `proveedores`, `usuarios` (con rol y proyecto asignado), `rqs`, `rq_items`, `facturas`, `factura_items` (puente N:M), `salidas`, `prestamos`, `stock_inicial`. Row Level Security por rol y proyecto (residente solo ve/crea en su obra; almacenero solo su almacén; compras y gerencia global). Auth de Supabase reemplaza el login demo. Ver `docs/04_roadmap_supabase.md`.

## Reglas que se bajaron a la base (migraciones 49–74, ago 2026)

Todas nacieron de un fallo encontrado atacando el sistema o usándolo de verdad.
Están en `supabase/migrations/` con su porqué escrito completo; aquí solo lo
que cambia cómo trabaja la gente.

**Dinero**
- **Compras no maneja efectivo** (52). A Lucía no se le asigna caja chica —
  corrección del dueño. Si registrara un pago en efectivo se le abriría una
  rendición a su nombre que nadie cerraría.
- **Un compromiso conserva su plazo de crédito** (52): antes todos nacían
  vencidos el mismo día.
- **Una factura anulada libera su número** (64). Antes lo quemaba para
  siempre, así que la corrección oficial —gerencia anula, se registra de
  nuevo— era imposible: el papel del proveedor tiene un solo número.
- **La factura real puede llegar por otro importe** (65) y **el ajuste reparte
  el desglose en proporción** (68). El 65 solo abrió la puerta y afirmó que el
  cuadre se validaba solo; era falso —el trigger de cuadre vive sobre las
  líneas, no sobre la factura— y dejaba el desglose descuadrado en silencio.
- **El arqueo de caja chica lo calcula la base** (67). Antes el navegador
  mandaba la diferencia Y el veredicto (`estado: excede ? ...`), o sea que
  quien decidía si la caja cuadraba era la pantalla que estaba siendo
  controlada. Ahora solo viaja lo que administración cuenta.

**Inventario y catálogo**
- **La unidad viaja congelada en cada línea** (59) y **el factor de caja
  también** (63). El catálogo dice cómo se compra HOY; la línea, cómo se
  compró ESE DÍA. Sin esto, cargar una equivalencia de caja reescribía el
  pasado: un "3 CAJA" ya registrado pasaba a "3 UND" sin tocar el número.
- **Un código desactivado no se puede pedir** (60) — pero su stock físico se
  sigue sacando y su historia conserva el nombre. Los duplicados los cura
  Lucía; gerencia solo mira.
- **Los códigos no se reciclan**: el correlativo y la validación de unicidad
  miran todos los códigos jamás asignados, no solo los activos.

**Decisiones y firmas**
- **Los ítems nacen Pendientes** (57): un residente no puede crear una línea ya
  aprobada, recibida o firmada.
- **Una decisión no se deshace** (62). Rechazar era la puerta trasera de
  anular: se podía rechazar algo ya comprado, facturado o recibido, y el
  material desaparecía del stock con las bolsas en la obra.
- **La compra parcial cierra lo conseguido** (61): lo comprado queda Comprado
  y solo el saldo vuelve a la cola. Antes el consolidado pedía el total otra
  vez y se compraba dos veces.
- **Las firmas las pone el servidor** (41, 55, 66): quién anuló, quién pagó,
  quién pidió una anulación. Un dato que el cliente escribe no es una firma.

**Del 28 de agosto: los 22 agujeros de Almacén y Pagos**
Salieron de dos ataques adversariales y se cerraron todos el mismo día. Casi
todos eran la misma enfermedad ya curada en Compras —una transición sin guarda,
o una firma que escribía el navegador— y **ninguno era alcanzable desde la
pantalla**: todos hablándole directo a la base con una sesión iniciada.

- **El arqueo de caja chica lo calcula la base** (67). Era el agujero más serio
  que quedaba: el navegador mandaba la diferencia Y el veredicto
  (`estado: excede ? ...`), o sea que **quien decidía si la caja cuadraba era la
  misma pantalla que estaba siendo controlada**. Ahora solo viaja lo que
  administración cuenta. Y la caja chica es lo único donde el dinero se mueve
  sin banco de por medio: una transferencia se concilia contra el extracto, el
  efectivo solo tiene este arqueo.
- **En almacén, lo hecho no se deshace** (69): no se des-anula una salida —lo
  que borraba el motivo y la firma y volvía a descontar stock—, no se re-decide
  una ya resuelta, el reingreso no retrocede, y un préstamo entregado no vuelve
  atrás.
- **La firma del pago, también al CREAR** (70). La migración 55 lo cerró solo
  para el UPDATE: se podía fabricar de cero una factura ya nacida 'Pagada'
  atribuida a otra persona. Ahí mismo: el banco tiene que ser el de la obra, una
  jornada aprobada no se reabre, y **una entrega no se registra dos veces** —el
  doble clic con la red lenta de la obra dejaba un faltante que se lo comía Frank.
- **La recepción suma en el servidor** (71). La pantalla mandaba el TOTAL
  calculado con lo que tenía en memoria, así que dos personas recibiendo el
  mismo ítem se pisaban y **la primera recepción desaparecía sin error ni
  rastro**. Ahora viaja el incremento y suma la base, bloqueando la fila.
- **Gerencia puede corregir una entrega de un día cerrado** (72). Era un
  callejón: el sistema decía "coordina con gerencia" y gerencia no tenía con
  qué. Ahora la anula con motivo y **se reabre la jornada** para volver a contar.
- **Mónica ve el banco de su obra** (73) — bloqueante que apareció verificando
  lo demás: la migración 32 cerró `proyectos_banco` y la 47 le dio a
  administración el permiso de pagar, sin darle el dato. Ahí mismo: un préstamo
  **Solicitado reserva** el material en el origen (antes se podía prometer dos
  veces), y "el destino ya consumió" pasa a mirar el **stock físico** —antes
  contaba salidas sin aprobar y bloqueaba devoluciones legítimas—.
- **Sin transferir al costo durante el piloto** (74, decisión del dueño): las
  obras son de razones sociales distintas y mover el costo sin factura entre
  ellas no es un asiento válido. Si el destino ya consumió el material, el
  préstamo **queda abierto** —refleja una deuda real sin liquidar— y sale en un
  contador para que no se acumulen invisibles. Se rehabilita borrando un solo
  trigger.

**Tiempo**
- **La base vive en hora de Perú** (58). Estaba en UTC: a partir de las 19:00
  el sistema ya creía que era mañana, y eso además desactivaba la guarda que
  impide registrar entregas con fecha futura.

## Estructura del repo
```
rq-sistema-proyecto/
├── CLAUDE.md            ← este archivo (contexto maestro)
├── README.md            ← guía de uso rápida
├── src/                 ← LA APLICACIÓN (Vite + React)
│   ├── App.jsx          ← capa de datos, api.*, cabecera y montaje de vistas
│   ├── main.jsx · index.css · supabaseClient.js
│   ├── vistas/          ← una por pantalla (16)
│   │   ├── Login.jsx · Residente.jsx · AlmacenResidente.jsx
│   │   ├── Compras.jsx · PedidoCotizacion.jsx · HistorialPrecios.jsx
│   │   ├── Catalogo.jsx · HistorialMateriales.jsx
│   │   ├── Almacen.jsx · AprobacionesResidente.jsx
│   │   ├── ComprasDelDia.jsx      ← la de Frank (comprador)
│   │   ├── Pagos.jsx · Rendiciones.jsx
│   │   └── Auditoria.jsx · Tablero.jsx · ReporteMensual.jsx
│   ├── stock.js         ← la aritmética del stock y el semáforo de caducidad
│   ├── caja.js          ← el cuadre de caja chica (probado aparte)
│   ├── pago.js          ← formas de pago, vencimientos y validación de RUC
│   ├── fechas.js        ← HOY_ISO, fmt, días (todo en hora de Perú)
│   ├── pdf.js           ← RQ, cierre de almacén, conteo ciego
│   ├── ui.jsx           ← Aviso, AnularBox, inputs y estilos compartidos
│   ├── maestros.js      ← PROYECTOS y ALMACENEROS (se publican al cargar)
│   └── busqueda.js      ← búsqueda del catálogo, ordenada por relevancia
├── index.html · vite.config.js · tailwind.config.js · postcss.config.js
├── vercel.json          ← configuración del despliegue
├── prototipo/
│   ├── sistema_rq.html  ← prototipo original standalone (referencia)
│   └── sistema_rq.jsx   ← su fuente React
├── test/                ← 61 pruebas de la lógica pura; `npm test` las corre
│   └── caja · fechas · stock · pago · busqueda (.test.mjs)
├── docs/
│   ├── 01_contexto_negocio.md · 02_modelo_datos.md
│   ├── 03_casos_especiales.md · 04_roadmap_supabase.md
│   ├── 05_que_hacer_si_falla.md         ← qué hacer si el sistema falla
│   ├── 06_pruebas_antes_del_piloto.md   ← el guion de pruebas A–F
│   ├── 07_prueba_de_hoy.md · 08_donde_estamos_de_verdad.md
│   ├── 09_sire_rce_viabilidad.md · 10_sire_donde_estamos.md
│   └── 11_ataque_residente.md · 12_indicadores_para_compras.md
├── datos/
│   └── codificacion_de_almacen.xlsx  ← el catálogo real (1,740 materiales).
│                          FALTA copiar CONTROL_RQ_LUZ.xlsx (255 proveedores)
└── supabase/
    ├── migrations/      ← 73 archivos numerados del 1 al 74 (el 33 no existe:
    │                      se descartó antes de correrse). Son la fuente de
    │                      verdad de las reglas de negocio.
    ├── CORRER_ESTO_*.sql ← varias migraciones juntas, para pegar de una vez
    └── reset_pruebas.sql ← borra datos de prueba antes de arrancar
```

**Dónde vive cada cosa, y por qué importa:** las reglas que protegen dinero e
inventario viven en `supabase/migrations/`, no en la pantalla. La pantalla
facilita y avisa; **la base exige**. Cada vez que se descubre una regla que
solo vivía en el navegador —el canal declarado, las líneas que nacían
aprobadas, la firma de una anulación, el arqueo de caja— se baja a la base,
porque el navegador corre en la máquina del usuario y se puede esquivar.

## EL PLAN DE LANZAMIENTO (acordado con el dueño el 28 ago 2026)

En este orden, y **cada paso tiene que terminar antes de empezar el
siguiente**. El dueño lo planteó así y es el que manda:

1. **Cerrar los módulos uno por uno.** Verificación en pantalla (el dueño con
   Claude in Chrome) → arreglar lo que salga → **congelar** → siguiente.
2. **Una pasada global** al final: ataque al código y prueba a mano, sobre el
   sistema entero.
3. **Borrar los datos de prueba** (`supabase/reset_pruebas.sql`).
4. **Probar cada caso y cada ramificación** sobre el sistema limpio.
5. **Reset otra vez**, para borrar lo que generó esa prueba.
6. **AHORA sí, cargar los datos reales.** Este orden importa: el reset borra
   `stock_inicial`, así que el inventario cargado antes se perdería.
7. `VITE_ENTORNO = produccion` en Vercel + Redeploy. **Es lo último que se
   toca**: si se cambia antes de borrar las pruebas, el equipo verá
   movimientos inventados como si fueran reales; y si no se cambia, trabajarán
   con dinero de verdad leyendo "esto no son los datos reales".
8. **Anunciar y lanzar.**

**QUÉ SOBREVIVE AL RESET, y por eso se puede cargar antes** (comprobado contra
el guion): los **255 proveedores** (solo borra el de prueba, RUC 20138651917),
las **equivalencias de caja** (viven en el catálogo), y la **curaduría de
duplicados** de Lucía.

**QUÉ NO SOBREVIVE:** el **inventario inicial**. Decisión del dueño: se carga
después de anunciar el piloto. Tiene sentido más allá de lo técnico — es la
foto de lo que hay en cada almacén ESE día, y tomada con una semana de
antelación ya está desactualizada.

**CONSECUENCIA A TENER PRESENTE:** mientras no esté el inventario, el stock
arranca en CERO y los almaceneros **no pueden registrar salidas** — el sistema
dirá que no hay stock, y tendrá razón. O se carga el mismo día del arranque
antes de que entre nadie, o se arranca solo con el flujo de compras y se les
avisa, o pensarán que el sistema está roto.

**LO QUE FALTA ANTES DEL ARRANQUE, aparte de lo anterior:**
- **El almacenero de DANAUS** — sin él, esa obra no recibe ni saca material.
- Supabase **Pro** con recuperación a punto en el tiempo.
- Los **bancos reales** en `proyectos_banco` (2502 y 2503 para el piloto).
- Cuentas de correo reales por persona, y el usuario del rol `pagos`.
- Los **manuales por rol**.

## Reglas para trabajar en este repo
- Idioma: español en UI, commits y docs.
- **Antes de reemplazar algo, leer la versión anterior línea por línea.** Dos
  veces se rompió producción por código correcto en el sitio equivocado: unos
  ganchos de React después de un `return` temprano (pantalla en blanco para
  todos) y una constante usada antes de declararla (vista vacía para
  gerencia). Compilaba y las pruebas pasaban en los dos casos.
- **Abrir la aplicación en el navegador antes de dar algo por hecho.** Que
  compile y pasen las pruebas no significa que funcione: los tres botones que
  "no hacían nada" en Compras salieron de una prueba a mano, no del código —
  el mensaje existía, pero se pintaba fuera de la pantalla.
- **Al escribir una migración, comprobar el nombre real de la función que se
  reemplaza.** Un `create or replace` con el nombre equivocado crea una
  función huérfana: la regla vieja sigue mandando y nada avisa.
- **Cada migración se ataca antes de correrla.** Las que se dieron por buenas
  sin atacar traían fallos graves: la 60 bloqueaba la compra parcial de Frank
  con el efectivo ya gastado, la 61 declaraba cerrado un agujero que seguía
  abierto, la 65 afirmaba una validación que no existía.
- **Pocos agentes.** Revisar uno mismo por defecto; los ataques masivos agotan
  la cuota de la cuenta y repiten hallazgos. Lo más valioso ha salido del
  dueño probando el sistema a mano.
- No agregar funciones fuera del alcance congelado sin aprobación explícita del dueño.
- Toda regla de negocio nueva debe probarse (el prototipo se validó con un harness jsdom: 20 tests dirigidos + 120 corridas aleatorias).
- El HTML standalone se compila así: babel (preset-react, runtime classic, React UMD global) + tailwindcss v3 escaneando el fuente; todo se empaqueta inline en un solo HTML. No usar CDNs en runtime (debe funcionar offline).
- Formato de moneda: S/ (soles peruanos). Fechas: es-PE.
