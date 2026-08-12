// ============================================================
// Pruebas del cuadre de caja chica (migración 38).
//
// Se corre con:  node test/caja.test.mjs
//
// Prueba la aritmética de la que depende el arqueo. Un error aquí no
// se ve en pantalla: se ve como una diferencia de caja que nadie sabe
// explicar, y al final del mes como plata que no cuadra.
// ============================================================

import { cuadreCaja, diferenciaArqueo, excedeTolerancia } from '../src/caja.js';

let ok = 0, fallos = 0;
const casi = (a, b) => Math.abs(a - b) < 0.005;

function prueba(nombre, fn) {
  try { fn(); ok++; console.log('  OK   ' + nombre); }
  catch (e) { fallos++; console.log('  FALLA ' + nombre + '\n        ' + e.message); }
}
function igual(real, esperado, que) {
  if (!casi(real, esperado)) throw new Error(`${que}: esperaba ${esperado}, salió ${real}`);
}

const REND = { id: 'r1', proyecto: 'MAIA', fecha: '2026-08-12' };
const ent = (n, monto, extra = {}) => ({ n, monto, proyecto: 'MAIA', fecha: '2026-08-12', ...extra });
const fac = (monto, extra = {}) => ({ monto, rendicionId: 'r1', ...extra });

console.log('\nCUADRE DEL DÍA\n');

prueba('el día del ejemplo del dueño: tres entregas y el vuelto', () => {
  const c = cuadreCaja(REND, [fac(1690)], [ent(1, 600), ent(2, 250), ent(3, 900)]);
  igual(c.recibido, 1750, 'recibido');
  igual(c.gastado, 1690, 'gastado');
  igual(c.debeDevolver, 60, 'debe devolver');
  igual(diferenciaArqueo(60, c.debeDevolver), 0, 'la caja cuadra');
});

prueba('una sola entrega, gasto parcial', () => {
  const c = cuadreCaja(REND, [fac(355)], [ent(1, 400)]);
  igual(c.debeDevolver, 45, 'debe devolver');
});

prueba('varias facturas del día se suman', () => {
  const c = cuadreCaja(REND, [fac(100), fac(250), fac(50)], [ent(1, 500)]);
  igual(c.gastado, 400, 'gastado');
  igual(c.debeDevolver, 100, 'debe devolver');
});

console.log('\nLO QUE NO DEBE CONTAR\n');

prueba('una factura ANULADA no es gasto (el sobrante fantasma)', () => {
  // Fondo 1000, compra de 300 anulada el mismo día. Antes esto daba
  // "sobran 300" y escalaba a gerencia por un problema inexistente.
  const c = cuadreCaja(REND, [fac(300, { anulMotivo: 'monto mal digitado' })], [ent(1, 1000)]);
  igual(c.gastado, 0, 'gastado');
  igual(c.debeDevolver, 1000, 'debe devolver');
  igual(diferenciaArqueo(1000, c.debeDevolver), 0, 'la caja cuadra');
});

prueba('una ENTREGA anulada no suma al disponible', () => {
  const c = cuadreCaja(REND, [fac(100)], [ent(1, 500), ent(2, 900, { anulMotivo: 'se transfirió dos veces' })]);
  igual(c.recibido, 500, 'recibido');
  igual(c.debeDevolver, 400, 'debe devolver');
});

prueba('las entregas de OTRA obra no cuentan', () => {
  const c = cuadreCaja(REND, [fac(100)], [ent(1, 500), { n: 2, monto: 9999, proyecto: 'DANAUS', fecha: '2026-08-12' }]);
  igual(c.recibido, 500, 'recibido');
});

prueba('las entregas de OTRO día no cuentan', () => {
  const c = cuadreCaja(REND, [fac(100)], [ent(1, 500), { n: 2, monto: 9999, proyecto: 'MAIA', fecha: '2026-08-11' }]);
  igual(c.recibido, 500, 'recibido');
});

prueba('las facturas de OTRA rendición no cuentan', () => {
  const c = cuadreCaja(REND, [fac(100), { monto: 9999, rendicionId: 'otra' }], [ent(1, 500)]);
  igual(c.gastado, 100, 'gastado');
});

console.log('\nCASOS QUE AVISAN DE UN PROBLEMA\n');

prueba('sin ninguna entrega registrada, el gasto sale como faltante', () => {
  // Es el caso que la pantalla avisa en naranja: si Pagos no registró
  // la entrega, el arqueo daría todo el efectivo como faltante.
  const c = cuadreCaja(REND, [fac(500)], []);
  igual(c.recibido, 0, 'recibido');
  igual(c.debeDevolver, -500, 'debe devolver');
});

prueba('gastó más de lo que recibió: debe devolver sale negativo', () => {
  const c = cuadreCaja(REND, [fac(700)], [ent(1, 500)]);
  igual(c.debeDevolver, -200, 'debe devolver');
});

prueba('falta plata: la diferencia sale negativa', () => {
  const c = cuadreCaja(REND, [fac(400)], [ent(1, 1000)]);
  igual(diferenciaArqueo(580, c.debeDevolver), -20, 'faltan 20');
});

prueba('sobra plata: la diferencia sale positiva', () => {
  const c = cuadreCaja(REND, [fac(400)], [ent(1, 1000)]);
  igual(diferenciaArqueo(615, c.debeDevolver), 15, 'sobran 15');
});

console.log('\nESCALAMIENTO A GERENCIA (tolerancia S/ 20)\n');

prueba('dentro de la tolerancia no escala', () => {
  if (excedeTolerancia(-20, 20)) throw new Error('20 exacto no debería escalar');
  if (excedeTolerancia(19.99, 20)) throw new Error('19.99 no debería escalar');
});

prueba('pasada la tolerancia escala, falte o sobre', () => {
  if (!excedeTolerancia(-20.01, 20)) throw new Error('un faltante de 20.01 debe escalar');
  if (!excedeTolerancia(20.01, 20)) throw new Error('un sobrante de 20.01 debe escalar');
});

console.log('\nDECIMALES (los céntimos del mundo real)\n');

prueba('tres entregas y dos facturas con céntimos', () => {
  const c = cuadreCaja(REND, [fac(133.33), fac(66.67)], [ent(1, 100.10), ent(2, 99.90), ent(3, 0.50)]);
  igual(c.recibido, 200.50, 'recibido');
  igual(c.gastado, 200.00, 'gastado');
  igual(c.debeDevolver, 0.50, 'debe devolver');
});

console.log('\nEL HISTÓRICO (rendiciones del modelo de fondo fijo)\n');

const VIEJA = { id: 'v1', proyecto: 'MAIA', fecha: '2026-08-09', montoFondo: 2000 };

prueba('una rendición anterior al cambio se lee con su fondo fijo', () => {
  const c = cuadreCaja(VIEJA, [fac(80, { rendicionId: 'v1' })], []);
  igual(c.recibido, 2000, 'recibido');
  igual(c.debeDevolver, 1920, 'sobrante');
  if (!c.historica) throw new Error('debería marcarse como histórica');
  if (c.faltaEntrega) throw new Error('en el histórico no falta ninguna entrega: nunca las hubo');
});

prueba('el faltante histórico de S/ 120 se sigue leyendo igual', () => {
  // Es el caso real que quedó en producción: fondo 2000, gastó 80,
  // contó 1800 → faltan 120. Debe dar lo mismo que antes del cambio.
  const c = cuadreCaja(VIEJA, [fac(80, { rendicionId: 'v1' })], []);
  igual(diferenciaArqueo(1800, c.debeDevolver), -120, 'faltan 120');
});

prueba('si una rendición vieja SÍ tiene entregas, mandan las entregas', () => {
  const c = cuadreCaja(VIEJA, [fac(80, { rendicionId: 'v1' })],
    [{ n: 1, monto: 300, proyecto: 'MAIA', fecha: '2026-08-09' }]);
  igual(c.recibido, 300, 'recibido');
  if (c.historica) throw new Error('con entregas registradas ya no es histórica');
});

prueba('un día del modelo nuevo sin entregas SÍ levanta la alarma', () => {
  const c = cuadreCaja({ ...REND, montoFondo: 2000 }, [fac(500)], []);
  igual(c.recibido, 0, 'no hereda el fondo fijo');
  if (!c.faltaEntrega) throw new Error('debería avisar que falta registrar la entrega');
});

console.log(`\n${ok} pruebas OK, ${fallos} fallas\n`);
process.exit(fallos ? 1 : 0);
