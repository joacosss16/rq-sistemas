// ============================================================
// Reporte mensual por perfil (solo gerencia) + su grafico BarrasMes.
// Viajan juntos: BarrasMes no lo usa nadie mas. Movido de App.jsx
// (etapa 8 de la separacion en modulos) con el texto identico; solo
// se agrego export y estos imports. Dentro del CSV viaja un caracter
// INVISIBLE (U+FEFF): es lo que hace que Excel abra las tildes bien.
// Sus componentes internos (Bloque/Tarjeta/Cel) se quedan DENTRO de
// la funcion aunque un linter sugiera sacarlos.
// ============================================================
import { useState, useMemo } from 'react';
import { HOY_ISO, fmt, dias } from '../fechas';
import { inputCls, thCls } from '../ui';

// Gráfico de barras por mes (SVG inline: sin librerías, funciona offline)
export function BarrasMes({ datos, color = '#facc15', sufijo = '', titulo }) {
  const max = Math.max(1, ...datos.map(d => d.valor));
  const W = 260, H = 84, n = Math.max(1, datos.length), ancho = W / n;
  return (
    <div className="bg-slate-950 border border-slate-800 rounded p-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">{titulo}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 84 }}>
        {datos.map((d, i) => {
          const h = Math.round((d.valor / max) * (H - 26));
          return (
            <g key={d.mes}>
              <rect x={i * ancho + 4} y={H - 16 - h} width={ancho - 8} height={h} fill={color} rx="2"
                opacity={i === datos.length - 1 ? 1 : 0.5} />
              <text x={i * ancho + ancho / 2} y={H - 19 - h} textAnchor="middle" fill="#cbd5e1" fontSize="9">
                {d.valor}{sufijo}</text>
              <text x={i * ancho + ancho / 2} y={H - 4} textAnchor="middle" fill="#64748b" fontSize="8">
                {d.etiqueta}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Reporte mensual por perfil — solo gerencia. Cabecera con gráficos de desempeño
// y luego un bloque por rol con sus indicadores del mes.
export function ReporteMensual({ db }) {
  const { rqs, facturas, salidas, prestamos, solicitudes, rendiciones = [] } = db;
  const [mes, setMes] = useState(HOY_ISO.slice(0, 7));

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
  const etiqMes = m => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
  const nombreMes = m => {
    const largos = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${largos[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
  };

  // meses con actividad (de RQs y facturas), del más reciente al más antiguo
  const mesesDisponibles = useMemo(() => {
    const s = new Set();
    rqs.forEach(r => { if (r.fechaRQ) s.add(r.fechaRQ.slice(0, 7)); });
    facturas.forEach(f => { if (f.fecha) s.add(f.fecha.slice(0, 7)); });
    s.add(HOY_ISO.slice(0, 7));
    return [...s].sort().reverse();
  }, [rqs, facturas]);

  const flatAll = useMemo(() => rqs.flatMap(r => r.items.map(i => ({
    ...i, rq: r.n, canalRq: r.canal, proyecto: r.proyecto, fechaRQ: r.fechaRQ, residente: r.residente,
  }))), [rqs]);

  const delMes = (f, m) => !!f && f.slice(0, 7) === m;

  // ── Serie de los últimos 6 meses (cabecera de gráficos)
  const serie = useMemo(() => {
    const [a, m] = mes.split('-').map(Number);
    const lista = [];
    for (let k = 5; k >= 0; k--) {
      const d = new Date(Date.UTC(a, m - 1 - k, 1));
      lista.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    return lista.map(mm => {
      const rqsM = rqs.filter(r => delMes(r.fechaRQ, mm));
      const itemsM = flatAll.filter(i => delMes(i.fechaRQ, mm));
      const holg = itemsM.filter(i => i.fechaEntrega && i.fecha).map(i => dias(i.fecha, i.fechaEntrega));
      return {
        mes: mm, etiqueta: etiqMes(mm),
        rqs: rqsM.length,
        urg: rqsM.length ? Math.round(rqsM.filter(r => r.canal === 'URGENTE').length / rqsM.length * 100) : 0,
        aTiempo: holg.length ? Math.round(holg.filter(h => h >= 0).length / holg.length * 100) : 0,
        entregados: itemsM.filter(i => i.estado === 'Entregado').length,
      };
    });
  }, [mes, rqs, flatAll]);

  // ── Datos del mes elegido
  const rqsM = rqs.filter(r => delMes(r.fechaRQ, mes));
  const itemsM = flatAll.filter(i => delMes(i.fechaRQ, mes));
  // Las anuladas no se cuentan como facturado: nunca movieron plata.
  const factM = facturas.filter(f => !f.anulMotivo && delMes(f.fecha, mes));
  const salM = salidas.filter(s => delMes(s.fecha, mes));
  const presM = prestamos.filter(p => delMes(p.fecha, mes));
  const solM = (solicitudes || []).filter(s => delMes(s.fecha, mes));

  // ── RESIDENTES
  const porResidente = useMemo(() => Object.values(rqsM.reduce((acc, r) => {
    const k = r.residente || '—';
    const a = (acc[k] = acc[k] || { nombre: k, obra: r.proyecto, rqs: 0, urg: 0, items: 0, rech: 0, holg: [] });
    a.rqs++; if (r.canal === 'URGENTE') a.urg++;
    a.items += r.items.length;
    a.rech += r.items.filter(i => i.decision === 'Rechazado').length;
    r.items.forEach(i => { if (i.fechaEntrega && i.fecha) a.holg.push(dias(i.fecha, i.fechaEntrega)); });
    return acc;
  }, {})).map(a => ({
    ...a,
    urgPct: a.rqs ? Math.round(a.urg / a.rqs * 100) : 0,
    holgProm: a.holg.length ? +(a.holg.reduce((x, y) => x + y, 0) / a.holg.length).toFixed(1) : null,
    aTiempo: a.holg.length ? Math.round(a.holg.filter(h => h >= 0).length / a.holg.length * 100) : null,
  })).sort((x, y) => y.rqs - x.rqs), [rqsM]);

  // ── COMPRAS
  const compras = {
    aprobados: itemsM.filter(i => i.decision === 'Aprobado').length,
    rechazados: itemsM.filter(i => i.decision === 'Rechazado').length,
    anulados: itemsM.filter(i => i.decision === 'Anulado').length,
    pendientes: itemsM.filter(i => !i.decision || i.decision === '—' || i.decision === 'Pendiente').length,
    facturas: factM.length,
    monto: factM.reduce((a, f) => a + f.monto, 0),
    matAprobados: solM.filter(s => s.estado === 'Aprobado').length,
    matRechazados: solM.filter(s => s.estado === 'Rechazado').length,
  };

  // ── ALMACÉN (por obra)
  const porAlmacen = useMemo(() => {
    const m = {};
    itemsM.forEach(i => {
      const a = (m[i.proyecto] = m[i.proyecto] || { obra: i.proyecto, recibidos: 0, incompletos: 0, salidas: 0, incorrectas: 0, verificadas: 0, prestamos: 0 });
      if (i.estado === 'Entregado') a.recibidos++;
      if (i.estado === 'Incompleto') a.incompletos++;
    });
    salM.filter(s => !s.anulada).forEach(s => {
      const a = (m[s.proyecto] = m[s.proyecto] || { obra: s.proyecto, recibidos: 0, incompletos: 0, salidas: 0, incorrectas: 0, verificadas: 0, prestamos: 0 });
      a.salidas++;
      if (s.uso && s.uso !== 'Pendiente') { a.verificadas++; if (s.uso === 'Incorrecto') a.incorrectas++; }
    });
    presM.forEach(p => {
      const a = (m[p.origen] = m[p.origen] || { obra: p.origen, recibidos: 0, incompletos: 0, salidas: 0, incorrectas: 0, verificadas: 0, prestamos: 0 });
      a.prestamos++;
    });
    return Object.values(m).map(a => ({ ...a, incorrPct: a.verificadas ? Math.round(a.incorrectas / a.verificadas * 100) : null }))
      .sort((x, y) => (y.recibidos + y.salidas) - (x.recibidos + x.salidas));
  }, [itemsM, salM, presM]);

  // ── PAGOS
  const pagadasM = facturas.filter(f => delMes(f.fechaPago, mes));
  const plazos = pagadasM.filter(f => f.fecha && f.fechaPago).map(f => dias(f.fechaPago, f.fecha));
  const pagos = {
    pagadas: pagadasM.length,
    montoPagado: pagadasM.reduce((a, f) => a + f.monto, 0),
    plazoProm: plazos.length ? (plazos.reduce((a, b) => a + b, 0) / plazos.length).toFixed(1) : '—',
    pendientes: facturas.filter(f => !f.anulMotivo && f.estadoPago !== 'Pagada').length,
    deuda: facturas.filter(f => !f.anulMotivo && f.estadoPago !== 'Pagada').reduce((a, f) => a + f.monto, 0),
  };

  // ── DIFERENCIAS DE CAJA CHICA (la goterita diaria es lo que importa)
  const renM = rendiciones.filter(r => delMes(r.fecha, mes)).map(r => {
    // Sin las anuladas, igual que en la vista de Rendiciones: una factura
    // anulada no es gasto y contarla inventaba un sobrante en el arqueo.
    const rendido = facturas.filter(f => f.rendicionId === r.id && !f.anulMotivo).reduce((a, f) => a + f.monto, 0);
    return { ...r, rendido, teorico: r.montoFondo - rendido };
  });
  const difCaja = useMemo(() => {
    const conDif = renM.filter(r => r.diferencia != null && Math.abs(r.diferencia) >= 0.005);
    const porObra = {};
    conDif.forEach(r => {
      const k = `${r.proyecto}||${r.responsable || '—'}`;
      const a = (porObra[k] = porObra[k] || { obra: r.proyecto, responsable: r.responsable || '—', dias: 0, falta: 0, sobra: 0, neto: 0, escaladas: 0 });
      a.dias += 1;
      if (r.diferencia < 0) a.falta += -r.diferencia; else a.sobra += r.diferencia;
      a.neto += r.diferencia;
      if (r.difPor) a.escaladas += 1;
    });
    return {
      filas: Object.values(porObra).sort((a, b) => a.neto - b.neto),
      conDif,
      arqueadas: renM.filter(r => r.efectivoContado != null).length,
      total: renM.length,
      netoTotal: conDif.reduce((a, r) => a + r.diferencia, 0),
      faltanteTotal: conDif.filter(r => r.diferencia < 0).reduce((a, r) => a - r.diferencia, 0),
    };
  }, [renM]);

  // ── COMPRADOR (Frank)
  const porComprador = useMemo(() => {
    const m = {};
    itemsM.filter(i => i.compradoPor).forEach(i => {
      const a = (m[i.compradoPor] = m[i.compradoPor] || { nombre: i.compradoPor, items: 0 });
      a.items++;
    });
    return Object.values(m).sort((x, y) => y.items - x.items);
  }, [itemsM]);

  const sol = n => 'S/ ' + n.toFixed(2);

  // Desglose: al hacer clic en un indicador se abre el detalle que hay detrás
  const [detalle, setDetalle] = useState(null);   // { bloque, titulo, cols, filas }
  const abrir = (bloque, titulo, cols, filas) =>
    setDetalle(d => (d && d.titulo === titulo ? null : { bloque, titulo, cols, filas }));
  const rqDe = n => 'RQ-' + String(n).padStart(3, '0');

  const csv = () => {
    const esc = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const filas = [['Perfil', 'Nombre/Obra', 'Indicador', 'Valor']];
    porResidente.forEach(r => {
      filas.push(['Residente', r.nombre, 'RQs', r.rqs], ['Residente', r.nombre, 'Items', r.items],
        ['Residente', r.nombre, '% urgentes', r.urgPct + '%'], ['Residente', r.nombre, 'Rechazados', r.rech],
        ['Residente', r.nombre, 'Holgura prom (d)', r.holgProm ?? '—'], ['Residente', r.nombre, 'A tiempo %', r.aTiempo ?? '—']);
    });
    Object.entries({ 'Items aprobados': compras.aprobados, 'Items rechazados': compras.rechazados, 'Items anulados': compras.anulados,
      'Facturas registradas': compras.facturas, 'Monto facturado': compras.monto.toFixed(2),
      'Materiales nuevos aprobados': compras.matAprobados }).forEach(([k, v]) => filas.push(['Compras', 'Lucía Arana', k, v]));
    porAlmacen.forEach(a => filas.push(['Almacén', a.obra, 'Items recibidos', a.recibidos], ['Almacén', a.obra, 'Incompletos', a.incompletos],
      ['Almacén', a.obra, 'Salidas', a.salidas], ['Almacén', a.obra, '% uso incorrecto', a.incorrPct === null ? '—' : a.incorrPct + '%']));
    Object.entries({ 'Facturas pagadas': pagos.pagadas, 'Monto pagado': pagos.montoPagado.toFixed(2),
      'Plazo promedio (d)': pagos.plazoProm, 'Facturas pendientes': pagos.pendientes, 'Deuda pendiente': pagos.deuda.toFixed(2) })
      .forEach(([k, v]) => filas.push(['Pagos', '—', k, v]));
    porComprador.forEach(c => filas.push(['Comprador', c.nombre, 'Items comprados', c.items]));
    const texto = '﻿' + filas.map(f => f.map(esc).join(',')).join('\n');
    const blob = new Blob([texto], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `reporte_mensual_${mes}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const Bloque = ({ id, titulo, sub, children }) => (
    <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
      <div className="text-[11px] font-bold tracking-widest text-yellow-400 uppercase">{titulo}</div>
      {sub && <div className="text-[10px] text-slate-500 mb-2">{sub}</div>}
      <div className="mt-2">{children}</div>
      {detalle && detalle.bloque === id && (
        <div className="mt-3 border-t border-slate-700 pt-3">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <div className="text-[10px] font-bold uppercase tracking-wider text-yellow-400">
              {detalle.titulo} · {detalle.filas.length}</div>
            <button onClick={() => setDetalle(null)}
              className="ml-auto px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200">✕ Cerrar</button>
          </div>
          {detalle.filas.length === 0 ? (
            <div className="text-slate-500 text-[11px] py-2">Sin registros.</div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead><tr>{detalle.cols.map((h, i) => <th key={i} className={`${thCls} sticky top-0 bg-slate-900`}>{h}</th>)}</tr></thead>
                <tbody>
                  {detalle.filas.map((f, i) => (
                    <tr key={i} className="border-b border-slate-800">
                      {f.map((c, j) => <td key={j} className="py-1.5 px-1.5 text-slate-300 align-top">{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
  // Tarjeta clicable: si trae onClick, se puede desplegar su detalle
  const Tarjeta = ({ l, v, c = 'text-slate-100', onClick, activa }) => (
    <div onClick={onClick}
      className={`bg-slate-950 border rounded p-2 ${onClick ? 'cursor-pointer hover:border-yellow-400' : ''} ${activa ? 'border-yellow-400' : 'border-slate-800'}`}>
      <div className={`text-sm font-bold ${c}`}>{v}</div>
      <div className="text-[9px] uppercase tracking-wider text-slate-500 mt-0.5">{l}{onClick ? ' ›' : ''}</div>
    </div>
  );
  // Celda de tabla clicable
  const Cel = ({ children, onClick, cls = '' }) => (
    <td onClick={onClick} className={`py-1.5 px-1.5 ${cls} ${onClick ? 'cursor-pointer hover:text-yellow-400 underline decoration-dotted underline-offset-2' : ''}`}>{children}</td>
  );
  const vacio = <div className="text-slate-500 text-[11px] py-2">Sin movimientos en este mes.</div>;

  return (
    <div>
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Reporte mensual por perfil</div>
            <div className="text-slate-100 text-lg font-bold capitalize">{nombreMes(mes)}</div>
          </div>
          <select value={mes} onChange={e => setMes(e.target.value)} className={`${inputCls} ml-auto`}>
            {mesesDisponibles.map(m => <option key={m} value={m}>{nombreMes(m)}</option>)}
          </select>
          <button onClick={csv} className="px-2.5 py-1.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700 hover:border-yellow-400 hover:text-yellow-400">⤓ CSV</button>
          <button onClick={() => window.print()} className="px-2.5 py-1.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700 hover:border-yellow-400 hover:text-yellow-400">⎙ Imprimir</button>
        </div>
        <div className="grid md:grid-cols-4 gap-2 mt-3">
          <BarrasMes titulo="RQs por mes" datos={serie.map(s => ({ mes: s.mes, etiqueta: s.etiqueta, valor: s.rqs }))} />
          <BarrasMes titulo="% urgentes (mala planificación)" color="#f87171" sufijo="%" datos={serie.map(s => ({ mes: s.mes, etiqueta: s.etiqueta, valor: s.urg }))} />
          <BarrasMes titulo="Entrega a tiempo" color="#4ade80" sufijo="%" datos={serie.map(s => ({ mes: s.mes, etiqueta: s.etiqueta, valor: s.aTiempo }))} />
          <BarrasMes titulo="Ítems entregados" color="#38bdf8" datos={serie.map(s => ({ mes: s.mes, etiqueta: s.etiqueta, valor: s.entregados }))} />
        </div>
      </div>

      <Bloque id="res" titulo="Residentes" sub="Quién planifica y quién apaga incendios: a más % urgentes, peor planificación. Haz clic en cualquier número para ver el detalle.">
        {porResidente.length === 0 ? vacio : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['Residente', 'Obra', 'RQs', 'Ítems', '% Urgentes', 'Rechazados', 'Holgura prom', 'A tiempo'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {porResidente.map(r => {
                  const susRqs = rqsM.filter(x => (x.residente || '—') === r.nombre);
                  const susItems = itemsM.filter(x => (x.residente || '—') === r.nombre);
                  const conEntrega = susItems.filter(i => i.fechaEntrega && i.fecha);
                  return (
                  <tr key={r.nombre} className="border-b border-slate-800">
                    <td className="py-1.5 px-1.5 text-slate-200">{r.nombre}</td>
                    <td className="py-1.5 px-1.5 text-slate-400">{r.obra}</td>
                    <Cel cls="font-mono text-slate-300"
                      onClick={() => abrir('res', `RQs de ${r.nombre}`, ['N° RQ', 'Fecha', 'Canal', 'Partida', 'Nivel', 'Ítems'],
                        susRqs.map(x => [rqDe(x.n), fmt(x.fechaRQ), x.canal, x.partida, x.piso || '—', x.items.length]))}>{r.rqs}</Cel>
                    <Cel cls="font-mono text-slate-300"
                      onClick={() => abrir('res', `Ítems pedidos por ${r.nombre}`, ['RQ', 'Material', 'Cant', 'Necesitada', 'Decisión', 'Estado'],
                        susItems.map(i => [rqDe(i.rq), i.desc, `${i.cant} ${i.und}`, fmt(i.fecha), i.decision || '—', i.estado || '—']))}>{r.items}</Cel>
                    <Cel cls={`font-mono font-bold ${r.urgPct >= 50 ? 'text-red-400' : r.urgPct >= 25 ? 'text-yellow-400' : 'text-green-400'}`}
                      onClick={() => abrir('res', `RQs URGENTES de ${r.nombre} · por qué no se previó`, ['N° RQ', 'Fecha', 'Partida', 'Justificación del residente'],
                        susRqs.filter(x => x.canal === 'URGENTE').map(x => [rqDe(x.n), fmt(x.fechaRQ), x.partida, x.just || '— (sin justificar)']))}>{r.urgPct}%</Cel>
                    <Cel cls="font-mono text-slate-400"
                      onClick={() => abrir('res', `Ítems rechazados a ${r.nombre}`, ['RQ', 'Material', 'Cant', 'Motivo del rechazo'],
                        susItems.filter(i => i.decision === 'Rechazado').map(i => [rqDe(i.rq), i.desc, `${i.cant} ${i.und}`, i.motivoRechazo || '—']))}>{r.rech}</Cel>
                    <Cel cls={`font-mono ${r.holgProm === null ? 'text-slate-500' : r.holgProm < 0 ? 'text-red-400' : 'text-green-400'}`}
                      onClick={() => abrir('res', `Holgura de ${r.nombre} (necesitada − entrega)`, ['RQ', 'Material', 'Necesitada', 'Entregado', 'Holgura'],
                        conEntrega.map(i => { const h = dias(i.fecha, i.fechaEntrega); return [rqDe(i.rq), i.desc, fmt(i.fecha), fmt(i.fechaEntrega), h + 'd' + (h < 0 ? ' ⚠ tarde' : '')]; }))}>{r.holgProm === null ? '—' : r.holgProm + 'd'}</Cel>
                    <Cel cls={`font-mono ${r.aTiempo === null ? 'text-slate-500' : r.aTiempo >= 80 ? 'text-green-400' : 'text-yellow-400'}`}
                      onClick={() => abrir('res', `Entregas tarde a ${r.nombre}`, ['RQ', 'Material', 'Necesitada', 'Entregado', 'Días de atraso'],
                        conEntrega.filter(i => dias(i.fecha, i.fechaEntrega) < 0).map(i => [rqDe(i.rq), i.desc, fmt(i.fecha), fmt(i.fechaEntrega), Math.abs(dias(i.fecha, i.fechaEntrega)) + 'd']))}>{r.aTiempo === null ? '—' : r.aTiempo + '%'}</Cel>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Bloque>

      <Bloque id="com" titulo="Compras · Lucía Arana" sub="Decisiones sobre los ítems del mes y facturas registradas. Haz clic en un indicador para ver el detalle.">
        {(() => {
          const itemsPorDecision = d => itemsM.filter(i => d === 'Pendiente'
            ? (!i.decision || i.decision === '—' || i.decision === 'Pendiente') : i.decision === d);
          const colsItems = ['RQ', 'Obra', 'Material', 'Cant', 'Necesitada', 'Motivo'];
          const filaItem = i => [rqDe(i.rq), i.proyecto, i.desc, `${i.cant} ${i.und}`, fmt(i.fecha),
            i.motivoRechazo || i.motivoAnulacion || '—'];
          return (
          <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <Tarjeta l="Ítems aprobados" v={compras.aprobados} c="text-green-400"
              onClick={() => abrir('com', 'Ítems aprobados', colsItems, itemsPorDecision('Aprobado').map(filaItem))} />
            <Tarjeta l="Rechazados" v={compras.rechazados} c="text-red-400"
              onClick={() => abrir('com', 'Ítems rechazados y su motivo', colsItems, itemsPorDecision('Rechazado').map(filaItem))} />
            <Tarjeta l="Anulados" v={compras.anulados} c="text-slate-400"
              onClick={() => abrir('com', 'Ítems anulados y su motivo', colsItems, itemsPorDecision('Anulado').map(filaItem))} />
            <Tarjeta l="Sin decidir" v={compras.pendientes} c={compras.pendientes > 0 ? 'text-yellow-400' : 'text-slate-400'}
              onClick={() => abrir('com', 'Ítems que siguen sin decisión', colsItems, itemsPorDecision('Pendiente').map(filaItem))} />
            <Tarjeta l="Facturas registradas" v={compras.facturas}
              onClick={() => abrir('com', 'Facturas registradas en el mes', ['Serie', 'Fecha', 'Proveedor', 'RUC', 'Obra', 'Monto', 'Forma', 'Estado'],
                factM.map(f => [f.serie, fmt(f.fecha), f.prov, f.ruc, f.proyecto, sol(f.monto), f.forma, f.estadoPago]))} />
            <Tarjeta l="Monto facturado" v={sol(compras.monto)}
              onClick={() => abrir('com', 'Facturado del mes, de mayor a menor', ['Serie', 'Proveedor', 'Obra', 'Monto', 'Ítems que cubre'],
                [...factM].sort((a, b) => b.monto - a.monto).map(f => [f.serie, f.prov, f.proyecto, sol(f.monto),
                  (f.items || []).map(x => x.desc).join(' · ') || '—']))} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-2">
            <Tarjeta l="Materiales nuevos aprobados" v={compras.matAprobados} c="text-green-400"
              onClick={() => abrir('com', 'Materiales nuevos aprobados al catálogo', ['Material', 'Und', 'Familia', 'Código asignado'],
                solM.filter(s => s.estado === 'Aprobado').map(s => [s.desc, s.und, s.fam || '—', s.codigo || '—']))} />
            <Tarjeta l="Materiales rechazados" v={compras.matRechazados} c="text-slate-400"
              onClick={() => abrir('com', 'Solicitudes de material rechazadas', ['Material', 'Und', 'Motivo'],
                solM.filter(s => s.estado === 'Rechazado').map(s => [s.desc, s.und, s.motivo || '—']))} />
          </div>
          </>
          );
        })()}
      </Bloque>

      <Bloque id="alm" titulo="Almacenes" sub="Recepción, salidas y calidad del uso del material por obra. Haz clic en cualquier número para ver qué hay detrás.">
        {porAlmacen.length === 0 ? vacio : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['Obra', 'Ítems recibidos', 'Incompletos', 'Salidas', 'Verificadas', '% Uso incorrecto', 'Préstamos'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {porAlmacen.map(a => {
                  const salObra = salM.filter(s => s.proyecto === a.obra && !s.anulada);
                  const itemsObra = itemsM.filter(i => i.proyecto === a.obra);
                  const colsSal = ['N°', 'Fecha', 'Material', 'Cant', 'Hoja trabajo', 'Zona', 'Uso', 'Registró'];
                  const filaSal = s => [s.n, fmt(s.fecha), s.desc, `${s.cant} ${s.und}`, s.hoja || '—', s.zona || '—', s.uso || 'Pendiente', s.registradoPor || '—'];
                  return (
                  <tr key={a.obra} className="border-b border-slate-800">
                    <td className="py-1.5 px-1.5 text-slate-200">{a.obra}</td>
                    <Cel cls="font-mono text-slate-300"
                      onClick={() => abrir('alm', `Ítems recibidos en ${a.obra}`, ['RQ', 'Material', 'Pedido', 'Recibido', 'Entregado', 'Obs. almacén'],
                        itemsObra.filter(i => i.estado === 'Entregado').map(i => [rqDe(i.rq), i.desc, `${i.cant} ${i.und}`, i.cantRecibida ?? '—', fmt(i.fechaEntrega), i.obsAlmacen || '—']))}>{a.recibidos}</Cel>
                    <Cel cls={`font-mono ${a.incompletos > 0 ? 'text-yellow-400' : 'text-slate-400'}`}
                      onClick={() => abrir('alm', `Entregas INCOMPLETAS en ${a.obra} · falta saldo`, ['RQ', 'Material', 'Pedido', 'Recibido', 'Falta', 'Obs. almacén'],
                        itemsObra.filter(i => i.estado === 'Incompleto').map(i => [rqDe(i.rq), i.desc, `${i.cant} ${i.und}`, i.cantRecibida ?? '—',
                          (Number(i.cant) - Number(i.cantRecibida || 0)) + ' ' + i.und, i.obsAlmacen || '—']))}>{a.incompletos}</Cel>
                    <Cel cls="font-mono text-slate-300"
                      onClick={() => abrir('alm', `Salidas de almacén en ${a.obra}`, colsSal, salObra.map(filaSal))}>{a.salidas}</Cel>
                    <Cel cls="font-mono text-slate-400"
                      onClick={() => abrir('alm', `Salidas ya verificadas en ${a.obra}`, colsSal, salObra.filter(s => s.uso && s.uso !== 'Pendiente').map(filaSal))}>{a.verificadas}</Cel>
                    <Cel cls={`font-mono font-bold ${a.incorrPct === null ? 'text-slate-500' : a.incorrPct === 0 ? 'text-green-400' : a.incorrPct <= 10 ? 'text-yellow-400' : 'text-red-400'}`}
                      onClick={() => abrir('alm', `USO INCORRECTO en ${a.obra} · material desperdiciado`,
                        ['N°', 'Fecha', 'Material', 'Cant', 'Hoja trabajo', 'Zona', 'Motivo del uso incorrecto', 'Registró'],
                        salObra.filter(s => s.uso === 'Incorrecto').map(s => [s.n, fmt(s.fecha), s.desc, `${s.cant} ${s.und}`,
                          s.hoja || '—', s.zona || '—', s.motivoUso || '—', s.registradoPor || '—']))}>{a.incorrPct === null ? '—' : a.incorrPct + '%'}</Cel>
                    <Cel cls="font-mono text-slate-400"
                      onClick={() => abrir('alm', `Préstamos desde ${a.obra}`, ['N°', 'Fecha', 'Material', 'Cant', 'Destino', 'Estado'],
                        presM.filter(p => p.origen === a.obra).map(p => [p.n, fmt(p.fecha), p.desc, `${p.cant} ${p.und}`, p.destino, p.estado]))}>{a.prestamos}</Cel>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Bloque>

      <Bloque id="pag" titulo="Pagos" sub="Lo pagado en el mes y la deuda viva al cierre. Haz clic en un indicador para ver las facturas.">
        {(() => {
          const pend = facturas.filter(f => !f.anulMotivo && f.estadoPago !== 'Pagada');
          return (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Tarjeta l="Facturas pagadas" v={pagos.pagadas} c="text-green-400"
              onClick={() => abrir('pag', 'Facturas pagadas en el mes', ['Serie', 'Proveedor', 'Obra', 'Monto', 'Banco', 'N° operación', 'Fecha de pago'],
                pagadasM.map(f => [f.serie, f.prov, f.proyecto, sol(f.monto), f.banco || '—', f.numOp || '—', fmt(f.fechaPago)]))} />
            <Tarjeta l="Monto pagado" v={sol(pagos.montoPagado)} c="text-green-400"
              onClick={() => abrir('pag', 'Pagado del mes, de mayor a menor', ['Serie', 'Proveedor', 'Obra', 'Monto', 'Fecha de pago'],
                [...pagadasM].sort((a, b) => b.monto - a.monto).map(f => [f.serie, f.prov, f.proyecto, sol(f.monto), fmt(f.fechaPago)]))} />
            <Tarjeta l="Plazo prom. de pago" v={pagos.plazoProm === '—' ? '—' : pagos.plazoProm + 'd'}
              onClick={() => abrir('pag', 'Días entre factura y pago', ['Serie', 'Proveedor', 'Fecha factura', 'Fecha de pago', 'Días'],
                pagadasM.filter(f => f.fecha && f.fechaPago).map(f => [f.serie, f.prov, fmt(f.fecha), fmt(f.fechaPago), dias(f.fechaPago, f.fecha) + 'd']))} />
            <Tarjeta l="Facturas pendientes" v={pagos.pendientes} c={pagos.pendientes > 0 ? 'text-yellow-400' : 'text-slate-400'}
              onClick={() => abrir('pag', 'Facturas pendientes de pago (todas, no solo del mes)', ['Serie', 'Fecha', 'Proveedor', 'Obra', 'Monto', 'Forma', 'Días desde emisión'],
                pend.map(f => [f.serie, fmt(f.fecha), f.prov, f.proyecto, sol(f.monto), f.forma, dias(HOY_ISO, f.fecha) + 'd']))} />
            <Tarjeta l="Deuda pendiente" v={sol(pagos.deuda)} c="text-red-400"
              onClick={() => abrir('pag', 'Deuda viva, de la más antigua a la más nueva', ['Serie', 'Fecha', 'Proveedor', 'Obra', 'Monto', 'Días esperando'],
                [...pend].sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).map(f => [f.serie, fmt(f.fecha), f.prov, f.proyecto, sol(f.monto), dias(HOY_ISO, f.fecha) + 'd']))} />
          </div>
          );
        })()}
      </Bloque>

      <Bloque id="caj" titulo="Diferencias de caja chica"
        sub="Lo que falta o sobra al contar el efectivo. La goterita diaria importa más que un día suelto: mira el acumulado.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
          <Tarjeta l="Faltante acumulado" v={sol(difCaja.faltanteTotal)} c={difCaja.faltanteTotal > 0 ? 'text-red-400' : 'text-slate-400'}
            onClick={() => abrir('caj', 'Días con faltante de caja', ['Obra', 'Fecha', 'Responsable', 'Teórico', 'Contado', 'Falta', 'Motivo'],
              difCaja.conDif.filter(r => r.diferencia < 0).map(r => [r.proyecto, fmt(r.fecha), r.responsable || '—',
                sol(r.teorico), sol(r.efectivoContado ?? 0), sol(-r.diferencia), r.difMotivo || '—']))} />
          <Tarjeta l="Neto del mes" v={sol(difCaja.netoTotal)} c={difCaja.netoTotal < 0 ? 'text-red-400' : difCaja.netoTotal > 0 ? 'text-yellow-400' : 'text-green-400'}
            onClick={() => abrir('caj', 'Todas las diferencias del mes', ['Obra', 'Fecha', 'Responsable', 'Diferencia', 'Motivo', 'Resolución'],
              difCaja.conDif.map(r => [r.proyecto, fmt(r.fecha), r.responsable || '—',
                (r.diferencia < 0 ? '−' : '+') + ' S/ ' + Math.abs(r.diferencia).toFixed(2), r.difMotivo || '—',
                r.difPor ? `${r.difNota} (${r.difPor}, ${fmt(r.difFecha)})` : '—']))} />
          <Tarjeta l="Días con diferencia" v={`${difCaja.conDif.length}`} />
          <Tarjeta l="Rendiciones arqueadas" v={`${difCaja.arqueadas} de ${difCaja.total}`}
            c={difCaja.total && difCaja.arqueadas < difCaja.total ? 'text-yellow-400' : 'text-slate-100'} />
        </div>
        {difCaja.filas.length === 0 ? (
          <div className="text-slate-500 text-[11px] py-2">
            {difCaja.total === 0 ? 'Sin rendiciones este mes.' : 'Ninguna diferencia: todas las cajas cuadraron.'}</div>
        ) : (
          <table className="w-full text-xs">
            <thead><tr>{['Obra', 'Responsable', 'Días con dif.', 'Faltó', 'Sobró', 'Neto', 'Fueron a gerencia'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>
              {difCaja.filas.map(f => (
                <tr key={f.obra + f.responsable} className="border-b border-slate-800">
                  <td className="py-1.5 px-1.5 text-slate-200">{f.obra}</td>
                  <td className="py-1.5 px-1.5 text-slate-300">{f.responsable}</td>
                  <td className="py-1.5 px-1.5 font-mono text-slate-400">{f.dias}</td>
                  <td className="py-1.5 px-1.5 font-mono text-red-400">{f.falta > 0 ? sol(f.falta) : '—'}</td>
                  <td className="py-1.5 px-1.5 font-mono text-slate-400">{f.sobra > 0 ? sol(f.sobra) : '—'}</td>
                  <td className={`py-1.5 px-1.5 font-mono font-bold ${f.neto < 0 ? 'text-red-400' : 'text-yellow-400'}`}>{sol(f.neto)}</td>
                  <td className="py-1.5 px-1.5 font-mono text-slate-400">{f.escaladas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Bloque>

      <Bloque id="cmp" titulo="Comprador · compras del día" sub="Ítems marcados como comprados en el mes.">
        {porComprador.length === 0 ? vacio : (
          <table className="w-full text-xs">
            <thead><tr>{['Comprador', 'Ítems comprados'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>
              {porComprador.map(c => (
                <tr key={c.nombre} className="border-b border-slate-800">
                  <td className="py-1.5 px-1.5 text-slate-200">{c.nombre}</td>
                  <Cel cls="font-mono text-slate-300"
                    onClick={() => abrir('cmp', `Ítems comprados por ${c.nombre}`, ['RQ', 'Obra', 'Material', 'Cant', 'Necesitada', 'Factura'],
                      itemsM.filter(i => i.compradoPor === c.nombre).map(i => [rqDe(i.rq), i.proyecto, i.desc, `${i.cant} ${i.und}`, fmt(i.fecha), i.factura || '—']))}>{c.items}</Cel>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Bloque>
    </div>
  );
}
