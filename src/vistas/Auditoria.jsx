// Movido de App.jsx (etapa 9 de la separacion en modulos), texto identico.
import { useState } from 'react';
import { HOY_ISO, fmt, diasHoy } from '../fechas';
import { calcularStocks } from '../stock';
import { vencimientoDe, SIN_BANCO } from '../pago';
import { imprimirCierre, imprimirConteo } from '../pdf';
import { PROYECTOS } from '../maestros';
import { Aviso, FechaInput, inputCls, thCls, btnOk } from '../ui';

// Umbral de pago inusual: viaja con Auditoria, nadie mas lo usa.
const UMBRAL_MONTO_INUSUAL = 10000; // S/ — pagos por encima se marcan para revisión

// OJO: las claves de las alertas se guardan en la base (alertas
// levantadas). Ni un caracter de su formato se cambia, o todas las
// alertas ya vistas por gerencia vuelven a saltar. Y dentro del CSV
// viaja un caracter INVISIBLE (U+FEFF) que hace que Excel abra bien.

export function Auditoria({ user, db, api }) {
  const { facturas, rendiciones, bancoDe, precioProm, salidas, prestamos, levantadas = {}, entregas = [] } = db;
  const puede = user.rol === 'gerente';
  const [obraCierre, setObraCierre] = useState('');

  // ---------- CIERRE MENSUAL DE ALMACÉN ----------
  const generarCierre = tipo => {
    if (!obraCierre) return;
    const stocks = calcularStocks(db)[obraCierre] || {};
    const matInfo = Object.fromEntries(db.catalogo.map(m => [m[0], { desc: m[1], und: m[2] }]));
    const filas = Object.entries(stocks)
      .filter(([, v]) => v.cant > 0)
      .map(([cod, v]) => {
        const precio = precioProm[cod] != null ? precioProm[cod] : null;
        return {
          cod, desc: (matInfo[cod] || {}).desc || cod, und: (matInfo[cod] || {}).und || '',
          cant: v.cant, precio, valor: precio != null ? v.cant * precio : null,
        };
      });
    if (!filas.length) { alert(`${obraCierre} no tiene stock para cerrar.`); return; }

    if (tipo === 'cierre') {
      const mes = HOY_ISO.slice(0, 7);
      const salMes = salidas.filter(s => s.proyecto === obraCierre && !s.anulada && s.fecha.startsWith(mes));
      imprimirCierre({
        obra: obraCierre, corte: HOY_ISO,
        filas: [...filas].sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1)),
        salidasMes: { n: salMes.length, cant: salMes.reduce((a, s) => a + s.cant, 0) },
        prestamosActivos: prestamos.filter(p => p.estado === 'Prestado' && (p.origen === obraCierre || p.destino === obraCierre)).length,
      });
    } else {
      // conteo ciego: 100% de los de mayor valor + muestra aleatoria del resto,
      // mezclados en orden alfabético para que no se distinga qué es qué
      const porValor = [...filas].sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1));
      const top = porValor.slice(0, 15);
      const resto = porValor.slice(15).sort(() => Math.random() - 0.5).slice(0, 10);
      const muestra = [...top, ...resto].sort((a, b) => a.desc.localeCompare(b.desc));
      imprimirConteo({ obra: obraCierre, corte: HOY_ISO, filas: muestra });
    }
  };
  const hace7 = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const [desde, setDesde] = useState(hace7);
  const [hasta, setHasta] = useState(HOY_ISO);
  const [aviso, setAvisoRaw] = useState('');
  const setAviso = m => { setAvisoRaw(m); if (m) setTimeout(() => setAvisoRaw(''), m.startsWith('⚠') ? 8000 : 5000); };

  const pagadas = facturas.filter(f => f.estadoPago === 'Pagada');
  const enSemana = pagadas.filter(f => f.fechaPago >= desde && f.fechaPago <= hasta)
    .sort((a, b) => (a.proyecto + a.fechaPago < b.proyecto + b.fechaPago ? -1 : 1));

  // ---------- NIVEL 1: alertas automáticas (sobre TODOS los datos) ----------
  const alertas = [];
  { // N° de operación repetido en el mismo banco
    const vistos = {};
    pagadas.filter(f => f.medio !== 'Efectivo' && f.numOp).forEach(f => {
      const k = `${f.banco}|${f.numOp}`;
      (vistos[k] = vistos[k] || []).push(f);
    });
    Object.values(vistos).filter(v => v.length > 1).forEach(v => {
      alertas.push({ clave: `op-repetida:${v[0].banco}|${v[0].numOp}:${v.length}`, tipo: 'N° de operación repetido', detalle: `${v[0].banco} op. ${v[0].numOp} usado en ${v.length} pagos: ${v.map(f => `${f.serie} (S/ ${f.monto.toFixed(2)})`).join(' · ')}` });
    });
  }
  {
    // Agrupado por obra, no una alerta por factura: lo que gerencia necesita
    // saber es "en esta obra estan pagando desde otra cuenta", no una lista de
    // cuarenta lineas. Una alerta que salta cuarenta veces deja de leerse, y
    // entonces tampoco se ve la que si importa.
    const distintos = pagadas.filter(f => f.medio !== 'Efectivo' && f.banco
      && (bancoDe[f.proyecto] || {}).banco && f.banco !== bancoDe[f.proyecto].banco);
    const porObra = {};
    distintos.forEach(f => {
      const g = (porObra[f.proyecto] = porObra[f.proyecto]
        || { obra: f.proyecto, bancos: new Set(), n: 0, monto: 0, ejemplos: [] });
      g.bancos.add(f.banco); g.n += 1; g.monto += f.monto;
      if (g.ejemplos.length < 3) g.ejemplos.push(f.serie);
    });
    Object.values(porObra).forEach(g => alertas.push({
      // La clave lleva cuántas facturas son: si aparece una más, la alerta vuelve
      clave: `banco-distinto:${g.obra}:${[...g.bancos].sort().join('/')}:${g.n}`,
      tipo: 'Banco distinto al de la obra',
      detalle: `${g.obra}: ${g.n} factura(s) por S/ ${g.monto.toFixed(2)} pagadas desde ${[...g.bancos].join(' / ')}; la obra opera con ${bancoDe[g.obra].banco}. Ej.: ${g.ejemplos.join(', ')}${g.n > 3 ? '…' : ''}`,
    }));
  }
  pagadas.filter(f => f.fechaPago && f.fechaPago < f.fecha)
    .forEach(f => alertas.push({ clave: `pago-anterior:${f.serie}:${f.fechaPago}`, tipo: 'Pago anterior a la factura', detalle: `${f.serie}: factura del ${fmt(f.fecha)} pagada el ${fmt(f.fechaPago)}` }));
  {
    const vencidas = facturas.filter(f => f.estadoPago !== 'Pagada' && diasHoy(vencimientoDe(f)) < 0);
    if (vencidas.length) {
      const monto = vencidas.reduce((a, f) => a + f.monto, 0);
      alertas.push({ clave: `vencidas:${vencidas.length}:${monto.toFixed(2)}`, tipo: 'Facturas vencidas sin pagar', detalle: `${vencidas.length} factura(s) por S/ ${monto.toFixed(2)}; la más antigua: ${vencidas.sort((a, b) => (vencimientoDe(a) < vencimientoDe(b) ? -1 : 1))[0].serie} (venció ${fmt(vencimientoDe(vencidas[0]))})` });
    }
  }
  {
    // Entregas de efectivo apuntadas despues de su dia. Es legitimo, pero es la
    // excepcion: si se vuelve costumbre -- sobre todo en efectivo, que no lo
    // respalda ningun extracto -- gerencia tiene que verlo sin buscarlo.
    const tarde = entregas.filter(e => !e.anulMotivo && e.motivoAtraso);
    if (tarde.length) {
      const enEfectivo = tarde.filter(e => e.medio === 'Efectivo').length;
      const monto = tarde.reduce((a, e) => a + e.monto, 0);
      alertas.push({
        clave: `entregas-tarde:${tarde.length}:${monto.toFixed(2)}`,
        tipo: 'Entregas registradas después de su día',
        detalle: `${tarde.length} entrega(s) por S/ ${monto.toFixed(2)}${enEfectivo ? `, ${enEfectivo} de ellas EN EFECTIVO (sin respaldo bancario)` : ''}. Ej.: ${tarde.slice(0, 3).map(e => `${e.proyecto} ${fmt(e.fecha)} — ${e.motivoAtraso}`).join(' · ')}`,
      });
    }
  }
  {
    // Sin separación de funciones: la misma persona puso el efectivo en manos
    // del comprador y después contó y aprobó lo que devolvió. No se puede
    // evitar con una sola persona de administración, pero sí se puede mirar.
    const mismaMano = rendiciones.filter(r => r.estado === 'Aprobada' && r.aprobadoPor)
      .map(r => ({ r, ents: entregas.filter(e => !e.anulMotivo
        && e.proyecto === r.proyecto && e.fecha === r.fecha && e.entregadoPor === r.aprobadoPor) }))
      .filter(x => x.ents.length > 0);
    if (mismaMano.length) {
      const quien = [...new Set(mismaMano.map(x => x.r.aprobadoPor))].join(', ');
      const monto = mismaMano.reduce((a, x) => a + x.ents.reduce((b, e) => b + e.monto, 0), 0);
      alertas.push({
        clave: `misma-mano:${mismaMano.length}:${monto.toFixed(2)}`,
        tipo: 'Entregó y aprobó la misma persona',
        detalle: `${quien}: en ${mismaMano.length} jornada(s) entregó el efectivo (S/ ${monto.toFixed(2)}) y además cerró el arqueo de ese día. Es lo esperable con una sola persona de administración; conviene revisar el arqueo de esos días con más detalle.`,
      });
    }
  }
  pagadas.filter(f => f.monto > UMBRAL_MONTO_INUSUAL)
    .forEach(f => alertas.push({ clave: `monto-inusual:${f.serie}`, tipo: 'Monto inusual', detalle: `${f.serie} (${f.proyecto}): S/ ${f.monto.toFixed(2)} — revisar con lupa (umbral S/ ${UMBRAL_MONTO_INUSUAL})` }));
  pagadas.filter(f => !f.conciliada && f.fechaPago && diasHoy(f.fechaPago) <= -14)
    .forEach(f => alertas.push({ clave: `sin-conciliar:${f.serie}`, tipo: 'Sin conciliar hace 14+ días', detalle: `${f.serie} (${f.proyecto}) pagada el ${fmt(f.fechaPago)} sigue sin conciliar contra el banco` }));

  // Las alertas levantadas salen de la lista activa pero NO se borran: quedan
  // abajo con su nota, para que nadie descubra que una alerta existió solo
  // porque desapareció de su pantalla.
  const activas = alertas.filter(a => !levantadas[a.clave]);
  const yaLevantadas = alertas.filter(a => levantadas[a.clave]).map(a => ({ ...a, lev: levantadas[a.clave] }));
  const [levantando, setLevantando] = useState('');
  const [notaLev, setNotaLev] = useState('');

  const levantar = async a => {
    if (!notaLev.trim()) return;
    const r = await api.levantarAlerta({ clave: a.clave, tipo: a.tipo, detalle: a.detalle, nota: notaLev });
    if (r.error) { setAviso('⚠ ' + r.error); return; }
    setLevantando(''); setNotaLev('');
    setAviso(`Alerta "${a.tipo}" levantada. Si la situación vuelve a cambiar, reaparecerá.`);
  };

  const reabrir = async a => {
    const r = await api.reabrirAlerta(a.clave);
    if (r.error) { setAviso('⚠ ' + r.error); return; }
    setAviso(`Alerta "${a.tipo}" reabierta.`);
  };

  const conciliar = async (f, valor) => {
    const r = await api.conciliarFactura(f.id, valor);
    if (r.error) { setAviso('⚠ ' + r.error); return; }
    setAviso(valor ? `${f.serie} conciliada contra el estado de cuenta.` : `${f.serie} marcada como NO conciliada.`);
  };

  const csvSemana = () => {
    const cab = ['Obra', 'Banco', 'Cuenta', 'Medio', 'N_Operacion', 'Factura', 'Proveedor', 'RUC', 'Monto', 'F_Pago', 'Pago_Por', 'Conciliada'];
    const esc = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    // Fuera las saldadas con nota de credito: no movieron dinero del banco y
    // buscarlas en el extracto es perseguir un movimiento que no existe.
    const filas = enSemana.filter(f => !SIN_BANCO(f.medio))
      .map(f => [f.proyecto, f.banco || 'EFECTIVO', (bancoDe[f.proyecto] || {}).cuenta || '', f.medio, f.numOp || '', f.serie, f.prov, f.ruc, f.monto.toFixed(2), f.fechaPago, f.pagadoPor, f.conciliada ? 'SI' : 'NO'].map(esc).join(','));
    const csv = '﻿' + cab.join(',') + '\n' + filas.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `auditoria_pagos_${desde}_a_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const totalSemana = enSemana.reduce((a, f) => a + f.monto, 0);
  const sinConciliar = enSemana.filter(f => !f.conciliada).length;

  return (
    <div>
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Auditoría de pagos · revisión semanal de gerencia</div>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <label className="text-[10px] text-slate-500 uppercase">Del</label>
            <FechaInput value={desde} onChange={e => setDesde(e.target.value)} className={`w-32 ${inputCls}`} />
            <label className="text-[10px] text-slate-500 uppercase">al</label>
            <FechaInput value={hasta} onChange={e => setHasta(e.target.value)} className={`w-32 ${inputCls}`} />
            <button onClick={csvSemana} disabled={!enSemana.length} className={btnOk(enSemana.length > 0)}>⤓ CSV para conciliar</button>
          </div>
        </div>
      </div>

      <div className={`border rounded-md p-4 mb-3 ${activas.length === 0 ? 'bg-green-950 border-green-800' : 'bg-slate-900 border-red-800'}`}>
        <div className={`text-[11px] font-bold tracking-widest uppercase mb-2 ${activas.length === 0 ? 'text-green-400' : 'text-red-400'}`}>
          {activas.length === 0 ? '✓ 0 alertas — sin hallazgos pendientes' : `⚠ ${activas.length} alerta(s) por revisar`}</div>
        <Aviso msg={aviso} />
        {activas.map(a => (
          <div key={a.clave} className="mb-2 text-xs flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-red-950 text-red-400 mr-2">{a.tipo}</span>
              <span className="text-slate-300">{a.detalle}</span>
            </div>
            {puede && (levantando === a.clave ? (
              <div className="w-64 shrink-0">
                <input autoFocus value={notaLev} onChange={e => setNotaLev(e.target.value)}
                  placeholder="¿Por qué queda resuelta?" className={`w-full ${inputCls} mb-1`} />
                <div className="flex gap-1">
                  <button onClick={() => levantar(a)} disabled={!notaLev.trim()}
                    className={`flex-1 px-2 py-1 rounded text-[9px] font-bold uppercase ${notaLev.trim() ? 'bg-green-950 text-green-400 border border-green-800' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>Confirmar</button>
                  <button onClick={() => { setLevantando(''); setNotaLev(''); }}
                    className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-400">Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setLevantando(a.clave); setNotaLev(''); }}
                className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-300 hover:bg-slate-700 whitespace-nowrap shrink-0">Levantar</button>
            ))}
          </div>
        ))}
        {yaLevantadas.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-800">
            <div className="text-[10px] font-bold uppercase text-slate-500 mb-1.5">
              Levantadas · {yaLevantadas.length} · revisadas y dadas por resueltas</div>
            {yaLevantadas.map(a => (
              <div key={a.clave} className="mb-1.5 text-[11px] flex items-start gap-2">
                <div className="flex-1 min-w-0 text-slate-500">
                  <span className="text-slate-400">{a.tipo}</span> · {a.detalle}
                  <div className="text-[10px] text-green-500/80">
                    Levantada: {a.lev.nota} — {a.lev.por}, {fmt(a.lev.fecha)}</div>
                </div>
                {puede && (
                  <button onClick={() => reabrir(a)}
                    className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-400 hover:bg-slate-700 whitespace-nowrap shrink-0">Volver a abrir</button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 text-[10px] text-slate-500">
          Levantar una alerta la da por resuelta y queda registrado quién y por qué. No silencia el futuro: si la situación cambia —una factura más, otro banco— la alerta vuelve a aparecer sola.</div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">
          Pagos del período · {enSemana.length} · S/ {totalSemana.toFixed(2)} · sin conciliar: {sinConciliar}</div>
        <Aviso msg={aviso} />
        {enSemana.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Sin pagos en el período seleccionado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['Obra', 'Banco', 'Medio', 'N°', 'Factura', 'Proveedor', 'Monto S/', 'F. pago', 'Pagó', 'Conciliada contra banco'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {enSemana.map(f => (
                  <tr key={f.n} className="border-b border-slate-800">
                    <td className="py-2 px-1.5 text-slate-300 whitespace-nowrap">{f.proyecto}</td>
                    <td className="py-2 px-1.5 text-slate-400 whitespace-nowrap">{f.medio === 'Efectivo' ? 'Caja chica' : f.banco}</td>
                    <td className="py-2 px-1.5">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${f.medio === 'Efectivo' ? 'bg-yellow-950 text-yellow-400' : 'bg-slate-800 text-slate-400'}`}>{f.medio}</span></td>
                    <td className="py-2 px-1.5 font-mono text-slate-300">{f.numOp || '—'}</td>
                    <td className="py-2 px-1.5 font-mono text-slate-200">{f.serie}</td>
                    <td className="py-2 px-1.5 text-slate-300">{f.prov}</td>
                    <td className="py-2 px-1.5 font-mono text-slate-200 text-right">{f.monto.toFixed(2)}</td>
                    <td className="py-2 px-1.5 text-slate-400">{fmt(f.fechaPago)}</td>
                    <td className="py-2 px-1.5 text-slate-500 text-[10px]">{f.pagadoPor}</td>
                    <td className="py-2 px-1.5">
                      {puede ? (
                        <label className="flex items-center gap-1.5 cursor-pointer text-[10px]">
                          <input type="checkbox" checked={f.conciliada} onChange={e => conciliar(f, e.target.checked)} />
                          <span className={f.conciliada ? 'text-green-400' : 'text-slate-500'}>
                            {f.conciliada ? `✓ ${f.conciliadaPor} · ${fmt(f.fechaConciliacion)}` : 'marcar al verificar en el banco'}</span>
                        </label>
                      ) : (
                        <span className={`text-[10px] ${f.conciliada ? 'text-green-400' : 'text-slate-500'}`}>{f.conciliada ? '✓ conciliada' : 'pendiente'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">Ritual semanal: descarga el CSV, ábrelo junto al estado de cuenta de cada banco, y marca aquí cada pago verificado. Lo que quede sin conciliar 14 días se vuelve alerta roja. Los pagos en efectivo se auditan por su rendición (pestaña Rendiciones).</div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mt-3">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Cierre mensual de almacén · foto valorizada + verificación física</div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={obraCierre} onChange={e => setObraCierre(e.target.value)} className={inputCls}>
            <option value="">— Elegir obra —</option>
            {PROYECTOS.map(([c, p]) => <option key={c} value={p}>{c} · {p}</option>)}
          </select>
          <span className="text-slate-500 text-[11px]">Corte: {fmt(HOY_ISO)}</span>
          <button onClick={() => generarCierre('cierre')} disabled={!obraCierre} className={btnOk(!!obraCierre)}>⤓ Cierre valorizado (PDF)</button>
          <button onClick={() => generarCierre('conteo')} disabled={!obraCierre} className={btnOk(!!obraCierre)}>⤓ Hoja de conteo ciego (PDF)</button>
        </div>
        <div className="mt-3 text-slate-500 text-[11px]">
          El <b>cierre valorizado</b> (con cantidades y soles al precio promedio de compra) es para gerencia y contabilidad.
          La <b>hoja de conteo</b> va SIN cantidades: entrégala a la persona de confianza, que cuenta, firma y devuelve — gerencia compara contra el cierre.
          La muestra incluye el 100% de los materiales de mayor valor + una selección aleatoria del resto, mezclados sin distinción.
        </div>
      </div>
    </div>
  );
}
