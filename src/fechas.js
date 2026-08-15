// ============================================================
// Fechas: la trampa de las 19:00
//
// La base guarda las horas en tiempo universal (UTC) y Cusco va cinco
// horas por detrás. Así que a partir de las 19:00 de Cusco, una hora
// guardada YA LLEVA LA FECHA DEL DÍA SIGUIENTE:
//
//     20:55 del 14 de agosto en Cusco  =  01:55 del 15 en UTC
//
// Comparar el texto de esa hora contra la fecha de hoy da falso todas
// las tardes. Eso hacía desaparecer los ítems que el comprador tomaba
// al final de su jornada — justo cuando más los toma.
//
// La regla: para saber de qué DÍA es una hora guardada, hay que
// convertirla al reloj de quien la mira, no leerle el prefijo.
// ============================================================

// Fecha local (la del reloj de quien mira) de una hora guardada.
export function diaLocal(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ¿Esa hora cae en el día `hoyISO`, contado en el reloj de quien mira?
export function esDelDia(ts, hoyISO) {
  return !!ts && diaLocal(ts) === hoyISO;
}
