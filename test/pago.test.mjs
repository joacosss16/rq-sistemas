// ============================================================
// Pruebas de las reglas de pago (ver src/pago.js).
// Se corre con:  node test/pago.test.mjs
//
// El vencimiento decide cuándo Pagos ve una factura en rojo. Hasta
// hoy, comprobarlo exigía registrar una factura real y entrar a la
// vista de Pagos a mirar la columna "Vence".
// ============================================================

import { FORMAS_PAGO, PLAZOS_CREDITO, esCredito, vencimientoDe, MEDIOS_PAGO, ETIQUETA_NRO, SIN_BANCO } from '../src/pago.js';

let ok = 0, fallos = 0;
function prueba(nombre, fn) {
  try { fn(); ok++; console.log('  OK   ' + nombre); }
  catch (e) { fallos++; console.log('  FALLA ' + nombre); console.log('        ' + e.message); }
}
const igual = (real, esp, que) => {
  if (JSON.stringify(real) !== JSON.stringify(esp)) throw new Error(`${que}: esperaba ${JSON.stringify(esp)}, salió ${JSON.stringify(real)}`);
};

console.log('\nEL VENCIMIENTO DE UNA FACTURA\n');

prueba('Inmediato vence el mismo día', () => {
  igual(vencimientoDe({ fecha: '2026-08-15', forma: 'Inmediato' }), '2026-08-15', 'inmediato');
});

prueba('Crédito 15 y Crédito 30 suman sus días', () => {
  igual(vencimientoDe({ fecha: '2026-08-15', forma: 'Crédito 15 días' }), '2026-08-30', 'a 15');
  igual(vencimientoDe({ fecha: '2026-08-15', forma: 'Crédito 30 días' }), '2026-09-14', 'a 30 cruza el mes');
});

prueba('el plazo cruza el año sin perderse', () => {
  igual(vencimientoDe({ fecha: '2026-12-20', forma: 'Crédito 30 días' }), '2027-01-19', 'diciembre a enero');
});

prueba('las formas viejas (Contado, Transferencia) vencen el mismo día, como se prometió', () => {
  // El comentario de FORMAS_PAGO promete compatibilidad con las facturas
  // ya guardadas cuando la lista tenía otros nombres. Esta prueba es esa
  // promesa por escrito.
  igual(vencimientoDe({ fecha: '2026-08-15', forma: 'Contado' }), '2026-08-15', 'Contado');
  igual(vencimientoDe({ fecha: '2026-08-15', forma: 'Transferencia' }), '2026-08-15', 'Transferencia');
});

prueba('DATO LEGADO: "Crédito" pelado vence el mismo día (los compromisos anteriores a la migración 52)', () => {
  // Antes de la migración 52 los compromisos se guardaban con forma
  // "Crédito" sin plazo, y por eso todos nacían venciendo hoy. Los ya
  // registrados se quedaron así A PROPÓSITO: nadie sabe qué plazo se
  // pactó en cada uno y adivinarlo sería inventar una fecha de pago.
  // Vencer hoy es el lado seguro: Pagos los ve antes, no después.
  // Si alguien "arregla" esto, cambia fechas de pago de deudas reales.
  igual(vencimientoDe({ fecha: '2026-08-15', forma: 'Crédito' }), '2026-08-15', 'Crédito pelado');
});

console.log('\nLAS LISTAS Y SUS CONTRATOS\n');

prueba('esCredito reconoce los plazos y también el "Crédito" pelado legado', () => {
  igual(esCredito('Crédito 15 días'), true, 'a 15');
  igual(esCredito('Crédito 30 días'), true, 'a 30');
  igual(esCredito('Crédito'), true, 'pelado');
  igual(esCredito('Inmediato'), false, 'inmediato');
  igual(esCredito(null), false, 'nulo no revienta');
  igual(esCredito(undefined), false, 'indefinido no revienta');
});

prueba('PLAZOS_CREDITO son exactamente los de FORMAS_PAGO que empiezan por Crédito', () => {
  igual(PLAZOS_CREDITO, ['Crédito 15 días', 'Crédito 30 días'], 'derivado, no copiado');
});

prueba('cada MEDIO tiene su etiqueta de número: si se agrega un medio sin etiqueta, el campo sale sin nombre', () => {
  for (const m of MEDIOS_PAGO) {
    if (!ETIQUETA_NRO[m]) throw new Error(`el medio "${m}" no tiene etiqueta en ETIQUETA_NRO`);
  }
});

prueba('solo la Nota de crédito va sin banco (no mueve dinero, queda fuera del CSV de conciliación)', () => {
  igual(SIN_BANCO('Nota de crédito'), true, 'nota');
  igual(SIN_BANCO('Transferencia'), false, 'transferencia');
  igual(SIN_BANCO('Cheque'), false, 'cheque');
  igual(SIN_BANCO('Tarjeta'), false, 'tarjeta');
});

console.log(`\n${ok} pruebas OK, ${fallos} fallas\n`);
process.exit(fallos ? 1 : 0);
