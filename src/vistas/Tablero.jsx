// Movido de App.jsx (etapa 9 de la separacion en modulos), texto identico.
import { useState, useMemo } from 'react';
import { HOY_ISO, fmt, dias } from '../fechas';
import { PROYECTOS } from '../maestros';
import { FiltroProyecto, thCls, btnOk, pillEstado, canalClases } from '../ui';

// OJO: el fmtH de adentro NO es el fmt de fechas -- formatea horas.
// No confundirlos ni deduplicarlos.

// El CSV de 27 columnas viaja con el Tablero: nadie mas lo usa.
// Dentro hay un caracter INVISIBLE (U+FEFF) que hace que Excel abra bien.
function descargarCSV(items, nombre) {
  const cab = ['Canal', 'RQ', 'Partida', 'Nivel', 'Proyecto', 'Residente', 'Codigo', 'Descripcion', 'Destino', 'Und', 'Cant', 'F_Requerimiento', 'F_Necesitada', 'Decision', 'Estado', 'Motivo_Rechazo', 'Anulacion_Motivo', 'Anulado_Por', 'Pago', 'Factura', 'F_Entrega', 'Cant_Recibida', 'Obs_Almacen', 'Correcciones_Recepcion', 'Llego_dias', 'Holgura_dias', 'Saldo_dias'];
  const esc = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const filas = items.map(i => {
    const llego = i.fechaEntrega ? dias(i.fechaEntrega, i.fechaRQ) : '';
    const holg = i.fechaEntrega && i.fecha ? dias(i.fecha, i.fechaEntrega) : '';
    const saldo = i.fechaEntregaSaldo && i.fechaEntrega ? dias(i.fechaEntregaSaldo, i.fechaEntrega) : '';
    // Las correcciones de cantidad van en una sola celda, legible: es el
    // rastro que se audita después (quién cambió qué, por qué y cuándo).
    const corr = (i.correcciones || [])
      .map(x => `${x.de}→${x.a}: ${x.motivo} (${x.por}, ${x.fecha})`).join(' | ');
    return [i.canal, 'RQ-' + String(i.rq).padStart(3, '0'), i.partida, i.piso || '', i.proyecto, i.residente || '', i.cod, i.desc, i.destino, i.und, i.cant, i.fechaRQ, i.fecha, i.decision, i.estado, i.motivoRechazo || '', i.motivoAnulacion || '', i.anuladoPor || '', i.pago, i.factura || '', i.fechaEntrega || '', i.cantRecibida ?? '', i.obsAlmacen || '', corr, llego, holg, saldo].map(esc).join(',');
  });
  const csv = '﻿' + cab.join(',') + '\n' + filas.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Tablero({ db, user }) {
  const { rqs, facturas, prestamos, salidas } = db;
  const [proy, setProy] = useState('TODOS');
  const [pagoF, setPagoF] = useState(null);
  const rqsF = rqs.filter(r => proy === 'TODOS' || r.proyecto === proy);
  const flatAll = rqs.flatMap(r => r.items.map(i => ({ ...i, rq: r.n, canal: r.canal, proyecto: r.proyecto, partida: r.partida, piso: r.piso, fechaRQ: r.fechaRQ, residente: r.residente })));
  const flat = flatAll.filter(i => proy === 'TODOS' || i.proyecto === proy);
  const urg = rqsF.filter(r => r.canal === 'URGENTE').length;
  const pctUrg = rqsF.length ? Math.round(urg / rqsF.length * 100) : 0;
  const entregados = flat.filter(i => i.estado === 'Entregado').length;
  const tarde = flat.filter(i => i.fechaEntrega && i.fecha && dias(i.fecha, i.fechaEntrega) < 0).length;
  const factF = facturas.filter(f => proy === 'TODOS' || f.proyecto === proy);
  const presActivos = prestamos.filter(p => p.estado === 'Prestado' && (proy === 'TODOS' || p.origen === proy || p.destino === proy)).length;

  const holguras = flat.filter(i => i.fechaEntrega && i.fecha).map(i => dias(i.fecha, i.fechaEntrega));
  const holgProm = holguras.length ? (holguras.reduce((a, b) => a + b, 0) / holguras.length).toFixed(1) : '—';
  const aTiempo = holguras.length ? Math.round(holguras.filter(h => h >= 0).length / holguras.length * 100) + '%' : '—';
  const salF = salidas.filter(s => !s.anulada && (proy === 'TODOS' || s.proyecto === proy));
  const verificadas = salF.filter(s => s.uso !== 'Pendiente');
  const pctIncorrecto = verificadas.length ? Math.round(verificadas.filter(s => s.uso === 'Incorrecto').length / verificadas.length * 100) + '%' : '—';
  const faltaAntig = flat.filter(i => i.pago === 'Falta').map(i => dias(HOY_ISO, i.fechaRQ));
  const faltaMax = faltaAntig.length ? Math.max(...faltaAntig) + 'd' : '—';

  const porResidente = Object.values(rqsF.reduce((acc, r) => {
    const k = r.residente || '—';
    if (!acc[k]) acc[k] = { residente: k, rqs: 0, urg: 0, items: 0, rech: 0 };
    acc[k].rqs++; if (r.canal === 'URGENTE') acc[k].urg++;
    acc[k].items += r.items.length;
    acc[k].rech += r.items.filter(i => i.decision === 'Rechazado').length;
    return acc;
  }, {}));

  const porProyecto = PROYECTOS.map(([c, p]) => {
    const rp = rqs.filter(r => r.proyecto === p);
    const ip = flatAll.filter(i => i.proyecto === p);
    const hs = ip.filter(i => i.fechaEntrega && i.fecha).map(i => dias(i.fecha, i.fechaEntrega));
    const sp = salidas.filter(s => !s.anulada && s.proyecto === p && s.uso !== 'Pendiente');
    return {
      p, rqs: rp.length,
      urgPct: rp.length ? Math.round(rp.filter(r => r.canal === 'URGENTE').length / rp.length * 100) : null,
      fact: facturas.filter(f => f.proyecto === p).reduce((a, f) => a + f.monto, 0),
      holg: hs.length ? +(hs.reduce((a, b) => a + b, 0) / hs.length).toFixed(1) : null,
      aTiempo: hs.length ? Math.round(hs.filter(h => h >= 0).length / hs.length * 100) : null,
      incorrPct: sp.length ? Math.round(sp.filter(s => s.uso === 'Incorrecto').length / sp.length * 100) : null,
      pres: prestamos.filter(x => x.estado === 'Prestado' && x.origen === p).length,
    };
  }).filter(x => x.rqs > 0 || x.fact > 0 || x.pres > 0);
  const maxFact = Math.max(1, ...porProyecto.map(x => x.fact));

  // El gasto acumulado es indicador de gerencia: Compras no lo ve (no cambia su decisión de comprar)
  const verGasto = user.rol !== 'compras';
  const esGerencia = user.rol === 'gerente';

  // ── Tiempo de respuesta de Compras, en HORAS (migración 25).
  // Solo mide los ítems decididos DESPUÉS de la migración (los viejos no tienen sello).
  const respuesta = useMemo(() => {
    const medidos = flat.filter(i => i.creadoEn && i.decididoEn)
      .map(i => ({ ...i, horas: (new Date(i.decididoEn) - new Date(i.creadoEn)) / 3600000 }))
      .filter(i => i.horas >= 0);
    const porCanal = ['URGENTE', 'GENERAL', 'ANTICIPADO'].map(c => {
      const l = medidos.filter(i => i.canal === c);
      return {
        canal: c, n: l.length,
        prom: l.length ? l.reduce((a, b) => a + b.horas, 0) / l.length : null,
        peor: l.length ? Math.max(...l.map(i => i.horas)) : null,
      };
    });
    const sinSello = flat.filter(i => i.decision !== 'Pendiente' && !i.decididoEn).length;
    return { medidos, porCanal, sinSello };
  }, [flat]);

  // ── A qué hora entran los RQ (patrón de la obra).
  // Un urgente pedido a las 6 p.m. ya no se puede comprar ese día.
  const porHora = useMemo(() => {
    const h = Array.from({ length: 24 }, (_, k) => ({ hora: k, total: 0, urg: 0 }));
    rqsF.forEach(r => {
      if (!r.creadoEn) return;
      const k = new Date(r.creadoEn).getHours();   // hora local del navegador (Perú)
      h[k].total += 1;
      if (r.canal === 'URGENTE') h[k].urg += 1;
    });
    return h;
  }, [rqsF]);
  const maxHora = Math.max(1, ...porHora.map(x => x.total));
  const urgTarde = porHora.filter(x => x.hora >= 15).reduce((a, b) => a + b.urg, 0);
  const urgTotalHora = porHora.reduce((a, b) => a + b.urg, 0);
  const fmtH = n => n == null ? '—' : n < 24 ? n.toFixed(1) + 'h' : (n / 24).toFixed(1) + 'd';
  const kpis = [['RQs', rqsF.length], ['Ítems', flat.length], ['% Urgentes', pctUrg + '%'], ['Entregados', entregados], ['Llegaron tarde', tarde], ['Rechazados', flat.filter(i => i.decision === 'Rechazado').length], ['Anulados', flat.filter(i => i.decision === 'Anulado').length], ['Incompletos', flat.filter(i => i.estado === 'Incompleto').length], ...(verGasto ? [['Facturado S/', factF.reduce((a, f) => a + f.monto, 0).toFixed(0)]] : []), ['Préstamos activos', presActivos], ['Holgura prom.', holgProm + (holgProm !== '—' ? 'd' : '')], ['Entrega a tiempo', aTiempo], ['Uso incorrecto', pctIncorrecto], ['Falta pago más antiguo', faltaMax]];
  const nCredito = flat.filter(i => i.pago === 'Crédito').length;
  const nFalta = flat.filter(i => i.pago === 'Falta').length;
  const flatShown = pagoF ? flat.filter(i => i.pago === pagoF) : flat;

  return (
    <div>
      <div className="flex items-center mb-3">
        <div className="ml-auto"><FiltroProyecto value={proy} onChange={setProy} todos /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-3">
        {kpis.map(([l, n], i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 border-l-2 border-l-yellow-400 p-3">
            <div className="font-mono text-2xl text-slate-100">{n}</div>
            <div className="text-[9px] font-bold tracking-widest text-slate-500 uppercase mt-0.5">{l}</div>
          </div>
        ))}
        <button onClick={() => setPagoF(pagoF === 'Crédito' ? null : 'Crédito')}
          className={`text-left bg-slate-900 border p-3 border-l-2 border-l-sky-400 ${pagoF === 'Crédito' ? 'border-sky-400 ring-1 ring-sky-400' : 'border-slate-800 hover:border-slate-600'}`}>
          <div className="font-mono text-2xl text-sky-400">{nCredito}</div>
          <div className="text-[9px] font-bold tracking-widest text-slate-500 uppercase mt-0.5">Pago crédito {pagoF === 'Crédito' ? '· filtrando ✕' : '· ver'}</div>
        </button>
        <button onClick={() => setPagoF(pagoF === 'Falta' ? null : 'Falta')}
          className={`text-left bg-slate-900 border p-3 border-l-2 border-l-red-400 ${pagoF === 'Falta' ? 'border-red-400 ring-1 ring-red-400' : 'border-slate-800 hover:border-slate-600'}`}>
          <div className="font-mono text-2xl text-red-400">{nFalta}</div>
          <div className="text-[9px] font-bold tracking-widest text-slate-500 uppercase mt-0.5">Pago falta {pagoF === 'Falta' ? '· filtrando ✕' : '· ver'}</div>
        </button>
      </div>
      {(porResidente.length > 0 || porProyecto.length > 0) && (
      <div className="grid lg:grid-cols-2 gap-3 mb-3">
        <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Planificación por residente · % urgentes = mala planificación</div>
          {porResidente.length === 0 ? <div className="text-slate-500 text-sm text-center py-4">Sin datos.</div> : (
          <table className="w-full text-xs">
            <thead><tr>{['Residente', 'RQs', '% Urgentes', 'Ítems', 'Rechazados'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>
              {porResidente.map(r => {
                const pct = Math.round(r.urg / r.rqs * 100);
                return (
                  <tr key={r.residente} className="border-b border-slate-800">
                    <td className="py-2 px-1.5 text-slate-200">{r.residente}</td>
                    <td className="py-2 px-1.5 font-mono text-slate-200">{r.rqs}</td>
                    <td className={`py-2 px-1.5 font-mono font-bold ${pct >= 50 ? 'text-red-400' : pct >= 25 ? 'text-yellow-400' : 'text-green-400'}`}>{pct}%</td>
                    <td className="py-2 px-1.5 font-mono text-slate-300">{r.items}</td>
                    <td className="py-2 px-1.5 font-mono text-slate-300">{r.rech}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>)}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Comparativo entre obras</div>
          {porProyecto.length === 0 ? <div className="text-slate-500 text-sm text-center py-4">Sin datos.</div> : (
          <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr>{['Obra', 'RQs', '% Urg', ...(verGasto ? ['Facturado S/'] : []), 'Holgura prom', 'A tiempo', '% Uso incorr.', 'Prést. activos'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>
              {porProyecto.map(x => (
                <tr key={x.p} className="border-b border-slate-800">
                  <td className="py-2 px-1.5 text-slate-200">{x.p}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-300">{x.rqs}</td>
                  <td className={`py-2 px-1.5 font-mono font-bold ${x.urgPct === null ? 'text-slate-500' : x.urgPct >= 50 ? 'text-red-400' : x.urgPct >= 25 ? 'text-yellow-400' : 'text-green-400'}`}>{x.urgPct === null ? '—' : x.urgPct + '%'}</td>
                  {verGasto && (
                  <td className="py-2 px-1.5 font-mono text-slate-200 text-right">
                    {x.fact.toFixed(2)}
                    <div className="h-1 bg-slate-800 rounded mt-1"><div className="h-1 bg-yellow-400 rounded" style={{ width: `${Math.round(x.fact / maxFact * 100)}%` }} /></div>
                  </td>
                  )}
                  <td className={`py-2 px-1.5 font-mono ${x.holg === null ? 'text-slate-500' : x.holg < 0 ? 'text-red-400 font-bold' : 'text-green-400'}`}>{x.holg === null ? '—' : x.holg + 'd'}</td>
                  <td className={`py-2 px-1.5 font-mono font-bold ${x.aTiempo === null ? 'text-slate-500' : x.aTiempo >= 80 ? 'text-green-400' : x.aTiempo >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{x.aTiempo === null ? '—' : x.aTiempo + '%'}</td>
                  <td className={`py-2 px-1.5 font-mono ${x.incorrPct === null ? 'text-slate-500' : x.incorrPct === 0 ? 'text-green-400' : x.incorrPct <= 10 ? 'text-yellow-400' : 'text-red-400 font-bold'}`}>{x.incorrPct === null ? '—' : x.incorrPct + '%'}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-300">{x.pres}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>)}
        </div>
      </div>
      )}

      {esGerencia && (
      <div className="grid md:grid-cols-2 gap-3 mb-3">
        <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Tiempo de respuesta de Compras</div>
          <div className="text-[10px] text-slate-500 mb-3">Horas entre que el residente envía y Compras decide.</div>
          {respuesta.medidos.length === 0 ? (
            <div className="text-slate-500 text-[11px] py-3">
              Aún no hay ítems con marca de tiempo. Se empieza a medir con las decisiones nuevas.</div>
          ) : (
            <table className="w-full text-xs">
              <thead><tr>{['Canal', 'Decididos', 'Promedio', 'El peor'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {respuesta.porCanal.map(c => (
                  <tr key={c.canal} className="border-b border-slate-800">
                    <td className="py-1.5 px-1.5">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase border ${canalClases[c.canal]}`}>{c.canal}</span></td>
                    <td className="py-1.5 px-1.5 font-mono text-slate-400">{c.n}</td>
                    <td className={`py-1.5 px-1.5 font-mono font-bold ${c.prom == null ? 'text-slate-500' : c.canal === 'URGENTE' && c.prom > 6 ? 'text-red-400' : 'text-green-400'}`}>{fmtH(c.prom)}</td>
                    <td className="py-1.5 px-1.5 font-mono text-slate-400">{fmtH(c.peor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {respuesta.sinSello > 0 && (
            <div className="text-[9px] text-slate-600 mt-2">
              {respuesta.sinSello} ítem(s) se decidieron antes de que se midiera la hora: no entran al promedio.</div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">¿A qué hora entran los RQ?</div>
          <div className="text-[10px] text-slate-500 mb-2">
            En rojo los urgentes. Un urgente que entra tarde ya no se compra ese día.</div>
          <svg viewBox="0 0 480 120" className="w-full" style={{ height: 120 }}>
            {porHora.map((h, i) => {
              const x = i * 20 + 2, alto = Math.round((h.total / maxHora) * 78);
              const altoUrg = h.total ? Math.round((h.urg / maxHora) * 78) : 0;
              return (
                <g key={i}>
                  <rect x={x} y={100 - alto} width={16} height={alto} fill="#334155" rx="2" />
                  <rect x={x} y={100 - altoUrg} width={16} height={altoUrg} fill="#f87171" rx="2" />
                  {h.total > 0 && <text x={x + 8} y={96 - alto} textAnchor="middle" fill="#94a3b8" fontSize="8">{h.total}</text>}
                  {i % 3 === 0 && <text x={x + 8} y={114} textAnchor="middle" fill="#64748b" fontSize="8">{h.hora}h</text>}
                </g>
              );
            })}
          </svg>
          {urgTotalHora > 0 && (
            <div className={`text-[10px] mt-1 ${urgTarde / urgTotalHora >= 0.4 ? 'text-red-400' : 'text-slate-400'}`}>
              {urgTarde} de {urgTotalHora} urgentes ({Math.round(urgTarde / urgTotalHora * 100)}%) entran de las 3 p.m. en adelante
              {urgTarde / urgTotalHora >= 0.4 ? ' — se compran recién al día siguiente.' : '.'}
            </div>
          )}
        </div>
      </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Registro consolidado{pagoF ? ` · mostrando solo ítems con pago "${pagoF}"` : ''}</div>
          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            <button onClick={() => descargarCSV(flatAll, 'consolidado_global_' + HOY_ISO)} disabled={!flatAll.length}
              className={btnOk(flatAll.length > 0)}>⤓ CSV Global</button>
            {PROYECTOS.filter(([c, p]) => flatAll.some(i => i.proyecto === p)).map(([c, p]) => (
              <button key={c} onClick={() => descargarCSV(flatAll.filter(i => i.proyecto === p), 'consolidado_' + p.replace(/ /g, '_') + '_' + HOY_ISO)}
                className="px-2 py-1.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700 hover:border-yellow-400 hover:text-yellow-400">⤓ {p}</button>
            ))}
          </div>
        </div>
        {flatShown.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-sm">{pagoF ? `No hay ítems con pago "${pagoF}".` : 'Sin registros todavía.'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['Canal', 'RQ', 'Partida', 'Nivel', 'Proyecto', 'Código', 'Descripción', 'Destino', 'Und', 'Cant', 'F. Req', 'F. Nec', 'Decisión', 'Estado', 'M. rechazo / anulación', 'Pago', 'Factura', 'F. entrega', 'Recibido', 'Obs. almacén', 'Llegó', 'Holgura', 'Saldo'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {flatShown.map((i, k) => {
                  const llego = i.fechaEntrega ? dias(i.fechaEntrega, i.fechaRQ) : null;
                  const holg = i.fechaEntrega && i.fecha ? dias(i.fecha, i.fechaEntrega) : null;
                  const saldoDias = i.fechaEntregaSaldo && i.fechaEntrega ? dias(i.fechaEntregaSaldo, i.fechaEntrega) : null;
                  return (
                    <tr key={k} className="border-b border-slate-800">
                      <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 ${i.canal === 'URGENTE' ? 'text-red-400' : i.canal === 'GENERAL' ? 'text-green-400' : 'text-yellow-400'}`}>{i.canal}</span></td>
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-200">{String(i.rq).padStart(3, '0')}</td>
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{i.partida}</td>
                      <td className="py-2 px-1.5 text-slate-400 whitespace-nowrap text-[10px]">{i.piso || '—'}</td>
                      <td className="py-2 px-1.5 text-slate-400 whitespace-nowrap">{i.proyecto}</td>
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{i.cod}</td>
                      <td className="py-2 px-1.5 text-slate-200 whitespace-nowrap">{i.desc}</td>
                      <td className="py-2 px-1.5 text-slate-400">{i.destino}</td>
                      <td className="py-2 px-1.5 text-slate-500">{i.und}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-200">{i.cant}</td>
                      <td className="py-2 px-1.5 text-slate-400">{fmt(i.fechaRQ)}</td>
                      <td className="py-2 px-1.5 text-slate-200">{fmt(i.fecha)}</td>
                      <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${pillEstado(i.decision)}`}>{i.decision}</span></td>
                      <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${pillEstado(i.estado)}`}>{i.estado}</span></td>
                      <td className="py-2 px-1.5 text-red-400 text-[10px]">{i.motivoRechazo || (i.motivoAnulacion ? `${i.motivoAnulacion} (${i.anuladoPor})` : '—')}</td>
                      <td className="py-2 px-1.5 text-slate-400">{i.pago}</td>
                      <td className="py-2 px-1.5 font-mono text-[11px] text-green-400">{i.factura || '—'}</td>
                      <td className="py-2 px-1.5 text-slate-200">{fmt(i.fechaEntrega)}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{i.cantRecibida != null ? `${i.cantRecibida}/${i.cant}` : '—'}</td>
                      <td className="py-2 px-1.5 text-slate-400 text-[10px]">{i.obsAlmacen || '—'}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{llego !== null ? llego + 'd' : '—'}</td>
                      <td className={`py-2 px-1.5 font-mono ${holg === null ? 'text-slate-600' : holg < 0 ? 'text-red-400' : 'text-green-400'}`}>{holg !== null ? holg + 'd' : '—'}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{saldoDias !== null ? saldoDias + 'd' : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
