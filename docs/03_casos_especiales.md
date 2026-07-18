# Casos especiales pendientes

## Diseñar en el esquema Supabase desde el día 1
1. **Stock inicial**: los almacenes ya tienen material sin RQ de origen. Tabla `stock_inicial` con carga por inventario físico, o el stock del sistema nunca cuadrará.
2. **RQ mixto multi-canal**: un RQ con ítems urgente + especial Lima. El canal ya se calcula; falta que Compras gestione tiempos por ítem.
3. **Compra consolidada**: un pedido a proveedor cubre ítems de varios RQs y varias obras. `factura_items` como puente N:M ya lo permite; la UI debe permitir cruzar proyectos.

## Fase 2 (después del piloto)
4. Rechazo en recepción por material dañado/equivocado (devuelve el ítem a Compras).
5. Notas de crédito y devoluciones al proveedor.
6. Etapa "Cotizado" (flujo original del CONTROL_RQ: PENDIENTE → COTIZADO → COMPRADO → ATENDIDO) para comparar cotizaciones.
7. Merma en granel: tolerancia % por tipo de material (arena, hormigón).

## Arquitectura
8. Idempotencia: doble clic en Enviar no duplica RQ.
9. Concurrencia: dos compradores editando el mismo ítem.
10. Facturación intercompany: "Transferir al costo" entre obras de razones sociales distintas requiere asiento entre empresas (coordinar con contabilidad).
11. Días hábiles vs calendario en el canal (¿RQ de viernes para lunes es urgente?).
