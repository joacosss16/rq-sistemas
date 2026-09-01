# ESTADO DEL PROYECTO
**Actualizado: 31 ago 2026.** Aquí vive todo lo que cambia cada semana: lo
abierto, el plan, el backlog. Salió de CLAUDE.md el 30 ago para que el contexto
maestro no envejezca con él.

> **Si esto tiene más de siete días, no te fíes: compruébalo contra el código
> y la base antes de actuar.** Este archivo se actualiza al cerrar cada día de
> trabajo (regla de la casa). La comprobación que no depende de notas es
> `supabase/verificar_datos_reales.sql`: pregunta a la base, no a la memoria.

## Dónde está el sistema (30 ago 2026)

- **App multi-usuario en producción**: Vercel (https://rq-sistemas.vercel.app),
  repo GitHub `joacosss16/rq-sistemas`, base Supabase (Postgres + RLS + Auth).
- **82 migraciones corridas** (la 33 no existe: se descartó antes de correrse).
  La 77 se corrió el 30 ago; la 78, 79, 80, 81 y 82, el 31.
- **La 82 (31 ago) — LA CAJA CHICA ESTABA ROTA Y NADIE LO SABÍA.** Dos fallos
  vivos en la base que bloqueaban el circuito del efectivo de punta a punta:
  Mónica no podía registrar la primera entrega del día de ninguna obra, ni
  cerrar NINGÚN arqueo. Los encontró el ataque a Compras del día.
  - `trg_entrega_caja` perdió su `security definer` en la 72, y **la 75 —que
    existe para reparar el daño de la 72— tampoco lo puso**. Sin él, el insert
    que abre la jornada choca con la política de `rendiciones` (exige ser
    comprador y ser uno mismo el responsable; quien registra es Mónica y el
    responsable es Frank).
  - `campos_admin` de `trg_rendicion_guarda` no conocía `arqueo_por` ni
    `arqueo_en`, que la 77 escribe SIEMPRE. El trigger veía dos columnas
    desconocidas y lanzaba un mensaje sobre reponer el fondo, que no tiene nada
    que ver. Y la exención `rq.arqueo` de la 77 no salvaba: `rendiciones_guarda`
    corre ANTES que `zz_arqueo_solo_del_servidor`, por orden alfabético.
  - **LA LECCIÓN, que es lo que hay que llevarse:** este archivo ya decía que a
    la 77 le faltaba "la prueba real — una jornada nueva con descuadre". Esa
    prueba que faltaba es EXACTAMENTE la que revienta. Se dio la migración por
    buena porque las dos comprobaciones que sí se hicieron salieron bien.
- **La 81 (31 ago): devolver un préstamo lo confirman los DOS almacenes.**
  Prestar exigía dos firmas y devolver una sola — y encima podía pulsarla el
  almacén que TENÍA el material, así que podía dar por devuelto algo que no
  había movido: el stock volvía al origen, que no tenía nada. La guarda que
  existía comprobaba que el destino TUVIERA el material, no que lo hubiera
  ENTREGADO. Ahora firman los dos almaceneros (no los residentes: la entrada es
  una decisión, la devolución es un hecho físico y firma quien cuenta las
  bolsas). Una devolución a medias se pinta en ROJO a partir de las 16:00, con
  los días que lleva.
  **El ataque encontró tres cosas antes de correrla**, y una era un
  BLOQUEANTE EN LA PANTALLA: `avisoTarde` usaba `aMedias` antes de declararla
  —zona muerta temporal— y como el `&&` corta por la izquierda, la vista
  funcionaba toda la mañana y **se caía en blanco a las 16:00, solo para el
  almacenero**. Compilaba y las 73 pruebas pasaban. Es el mismo fallo que ya
  tumbó producción una vez. Las otras dos: gerencia podía firmar los dos lados
  en una sentencia y cerrar el préstamo sola, y una devolución a medias sobre
  material ya consumido quedaba ATASCADA para siempre (sin devolver, sin
  transferir, sin anular, sin poder retirar la firma) y en rojo todos los días
  sin que nadie pudiera quitarlo — la forma más rápida de matar una alerta.
- **La 78 se corrió el 31 ago.** Cierra cinco cosas de la
  auditoría de Almacén: el reingreso lo suma y lo firma el servidor, el uso se
  verifica una sola vez y solo sobre una salida aprobada, rechazar exige motivo
  a TODOS los roles (no solo al residente), y **compras deja de poder aprobar
  salidas y préstamos** (decisión del dueño, 31 ago; conserva la lectura, que
  la necesita para el consolidado). **El orden importa: primero se corre la
  migración, DESPUÉS vale el código.** `Almacen.jsx` ya llama a
  `reingresar_material`, y hasta correrla el botón "Reingresar" daba error.
- **La 79 se corrió el 31 ago**: la verificación del uso se cierra y deja la
  hora. Añade `uso_en`, `reingreso_en` y `reingreso_cerrado` a `salidas`, y
  `reingresar_material` gana un tercer parámetro (`p_cerrar`); la firma vieja
  de dos parámetros se borra en la propia migración. Con ella, la tabla de
  salidas pasa a ser una BANDEJA (solo lo que falta verificar) y lo resuelto se
  archiva detrás de un contador. El almacenero recibe, a partir de las 16:00,
  un aviso DENTRO de la aplicación con lo que le falta por verificar — **no es
  una notificación**: la decisión de que el sistema no manda notificaciones
  sigue en pie, y el aviso le espera cuando abre en vez de dispararse cuando
  está en el almacén (que es cuando no lo vería). Las HORAS solo las ve
  gerencia: son dato de auditoría, y el almacenero es el vigilado.
  **Con esto se llegó al tope de dos migraciones por sesión (78 y 79).**
- **La 77 se probó el 31 ago**, a medias y con resultado: el rescate de datos
  se comportó como prometía (recuperó las 3 jornadas que podía, se abstuvo en
  las 2 de descuadre), y la firma NO se puede falsear ni con la sesión de
  gerencia. Falta la prueba real —una jornada nueva con descuadre que enseñe
  "Arqueo de X · resuelta por Y"—, que **no se puede hacer con los datos
  actuales**: las entregas de caja nacieron con la migración 38 el 12 ago y
  cuatro de las cinco rendiciones son anteriores. Hay que fabricarla.
- **La rama `arqueo-y-reset` tiene 7 commits SIN mergear a main**: el código
  de la 77 (la alerta del arqueo y las dos firmas en pantalla), el reset que
  ahora borra catálogo/proveedores/bancos, el guardián
  `verificar_datos_reales.sql`, la reorganización de CLAUDE.md, los hooks, y
  los dos días de trabajo sobre ALMACÉN (migraciones 78-80 y su pantalla).
  Mergear cuando el dueño lo decida — un push a main publica en Vercel.
  Mientras tanto la base va por delante del código en modo seguro: la firma
  nueva del arqueo se guarda, solo que la pantalla aún no la muestra.
- **Tres hooks instalados** (30 ago, en `.claude/hooks/`, versionados): al
  escribir una migración se avisa qué migraciones anteriores definen la misma
  función y cuál es la versión viva, y se exige el bloque de comprobación;
  editar `Residente.jsx` salta como pregunta de permiso al dueño; y todo
  `git commit` corre antes las pruebas y la compilación.
- **Alcance acotado hasta terminar el piloto: no se agregan funciones nuevas**,
  solo se arregla y endurece lo que existe. Todo lo demás —flete, cajas,
  órdenes de servicio, Almacén Central— está diseñado y apuntado, sin construir.
- Catálogo completo cargado: 58 familias + 1,740 materiales desde
  `datos/codificacion_de_almacen.xlsx` (hoja "Materiales 3.0").
- **El catálogo, los proveedores y las cuentas se van a recargar**: decisión
  del dueño (30 ago), primero el reset y RECIÉN entonces se carga todo — el
  catálogo nuevo de materiales, los 255 proveedores (CONTROL_RQ_LUZ.xlsx,
  **aún no está en `datos/`**), las cuentas bancarias reales y el stock inicial.

**Estado de los módulos** (método de cierre uno por uno), al 31 ago:
- **Compras — CERRADO.** Atacado por código (28 hallazgos) y probado a mano por
  el dueño en tres rondas.
- **Residente — arreglado**, a falta de dos comprobaciones que necesitan datos:
  el número de "Aprobaciones" con firmas pendientes y el aviso de ítems
  anulados. Se cubren al probar Almacén.
- **Gerencia — rediseñada y verificada**, PERO su informe mensual tiene dos
  números falsos (ver abajo): esa palabra quedó grande.
- **Almacén — auditado, reconstruido y PROBADO EN PANTALLA el 31 ago.** Tres
  migraciones (78, 79, 80), once de los quince hallazgos de la auditoría
  cerrados, la vista reorganizada en cuatro pestañas y dos rondas de QA con
  Claude in Chrome. Falta: probar en pantalla lo hecho DESPUÉS del segundo QA,
  las dos migraciones que quedan, y las decisiones de la lista de abajo.
- **Pagos — atacado y arreglado por código, SIN probar en pantalla.** Es lo
  siguiente. El precedente son los tres botones "muertos" de Compras: el
  mensaje de error de la base tiene que llegar a la cara del usuario.

## LO QUE SIGUE ABIERTO (30 ago 2026)

Fallos conocidos y sin arreglar, por lo que cuesta que salgan mal:

- **El RQ fantasma sigue vivo por el PEDIDO POR COTIZACIÓN.** La migración 76
  cerró el camino normal, pero `crearPedidoCotizacion` (`src/App.jsx`) no la
  usa: da de alta los materiales UNO A UNO, luego la cabecera, luego las
  líneas — tres escrituras sueltas sin transacción. Si falla la última quedan
  **materiales permanentes en el catálogo de Lucía y un RQ numerado y vacío**.
  Peor que el original, porque un código de material no se recicla nunca.
  Además el generador de códigos 97xxxx toma el máximo y suma uno **sin tope**:
  si la familia se llenara, desbordaría a la 98 en silencio.
- **El número de RQ es un contador global, no por obra.** Si MAIA crea el RQ-1,
  el siguiente de DANAUS es el RQ-2; "RQ-14" por WhatsApp no dice de qué obra
  es, y cada residente ve su lista saltar. **Decisión del dueño (30 ago): se
  cambia a numeración por obra.** Falta decidir el formato del número (¿con el
  código de obra delante?). Toca `crear_rq`, el PDF y 20+ sitios que lo pintan.
- **El informe mensual de gerencia trae dos números falsos** (señalados el 16
  ago en `docs/08`, vivos el 30). En `ReporteMensual.jsx`: "Facturas pagadas" y
  "Monto pagado" siguen contando las anuladas (falta el filtro que sí tienen
  las dos líneas de justo debajo), y la columna "Teórico" del faltante de caja
  se calcula con `monto_fondo`, el fondo fijo que dejó de existir el 12 de
  agosto. No sale "0": sale un número creíble e inventado, en la misma fila que
  la diferencia real.
- **Nadie puede responder "¿quién aprobó esta compra?"**: el dato se guarda
  desde el 12 ago y viaja hasta la pantalla (`decididoPor`), pero ninguna vista
  lo muestra ni está en el CSV.
- **La salida de material vencido solo se bloquea en pantalla.** La cabecera de
  la migración 7 promete "vencido bloquea la salida" y esa regla nunca se
  escribió: vive solo en `Almacen.jsx`.
- **La caducidad no viaja con un préstamo**: material por vencer llega al
  destino figurando como bueno. **Y al revés, que no se había visto**: en el
  ORIGEN la fecha se queda aunque el material se haya ido, porque `cadMin`
  sale de la recepción y no del stock. Presta lo que está por vencer y el
  origen se queda con un VENCIDO fantasma de material que ya no tiene. Le da
  la vuelta a la sugerencia que hace la propia pantalla ("considera prestarlo
  antes de que se vuelva merma"): prestarlo es lo que borra su fecha.
- **La alarma de vencido no se apaga nunca en la vista del almacenero**
  (hallazgo del 30 ago, el más dañino de los tres de caducidad). El arreglo de
  los lotes con consumo FIFO está en `calcularStocks` —que usa Compras— y NO
  en `stockDetalleObra`, que es la que alimenta las dos pantallas de almacén:
  ahí `cadMin` sigue siendo el mínimo pelado de todas las recepciones. Un lote
  que venció en marzo y se consumió en abril deja el material en **VENCIDO**
  para siempre, y como "vencido" bloquea el botón, **la salida del material
  nuevo queda muerta** con el cartel "dar de baja o corregir con Gerencia" —
  y no hay nada que dar de baja. También infla el contador de vencidos.
- ~~El almacenero ve "S/ 0.00 valorizado"~~ → **HECHO el 31 ago.** El bloque
  del valorizado se muestra solo a gerencia (`soloVigila` en `Almacen.jsx`).
  El almacenero ya no ve un cero que no significa cero; la RLS de la migración
  13 se queda como está y el dinero no se abre a dos roles más.
- **"Entrega a tiempo %" y "Holgura promedio" mejoran cuanto peor va**: se
  calculan solo sobre lo ya entregado, así que un material que nunca llega no
  empeora ninguna. Son los indicadores con los que se iba a medir el sistema.
- **Frank escribe el banco a mano** al facturar (consecuencia de la migración
  32: ya no ve qué banco usa cada obra). Dispara alertas falsas en Auditoría, y
  hasta que ese campo sea una lista fija, la guarda de la migración 70 no se
  puede extender al alta de facturas.
- **El sistema no guarda la cuenta bancaria de los proveedores**: al transferir
  hay que buscarla fuera. Es por donde se cuela el fraude de suplantación —el
  correo que dice "cambiamos de cuenta"— porque no hay contra qué compararla.
  Para la semana 2 del piloto, junto con la carga de los 255 proveedores.
- **La pantalla de Mónica habla de "reposición del fondo"** en cuatro sitios de
  `Rendiciones.jsx`; ese modelo murió el 12 ago. Instrucciones caducas para
  quien cierra el efectivo cada día.
- **Corregir una recepción** escribe directo a la tabla leyendo el historial de
  la memoria del navegador: dos correcciones simultáneas se pisan (la misma
  carrera que la migración 71 cerró para recepciones). Probabilidad baja.
  **Ampliado por la auditoría del 30 ago**: además manda la cantidad como
  TOTAL absoluto, así que si otro registró una recepción entre medias, la
  corrección la borra. Deja rastro (`{de,a}` en `correcciones`), pero el aviso
  de pantalla dice el número viejo: quien corrige no se entera. Y permite
  SUBIR la cantidad, o sea es una segunda puerta de recepción sin el cerrojo
  de `recibir_material`. La ventana de 7 días es solo de pantalla: un error
  detectado el día 8 no tiene ningún camino en la aplicación.

**Auditoría de ALMACÉN del 30 ago.** Cinco preguntas al código, 15 hallazgos.
**El 31 ago se cerró casi todo**: la migración 78 (corrida) se llevó cinco, y
seis más eran solo código y están arreglados con pruebas (67 en total ahora,
antes 62). Lo arreglado en código, todo en el commit del 31 ago:

- ✅ **La alarma de vencido que no se apagaba nunca.** `stockDetalleObra` usaba
  el mínimo histórico de todas las recepciones, así que un lote vencido y ya
  consumido dejaba el material en VENCIDO para siempre — y como vencido apaga
  el botón de salida, **el material nuevo no podía salir**. El cálculo por
  lotes con consumo por orden de llegada se extrajo a `caducidadViva()` y
  ahora lo usan las dos funciones. De paso se corrigió que `calcularStocks` lo
  calculaba contra el disponible en vez de contra el estante.
- ✅ **"En almacén ahora" mostraba el disponible** (`HistorialMateriales.jsx`).
  Ahora muestra el físico, con el disponible debajo cuando difieren.
- ✅ **La vista de almacén del residente escondía el reservado**
  (`AlmacenResidente.jsx`), justo a quien tiene que firmar esas salidas.
- ✅ **`reservado` mezclaba salidas y préstamos** en un número. Ahora va
  desglosado (`resSalidas` / `resPrestamos`) y las dos pantallas lo dicen.
- ✅ **La reserva se contaba en BRUTO** en `stockDetalleObra` y NETA de
  reingreso en las otras dos fórmulas. Ya coinciden las tres.
- ✅ **Un préstamo `Solicitado` a medio firmar se atascaba** reservando stock
  sin que nadie del almacén pudiera anularlo: la base sí lo permitía, faltaba
  el botón. Ya está, con su aviso propio.

**QA en pantalla del 31 ago (Claude in Chrome, obra MAIA, 4 roles).** Bloques
A, B, C, E y F completos; el D (aviso de las 16:00) se quedó sin probar porque
la sesión cerró a las 14:50. La prueba clave —C4, dos pestañas reingresando a
la vez— **PASÓ**: el total salió 3 y no 2, con el aviso de pantalla
desactualizada. Comprobado después contra la base: los cuatro caminos de la 79
quedaron correctos, incluido el de "no vuelve nada" (0 devueltos, cerrado).
Lo que encontró y ya está arreglado:

- **La pantalla se CONGELABA** (renderer sin responder hasta 30 s, dos veces,
  sin ningún error de consola). Causa: 309 filas de salidas, cada una con sus
  inputs y botones. Ahora se pintan 50, las más recientes primero, y el resto
  a un clic diciendo el total. Igual en Recepción (82). **No se perdió ningún
  dato en ningún congelamiento**, pero en la máquina de una obra sería peor.
- **El botón de pedir préstamo no se habilitaba.** No era "hay que tocar el
  select": `FiltroProyecto` no tenía opción vacía, así que con el destino sin
  elegir el navegador pintaba la PRIMERA obra mientras el estado seguía vacío.
  La pantalla mentía sobre lo elegido. Arreglado en `ui.jsx` para todos.
- **El diálogo del reingreso parcial inducía al error contrario.** Preguntaba
  "¿esperas que vuelva algo más?" y ponía `[No, esto es todo]` primero y en
  verde: quien iba rápido cerraba la HT creyendo que la dejaba abierta. Pasó
  en la prueba, y se vio en los datos. Ahora los botones dicen la consecuencia
  (DEJAR ABIERTA / CERRAR), no un sí/no.
- **Los avisos duraban 5 s** y quien probaba concluyó que "no hay
  confirmación" — el mismo malentendido de los tres botones "muertos" de
  Compras. Ahora 12 s.
- **Los placeholders "HT-001" y "Piso 3 - Dpto 301"** se leían como datos ya
  cargados. Cambiados por "N° de hoja" y "¿En qué zona?".

**Verificar el uso sin mirarlo (31 ago).** Al convertir Salidas en una bandeja
que se vacía se creó, sin querer, el incentivo de vaciarla a clics. Lo vio el
dueño el mismo día. Se descartó avisar por velocidad en la pantalla del
almacenero —se esquiva contando hasta tres, castiga a quien recorre la obra y
registra seis seguidas, y se lo enseña al vigilado— y se hizo lo del arqueo:
**no bloquea, hace visible**. Tres alertas nuevas en Auditoría, solo gerencia,
sin migración (usan `uso_en` de la 79): verificación **en ráfaga** (10+ en 3
minutos), **ninguna marcada como incorrecta** con 20+ verificadas, y **el uso
se verifica muy tarde** (7+ días de media entre la salida y su verificación).
Más un recordatorio suave en la pantalla del almacenero a las 6 en un minuto,
que no bloquea y explica qué se pierde. **Los umbrales son una estimación
mía**: hay que ajustarlos cuando haya datos reales. **Límite conocido**: se
agrupa por OBRA, no por persona — no guardamos quién verificó, y hoy el botón
solo lo tiene el almacenero de la obra. Si algún día verifican dos personas,
hay que afinarlo.

**Segunda pasada de QA (31 ago, tarde): el bloque D PASA.** El aviso de las
16:00 aparece para el almacenero ("Te faltan verificar 303 salida(s)"),
persiste entre pestañas, el botón "Ir a Salidas" navega, y **no** le sale a
gerencia. Los demás hallazgos del informe son los mismos de la mañana, ya
corregidos.

**Ruido y búsqueda en Almacén (31 ago).** Al mirar qué pasa con un material que
llega a cero apareció que la tabla de Stock **era la única tabla grande sin
tope de filas** — y es la que crece sola: un material entra la primera vez que
pasa por el almacén y ya no sale nunca, así que con 1.740 en el catálogo el
almacenero acabaría abriendo cientos de filas en cero. Ahora:
- Los materiales en **cero exacto y sin reservas se archivan** detrás de un
  contador y **vuelven solos** en cuanto entra material. Los NEGATIVOS se
  quedan siempre a la vista: son descuadre real, y esconderlos es el fallo que
  ya se pagó una vez (ver el comentario de `stockDetalleObra`).
- **Buscador en Stock** (material o código) y **en Recepción** (material,
  código o número de RQ — "RQ-311" es como lo pregunta el residente por
  WhatsApp). Buscar mira SIEMPRE en todo, archivados incluidos: quien escribe
  el nombre de un material quiere ese material, y que esté en cero es la
  respuesta, no un motivo para ocultárselo.
- La regla de búsqueda se sacó a `coincide()` en `busqueda.js`, compartida con
  el buscador del catálogo y con 5 pruebas propias: si una pantalla encuentra
  algo y la otra no, quien busca deja de fiarse del buscador.

**DEL ATAQUE A PAGOS Y A COMPRAS DEL DÍA (31 ago) — lo que queda abierto.**
La migración 83 se lleva dos (la fecha de pago y la conciliación). Lo demás,
por orden de lo que toca dinero:

- **SE PUEDE APROBAR UNA JORNADA DE CAJA SIN CONTAR EL EFECTIVO.** Con la
  jornada abierta: "Observar" (motivo cualquiera) y después "Guardar corrección
  y aprobar". Queda Aprobada con `efectivo_contado`, `diferencia` y
  `arqueo_por` NULOS. Nadie cuenta el dinero, no hay escalamiento a gerencia
  aunque falten S/ 500, y **la alerta de "entregó y arqueó la misma persona" no
  salta** —mira `arqueo_por`—, o sea que el control que la migración 47
  prometió a cambio de concentrar el circuito en una persona se apaga con dos
  clics de esa misma persona. Y después la jornada ya no se reabre.
  **ESTUVO EN LA 83 Y SE QUITÓ**: la guarda tal como estaba escrita habría
  dejado ese botón fallando el 100% de las veces, porque "Observar" solo se
  ofrece sobre una jornada 'Abierta' y una 'Abierta' nunca tiene el efectivo
  contado. Contar primero tampoco vale: `cerrar_con_arqueo` la saca de
  'Observada' y el cuadro de corrección desaparece.
  **El arreglo de verdad**: que el texto de la corrección viaje DENTRO de
  `cerrar_con_arqueo` (un `p_correccion` opcional), para contar y explicar en
  el mismo acto. Migración propia + pantalla.
- **Nada avisa a Frank de cuánto efectivo le queda** al registrar una compra.
  `registrar_factura` no compara el gasto contra las entregas del día. El caso
  que parió la migración 53 —teclear S/ 1,690 donde se compró por S/ 169— no se
  detecta hasta el cierre, y aparece invertido: el arqueo dirá que SOBRAN. **No
  convertirlo en bloqueo** (sería la migración 60 otra vez: Frank compra antes
  de que Mónica registre la entrega): un aviso no bloqueante con
  `Σ entregas − Σ gastado` del día, en rojo si el importe lo supera.
- **Si la jornada de HOY deja de estar Abierta, Frank queda atrapado el resto
  del día.** Mónica cierra a las 16:00, Frank compra a las 17:00 y no puede
  registrarlo: no hay forma de reabrir. Mitigación sin tocar la base: que
  Mónica no cierre hasta que Frank devuelva el vuelto.
- **El aviso de entrega de efectivo duplicada que la migración 75 delegó
  explícitamente a la pantalla nunca se construyó.** Dos clics con red lenta =
  dos entregas idénticas, y el faltante se lo come Frank en el arqueo. Es de
  pantalla y media hora: un estado "enviando" en el botón más un aviso si ya
  existe una entrega igual ese día.
- **Una compra en efectivo de una jornada *Observada* no se puede anular**
  (`anular_factura` exige 'Abierta'), y "Observada" es justo el estado que
  Mónica pone cuando una factura está mal.
- **La entrega de efectivo arranca apuntando a EMPERATRIZ**, que no entra al
  piloto: el formulario usa la primera obra por código. Un descuido abre una
  jornada en la obra equivocada, y una entrega no se edita, hay que anularla.
- Gerencia puede pagar por la API (la pantalla lo impide, la RLS no), y nada
  impide dos pagos con el mismo N° de operación.

**Lo que sigue abierto de esa auditoría:**

- ~~ANULAR UNA SALIDA YA VERIFICADA INFLA EL STOCK~~ → **migración 80, CORRIDA el 31 ago**
  tras ser atacada y corregida.** El ataque encontró que la primera versión
  creaba una trampa peor que el fallo: "Correcto uso" se marca con UN clic sin
  confirmación, y un clic en la fila equivocada dejaba esa salida **congelada
  mal para siempre** — ni re-verificar, ni anular, ni reingresar—, mientras el
  mensaje de la propia función mandaba a "anula la salida y regístrala de
  nuevo", que es justo lo que ella prohibía 43 líneas después. La versión
  corregida trae la prohibición **más `corregir_uso()`**, el camino que
  faltaba: devuelve el uso a Pendiente con motivo y firma, y es seguro porque
  `stock()` no mira `uso`. Más la excepción de anular cuando volvió todo (ahí
  no infla nada), los mensajes reescritos, la aritmética corregida —infla
  (cant − cant_reingresada), NO `cant`— y las pruebas del pie blindadas para
  que fallen si no tocan ninguna fila. El botón "↺ Corregir verificación" va
  en el mismo commit. Lo encontró el dueño probando la pantalla, no el código.
  Anular devuelve al stock todo lo que salió; si el uso ya se verificó, ese
  material se consumió o se perdió, así que devolverlo inventa existencias —y
  no deja negativo, deja el stock INFLADO, que es el error que nadie va a
  buscar—. La pantalla ya lo bloquea desde el 31 ago; la 80 lo baja a la base,
  y de paso impide anular una salida RECHAZADA, que nunca movió stock.
- **El vencido solo bloquea en pantalla → la migración 81 se escribió y se
  PARÓ.** El ataque adversarial encontró un bloqueante y dos graves, así que
  vive en `supabase/pendientes/el_vencido_bloquea_la_salida.sql`, **fuera de
  `migrations/` a propósito** y con una cabecera de PARADA que explica los
  tres. Lo que la para no es aritmético: **la regla es binaria y el stock real
  es mixto**. Bloquear 100 unidades sanas porque hay 10 vencidas entre ellas,
  sin ninguna forma de dar de baja esas 10, es peor que el problema.
- **BLOQUEANTE ANTES DE CARGAR EL INVENTARIO REAL — el cálculo de lotes falla
  con existencias sin caducidad, y ESO YA ESTÁ CORRIENDO EN PANTALLA.**
  `consumido = Σ(lotes) − stock_físico`, pero `stock_fisico()` cuenta también
  el stock inicial, las recepciones sin caducidad y los préstamos recibidos, y
  nada de eso genera lote. Con 100 de inventario inicial y un lote de 10
  vencido, `consumido` sale 0, el lote vencido "sobrevive" para siempre y
  bloquea las 100 sanas. Hoy no muerde **porque no hay stock inicial cargado**
  — y se carga justo antes de arrancar el piloto. Hay que arreglarlo en
  `src/stock.js` con pruebas. Junto con eso, alinear los dos FIFO: la pantalla
  ordena por `fecha_necesitada` y el SQL parado por `fecha_rq`, y el desempate
  de lotes del mismo día tampoco coincide.
- ~~El vencido solo bloquea en pantalla~~ → ~~**migración 81**~~ (ver arriba): La promesa de la migración 7, sin cumplir desde julio. Añade
  `caducidad_viva(proyecto, codigo)` en SQL —el mismo FIFO por lotes que
  `caducidadViva()` en `stock.js`, que se extrajo esta mañana justo para tener
  una sola definición— y `trg_salidas_bi` la mira. **No se podía hacer antes**:
  con el cálculo viejo habría bloqueado en el servidor las salidas de material
  sano, y desde la base no hay quien lo esquive.
  - **ANTES DE CORRERLA CON DATOS REALES**, correr la consulta 3 de su bloque
    de comprobación: dice cuánto material quedaría atrapado. Con datos de
    prueba da igual; con el inventario real, cada fila es material que ya no
    podrá salir.
  - **HALLAZGO NUEVO que abre esa migración: no existe DAR DE BAJA material
    vencido.** La pantalla dice "dar de baja o corregir con Gerencia" y no hay
    botón para lo primero. El callejón ya existía —la pantalla ya bloqueaba—,
    pero la 81 lo sella. **Es lo siguiente que necesita Almacén.**
  - **Decisión pendiente del dueño**: prestar material vencido sigue
    permitido. Endosarle a otra obra lo que aquí no se puede usar
    probablemente debería bloquearse, pero no se mete de tapadillo en una
    migración sobre salidas.

- **Los mensajes mandan a una puerta tapiada.** Al intentar devolver un
  préstamo consumido, la base dice "corresponde Transferir al costo"
  (migración 73) y la 69 repite lo mismo — pero la 74 lo bloqueó. El pie de la
  tabla de préstamos en `Almacen.jsx` también lo sigue explicando como opción
  viva. El almacenero busca un botón en gris y llama a alguien. Cada vez.
  **Necesita migración** (los textos viven en funciones de la base).
- **Corregir una recepción** sigue mandando el total del navegador (ver arriba).
  **Necesita migración.**
- **El vencido solo bloquea en pantalla** (ver arriba). **Necesita migración**,
  y ya se puede escribir: dependía del arreglo de la caducidad, que está hecho.

**Decisiones del dueño, pendientes:**
- "Transferir al costo" cierra con **una sola firma** cuando la entrada exigió
  dos. (Hoy irrelevante: transferir está deshabilitado, migración 74.)
- La **fecha de pago** ya tiene tope en pantalla (`max={HOY_ISO}`) pero **no en
  la base**: por fuera admite 2030, y 1990 pasa por los dos lados.
- El cuadre de factura multi-ítem: la pantalla exige 10 céntimos, la base
  acepta 50. En la franja caen los redondeos de IGV y Lucía no tiene salida
  legítima (ver `docs/08`, decisión 1).
- ¿La curaduría de duplicados de Lucía sobrevive al reset? Depende de si el
  catálogo nuevo conserva los códigos (ver `reset_pruebas.sql`).
- Los enchapes: ¿familia 24 (CERÁMICA) o familia libre? Hoy caen en la 97
  (ACTIVOS FIJOS), que es el sitio equivocado.

**Lo que la prueba a mano confirmó y el código no veía:** que una factura
anulada libera su número, que los RQ íntegramente rechazados eran inalcanzables
(botón para archivar, ninguno para abrir), y que la partida no se validaba
contra la obra — hoy hay un aviso ⚠ en pantalla, pero **no bloquea**, y el
servidor solo exige que no esté vacía.

## EL PLAN DE LANZAMIENTO (acordado con el dueño el 28 ago, ajustado el 30)

En este orden, y **cada paso termina antes de empezar el siguiente**:

1. **Cerrar los módulos uno por uno.** Verificación en pantalla (el dueño con
   Claude in Chrome) → arreglar → **congelar** → siguiente. Faltan Almacén y
   Pagos.
2. **Una pasada global** al final: ataque al código y prueba a mano.
3. **Borrar los datos de prueba** (`supabase/reset_pruebas.sql`).
4. **Probar cada caso y cada ramificación** sobre el sistema limpio.
5. **Reset otra vez**, para borrar lo que generó esa prueba.
6. **AHORA sí, cargar los datos reales** — decisión del dueño (30 ago):
   primero el reset, y RECIÉN entonces se carga todo. El reset borra ahora el
   catálogo entero, todos los proveedores y las cinco cuentas de prueba (antes
   sobrevivían y arrastraban basura). Orden de carga: familias (si cambiaron) →
   materiales → proveedores (255) → cuentas bancarias → usuarios → stock
   inicial el último, el día del arranque.
7. **Correr `supabase/verificar_datos_reales.sql`** y que pase en silencio.
   Falla listando lo que falte. Sustituye a "creo que ya está todo".
8. `VITE_ENTORNO = produccion` en Vercel + Redeploy. **Lo último que se toca.**
9. **Anunciar y lanzar.**

**CONSECUENCIA A TENER PRESENTE:** mientras no esté el inventario, el stock
arranca en CERO y los almaceneros no pueden registrar salidas — el sistema dirá
que no hay stock, y tendrá razón. O se carga el mismo día del arranque antes de
que entre nadie, o pensarán que el sistema está roto.

**LO QUE FALTA ANTES DEL ARRANQUE, aparte del plan:**
- **El almacenero de DANAUS** — sin él, media parte del piloto no recibe ni
  saca material. (El guardián del paso 7 lo lista por su nombre.)
- Supabase **Pro** con recuperación a punto en el tiempo. Sin él no hay copias
  de seguridad, y reconstruir desde las 76 migraciones nunca se probó.
- Los **bancos reales** en `proyectos_banco` (2502 y 2503 para el piloto).
- Cuentas de correo reales por persona.
- Los **manuales por rol**. Incluir: que un préstamo consumido queda abierto a
  propósito (migración 74), o el primer almacenero que lo vea lo reportará
  como avería.

## Backlog acordado (18 jul 2026) — orden aprobado por el dueño

1. ✅ Desglose de precios por ítem + unidades base/factor caja (migración 5)
2. ✅ Módulo de Pagos: estado de pago a nivel factura (migración 6)
3. ✅ Consolidado por comprar + caducidad de perecederos (migración 7)
4. Historial/comparativa de precios por material y proveedor con CSV
5. Post-piloto: bitácora de cambios, auditoría cíclica ciega de almacén,
   liquidación de transferencia intercompany
6. Post-piloto — **Almacén Central (Huancaro)**, diseño acordado (20 jul):
   - Fase A (operativa, sin precios): obra especial `0000`; almacenero
     **Fernando** (rol almacen, proyecto 0000); inventario por cantidades.
     Alerta "CENTRAL tiene N" en el consolidado de Lucía con botón **Aceptar
     del central** (solo compras decide; atención parcial). Frank ve "Comprar:
     M · Recoger en CENTRAL: N". Fernando ve cola "Por despachar" y registra
     la salida; el almacén de obra recibe (doble punta). Requiere columna
     `rq_items.cant_central`.
   - Fase B (contable, con Yheyson): valorización de saldos, guía de remisión
     PDF con firmas, liquidación intercompany entre **Gold y Majser**.

Nuevos RQs (misma tanda): piso/nivel obligatorio (lista cerrada), fecha
necesitada única por RQ, PDF solo cuando todos los ítems están decididos.

**Casos especiales por fase.** Fase 2 tras piloto: rechazo en recepción por
material dañado, notas de crédito y devoluciones al proveedor, etapa
"Cotizado", merma en granel con tolerancia % por tipo. Arquitectura:
concurrencia de dos compradores sobre el mismo ítem, facturación intercompany
para "Transferir al costo" (asiento para Yheyson), días hábiles vs calendario
en el canal.

### SUNAT / SIRE: el Registro de Compras (idea del dueño, 14 ago 2026)

El sistema ya guarda casi todo lo que exige el Registro de Compras: serie, RUC
y razón social, fecha de emisión, monto, forma de pago, medio, N° de operación
y obra. **Faltaría**: el desglose de IGV (base imponible / IGV / total), el
tipo de comprobante (factura, boleta, nota de crédito), la fecha de vencimiento
y la **detracción** cuando aplique. Con eso, Yheyson exportaría el registro en
vez de re-digitarlo desde los PDFs.

**No tocar hasta terminar el piloto** (decisión del dueño). Va junto con los
cinco casos de compra pendientes —detracción, pago parcial, un pago para
varias facturas, anticipo y canje por letra— y la nota de crédito / saldo a
favor: son el mismo bloque contable. Ver `docs/09` y `docs/10`.

### Pendientes de Lucía (pedidos el 18 jul 2026, siguen abiertos)

Equivalencias caja→unidades de los ~29 materiales "CAJA" (y PQT/ROLLO/PAR), su
hoja de control de almacenes (inventarios iniciales por obra, ideal con
precios), confirmar nombres de las familias 62/73/91, y CONTROL_RQ_LUZ.xlsx
(255 proveedores). Todo esto entra ahora por la carga del paso 6 del plan.
