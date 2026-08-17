# ¿Se puede generar hoy el TXT del RCE? Contraste campo por campo

## 1. El veredicto en una frase

**No, hoy no se puede generar** — el sistema tiene bien resuelto el lado comercial de la factura (a quién, cuánto, cómo se pagó) pero no tiene **ni una sola** de las columnas de impuestos que el archivo exige, y sobre todo no sabe a cuál de las cuatro razones sociales pertenece cada compra: **está hecho alrededor de un tercio del trabajo, y el tercio que falta es el que decide si el archivo existe o no.**

---

## 2. Tabla campo por campo

El archivo del RCE tiene 37 campos (más 39 campos libres). Fuente de la estructura: **Anexo N.° 11 de la Resolución de Superintendencia 000040-2022/SUNAT**, publicada el 24 de marzo de 2022, vigente desde el 1 de octubre de 2022.

| Campo que pide SUNAT | De dónde saldría hoy | Qué falta |
|---|---|---|
| **1. RUC de la empresa que compra** | **NO ESTÁ.** No existe en ninguna tabla. | El dato más crítico. Ver punto 4. |
| **2. Razón social de la empresa que compra** | **NO ESTÁ.** El único `razon_social` del sistema es el del proveedor. | Sale sola una vez exista el campo 1. |
| **3. Periodo (AAAAMM)** | **ESTÁ PERO SUCIO.** Se puede derivar de `facturas.fecha`. | Derivarlo asume que la factura se anota el mismo mes en que se emitió. Cuando llega tarde no es así. Hace falta un campo propio. |
| **4. CAR SUNAT** | **YA ESTÁ** (va vacío, SUNAT lo llena). | Nada. |
| **5. Fecha de emisión** | **YA ESTÁ.** `facturas.fecha`, congelada tras el registro. | Nada. Solo cambiar el formato a DD/MM/AAAA. |
| **6. Fecha de vencimiento o de pago del impuesto** | **NO ESTÁ.** Hoy se calcula en pantalla y no se guarda. | Solo obligatorio en luz, agua, teléfono e importaciones. Para una factura normal va vacío. |
| **7. Tipo de comprobante (01 factura, 03 boleta, 07 nota de crédito…)** | **NO ESTÁ.** Ojo: existe `facturas.tipo_doc`, pero sus valores son "Factura / Compromiso / Pendiente", que son estados internos nuestros, no códigos de SUNAT. | Campo nuevo con el catálogo de SUNAT (Tabla 11). Hoy el sistema no puede ni registrar una boleta. |
| **8. Serie** | **ESTÁ PERO SUCIO.** `facturas.serie` guarda serie y número **juntos** en un solo texto libre, sin ninguna validación. | Partirlo en dos. Y SUNAT valida el formato: si es electrónica la serie debe ser E001 o F+3 caracteres. |
| **9. Año de la declaración de aduanas** | **NO ESTÁ.** | Solo aplica si importan directo. |
| **10. Número del comprobante** | **ESTÁ PERO SUCIO.** Mismo problema que el 8. | Separarlo de la serie. |
| **11. Número final del rango** | No aplica. | Nada. |
| **12. Tipo de documento del proveedor (6 = RUC, 1 = DNI…)** | **ESTÁ PERO SUCIO.** El sistema asume RUC siempre: exige 11 dígitos por diseño. | Un campo. Y además hoy es **imposible** registrar una liquidación de compra (arena, hormigón, madera a un proveedor sin RUC), porque ahí el proveedor se identifica con DNI. |
| **13. Número de RUC del proveedor** | **YA ESTÁ.** | SUNAT valida el dígito verificador (módulo 11); nosotros solo contamos 11 dígitos. Detalle menor. |
| **14. Razón social del proveedor** | **YA ESTÁ.** Se guarda en mayúsculas. | El archivo no admite ñ ni tildes. Hay que limpiarlas al exportar. |
| **15. Base imponible — compras solo para operaciones gravadas** | **NO ESTÁ.** | Ver punto 3. Es el hueco grande. |
| **16. IGV de esas compras** | **NO ESTÁ.** | Ídem. |
| **17. Base imponible — compras de uso mixto (gravadas y no gravadas)** | **NO ESTÁ.** | Ídem. |
| **18. IGV de esas compras** | **NO ESTÁ.** | Ídem. |
| **19. Base imponible — compras sin derecho a crédito fiscal** | **NO ESTÁ.** | Ídem. |
| **20. IGV de esas compras** | **NO ESTÁ.** | Ídem. |
| **21. Valor de compras no gravadas (exoneradas + inafectas)** | **NO ESTÁ.** | Va 0.00 si no aplica, pero alguien tiene que decidirlo. |
| **22. ISC** | **NO ESTÁ.** | Casi siempre 0.00 (aparece en combustible). |
| **23. Impuesto a las bolsas de plástico (ICBPER)** | **NO ESTÁ.** | Obligatorio consignarlo, aunque sea 0.00, en facturas, boletas y tickets. |
| **24. Otros tributos y cargos fuera de la base** | **NO ESTÁ.** | Normalmente 0.00. |
| **25. Importe total del comprobante** | **YA ESTÁ.** `facturas.monto`, con IGV incluido, validado contra el desglose por ítem. | Nada. Es el único importe que hoy existe. |
| **26. Moneda (PEN, USD…)** | **NO ESTÁ.** Todo se asume en soles. | Un campo, con PEN por defecto. |
| **27. Tipo de cambio** | **NO ESTÁ.** | Solo si compran en dólares. |
| **28 a 32. Datos del comprobante que modifica una nota de crédito** | **NO ESTÁ.** Hoy la nota de crédito existe solo como *medio de pago*, con su serie metida en el campo de N.° de operación. | Modelar la nota de crédito como un documento propio: su fecha, su monto y a qué factura corrige. |
| **33. Clasificación del gasto (1 material, 2 activo fijo, 3 otros activos, 4 gastos varios, 5 otros)** | **NO ESTÁ**, pero es el más fácil: las 58 familias del catálogo dan casi todo el mapeo. Cemento y fierro = 1; un andamio o una mezcladora = 2. | Una columna en el catálogo de materiales. Solo obligatorio si la empresa facturó más de 1,500 UIT el año anterior. |
| **34 y 35. Contrato de consorcio y % de participación** | **NO ESTÁ.** | Solo si alguna obra se ejecuta en consorcio sin contabilidad propia. Preguntar a Yheyson. |
| **36. Beneficio Ley 31053 (editoriales)** | No aplica. | Va 0.00. |
| **37. CAR del comprobante a modificar** | **YA ESTÁ** (va vacío). | Nada. |
| **Formato del archivo** (campos separados por `|`, nombre del archivo `LE + RUC + AAAAMM + …`, montos negativos como `- #.##`) | **NO ESTÁ**, no hay ningún exportador. | Es trabajo de programación puro, la parte fácil. |

**Resumen del contraste:** de los campos que se llenan de verdad en una factura de compra local, **4 están limpios** (fecha de emisión, RUC del proveedor, razón social del proveedor, importe total), **4 están pero sucios** (serie, número, periodo, tipo de documento del proveedor) y **el resto hay que capturarlo**, empezando por el RUC de la empresa compradora.

---

## 3. Lo que falta, agrupado por esfuerzo

### A. Se arregla con una migración y un campo nuevo (días de trabajo)
- Moneda (por defecto PEN) y tipo de cambio.
- Tipo de comprobante en el código de SUNAT.
- Serie y número separados en dos columnas.
- Tipo de documento de identidad del proveedor.
- Clasificación del gasto, derivada de las familias del catálogo.
- Periodo tributario como campo propio.

Esto no cambia cómo trabaja nadie. Son columnas.

### B. Exige cambiar cómo se digita hoy (semanas, y toca a Lucía y a Frank)
- **Base imponible e IGV.** Hoy Lucía digita un solo número: el total. Para el RCE hay que digitar (o leer del PDF) la base y el IGV. No se puede calcular dividiendo entre 1.18: en cuanto haya un ítem exonerado, o el impuesto a las bolsas, la cuenta sale mal.
- **La nota de crédito como documento.** Hoy es un medio de pago. Hay que convertirla en un comprobante con su fecha, su monto en negativo y la factura que corrige.
- **Liquidaciones de compra.** Hoy son imposibles de registrar porque el sistema exige RUC de 11 dígitos. En Cusco, comprar arena o madera a alguien sin RUC es rutina.
- **Excluir del export lo que no es real.** Las series internas CRED-#### y PEND-#### que inventamos son útiles adentro, pero para SUNAT **no existen**. Si alguien exporta sin filtrarlas, el archivo lleva documentos inventados. Esto es grave y hay que blindarlo.

### C. Problema de fondo (no es programación, es una decisión de negocio)
- **El RUC de la empresa que compra.** Ver el punto 4.
- **Las tres columnas de base imponible.** No es un dato que se digita: es una **decisión contable** sobre a qué se destina cada compra. Y aquí hay un hallazgo importante: el **artículo 23 de la Ley del IGV** dice que en la primera venta de un inmueble por el constructor, **la transferencia del terreno es operación no gravada**. Traducción: una inmobiliaria que construye y vende departamentos tiene, por definición, operaciones no gravadas, y sus compras **no caen todas en la misma columna**. Quién decide eso es Yheyson, no el sistema. Lo bueno: SUNAT precisa (Informe 185-2008-SUNAT/2B0000) que el IGV de las compras destinadas exclusivamente a la construcción se deduce completo *si se contabilizan por separado* — y separar cada compra por obra, partida y destino es exactamente lo que el sistema ya hace sin habérselo propuesto.
- **El sistema nunca podrá ser la fuente única del RCE.** El registro se lleva por RUC y debe contener **todas** las compras de esa empresa: luz, agua, alquileres, honorarios, seguros, combustible, fletes, asesorías. El sistema solo conoce los materiales que pasaron por un RQ de obra. Aunque le pongamos los 37 campos, seguiría cubriendo una parte.

---

## 4. EL PUNTO CRÍTICO: el sistema no sabe de qué empresa es cada compra

**Lo comprobé directamente en el código, no lo estoy suponiendo.** Revisé las 56 migraciones y todo el código fuente: **no existe ninguna columna de empresa ni de RUC propio en ninguna tabla.** La factura se etiqueta por **obra** (2501, 2502…), no por razón social. Lo más parecido es la tabla de cuentas bancarias por obra, que dice desde qué cuenta se paga, no a qué RUC pertenece la compra.

**Qué implica:** el SIRE se presenta **por RUC**. Son cuatro razones sociales, cuatro registros de compras distintos, cuatro archivos distintos cada mes. Sin ese dato no hay forma de partir el export. No es que el archivo salga incompleto: es que **no se puede ni empezar**.

**Y hay una pregunta que solo usted puede responder, Joaquín, antes de que nadie escriba código:**

> ¿Cada obra pertenece siempre a una sola razón social, o una misma obra puede facturarse a veces por Gold y a veces por Majser?

- Si es **una obra = una empresa**, el arreglo es barato: se agrega la empresa a la tabla de obras y todas las facturas ya registradas quedan clasificadas solas.
- Si una obra puede facturarse por dos empresas, el campo tiene que ir en la factura, y **todas las facturas ya cargadas quedan sin ese dato** — habría que reconstruirlo mirando los PDF uno por uno.

Es la pregunta más barata y de mayor retorno de todo este tema.

---

## 5. Recomendación honesta: las dos opciones

### Opción A — Generar el TXT oficial del RCE

**Qué es:** el sistema produce el archivo y alguien lo sube a SUNAT reemplazando el registro oficial.

**El problema no es técnico, y esto es lo más importante que aprendí en toda la investigación:** desde el SIRE, **SUNAT ya arma sola la propuesta del registro de compras**. A partir del segundo día calendario de cada mes pone a disposición un archivo con todas las facturas electrónicas que los proveedores ya le declararon. Lo normal, y lo que casi seguro hace hoy Yheyson, es **aceptar esa propuesta** y complementarla con lo que falta (boletas, tickets, recibos por honorarios, importaciones). Aceptar la propuesta **no requiere subir ningún archivo**.

Generar un TXT de reemplazo es la vía más agresiva: se pisa el registro oficial y cualquier diferencia se la pelea usted con SUNAT. Además exige exactitud fiscal y carga responsabilidad legal. **Construir eso sin hablar antes con Yheyson es muy probablemente construir algo que nadie va a usar.**

### Opción B — Un archivo intermedio que Yheyson importe a su sistema

**Qué es:** el sistema exporta un Excel/CSV limpio con lo que él hoy re-digita a mano desde los PDF: empresa, proveedor, RUC, tipo y número de comprobante, fecha, base, IGV, total, moneda, obra, clasificación del gasto, y el número de RQ para rastrear.

**Por qué es mejor camino:** el riesgo legal se queda donde debe estar, en el contador; el sistema aporta lo que **SUNAT no tiene** —la obra de destino, la partida, la clasificación del gasto, y sobre todo el cruce contra lo que realmente entró a almacén—; y el beneficio es inmediato, no dentro de seis meses.

### Y una tercera vía que casi nadie ve

SUNAT permite subir el mismo formato del Anexo 11 **solo para comparar**, sin reemplazar nada: el sistema devuelve un reporte de diferencias entre lo que SUNAT tiene y lo que usted tiene. **Riesgo cero.** Ese cruce —"SUNAT dice que Gold compró 340 facturas este mes; el sistema dice que a obra llegaron 310"— es probablemente el uso más valioso de todo esto, y detecta facturas fantasma y compras que nadie registró.

### El camino más corto a algo útil

1. **Preguntar a Yheyson qué hace hoy.** Si ya acepta la propuesta de SUNAT, el generador de TXT no sirve de nada. Media hora de conversación ahorra meses.
2. **Resolver el dato de la empresa** (la pregunta del punto 4). Una migración.
3. **Agregar base imponible e IGV al registro de facturas.** Es el cambio que habilita todo lo demás.
4. **Exportar el archivo intermedio para Yheyson.** Ahí ya hay valor real.
5. El TXT oficial, después del piloto, y solo si él lo pide.

---

## 6. Cosas que hay que decir aunque incomoden

**Lo que no pude confirmar y cuesta dinero equivocarse:**

- **Desde cuándo están obligados al SIRE.** Las dos investigaciones dieron fechas distintas: una dice periodo **enero 2025** para no-PRICOS, la otra dice **julio 2025** citando la RS 000217-2025/SUNAT del 24 de junio de 2025. **No lo resolví.** Lo que sí es seguro es que las cuatro empresas ya deberían estar generando su RCE **hoy** (salvo que alguna sea principal contribuyente grande, que fue postergada a **octubre 2026** por la RS 000125-2026/SUNAT del 30 de junio de 2026). Que Yheyson confirme el cronograma por cada RUC.
- **Si el Anexo 11 cambió después de marzo de 2022.** Toda la estructura viene de la resolución original. SUNAT publica la versión viva en `cpe.sunat.gob.pe/estructura-de-archivos`. Es un chequeo de diez minutos que hay que hacer antes de programar una línea.
- **La codificación del archivo** (si acepta tildes y ñ, y si lleva fila de encabezado). No hay declaración oficial. Se resuelve descargando un archivo real del propio SIRE.

**Dos correcciones a lo que teníamos anotado en el proyecto:**

- **La detracción NO va en el archivo del RCE.** Lo teníamos apuntado como un hueco a llenar y no lo es: existe un campo de detracción, pero la propia norma dice que es referencial y que **no se considera para la construcción del archivo de texto**. Eso sí: la detracción sigue siendo condición para poder usar el crédito fiscal, y las obras de construcción están sujetas al SPOT. Guardarla sigue siendo buena idea; simplemente no es por el TXT.
- **El plazo para anotar una factura vieja va a cambiar.** Hoy siguen vigentes los 12 meses (artículo 2 de la Ley 29215, confirmado por SUNAT en el Informe 052-2018-SUNAT/7T0000). Pero el **Decreto Legislativo 1669, publicado el 28 de setiembre de 2024**, los elimina: la factura electrónica tendría que anotarse en el mes de su emisión. Está publicado pero **no vigente** — espera una resolución de SUNAT. *No pude confirmar en fuente oficial que siga sin salir.* Si sale, el sistema pasa de tener un año de holgura a tener que cerrar el mes.

**Un riesgo que está fuera del tema pero es plata de verdad:** desde el **1 de abril de 2022** (Decreto Legislativo 1529, publicado el 3 de marzo de 2022), toda obligación **de S/ 2,000 o US$ 500 en adelante** debe pagarse por medio bancario. Y la ley es explícita: pagarla en cuotas más chicas **no la salva**. Si Frank paga en efectivo desde caja chica una factura de S/ 3,000 en dos entregas de S/ 1,500, la operación sigue sin bancarizar — y la consecuencia es **doble**: se pierde el crédito fiscal del IGV **y** el gasto para el impuesto a la renta (artículo 8 del TUO de la Ley 28194). Sobre S/ 10,000 eso es cerca de la mitad del valor de la compra. Hoy el sistema deja registrar esa compra sin decir nada. **Una alerta en la pantalla de caja chica vale más, y cuesta mil veces menos, que todo el generador de TXT.**

---

# Veredicto del escéptico

# Auditoría escéptica del análisis del RCE

**Veredicto:** el análisis es honesto en lo grande (el diagnóstico "no se puede hoy" y el hallazgo del RUC comprador son correctos y los verifiqué), pero tiene **cuatro fallas materiales**: da por limpios campos que no lo son, subestima el esfuerzo donde toca datos ya existentes, omite el único plazo legal que vence este mes, y no menciona en ningún lugar que el sistema **no tiene historia**: la primera migración es del 17 de julio de 2026 y la obligación empezó en enero de 2025.

---

## 1. Afirmaciones normativas sin fuente oficial (verificadas por mí)

| Afirmación del análisis | Qué encontré |
|---|---|
| "Desde cuándo están obligados al SIRE. Las dos investigaciones dieron fechas distintas... **No lo resolví**" | **Resuelto en una página.** [cpe.sunat.gob.pe/node/139](https://cpe.sunat.gob.pe/node/139) lista el cronograma: **enero 2025** = contribuyentes NO designados PRICOS; **julio 2025** = PRICOS (después postergado a enero 2026 por la RS 000217-2025, a junio 2026 por la RS 000392-2025 y a **octubre 2026** por la RS 000125-2026). La fuente que decía "julio 2025 para no-PRICOS" confundió el tramo de los PRICOS con el general. La conclusión del análisis sobrevive, pero presentar esto como pregunta abierta es un error: es dato cerrado y de acceso público. |
| "El Anexo 11 tiene 37 campos... Fuente: **Anexo 11 de la RS 000040-2022**" | **Sobrevende el origen.** El propio material de investigación admite que el PDF oficial de SUNAT **no contiene las tablas**, y que el detalle campo por campo salió de una copia alojada por un estudio de abogados (`zyaabogados.com`). El texto público presenta la tabla como si viniera del anexo oficial. Peor: SUNAT publica la estructura viva en [cpe.sunat.gob.pe/estructura-de-archivos](https://cpe.sunat.gob.pe/estructura-de-archivos) como **"Estructura del Reemplazo RCE (7).xlsx"** — revisión 7, página modificada el 30 de mayo de 2025. Y el manual de la API ya va por la **v27** (el análisis cita la v24). Llamar a eso "un chequeo de diez minutos" es minimizarlo: **toda la tabla de 37 campos está construida sobre una línea base de 2022 mientras el artefacto vivo va por su séptima revisión.** |
| "D. Leg. 1669... *No pude confirmar en fuente oficial que siga sin salir*" | Correctamente marcado. Lo cerré parcialmente: [Grant Thornton Perú, 20 mayo 2026](https://www.grantthornton.pe/Perspectivas/articulos-2026/dl-1669-e-igv-esta-vigente--alerta-tributaria/) — *"no son exigibles actualmente, debido a que no se ha publicado la Resolución de Superintendencia que condiciona su vigencia"*. Sigue siendo fuente secundaria y ya tiene tres meses. Además el análisis omite dos matices del decreto: los comprobantes físicos tendrían **2 meses** y los sujetos a detracción **3 meses**, no solo "el mes de emisión". |
| "SUNAT permite subir el Anexo 11 solo para comparar... **Riesgo cero**" | **Confirmado y es lo mejor del análisis.** [cpe.sunat.gob.pe/node/160](https://cpe.sunat.gob.pe/node/160): el reporte de diferencias tiene *"carácter meramente ilustrativo y no forma parte del RCE"*. Objeción menor: "riesgo cero" es de más — se sube con la clave SOL del contribuyente y deja constancia de lo que la empresa dice tener. Bajo riesgo, no nulo. |
| "Una inmobiliaria que construye y vende departamentos tiene, **por definición**, operaciones no gravadas" | **Generaliza indebidamente.** El art. 23 de la Ley del IGV aplica a la *primera venta del inmueble por el constructor*. Una razón social que solo ejecuta obra por contrato para un tercero no tiene operaciones no gravadas por ese concepto. Son **cuatro** razones sociales y el análisis le aplica la conclusión a todas sin distinguir. Quién hace la venta y quién solo construye es exactamente el dato que nadie preguntó. |

---

## 2. Campos dados por resueltos que el sistema NO puede llenar

El análisis dice: *"4 están limpios (fecha de emisión, RUC del proveedor, razón social del proveedor, importe total)"*. **Tres de los cuatro no están limpios.**

- **Campo 14 (razón social del proveedor) — "YA ESTÁ".** Es texto libre tecleado por quien registra: `src/vistas/Compras.jsx:612-617` usa un `<datalist>` y muestra *"Proveedor nuevo: se agregará al maestro"*; el alta es `on conflict do nothing`. **Nunca se contrasta contra el padrón de SUNAT**, y como el alta ignora conflictos, **el primer error de tipeo queda congelado para siempre** en todas las facturas siguientes de ese proveedor. El RCE valida campo 14 contra el RUC. Esto es "sucio", no "limpio".

- **Campo 5 (fecha de emisión) — "YA ESTÁ. Nada."** El campo nace **con la fecha de hoy por defecto** (`Compras.jsx:639`) y recién se congela *después* de registrar (`supabase/migrations/20260810000029_factura_pendiente_y_anulacion.sql:176-184`). No hay validación de que sea la fecha del papel. Si Lucía registra tres días tarde y no la cambia, campo 5 sale mal — y campo 5 determina el **periodo** (campo 3). Es el campo con más consecuencia y el análisis lo declara terminado.

- **Campo 13 (RUC) — "SUNAT valida el dígito verificador; nosotros solo contamos 11 dígitos. *Detalle menor*."** No es menor. `ruc` es la **clave primaria** de `proveedores` con `check (ruc ~ '^\d{11}$')` (`20260717000001_esquema_inicial.sql:51`). Un RUC mal tecleado no se corrige: **crea un proveedor nuevo y permanente**, y la factura queda colgada de él. En el archivo, un RUC que falla módulo 11 es rechazo, y arreglarlo obliga a tocar una PK con facturas colgando.

- **Campo 33 (clasificación del gasto) — "el más fácil: las 58 familias dan casi todo el mapeo".** **Falso, y lo comprobé.** `materiales` es `(codigo, descripcion, und, familia, activo)` — `20260717000001_esquema_inicial.sql:37-44` — y `familias` es solo `(iu, nombre)` — `20260718000003_familias.sql:8-12`. **No hay ni un atributo de capitalizable / activo fijo.** Y la distinción 1 vs 2 no es un atributo del material: es una decisión contable (vida útil, umbral de materialidad, si se compró o se alquiló). El mismo andamio es "2" comprado e irrelevante alquilado. Además el propio documento se contradice: en la tabla dice "el más fácil" y en la nota dice "solo obligatorio si superó 1,500 UIT" — que con la UIT 2025 de S/ 5,350 son **S/ 8,025,000 de ingresos por razón social**, umbral que nadie verificó.

---

## 3. La estimación de esfuerzo: optimista donde más duele

El grupo A ("se arregla con una migración y un campo nuevo, días de trabajo") **incluye dos cosas que no son columnas**:

- **"Serie y número separados en dos columnas."** `facturas.serie` es texto libre sin validación de formato (`20260717000001_esquema_inicial.sql:142`), se **reutiliza** para series internas `CRED-####` y `PEND-####`, y está bajo `constraint uq_factura unique (serie, proveedor_ruc)` (línea 151). Partirlo exige: backfill sobre filas de producción cuyo formato **nadie garantiza**, reexpresar la restricción única sobre dos columnas, y no romper la ruta compromiso→factura que **sobrescribe `serie` in situ** (migración 29:136-169). Eso es una migración con riesgo de datos, no "una columna".

- **"Tipo de comprobante en el código de SUNAT."** Choca con la columna `tipo_doc` ya existente, que tiene CHECK (`'Factura'|'Compromiso'|'Pendiente'`, migración 14:11 y 29:20) y un trigger que la fija. Hay que tocar constraint y trigger, no agregar al lado.

**Lo que la estimación no cuenta en absoluto:**

1. **El costo permanente de captura.** Precia el cambio ("semanas, toca a Lucía y a Frank") pero nunca dice que a partir de ahí **cada factura, para siempre**, necesita base + IGV digitados y una decisión de destino del crédito fiscal. Es un impuesto permanente sobre el rendimiento de Lucía, en un equipo cuya regla de adopción es frágil ("RQ que no entra por el sistema, no se compra") y con el alcance **congelado** hasta terminar el piloto según el propio CLAUDE.md.
2. **Nadie ha verificado que producción coincida con el repo.** Existe `supabase/verificar_esquema.sql` justamente porque una migración ya falló a medias, y **falta el archivo de la migración 33** (la numeración salta de `...032` a `...034`). Todo el inventario de campos es del repositorio, no de la base real.
3. **La tolerancia de S/ 0.50** del cuadre (migración 5) es aceptable comercialmente e inaceptable en un registro tributario, donde base + IGV cuadra al céntimo. Se hereda sin querer si nadie lo dice.

---

## 4. Riesgo legal omitido — aquí está lo caro

El análisis dedica **una línea** a esto ("exige exactitud fiscal y carga responsabilidad legal"). Es lo más flojo del documento.

- **Quién firma.** El RCE se genera bajo la clave SOL del contribuyente. Responde el **representante legal de cada razón social**, no Lucía y no quien programó el exportador. En la práctica alguien va a pegar un archivo producido por el sistema dentro de una presentación hecha a nombre de otra persona. Eso hay que decirlo por su nombre antes de escribir el exportador.
- **Qué pasa si el archivo sale mal — con número.** El análisis nunca nombra la infracción. Son el **art. 175 num. 2** (llevar los registros sin observar la forma y condiciones) y el **num. 10** (no anotar dentro de plazo *o anotarlos por montos inferiores*), esta última sancionada con **0,6 % de los IN, con piso de 10 % de la UIT**. "Anotar por montos inferiores" es *exactamente* el modo de falla de un archivo generado con la base imponible mal calculada. Sobre S/ 8 millones de ingresos son ~S/ 48,000 **por razón social y por periodo**. Multiplicado por cuatro empresas.
- **La pérdida de crédito fiscal es un costo aparte de la multa.** Una compra mal clasificada entre las columnas 15 / 17 / 19 no solo se archiva mal: **cambia cuánto IGV se toma**. Si se toma de más, hay tributo omitido y art. 178 num. 1 (50 % del tributo omitido). El análisis no menciona el 178 en ningún lugar.

**Y el plazo que vence este mes.** SUNAT amplió la facultad discrecional de no sancionar los numerales 2 y 10 del art. 175 hasta el **31 de agosto de 2026** (RSNATI N.° 000032-2026-SUNAT/700000). **Faltan dos semanas.** Si alguna de las cuatro razones sociales viene arrastrando periodos sin generar el RCE desde enero de 2025, la ventana para regularizar sin multa se cierra este mes. La investigación cruda lo vio y lo marcó como no verificado; **el análisis final lo eliminó por completo**. Es la omisión más costosa del documento, y no es código: es una llamada a Yheyson hoy.

---

## 5. Lo que hundiría el proyecto y no aparece

**(a) El sistema no tiene historia. Esto solo no lo menciona nadie.**
La primera migración es `20260717000001_esquema_inicial.sql` — **17 de julio de 2026**. La facturación con proveedor y monto tiene **un mes de vida** y el piloto ni siquiera terminó. La obligación del RCE para estos RUC empezó en **enero de 2025**: son ~19 periodos ya declarados por otra vía, de los cuales el sistema **no tiene ni una fila**. Todo el análisis discute el formato como si los datos existieran. Consecuencia inmediata: el "cruce SUNAT vs sistema" que el propio documento llama *"probablemente el uso más valioso de todo esto"* **no se puede correr para ningún periodo anterior al piloto**, y en el mejor de los casos empieza a tener sentido recién dentro de varios meses.

**(b) CRED y PEND no son un problema de filtro de exportación — son un defecto de modelo.**
El análisis dice "excluir del export lo que no es real". Es mucho peor. Leí el trigger (`20260810000029_factura_pendiente_y_anulacion.sql:136-169`): en la conversión `Compromiso → Factura` y `Pendiente → Factura`, la lista de lo que **no** puede cambiar enumera `proveedor_ruc`, `monto`, `proyecto`, `registrado_por`... y **no incluye `fecha`**. Es decir:
  - `facturas.fecha` de un compromiso es **la fecha en que se creó el compromiso**, no la de emisión de la factura real que llega semanas después. Nada obliga a corregirla al convertir. Como campo 5 determina el periodo, **cada compromiso convertido corre el riesgo de caer en el periodo tributario equivocado.**
  - `monto` sí está congelado — así que si la factura real llega por un importe distinto al comprometido (rutina), **no hay forma de registrarlo**: el trigger lanza *"Al pagar solo se digita la serie real"*. Y `monto` es el campo 25.
  - La fila **muta de identidad**: la serie `CRED-####` se sobrescribe en su lugar y no queda rastro de que existió.

**(c) Una factura real que cubre dos obras hoy no se puede registrar.**
La migración 56 exige que todos los ítems sean de la misma obra que la factura, y la pantalla instruye *"pídele factura separada por obra"* (`Compras.jsx:376`). Si un proveedor emite **un** comprobante para dos obras — normal — `uq_factura (serie, proveedor_ruc)` impide partirlo en dos filas. Ese comprobante o no entra al sistema, o entra con una serie alterada. Para el RCE eso es un comprobante faltante o una serie inventada. El análisis presenta la factura multi-ítem como caso resuelto y no ve esto.

**(d) Anular no es lo mismo que dar de baja, y el sistema no distingue.**
La nota 2 del Anexo 11 excluye los comprobantes **dados de baja o revertidos por el emisor**. El `facturas.anulacion` del sistema registra otra cosa: "lo registré mal". Son dos hechos opuestos y hoy comparten un solo campo. Peor: anular **borra las líneas de `factura_items`** (migración 53:87). Si el periodo ya fue declarado, una anulación interna posterior **desincroniza en silencio** al sistema del registro presentado, y no existe ninguna marca de "declarado / periodo declarado" en ninguna tabla — el propio documento lo admite en su tabla de campos y nunca lo eleva a riesgo.

**(e) No hay bitácora de exportación.** Si el exportador corre dos veces con datos distintos, nadie puede decir cuál versión se presentó.

---

## Lo que está bien y no hay que tocar

- El hallazgo del **RUC comprador ausente** es correcto: lo verifiqué, `proyectos` es `(codigo, nombre, activo)` (`esquema_inicial.sql:12-16`) y no hay columna de empresa ni RUC propio en ninguna tabla. La pregunta "¿una obra = una empresa?" es la pregunta correcta y es la más barata.
- La recomendación de **hablar con Yheyson antes de escribir código** es correcta, y con lo del 31 de agosto ahora es urgente, no prudente.
- La vía de **comparar sin reemplazar** está confirmada en fuente oficial y es la mejor idea del documento.
- La **corrección sobre la detracción** (no va en el TXT) está bien sustentada y contradice correctamente el CLAUDE.md.
- La **alerta de bancarización en caja chica** es, como dice, el entregable de mejor retorno de todo el tema — y es el único que no depende de nada de esto.

Fuentes: [cpe.sunat.gob.pe/node/139](https://cpe.sunat.gob.pe/node/139) · [cpe.sunat.gob.pe/node/160](https://cpe.sunat.gob.pe/node/160) · [cpe.sunat.gob.pe/estructura-de-archivos](https://cpe.sunat.gob.pe/estructura-de-archivos) · [RS 000217-2025/SUNAT](https://www.sunat.gob.pe/legislacion/superin/2025/000217-2025.pdf) · [Grant Thornton, D. Leg. 1669 (20 may 2026)](https://www.grantthornton.pe/Perspectivas/articulos-2026/dl-1669-e-igv-esta-vigente--alerta-tributaria/) · [Quantum Consultores, discrecionalidad SIRE 2026](https://quantumconsultores.com/sire-2026-sunat-amplia-la-facultad-discrecional-pero-el-riesgo-de-contingencias-tributarias-sigue-vigente/) · [DS 301-2025-EF, UIT 2026](https://lpderecho.pe/valor-uit-2026-decreto-supremo-301-2025-ef/)