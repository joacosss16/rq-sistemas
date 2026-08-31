# Donde estamos de verdad
**30 de agosto de 2026 · revisión punto por punto contra el código, no contra las notas**

*(Sustituye a la revisión del 16 de agosto. Aquella abrió **25 puntos**: **15 están cerrados** y **10 siguen vivos**. Los vivos van primero y marcados con la fecha en que se abrieron — llevan dos semanas ahí, y ese es el dato importante. Todo lo que se da por cerrado se comprobó abriendo el archivo, no mirando el historial de cambios.)*

En dos semanas se cerró casi todo lo que costaba plata: la hora de la base, el arqueo que se podía maquillar, la factura anulada que quemaba su número, las recepciones que desaparecían, el RQ que nacía vacío. Lo que queda es de otra naturaleza —**números falsos en informes y reglas que solo vive la pantalla**— y por eso se ha quedado: no rompe nada al usarlo, se descubre semanas después.

---

## 1. LO QUE SIGUE ABIERTO DE AQUELLA REVISIÓN

Diez puntos, ordenados por lo que cuesta que salgan mal.

### Cuesta plata o decisiones

**1. El informe mensual de gerencia trae dos números falsos.** *(abierto desde el 16 ago)*
Es la pantalla donde se mira el gasto del mes. En `ReporteMensual.jsx`:
- "Facturas pagadas" y "Monto pagado" **siguen sumando las anuladas** (línea 150). Las dos líneas de justo debajo —deuda y pendientes— sí las filtran. Es una línea que se saltó.
- La columna "Teórico" del faltante de caja se calcula con `monto_fondo` (línea 165), el **fondo fijo que dejó de existir el 12 de agosto**. Y no sale "0": la base obliga a que ese fondo sea mayor que cero, así que sale un número creíble e inventado, en la misma fila que la diferencia real.

Es el peor formato posible: una cifra buena y una falsa, sin forma de distinguirlas. El módulo figura en las notas como *"rediseñado y verificado"*.

**2. Nadie puede responder "¿quién aprobó esta compra de S/ 8,000?"** *(abierto desde el 16 ago)*
El dato se guarda desde el 12 de agosto y viaja hasta la pantalla (`App.jsx:384`, `decididoPor`). **Ninguna vista lo muestra**, y tampoco está en el Excel del Tablero. Comprobado: esa variable no se usa en ningún sitio.

**3. La salida de material vencido solo se bloquea en la pantalla.** *(abierto desde el 16 ago)*
La cabecera de la migración 7 promete, con esas palabras, *"vencido bloquea la salida"*. Esa regla **nunca se escribió**: vive solo en `Almacen.jsx:425`. Es una de las dos únicas guardas de almacén sin su gemela en el servidor.

**4. El inventario inicial no deja rastro y no tiene pantalla.** *(abierto desde el 16 ago)*
Un ajuste pisa el valor anterior sin registrar cuál era, y la única forma de cargarlo sigue siendo por consola: `Almacen.jsx` solo lo lee. **Es justo la carga que está por hacerse**, y ahora va la última de todas.

**5. La pantalla de Mónica describe un sistema que ya no existe.** *(abierto desde el 16 ago)*
`Rendiciones.jsx` habla de *"reposición del fondo"* y de *"Pagos repone el fondo"* en cuatro sitios. Ese modelo murió el 12 de agosto. Hay hasta un comentario en el propio archivo que dice "ya no se habla de reposición" — tres líneas antes de hablar de reposición. Es la persona que cierra el efectivo cada día leyendo instrucciones caducas.

**6. Si Mónica no está, la jornada no se abre.** *(abierto desde el 16 ago)*
Gerencia ve las entregas de efectivo pero no puede registrarlas: `Pagos.jsx:16` da el permiso a `pagos` y `administracion`, y **el rol gerente no está**. Los permisos de la base sí se lo permiten desde la migración 47. Falta decidir y poner el botón.

**7. La franja de "entorno de pruebas" es falsa.** *(abierto desde el 16 ago)*
Dice *"estos NO son los datos reales de la empresa"* apuntando a la única base que hay. Es peor que no tener franja, porque invita a probar a lo bruto sobre lo verdadero. Se apaga en el último paso del plan de lanzamiento, y hasta entonces conviene saberlo.

### Comodidad

**8. Las pruebas automáticas no tocan permisos.** *(abierto desde el 16 ago)*
Son 62 y todas pasan, pero cubren solo la aritmética (caja, fechas, stock, pagos, búsqueda). **Ni una toca permisos ni la base**, que es donde han estado todos los problemas graves. Y hay que acordarse de correrlas a mano.

**9. La primera carga del día sigue pesando.** *(abierto desde el 16 ago)*
El paquete compilado son 660 KB (180 KB comprimido). Se nota en obra con datos móviles.

### Sin resolver, pero por decisión pendiente

**10. Reconstruir la base desde cero nunca se ha probado.** *(abierto desde el 16 ago)*
Ahora sí es posible —la carpeta de migraciones está completa: 76 archivos del 1 al 77— y las cinco cuentas bancarias falsas que dejaría ya las borra el reset. Pero **probarlo sigue sin hacerse**, y en el plan gratuito de Supabase no hay copias de seguridad: esa carpeta es el plan B.

---

## 2. LO QUE SE CERRÓ

Comprobado archivo por archivo, no por el historial.

**El dinero**
- **La hora.** La base vivía en UTC y a partir de las 19:00 creía que era mañana — casi todas las tardes. Migración 58.
- **El arqueo ya no se puede maquillar.** Lo calcula la base; el navegador solo manda lo que administración cuenta. Migración 67.
- **Una factura anulada libera su número.** La corrección oficial —gerencia anula, se registra de nuevo— por fin es posible. Migración 64.
- **Quién contó el efectivo no se borra.** El control que compensa que Mónica tenga una sola cuenta estaba callado exactamente los días con descuadre: gerencia resolvía y su nombre pisaba el de administración. Ahora son dos firmas. Migración 77 *(30 ago)*.
- **El Excel de conciliación de Yheyson** ya no mete las compras en efectivo y sí incluye el dinero entregado al comprador.

**Las compras**
- **Frank puede reportar una compra parcial.** Era el caso más común de su día y la pantalla se rompía después de guardar. Hoy avisa del error en vez de dejar un botón muerto (`ComprasDelDia.jsx:48`).
- **El rastro de la compra parcial se ve**: `✂ 8 de 10 · «motivo» · quién`, en la vista de Compras.
- **Un RQ nace entero o no nace.** Dejó de ser teórico —la prueba del residente lo produjo con dos clics— y se cerró el mismo día. Migración 76.

**El almacén**
- **Las recepciones ya no desaparecen.** Dos personas recibiendo el mismo ítem se pisaban y la primera recepción se perdía sin error ni rastro. Ahora suma el servidor bloqueando la fila. Migración 71.
- **Lo hecho no se deshace**: no se des-anula una salida, no se re-decide una resuelta, el reingreso no retrocede. Migración 69.

**Lo demás**
- **El botón "Enterado" del residente** apaga también el número rojo de la pestaña.
- **El reset limpia las entregas de efectivo** y las alertas levantadas, que sobrevivían y descuadraban arqueos reales días después.
- **La lista de verificación de la base** se sustituyó por algo que no se queda atrás: `supabase/verificar_datos_reales.sql`, que **falla listando todo lo que falta** para arrancar.

---

## 3. LO QUE APARECIÓ DESPUÉS Y NO ESTABA EN AQUELLA LISTA

**1. El RQ fantasma sigue vivo por el pedido por cotización.**
La migración 76 cerró el camino normal. Pero `crearPedidoCotizacion` (`src/App.jsx`) no la usa: da de alta los materiales **uno a uno**, luego la cabecera, luego las líneas — tres escrituras sueltas sin transacción. Si falla la última quedan **materiales permanentes en el catálogo de Lucía y un RQ numerado y vacío**. Peor que el original, porque un código de material no se recicla nunca. Y el generador de códigos 97xxxx toma el máximo y suma uno **sin tope**: si la familia se llenara, desbordaría a la 98 en silencio.

**2. El número de RQ es un contador global, no por obra.**
`numero bigint generated always as identity` — uno solo para todo el sistema. Si MAIA crea el RQ-1, el siguiente de DANAUS es el RQ-2. La coordinación del piloto es por WhatsApp "con el número de RQ", así que "RQ-14" no dice de qué obra es, y cada residente ve su lista saltar y cree que perdió requerimientos. **Decisión tomada el 30 ago: se cambia a numeración por obra**; falta decidir si el número lleva el código de obra delante.

**3. Son dos los indicadores que mejoran cuanto peor va**, no uno.
"Entrega a tiempo %" y "Holgura promedio" se calculan sobre la misma lista, que solo contiene lo ya entregado. Un material que nunca llega no empeora ninguna de las dos. Son justo los indicadores con los que se iba a medir si el sistema mejora la obra.

**4. Las cinco cuentas bancarias cargadas eran inventadas** — y la guarda que impide pagar una obra con la cuenta de otra las estaba dando por buenas, congelándolas dentro de cada factura pagada. **Resuelto el 30 ago**: el reset se las lleva, y al quedar la obra sin cuenta Pagos no la deja pagar hasta cargar la real.

**5. El almacenero ve "S/ 0.00 valorizado"** porque su rol no puede leer las facturas (política RLS de la migración 13; el residente tampoco). **Decisión del dueño el 30 ago: no lo necesita**, así que se quita el número en vez de abrirle a dos roles más el acceso al dinero. Pendiente de hacer.

---

## 4. DECISIONES QUE SIGUEN ESPERANDO AL DUEÑO

1. **El cuadre de una factura con varios ítems: ¿10 céntimos o 50?** Comprobado que sigue igual: la pantalla exige 10 (`Compras.jsx:296` y `:522`), la base acepta 50. En la franja de en medio caen los redondeos de IGV, y **Lucía no tiene salida legítima**: la única forma de destrabar el botón es retocar un precio unitario — y ese precio falso entra al historial con el que después se negocia con el proveedor.
2. **¿Frank debe llevar en su teléfono el historial de facturas de las cinco obras?** Hoy lo lleva, con RUC y montos. No es un agujero de permisos, es exposición: si pierde el teléfono, va todo.
3. **¿Se contrata el plan pago de Supabase antes del primer dato real?** Sin él no hay copias de seguridad, y el plan B no está probado.
4. **¿Gerencia debe poder registrar entregas de efectivo cuando Mónica no está?** Los permisos de la base ya se lo permiten; falta el botón. Hoy, si falta, la jornada no se abre.
5. **¿Cómo quiere Yheyson ver el dinero que se le entrega a Frank en el Excel?** Se decidió por él marcarlo como traslado; falta que lo confirme.
6. **Los enchapes: ¿familia nueva o la 24?** Hoy se crean en la **97, que en el catálogo real es ACTIVOS FIJOS** (reflectores, megáfonos). El sitio correcto según las propias notas es **24 · CERÁMICA Y PORCELANATO**.
7. **Con un segundo comprador** habrá que preguntar a quién se le entrega el efectivo. Hoy lo asume solo.

*(Resuelta desde el 16 de agosto: "¿una factura anulada debe poder volver a registrarse con el mismo número?" — sí, y ya funciona. Migración 64.)*
