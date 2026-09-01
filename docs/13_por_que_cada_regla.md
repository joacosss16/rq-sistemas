# Por qué existe cada regla (migraciones 49–83, ago–sep 2026)

La historia de las reglas que se bajaron a la base. Salió de CLAUDE.md el 30
ago: las **reglas vigentes** quedaron allá, en el modelo de negocio; aquí vive
**el fallo que parió cada una**. Se consulta cuando una regla estorba y dan
ganas de quitarla — antes de tocarla, leer aquí qué pasó la vez que no existía.
La fuente completa es cada archivo de `supabase/migrations/`, que lleva su
porqué escrito entero.

Todas nacieron de un fallo encontrado atacando el sistema o usándolo de verdad.

## Dinero

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
- **Quién CONTÓ el efectivo no se borra** (77). La migración 47 concentró el
  circuito del dinero en Mónica y prometió a cambio un control: avisar a
  gerencia cuando la misma persona entrega el efectivo y además cierra el
  arqueo. Ese aviso existía y miraba `aprobado_por` — que en un día con
  descuadre lo pisa GERENCIA al resolverlo. O sea que **el control estaba
  callado exactamente los días en que el efectivo no cuadró**. Ahora son dos
  firmas: `arqueo_por` (quién contó, la pone siempre el servidor) y
  `aprobado_por` (el visto bueno final). La jornada muestra las dos.

## Inventario y catálogo

- **La unidad viaja congelada en cada línea** (59) y **el factor de caja
  también** (63). El catálogo dice cómo se compra HOY; la línea, cómo se
  compró ESE DÍA. Sin esto, cargar una equivalencia de caja reescribía el
  pasado: un "3 CAJA" ya registrado pasaba a "3 UND" sin tocar el número.
- **Un código desactivado no se puede pedir** (60) — pero su stock físico se
  sigue sacando y su historia conserva el nombre. Los duplicados los cura
  Lucía; gerencia solo mira.
- **Los códigos no se reciclan**: el correlativo y la validación de unicidad
  miran todos los códigos jamás asignados, no solo los activos.

## Decisiones y firmas

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

## Del 28 de agosto: los 22 agujeros de Almacén y Pagos

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

## La tarde del 28: reparar lo roto ese mismo día

Una revisión adversarial al trabajo de la jornada encontró **20 hallazgos, todos
confirmados**, y la mayoría era daño propio hecho horas antes. La causa no fue
descuido en cada migración —cada una se revisó— sino **el ritmo: ocho
migraciones en un día, ninguna revisada contra las otras**.

- **La migración 72 borró tres guardas** de la entrega de efectivo: se reescribió
  copiando la versión 38 cuando ya la habían mejorado la 45, la 46 y la 48. La
  peor pérdida: **que la entrega abra la jornada**. Sin eso, el dinero entregado
  un día sin compras no tiene dónde constar que se devolvió. Es exactamente el
  error contra el que existe la regla de la casa, cometido el mismo día en que
  se amplió. **Reparado en la 75.**
- **El ajuste del compromiso quedó muerto**: la función de reparto no era
  `security definer`, no podía escribir, y el guardián de cuadre abortaba el
  pago. Las migraciones 65 y 68 existían para eso y no servían para nada,
  mientras la pantalla prometía en un cartel que los precios se ajustarían.
- Y además: la nota de crédito bloqueada, dos entregas de efectivo del mismo
  monto imposibles, el botón de corrección de administración muerto, la
  recepción sin filtro por obra, y el stock quedando negativo al aprobar una
  salida. **Todo en la 75.**
- **El RQ fantasma dejó de ser teórico** (76): la prueba del residente lo
  produjo con dos clics en Enviar. Ahora un RQ nace entero o no nace, el doble
  clic devuelve el mismo número, y los vacíos que había se borraron.

**Y `calcularStocks` devuelve ahora DOS números**, porque no eran lo mismo y se
usaban indistintamente:
- `cant` = de cuánto se puede **disponer** (descuenta reservas)
- `fisico` = lo que está **en el estante** (las reservas siguen ahí)
El conteo ciego y el cierre valorizado usan el físico: a nadie se le puede pedir
que cuente material que sí está.

## Del 31 de agosto y el 1 de septiembre: Almacén, Pagos y la caja chica

Seis migraciones (78–83). Las cinco primeras salieron de una auditoría al
módulo de Almacén y de dos rondas de prueba en pantalla; las dos últimas, de
atacar Pagos y Compras del día.

- **El reingreso viaja como incremento, no como total** (78). Era la migración
  71 otra vez en la operación de al lado: la pantalla mandaba el total
  acumulado calculado en memoria, así que dos personas devolviendo material de
  la misma salida se pisaban y lo del primero desaparecía sin error ni rastro.
- **La firma del reingreso la pone la base** (78). Devolver material MUEVE
  stock, igual que anular — y la 41 ya había dejado escrito que esa es la firma
  que menos puede venir del navegador. El reingreso se quedó fuera de aquella
  pasada.
- **El uso se verifica sobre lo que salió, y una sola vez** (78). No había
  ninguna guarda: por la API se marcaba como mal usado material de una salida
  que nunca se aprobó, y se podía ir y volver de Correcto a Incorrecto borrando
  el motivo anterior.
- **Rechazar una salida exige motivo, sea quien sea** (78). La guarda vivía
  DENTRO de la rama del residente, así que gerencia y compras rechazaban con el
  motivo vacío y el almacenero no sabía qué corregir. Mismo error de ubicación
  que la 69 ya había corregido para el caso de re-decidir.
- **Compras no aprueba salidas ni préstamos** (78). La política de la 18 se lo
  permitía sobre cualquier obra, sin que apareciera justificado en ninguna
  parte y sin que su rol tenga siquiera la pestaña. Conserva la lectura, que la
  necesita para el consolidado.
- **La verificación del uso se cierra, y deja la hora** (79). Faltaba el dato
  de "no volverá más material": sin él no se puede saber si una salida con 3 de
  10 devueltos está cerrada o esperando, y esas filas se quedaban a la vista
  para siempre. Con eso, la tabla pasó a ser una bandeja de lo pendiente.
- **Anular una salida ya verificada infla el stock** (80). Lo encontró el dueño
  probando la pantalla, no el ataque al código. Anular devuelve lo que salió y
  no volvió; si el uso ya se verificó, ese material se consumió o se perdió.
  Y no deja negativo: deja el stock INFLADO, que es el error que nadie busca.
  **Se permite si volvió todo**, porque entonces no devuelve nada.
- **Y con ella nació `corregir_uso()`** (80), porque la prohibición sola creaba
  una trampa peor: "Correcto uso" se marca con un clic sin confirmación, y un
  clic en la fila equivocada dejaba esa salida congelada mal para siempre. Es
  seguro para el inventario: `stock()` no mira `uso`.
- **Devolver un préstamo lo confirman los DOS almacenes** (81). Prestar exigía
  dos firmas y devolver una sola — y podía pulsarla el almacén que TENÍA el
  material, así que podía darlo por devuelto sin moverlo. La guarda que existía
  comprobaba que el destino TUVIERA el material, no que lo hubiera ENTREGADO.
- **La fecha de pago no puede ser futura ni anterior a la factura** (83). No la
  validaba nadie: el `max` del campo no rechaza nada porque no hay formulario
  (lo mismo que los "2.5 tornillos" de la 75). Un pago fechado adelante
  desaparece de la conciliación y de su alerta, y no se puede corregir porque
  una factura pagada queda congelada.
- **La conciliación es de gerencia, de verdad** (83). La guarda vivía al final
  de la función y dos `return` tempranos salían antes — justo los dos caminos
  que recorre administración. Y solo miraba el booleano, así que se podía
  falsear o borrar quién concilió.

**Y una migración que no trae ninguna regla nueva: la 82.** Repara dos líneas
que se cayeron al arreglar otra cosa, y las dos dejaban sin trabajar a quien
maneja el efectivo: `trg_entrega_caja` perdió su `security definer` (la 72 lo
quitó y la 75, que existía para reparar el daño de la 72, tampoco lo puso), y
`campos_admin` no conocía las dos columnas que la 77 había añadido el día
antes. Ninguna regla nueva; solo el recordatorio de que **una reparación
también se ataca**.

## Tiempo

- **La base vive en hora de Perú** (58). Estaba en UTC: a partir de las 19:00
  el sistema ya creía que era mañana, y eso además desactivaba la guarda que
  impide registrar entregas con fecha futura.
