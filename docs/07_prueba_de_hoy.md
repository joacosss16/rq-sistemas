# Prueba de hoy — 16 ago 2026

Todo lo que hay que probar en una sola pasada. Cubre dos cosas juntas:
la **separación en módulos** (el código cambió de sitio, no de
comportamiento) y los **cinco arreglos de facturas**.

**Dónde probar:** `http://localhost:4173` (la versión empaquetada, la
misma que iría a producción). La de `5173` es de desarrollo y se siente
más lenta por naturaleza.

**Ojo:** aunque la pantalla diga "ENTORNO DE PRUEBAS", la base es la
**real**. Lo que registres lo verá el equipo.

---

## PASO 0 · Correr las tres migraciones (5 minutos)

En el editor SQL de Supabase, **en este orden**:

1. `supabase/migrations/20260816000054_anulacion_sin_atajo.sql`
2. `supabase/migrations/20260816000055_firma_del_pago_desde_el_servidor.sql`
3. `supabase/migrations/20260816000056_items_solo_a_su_factura.sql`

**Antes de la 56**, correr esta consulta. Si devuelve filas, avisar
antes de seguir (habría facturas que ya cubren ítems de otra obra):

```sql
select f.serie, f.proyecto as obra_factura, r.proyecto as obra_item
  from public.factura_items fi
  join public.facturas f on f.id = fi.factura_id
  join public.rq_items i on i.id = fi.rq_item_id
  join public.rqs r      on r.id = i.rq_id
 where r.proyecto <> f.proyecto;
```

> **Por qué el orden importa:** la 55 tiene que correr ANTES de que la
> pantalla nueva llegue a producción. Si llegara al revés, cada
> "Registrar pago" fallaría y Pagos quedaría muerto.

---

## PASO 1 · Que la mudanza no rompió nada (15 minutos)

Cinco cosas que, si fallan, delatan que algo se perdió de sitio.

### 1.1 · Como RESIDENTE — el módulo que acabamos de descongelar
- [ ] Crear un RQ completo. El **canal cambia solo con la fecha**:
      hoy o mañana = URGENTE (pide justificación), a 2–7 días = GENERAL,
      a 8 días o más = ANTICIPADO.
- [ ] El **destino** es obligatorio; sin él no deja enviar.
- [ ] Al enviar sale el **PDF con el bloque de 4 firmas**.
- [ ] En "Mis requerimientos" el RQ aparece con su canal.

### 1.2 · Como GERENCIA — los maestros
- [ ] Los selectores de proyecto de **Compras, Almacén, Pagos y Tablero**
      muestran **las 5 obras**. (Si alguno sale vacío: hay dos copias de
      la lista de obras. Avisar de inmediato, no seguir.)
- [ ] Abrir el PDF de un RQ desde Compras: trae el **nombre del almacenero**.

### 1.3 · Los detalles que se pierden en silencio
- [ ] Un campo obligatorio vacío se ve **amarillo** hasta que se llena
      (en Residente, Compras o Pagos).
- [ ] Los avisos que ya cerraste con "Enterado" **siguen cerrados**.
- [ ] Descargar **un CSV** (Tablero, Auditoría, Historial de precios o
      Reporte mensual) y abrirlo en Excel: **las tildes se ven bien**.

### 1.4 · Como FRANK (comprador)
- [ ] La pestaña **Facturar** muestra el historial de precios.
- [ ] La pestaña Facturar **NO** muestra el pedido de cotización.
- [ ] "Compras del día" lista lo urgente primero.

### 1.5 · Almacén y aprobaciones
- [ ] Como **Anton**: recibir un material, registrar una salida.
- [ ] Como **residente**: aprobar esa salida (pestaña Aprobaciones).

---

## PASO 2 · Los cinco arreglos de facturas (25 minutos)

### 2.1 · Las anuladas ya no aparecen donde no deben
Necesitas una **factura anulada**. Si no hay: como Lucía registra una
sin pagar, y como gerencia la anulas con motivo.

- [ ] En **Pagos**: la factura anulada **ya NO aparece** en la cola.
- [ ] El **total de la obra** en Pagos bajó lo que valía esa factura.
- [ ] En **Compras**: la anulada **SÍ sigue apareciendo, tachada**, con
      su motivo y quién la anuló. *(Esto es lo correcto: es el rastro.)*
- [ ] En **Tablero**: "Facturado S/" no la cuenta.
- [ ] En **Auditoría**: no está en el CSV de conciliación ni en el total
      de la semana.

> Aviso: los números de gerencia van a **bajar** respecto a ayer. Es la
> corrección. Y la alerta de "facturas vencidas" va a saltar **una vez**
> más, porque cambió su conteo.

### 2.2 · Corregir una compra en efectivo (migración 53)
- [ ] Como **Frank**: registrar una factura en efectivo con un monto
      equivocado a propósito.
- [ ] Como **gerencia**: anularla con motivo → **debe dejar**.
- [ ] El gasto **desaparece del cuadre de caja** del día.
- [ ] Como **administración**: cerrar la rendición del día. Intentar
      anular otra factura en efectivo de ese día → **debe rechazar**
      diciendo que coordine con administración.

### 2.3 · El mensaje de las series (el arreglo 5)
- [ ] Como **Pagos**: intentar pagar un compromiso digitando un número
      de factura **que ya existe** para ese mismo proveedor.
- [ ] El mensaje debe decir **el número exacto**, con qué factura choca,
      y **"NO invente una variante del número"**.
      *(Antes decía "La factura ␣ de ese RUC", sin el número — por eso
      la gente inventaba `F001-000500-B`.)*

### 2.4 · Que los arreglos de la base no rompieron lo normal
- [ ] **Pagos** paga una factura por transferencia: entra normal.
- [ ] **Administración** digita la serie real de un compromiso: entra.
- [ ] **Gerencia** concilia y desconcilia una factura: la firma y la
      fecha aparecen y se limpian solas.
- [ ] **Lucía** registra una factura normal que cubre **varios ítems**
      de la misma obra: entra.
- [ ] **Lucía** registra un compromiso a 15 días. En Pagos debe vencer
      **el 31 de agosto**, no hoy.
- [ ] **Frank** registra una compra en efectivo: entra normal.

---

## Si algo falla

Anotar **qué rol, qué pantalla y qué botón**, y el texto exacto del
error si sale alguno. Con eso se ubica en minutos.

Nada de esto está en producción todavía: main sigue como estaba. El
merge se hace recién cuando esta lista pase.
