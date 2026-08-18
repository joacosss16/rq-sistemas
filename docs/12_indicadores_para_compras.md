# Indicadores de Gerencia — propuesta para mejorar Compras

## 1 · La idea en una frase

Hoy el tablero mide **a la obra y al residente**; hay que darlo vuelta para que mida **la cadena de compra completa, tramo por tramo, y lo que todavía NO llegó** — porque el material que aún no llega es lo único que para una cuadrilla, y hoy es invisible.

Dos hallazgos que sostienen todo lo que sigue, ya verificados en el código:

- **De los siete momentos que el sistema sella en la vida de un ítem, la pantalla usa uno.** El sistema ya guarda cuándo se pidió, cuándo Lucía decidió, cuándo Frank compró, cuándo llegó a obra, cuándo se facturó y cuándo se pagó. El tablero solo muestra "llegó tarde", un número que suma cuatro etapas con cuatro responsables distintos y termina cayéndole al residente.
- **Los cuatro indicadores de cumplimiento solo miran lo que YA LLEGÓ.** Un ítem aprobado, con fecha vencida hace dos semanas, que no ha llegado, no aparece en ninguna caja. Y como no entra al denominador, **"Entrega a tiempo %" sube cuanto peor va lo peor.** El material que para la obra hoy no se ve y encima maquilla el número.

Corrección al diagnóstico de partida: sí existe **un** indicador de Compras ("Tiempo de respuesta", horas entre pedir y decidir). Está escondido en la vista de gerencia y **Lucía no lo ve**. Mide el tramo más corto y más barato de la cadena.

---

## 2 · EL COMPARATIVO QUE PEDISTE

### Cómo quedaría

Una barra por período. Cada barra son **todos los RQ que nacieron en ese período**, partida en tres colores:

```
Semana del 11 ago    ████████████░░░░▓▓     40 RQ generados
                     ATENDIDO 30 · EN CURSO 8 · CERRADO SIN MATERIAL 2

Debajo, una línea:   "Entraron 40 · se cerraron 37 → la cola creció en 3"
Y otra:              "Ítems rechazados: 12 de 310 decididos (3.9%)"
```

Las tres barras **siempre suman los generados**. Nunca vas a sumar y que no dé.

Y al costado, la misma barra repetida chiquita **por obra**, para ver de un vistazo cuál obra es el problema sin hacer un clic.

### Las definiciones, defendidas

**COMPLETADO = todos los ítems cerrados y al menos uno llegó a obra.** No cuenta como completado el que está "comprado sin llegar" ni el "incompleto": en los dos casos **el residente sigue sin poder trabajar**, y si el verde se prende ahí, el tablero se ve mejor justo en el escenario más caro. Ojo: Compras hoy cierra un ítem cuando está *pagado*; esa regla sirve para que a Lucía no le estorbe la pantalla, pero como definición de "completado" mentiría a favor de Compras en el indicador que mide a Compras.

**RECHAZADO se cuenta por ítem, no por RQ.** Un RQ con 10 líneas y 1 rechazada no es un RQ rechazado. Por eso el rechazo va como renglón aparte y no como cuarta barra: si lo pusiéramos al lado de "generados", se leería "40 generados, 12 rechazados" como si se hubieran caído 12 RQ.

**El eje del tiempo: por mes (o semana) de nacimiento del RQ**, no por mes del suceso. Cada RQ pertenece para siempre al período en que se pidió, y los colores muestran dónde está hoy. Consecuencia que hay que decirte una vez: **las barras viejas cambian** cuando se cierran RQ atrasados, y **el período en curso siempre se ve inmaduro** — por eso va marcado con contorno punteado y la etiqueta "aún abierto". Durante el piloto (2 semanas) el gráfico va por **semanas**, o sería una sola barra.

### Lo que lo vuelve accionable (sin esto es decoración)

El "EN CURSO" no sirve como bulto. Se abre en cinco filas, **con la edad del más viejo**, y cada una tiene dueño:

| Dónde está parado | De quién es la pelota |
|---|---|
| Sin decidir · el más viejo lleva 9 días | Lucía |
| Aprobado y sin comprar · 12, el más viejo 6 d | Frank / Lucía |
| Comprado y sin llegar · 8, el más viejo 8 d | El proveedor |
| Llegó incompleto · 6 | El proveedor (saldo) |
| Esperando tu visto bueno de anulación · 2 | **Vos** |

Y **clic en cualquier color abre la lista** con N° de RQ, obra, residente y días abierto. La maquinaria de ese clic ya está construida en el reporte mensual.

### Qué decisión cambia

- **La cola crece período a período** → Compras no da abasto con 5 obras: entra apoyo, o se le quita el catálogo a Lucía, o se reparte por obra.
- **"El más viejo sin decidir: 9 días, RQ-087"** → una llamada hoy, con el número en la mano, no un discurso a fin de mes.
- **"Cerrado sin material > 0"** → un residente pidió y no recibió **nada**. Esa llamada la haces vos antes de que la haga él.
- **Una obra con "en curso" alto y las demás no** → el problema es esa obra, no Compras.

**Advertencia que hay que aplicar antes de dibujar nada:** las **cotizaciones de Lucía se están colando** en los conteos de ítems (el filtro está en unos indicadores y falta en otros) y además **nacen "Aprobado"** — o sea, el reporte mensual le acredita a Lucía aprobaciones que nunca hizo. Hay que excluirlas del comparativo y decirlo debajo del gráfico.

---

## 3 · QUÉ DEJARÍA

Cinco de los catorce. Se quedan porque alguien hace algo distinto al verlos:

- **Incompletos** — el mejor de los catorce. Es obra parada esperando un saldo.
- **Entrega a tiempo %** — pero **uno solo**: hoy "Llegaron tarde" y "Entrega a tiempo %" son el mismo número contado dos veces (el conteo y su complemento). Sobra uno, literalmente. Y se queda **solo si se corrige el sesgo** de que ignora lo que no llegó.
- **% Uso incorrecto** — pero **nunca sin el % de salidas verificadas al lado**. Un 0% sobre el 15% de salidas revisadas no es un 0%, es un "no sabemos".
- **Facturado S/** — como magnitud de contexto, no como desempeño. Mide el tamaño de la obra.
- **Tiempo de respuesta de Compras** — se queda y **se saca de detrás de la vista de gerencia**: que Lucía vea su propio número. Un indicador que solo ve el jefe se discute una vez al mes; uno que ve la persona medida se corrige el mismo día. Condición: **se muestra siempre junto al % de rechazo y al sobrecosto**. Existe un botón de "aprobar todo el RQ de un clic": meta de horas + ese botón = aprobación sin mirar, y la etapa que protege el dinero se vuelve teatro.

Y de **Auditoría no muevo nada**: mide a Pagos y a caja chica, y ese reparto está bien. La única pieza que le sobra es "sin conciliar 14+ días", que hoy escupe una línea roja por factura; su versión útil es un solo número en el tablero ("X facturas por S/ Y llevan más de 14 días").

---

## 4 · QUÉ AUMENTARÍA

Ordenado por lo que más mejora Compras. **(GRATIS)** = el dato ya está guardado en la base y nadie lo mira.

### 1. Vencidos sin llegar — obra parada AHORA **(GRATIS)**
- **Pregunta:** ¿hay cuadrilla parada hoy esperando material?
- **Dato:** ítems aprobados, con fecha necesitada ya vencida, que no llegaron. Es una resta contra la fecha de hoy. Existe todo.
- **Decide:** hoy mismo — llamar al proveedor, pedir préstamo a la obra que sí lo tiene en stock (el sistema ya calcula el stock por obra), o avisar al residente para que mueva la cuadrilla a otro frente.
- Es lo más caro de todo: un día de cuadrilla parada cuesta más que cualquier ahorro de negociación del mes. Y es el único que no admite reporte mensual: se contesta hoy o no sirve.

### 2. La cascada: en qué tramo se atasca la compra **(GRATIS)**
- **Pregunta:** cuando llega tarde, ¿tardó Lucía en decidir, tardó la calle en comprar, o tardó el proveedor?
- **Dato:** los cuatro sellos ya están en la base. Se parte en: anticipación que dio el residente · decidir (Lucía) · salir a comprar (Lucía/Frank) · conseguir (proveedor).
- **Decide:** es la única pregunta con tres acciones **distintas y excluyentes**. Si se atasca en decidir → umbral de aprobación automática por monto o delegar. Si se atasca en comprar → más días de calle o rutas por zona. Si se atasca en el proveedor → se cambia. Hoy los tres casos se ven idénticos ("llegó tarde") y la respuesta posible es "hay que mejorar", que no es una decisión.
- Es el mejor valor por esfuerzo de toda la lista.

### 3. Compras regularizadas — ¿se está comprando por fuera? **(GRATIS)**
- **Pregunta:** ¿se cumple "RQ que no entra por el sistema, no se compra"?
- **Dato:** facturas con fecha **anterior** a la decisión del ítem. Es la huella de la compra hecha por WhatsApp y metida al sistema después. Nada lo impide hoy y nadie lo mira.
- **Decide:** si el número no baja mes a mes, apretás con nombres y casos concretos. **Sin esto, ningún otro número del tablero es confiable**: mide si el sistema ve la realidad completa.

### 4. Plazo real de entrega por proveedor **(GRATIS, con una salvedad)**
- **Pregunta:** ¿quién entrega rápido y quién no?
- **Dato:** días entre comprar y recibir, agrupado por RUC del proveedor. El sistema ya sabe qué proveedor trajo cada ítem. **Salvedad honesta:** solo cubre lo ya facturado, y hoy "Comprado" se marca tanto al pedir como al recoger, así que el plazo mide cosas distintas según el caso.
- **Decide:** a quién se le compra lo urgente. Y al revés: al que entrega en 24 h se le justifica pagarle 3% más cuando la obra está apurada.
- **Dato que faltaría (barato):** un campo "fecha prometida" al marcar Comprado — lo digita Frank o Lucía, tres segundos. Sin él el indicador compara proveedores entre sí; con él **sirve para reclamar**.

### 5. Sobrecosto contra el mejor precio reciente **(GRATIS — el dato ya está calculado y sin usar)**
- **Pregunta:** ¿el mismo material nos cuesta distinto según quién o cuándo compra?
- **Dato:** el sistema ya calcula el mejor precio de los últimos 2 meses por material y **no lo usa en ningún indicador**. Falta sumarlo: (precio pagado − mejor precio) × cantidad, en soles.
- **Decide:** qué tres materiales renegocia Lucía este mes, con el número en la mano. Y si el sobrecosto se concentra en una persona o un día, es problema de proceso, no de precios.

### 6. Papeleo: días entre comprar y facturar **(GRATIS)**
- **Pregunta:** ¿cuánto tarda la factura en entrar al sistema?
- **Dato:** existe. Hoy solo salta como alerta individual a las 48 h y **desaparece al facturar**: nunca queda tendencia.
- **Decide:** si sube, se le pasa el registro de facturas a otra persona o se exige la factura en el acto.

### 7. Motivos de rechazo agrupados
- **Pregunta:** ¿la aprobación de Compras filtra algo, o solo agrega demora?
- **Dato:** el motivo se guarda, pero es **texto libre**: se puede leer uno por uno, no agrupar. **Dato nuevo que haría falta:** convertirlo en lista cerrada (ya hay stock / duplicado / código errado / no se consiguió / fuera de presupuesto / otro). Lo digita **Lucía en el mismo clic que ya hace**, cero trabajo extra.
- **Decide:** si aprueba el 98%, esa etapa no filtra nada y sí cuesta horas → se automatiza por debajo de cierto monto y ganás medio día en cada RQ. Si el 60% es "ya hay stock", el problema no es Compras: es que el residente no ve su almacén antes de pedir.

### 8. Cobertura del dato — el que valida a todos los demás **(GRATIS)**
- **Pregunta:** ¿me puedo creer los números de arriba?
- **Dato:** % de ítems recibidos sin fecha de compra. **No es teórico:** hoy el almacén puede recibir un ítem que nunca pasó por "Comprado", y ese ítem queda sin fecha de compra — la cascada y el plazo del proveedor son incalculables para él.
- **Decide:** si mirar los indicadores de tiempo o esperar. Es lo primero que hay que ver la primera semana del piloto.

---

## 5 · QUÉ QUITARÍA

**SOBRA** (conteo sin denominador ni umbral — nadie hace nada distinto al verlo): **RQs · Ítems · Entregados · Anulados · Préstamos activos**, y **uno de los dos** entre "Llegaron tarde" y "Entrega a tiempo %" (son el mismo número). Son seis de catorce cajas.

**ENGAÑA:**
- **Holgura promedio** — es un promedio con signo: un ítem 10 días adelantado cancela otro 10 días tarde y la obra muestra **0.0d, que se ve sano**. Y lo dominan los ANTICIPADOS, que nacen con holgura grande: **la obra que planifica con más anticipación parece mejor en entregas aunque su proveedor llegue igual de tarde.** Mide la mezcla de canales, no el cumplimiento.
- **Falta de pago más antiguo** — dice "falta de pago" pero cuenta días desde que **el residente pidió**, no desde que se emitió la factura. Una factura de ayer sobre un RQ de hace 60 días muestra 60d. Y **ignora por completo la deuda en crédito**. El cálculo correcto ya existe, enterrado como alerta en Auditoría.
- **% Uso incorrecto sin la cobertura al lado** — el denominador son solo las salidas verificadas. **Si el almacenero no verifica, el indicador mejora.** Premia no controlar.

**MIDE A LA PERSONA EQUIVOCADA:**
- **Holgura y "A tiempo" colgando del residente** (hoy están literalmente bajo el título "quién planifica y quién apaga incendios"). Ese número suma cuatro tramos con cuatro dueños y se lo cobra al residente. Se queda, pero **partido** (punto 4.2), no bajo su nombre.
- **"% Urgentes = mala planificación"** — el canal del RQ es el de su ítem más urgente. Un RQ con 39 líneas bien planificadas y 1 urgente cuenta **100% URGENTE**. Y es manipulable por granularidad: el que agrupa todo en un RQ semanal sale verde; el que pide suelto sale rojo, con la misma conducta. Además, el semáforo se pinta **sin mínimo de casos**: un residente con 1 solo RQ urgente sale 100% ROJO. Se arregla contando por ítem (el dato está) y exigiendo mínimo 5 RQ antes de pintar color.
- **Riesgo de fondo que hay que decir:** la fecha necesitada la escribe el residente, y esa fecha define el canal **y** la holgura **y** la entrega a tiempo. **La forma barata de salir en verde no es planificar mejor: es poner fechas más lejanas.** Mientras no haya contraste, ese semáforo no debe usarse para nada con consecuencias.

**Y algo que hay que arreglar aunque no sea indicador: la pantalla de historial de precios de Lucía está rota — revienta al abrir un material con compras.** Es justo la herramienta de negociación que el corazón de "mejorar compras" necesita, y hoy no abre.

---

## 6 · EL ORDEN

### AHORA (antes/durante el piloto — todo es leer datos que ya están, no cambia el trabajo de nadie)

1. **El comparativo que pediste**, por semana, apilado, con clic para abrir la lista y el desglose de "en curso" por dónde está parado. *(Lo pediste vos; va primero.)*
2. **Vencidos sin llegar** — corrige el sesgo del indicador que ya está publicado.
3. **La cascada de tramos** en la vista de gerencia.
4. **Compras regularizadas** (la regla de adopción).
5. **Cobertura del dato** — para saber si creerse 2, 3 y 4.
6. **Limpieza:** sacar los seis indicadores que sobran, borrar "Holgura promedio", arreglar "Falta de pago más antiguo", poner el % de salidas verificadas al lado del uso incorrecto, mínimo de 5 RQ para el semáforo.
7. **Cinco arreglos de datos que hoy dan números equivocados en pantalla:** las cotizaciones coladas en los conteos por obra; "préstamos activos" contado de dos maneras distintas en la misma pantalla; el historial de precios que revienta; el "teórico" de caja chica calculado con el modelo de fondo fijo que vos mismo derogaste; y un mes sin entregas que se dibuja como 0% (idéntico a un mes catastrófico).
8. **Sacar el tiempo de respuesta de Compras** de la vista exclusiva de gerencia.

De estos, los puntos **1, 2, 6 y 7** los defiendo sin discusión: uno lo pediste vos y los otros corrigen indicadores que ya están publicados y hoy dicen cosas que no son. Los puntos **3, 4, 5 y 8** son trabajo nuevo sobre alcance congelado: conviene que los apruebes uno por uno o esperen al cierre del piloto.

### DESPUÉS DEL PILOTO

- **Ranking de proveedores** + el campo "fecha prometida" (una migración chica, alto retorno).
- **Sobrecosto contra el mejor precio** y **sobreprecio de urgencia** — necesitan 2-3 meses de historia; con dos semanas casi todo será "primera compra".
- **Motivos de rechazo en lista cerrada** — toca un formulario que Lucía usa a diario.
- **Stock dormido** (material recibido que nunca salió) para decidir **no comprar** y transferir.
- **El "costo del desorden" completo.** Hoy se puede calcular en soles el uso incorrecto y el sobrecosto; falta el tercer sumando. **Y falta un solo dato para encenderlo entero: cuánto cuesta un día de cuadrilla parada, por obra.** Lo escribís vos una vez, no se toca más, y convierte los días de espera en soles. Es el dato de mayor apalancamiento de todo este análisis. Publicarlo antes, con dos semanas de datos, y que después se desmienta, quema el indicador para siempre.

---

*Archivos revisados: `C:\Users\camar\OneDrive\Escritorio\rq-sistema-proyecto\src\vistas\Tablero.jsx`, `...\src\vistas\ReporteMensual.jsx`, `...\src\vistas\Auditoria.jsx`, `...\src\vistas\Compras.jsx`, `...\src\vistas\HistorialPrecios.jsx`, `...\src\App.jsx`, `...\src\pago.js`, `...\src\caja.js` y las migraciones 15, 22, 23, 25, 38, 41, 49 y 57. Ningún archivo fue modificado.*

---

# Veredicto del escéptico

## Veredicto

La propuesta es sólida en el diagnóstico y casi todos sus hallazgos verificados lo son de verdad. Pero tiene **un error de hecho que invalida una de sus recomendaciones**, **cinco indicadores que no son "GRATIS" como dice**, y **no vio dos maquillajes que ya están activos hoy en producción**.

---

## 1 · Lo que comprobé y ES CIERTO (no lo discuto más)

| Afirmación | Dónde |
|---|---|
| Holgura promedio se cancela con signo | `Tablero.jsx:52-53` |
| "Entrega a tiempo" solo mira lo que llegó → mejora si algo nunca llega | `Tablero.jsx:52,54` (denominador = `holguras.length`) |
| "Falta pago más antiguo" cuenta desde `fechaRQ` y **excluye el crédito** | `Tablero.jsx:58-59` |
| Cotizaciones coladas: `rqsF` filtra `tipo==='RQ'`, `flatAll` y `porProyecto` **no** | `Tablero.jsx:41` vs `:42` y `:71` |
| Préstamos activos contados de dos formas en la misma pantalla | `Tablero.jsx:50` (origen **o** destino) vs `:82` (solo origen) |
| Historial de precios **revienta** | `HistorialPrecios.jsx:12` importa solo `HOY_ISO`; usa `fmt` en `:136` y `:154` → ReferenceError al elegir un material con compras |
| Mes sin entregas = 0%, igual que un mes catastrófico | `ReporteMensual.jsx:84` |
| "Teórico" de caja con el modelo de fondo fijo derogado | `ReporteMensual.jsx:165` (`r.montoFondo - rendido`) ignora `cuadreCaja()` de `caja.js:29-57`. **Acotación**: solo afecta esa columna del desglose; la `diferencia` que suman los indicadores viene de la base |
| Compras cierra con `estado === 'Comprado'` (sin recibir) | `Compras.jsx:54-55` |
| `mejorPrecio2m` se calcula y solo se pinta | `App.jsx:292-297`; se usa en `Compras.jsx:343,471` y en ningún indicador |
| Tiempo de respuesta escondido tras `esGerencia` | `Tablero.jsx:89,207` |
| "Aprobar todo el RQ" existe (riesgo real si se pone meta de horas) | `Compras.jsx:494` |
| Nada detecta hoy un ítem aprobado con fecha necesitada vencida sin llegar | grep de `vencid/atrasad` en `src/`: solo caducidad, facturas y entregas |

---

## 2 · Donde la propuesta SE EQUIVOCA

**(a) "Contar el % urgentes por ítem lo arregla" — hoy no cambia absolutamente nada, y el ejemplo está invertido.**
`App.jsx:572`: `fecha_necesitada: cab.fecha` — **una sola fecha para todas las líneas del RQ**. `Residente.jsx:63,220` tiene un único campo en la cabecera, y ninguna pantalla actualiza `fecha_necesitada` después (grep completo). El canal sale solo de `fecha_rq` vs `fecha_necesitada` (`esquema_inicial.sql:298-303`). Conclusión: **todos los ítems de un RQ tienen el mismo canal**; contar por ítem da el mismo porcentaje, solo repesado por número de líneas. El caso "39 líneas bien planificadas y 1 urgente" **no existe hoy** — es el "RQ mixto multi-canal" que CLAUDE.md lista como caso pendiente.
Y la manipulación por granularidad va **al revés**: agrupar todo en un RQ semanal arrastra las 40 líneas a la fecha más temprana → 100% URGENTE. Quien parte el urgente en su propio RQ **diluye** el porcentaje. El indicador hoy premia fragmentar, no agrupar.

**(b) "Llegaron tarde y Entrega a tiempo son el mismo número, sobra uno literalmente" — no.**
`tarde` es un conteo (`:47`), `aTiempo` un % sobre `holguras.length` (`:54`), y ese denominador **no está en ninguna caja**: "Ítems" son todos y "Entregados" solo `estado==='Entregado'` (excluye los Incompleto que sí tienen fecha de entrega). Borrar el conteo pierde información. Son redundantes en dirección, no en contenido.

**(c) "Comprado y sin llegar → la pelota es del proveedor" — dueño equivocado en el caso más común.**
Un ítem pagado en estado 'Comprado' sale de la bandeja de Compras (`Compras.jsx:54-55,98-101`) pero queda **para siempre** en la del almacén (`Almacen.jsx:28` filtra `decision==='Aprobado' && estado!=='Entregado'`), sin plazo ni alerta. Esa cola se va a llenar de recepciones que el almacenero no registró, no de proveedores morosos. Necesita fila propia: *"comprado y pagado, sin recepción registrada — es del almacenero"*.

**(d) La "fecha prometida" que pide capturar YA EXISTE en el esquema, muerta.**
Migración 23 creó `public.cotizaciones` con `proveedor, ruc, precio_unitario, **plazo_dias**, ganadora`. `grep -rn "cotizaciones|plazo_dias|ganadora" src/` → **cero lecturas y cero escrituras**. Proponer una migración nueva para el mismo dato deja dos caminos a medio construir. La pregunta previa es por qué se abandonó el que ya está.

**(e) El sobrecosto contra el mejor precio NO es "gratis": falta la unidad.**
`historialPrecios` (`App.jsx:275-280`) guarda precio, cant, fecha, serie, proyecto, ruc — **no guarda `und`**, justo el campo que la migración 59 acaba de congelar en cada línea *porque el catálogo lo cambia*. El pendiente de Lucía (CLAUDE.md) es cargar las equivalencias caja→unidad de ~29 materiales. El día que las cargue, las compras viejas quedan en CAJA y las nuevas en UND: un indicador de "pagado − mejor precio" leería **~9,900% de sobreprecio** en el primer material que cambie (el propio ejemplo de la migración 59 es 1 caja = 100 unidades). `mejorPrecio2m` tiene el mismo hueco y ya se está pintando en Compras. Antes de sumar soles: meter `und` en el historial y comparar solo dentro de la misma unidad.

**(f) La cascada tiene dos tramos que no son restas limpias.**
- `fecha_compra` es un **DATE** con `current_date` (migración 23, líneas 15-28; corregida por la 41). El tramo "salir a comprar" mide en días enteros y da **0 en todo lo que se compra el mismo día** — o sea, es ciego justo en los URGENTES.
- Los saldos de compra parcial **heredan `decidido_en` del ítem original** (migración 49, líneas 108-116) con `creado_en` de hoy → su tramo "decidir" es **negativo**. El tablero ya los descarta en silencio (`Tablero.jsx:96`, `horas >= 0`) y el contador `sinSello` (`:105`) tampoco los ve porque sí tienen `decidido_en`. La cascada debe excluirlos explícitamente o mostrará tramos negativos.

**(g) Los motivos de rechazo ya nacen contaminados; la lista cerrada no lo arregla.**
`compra_parcial()` inserta el saldo con `decision='Rechazado'` y `motivo_rechazo = p_motivo` cuando Compras cierra el saldo (migración 49, líneas 114-115). Eso no es Lucía filtrando un pedido: es *"el proveedor solo tenía 8"*. Hoy entra al KPI "Rechazados" (`Tablero.jsx:125`), a la columna por residente (`:66`) y al bloque mensual de Compras (`ReporteMensual.jsx:119`). En el comparativo propuesto entraría al renglón "12 de 310 rechazados" como si el residente hubiera pedido mal.

**(h) "Compras regularizadas": control razonable, no prueba.** La fecha de la factura la digita quien registra (`App.jsx:582-590`); `decidido_en` sí lo sella el servidor (migración 25). Pero es DATE vs TIMESTAMP: **comprar y aprobar el mismo día es invisible**, y la evasión es escribir otra fecha de emisión. Preséntalo como "casos a revisar", nunca como "N compras por fuera".

---

## 3 · Maquillajes que la propuesta NO vio (los dos ya están activos)

**1. Las cotizaciones inflan a Compras en el único indicador de Compras que existe.**
Migración 57: las líneas de un pedido por cotización nacen con `decidido_por := auth.uid()` y `decidido_en := now()` **en el mismo INSERT**. Ese `auth.uid()` es Lucía, que es quien crea esos pedidos (`App.jsx:749-768`). Efecto: cada línea de cotización aporta una decisión de **~0 horas** al "Tiempo de respuesta de Compras", que se calcula sobre `flat` — y `flat` **no filtra `tipo`** (`Tablero.jsx:42-43,94`). Cuantas más cotizaciones registre, mejor sale su tiempo de respuesta. Lo mismo con "Ítems aprobados" de su bloque mensual (`ReporteMensual.jsx:118` sobre `itemsM`, `:62-64,93`, tampoco filtra tipo).

**2. La fecha de entrega es la fecha en que el almacenero TECLEÓ, no en que llegó el camión.**
`App.jsx:703-704` escribe `fecha_entrega = HOY_ISO`. La migración 34 (líneas 100-114) cerró la reescritura posterior — su propio comentario dice *"quien recibe podría maquillar los indicadores"* — pero **no cerró la demora**: material que llega el lunes y se registra el jueves figura entregado el jueves. Eso contamina holgura, "llegó tarde", "entrega a tiempo" y el último tramo de la cascada propuesta. Y el almacenero es la única persona de la cadena que **no aparece en ninguno de los 14 KPI**: todo ese ruido cae sobre el proveedor y sobre Compras.

**3. La fecha necesitada pasa a tirar de dos indicadores en direcciones opuestas.**
La escribe el residente (`Residente.jsx:220`) y ya define canal y holgura. Si se agrega "vencidos sin llegar", **alejar la fecha le conviene a él** (menos % urgentes) y **acercarla le conviene contra Compras** (más rojo en la cola). En cuanto los dos números tengan consecuencia, ese campo deja de ser un dato de obra y pasa a ser una posición de negociación. Contraste posible sin dato nuevo: la fecha de la **primera salida de almacén** de ese material en esa obra (`salidas` tiene código, proyecto, fecha, hoja, zona) es un proxy de cuándo se necesitó de verdad.

---

## 4 · Mide a quien no controla

Además de lo que ya dice la propuesta:
- **El sesgo de atribución del bloque de Compras.** `ReporteMensual.jsx:93,117-126` atribuye las decisiones al **mes de nacimiento del RQ** (`delMes(i.fechaRQ, mes)`), no al mes en que se decidió. Un ítem pedido el 30 de julio y aprobado el 2 de agosto es trabajo de julio, y el número de julio **sigue cambiando en agosto**. Igual con "Ítems comprados por Frank" (`:191`). La propuesta hereda ese eje ("cada RQ pertenece para siempre al período en que se pidió") — correcto para el comparativo de generados/atendidos, **exactamente al revés para medir a Compras**: su carga semanal son las decisiones que tomó esa semana. Con dos ejes en la misma pantalla, ninguna suma va a cuadrar. Hay que rotular cuál usa cada bloque.

---

## 5 · "RQ completado": los casos que la rompen

- **RQ sin líneas.** `crearRq` (`App.jsx:566-576`) inserta cabecera y líneas en **dos llamadas sin transacción** (compárese con `registrarFactura`, `:584`, que sí usa un RPC atómico). Si falla la segunda, queda un RQ generado con 0 ítems: nunca atendido, nunca cerrado, **EN CURSO eterno**, sin caer en ninguna de las cinco filas del desglose. Y cuenta en el denominador del % urgentes con el canal **declarado por el navegador** (`App.jsx:361` devuelve `declarado` cuando no hay líneas).
- **La compra parcial cambia el número de ítems de un RQ después de cerrado** (migración 49:108-116, mismo `rq_id`). Un RQ ya "atendido" vuelve a "en curso" días después, y el mismo material cuenta dos veces en el total de ítems y en el denominador del % de rechazo.
- **La recepción se puede deshacer** (migración 35, líneas 74-75): corregir la cantidad a cero devuelve el ítem a 'Comprado' y borra `fecha_entrega`. Las barras viejas no solo se completan hacia adelante: también **retroceden**.
- **Pagado y nunca recibido** (caso 2c): EN CURSO indefinido por trámite de almacén, no por material faltante.
- **Incompleto sin fin.** Un RQ de un ítem con 8 de 10 recibidos no es completado (correcto), no es "cerrado sin material", y si el saldo nunca llega y nadie lo anula no tiene término. Necesita edad y dueño como las demás filas.

---

## 6 · Muestra del piloto (1 obra, 2 residentes, 2 semanas)

**Estadísticamente inútiles, y encima con semáforo de colores:**
- Plazo/ranking por proveedor: 255 proveedores en el maestro; casi todos con **n=1**.
- Sobrecosto vs mejor precio: `App.jsx:294` filtra `fecha >= hace2meses` → casi todo será primera compra y `mejorPrecio2m` ni existirá.
- % uso incorrecto: denominador = salidas verificadas (`Tablero.jsx:56-57`); con 5-10 verificadas, **un caso mueve 10-20 puntos**.
- Motivos de rechazo agrupados: si Lucía aprueba casi todo, serán 3 o 4 rechazos (y contaminados, ver 2g).
- Plazo promedio de pago (`ReporteMensual.jsx:151-155`).

**El mínimo de 5 RQ que propone la propuesta es demasiado bajo:** con 10 RQ un urgente extra mueve 10 puntos y cruza umbral. Durante el piloto: **no pintar color con n < 10**, y mostrar siempre numerador y denominador ("2 de 7"), nunca el porcentaje solo.

**Sí sobreviven a 2 semanas** (son conteos y colas, no proporciones): el comparativo generado/en curso/atendido, vencidos sin llegar, edad del más viejo por tramo, incompletos, compras regularizadas (un caso ya es accionable), cobertura del dato.

---

## 7 · Lo que propone y ya existe en otro sitio

- **"Falta de pago más antiguo" corregido: ya está construido entero.** `ReporteMensual.jsx:437-442` ("Facturas pendientes" y "Deuda pendiente") **sí incluye el crédito**, ordena de la más antigua y muestra "días esperando"; y la versión con vencimiento real (crédito 15/30 días) está en `Auditoria.jsx:130-133` usando `vencimientoDe` de `pago.js:23`. No hay que construir nada: borrar el KPI del tablero y traer el que funciona.
- **"Días entre comprar y facturar":** el disparo ya existe como chip `sinFactura48` (`Compras.jsx:69`). Falta solo la serie temporal.
- **"Fecha prometida":** `cotizaciones.plazo_dias`, migración 23, sin uso.
- **El comparativo mensual, a medias:** `BarrasMes` ya dibuja RQs por mes y entregados por mes con 6 meses de serie (`ReporteMensual.jsx:294-297`); lo nuevo es apilar los tres estados. La maquinaria del clic también existe (`abrir`, `:202`).
- **Valorización del uso incorrecto** (primer sumando del "costo del desorden"): `precioProm` (`App.jsx:252-253`) ya valoriza stock en el cierre de almacén (`Auditoria.jsx:31-34`). Sin dato nuevo.

---

## 8 · Qué cambiaría del orden propuesto

- **Sube a AHORA:** el punto 7 (arreglos de datos) va **antes** que el punto 1. Publicar el comparativo sobre `flat` sin filtrar `tipo` repite el mismo error que la propuesta denuncia.
- **Baja de "GRATIS" a "necesita migración":** sobrecosto vs mejor precio (falta `und` en el historial) y plazo por proveedor (falta separar "comprado = pedido" de "comprado = recogido"; hoy `estado='Comprado'` es lo mismo para ambos, migración 15).
- **Se cae:** "% urgentes por ítem" — no arregla nada hoy (2a). Lo que sí aplica ya es el mínimo de casos antes de pintar color.
- **Se agrega a AHORA, es de una línea:** rotular el eje temporal de cada bloque (2/§4), y una fila propia para "pagado sin recepción registrada" en el desglose de EN CURSO.

*Archivos leídos: `src/vistas/Tablero.jsx`, `src/vistas/ReporteMensual.jsx`, `src/vistas/Auditoria.jsx`, `src/vistas/Compras.jsx`, `src/vistas/HistorialPrecios.jsx`, `src/vistas/Almacen.jsx`, `src/vistas/Residente.jsx`, `src/vistas/PedidoCotizacion.jsx`, `src/App.jsx`, `src/pago.js`, `src/caja.js`, `src/fechas.js`, y las migraciones 1, 5, 15, 21, 23, 25, 34, 35, 41, 49, 57, 59. Ningún archivo fue modificado.*