# Modelo de datos del prototipo

## Entidades (estado en localStorage, clave `sistema_rq_copacabana_v1`)

### rqs[]
`{ n, proyecto, partida, residente, almacen, canal, just, fechaRQ, creadoPor, items[] }`

### rq_items (dentro de rqs[].items)
`{ id, cod, desc, und, cant, fecha (necesitada), destino, color, obs, decision (Pendiente|Aprobado|Rechazado|Anulado), estado (—|En camino|Entregado|Incompleto), motivoRechazo, motivoAnulacion, anuladoPor, fechaAnulacion, pago (—|Pagado|Crédito|Falta), factura (serie), fechaEntrega, fechaRecojoSaldo, fechaEntregaSaldo, comunicoResidente, destinoSaldo, cantRecibida, obsAlmacen }`

### facturas[]
`{ n, serie, prov, ruc, fecha, monto, forma, proyecto, registradoPor, items: [{rq, desc}] }`
Una factura cubre N ítems. Monto se suma UNA vez. Duplicado serie+RUC bloqueado.

### salidas[]
`{ n, fecha, proyecto, cod, desc, und, cant, hoja, zona, uso (Pendiente|Correcto|Incorrecto), motivoUso, registradoPor, anulada?, motivoAnulacion?, anuladoPor?, fechaAnulacion? }`

### prestamos[]
`{ n, fecha, origen, destino, cod, desc, und, cant, autoriza, estado (Prestado|Devuelto|Transferido|Anulado), fechaCierre?, motivoAnulacion?, anuladoPor?, registradoPor }`

### solicitudes[] (material nuevo)
`{ n, fecha, desc, und, fam, solicitante, proyecto, estado (Pendiente|Aprobado|Rechazado), motivo, codigo? }`

### catalogoExtra[] y provExtra[]
Materiales aprobados y proveedores nuevos que se suman a los maestros base.

## Invariantes verificados por el harness de pruebas
1. Fecha necesitada nunca en el pasado.
2. Recepción total ≤ cantidad pedida.
3. Salida ≤ stock disponible.
4. Devolución de préstamo bloqueada si stock del destino < cantidad prestada.
5. Ítem Entregado+Pagado desaparece de Compras.
6. Rechazado/Anulado no genera stock ni aparece por recibir.
7. Factura duplicada (serie+RUC) rechazada.
8. Canal: <2d URGENTE (justificación obligatoria), ≤7d GENERAL, >7d ESPECIAL LIMA.

## Fórmulas
Llegó = fechaEntrega − fechaRQ · Holgura = fechaNecesitada − fechaEntrega · Saldo = fechaEntregaSaldo − fechaEntrega
