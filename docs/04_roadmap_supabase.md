# Roadmap Supabase

## Objetivo
Multi-usuario real: Arana en oficina, residentes y almaceneros en obra, cada uno con su login, misma base de datos.

## Stack
React + Vite + Tailwind (mismo look del prototipo) + Supabase (Postgres + Auth + RLS). Hosting estimado ~$25/mes.

## Tablas
- `usuarios` (id → auth.users, nombre, rol: gerente|compras|residente|almacen, proyecto_asignado nullable)
- `materiales` (codigo pk 6 dígitos, descripcion, und, familia, activo)
- `proveedores` (ruc pk 11, razon_social)
- `rqs` (id, numero serial, proyecto, partida, residente_id, almacen_resp, canal, justificacion, fecha_rq, creado_por)
- `rq_items` (id, rq_id fk, codigo fk materiales, cant, fecha_necesitada, destino, color, obs, decision, estado, motivo_rechazo, anulacion jsonb, pago, fecha_entrega, fecha_recojo_saldo, fecha_entrega_saldo, comunico_residente, destino_saldo, cant_recibida, obs_almacen)
- `facturas` (id, serie, proveedor_ruc fk, fecha, monto, forma_pago, proyecto, registrado_por; unique(serie, proveedor_ruc))
- `factura_items` (factura_id fk, rq_item_id fk) — puente N:M
- `salidas` (id, fecha, proyecto, codigo fk, cant, hoja_trabajo, zona, uso, motivo_uso, registrado_por, anulacion jsonb)
- `prestamos` (id, fecha, origen, destino, codigo fk, cant, autoriza, estado, fecha_cierre, anulacion jsonb, registrado_por)
- `stock_inicial` (proyecto, codigo fk, cant, fecha_inventario, registrado_por)
- `solicitudes_material` (id, descripcion, und, familia, solicitante_id, proyecto, estado, motivo, codigo_asignado)

## RLS (resumen)
- residente: SELECT/INSERT rqs de su proyecto; SELECT su estado.
- almacen: UPDATE recepciones, INSERT salidas/préstamos de su proyecto.
- compras: todo en rqs/rq_items/facturas/proveedores/solicitudes.
- gerente: todo, solo lectura financiera + anulaciones.

## Validaciones que pasan de UI a base de datos (triggers/constraints)
- cant_recibida ≤ cant (check + trigger en recepción parcial)
- salida ≤ stock (función stock(proyecto, codigo) + trigger)
- devolución de préstamo bloqueada si stock destino < cant (trigger)
- fecha_necesitada ≥ fecha_rq (check)
- RUC ~ '^\d{11}$' (check)
- anulaciones: jsonb {motivo, por, fecha} NOT NULL cuando estado = Anulado

## Orden de trabajo
1. Crear proyecto Supabase + migración SQL con las tablas y RLS.
2. Seed: catálogo 1,740 (de NUEVO_RQ.xlsx) + 255 proveedores (de CONTROL_RQ_LUZ.xlsx) + usuarios reales.
3. Portar el prototipo a Vite; reemplazar useState/localStorage por queries Supabase (el shape de datos ya coincide).
4. Auth real (correos @grupocopacabana.com.pe).
5. Piloto: 1 obra, 2 residentes, 2 semanas. Medir: % RQs por el sistema, % urgentes, holgura.
