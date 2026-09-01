// ============================================================
// Pruebas de la búsqueda del catálogo (ver src/busqueda.js).
// Se corre con:  node test/busqueda.test.mjs
// ============================================================

import { buscarEnCatalogo, coincide } from '../src/busqueda.js';

let ok = 0, fallos = 0;
function prueba(nombre, fn) {
  try { fn(); ok++; console.log('  OK   ' + nombre); }
  catch (e) { fallos++; console.log('  FALLA ' + nombre); console.log('        ' + e.message); }
}
const igual = (real, esp, que) => {
  if (JSON.stringify(real) !== JSON.stringify(esp)) throw new Error(`${que}: esperaba ${JSON.stringify(esp)}, salió ${JSON.stringify(real)}`);
};

// El contrato del catálogo: m[0]=código, m[1]=descripción, m[3]=familia
const CATALOGO = [
  ['010101', 'ALAMBRE GALVANIZADO N° 8', 'KG', 'FIERROS Y ALAMBRES'],
  ['020101', 'CEMENTO PORTLAND TIPO I', 'BLS', 'CEMENTOS'],
  ['020102', 'CEMENTO BLANCO', 'BLS', 'CEMENTOS'],
  ['030101', 'LADRILLO BLOCKER 10X20X30', 'UND', 'LADRILLOS'],
];

console.log('\nLA BÚSQUEDA DEL CATÁLOGO\n');

prueba('encuentra con las palabras en cualquier orden', () => {
  igual(buscarEnCatalogo(CATALOGO, 'blanco cemento', 10).length, 1, 'al revés');
  igual(buscarEnCatalogo(CATALOGO, 'cemento blanco', 10)[0][0], '020102', 'derecho');
});

prueba('exige TODAS las palabras, no cualquiera', () => {
  igual(buscarEnCatalogo(CATALOGO, 'cemento', 10).length, 2, 'una palabra: dos cementos');
  igual(buscarEnCatalogo(CATALOGO, 'cemento ladrillo', 10).length, 0, 'dos que no coinciden juntas');
});

prueba('menos de 2 caracteres no busca (evita listas gigantes al primer tecleo)', () => {
  igual(buscarEnCatalogo(CATALOGO, 'c', 10), [], 'una letra');
  igual(buscarEnCatalogo(CATALOGO, ' ', 10), [], 'solo espacio');
  igual(buscarEnCatalogo(CATALOGO, '', 10), [], 'vacío');
});

prueba('ignora espacios extra y no distingue mayúsculas', () => {
  igual(buscarEnCatalogo(CATALOGO, '  cemento   blanco  ', 10).length, 1, 'espacios dobles');
  igual(buscarEnCatalogo(CATALOGO, 'CeMeNtO', 10).length, 2, 'mayúsculas mezcladas');
});

prueba('CONTRATO: busca por código (m[0]) y por familia (m[3])', () => {
  // Si la capa de datos cambia el orden de las columnas del catálogo,
  // estas dos dejan de encontrar sin dar ningún error.
  igual(buscarEnCatalogo(CATALOGO, '020101', 10)[0][1], 'CEMENTO PORTLAND TIPO I', 'por código');
  igual(buscarEnCatalogo(CATALOGO, 'fierros', 10)[0][0], '010101', 'por familia');
});

prueba('respeta el tope de resultados', () => {
  igual(buscarEnCatalogo(CATALOGO, 'cemento', 1).length, 1, 'tope 1');
});

prueba('un material sin familia (m[3] vacío) no revienta', () => {
  igual(buscarEnCatalogo([['990101', 'MATERIAL SUELTO', 'UND']], 'suelto', 10).length, 1, 'sin familia');
});

console.log('\nFILTRO DE TABLAS (coincide)\n');

// La usan la tabla de stock del almacen y la de recepcion. Tiene que
// comportarse IGUAL que el buscador del catalogo: encontrar algo en una
// pantalla y no en la otra parece una averia, y quien busca deja de fiarse.
prueba('exige TODAS las palabras, en cualquier orden', () => {
  igual(coincide('CEMENTO PORTLAND TIPO I', 'cemento tipo'), true, 'las dos estan');
  igual(coincide('CEMENTO PORTLAND TIPO I', 'tipo cemento'), true, 'el orden da igual');
  igual(coincide('CEMENTO PORTLAND TIPO I', 'cemento azul'), false, 'falta una');
});

prueba('no distingue mayusculas ni espacios de mas', () => {
  igual(coincide('cemento portland', '  CEMENTO   portland '), true, 'espacios y mayusculas');
});

prueba('la busqueda vacia NO filtra nada', () => {
  // Si devolviera false, la tabla apareceria VACIA al entrar en la pestana.
  igual(coincide('LO QUE SEA', ''), true, 'vacia');
  igual(coincide('LO QUE SEA', '   '), true, 'solo espacios');
  igual(coincide('LO QUE SEA', null), true, 'sin valor');
});

prueba('un texto vacio o nulo no revienta', () => {
  igual(coincide(null, 'algo'), false, 'texto nulo no coincide');
  igual(coincide('', 'algo'), false, 'texto vacio no coincide');
  igual(coincide(undefined, ''), true, 'nulo con busqueda vacia sigue pasando');
});

prueba('encuentra por codigo y por numero de RQ, que es como se busca de verdad', () => {
  igual(coincide('010101 ALAMBRE NEGRO N16', '010101'), true, 'por codigo');
  igual(coincide('RQ-311 CEMENTO', 'rq-311'), true, 'por numero de RQ');
});

console.log(`\n${ok} pruebas OK, ${fallos} fallas\n`);
process.exit(fallos ? 1 : 0);
