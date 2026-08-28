// ============================================================
// Pruebas de la aritmética de stock (ver src/stock.js).
// Se corre con:  node test/stock.test.mjs
//
// Regla del negocio (CLAUDE.md): stock = recibido − salidas (no
// anuladas) ± préstamos netos (activos). Los ítems rechazados o
// anulados no generan stock. Una salida Pendiente NO descuenta:
// solo reserva hasta que el residente la apruebe (migración 18).
//
// Las fechas de caducidad se construyen relativas a HOY REAL (mismo
// patrón que test/fechas.test.mjs): estadoCaducidad lee el reloj por
// dentro y su firma no se cambia — la mudanza no reescribe nada.
// ============================================================

import { estadoCaducidad, calcularStocks, stockDetalleObra } from '../src/stock.js';
import { fmt } from '../src/fechas.js';

let ok = 0, fallos = 0;
function prueba(nombre, fn) {
  try { fn(); ok++; console.log('  OK   ' + nombre); }
  catch (e) { fallos++; console.log('  FALLA ' + nombre); console.log('        ' + e.message); }
}
const igual = (real, esp, que) => {
  if (JSON.stringify(real) !== JSON.stringify(esp)) throw new Error(`${que}: esperaba ${JSON.stringify(esp)}, salió ${JSON.stringify(real)}`);
};

// Hoy + n días, en el reloj local (el mismo que usa la aplicación)
const desplazado = n => {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Base mínima vacía; cada prueba arma solo lo que necesita
const base = () => ({ stockInicial: [], rqs: [], salidas: [], prestamos: [] });

console.log('\nEL SEMÁFORO DE CADUCIDAD\n');

prueba('sin fecha no hay semáforo', () => {
  igual(estadoCaducidad(null), null, 'null');
  igual(estadoCaducidad(''), null, 'vacío');
});

prueba('vencido ayer = VENCIDO (bloquea salida); vence HOY = rojo pero NO bloqueado', () => {
  igual(estadoCaducidad(desplazado(-1)).k, 'VENCIDO', 'ayer');
  const hoy = estadoCaducidad(desplazado(0));
  igual(hoy.k, 'vence en 0d', 'hoy');
  if (hoy.k === 'VENCIDO') throw new Error('vencer hoy no es estar vencido');
});

prueba('el borde de los 7 días: 7 es rojo, 8 es amarillo', () => {
  const d7 = estadoCaducidad(desplazado(7));
  const d8 = estadoCaducidad(desplazado(8));
  igual(d7.k, 'vence en 7d', 'a 7 días');
  if (!d7.cls.includes('red')) throw new Error('7 días debe ser rojo');
  igual(d8.k, 'vence en 8d', 'a 8 días');
  if (!d8.cls.includes('yellow')) throw new Error('8 días debe ser amarillo');
});

prueba('el borde de los 30: 30 es amarillo, 31 es gris con la fecha', () => {
  const d30 = estadoCaducidad(desplazado(30));
  const d31 = estadoCaducidad(desplazado(31));
  if (!d30.cls.includes('yellow')) throw new Error('30 días debe ser amarillo');
  igual(d31.k, fmt(desplazado(31)), 'a 31 días muestra la fecha');
  if (d31.cls.includes('yellow') || d31.cls.includes('red')) throw new Error('31 días no lleva alerta');
});

prueba('CONTRATO con Compras: "por vencer" se decide por cls.includes("yellow")', () => {
  // Compras (consolidado) huele el texto de las clases para sugerir
  // transferir antes de comprar. Si este contrato cambia, esa decisión
  // de negocio se apaga sin ningún error. No cambiar ni una letra.
  if (!estadoCaducidad(desplazado(15)).cls.includes('yellow')) throw new Error('15 días debe oler a yellow');
  if (estadoCaducidad(desplazado(3)).cls.includes('yellow')) throw new Error('3 días es rojo, no yellow');
});

console.log('\nSTOCK POR OBRA (calcularStocks)\n');

prueba('inicial + recibido suman; lo no aprobado no existe', () => {
  const db = base();
  db.stockInicial.push({ proyecto: 'MAIA', cod: '010101', cant: 5 });
  db.rqs.push({ proyecto: 'MAIA', items: [
    { decision: 'Aprobado', cod: '010101', cantRecibida: 10 },
    { decision: 'Rechazado', cod: '010101', cantRecibida: 99 },
    { decision: 'Pendiente', cod: '010101', cantRecibida: 99 },
    { decision: 'Aprobado', cod: '010101', cantRecibida: 0 },
  ] });
  igual(calcularStocks(db).MAIA['010101'].cant, 15, '5 inicial + 10 recibido');
});

prueba('la salida solo descuenta APROBADA y no anulada; la reingresada vuelve', () => {
  const db = base();
  db.stockInicial.push({ proyecto: 'MAIA', cod: '010101', cant: 20 });
  db.salidas.push(
    { proyecto: 'MAIA', cod: '010101', cant: 5, anulada: false, aprobacion: 'Aprobada' },
    { proyecto: 'MAIA', cod: '010101', cant: 7, anulada: true,  aprobacion: 'Aprobada' },   // anulada restaura
    { proyecto: 'MAIA', cod: '010101', cant: 4, anulada: false, aprobacion: 'Pendiente' },  // pendiente NO descuenta
    { proyecto: 'MAIA', cod: '010101', cant: 6, anulada: false, aprobacion: 'Aprobada', reingresada: 2 }, // uso incorrecto: 2 volvieron
  );
  igual(calcularStocks(db).MAIA['010101'].cant, 20 - 5 - (6 - 2), 'solo descuentan la de 5 y la de 6−2');
});

prueba('el préstamo activo mueve stock; el resuelto o rechazado no', () => {
  const db = base();
  db.stockInicial.push({ proyecto: 'MAIA', cod: '010101', cant: 10 }, { proyecto: 'LUZ', cod: '010101', cant: 2 });
  db.prestamos.push(
    { estado: 'Prestado',   origen: 'MAIA', destino: 'LUZ', cod: '010101', cant: 3 },
    { estado: 'Transferido', origen: 'MAIA', destino: 'LUZ', cod: '010101', cant: 1 },
    { estado: 'Devuelto',   origen: 'MAIA', destino: 'LUZ', cod: '010101', cant: 99 },
    { estado: 'Rechazado',  origen: 'MAIA', destino: 'LUZ', cod: '010101', cant: 99 },
    { estado: 'Anulado',    origen: 'MAIA', destino: 'LUZ', cod: '010101', cant: 99 },
  );
  const s = calcularStocks(db);
  igual(s.MAIA['010101'].cant, 10 - 3 - 1, 'origen pierde 4');
  igual(s.LUZ['010101'].cant, 2 + 3 + 1, 'destino gana 4');
});

// REGLA NUEVA (migración 73). Antes esta prueba afirmaba que un préstamo
// Solicitado "sin doble aprobación no toca stock", y era verdad... y era un
// agujero: mientras esperaba las firmas, el mismo material se podía prometer
// otra vez o sacarlo por una salida normal. El error reventaba al final, al
// firmar el segundo residente, cuando el material ya no estaba.
prueba('un préstamo SOLICITADO reserva en el origen, pero no llega al destino', () => {
  const db = base();
  db.stockInicial.push({ proyecto: 'MAIA', cod: '010101', cant: 10 }, { proyecto: 'LUZ', cod: '010101', cant: 2 });
  db.prestamos.push({ estado: 'Solicitado', origen: 'MAIA', destino: 'LUZ', cod: '010101', cant: 4 });
  const s = calcularStocks(db);
  igual(s.MAIA['010101'].cant, 10 - 4, 'el origen lo reserva desde que se solicita');
  igual(s.LUZ['010101'].cant, 2, 'el destino NO lo suma: todavía no ha llegado');
});

prueba('la caducidad guardada es la MÁS PRÓXIMA de lo recibido', () => {
  const db = base();
  db.rqs.push({ proyecto: 'MAIA', items: [
    { decision: 'Aprobado', cod: '020101', cantRecibida: 1, fechaCaducidad: '2026-12-01' },
    { decision: 'Aprobado', cod: '020101', cantRecibida: 1, fechaCaducidad: '2026-09-01' },
    { decision: 'Aprobado', cod: '020101', cantRecibida: 1, fechaCaducidad: '2027-01-01' },
  ] });
  igual(calcularStocks(db).MAIA['020101'].cadMin, '2026-09-01', 'la más próxima');
});

console.log('\nDETALLE POR OBRA (stockDetalleObra)\n');

prueba('la salida Pendiente reserva pero NO descuenta: stock igual, disponible menos', () => {
  const db = base();
  db.stockInicial.push({ proyecto: 'MAIA', cod: '010101', desc: 'ALAMBRE', und: 'KG', cant: 10 });
  db.salidas.push({ proyecto: 'MAIA', cod: '010101', desc: 'ALAMBRE', und: 'KG', cant: 4, anulada: false, aprobacion: 'Pendiente' });
  const [fila] = stockDetalleObra(db, 'MAIA');
  igual(fila.stock, 10, 'el físico no se mueve');
  igual(fila.reservado, 4, 'reservado hasta que el residente apruebe');
  igual(fila.disponible, 6, 'lo que aún se puede pedir');
});

prueba('un material con salidas y recepción corregida a cero SIGUE A LA VISTA en negativo', () => {
  // El bug ya pagado que documenta el comentario del fuente: la fila se
  // crea también desde la salida. Si desapareciera, el descuadre quedaría
  // invisible hasta que el siguiente intento de salida rebotara.
  const db = base();
  db.salidas.push({ proyecto: 'MAIA', cod: '010101', desc: 'ALAMBRE', und: 'KG', cant: 3, anulada: false, aprobacion: 'Aprobada' });
  const filas = stockDetalleObra(db, 'MAIA');
  igual(filas.length, 1, 'la fila existe aunque nada se recibió');
  igual(filas[0].stock, -3, 'y muestra el negativo, no lo esconde');
});

prueba('el préstamo neto entra al detalle por los dos lados', () => {
  const db = base();
  db.stockInicial.push({ proyecto: 'MAIA', cod: '010101', desc: 'ALAMBRE', und: 'KG', cant: 10 });
  db.prestamos.push({ estado: 'Prestado', origen: 'MAIA', destino: 'LUZ', cod: '010101', desc: 'ALAMBRE', und: 'KG', cant: 4 });
  igual(stockDetalleObra(db, 'MAIA')[0].stock, 6, 'origen: 10 − 4');
  igual(stockDetalleObra(db, 'LUZ')[0].stock, 4, 'destino: 0 + 4');
});

prueba('cada obra ve solo lo suyo', () => {
  const db = base();
  db.stockInicial.push({ proyecto: 'MAIA', cod: '010101', desc: 'ALAMBRE', und: 'KG', cant: 10 });
  db.stockInicial.push({ proyecto: 'LUZ', cod: '020202', desc: 'CEMENTO', und: 'BLS', cant: 7 });
  igual(stockDetalleObra(db, 'MAIA').length, 1, 'MAIA no ve LUZ');
  igual(stockDetalleObra(db, 'MAIA')[0].cod, '010101', 'y ve lo propio');
});

console.log(`\n${ok} pruebas OK, ${fallos} fallas\n`);
process.exit(fallos ? 1 : 0);
