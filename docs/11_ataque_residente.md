El módulo no está bien. Lo que se ve en pantalla es correcto; el problema es que casi todas las reglas importantes de este módulo viven **solo** en la pantalla, y la base acepta cosas que la pantalla nunca ofrecería. Van ordenados por lo que cuestan.

---

**1. El residente puede meter un pedido que ya nace "aprobado por Compras" — y stock que nunca llegó**

QUE PASA: Edwin crea un RQ normal el martes. Con esa misma sesión, sin contraseña de nadie más, puede grabar en la base una línea de pedido que nace ya "Aprobada", y hasta "Recibida" con 500 bolsas. Frank la ve el miércoles en su lista de compras del día y la compra. Lucía nunca la tuvo que aprobar. Y si además marca lo recibido, el almacén de MAIA aparece con 500 bolsas de cemento que no entraron; desde ahí se pueden pedir salidas o prestarlas a DANAUS, cruzando de razón social.

QUE CUESTA: plata sin techo por el lado de la compra —y el sistema no puede decir quién la autorizó, porque el campo "quién aprobó" queda vacío— más inventario inventado del que después cuelgan salidas, préstamos y el arqueo. Limpiarlo no se puede desde la aplicación con ningún usuario: hay que entrar a la base a mano.

POR QUE NO SE VE: todas las reglas ("solo Compras aprueba", "solo el almacén recibe") están puestas como candado sobre la **modificación** de una línea, nunca sobre su **creación**. Desde la pantalla es imposible saltárselas porque la pantalla no ofrece esos botones. Este mismo agujero ya se detectó y se cerró dos veces —en salidas y préstamos, y después en facturas—; en los pedidos nunca se cerró, y el residente es el único rol, aparte de Compras, que puede crear líneas de pedido.

DONDE: `supabase/migrations/20260723000020_pedido_cotizacion.sql:39`.
ARREGLO: candado de creación que fuerce toda línea nueva a nacer Pendiente, sin recibir y sin firma (copiar el patrón de la migración 36). Dos cuidados: no debe romper el pedido por cotización de Lucía ni el saldo de compra parcial de Frank. Antes de arreglar, se puede comprobar si ya pasó buscando líneas aprobadas sin firma de quién aprobó, posteriores al 12 de agosto.

---

**2. El lunes, al cargar las equivalencias de caja, los pedidos viejos cambian de unidad solos**

QUE PASA: el sistema no guarda en qué unidad se pidió cada cosa; la deduce del catálogo cada vez que dibuja la pantalla. Cuando Lucía cargue las equivalencias de los ~29 materiales que se piden en CAJA (1 caja = 100 unidades), todos los pedidos ya hechos de esos materiales cambiarán de unidad sin que nadie toque la cantidad: el "3 CAJA de guantes" de Edwin pasa a decir "3 UND". Lucía compra 3 guantes. Y cuando llegue 1 caja de verdad, Anton no la puede recibir: el sistema le dice que 100 excede lo pedido.

QUE CUESTA: se compra la centésima parte de lo pedido, la obra se queda sin material y el almacenero queda trabado con la mercadería en la puerta. El PDF ya firmado por cuatro personas deja de coincidir con la pantalla si se regenera.

POR QUE NO SE VE: nadie toca el pedido. El cambio se hace en el catálogo, otro día y en otra pantalla, y se contagia hacia atrás a todo lo ya registrado —incluido el saldo de almacén, que pasa de "5 CAJA" a "5 UND"—. Nadie que mire un pedido antes o después va a relacionar las dos cosas.

DONDE: `src/App.jsx:298` (y lo mismo para salidas, préstamos y stock inicial).
ARREGLO: guardar la unidad y el factor dentro de la línea del pedido al crearla, igual que ya se guarda el precio en la factura. Mientras tanto: **no cargar esas equivalencias sin antes rellenar la unidad de lo ya registrado**. Si se carga primero, se congela el dato ya equivocado.

---

**3. De 7 de la noche a medianoche el sistema vive en el día siguiente**

QUE PASA: la base usa la hora de Greenwich; Cusco va cinco horas atrás. Desde las 19:00 la base ya cambió de día y la pantalla no. Martes 19:40, Edwin necesita aditivo para el vaciado de esta noche: la pantalla le ofrece "hoy 18 de agosto" y le deja enviar; la base lo rechaza diciendo que la fecha del RQ es 19 de agosto — un día que él nunca vio, en un aviso que se borra solo a los 8 segundos. No puede registrar el pedido más urgente que tiene. Además el RQ se graba en dos pasos y solo falla el segundo: la cabecera queda grabada, con su número consumido y sin una sola línea. Cada reintento deja otra. Esos RQ vacíos aparecen en "Mis requerimientos", no se archivan nunca, y cuentan como RQs URGENTES suyos en el semáforo de planificación. Hay una versión silenciosa peor: si pide para el jueves, la pantalla dice GENERAL y no le pide justificación, y la base lo graba URGENTE — urgencia sin explicar, invisible en el reporte de urgentes.

QUE CUESTA: cinco horas al día, todos los días, en las que no se puede registrar lo de hoy — justo la franja en que aparecen las urgencias de obra. Más el semáforo del residente empujado al rojo por RQs que nunca existieron.

POR QUE NO SE VE: de día no pasa nada. Quien revisa el módulo a las 10 de la mañana no puede reproducirlo, y el mensaje de error no habla de horarios: habla de una fecha, así que parece un error de tipeo del residente.

DONDE: la fecha del RQ la pone y la valida la base con su propio reloj (esquema inicial línea 83; migración 35 líneas 56-61); el grabado en dos viajes está en `src/App.jsx:529-543`.
ARREGLO: que la base calcule su "hoy" en hora de Perú — **en toda la base a la vez, no en una columna**: la misma deriva le parte la jornada de caja chica a Frank a las 19:00. Y grabar cabecera + líneas de un solo golpe, como ya se hace con las facturas.

---

**4. El "URGENTE" lo declara el propio residente, y es el número con el que se lo mide**

QUE PASA: la etiqueta URGENTE / GENERAL / ANTICIPADO la calcula el navegador del residente y la base la guarda tal cual, sin contrastarla con las fechas. Andrés necesita fierro para mañana; la pantalla le marca URGENTE y le exige explicar por qué no se previó. Si reenvía el pedido diciendo "GENERAL", la base lo acepta sin una queja: la única regla que existe pregunta por la etiqueta que mandó él mismo. Y el desfase de las 19:00 produce la misma incoherencia sola, todas las tardes, sin mala fe de nadie.

QUE CUESTA: no cuesta plata directa — comprobé que la cola de compra de Lucía y la de Frank se ordenan por la fecha necesitada real, así que una etiqueta falsa no atrasa ninguna compra. Cuesta el control: el % de urgentes, el semáforo por residente, el reporte mensual de "urgentes y por qué no se previó" y el CSV salen todos de esa etiqueta.

POR QUE NO SE VE: la base **sí** calcula bien la urgencia de cada línea, por su cuenta y con las fechas reales. Ese valor se calcula, se guarda y se tira a la basura al dibujar: las cuatro pantallas lo pisan con la etiqueta de la cabecera. El sistema ya sabe la verdad y no la muestra en ningún lado.

DONDE: `src/App.jsx:533`; se pisa en Compras, Tablero, Reporte mensual y Almacén.
ARREGLO: que la etiqueta la deduzca la base de sus propias líneas y exija la justificación contra esa. Primero hay que arreglar la hora (punto 3), o el arreglo dejaría a los residentes en rojo injustamente.

---

**5. Un clic de gerencia le quita al residente la firma sobre su propio material**

QUE PASA: préstamo de 40 bolsas de MAIA a LUZ. Hacen falta dos firmas: Edwin (presta) y el residente de LUZ (recibe). Como LUZ no tiene residente dado de alta, gerencia entra a destrabar ese lado. Pero la pantalla no le pregunta qué lado firma: firma el que esté libre, y como Edwin aún no firmó, **el primer clic firma por Edwin**. El préstamo desaparece de la bandeja de Edwin para siempre, y el rastro dice que el origen lo aprobó gerencia. Un segundo clic firma el otro lado y las bolsas cruzan de razón social con una sola persona firmando las dos puntas. La firma no se puede deshacer. Pasa igual entre dos obras que sí tienen residente, si el de origen todavía no firmó.

QUE CUESTA: se pierde la doble aprobación, que es exactamente lo que se construyó para que el material no se mueva entre obras por decisión de una sola persona.

POR QUE NO SE VE: gerencia ve un botón "Aprobar" y una columna que dice "Recibes (destino)" — literalmente lo contrario de lo que el botón hace. Nada indica que acaba de firmar por el residente de MAIA.

DONDE: `src/vistas/AprobacionesResidente.jsx:41` (la columna que miente, línea 119).
ARREGLO: dos botones explícitos, "Firmar origen" y "Firmar destino", ofreciendo solo el lado sin residente activo; y en la base, marcar esa firma como destrabe de gerencia para que el rastro no diga que la aprobó el dueño del material.

---

**6. (más dudoso — convenció a uno de los dos revisores) Con mala señal se puede duplicar un RQ**

QUE PASA: Edwin manda un RQ de 14 ítems con señal mala. Entra en la base pero se pierde la respuesta. Ve un error, sus ítems siguen en pantalla, vuelve a dar Enviar: quedan dos RQ idénticos y el consolidado de compra los suma.

POR QUE ES DUDOSO: el revisor que lo rechazó comprobó que la pantalla se recarga sola cada 40 segundos, así que Edwin sí ve si su RQ entró, y que para comprar el doble Lucía tendría que aprobar antes 28 líneas gemelas seguidas del mismo material, obra y fecha. La ventana existe, pero es estrecha.

ARREGLO: cae dentro del mismo cambio del punto 3 (grabar el RQ de un solo golpe), añadiendo una marca de "es el mismo envío".

---

**LO QUE ATAQUÉ Y AGUANTÓ**

Esto lo intenté romper por la base, sin pasar por la pantalla, y no cedió. Puede dejar de vigilarlo:

- **El residente no puede darse por pagado.** Marcar una línea como Pagada sin factura está bloqueado en la base, incluso al crearla. Es la única comprobación que sí cubre la creación.
- **No puede editar sus pedidos después de enviarlos.** No existe permiso de modificación para el residente sobre las líneas de RQ: su única escritura es el alta.
- **No puede pedir para otra obra ni tocar el RQ de otro.** La base comprueba obra y autor.
- **Nadie borra nada.** No hay permiso de borrado en todo el sistema (salvo el aviso de alertas). Todo queda con rastro.
- **No se puede recibir más de lo pedido.** El tope está en la base, no solo en la pantalla del almacenero.
- **Las salidas y los préstamos sí nacen bloqueados**: nacen Pendiente / Solicitado aunque se los cree por fuera de la pantalla, y no mueven stock hasta las firmas. Ahí el candado de creación sí está puesto — es el modelo a copiar para el punto 1.
- **Las salidas no pueden exceder el stock**: lo valida la base.
- **Las firmas de préstamo las estampa el servidor** con el nombre real y su propia fecha; no se pueden falsear desde el navegador, y una vez puestas no se reescriben.
- **Una factura no puede nacer anulada** (se cerró en agosto).
- **Un canal falseado no desordena las compras**: la cola de Lucía y la lista del día de Frank se ordenan por la fecha necesitada real.

**Si solo se arreglan tres cosas:** el candado de creación de líneas de RQ (punto 1), la hora de Perú en toda la base (punto 3), y guardar la unidad en la línea antes de que Lucía cargue las equivalencias del lunes (punto 2).