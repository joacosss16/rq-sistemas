# SIRE · Dónde estamos parados hoy

**17 de agosto de 2026.** Resumen para retomar esto más adelante sin volver a investigarlo todo.
El análisis completo está en `09_sire_rce_viabilidad.md`; esto es el destilado.

---

## LO PRIMERO, PORQUE TIENE FECHA Y NO ES CÓDIGO

La revisión encontró que SUNAT amplió hasta el **31 de agosto de 2026** la facultad de no
sancionar dos infracciones del artículo 175 (llevar el registro sin la forma debida, y no anotar
dentro de plazo). Si alguna de las cuatro razones sociales viene arrastrando periodos sin generar
el RCE **desde enero de 2025**, la ventana para regularizar sin multa se cierra este mes.

**Esto no lo resuelve el sistema y no espera al piloto: es una llamada a Yheyson.**
La cita es RSNATI N.° 000032-2026-SUNAT/700000, encontrada por la revisión y **no confirmada
por nosotros en fuente oficial** — que él la verifique antes de actuar.

Las tres preguntas para esa llamada:
1. ¿Las cuatro razones sociales están al día con el RCE? ¿Desde cuándo cada una?
2. ¿Cuál de las cuatro **vende** inmuebles y cuál solo **construye** por contrato? Cambia el
   tratamiento del IGV y decide si hay operaciones no gravadas. Nadie lo ha preguntado.
3. ¿Cómo lleva hoy el registro? Si ya tiene un sistema contable que lo genera, quizás lo útil
   no sea que nosotros generemos el archivo, sino darle los datos limpios para importar.

---

## LA RESPUESTA CORTA

**Hoy no se puede generar el archivo.** Está hecho alrededor de un tercio, y el tercio que
falta es el que decide si el archivo existe.

Hay **dos bloqueos de fondo**, y ninguno se arregla programando:

**1. El sistema no sabe de qué empresa es cada compra.** El SIRE se presenta por RUC de
contribuyente y ustedes tienen cuatro razones sociales. Hoy las facturas se guardan por **obra**,
no por empresa. Sin ese dato no hay forma de separar el archivo, y no es solo agregar una columna:
alguien tiene que decidir qué obra pertenece a qué empresa, y eso es información que está en la
cabeza de gerencia, no en el sistema.

**2. El sistema no tiene historia.** La primera migración es del **17 de julio de 2026**. La
facturación con proveedor y monto tiene un mes de vida y el piloto ni siquiera terminó. La
obligación empezó en enero de 2025: son unos 19 periodos ya declarados por otra vía de los que el
sistema no tiene ni una fila. Cualquier cruce contra lo que SUNAT ya tiene solo empieza a servir
de aquí en adelante.

---

## QUÉ TENEMOS Y QUÉ FALTA

El archivo del RCE tiene 37 campos. De los que se llenan de verdad en una compra local:

**Limpios de verdad: uno.** El importe total.

**Existen pero sucios: cinco.**
- La **fecha de emisión** nace con la fecha de hoy por defecto y nadie obliga a poner la del papel.
  Como esa fecha determina el periodo tributario, es el campo con más consecuencia de todos.
- La **serie y el número** van juntos en un solo texto libre; SUNAT los pide separados y valida
  el formato.
- La **razón social del proveedor** se teclea a mano y nunca se contrasta contra SUNAT. El primer
  error de tipeo queda congelado para siempre en todas las facturas de ese proveedor.
- El **RUC** se valida solo contando once dígitos. Uno mal tecleado crea un proveedor nuevo
  permanente, con su factura colgando.
- El **tipo de documento del proveedor** se asume siempre RUC. Hoy es imposible registrar una
  liquidación de compra — arena, hormigón o madera a alguien sin RUC, que en Cusco es rutina.

**No existen: todo el bloque de impuestos.** Base imponible e IGV, en sus tres variantes según a
qué se destina la compra. Hoy Lucía digita un solo número, el total. Y no se puede calcular
dividiendo entre 1.18: en cuanto hay un ítem exonerado o el impuesto a las bolsas, la cuenta sale
mal. Tampoco existen moneda, tipo de cambio, ni la nota de crédito como documento propio (hoy es
un medio de pago).

---

## LO QUE HAY QUE ARREGLAR IGUAL, HAYA SIRE O NO

La revisión destapó tres defectos que **no son del SIRE**: duelen hoy, en la operación normal.
Estos van a la lista de arreglos del sistema, no a la del proyecto tributario.

1. **Al convertir un compromiso en factura real, la fecha no se actualiza.** Queda la fecha en que
   se creó el compromiso, no la de la factura que llegó semanas después. Afecta el vencimiento y
   cualquier cálculo por fecha.
2. **Al convertir, el monto está congelado.** Si la factura real llega por un importe distinto al
   comprometido —que es rutina— **no hay forma de registrarlo**: el sistema responde "al pagar solo
   se digita la serie real". Es un callejón sin salida operativo.
3. **Una factura de un proveedor que cubre dos obras no se puede registrar.** La regla nueva exige
   que todos los ítems sean de la misma obra, y la numeración impide partirla en dos. La pantalla
   dice "pídele factura separada por obra", que no siempre es posible.

---

## SI ALGÚN DÍA SE HACE, EN QUÉ ORDEN

1. **Decidir la relación obra → empresa** con gerencia. Sin esto no hay nada que programar.
2. **Hablar con Yheyson** las tres preguntas de arriba, y sobre todo: ¿el objetivo es el archivo
   oficial, o un archivo intermedio que él importe a su sistema? La segunda opción le ahorra el
   trabajo igual y **no traslada responsabilidad legal al sistema**, que es lo que recomendamos.
3. **Bajar la especificación fresca.** La nuestra se construyó sobre una base de 2022 y el
   artefacto vivo de SUNAT va por su séptima revisión. Antes de escribir una línea, bajar la
   estructura vigente de `cpe.sunat.gob.pe/estructura-de-archivos`.
4. **Los campos fáciles** (moneda, tipo de comprobante, periodo propio, tipo de documento del
   proveedor). No cambian cómo trabaja nadie.
5. **Los campos que cambian la operación**: base imponible e IGV digitados en cada factura. Esto
   es un costo permanente sobre el tiempo de Lucía, todos los días, para siempre. Hay que decidirlo
   sabiendo eso.
6. **Blindar el exportador** contra dos trampas: las series internas `CRED-####` y `PEND-####` no
   existen para SUNAT y jamás deben salir en el archivo; y "anulado" en nuestro sistema significa
   "lo registré mal", que no es lo mismo que un comprobante dado de baja por el emisor.

---

## LO QUE NO DEBE HACERSE

**Generar el archivo oficial sin que Yheyson lo revise.** El RCE se presenta con la clave SOL del
contribuyente y responde el representante legal de cada empresa. Si el archivo sale con la base
imponible mal calculada, la infracción es "anotar por montos inferiores" y se sanciona sobre los
ingresos de la empresa — por razón social y por periodo. Y si el IGV tomado sale de más, hay
tributo omitido, que es otra multa aparte.

La forma segura de empezar, si algún día se quiere: SUNAT permite **subir un archivo solo para
comparar** contra lo que ella ya tiene, y ese reporte no forma parte del registro. Sirve para
detectar facturas que el proveedor declaró y nosotros no registramos — que es probablemente lo
más valioso de todo esto — sin presentar nada.

---

## EN UNA FRASE

El sistema guarda hoy más de lo que suele guardar un sistema que no fue hecho para esto, pero le
falta el bloque de impuestos entero y no sabe de qué empresa es cada compra. **El trabajo grande no
es programar el archivo: es decidir la relación obra-empresa y aceptar que cada factura pase a
necesitar dos números más.** Todo esto queda congelado hasta terminar el piloto, salvo la llamada
a Yheyson sobre el plazo de agosto, que no espera.
