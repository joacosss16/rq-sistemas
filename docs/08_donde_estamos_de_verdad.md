# Donde estamos de verdad
**16 de agosto de 2026 · revisión punto por punto contra el código, no contra las notas**

El sistema está mucho más terminado de lo que decían las notas —casi todos los controles de firma y aprobación que figuraban como abiertos están cerrados hace días—, pero quedan cinco cosas que parecen hechas y no lo están, y una que va a fallar casi todas las tardes: después de las 19:00 la base cree que ya es el día siguiente.

---

## 1. LO QUE YA ESTÁ HECHO Y FUNCIONA

Las marcas **⚠️ YA ESTABA** son puntos que se le dieron como pendientes y en realidad estaban construidos. Son el error que motivó esta revisión.

**El dinero**
- Pagos registra en pantalla las entregas de efectivo a Frank, con banco y N° de operación. **⚠️ YA ESTABA.**
- La entrega no admite fecha futura ni un día ya cerrado; con fecha atrasada exige motivo y salta una alerta en Auditoría.
- El cuadre del día usa la fórmula nueva: *debe quedar = lo entregado − lo gastado*, sin contar anuladas. Con 17 pruebas automáticas.
- El arqueo de Mónica **es** la confirmación de que Frank devolvió el vuelto. No falta ningún paso de Pagos. **⚠️ YA ESTABA.**
- Las facturas anuladas ya no inflan el efectivo en los sitios que movían plata.

**Las compras y las facturas**
- Anular una factura ya no saltea los controles, y una factura no puede nacer anulada.
- Ya no se puede colgar un ítem de una obra a la factura de otra obra ni a una factura anulada (era el camino para dar por pagado un material sin que saliera un sol).
- El mensaje de "serie repetida" dice el número exacto, y al digitar el RUC avisa si ese proveedor ya tiene compromisos abiertos en esa obra.
- La firma de quién pagó la pone el servidor: nadie puede pagar con el nombre de otro.

**El almacén y el residente**
- Corregir una cantidad mal digitada en recepción: existe, lo hace el almacenero desde su pantalla, dentro de 7 días, con rastro (de → a, motivo, quién, cuándo) que **nadie** puede borrar, ni gerencia. **⚠️ YA ESTABA.**
- Las salidas nacen Pendientes y las aprueba el residente. El almacenero no puede aprobarse las suyas ni firmar con el nombre del residente. **⚠️ Las notas decían que esto seguía abierto: no lo está.**
- Los préstamos entre obras necesitan las dos firmas, y ninguna persona puede poner las dos. **⚠️ Ídem.**
- No se puede recibir más de lo pedido (bloqueado en tres capas, incluso por fuera de la pantalla).
- Semáforo de caducidad (30 días / 7 días / vencido) visible en almacén, residente y compras.

**La seguridad**
- El almacenero ya no puede aprobarse material a sí mismo. **⚠️ Las notas lo llamaban "lo más grave que queda"; está cerrado desde el 12 de agosto.**
- Se cerró el permiso de borrar catálogo, proveedores, familias, cajas y proyectos.
- El texto que va a los PDF está saneado en 12 de 13 sitios.

**La infraestructura**
- La lentitud está arreglada: ahora sólo se baja lo que cambió. **⚠️ Las notas seguían diciendo "falta implementar".**
- 60 pruebas automáticas de los cálculos (caja, fechas, stock, pagos, búsqueda). Todas pasan.
- Los documentos 05 (qué hacer si falla), 06 (pruebas antes del piloto), 07 (prueba de hoy) y las reglas de trabajo están al día.

---

## 2. LO QUE PARECE HECHO PERO NO LO ESTÁ

**1. La compra parcial de Frank — la más urgente**
Parece: Frank vuelve con 8 de las 10 y lo registra desde su pantalla de inicio.
En realidad: la operación **sí** se guarda en la base, pero acto seguido la pantalla se rompe por dentro.
El día que la use: si sale bien, el formulario se cierra sin decirle nada; si sale mal, no ve ningún mensaje, sólo un botón que no responde. Lo natural es que vuelva a apretar, y entonces sí falla. Es el caso más común de su día. La misma pantalla de Lucía funciona bien.

**2. El reporte mensual de gerencia trae dos números falsos**
Parece: el informe con el que usted mira el gasto del mes.
En realidad: "Facturas pagadas" y "Monto pagado" siguen sumando el efectivo anulado (falta un filtro, tres líneas debajo de dos que sí se corrigieron), y la columna "Teórico" del faltante de caja se calcula con un fondo fijo de S/ 2,000 que ya no existe.
El día que lo use: en la misma fila hay una cifra buena (la diferencia real) y una inventada. Es el peor formato posible: no hay forma de notar cuál es cuál.

**3. Quién aprobó cada compra**
Parece: el sistema lo guarda desde el 12 de agosto, y así lo reporta cualquier revisión rápida.
En realidad: el dato existe, viaja hasta la pantalla… y ninguna pantalla lo muestra. Tampoco está en el Excel del Tablero.
El día que lo use: nadie puede responder "¿quién aprobó esta compra de S/ 8,000?" mirando el sistema.

**4. El Excel de conciliación para Yheyson**
Parece: arreglado hoy (ya no mete las compras en efectivo y ahora incluye el dinero entregado a Frank).
En realidad: el arreglo está en la máquina, sin subir. Lo que hay publicado sigue con el defecto viejo.
El día que lo use: Yheyson busca en el extracto del banco compras que salieron de la caja chica y no están ahí, y a los 14 días cada una se convierte en una alerta roja que nadie puede cerrar.

**5. El botón "Enterado" del residente**
Parece: el residente acepta el aviso de un ítem anulado y el aviso se va.
En realidad: el panel se va, pero el número rojo de la pestaña sigue puesto 15 días. Y el "enterado" queda guardado sólo en ese navegador: si entra desde el celular reaparece, y gerencia no tiene forma de saber si lo vio.
El día que lo use: usted va a apretar Enterado, va a ver el número rojo seguir ahí y va a concluir que no está hecho. Está hecho al 80%.

**6. Las salidas de material vencido**
Parece: "vencido bloquea salida", como dice el manual.
En realidad: el bloqueo vive sólo en la pantalla. Es la única guarda de almacén que quedó sin su gemela en el servidor.

**7. El inventario inicial que va a cargar Lucía**
Parece: se cerró el problema (ya no lo puede escribir cualquiera).
En realidad: sigue sin dejar rastro. Un ajuste pisa el valor anterior y no queda registro de cuál era. Además hoy la única forma de cargarlo es por consola, no hay pantalla. **Es justamente la carga que está por hacerse.**

**8. La lista de verificación de la base**
Parece: "59 de 59 OK", que es lo que se usa para dar por buena una tanda de cambios.
En realidad: esa lista se quedó doce cambios atrás, y los doce que faltan son los de pagos, efectivo y anulaciones.

**9. Las pruebas automáticas**
Parece: hay 60 y todas pasan.
En realidad: cubren la aritmética (que es valioso) pero ni una toca permisos ni la base. De los problemas graves de la semana pasada, las pruebas de permisos habrían atrapado cinco. Esas no existen. Y hay que acordarse de correrlas a mano.

**10. Rastro de la compra parcial**: se guarda el motivo de por qué un pedido de 10 quedó en 8, pero no se ve en ninguna pantalla ni en el Excel.

---

## 3. LO QUE FALTA DE VERDAD

**Cuesta plata**
1. **La hora.** El reloj de la base va adelantado respecto de Cusco. Después de las 19:00: Pagos no puede registrar la entrega del día (falla con un mensaje confuso), y una compra en efectivo de Frank se engancha a la rendición del día siguiente, mientras las entregas quedaron en el día de hoy. Resultado: el arqueo de Mónica dice que Frank debe todo lo que compró. La jornada de obra termina después de las 19:00 con normalidad — no es un caso raro, es casi todas las tardes. Se comprueba con una consulta de un segundo.
2. **El arqueo se puede maquillar.** La diferencia la calcula el navegador y la base la acepta tal cual: quien cierra el día puede declarar diferencia cero con cualquier efectivo contado, y la rendición se aprueba sola sin escalar a gerencia. Es la misma persona que recibe el efectivo.
3. **Una factura anulada se queda con su número para siempre.** El sistema le dice a Lucía "si está mal, gerencia la anula y se registra de nuevo" — y al registrarla de nuevo salta "serie duplicada". La única salida dentro del sistema es inventarle una variante al número, que es exactamente lo que se acaba de prohibir.
4. **Recepciones que desaparecen sin error.** Si dos personas tienen abierta la pantalla de almacén (el almacenero y gerencia), una recepción puede pisar a la otra y perderse sin aviso. El descuadre aparece semanas después en el inventario y ya no se puede reconstruir.
5. **Cuando gerencia resuelve un descuadre**, la rendición queda mostrando "aprobada por gerencia" y se pierde de vista que el arqueo lo hizo Mónica — y se apaga la alerta de "entregó y aprobó la misma persona", que es justo el control que compensa que Mónica tenga una sola cuenta.

**Bloquea trabajo**
6. Frank no puede reportar la compra parcial (punto 1 de arriba).
7. Un RQ puede quedar registrado **sin ningún ítem** si falla a mitad de camino: consume número, el residente cree que ya pidió, y a Compras no le llega nada. Además mejora falsamente el semáforo de planificación de esa obra. Lo mismo, peor, con el pedido de cotización: puede dejar materiales nuevos permanentes en el catálogo de Lucía sin ningún pedido que los justifique.
8. **La franja que dice "ENTORNO DE PRUEBAS · estos NO son los datos reales" es falsa**: apunta a la base real de la empresa. Es peor que no tener franja, porque invita a probar a lo bruto sobre los datos verdaderos. Falta crear la base de pruebas.
9. **Reconstruir la base desde cero nunca se probó, y hoy no se puede ni intentar**: serían 55 pegados a mano, las instrucciones escritas se quedaron en 3, uno de los cambios no está guardado en el repositorio, la reconstrucción dejaría **cinco cuentas bancarias falsas** que Pagos mostraría como buenas, y no quedaría ningún usuario con permiso de comprador. En el plan gratuito de Supabase **no hay copias de seguridad**: esa carpeta es el plan B, y el plan B no está probado.
10. El borrado de datos de prueba no limpia las entregas de efectivo. Una entrega de prueba que coincida en obra y fecha con un día real del piloto descuadra ese arqueo, días después y sin que nadie lo relacione.
11. Gerencia ve las entregas de caja pero no puede registrarlas desde la pantalla. Si Mónica no está, la jornada no se abre.

**Comodidad**
12. La tabla de Compras pinta 336 filas de una vez, y la primera carga del día pesa 620 KB — se nota en obra con datos móviles.
13. Con un segundo comprador habrá que preguntar a quién se le entrega el efectivo. Hoy lo asume solo.
14. El README, el instructivo de la base y dos documentos técnicos describen un sistema que dejó de existir hace un mes. Es el mismo problema de las notas, pero en los archivos.
15. Cinco frases en la pantalla de Rendiciones hablan de "reposición del fondo", que ya no existe — y ocultan lo que sí pasa cuando un día queda descuadrado: **al día siguiente Frank no puede comprar en efectivo en esa obra.**

**Donde los revisores no coincidieron:** el "reingreso a stock" de material mal usado tiene una regla que la sostiene sólo la pantalla. Un revisor lo llama residuo de segundo orden (el daño está acotado); otro pide cerrarlo junto con lo del material vencido, en un solo cambio. Ambos coinciden en que hoy no hay forma de explotarlo desde la pantalla.

---

## 4. DECISIONES QUE ESPERAN A USTED

1. **¿Frank debe llevar en su teléfono el historial de facturas de las cinco obras?** Hoy lo lleva, con RUC y montos, aunque su pantalla sólo le muestre lo de la semana. No es un agujero de permisos, es exposición: si pierde el teléfono, va todo. Compras y Pagos son centralizados por diseño, así que ahí puede estar bien.
2. **El cuadre de una factura con varios ítems: ¿tolerancia de 10 céntimos o de 50?** La pantalla exige 10 y la base acepta 50. En la franja de en medio caen los redondeos de IGV, y Lucía no tiene salida legítima: la única forma de destrabar el botón es retocar un precio unitario — y ese precio falso entra al historial con el que después se negocia con el proveedor.
3. **Una factura anulada, ¿debe poder volver a registrarse con el mismo número?** Hoy no, y el propio sistema le indica al usuario que lo haga.
4. **¿Cómo quiere Yheyson ver en el Excel el dinero que Pagos le entrega a Frank?** Sale del banco y hay que mostrarlo o el extracto nunca cuadra, pero no puede contarse como gasto o se cuenta dos veces. Se decidió por él marcarlo como traslado; falta que él lo confirme.
5. **¿Se contrata el plan pago de Supabase antes del primer dato real?** Sin él no hay copias de seguridad, y el plan B (reconstruir con la carpeta de cambios) no está probado.
6. **¿Gerencia debe poder registrar entregas de efectivo cuando Mónica no está?** Los permisos ya se lo permiten; falta sólo decidir y poner el botón.