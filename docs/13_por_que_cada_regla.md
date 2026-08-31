# Por qué existe cada regla (migraciones 49–77, ago 2026)

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

## Tiempo

- **La base vive en hora de Perú** (58). Estaba en UTC: a partir de las 19:00
  el sistema ya creía que era mañana, y eso además desactivaba la guarda que
  impide registrar entregas con fecha futura.
