# PENDIENTES DE LUCÍA — 1 sep 2026 (arranque del piloto)

Todo lo que el catálogo necesita de su dueña, por orden de urgencia.
Cada punto dice qué entregar y a quién. Nada de esto bloquea el
sistema completo, pero el punto 1 mantiene 41 materiales frenados
en los almacenes.

## 1. URGENTE · Equivalencias que faltan (41 materiales)
El archivo `datos/equivalencias_pendientes_lucia.csv` tiene 41
materiales que se compran en CAJA/PQT/ROLLO/PAR y no tienen
equivalencia. Llenar las dos columnas vacías de cada fila:
- **unidades_que_trae**: cuántas unidades sueltas trae el empaque
  (ej.: la caja de fulminantes trae 100)
- **unidad_suelta**: en qué unidad se cuenta y despacha en almacén
  (UND, MTS, GR, PAR…)
Si un empaque "se entrega entero y no se abre", escribir 1 y la
misma unidad de compra.
**Hasta que esto vuelva, los almacenes no despachan esos 41 códigos
por el sistema.** Ya hay otras 48 equivalencias cargadas (las que
salieron del inventario, la mayoría confirmadas por ella misma).

## 2. Dar de alta 4 materiales que DANAUS tiene físicamente
El catálogo nuevo no los trae y la obra los tiene en el estante
(no se pudo cargar su stock). Asignarles código y familia:
- TORNILLO SPACK PARA MADERA 5X60 — hay 500 UND
- BROCA DE CORONA DE DIAMANTE 25MM X M14 — hay 3 UND
- PUNTAS DE ACERO PZ3 25MM — hay 2 UND
- BENCINA — hay 2 (confirmar unidad: ¿ML?, ¿botella?)
Avisar los códigos asignados para cargarles su stock.

## 3. Recodificar los 7 que quedaron fuera del catálogo
En el Excel llevan código de 7 dígitos (el grupo 3901 se desbordó)
y el sistema exige 6. Hoy NO existen y nadie los puede pedir:
- 3901100 TELEVISOR DE 32" · 3901101 TELEVISOR DE 40"
- 3901102 BARBIJO KN95 · 3901103 BOLSA DE BASURA 240LT
- 3901104 PAPEL HIGIENICO INDUSTRIAL
- 3901105/06 EXTENSION VULCANIZADA 5MTS / 10MTS
Darles código válido en la familia que corresponda (¿93 BIENES Y
SERVICIOS AUXILIARES?). Si una obra los pide antes, el camino
normal sirve: solicitud de material nuevo y ella les pone el código
al aprobar.

## 4. Resolver 4 pares duplicados (misma descripción y unidad)
- 260315 y 260364 · PICAPORTE PARA CANDADO 3"
- 510217 y 510224 · TUBO ACERO NEGRO CUADRADO 75X75X1.8MM
- 510220 y 510226 · TUBO ACERO NEGRO CUADRADO 1-1/2"X1.8MM
- 900117 y 900154 · CODO THC BETA PP-RCT 20MM X 90°
En cada par: desactivar uno, o confirmar que son distintos y
diferenciar las descripciones. OJO: el stock de MAIA del codo ya
se cargó todo bajo 900117 (13 UND); si decide quedarse con el
900154, avisar antes de tocar nada.
(Las alertas de duplicados en su vista están vacías a propósito:
la curaduría anterior se borró con el reset porque los códigos
podían cambiar. Estos 4 pares son el punto de partida del repaso.)

## 5. Repaso de perecederos
- Los 205 marcados vienen de la clasificación automática de julio
  ajustada al catálogo nuevo. Los materiales NUEVOS del Excel del
  31.07 nadie los clasificó.
- Los almaceneros van a reportar códigos que piden fecha de
  caducidad sin tener caducidad real: quitarles la marca.

## 6. Verificar un RUC en SUNAT
15450561740 · LE MINGYU — el dígito verificador no cuadra (tipeo en
el Excel de origen). Buscar el RUC correcto; con él se agrega al
maestro (los otros 309 ya están cargados).

## 7. Sin apuro (semana 2) · 15 nombres de grupo
Para poder cargar las subfamilias: la hoja AIUDA no tiene nombre
para estos grupos que el catálogo sí usa:
1208, 1703, 3102, 3801, 5501, 6504, 7204, 7205, 7206, 8001, 8403,
9002, 9101, 9801, 9901.

## Pendiente que NO es de Lucía pero la toca: los enchapes
¿Familia 24 (CERÁMICA Y PORCELANATO) o la 97 (ACTIVOS FIJO), donde
caen hoy? Decisión de ella CON el dueño, antes de que la cotización
de enchapes cree más materiales en el sitio equivocado.
