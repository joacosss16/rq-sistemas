// ============================================================
// Stock: la aritmética que define cuánto hay en cada almacén.
// Movido de App.jsx (etapa 2 de la separación en módulos) con el
// texto idéntico; solo se agregó "export" y este encabezado.
//
// Regla de negocio (CLAUDE.md): stock = recibido − salidas (no
// anuladas) ± préstamos netos (activos), por almacén/obra. Los ítems
// rechazados o anulados no generan stock. Una salida Pendiente NO
// descuenta: solo reserva, hasta que el residente la apruebe.
//
// OJO con estadoCaducidad: Compras decide "por vencer" oliendo el
// texto de las clases (cls.includes('yellow')). El retorno es un
// contrato — hay pruebas que lo fijan; no cambiar ni una letra.
// ============================================================
import { diasHoy, fmt } from './fechas.js';

// Semáforo de caducidad: ≤7 días rojo, ≤30 amarillo, vencido bloquea salida
export function estadoCaducidad(fecha) {
  if (!fecha) return null;
  const d = diasHoy(fecha);
  if (d < 0) return { k: 'VENCIDO', cls: 'bg-red-950 text-red-400 border border-red-800' };
  if (d <= 7) return { k: `vence en ${d}d`, cls: 'bg-red-950 text-red-400' };
  if (d <= 30) return { k: `vence en ${d}d`, cls: 'bg-yellow-950 text-yellow-400' };
  return { k: fmt(fecha), cls: 'bg-slate-800 text-slate-400' };
}

// Stock por obra y material: inicial + recibido − salidas ± préstamos,
// con la caducidad más próxima conocida. Se usa en el consolidado de
// Compras para sugerir transferencias antes de comprar.
export function calcularStocks(db) {
  const map = {};
  const ent = (o, c) => { map[o] = map[o] || {}; return (map[o][c] = map[o][c] || { cant: 0, cadMin: null, lotes: [] }); };
  db.stockInicial.forEach(si => { ent(si.proyecto, si.cod).cant += si.cant; });
  db.rqs.forEach(r => r.items.forEach(i => {
    if (i.decision !== 'Aprobado') return;
    const rec = Number(i.cantRecibida || 0);
    if (rec > 0) {
      const e = ent(r.proyecto, i.cod);
      e.cant += rec;
      // Cada recepción con caducidad se guarda como LOTE, con su fecha de
      // llegada. La caducidad definitiva se calcula al final, cuando ya se sabe
      // cuánto queda: antes se tomaba el mínimo histórico de TODAS las
      // recepciones, así que un lote vencido y consumido hace meses seguía
      // marcando el material como vencido para siempre. Una alarma que no se
      // apaga nunca es una alarma que se deja de mirar.
      if (i.fechaCaducidad) e.lotes.push({ cad: i.fechaCaducidad, cant: rec, llego: i.fechaEntrega || i.fecha || '' });
    }
  }));
  db.salidas.forEach(s => { if (!s.anulada && s.aprobacion === 'Aprobada') ent(s.proyecto, s.cod).cant -= (s.cant - (s.reingresada || 0)); });
  db.prestamos.forEach(p => {
    // Un préstamo SOLICITADO ya reserva en el origen (migración 73): es
    // material comprometido aunque todavía no haya salido, y sin la reserva se
    // podía prometer dos veces. NO suma al destino: allá todavía no llegó.
    if (p.estado === 'Solicitado') { ent(p.origen, p.cod).cant -= p.cant; return; }
    if (!['Prestado', 'Transferido'].includes(p.estado)) return;
    ent(p.origen, p.cod).cant -= p.cant;
    ent(p.destino, p.cod).cant += p.cant;
  });
  // La caducidad de lo que QUEDA, no de lo que alguna vez entró. Sin control de
  // lotes en el almacén, la única suposición razonable es que se consume por
  // orden de llegada (lo primero que entra, lo primero que sale): se descuenta
  // lo ya consumido de los lotes más antiguos y la caducidad sale del más
  // próximo de los que siguen en pie.
  Object.values(map).forEach(porMat => Object.values(porMat).forEach(e => {
    if (!e.lotes.length) return;
    const enLotes = e.lotes.reduce((a, l) => a + l.cant, 0);
    let consumido = Math.max(0, enLotes - Math.max(0, e.cant));
    const vivos = [];
    e.lotes.slice().sort((a, b) => (a.llego < b.llego ? -1 : a.llego > b.llego ? 1 : 0)).forEach(l => {
      if (consumido >= l.cant) { consumido -= l.cant; return; }   // este lote ya se fue entero
      vivos.push({ ...l, cant: l.cant - consumido });
      consumido = 0;
    });
    e.cadMin = vivos.reduce((min, l) => (!min || l.cad < min ? l.cad : min), null);
  }));
  return map;
}

// Detalle de stock de una obra (inicial/recibido/salidas/préstamos/caducidad).
// Lo usan la vista del almacenero y la vista de solo lectura del residente.
export function stockDetalleObra(db, proy) {
  const stockMap = {};
  const entrada = (cod, desc, und) => {
    if (!stockMap[cod]) stockMap[cod] = { cod, desc, und, inicial: 0, recibido: 0, salido: 0, reservado: 0, prestNeto: 0, cadMin: null };
    return stockMap[cod];
  };
  db.stockInicial.filter(si => si.proyecto === proy).forEach(si => { entrada(si.cod, si.desc, si.und).inicial += si.cant; });
  db.rqs.filter(r => r.proyecto === proy).forEach(r => r.items.forEach(i => {
    if (i.decision !== 'Aprobado') return;
    const rec = Number(i.cantRecibida || 0);
    if (rec > 0) {
      const e = entrada(i.cod, i.desc, i.und);
      e.recibido += rec;
      if (i.fechaCaducidad && (!e.cadMin || i.fechaCaducidad < e.cadMin)) e.cadMin = i.fechaCaducidad;
    }
  }));
  db.salidas.filter(s => s.proyecto === proy && !s.anulada).forEach(s => {
    // La fila se crea también desde la salida, no solo desde lo recibido. Si una
    // recepción se corrige a cero, el material tiene que SEGUIR A LA VISTA con su
    // stock en negativo: antes desaparecía de la tabla mientras la base seguía
    // contando esas salidas, así que el descuadre quedaba invisible hasta que el
    // siguiente intento de salida lo rebotaba con un error incomprensible.
    const e = entrada(s.cod, s.desc, s.und);
    if (s.aprobacion === 'Aprobada') e.salido += (Number(s.cant) - Number(s.reingresada || 0));
    else if (s.aprobacion === 'Pendiente') e.reservado += Number(s.cant);   // reservado hasta que el residente apruebe
  });
  db.prestamos.forEach(p => {
    if (!['Prestado', 'Transferido'].includes(p.estado)) return;
    if (p.origen === proy) entrada(p.cod, p.desc, p.und).prestNeto -= Number(p.cant);
    if (p.destino === proy) entrada(p.cod, p.desc, p.und).prestNeto += Number(p.cant);
  });
  // stock = físico disponible; disponible = lo que aún se puede pedir (descuenta lo reservado por pendientes)
  return Object.values(stockMap).map(s => ({ ...s, stock: s.inicial + s.recibido - s.salido + s.prestNeto, disponible: s.inicial + s.recibido - s.salido + s.prestNeto - s.reservado }));
}
