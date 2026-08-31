# Sistema RQ — Grupo Copacabana

Contexto maestro: lo que NO cambia semana a semana. Leer completo antes de
tocar código. **El estado del proyecto —lo abierto, el plan, el backlog— vive
en `docs/ESTADO.md`: leerlo ANTES de proponer o arreglar nada.** El 30 ago se
estuvo a punto de re-arreglar el RQ fantasma, ya cerrado por la migración 76,
porque el estado desactualizado vivía dentro de este archivo. La historia de
cada regla (qué fallo la parió) está en `docs/13_por_que_cada_regla.md`.

## Qué es
Sistema digital de requerimientos de materiales (RQ) para Grupo Copacabana:
construcción e inmobiliaria de Cusco, Perú. 4 razones sociales, ~65
trabajadores, 5 proyectos activos:

| Código | Proyecto | Residente | Almacenero |
|---|---|---|---|
| 2501 | EMPERATRIZ | — | — |
| 2502 | DANAUS | Andrés Chino (benchmark interno) | — |
| 2503 | MAIA | Edwin Salas | Anton Taucca |
| 2504 | LUZ | — | Brayan Huamán |
| 2601 | TORRE COPACABANA | — | — |

**Toda obra tiene SIEMPRE un residente y un almacenero** (regla del negocio,
confirmada por el dueño el 12 ago 2026). Las guardas de aprobación se apoyan en
eso: quien aprueba una salida o su lado de un préstamo es el residente de esa
obra. Una obra sin residente dado de alta deja sus salidas y préstamos sin
poder aprobarse.

**EL PILOTO ARRANCA CON DOS OBRAS: MAIA + DANAUS** (decisión del dueño, 27 ago
2026), 2 residentes, 2 semanas. Alcance congelado hasta terminarlo: **no se
agregan funciones nuevas**, solo se arregla y endurece lo que existe.

Personas clave: Lucía Arana (logística/compras centralizada, dueña del
catálogo), Mónica Del Castillo (administración), Yheyson Ccoiccosi
(contabilidad), Rodrigo Curo (BIM), Frank (comprador con efectivo).

## Problema que resuelve
Antes: RQs como PDFs sueltos por WhatsApp, sin trazabilidad, catálogo
desactualizado en decenas de copias de Excel. Regla de adopción acordada:
**"RQ que no entra por el sistema, no se compra"** (en el piloto, para las dos
obras que entran; las demás siguen como antes hasta sumarse).

## Cómo se corre y cómo se despliega

```bash
npm install          # una vez
npm run dev          # desarrollo, en localhost:5173
npm run build        # compila a dist/
npm run preview      # sirve lo compilado en localhost:4173 (para probar de verdad)
npm test             # 62 pruebas de la lógica pura (caja, fechas, stock, pago, búsqueda)
```

**Las migraciones NO se corren solas.** Hay que abrir el archivo
`supabase/migrations/<la que toque>.sql`, copiar **todo** su contenido y
pegarlo en el **editor SQL de Supabase**. Están escritas para poder repetirse
sin daño, y cada una lleva al pie las consultas de comprobación de antes y
después. Correrlas **en orden**. Las corre el dueño, no Claude.

**El despliegue es automático**: un `push` a `main` publica en Vercel
(https://rq-sistemas.vercel.app, repo GitHub `joacosss16/rq-sistemas`). Por eso
el trabajo a medias se queda en la rama, y a producción solo va lo probado.

**Ojo con la base**: hay UNA sola (Supabase: Postgres + RLS + Auth). Lo que se
corre en Supabase afecta tanto a `localhost` como a producción — el código
puede estar sin desplegar, la base nunca. Al correr una migración, las reglas
nuevas rigen para todos de inmediato.

**Variables de entorno** (`.env.local`, ver `src/supabaseClient.js`):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_ENTORNO`. Esa última
decide el banner: mientras no diga `produccion`, la aplicación muestra la
franja "ENTORNO DE PRUEBAS · ESTOS NO SON LOS DATOS REALES". Al arrancar el
piloto hay que cambiarla, o el equipo trabajará creyendo que practica.

## Modelo de negocio del sistema

### Catálogo
1,740 materiales y **58 familias** (tabla `familias`). Código de 6 dígitos:
IU(2) + GRUPO(2) + correlativo(2); la familia se deriva de los 2 primeros
dígitos. Solo la dueña del catálogo (Arana) aprueba materiales nuevos; los
residentes los solicitan desde su vista, y Compras puede editar la solicitud
(descripción, unidad, familia) antes de aprobar. **Un código nunca se
recicla**: el correlativo y la unicidad miran todos los códigos jamás
asignados, incluidos los desactivados. Un código desactivado no se puede pedir,
pero su stock físico se sigue sacando y su historia conserva el nombre. Fuente:
`datos/codificacion_de_almacen.xlsx`, hoja "Materiales 3.0".

### Canales de RQ (el canal lo deriva el sistema de la fecha necesitada)
- **URGENTE**: < 2 días → justificación obligatoria ("¿por qué no se previó?")
- **GENERAL**: ≤ 7 días
- **ANTICIPADO**: > 7 días (compras planificadas / importación, 1-4 semanas)

### Flujo por ítem
1. Residente crea RQ (proyecto fijo por login, partida auto-prefijada con
   código de obra, fecha necesitada ≥ hoy, destino detallado obligatorio). Al
   enviar se genera PDF formal (HOJA RQ con membrete y 4 firmas). La creación
   es UNA operación del servidor (`crear_rq`, migración 76): nace entero o no
   nace, y el doble clic devuelve el mismo número.
2. Compras decide: **Aprobar / Rechazar (motivo obligatorio, cierra el ítem)**.
   La decisión es PASO PREVIO separado del estado logístico.
3. Aprobado → estado logístico: — / Comprado / Entregado / Incompleto.
   "Comprado" lo marca Compras o el comprador (Frank). Entregado/Incompleto
   los fija el almacén al recibir.
4. **Facturación y pago separados**: Compras registra la factura completa —
   serie, proveedor (maestro con RUC; los nuevos se agregan solos), fecha,
   monto, forma de pago y **desglose de precio unitario por ítem** (debe
   cuadrar con el total; trigger lo valida, tolerancia S/ 0.50). Una factura
   puede cubrir varios ítems del mismo proyecto. Duplicados serie+RUC
   bloqueados. **Compromiso de crédito** (migración 14): proveedor que emite
   factura recién al pagar → "SIN factura aún", serie CRED-#### automática,
   nunca efectivo; la deuda es visible desde el día 1 y no se puede marcar
   Pagada sin digitar la serie real. El **pago lo ejecuta Mónica** (rol
   `administracion`) en la vista de Pagos: banco + N° de operación + fecha. El
   estado de pago vive en la FACTURA; los ítems lo heredan. Factura pagada
   queda congelada (trigger).
5. Almacén recibe: solo cantidad + observaciones. Parcial → Incompleto; al
   llegar el saldo, otra recepción → Entregado. **Sobre-recepción bloqueada.**
6. Ítem Entregado + Pagado → se CIERRA (sale de Compras, queda en Tablero).
7. Salidas de almacén: exigen N° de hoja de trabajo + zona; no exceden stock.
   **Aprobación del residente** (migración 18): nace "Pendiente" y solo
   RESERVA stock hasta que el residente de la obra la aprueba o rechaza con
   motivo. Aprobada admite verificación de uso Correcto/Incorrecto, y el uso
   incorrecto admite reingreso a stock (migración 17). Anular restaura stock.
8. Préstamos entre almacenes: **doble aprobación** (migración 18) — nace
   "Solicitado" (que ya RESERVA en el origen, migración 73), aprueban AMBOS
   residentes; con los dos OK pasa a "Prestado" y mueve stock. Devolución
   BLOQUEADA si el destino ya consumió (se mira el stock físico). **"Transferir
   al costo" está DESHABILITADO durante el piloto** (migración 74, decisión del
   dueño): mover costo sin factura entre razones sociales no es un asiento
   válido, así que un préstamo consumido **queda abierto** —deuda real sin
   liquidar— y sale en un contador. La liquidación al cierre de obra no está
   planteada todavía.

### Anulaciones (nunca edición silenciosa)
Ítems, salidas y préstamos se anulan con motivo obligatorio + usuario + fecha.
La salida anulada restaura stock. El préstamo solo se anula si el destino no
consumió. Todo queda visible tachado con rastro completo.

### Stock
stock = inicial + recibido − salidas (no anuladas) ± préstamos netos. Por
almacén/obra. Rechazados y anulados no generan stock. `calcularStocks` devuelve
DOS números y no son intercambiables: `cant` = disponible (descuenta reservas),
`fisico` = lo que está en el estante. El conteo ciego y el cierre valorizado
usan el físico: a nadie se le pide contar material que sí está.

### Roles (login real con Supabase Auth; cuentas de prueba @rq-test.com, contraseña compartida 1234 hasta el arranque)
- `gerencia` → todas las vistas, entra al Tablero. Único con "Reiniciar datos".
  **Gerencia mira, no registra** (criterio del dueño, 26 ago): no recibe
  material, no factura, no paga. Sus vistas prestadas abren con contadores.
- `compras` (Lucía Arana) → Compras + Catálogo + Tablero. **No maneja efectivo**
  (migración 52): no se le asigna caja chica.
- `residente.*` → solo su vista; proyecto y nombre fijos.
- `almacen.*` → solo su almacén, sin selector de proyecto.
- `comprador` (Frank) → Compras del día: compra con efectivo, registra sus
  facturas contra su rendición, reporta compras parciales.
- `pagos` → **rol DORMIDO, sin usuario y a propósito** (migración 47, decisión
  del dueño): fingir dos personas de administración produce cuentas
  compartidas, que es peor. El día que exista tesorería se separa sin código.
- `administracion` (Mónica Del Castillo) → Rendiciones **y Pagos**: entrega el
  efectivo, cierra el arqueo y ejecuta los pagos. **El circuito del dinero
  completo en una mano**; lo compensa la alerta de Auditoría "Entregó y arqueó
  la misma persona" (migraciones 47 y 77) — no bloquea, hace visible.

### Caja chica (NO es un fondo fijo — dueño, 12 ago 2026, migración 38)
El disponible del día son las **entregas** que administración registra en
`entregas_caja` (una o varias por jornada, con N° de operación). **La jornada
la abre la ENTREGA, no la compra** (migración 48): dinero entregado un día sin
compras necesita dónde constar que se devolvió. La factura en efectivo de Frank
nace Pagada contra la rendición del día (única por obra+fecha); administración
cierra con arqueo, que **calcula la base** (migración 67). **Fórmula: debe
quedar = Σ entregas − Σ gastado (sin anuladas); diferencia = contado − debe
quedar.** Si excede la tolerancia de la obra, escala a gerencia.
`monto_fondo` (en cajas_chicas y rendiciones) quedó OBSOLETA; `tolerancia`
sigue vigente. Bancos por obra en `proyectos_banco` (migración 32; solo la
leen gerencia, pagos y administración). **Al abrir una obra hay que cargarle
su cuenta o Pagos no podrá pagarla**; `supabase/verificar_datos_reales.sql`
lo comprueba.

### Reglas que exige la base (la vigente; el porqué, en docs/13)
- **La unidad y el factor de caja viajan congelados en cada línea** (59, 63):
  el catálogo dice cómo se compra HOY; la línea, cómo se compró ESE DÍA.
- **Los ítems nacen Pendientes** (57): nada se crea ya aprobado ni recibido.
- **Una decisión no se deshace** (62) y **en almacén lo hecho no se deshace**
  (69): rechazar no es la puerta trasera de anular.
- **La compra parcial cierra lo conseguido** (61): solo el saldo vuelve a la cola.
- **Las firmas las pone el servidor** (41, 55, 66, 70, 77): quién anuló, quién
  pagó, quién contó el efectivo. Un dato que el cliente escribe no es una firma.
- **La recepción suma en el servidor** (71): viaja el incremento, no el total.
- **La base vive en hora de Perú** (58).

### Tablero
14 KPIs + tablas Planificación por residente (semáforo % urgentes: verde <25%,
amarillo <50%, rojo ≥50%) y Resumen por proyecto. CSV: 27 columnas, BOM UTF-8.
Indicador estrella (fase 2): **costo del desorden** = (uso incorrecto × valor)
+ (compras urgentes × sobreprecio) + (saldos incompletos × días parados).

## Fórmulas de días
- Llegó en = fechaEntrega − fechaRQ
- Holgura = fechaNecesitada − fechaEntrega (negativa = llegó tarde, en rojo)
- Saldo en = fechaEntregaSaldo − fechaEntrega

## Decisiones del dueño que cambian el diseño
- **Gerencia mira, no registra.** La suplencia por vacaciones se resuelve
  post-piloto (cuentas de emergencia).
- **El sistema NO manda notificaciones.** Solo avisa a quien ya está mirando:
  cada pestaña lleva el número de lo que le toca a ESA persona, en rojo si
  alguien está parado esperando. Lo suple una rutina: Lucía abre el sistema a
  primera hora y tras almuerzo; lo urgente va por WhatsApp **con el número de
  RQ, no con el PDF**.
- **El flete: Lucía registra, Frank paga** en efectivo y lo rinde. La
  diferencia entre lo anunciado y lo pagado es control cruzado gratis.
  **Descartada una caja chica aparte para flete**: el efectivo de Frank es un
  solo bolsillo o el arqueo se vuelve ficción.
- **Cajas y unidades** (aprobado, post-piloto): el stock vive SIEMPRE en
  unidades sueltas; el residente pedirá en UND o CAJA viendo la equivalencia;
  el sobrante se queda en el almacén de la obra.
- **Los enchapes van en M²**, unidad fija. OJO: hoy se crean en la familia 97,
  que en el catálogo real es ACTIVOS FIJOS; el sitio correcto es la 24
  (CERÁMICA Y PORCELANATO). Decisión pendiente — ver ESTADO.md.
- **SUNAT / SIRE**: el sistema ya guarda casi todo el Registro de Compras.
  **No tocar hasta terminar el piloto**; el detalle en ESTADO.md y docs/09-10.
  **El valorizado del almacén sale CON IGV** y así está rotulado.

## Decisiones tomadas (NO reabrir)
- ERP solo después de definir procesos. Este sistema ES la definición del
  proceso de compras.
- Almacén de excedentes → se convierte en Almacén Central de Tránsito
  (post-piloto; el diseño, en ESTADO.md).
- Logística centralizada en Arana.
- Tres canales de RQ — **URGENTE / GENERAL / ANTICIPADO** — derivados por el
  sistema de la fecha necesitada, nunca declarados por el navegador.
- El piloto: dos obras (MAIA + DANAUS), 2 residentes, 2 semanas, alcance
  congelado.

## Dónde vive cada cosa, y por qué importa
Las reglas que protegen dinero e inventario viven en `supabase/migrations/`
(fuente de verdad, cada una con su porqué), no en la pantalla. La pantalla
facilita y avisa; **la base exige**. Cada vez que se descubre una regla que
solo vivía en el navegador se baja a la base, porque el navegador corre en la
máquina del usuario y se puede esquivar. La aplicación está en `src/` (16
vistas en `src/vistas/`, lógica compartida en ocho módulos); las 62 pruebas en
`test/`; los documentos en `docs/`.

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
  reemplaza — y cuál es su definición VIVA.** Un `create or replace` con el
  nombre equivocado crea una función huérfana: la regla vieja sigue mandando y
  nada avisa. Y reescribir desde una versión vieja borra guardas: la migración
  72 se copió de la 38 cuando ya la habían mejorado la 45, la 46 y la 48, y
  esa tarde costó 20 hallazgos (reparados en la 75).
- **Cada migración se ataca antes de correrla.** Las que se dieron por buenas
  sin atacar traían fallos graves: la 60 bloqueaba la compra parcial de Frank
  con el efectivo ya gastado, la 61 declaraba cerrado un agujero que seguía
  abierto, la 65 afirmaba una validación que no existía.
- **Máximo dos migraciones por sesión, y cada una revisada contra las que
  tocan las mismas funciones** (regla del dueño, 30 ago). El 28 de agosto se
  corrieron ocho en un día y la revisión de la tarde encontró 20 fallos, la
  mayoría daño propio de esa mañana.
- **El trabajo se queda en la rama hasta estar 100% seguro de mergear a main**
  (regla del dueño, 30 ago): un push a main publica en producción al instante.
- **Leer `docs/ESTADO.md` antes de proponer o arreglar nada.** El estado ya no
  vive en este archivo, y actuar sin leerlo es re-arreglar lo arreglado — el
  30 ago casi pasa con el RQ fantasma. Al cerrar el día, actualizarlo.
- **No tocar la vista del residente sin avisar al dueño antes** (regla suya
  del 27 ago), aunque esté descongelada.
- **Pocos agentes.** Revisar uno mismo por defecto; los ataques masivos agotan
  la cuota y repiten hallazgos. Lo más valioso ha salido del dueño probando el
  sistema a mano.
- No agregar funciones fuera del alcance congelado sin aprobación explícita
  del dueño.
- Toda regla de negocio nueva debe probarse.
- Formato de moneda: S/ (soles peruanos). Fechas: es-PE.

## Los documentos
- `docs/ESTADO.md` — **lo abierto, el plan de lanzamiento, el backlog.** Se
  actualiza al cerrar cada día. Si tiene más de 7 días, desconfiar.
- `docs/13_por_que_cada_regla.md` — la historia de cada regla (migraciones
  49–77): qué fallo la parió. Leer antes de querer quitar una.
- `docs/08_donde_estamos_de_verdad.md` — la última revisión punto por punto
  contra el código (30 ago).
- `docs/05` qué hacer si falla · `docs/06` guion de pruebas A–F ·
  `docs/09`-`10` SIRE/SUNAT · `docs/12` indicadores para Compras.
- `supabase/verificar_datos_reales.sql` — el guardián: falla listando todo lo
  que falta para arrancar con dinero real.
- `prototipo/` — el HTML standalone original, solo referencia. Se compila con
  babel + tailwind v3 inline, sin CDNs (debe funcionar offline).
