// ============================================================
// Pruebas de la trampa de las 19:00 (ver src/fechas.js).
// Se corre con:  node test/fechas.test.mjs
//
// Están escritas para no depender del reloj de la máquina: se
// construyen horas relativas a AHORA, así que valen igual en Cusco,
// en Lima o en un servidor en UTC.
// ============================================================

import { diaLocal, esDelDia } from '../src/fechas.js';

let ok = 0, fallos = 0;
function prueba(nombre, fn) {
  try { fn(); ok++; console.log('  OK   ' + nombre); }
  catch (e) { fallos++; console.log('  FALLA ' + nombre); console.log('        ' + e.message); }
}
const igual = (real, esp, que) => {
  if (real !== esp) throw new Error(`${que}: esperaba ${esp}, salió ${real}`);
};

const hoyLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const HOY = hoyLocal(new Date());

console.log('\nLA TRAMPA DE LAS 19:00\n');

prueba('el caso real que falló: 20:55 de Cusco guardado en UTC', () => {
  // 2026-08-14 20:55 en Cusco (UTC-5) se guarda como 2026-08-15T01:55Z.
  // El texto empieza por el día siguiente; el día local sigue siendo el 14.
  const ts = '2026-08-15T01:55:31.005876+00:00';
  igual(ts.slice(0, 10), '2026-08-15', 'el prefijo del texto');
  const d = new Date(ts);
  igual(diaLocal(ts), hoyLocal(d), 'el día local del dato');
  if (!esDelDia(ts, hoyLocal(d))) throw new Error('debería contarse como de ese día');
});

prueba('algo tomado hace un minuto cuenta como de hoy', () => {
  const ts = new Date(Date.now() - 60 * 1000).toISOString();
  if (!esDelDia(ts, HOY)) throw new Error('hace un minuto es hoy');
});

prueba('algo tomado hace 30 horas NO cuenta como de hoy', () => {
  const ts = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
  if (esDelDia(ts, HOY)) throw new Error('ayer no es hoy');
});

prueba('a las 23:50 de la noche sigue siendo hoy', () => {
  const d = new Date(); d.setHours(23, 50, 0, 0);
  if (!esDelDia(d.toISOString(), HOY)) throw new Error('las 23:50 son de hoy');
});

prueba('a las 00:10 de la madrugada ya es el día nuevo', () => {
  const d = new Date(); d.setHours(0, 10, 0, 0);
  if (!esDelDia(d.toISOString(), HOY)) throw new Error('las 00:10 son de hoy');
  const ayer = new Date(d); ayer.setDate(ayer.getDate() - 1);
  if (esDelDia(ayer.toISOString(), HOY)) throw new Error('las 00:10 de ayer no son de hoy');
});

console.log('\nLO QUE NO DEBE REVENTAR\n');

prueba('sin hora guardada no es de ningún día', () => {
  if (esDelDia(null, HOY)) throw new Error('null no es hoy');
  if (esDelDia('', HOY)) throw new Error('vacío no es hoy');
  if (esDelDia(undefined, HOY)) throw new Error('undefined no es hoy');
  igual(diaLocal(null), '', 'null');
  igual(diaLocal(''), '', 'vacío');
});

prueba('una hora inválida no rompe la pantalla', () => {
  igual(diaLocal('no es una fecha'), '', 'texto basura');
  if (esDelDia('no es una fecha', HOY)) throw new Error('basura no es hoy');
});

console.log(`\n${ok} pruebas OK, ${fallos} fallas\n`);
process.exit(fallos ? 1 : 0);
