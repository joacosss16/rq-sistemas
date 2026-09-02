# PAGOS EN DÓLARES (pedido del dueño, 1 sep 2026)

## Qué pidió
Cada obra del piloto tiene un PAR de cuentas en su mismo banco: la de
soles (cargada en `proyectos_banco` el 1 sep) y una segunda en DÓLARES
que hoy no entra al sistema. En la semana 2, Mónica debe poder pagar
también en dólares.

## Dónde están los números
En `cuentas_obras.csv` (Downloads del dueño, 1 sep). A propósito NO se
copiaron al repo ni se cargaron: pagar una factura en USD contra la
cuenta en soles registrada mentiría en la conciliación contra el
extracto. El par de cada obra es consecutivo (Interbank ...392-2 soles /
...393-0 dólares; Scotiabank ...4085492 soles / ...5260723 dólares),
cada una con su CCI en el mismo CSV.

## Qué toca (diseñar como migración propia, atacarla antes de correrla)
- `proyectos_banco`: admite UNA cuenta por obra (`codigo` es PK).
  Ampliar: segunda fila por moneda o columna extra.
- `facturas`: no guarda moneda ni tipo de cambio. Decidir cómo viaja
  (el sistema entero está rotulado en S/; el valorizado, los KPI y el
  arqueo suman sin mirar moneda — una factura USD sumada como S/
  rompería todo lo que suma).
- La guarda de la migración 70 (el pago usa el banco de la obra) y el
  banco congelado en la factura pagada: hoy asumen una sola cuenta.
- El arqueo de caja chica NO se toca: el efectivo de Frank es S/.

## Regla de oro
No tocar nada del circuito de soles. Lo nuevo se añade al lado, no
encima.
