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

Personas clave: Lucía Arana (logística/compras centralizada, dueña del catálogo), Mónica Del Castillo (administración), Yheyson Ccoiccosi (contabilidad), Rodrigo Curo (BIM).

## Problema que resuelve
Antes: RQs como PDFs sueltos por WhatsApp, sin trazabilidad, catálogo desactualizado en decenas de copias de Excel, compras identificado como el principal dolor al escalar de 2 a 5 obras. Regla de adopción acordada: **"RQ que no entra por el sistema, no se compra".**

## Estado actual
- **App multi-usuario en producción**: Vite + React + Tailwind + Supabase (`src/App.jsx`), desplegada en Vercel (https://rq-sistemas.vercel.app) desde el repo GitHub `joacosss16/rq-sistemas`. Login con Supabase Auth, datos compartidos vía Postgres + RLS. Migraciones en `supabase/migrations/`.
- `prototipo/sistema_rq.html`: prototipo standalone original (localStorage, mono-usuario). Se conserva como referencia; probado con 140+ corridas automatizadas (jsdom).
- Alcance CONGELADO: la app replica el prototipo tal cual, sin funciones nuevas, hasta terminar el piloto.
- Diferencias deliberadas con el prototipo: solo los residentes crean RQs (RLS); solo Compras registra facturas y aprueba materiales; "Reiniciar datos" se hace con `supabase/reset_pruebas.sql`; gerencia ve todo en modo consulta donde no tiene permiso de escritura.
- Catálogo completo cargado: tabla `familias` (58, IU de 2 dígitos) + 1,740 materiales desde `datos/codificacion_de_almacen.xlsx` (hoja "Materiales 3.0"); la familia de un material se deriva de los 2 primeros dígitos del código. Compras puede editar solicitudes de material nuevo (descripción, unidad, familia) antes de aprobar; código correlativo por familia.
- Pendiente: seed de proveedores (255) desde CONTROL_RQ_LUZ.xlsx.

## Modelo de negocio del sistema

### Catálogo
1,740 materiales (145 en el prototipo como muestra), 56 familias. Código de 6 dígitos: IU(2) + GRUPO(2) + correlativo(2). Solo el dueño del catálogo (Arana) aprueba materiales nuevos; los residentes los solicitan desde su vista. Código sugerido automático por familia; validación de 6 dígitos únicos. El catálogo completo está en `datos/NUEVO_RQ.xlsx`, hoja "Materiales 3.0".

### Canales de RQ (automático por fecha necesitada mínima vs hoy)
- **URGENTE**: < 2 días → justificación obligatoria ("¿por qué no se previó?")
- **GENERAL**: ≤ 7 días
- **ESPECIAL LIMA**: > 7 días (compras en Lima / importación, 1-4 semanas)

### Flujo por ítem
1. Residente crea RQ (proyecto fijo por login, partida auto-prefijada con código de obra, fecha necesitada ≥ hoy obligatoria, destino detallado obligatorio, color opcional con nota "dejar vacío si no aplica"). Al enviar se genera PDF formal (réplica de la HOJA RQ con membrete y bloque de 4 firmas: Residente → V°B° Gerente de Operaciones → Recepción en obra → Entregado por). El PDF también se puede regenerar desde "Mis requerimientos" y desde Compras (clic en RQ-xxx).
2. Compras decide: **Aprobar / Rechazar (motivo obligatorio, se comunica al residente, cierra el ítem)**. La decisión es PASO PREVIO separado del estado logístico.
3. Aprobado → estado logístico: — / En camino / Entregado / Incompleto. Pago: — / Pagado / Crédito / Falta.
4. **Facturación y pago separados** (desde jul 2026): Compras registra la factura completa — serie, proveedor (maestro con RUC; los nuevos se agregan solos), RUC 11 dígitos, fecha, monto total, forma de pago, y **desglose de precio unitario por ítem** (la suma debe cuadrar con el total; trigger lo valida, tolerancia S/ 0.50). **Una factura puede cubrir varios ítems** del mismo proyecto. Duplicados serie+RUC bloqueados. El **pago lo ejecuta el rol `pagos`** en su propia vista: banco + N° de operación + fecha, filtrable por proyecto (cada obra su cuenta). El estado de pago vive en la FACTURA; los ítems lo heredan: sin factura "—", factura pendiente a crédito "Crédito", pendiente contado "Falta", pagada "Pagado". Factura pagada queda congelada (trigger).
5. Almacén recibe: solo cantidad + observaciones. Parcial → Incompleto automático (visible en Compras y Almacén); al llegar el saldo se registra otra recepción → Entregado. **Sobre-recepción bloqueada** (no se puede recibir más de lo pedido; si el proveedor entregó de más, se corrige con Compras).
6. Ítem Entregado + Pagado → se CIERRA (sale de la vista de Compras, queda solo en Tablero).
7. Salidas de almacén: exigen N° de hoja de trabajo + zona de trabajo; no exceden stock. Verificación de uso: Correcto / Incorrecto (motivos: No se completó el trabajo / Se encontró botado / Uso inadecuado / Otro con texto obligatorio).
8. Préstamos entre almacenes: material + cantidad + destino + quién autoriza. Estados: Prestado → Devuelto (BLOQUEADO si el destino ya consumió el material → el sistema obliga "Transferir al costo", que es lo contablemente correcto) / Transferido al costo / Anulado.

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
- Caja chica (fondo fijo por obra, tabla `cajas_chicas`): Frank (rol `compras`, usuario propio) compra con efectivo; la factura en efectivo nace Pagada contra la rendición del día (única por obra+fecha); administración aprueba; Pagos repone el fondo desde la cuenta de la obra. Bancos por obra en `proyectos.banco` (datos de prueba hasta tener los reales).

### Tablero
14 KPIs: RQs, ítems, % urgentes, entregados, llegaron tarde, rechazados, anulados, incompletos, facturado S/, préstamos activos, holgura promedio, entrega a tiempo %, uso incorrecto %, falta de pago más antiguo. KPIs clicables Pago Crédito / Pago Falta filtran el consolidado. Tablas: **Planificación por residente** (% urgentes con semáforo: verde <25%, amarillo <50%, rojo ≥50% — mide quién planifica y quién apaga incendios) y **Resumen por proyecto** (RQs, % urg, facturado, holgura, uso incorrecto, préstamos). Descarga CSV: botón global + botón por proyecto (25 columnas, BOM UTF-8, abre directo en Excel).

Indicador estrella (fase 2): **costo del desorden** = (uso incorrecto × valor) + (compras urgentes × sobreprecio) + (saldos incompletos × días de obra parada).

## Fórmulas de días
- Llegó en = fechaEntrega − fechaRQ
- Holgura = fechaNecesitada − fechaEntrega (negativa = llegó tarde, en rojo)
- Saldo en = fechaEntregaSaldo − fechaEntrega

## Decisiones tomadas (NO reabrir)
- ERP solo después de definir procesos. Este sistema ES la definición del proceso de compras.
- Almacén de excedentes → se convierte en Almacén Central de Tránsito.
- Logística centralizada en Arana.
- Tres tipos de RQ con sus plazos (General ≤3 días, Urgente 1-6 horas, Especial Lima 1-4 semanas).
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

**Pendientes de Lucía (lunes):** equivalencias caja→unidades de los ~29 materiales "CAJA" (y PQT/ROLLO/PAR), su hoja de control de almacenes (inventarios iniciales por obra, ideal con precios), confirmar nombres de familias 62/73/91, y CONTROL_RQ_LUZ.xlsx (255 proveedores). Falta crear usuario del rol `pagos` en Auth + tabla usuarios.

## Esquema Supabase propuesto (siguiente tarea)
Tablas: `materiales`, `proveedores`, `usuarios` (con rol y proyecto asignado), `rqs`, `rq_items`, `facturas`, `factura_items` (puente N:M), `salidas`, `prestamos`, `stock_inicial`. Row Level Security por rol y proyecto (residente solo ve/crea en su obra; almacenero solo su almacén; compras y gerencia global). Auth de Supabase reemplaza el login demo. Ver `docs/04_roadmap_supabase.md`.

## Estructura del repo
```
rq-sistema-proyecto/
├── CLAUDE.md            ← este archivo (contexto maestro)
├── README.md            ← guía de uso rápida
├── index.html           ← copia del prototipo en raíz (para GitHub Pages)
├── prototipo/
│   ├── sistema_rq.html  ← app funcional (doble clic para abrir)
│   └── sistema_rq.jsx   ← fuente React
├── docs/
│   ├── 01_contexto_negocio.md
│   ├── 02_modelo_datos.md
│   ├── 03_casos_especiales.md
│   └── 04_roadmap_supabase.md
├── datos/               ← COPIAR AQUÍ: NUEVO_RQ.xlsx, CONTROL_RQ_LUZ.xlsx (catálogo 1,740 + proveedores 255)
└── supabase/            ← aquí vivirán migraciones SQL y el proyecto nuevo
```

## Reglas para trabajar en este repo
- Idioma: español en UI, commits y docs.
- No agregar funciones fuera del alcance congelado sin aprobación explícita del dueño.
- Toda regla de negocio nueva debe probarse (el prototipo se validó con un harness jsdom: 20 tests dirigidos + 120 corridas aleatorias).
- El HTML standalone se compila así: babel (preset-react, runtime classic, React UMD global) + tailwindcss v3 escaneando el fuente; todo se empaqueta inline en un solo HTML. No usar CDNs en runtime (debe funcionar offline).
- Formato de moneda: S/ (soles peruanos). Fechas: es-PE.
