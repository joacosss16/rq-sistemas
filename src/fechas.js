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

// ============================================================
// El "hoy" de la aplicación (movido de App.jsx, etapa 1 de la
// separación en módulos — mismo texto, solo cambió de archivo).
//
// HOY_ISO se calcula UNA vez al cargar la página. Tiene que haber UNA
// sola definición en todo src/ : App.jsx tiene un vigilante que recarga
// la página al cruzar la medianoche comparando contra este valor — si
// existieran dos copias, el vigilante miraría una y las pantallas otra,
// y la app amanecería con la fecha de ayer sin dar ningún error.
//
// El sufijo 'T00:00:00' de fmt y dias NO es decorativo: sin él, una
// fecha '2026-08-15' se interpreta en tiempo universal y en Cusco
// (UTC-5) se muestra como 14 de agosto. Hay una prueba que lo vigila.
// ============================================================
const HOY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
export const HOY_ISO = `${HOY.getFullYear()}-${String(HOY.getMonth() + 1).padStart(2, '0')}-${String(HOY.getDate()).padStart(2, '0')}`;
export const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
export const dias = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);
export const diasHoy = f => dias(f, HOY_ISO);
