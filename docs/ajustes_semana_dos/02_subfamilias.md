# SUBFAMILIAS / GRUPOS (conversado con el dueño, 1 sep 2026)

## Qué es
El código de 6 dígitos ya contiene la subfamilia: son los dígitos 3-4
(`020109` → grupo `0201` ABRAZADERAS). Igual que la familia (dígitos
1-2), se puede materializar sin tocar un solo material ni recargar nada.

## Por qué NO se cargó el 1 sep (decisión razonada, no olvido)
1. El dato está incompleto: la hoja AIUDA de `datos/Materiales Final
   31.07.xlsx` nombra 135 grupos, pero 15 prefijos que el catálogo SÍ
   usa no tienen nombre: 1208, 1703, 3102, 3801, 5501, 6504, 7204,
   7205, 7206, 8001, 8403, 9002, 9101, 9801, 9901.
2. Necesita migración (tabla + columna generada) y ninguna pantalla la
   usa hoy: columna muerta en plena ruta de lanzamiento.
3. Esperar es gratis: el dato viaja dentro del código.

## Qué falta
- Lucía entrega los 15 nombres de grupo que faltan (pedido apuntado en
  su lista del 1 sep).
- Migración calcada de la 3 (`20260718000003_familias.sql`): tabla
  `grupos` (clave `^\d{4}$`, nombre) + columna generada
  `left(codigo, 4)` en `materiales` con FK. Atacarla antes de correrla.
- Decidir qué pantalla la usa (¿filtro en catálogo? ¿consolidado de
  Compras?) — sin uso, no correr la migración todavía.
