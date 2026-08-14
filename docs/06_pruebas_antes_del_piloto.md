# Pruebas antes del piloto

Lista para ir tachando. Ordenada para no tener que entrar y salir de cuentas
más veces de las necesarias.

**Cómo anotar el resultado:** al lado de cada línea, ✓ o el mensaje exacto que
salió. Si algo falla, lo importante es **qué decía la pantalla**, no la
sensación.

**Regla:** lo que no llegues a probar se anota como **roto**. En estos dos días,
de siete problemas encontrados, tres llevaban días rotos y todos estaban
apuntados como "pendiente de probar".

---

## 0 · Antes de empezar (SQL, 1 minuto)

Corre el verificador de esquema completo (`supabase/verificar_esquema.sql`).
Todo debe decir OK. Si algo dice FALTA, para y avisa: significa que una
migración no se aplicó y el resto de las pruebas no valdrían.

---

## A · El circuito de la caja chica

**Es lo más importante de toda la lista: nadie lo ha ejecutado nunca**, y el
modelo cambió por completo ayer. Hay que hacerlo en este orden porque cada paso
depende del anterior.

### A1 · Con la cuenta de **PAGOS**
- [ ] En "Entregas de efectivo al comprador", registrar **S/ 600 · Transferencia**
      para MAIA, con un N° de operación cualquiera.
      → Debe aparecer en la lista de abajo.
- [ ] Intentar registrar una transferencia **sin N° de operación**.
      → El botón NO debe habilitarse.
- [ ] Registrar **S/ 250 · Efectivo** para MAIA.
      → No debe pedir N° de operación.
- [ ] Registrar una entrega **con la fecha de ayer**.
      → Debe aceptarla y mostrarla en la lista con esa fecha.

### A2 · Con la cuenta de **FRANK** (comprador)
- [ ] Registrar una compra en **efectivo** de MAIA por unos **S/ 800**
      (marcando "Ya pagada en EFECTIVO" al facturar).
      → Debe crear la rendición del día sola.

### A3 · Con la cuenta de **MÓNICA** (administración)
- [ ] Abrir Rendiciones y buscar la de MAIA de hoy.
      → Debe decir **Recibido S/ 850 · Gastado S/ 800 · Debe devolver S/ 50**,
        con las dos entregas listadas debajo.
      → **Si no muestra las entregas, para y avisa**: significa que no se están
        atando por obra y fecha, que es lo único que no se pudo verificar.
- [ ] Escribir **50** en "Efectivo devuelto y contado" y cerrar.
      → Debe decir que cuadra exacto y quedar Aprobada.

### A4 · La diferencia (repetir con otra obra u otro día)
- [ ] Cerrar contando **20** en vez de lo que corresponde.
      → Debe quedar "Con diferencia" y escalar a gerencia.
- [ ] Con Frank: intentar otra compra en efectivo de esa obra.
      → Debe estar **bloqueada** hasta que gerencia resuelva.
- [ ] Con gerencia: resolver la diferencia.
      → Frank debe poder volver a comprar.

---

## B · Facturas

### B1 · Con **LUCÍA** (compras)
- [ ] Facturar marcando **"YA PAGUÉ, aún no me dan la factura"**.
      → El botón **se habilita** (esto estuvo roto días) y la serie sale `PEND-####`.
      → Al marcarlo, la casilla de "SIN factura aún" debe **desaparecer**.
- [ ] Facturar una **normal** (con su serie), una **a crédito** (compromiso
      `CRED-####`) y comprobar que las tres conviven.
- [ ] Aprobar un ítem. Después, en la base:
      `select decision, decidido_por from rq_items where id = '<uuid>';`
      → `decidido_por` debe tener el identificador de Lucía.
- [ ] Aprobar un material nuevo desde Catálogo.
      → Debe aparecer **sin recargar la página**.

### B2 · Con **GERENCIA**
- [ ] Anular una factura **sin pagar**, con motivo.
      → Debe quedar tachada y **sus ítems volver a estar disponibles** para
        facturarse. (Esto nunca funcionó hasta ayer.)
- [ ] Intentar anular una factura **ya pagada**.
      → Debe rechazarla explicando que se corrige con una nota de crédito.

### B3 · Con **PAGOS**
- [ ] Pagar una factura eligiendo el medio **"Nota de crédito"**.
      → Debe pedir la **serie de la nota** y **no** pedir banco.
- [ ] Con gerencia, descargar el **CSV de conciliación** de Auditoría.
      → Esa factura **NO** debe aparecer: no movió dinero del banco.
- [ ] Comprobar que las facturas por pagar salen **agrupadas por obra**, cada
      grupo con su banco, su cuenta y su subtotal.

---

## C · Almacén (cuenta de **ANTON**)

- [ ] Recibir **completo**, recibir **parcial**, y luego recibir el **saldo**.
- [ ] **Corregir una recepción** con motivo.
      → Debe quedar el rastro con **su** nombre y la fecha.
- [ ] Intentar corregir **sin escribir motivo**.
      → El botón no debe habilitarse.
- [ ] Marcar un ítem Comprado → recibirlo → corregirlo a **0**.
      → Debe volver a "Comprado" **con la fecha de compra original**, no la de hoy.
- [ ] Dar una salida.
      → Debe nacer **Pendiente** y **no** descontar stock.
- [ ] Marcar uso incorrecto, reingresar a stock, y **anular una salida con motivo**.
      → El rastro de la anulación debe decir **su** nombre.
- [ ] Pedir un préstamo a otra obra.
      → Debe nacer "Solicitado" y no mover stock.

---

## D · Residente (cuenta de **EDWIN**)

- [ ] Crear un RQ completo y **generar el PDF**.
      → Debe abrirse bien. Prueba escribir un `<` o un `&` en el destino: el
        PDF debe mostrarlo tal cual, sin romperse.
- [ ] Ver "Mis requerimientos".
      → El RQ recién creado debe salir **arriba del todo**.
- [ ] **Aprobar** una salida y **rechazar** otra con motivo.
- [ ] **Aprobar su lado** de un préstamo.
- [ ] Si tiene el aviso rojo de anulaciones: pulsar **"Enterado"**.
      → Debe colapsarse a una línea, y poder volver a abrirse.

---

## E · La carga incremental (lo que se construyó ayer)

**Esto necesita dos personas o dos navegadores a la vez.**

- [ ] Abrir **Lucía en un navegador** y **un residente en otro**.
- [ ] Que Lucía apruebe un ítem del residente.
      → Al residente debe aparecerle **en menos de 40 segundos, sin recargar**.
- [ ] Que el residente cree un RQ.
      → A Lucía debe aparecerle igual de rápido.
- [ ] Trabajar los dos en paralelo unos minutos, pulsando botones seguido.
      → **Nada debe quedarse congelado ni desaparecer.** Si algo deja de
        actualizarse, anota qué era y a qué hora.

### E2 · Cambio de usuario sin recargar
- [ ] Con un residente dentro, pulsar **Salir** y entrar con **Lucía** en la
      misma ventana, **sin recargar la página**.
      → Lucía debe ver **todas** las obras, no solo la del residente anterior.
      → No debe ver ningún rastro de la sesión anterior.

---

## F · Gerencia

- [ ] Auditoría: las alertas deben salir **agrupadas por obra**, no una línea
      por factura.
- [ ] **Levantar** una alerta con motivo.
      → Desaparece de la lista activa y queda abajo, en "Levantadas", con el
        nombre y la fecha.
- [ ] **Volver a abrirla**.
      → Debe regresar a la lista activa.
- [ ] Abrir el **Tablero** y el **Reporte mensual**.
      → Los números deben tener sentido. Presta atención a las rendiciones
        viejas: deben decir "Rendición del modelo anterior", no salir en
        negativo.
- [ ] Comprobar que gerencia tiene ahora la pestaña **Aprobaciones**, y que
      desde ahí puede aprobar una salida de cualquier obra.

---

## Lo que NO se puede probar todavía

- **Restaurar un backup**: el plan Free de Supabase no genera backups. Es el
  motivo por el que hay que contratar el Pro **antes** del primer dato real.
