// ============================================================
// Maestros: la lista de obras activas y el almacenero de cada una.
// Movido de App.jsx (etapa 5 de la separación en módulos).
//
// Se llenan desde la base al cargar (tabla proyectos / usuarios con
// rol almacén). Empiezan vacíos y cargarTodo los puebla llamando a
// setMaestros — esa es la ÚNICA vía de escritura: un import de
// JavaScript es de solo lectura, así que ninguna vista puede
// tocarlos, solo leerlos.
//
// OJO: si alguien resuelve un error de compilación dejando una
// copia de estas dos declaraciones en otro archivo, la app COMPILA y
// arranca — pero los selectores de proyecto quedan vacíos para
// siempre, sin un solo error. Una sola definición, aquí.
// ============================================================
export let PROYECTOS = [];
export let ALMACENEROS = {};

export function setMaestros(proyectos, almaceneros) {
  PROYECTOS = proyectos;
  ALMACENEROS = almaceneros;
}
