import { useState, useMemo, useEffect, useRef, useCallback, Fragment } from 'react';
import { supabase } from './supabaseClient';

const HOY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
const HOY_ISO = `${HOY.getFullYear()}-${String(HOY.getMonth() + 1).padStart(2, '0')}-${String(HOY.getDate()).padStart(2, '0')}`;
const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
const dias = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);
const diasHoy = f => dias(f, HOY_ISO);

// Se llenan desde la base al cargar (tabla proyectos / usuarios con rol almacén)
let PROYECTOS = [];
let ALMACENEROS = {};

const MOTIVOS_USO = ['No se completó el trabajo', 'Se encontró botado', 'Uso inadecuado', 'Otro'];
const FORMAS_PAGO = ['Contado', 'Transferencia', 'Crédito 15 días', 'Crédito 30 días'];

const TABS_POR_ROL = {
  gerente: [['res', 'Residente'], ['com', 'Compras'], ['alm', 'Almacén'], ['cat', 'Catálogo'], ['his', 'Historial'], ['pag', 'Pagos'], ['ren', 'Rendiciones'], ['aud', 'Auditoría'], ['tab', 'Tablero']],
  compras: [['com', 'Compras'], ['cat', 'Catálogo'], ['ren', 'Rendiciones'], ['tab', 'Tablero']],
  residente: [['res', 'Mis requerimientos'], ['sto', 'Mi almacén'], ['his', 'Historial']],
  almacen: [['alm', 'Mi almacén']],
  pagos: [['pag', 'Pagos'], ['ren', 'Rendiciones']],
  administracion: [['ren', 'Rendiciones']],
  comprador: [['dia', 'Compras del día'], ['fac', 'Facturar'], ['ren', 'Rendiciones']],
};
const TAB_INICIAL = { gerente: 'tab', compras: 'com', residente: 'res', almacen: 'alm', pagos: 'pag', administracion: 'ren', comprador: 'dia' };
const UMBRAL_MONTO_INUSUAL = 10000; // S/ — pagos por encima se marcan para revisión

// Vencimiento de una factura: fecha + días de crédito (contado vence el mismo día)
function vencimientoDe(f) {
  const d = new Date(f.fecha + 'T00:00:00');
  d.setDate(d.getDate() + (f.forma === 'Crédito 15 días' ? 15 : f.forma === 'Crédito 30 días' ? 30 : 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const MEDIOS_PAGO = ['Transferencia', 'Cheque', 'Tarjeta'];
const ETIQUETA_NRO = { Transferencia: 'N° operación', Cheque: 'N° de cheque', Tarjeta: 'N° de voucher' };

const canalClases = {
  URGENTE: 'bg-red-950 text-red-400 border-red-800',
  GENERAL: 'bg-green-950 text-green-400 border-green-800',
  'ESPECIAL LIMA': 'bg-yellow-950 text-yellow-400 border-yellow-800',
};

function canalDeFecha(f) {
  if (!f) return null;
  const m = diasHoy(f);
  const k = m < 2 ? 'URGENTE' : m <= 7 ? 'GENERAL' : 'ESPECIAL LIMA';
  return { k, cls: canalClases[k] };
}

// Semáforo de caducidad: ≤7 días rojo, ≤30 amarillo, vencido bloquea salida
function estadoCaducidad(fecha) {
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
function calcularStocks(db) {
  const map = {};
  const ent = (o, c) => { map[o] = map[o] || {}; return (map[o][c] = map[o][c] || { cant: 0, cadMin: null }); };
  db.stockInicial.forEach(si => { ent(si.proyecto, si.cod).cant += si.cant; });
  db.rqs.forEach(r => r.items.forEach(i => {
    if (i.decision !== 'Aprobado') return;
    const rec = Number(i.cantRecibida || 0);
    if (rec > 0) {
      const e = ent(r.proyecto, i.cod);
      e.cant += rec;
      if (i.fechaCaducidad && (!e.cadMin || i.fechaCaducidad < e.cadMin)) e.cadMin = i.fechaCaducidad;
    }
  }));
  db.salidas.forEach(s => { if (!s.anulada) ent(s.proyecto, s.cod).cant -= s.cant; });
  db.prestamos.forEach(p => {
    if (p.estado === 'Devuelto' || p.estado === 'Anulado') return;
    ent(p.origen, p.cod).cant -= p.cant;
    ent(p.destino, p.cod).cant += p.cant;
  });
  return map;
}

// Detalle de stock de una obra (inicial/recibido/salidas/préstamos/caducidad).
// Lo usan la vista del almacenero y la vista de solo lectura del residente.
function stockDetalleObra(db, proy) {
  const stockMap = {};
  const entrada = (cod, desc, und) => {
    if (!stockMap[cod]) stockMap[cod] = { cod, desc, und, inicial: 0, recibido: 0, salido: 0, prestNeto: 0, cadMin: null };
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
  db.salidas.filter(s => s.proyecto === proy && !s.anulada).forEach(s => { if (stockMap[s.cod]) stockMap[s.cod].salido += Number(s.cant); });
  db.prestamos.forEach(p => {
    if (p.estado === 'Devuelto' || p.estado === 'Anulado') return;
    if (p.origen === proy && stockMap[p.cod]) stockMap[p.cod].prestNeto -= Number(p.cant);
    if (p.destino === proy) entrada(p.cod, p.desc, p.und).prestNeto += Number(p.cant);
  });
  return Object.values(stockMap).map(s => ({ ...s, stock: s.inicial + s.recibido - s.salido + s.prestNeto }));
}

// Niveles de obra para análisis de gasto por nivel
const NIVELES = [
  'SÓTANO 1', 'SÓTANO 2', 'SEMI SÓTANO', 'PLATEA CIMENTACIÓN', 'ESTRUCTURA',
  ...Array.from({ length: 11 }, (_, i) => `NIVEL ${i + 1}`),
];

const pillEstado = e =>
  e === 'Pendiente' ? 'bg-yellow-950 text-yellow-400'
  : e === 'Aprobado' ? 'bg-green-950 text-green-400'
  : e === 'Comprado' ? 'bg-sky-950 text-sky-400'
  : e === 'Entregado' ? 'bg-blue-950 text-blue-400'
  : e === 'Incompleto' ? 'bg-orange-950 text-orange-400'
  : e === 'Rechazado' ? 'bg-red-950 text-red-400'
  : e === 'Anulado' ? 'bg-slate-800 text-red-300 line-through'
  : e === 'Prestado' ? 'bg-purple-950 text-purple-400'
  : e === 'Devuelto' ? 'bg-green-950 text-green-400'
  : e === 'Transferido' ? 'bg-sky-950 text-sky-400'
  : e === 'Pagado' || e === 'Pagada' ? 'bg-green-950 text-green-400'
  : e === 'Crédito' ? 'bg-sky-950 text-sky-400'
  : e === 'Falta' ? 'bg-red-950 text-red-400'
  : 'bg-slate-800 text-slate-500';

const inputCls = "bg-slate-950 border border-slate-700 text-slate-100 px-2 py-1.5 rounded text-xs outline-none focus:border-yellow-400";
const lblCls = "block text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-1";
const thCls = "text-left text-[9px] font-bold tracking-widest text-slate-500 uppercase py-2 px-1.5 border-b border-slate-700 whitespace-nowrap";
const btnOk = ok => `px-3 py-1.5 rounded text-[9px] font-bold uppercase whitespace-nowrap ${ok ? 'bg-yellow-400 text-slate-950 hover:bg-yellow-300' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`;
const btnRojo = "px-2 py-1 rounded text-[9px] font-bold uppercase bg-red-950 text-red-400 border border-red-800 hover:bg-red-900";
const btnVerde = "px-2 py-1 rounded text-[9px] font-bold uppercase bg-green-950 text-green-400 border border-green-800 hover:bg-green-900";

function Aviso({ msg }) {
  if (!msg) return null;
  const esError = msg.startsWith('⚠');
  return (
    <div className={`px-3 py-2 rounded text-xs mb-3 border ${esError ? 'bg-red-950 border-red-800 text-red-400' : 'bg-green-950 border-green-800 text-green-400'}`}>
      {esError ? msg : '✓ ' + msg}
    </div>
  );
}

function AnularBox({ label = 'Anular', onConfirm }) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState('');
  if (!open) return <button onClick={() => setOpen(true)} className="text-[9px] text-slate-500 hover:text-red-400 underline underline-offset-2">{label}</button>;
  return (
    <div className="w-44 mt-1">
      <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo de anulación (obligatorio)" className={`w-full ${inputCls}`} />
      <div className="flex gap-1 mt-1">
        <button onClick={() => { if (motivo.trim()) { onConfirm(motivo.trim()); setOpen(false); setMotivo(''); } }}
          disabled={!motivo.trim()}
          className={`flex-1 px-2 py-1 rounded text-[9px] font-bold uppercase ${motivo.trim() ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>Confirmar</button>
        <button onClick={() => setOpen(false)} className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-400">✕</button>
      </div>
    </div>
  );
}

function descargarCSV(items, nombre) {
  const cab = ['Canal', 'RQ', 'Partida', 'Nivel', 'Proyecto', 'Residente', 'Codigo', 'Descripcion', 'Destino', 'Und', 'Cant', 'F_Requerimiento', 'F_Necesitada', 'Decision', 'Estado', 'Motivo_Rechazo', 'Anulacion_Motivo', 'Anulado_Por', 'Pago', 'Factura', 'F_Entrega', 'Cant_Recibida', 'Obs_Almacen', 'Llego_dias', 'Holgura_dias', 'Saldo_dias'];
  const esc = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const filas = items.map(i => {
    const llego = i.fechaEntrega ? dias(i.fechaEntrega, i.fechaRQ) : '';
    const holg = i.fechaEntrega && i.fecha ? dias(i.fecha, i.fechaEntrega) : '';
    const saldo = i.fechaEntregaSaldo && i.fechaEntrega ? dias(i.fechaEntregaSaldo, i.fechaEntrega) : '';
    return [i.canal, 'RQ-' + String(i.rq).padStart(3, '0'), i.partida, i.piso || '', i.proyecto, i.residente || '', i.cod, i.desc, i.destino, i.und, i.cant, i.fechaRQ, i.fecha, i.decision, i.estado, i.motivoRechazo || '', i.motivoAnulacion || '', i.anuladoPor || '', i.pago, i.factura || '', i.fechaEntrega || '', i.cantRecibida ?? '', i.obsAlmacen || '', llego, holg, saldo].map(esc).join(',');
  });
  const csv = '﻿' + cab.join(',') + '\n' + filas.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function imprimirRQ(r) {
  const colorCanal = r.canal === 'URGENTE' ? '#b91c1c' : r.canal === 'GENERAL' ? '#15803d' : '#a16207';
  // El PDF formal solo lleva los ítems aprobados por Compras
  const aprobados = r.items.filter(i => i.decision === 'Aprobado');
  const filas = aprobados.map((i, idx) => `
    <tr>
      <td class="c">${idx + 1}</td>
      <td class="c mono">${i.cod}</td>
      <td>${i.desc}</td>
      <td class="c">${i.und}</td>
      <td class="c">${i.cant}</td>
      <td class="c">${fmt(i.fecha)}</td>
      <td>${i.destino}</td>
      <td class="c">${i.color || '—'}</td>
      <td>${i.obs || '—'}</td>
    </tr>`).join('');
  const w = window.open('', '_blank');
  if (!w) { alert('El navegador bloqueó la ventana. Permite ventanas emergentes para descargar el PDF.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>RQ-${String(r.n).padStart(3, '0')} · ${r.proyecto}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; padding: 24px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
    .logo { font-size: 16px; font-weight: 800; letter-spacing: 2px; }
    .logo small { display: block; font-size: 9px; font-weight: 400; letter-spacing: 1px; color: #555; }
    .nrq { text-align: right; }
    .nrq b { font-size: 15px; }
    h1 { font-size: 13px; text-align: center; margin: 8px 0; letter-spacing: 1px; }
    .meta { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .meta td { border: 1px solid #999; padding: 4px 6px; }
    .meta .l { background: #f0f0f0; font-weight: 700; width: 16%; font-size: 9px; text-transform: uppercase; }
    .canal { display: inline-block; padding: 2px 10px; border: 2px solid ${colorCanal}; color: ${colorCanal}; font-weight: 800; letter-spacing: 1px; }
    .just { border: 1px solid #999; background: #fffbe6; padding: 6px 8px; margin-bottom: 8px; }
    .just b { font-size: 9px; text-transform: uppercase; }
    table.items { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
    table.items th { background: #111; color: #fff; padding: 5px 4px; font-size: 9px; text-transform: uppercase; }
    table.items td { border: 1px solid #999; padding: 4px; }
    .c { text-align: center; }
    .mono { font-family: 'Courier New', monospace; }
    .firmas { display: flex; gap: 16px; margin-top: 50px; }
    .firma { flex: 1; text-align: center; }
    .firma .linea { border-top: 1px solid #111; padding-top: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
    .firma .campos { font-size: 9px; color: #555; margin-top: 14px; text-align: left; }
    @media print { body { padding: 10mm; } }
  </style></head><body>
  <div class="head">
    <div class="logo">GRUPO COPACABANA<small>CONSTRUCCIÓN E INMOBILIARIA · CUSCO</small></div>
    <div class="nrq"><b>RQ-${String(r.n).padStart(3, '0')}</b><br>Fecha: ${fmt(r.fechaRQ)}<br><span class="canal">${r.canal}</span></div>
  </div>
  <h1>REQUERIMIENTO DE MATERIALES</h1>
  <table class="meta">
    <tr><td class="l">Proyecto</td><td>${r.proyecto}</td><td class="l">Partida</td><td>${r.partida}</td></tr>
    <tr><td class="l">Residente de obra</td><td>${r.residente}</td><td class="l">Adm. de almacén</td><td>${r.almacen}</td></tr>
    <tr><td class="l">Nivel</td><td>${r.piso || '—'}</td><td class="l">Ítems aprobados</td><td>${aprobados.length} de ${r.items.length}</td></tr>
  </table>
  ${r.just ? `<div class="just"><b>Motivo (¿por qué no se previó?):</b> ${r.just}</div>` : ''}
  <table class="items">
    <thead><tr><th>Ítem</th><th>Código</th><th>Descripción</th><th>Und</th><th>Cant</th><th>Fecha necesitada</th><th>Destino</th><th>Color</th><th>Obs</th></tr></thead>
    <tbody>${filas}</tbody>
  </table>
  <div class="firmas">
    ${['RESIDENTE DE OBRA', 'V°B° GERENTE DE OPERACIONES', 'RECEPCIÓN EN OBRA', 'ENTREGADO POR'].map(f => `
      <div class="firma"><div class="campos">FECHA:<br><br>NOMBRE:</div><br><br><div class="linea">${f}</div></div>`).join('')}
  </div>
  <script>window.onload = () => { window.print(); };<\/script>
  </body></html>`);
  w.document.close();
}

const ESTILO_PDF = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; padding: 24px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
  .logo { font-size: 16px; font-weight: 800; letter-spacing: 2px; }
  .logo small { display: block; font-size: 9px; font-weight: 400; letter-spacing: 1px; color: #555; }
  .meta { text-align: right; font-size: 11px; }
  h1 { font-size: 13px; text-align: center; margin: 8px 0 12px; letter-spacing: 1px; }
  table.t { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  table.t th { background: #111; color: #fff; padding: 5px 4px; font-size: 9px; text-transform: uppercase; text-align: left; }
  table.t td { border: 1px solid #999; padding: 4px; }
  .c { text-align: center; } .r { text-align: right; } .mono { font-family: 'Courier New', monospace; }
  .tot td { font-weight: 800; background: #f0f0f0; }
  .nota { border: 1px solid #999; background: #fffbe6; padding: 6px 8px; margin-bottom: 10px; font-size: 10px; }
  .firmas { display: flex; gap: 16px; margin-top: 60px; }
  .firma { flex: 1; text-align: center; }
  .firma .linea { border-top: 1px solid #111; padding-top: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
  .firma .campos { font-size: 9px; color: #555; margin-top: 14px; text-align: left; }
  @media print { body { padding: 10mm; } }
`;

function abrirPDF(titulo, cuerpo) {
  const w = window.open('', '_blank');
  if (!w) { alert('El navegador bloqueó la ventana. Permite ventanas emergentes para descargar el PDF.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titulo}</title><style>${ESTILO_PDF}</style></head><body>${cuerpo}<script>window.onload = () => { window.print(); };<\/script></body></html>`);
  w.document.close();
}

// Cierre mensual valorizado (documento contable, para gerencia y contabilidad)
function imprimirCierre({ obra, corte, filas, salidasMes, prestamosActivos }) {
  const totValor = filas.reduce((a, f) => a + (f.valor ?? 0), 0);
  const sinPrecio = filas.filter(f => f.valor == null).length;
  const cuerpo = `
  <div class="head">
    <div class="logo">GRUPO COPACABANA<small>CONSTRUCCIÓN E INMOBILIARIA · CUSCO</small></div>
    <div class="meta"><b>CIERRE DE ALMACÉN</b><br>Obra: ${obra}<br>Fecha de corte: ${fmt(corte)}</div>
  </div>
  <h1>CIERRE MENSUAL DE ALMACÉN — VALORIZADO</h1>
  ${sinPrecio > 0 ? `<div class="nota"><b>${sinPrecio} material(es) sin precio de compra registrado</b> (aparecen como "sin valorizar"): el total es parcial hasta contar con sus precios.</div>` : ''}
  <table class="t">
    <thead><tr><th>Código</th><th>Material</th><th>Und</th><th class="r">Stock</th><th class="r">Precio prom. S/</th><th class="r">Valor S/</th></tr></thead>
    <tbody>
      ${filas.map(f => `<tr>
        <td class="mono c">${f.cod}</td><td>${f.desc}</td><td class="c">${f.und}</td>
        <td class="r mono">${f.cant}</td>
        <td class="r mono">${f.precio != null ? f.precio.toFixed(2) : '—'}</td>
        <td class="r mono">${f.valor != null ? f.valor.toFixed(2) : 'sin valorizar'}</td>
      </tr>`).join('')}
      <tr class="tot"><td colspan="5" class="r">VALOR TOTAL DEL ALMACÉN</td><td class="r mono">S/ ${totValor.toFixed(2)}</td></tr>
    </tbody>
  </table>
  <div class="nota">Movimientos del mes: <b>${salidasMes.n}</b> salida(s) por <b>${salidasMes.cant}</b> unidades · Préstamos activos: <b>${prestamosActivos}</b>. Stock = inicial + recibido − salidas ± préstamos (foto al corte).</div>
  <div class="firmas">
    ${['ALMACENERO', 'V°B° GERENCIA'].map(f => `
      <div class="firma"><div class="campos">FECHA:<br><br>NOMBRE:</div><br><br><div class="linea">${f}</div></div>`).join('')}
  </div>`;
  abrirPDF(`Cierre ${obra} ${corte}`, cuerpo);
}

// Hoja de conteo CIEGO (para el verificador de confianza: sin cantidades)
function imprimirConteo({ obra, corte, filas }) {
  const cuerpo = `
  <div class="head">
    <div class="logo">GRUPO COPACABANA<small>CONSTRUCCIÓN E INMOBILIARIA · CUSCO</small></div>
    <div class="meta"><b>HOJA DE CONTEO</b><br>Obra: ${obra}<br>Fecha: ${fmt(corte)}</div>
  </div>
  <h1>VERIFICACIÓN FÍSICA DE ALMACÉN — CONTEO CIEGO</h1>
  <div class="nota"><b>Instrucciones:</b> cuente físicamente cada material y anote la cantidad encontrada. Este documento NO muestra las cantidades del sistema a propósito: la comparación la hace gerencia al recibir la hoja firmada. No pida las cantidades al almacenero.</div>
  <table class="t">
    <thead><tr><th>#</th><th>Código</th><th>Material</th><th>Und</th><th class="c" style="width:18%">CANTIDAD CONTADA</th><th style="width:20%">Observaciones</th></tr></thead>
    <tbody>
      ${filas.map((f, i) => `<tr>
        <td class="c">${i + 1}</td><td class="mono c">${f.cod}</td><td>${f.desc}</td><td class="c">${f.und}</td>
        <td style="height:26px"></td><td></td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div class="firmas">
    ${['CONTÓ (VERIFICADOR)', 'ALMACENERO PRESENTE', 'REVISÓ GERENCIA'].map(f => `
      <div class="firma"><div class="campos">FECHA:<br><br>NOMBRE:</div><br><br><div class="linea">${f}</div></div>`).join('')}
  </div>`;
  abrirPDF(`Conteo ${obra} ${corte}`, cuerpo);
}

function FiltroProyecto({ value, onChange, todos, excluir }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
      {todos && <option value="TODOS">Todos los proyectos</option>}
      {PROYECTOS.filter(([c, p]) => p !== excluir).map(([c, p]) => <option key={c} value={p}>{c} · {p}</option>)}
    </select>
  );
}

function FechaInput({ value, onChange, className, min, disabled, inputRef, onKeyDown }) {
  return (
    <input type="date" value={value} onChange={onChange} min={min} disabled={disabled}
      ref={inputRef} onKeyDown={onKeyDown}
      onClick={e => { try { e.target.showPicker(); } catch (_) {} }}
      className={`${className} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`} />
  );
}

// Estilo de campo obligatorio pendiente: amarillo hasta que se llena
const pendCls = ok => ok ? inputCls : `${inputCls.replace('border-slate-700', 'border-yellow-400')} bg-yellow-950`;

// Búsqueda por palabras: ignora espacios extra y encuentra materiales que
// contengan TODAS las palabras escritas, en cualquier orden.
function buscarEnCatalogo(catalogo, q, max) {
  const palabras = q.toUpperCase().split(/\s+/).filter(Boolean);
  if (!palabras.length || q.trim().length < 2) return [];
  return catalogo.filter(m => {
    const texto = m[1].toUpperCase() + ' ' + m[0] + ' ' + (m[3] || '').toUpperCase();
    return palabras.every(p => texto.includes(p));
  }).slice(0, max);
}

function Buscador({ catalogo, onPick, stockDe, deshabilitado, inputRef }) {
  const [q, setQ] = useState('');
  const res = useMemo(() => buscarEnCatalogo(catalogo, deshabilitado ? '' : q, 8), [q, catalogo, deshabilitado]);
  return (
    <div className="relative">
      <label className={lblCls}>Buscar material en catálogo · {catalogo.length} materiales</label>
      <input value={q} onChange={e => setQ(e.target.value)} disabled={deshabilitado} ref={inputRef}
        onKeyDown={e => { if (e.key === 'Enter' && res.length > 0) { e.preventDefault(); onPick(res[0]); setQ(''); } }}
        placeholder={deshabilitado ? 'Primero completa la cabecera: 1. partida → 2. nivel → 3. fecha (y motivo si es urgente)' : 'Escribe descripción o código… (Enter agrega el primer resultado)'}
        className={`w-full ${inputCls} py-2 text-sm ${deshabilitado ? 'opacity-60 cursor-not-allowed' : ''}`} />
      {res.length > 0 && (
        <div className="absolute top-full left-0 right-0 bg-slate-950 border border-yellow-400 border-t-0 rounded-b max-h-56 overflow-y-auto z-50">
          {res.map(m => (
            <div key={m[0]} onClick={() => { onPick(m); setQ(''); }}
              className="px-3 py-2 cursor-pointer border-b border-slate-800 hover:bg-slate-800">
              <div className="text-xs font-medium text-slate-100">{m[1]}</div>
              <div className="text-[10px] font-mono text-slate-500">{m[0]} · {m[4] ? `${m[5]} de ${m[4]} ${m[2]}` : m[2]} · {m[3]}
                {stockDe && stockDe[m[0]] && stockDe[m[0]].cant > 0 && <span className="text-green-400"> · en tu almacén: {stockDe[m[0]].cant}</span>}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [cargando, setCargando] = useState(false);
  const entrar = async () => {
    if (!email.trim() || !p) return;
    setCargando(true); setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: p });
    setCargando(false);
    if (error) setErr(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-md p-6">
        <div className="text-center mb-5">
          <div className="font-extrabold text-lg tracking-widest text-yellow-400">COPACABANA <span className="text-slate-600 font-medium">/ RQ</span></div>
          <div className="text-slate-500 text-[11px] mt-1">Sistema de requerimientos de materiales</div>
        </div>
        <label className={lblCls}>Correo</label>
        <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErr(''); }}
          placeholder="usuario@correo.com" className={`w-full ${inputCls} mb-3`} />
        <label className={lblCls}>Contraseña</label>
        <input type="password" value={p} onChange={e => { setP(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && entrar()}
          placeholder="••••••••" className={`w-full ${inputCls} mb-3`} />
        {err && <div className="text-red-400 text-[11px] mb-2">{err}</div>}
        <button onClick={entrar} disabled={cargando}
          className="w-full px-4 py-2.5 rounded text-xs font-bold tracking-wider uppercase bg-yellow-400 text-slate-950 hover:bg-yellow-300 disabled:opacity-50">
          {cargando ? 'Ingresando…' : 'Ingresar'}</button>
        <div className="text-slate-600 text-[10px] mt-4 text-center">Acceso con las cuentas creadas por administración.</div>
      </div>
    </div>
  );
}

function Residente({ user, db, api }) {
  const { rqs, catalogo, solicitudes, codProy } = db;
  const esRes = user.rol === 'residente';
  const proyIni = esRes ? user.proyecto : (PROYECTOS[0] ? PROYECTOS[0][1] : '');
  const codIni = codProy[proyIni] || '';
  const [cab, setCab] = useState({ proyecto: proyIni, partida: '', residente: user.nombre, almacen: ALMACENEROS[proyIni] || '', piso: '', fecha: '' });
  const [items, setItems] = useState([]);
  const [just, setJust] = useState('');
  const [solForm, setSolForm] = useState(null);
  const [aviso, setAvisoRaw] = useState('');
  // los avisos (incluidos los de error) se autolimpian
  const setAviso = m => { setAvisoRaw(m); if (m) setTimeout(() => setAvisoRaw(''), m.startsWith('⚠') ? 8000 : 6000); };
  const [enviando, setEnviando] = useState(false);
  const ch = canalDeFecha(cab.fecha);
  const urgente = ch && ch.k === 'URGENTE';
  const unds = useMemo(() => [...new Set(catalogo.map(m => m[2]))].sort(), [catalogo]);
  // stock de SU obra: informa al pedir para que solo pida lo que falta
  const stockObra = useMemo(() => (esRes ? (calcularStocks(db)[user.proyecto] || {}) : {}), [db, esRes, user.proyecto]);

  const setC = (k, v) => setCab({ ...cab, [k]: v });
  const add = m => setItems(p => [...p, { id: Date.now() + Math.random(), cod: m[0], desc: m[1], und: m[2], cant: '', destino: '', color: '', obs: '' }]);
  const upd = (id, k, v) => setItems(p => p.map(i => i.id === id ? { ...i, [k]: v } : i));
  const del = id => setItems(p => p.filter(i => i.id !== id));

  // Enter salta al siguiente campo de la secuencia
  const refNivel = useRef(null), refFecha = useRef(null), refJust = useRef(null), refBuscar = useRef(null);
  const saltarA = ref => e => {
    if (e.key === 'Enter') { e.preventDefault(); if (ref.current && !ref.current.disabled) ref.current.focus(); }
  };
  const saltarDesdeFecha = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const destino = (urgente && refJust.current) ? refJust : refBuscar;
      if (destino.current && !destino.current.disabled) destino.current.focus();
    }
  };

  // Orden de llenado exigido: 1) partida → 2) nivel → 3) fecha → (4) justificación si urgente.
  // El campo pendiente se pinta amarillo y el siguiente queda bloqueado.
  const partidaOk = cab.partida.trim().length > 0;
  const nivelOk = !!cab.piso;
  const fechaOk = !!cab.fecha && cab.fecha >= HOY_ISO;
  const justOk = !urgente || !!just.trim();
  const cabeceraLista = partidaOk && nivelOk && fechaOk && justOk;

  const cabOk = cab.residente.trim() && cab.almacen.trim() && cab.piso && cab.fecha && cab.fecha >= HOY_ISO;
  const itemsOk = items.length > 0 && items.every(i => Number(i.cant) > 0 && i.destino.trim());
  const hayFechaPasada = cab.fecha && cab.fecha < HOY_ISO;
  const ok = esRes && cabOk && itemsOk && (!urgente || just.trim()) && !enviando;

  const enviar = async () => {
    setEnviando(true);
    const r = await api.crearRq({ cab, items, just: just.trim(), canal: ch.k });
    setEnviando(false);
    if (r.error) { setAviso('⚠ ' + r.error); return; }
    setItems([]); setJust('');
    setAviso(`RQ-${String(r.numero).padStart(3, '0')} enviado. Compras ya lo puede ver. El PDF estará disponible cuando Compras decida todos los ítems.`);
    setTimeout(() => setAviso(''), 7000);
  };

  const enviarSolicitud = async () => {
    if (!solForm.desc.trim() || !solForm.und || !solForm.famIu) return;
    const r = await api.crearSolicitud({
      desc: solForm.desc.trim().toUpperCase(), und: solForm.und,
      famIu: solForm.famIu, perecedero: !!solForm.perecedero, proyecto: cab.proyecto,
    });
    if (r.error) { setAviso('⚠ ' + r.error); return; }
    setSolForm(null);
  };

  const misRqs = esRes ? rqs.filter(r => r.proyecto === user.proyecto) : rqs;
  const misSol = esRes ? solicitudes.filter(s => s.solicitanteId === user.id) : solicitudes;

  // Un RQ se archiva solo cuando ya no queda nada por atender:
  // cada ítem está Entregado, o cerrado por rechazo/anulación.
  const [verArchivados, setVerArchivados] = useState(false);
  const rqCerrado = r => r.items.length > 0 &&
    r.items.every(i => i.decision === 'Rechazado' || i.decision === 'Anulado' || i.estado === 'Entregado');
  // Orden a elección del residente: N° de RQ o fecha necesitada (lo más próximo primero)
  const [ordenRqs, setOrdenRqs] = useState('num');
  const fechaNecDe = r => r.items.reduce((m, i) => (i.fecha && (!m || i.fecha < m) ? i.fecha : m), '');
  const ordenar = arr => ordenRqs === 'fecha'
    ? [...arr].sort((a, b) => {
        const fa = fechaNecDe(a) || '9999', fb = fechaNecDe(b) || '9999';
        return fa < fb ? -1 : fa > fb ? 1 : a.n - b.n;
      })
    : arr;
  const rqsActivos = ordenar(misRqs.filter(r => !rqCerrado(r)));
  const rqsArchivados = ordenar(misRqs.filter(rqCerrado));
  const mostrados = [...rqsActivos, ...(verArchivados ? rqsArchivados : [])];

  return (
    <div>
      <Aviso msg={aviso} />
      {!esRes ? (
        <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3 text-slate-400 text-xs">
          Los requerimientos los crean los residentes desde su propio usuario. Aquí ves el estado de todos los RQs.
        </div>
      ) : (
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Nuevo requerimiento</div>
        <div className="grid md:grid-cols-3 gap-3 mb-3">
          <div><label className={lblCls}>Proyecto (asignado a tu usuario)</label>
            <div className={`${inputCls} bg-slate-800 text-slate-300`}>{codIni} · {user.proyecto}</div></div>
          <div><label className={lblCls}>1. Partida *</label>
            <input value={cab.partida} onChange={e => setC('partida', e.target.value)}
              placeholder={codIni ? `Ej: ${codIni}.02.02` : 'Partida'}
              onKeyDown={saltarA(refNivel)} className={`w-full ${pendCls(partidaOk)}`} /></div>
          <div><label className={lblCls}>Residente de obra *</label>
            <div className={`${inputCls} bg-slate-800 text-slate-300`}>{user.nombre}</div></div>
          <div><label className={lblCls}>Adm. de almacén *</label>
            <input value={cab.almacen} onChange={e => setC('almacen', e.target.value)} placeholder="Responsable" className={`w-full ${inputCls}`} /></div>
          <div><label className={lblCls}>2. Nivel donde se utilizará *</label>
            <select ref={refNivel} value={cab.piso} onChange={e => setC('piso', e.target.value)} disabled={!partidaOk}
              onKeyDown={saltarA(refFecha)}
              className={`w-full ${pendCls(nivelOk)} ${!partidaOk ? 'opacity-60 cursor-not-allowed' : ''}`}>
              <option value="">— Elegir nivel —</option>
              {NIVELES.map(p => <option key={p}>{p}</option>)}</select></div>
          <div><label className={lblCls}>3. Fecha necesitada (todo el RQ) *</label>
            <FechaInput value={cab.fecha} min={HOY_ISO} onChange={e => setC('fecha', e.target.value)}
              disabled={!nivelOk} inputRef={refFecha} onKeyDown={saltarDesdeFecha}
              className={`w-full ${pendCls(fechaOk)}`} />
            {hayFechaPasada && <div className="text-[9px] text-red-400 mt-1">Fecha en el pasado</div>}</div>
          <div><label className={lblCls}>Fecha del RQ</label>
            <div className={`${inputCls} bg-slate-800 text-slate-400`}>{fmt(HOY_ISO)} (automática)</div></div>
          <div><label className={lblCls}>Canal (automático)</label>
            <div className={`px-2 py-1.5 rounded text-[11px] font-bold tracking-widest uppercase text-center border ${ch ? ch.cls : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
              {ch ? ch.k : 'sin fecha'}</div></div>
        </div>
        {urgente && (
          <div className="mb-3">
            <div className="bg-yellow-950 border border-yellow-800 text-yellow-400 px-3 py-2 rounded text-xs">
              4. Canal urgente: el motivo es obligatorio. ¿Por qué no se previó?</div>
            <textarea rows={2} ref={refJust} value={just} onChange={e => setJust(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (refBuscar.current && !refBuscar.current.disabled) refBuscar.current.focus(); } }}
              placeholder="Ej: rotura imprevista de equipo en obra… (Enter continúa; Shift+Enter para otra línea)"
              className={`w-full mt-2 ${pendCls(justOk)} text-sm`} />
          </div>
        )}
        <Buscador catalogo={catalogo} onPick={add} stockDe={esRes ? stockObra : null} deshabilitado={!cabeceraLista} inputRef={refBuscar} />
        <div className="mt-2">
          {!solForm ? (
            <button onClick={() => setSolForm({ desc: '', und: unds[0] || 'UND', famIu: '', perecedero: false })}
              className="text-[11px] text-yellow-400 hover:text-yellow-300 underline underline-offset-2">
              ¿No encuentras el material? Solicitar material nuevo</button>
          ) : (
            <div className="mt-2 bg-slate-950 border border-slate-700 rounded p-3">
              <div className={lblCls}>Solicitud de material nuevo (la aprueba el dueño del catálogo)</div>
              <div className="grid md:grid-cols-3 gap-2 mt-1">
                <input value={solForm.desc} onChange={e => setSolForm({ ...solForm, desc: e.target.value })} placeholder="Descripción exacta del material" className={inputCls} />
                <select value={solForm.und} onChange={e => setSolForm({ ...solForm, und: e.target.value })} className={inputCls}>
                  {unds.map(u => <option key={u}>{u}</option>)}</select>
                <select value={solForm.famIu} onChange={e => setSolForm({ ...solForm, famIu: e.target.value })} className={`w-full ${inputCls}`}>
                  <option value="">— Familia sugerida * —</option>
                  {db.familias.map(([iu, n]) => <option key={iu} value={iu}>{iu} · {n}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 mt-2 cursor-pointer text-[11px] text-slate-300">
                <input type="checkbox" checked={!!solForm.perecedero} onChange={e => setSolForm({ ...solForm, perecedero: e.target.checked })} />
                <span>¿Es perecedero? (tiene fecha de vencimiento: pinturas, pegamentos, aditivos, cemento…)</span>
              </label>
              <div className="flex gap-2 mt-2">
                <button onClick={enviarSolicitud} disabled={!solForm.desc.trim() || !solForm.famIu} className={btnOk(!!(solForm.desc.trim() && solForm.famIu))}>Enviar solicitud</button>
                <button onClick={() => setSolForm(null)} className="px-3 py-1.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-400 hover:text-slate-200">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {esRes && items.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Ítems · {items.length}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>
                {['Código', 'Descripción', 'Und', 'Cant', 'Destino', 'Color', 'Obs (marca)', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}
              </tr></thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id} className="border-b border-slate-800 align-top">
                    <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{i.cod}</td>
                    <td className="py-2 px-1.5 text-slate-200">{i.desc}
                      {stockObra[i.cod] && stockObra[i.cod].cant > 0 && (
                        <div className="text-[10px] text-sky-400 mt-1">
                          📦 En tu almacén ya hay <b>{stockObra[i.cod].cant} {i.und}</b> — pide solo lo que falte.</div>
                      )}</td>
                    <td className="py-2 px-1.5 text-slate-500">{i.und}</td>
                    <td className="py-2 px-1.5"><input type="number" min="1" step="any" value={i.cant} onChange={e => { const v = e.target.value; if (v === '' || Number(v) > 0) upd(i.id, 'cant', v); }} className={`w-16 ${inputCls}`} /></td>
                    <td className="py-2 px-1.5">
                      <textarea rows={2} value={i.destino} onChange={e => upd(i.id, 'destino', e.target.value)}
                        placeholder="¿Dónde será utilizado? Especificar con detalle: piso, dpto, ambiente, partida…"
                        className={`w-44 ${inputCls} resize-y`} /></td>
                    <td className="py-2 px-1.5">
                      <input value={i.color} onChange={e => upd(i.id, 'color', e.target.value)} placeholder="—" className={`w-24 ${inputCls}`} />
                      <div className="text-[9px] text-slate-500 mt-1 w-24 leading-tight">Colocar el color si es necesario; en caso contrario dejar vacío.</div></td>
                    <td className="py-2 px-1.5"><input value={i.obs} onChange={e => upd(i.id, 'obs', e.target.value)} placeholder="Marca" className={`w-24 ${inputCls}`} /></td>
                    <td className="py-2 px-1.5"><button onClick={() => del(i.id)} className="text-slate-500 hover:text-red-400 text-base leading-none">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex gap-3 items-center flex-wrap">
            <button onClick={enviar} disabled={!ok}
              className={`px-5 py-2.5 rounded text-xs font-bold tracking-wider uppercase ${ok ? 'bg-yellow-400 text-slate-950 hover:bg-yellow-300' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
              {enviando ? 'Enviando…' : 'Enviar requerimiento'}</button>
            {!ok && !enviando && <span className="text-slate-500 text-[11px]">
              {!cabOk ? 'Completa partida, nivel y fecha necesitada (no puede ser pasada)' : !itemsOk ? 'Completa cantidad y destino en cada ítem' : 'Falta el motivo del canal urgente'}</span>}
          </div>
        </div>
      )}

      {misSol.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Mis solicitudes de material nuevo</div>
          <table className="w-full text-xs">
            <thead><tr>{['Material', 'Und', 'Familia', 'Estado', 'Motivo / Código asignado'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>
              {misSol.map(s => (
                <tr key={s.n} className="border-b border-slate-800">
                  <td className="py-2 px-1.5 text-slate-200">{s.desc}</td>
                  <td className="py-2 px-1.5 text-slate-500">{s.und}</td>
                  <td className="py-2 px-1.5 text-slate-400">{s.fam || '—'}</td>
                  <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${pillEstado(s.estado)}`}>{s.estado}</span></td>
                  <td className="py-2 px-1.5 text-slate-400 text-[10px]">{s.estado === 'Aprobado' ? <span className="font-mono text-green-400">{s.codigo}</span> : s.motivo || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Mis requerimientos · estado (solo lectura — lo gestiona Compras)</div>
          <div className="ml-auto flex items-center gap-1">
            <span className="text-[9px] font-bold uppercase text-slate-500">Ordenar por:</span>
            {[['num', 'N° RQ'], ['fecha', 'Fecha necesitada']].map(([k, l]) => (
              <button key={k} onClick={() => setOrdenRqs(k)}
                className={`px-2 py-1 rounded text-[9px] font-bold uppercase border ${ordenRqs === k ? 'border-yellow-400 text-yellow-400 bg-slate-800' : 'border-slate-700 text-slate-400 bg-slate-800 hover:border-slate-500'}`}>
                {l}</button>
            ))}
          </div>
        </div>
        {misRqs.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Aún no has enviado requerimientos.</div>
        ) : mostrados.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Todo atendido ✓ — tus requerimientos completos están en Archivados, abajo.</div>
        ) : mostrados.map(r => {
          const decidido = r.items.length > 0 && r.items.every(i => i.decision !== 'Pendiente');
          const hayAprobados = r.items.some(i => i.decision === 'Aprobado');
          return (
          <Fragment key={r.n}>
          {verArchivados && rqsArchivados.length > 0 && r.n === rqsArchivados[0].n && (
            <div className="flex items-center gap-2 mt-4 mb-2 pt-3 border-t border-slate-700">
              <span className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">📁 Archivados · {rqsArchivados.length}</span>
              <button onClick={() => setVerArchivados(false)}
                className="ml-auto px-2.5 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200">
                ✕ Cerrar archivados</button>
            </div>
          )}
          <div className="mb-3 border border-slate-800 rounded p-3">
            <div className="flex items-center gap-2.5 mb-2 flex-wrap">
              <b className="font-mono text-sm text-slate-100">RQ-{String(r.n).padStart(3, '0')}</b>
              <span className={`px-2 py-1 rounded text-[9px] font-bold tracking-wider uppercase border ${canalClases[r.canal] || ''}`}>{r.canal}</span>
              {rqCerrado(r) && <span className="px-2 py-1 rounded text-[9px] font-bold tracking-wider uppercase bg-slate-800 text-slate-400 border border-slate-700">📁 Archivado</span>}
              <span className="text-slate-500 text-[11px]">{r.proyecto} · {r.partida} · {r.piso || '—'} · {fmt(r.fechaRQ)}</span>
              {decidido && hayAprobados ? (
                <button onClick={() => imprimirRQ(r)}
                  className="ml-auto px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-yellow-400 border border-slate-700 hover:border-yellow-400">
                  ⤓ PDF</button>
              ) : (
                <span className="ml-auto text-[9px] text-slate-600 uppercase" title="El PDF lleva solo los ítems aprobados; se emite cuando Compras decide todos.">
                  {decidido ? 'Sin ítems aprobados' : 'PDF al cerrar decisiones'}</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr>{['Descripción', 'Cant', 'Necesitada', 'Decisión', 'Estado', 'Motivo de rechazo / anulación', 'Fecha entrega'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
                <tbody>
                  {r.items.map(i => (
                    <tr key={i.id} className="border-b border-slate-800">
                      <td className="py-2 px-1.5 text-slate-200">{i.desc}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-200">{i.cant}</td>
                      <td className="py-2 px-1.5 text-slate-200">{fmt(i.fecha)}</td>
                      <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${pillEstado(i.decision)}`}>{i.decision}</span></td>
                      <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${pillEstado(i.estado)}`}>{i.estado}</span></td>
                      <td className="py-2 px-1.5 text-red-400 text-[10px]">{i.motivoRechazo || (i.motivoAnulacion ? `Anulado: ${i.motivoAnulacion} (${i.anuladoPor})` : '—')}</td>
                      <td className="py-2 px-1.5 text-slate-400">{fmt(i.fechaEntrega)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </Fragment>
          );
        })}
        {rqsArchivados.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-800">
            <button onClick={() => setVerArchivados(!verArchivados)}
              className="text-[11px] text-slate-500 hover:text-slate-300 underline underline-offset-2">
              📁 {verArchivados ? '✕ Cerrar archivados' : `Ver archivados · ${rqsArchivados.length} requerimiento(s) completamente atendidos`}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Almacén del residente: la misma foto que ve su almacenero, en solo lectura
function AlmacenResidente({ user, db }) {
  const stock = stockDetalleObra(db, user.proyecto).sort((a, b) => a.desc.localeCompare(b.desc));
  return (
    <div>
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">
          Mi almacén · {user.proyecto} · solo consulta (lo gestiona {ALMACENEROS[user.proyecto] || 'el almacenero'})</div>
        {stock.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Tu almacén aún no tiene materiales registrados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['Código', 'Material', 'Und', 'Caducidad', 'Inicial', 'Recibido', 'Salidas', 'Préstamos ±', 'Stock'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {stock.map(s => {
                  const cad = estadoCaducidad(s.cadMin);
                  return (
                    <tr key={s.cod} className="border-b border-slate-800">
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{s.cod}</td>
                      <td className="py-2 px-1.5 text-slate-200">{s.desc}</td>
                      <td className="py-2 px-1.5 text-slate-500">{s.und}</td>
                      <td className="py-2 px-1.5">{cad ? <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase whitespace-nowrap ${cad.cls}`}>{cad.k}</span> : <span className="text-slate-600">—</span>}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-400">{s.inicial}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{s.recibido}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{s.salido}</td>
                      <td className={`py-2 px-1.5 font-mono ${s.prestNeto < 0 ? 'text-purple-400' : s.prestNeto > 0 ? 'text-green-400' : 'text-slate-500'}`}>{s.prestNeto > 0 ? '+' + s.prestNeto : s.prestNeto}</td>
                      <td className={`py-2 px-1.5 font-mono font-bold ${s.stock > 0 ? 'text-green-400' : 'text-slate-500'}`}>{s.stock}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">Antes de pedir un material, revisa aquí si ya lo tienes. Las salidas, recepciones y préstamos los registra tu almacenero.</div>
      </div>
    </div>
  );
}

// Historial de pedidos por material (residente: su obra · gerencia: todas)
function HistorialMateriales({ user, db }) {
  const esRes = user.rol === 'residente';
  const [proy, setProy] = useState(esRes ? user.proyecto : 'TODOS');
  const [abierto, setAbierto] = useState(null);
  const stocks = calcularStocks(db);

  const flat = db.rqs
    .filter(r => (esRes ? r.proyecto === user.proyecto : (proy === 'TODOS' || r.proyecto === proy)))
    .flatMap(r => r.items.map(i => ({ ...i, rq: r.n, fechaRQ: r.fechaRQ, proyecto: r.proyecto })))
    .filter(i => i.decision !== 'Rechazado' && i.decision !== 'Anulado');

  const grupos = Object.values(flat.reduce((acc, i) => {
    if (!acc[i.cod]) acc[i.cod] = { cod: i.cod, desc: i.desc, und: i.und, total: 0, pedidos: [] };
    acc[i.cod].total += Number(i.cant);
    acc[i.cod].pedidos.push(i);
    return acc;
  }, {})).map(g => ({
    ...g,
    stock: (esRes || proy !== 'TODOS')
      ? (((stocks[esRes ? user.proyecto : proy] || {})[g.cod] || {}).cant || 0)
      : PROYECTOS.reduce((a, [, p]) => a + (((stocks[p] || {})[g.cod] || {}).cant || 0), 0),
  })).sort((a, b) => b.total - a.total);

  return (
    <div>
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">
            Historial por material · {esRes ? user.proyecto : ''} · cuánto se ha pedido de cada material</div>
          {!esRes && <div className="ml-auto"><FiltroProyecto value={proy} onChange={setProy} todos /></div>}
        </div>
        {grupos.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Aún no hay pedidos registrados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['Material', 'Veces pedido', 'Cantidad total pedida', 'En almacén ahora', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {grupos.map(g => (
                  <Fragment key={g.cod}>
                    <tr onClick={() => setAbierto(abierto === g.cod ? null : g.cod)}
                      className="border-b border-slate-800 cursor-pointer hover:bg-slate-800">
                      <td className="py-2 px-1.5 text-slate-200">{g.desc} <span className="text-slate-500">({g.und})</span>
                        <div className="font-mono text-[10px] text-slate-500">{g.cod}</div></td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{g.pedidos.length}</td>
                      <td className="py-2 px-1.5 font-mono font-bold text-yellow-400">{g.total} {g.und}</td>
                      <td className={`py-2 px-1.5 font-mono font-bold ${g.stock > 0 ? 'text-green-400' : 'text-slate-500'}`}>{g.stock}</td>
                      <td className="py-2 px-1.5 text-slate-500 text-[10px]">{abierto === g.cod ? '▲ cerrar' : '▼ ver desglose'}</td>
                    </tr>
                    {abierto === g.cod && (
                      <tr className="border-b border-slate-800">
                        <td colSpan={5} className="py-2 px-4 bg-slate-950">
                          <table className="w-full text-xs">
                            <thead><tr>{['Fecha', 'RQ', ...(esRes || proy !== 'TODOS' ? [] : ['Obra']), 'Cantidad', 'Decisión', 'Estado'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
                            <tbody>
                              {[...g.pedidos].sort((a, b) => (a.fechaRQ < b.fechaRQ ? 1 : -1)).map((p, k) => (
                                <tr key={k} className="border-b border-slate-800">
                                  <td className="py-1.5 px-1.5 text-slate-400">{fmt(p.fechaRQ)}</td>
                                  <td className="py-1.5 px-1.5 font-mono text-slate-300">RQ-{String(p.rq).padStart(3, '0')}</td>
                                  {!(esRes || proy !== 'TODOS') && <td className="py-1.5 px-1.5 text-slate-400">{p.proyecto}</td>}
                                  <td className="py-1.5 px-1.5 font-mono text-slate-200">{p.cant} {p.und}</td>
                                  <td className="py-1.5 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${pillEstado(p.decision)}`}>{p.decision}</span></td>
                                  <td className="py-1.5 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${pillEstado(p.estado)}`}>{p.estado}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">Clic en un material para ver el desglose de todos sus pedidos (fecha, RQ, cantidad y estado). No incluye rechazados ni anulados.</div>
      </div>
    </div>
  );
}

function Catalogo({ user, db, api }) {
  const { catalogo, solicitudes, familias } = db;
  const puedeAprobar = user.rol === 'compras';
  const [edit, setEdit] = useState({});   // n -> { desc, und, famIu, cod }
  const [rech, setRech] = useState({});
  const [q, setQ] = useState('');
  const [aviso, setAvisoRaw] = useState('');
  // los avisos (incluidos los de error) se autolimpian
  const setAviso = m => { setAvisoRaw(m); if (m) setTimeout(() => setAvisoRaw(''), m.startsWith('⚠') ? 8000 : 6000); };
  const pend = solicitudes.filter(s => s.estado === 'Pendiente');
  const unds = useMemo(() => [...new Set(catalogo.map(m => m[2]))].sort(), [catalogo]);

  // Correlativo por familia: máximo código de la familia + 1
  const sugerirCodigo = famIu => {
    if (!famIu) return '';
    const delaFam = catalogo.filter(m => m[0].startsWith(famIu));
    if (delaFam.length) {
      const max = Math.max(...delaFam.map(m => Number(m[0])));
      return String(max + 1).padStart(6, '0');
    }
    return famIu + '0101';
  };

  const getEdit = s => edit[s.n] || { desc: s.desc, und: s.und, famIu: s.famIu || '', cod: sugerirCodigo(s.famIu), perecedero: !!s.perecedero };
  const setEditCampo = (s, k, v) => {
    const e = { ...getEdit(s), [k]: v };
    if (k === 'famIu') e.cod = sugerirCodigo(v);   // al reasignar familia se recalcula el correlativo
    setEdit({ ...edit, [s.n]: e });
  };

  const [famForm, setFamForm] = useState(null);   // null | { iu, nombre }

  // Primer IU libre entre 01 y 99
  const sugerirIU = () => {
    const usados = new Set(familias.map(f => f[0]));
    for (let i = 1; i <= 99; i++) {
      const iu = String(i).padStart(2, '0');
      if (!usados.has(iu)) return iu;
    }
    return '';
  };

  const crearFamilia = async () => {
    const iu = famForm.iu.trim();
    const nombre = famForm.nombre.trim().toUpperCase();
    if (!/^\d{2}$/.test(iu)) { setAviso('⚠ El IU debe tener exactamente 2 dígitos.'); return; }
    if (familias.some(f => f[0] === iu)) { setAviso(`⚠ El IU ${iu} ya está usado por "${familias.find(f => f[0] === iu)[1]}".`); return; }
    if (!nombre) return;
    if (familias.some(f => f[1].toUpperCase() === nombre)) { setAviso('⚠ Ya existe una familia con ese nombre.'); return; }
    const r = await api.crearFamilia({ iu, nombre });
    if (r.error) { setAviso('⚠ ' + r.error); return; }
    setFamForm(null);
    setAviso(`Familia ${iu} · "${nombre}" creada. Ya aparece en las listas de familia.`);
    setTimeout(() => setAviso(''), 4000);
  };

  const aprobar = async s => {
    const e = getEdit(s);
    const cod = e.cod.trim();
    if (!e.famIu) { setAviso('⚠ Asigna una familia antes de aprobar.'); return; }
    if (!e.desc.trim()) { setAviso('⚠ La descripción no puede quedar vacía.'); return; }
    if (!/^\d{6}$/.test(cod)) { setAviso('⚠ El código debe tener exactamente 6 dígitos.'); return; }
    if (!cod.startsWith(e.famIu)) { setAviso(`⚠ El código ${cod} no corresponde a la familia ${e.famIu} (debe empezar con ${e.famIu}).`); return; }
    if (catalogo.some(m => m[0] === cod)) { setAviso('⚠ Ese código ya existe en el catálogo.'); return; }
    const r = await api.aprobarSolicitud(s, { codigo: cod, desc: e.desc.trim().toUpperCase(), und: e.und, famIu: e.famIu, perecedero: !!e.perecedero });
    if (r.error) { setAviso('⚠ ' + r.error); return; }
    const e2 = { ...edit }; delete e2[s.n]; setEdit(e2);
    setAviso(`Material "${e.desc.trim()}" aprobado con código ${cod}.`);
    setTimeout(() => setAviso(''), 4000);
  };

  const rechazar = async s => {
    const motivo = (rech[s.n] || '').trim();
    if (!motivo) return;
    const r = await api.rechazarSolicitud(s, motivo);
    if (r.error) { setAviso('⚠ ' + r.error); return; }
    const r2 = { ...rech }; delete r2[s.n]; setRech(r2);
  };

  const res = useMemo(() => buscarEnCatalogo(catalogo, q, 15), [q, catalogo]);

  return (
    <div>
      <Aviso msg={aviso} />
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Solicitudes de material nuevo · {pend.length} pendiente(s)</div>
        {pend.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Sin solicitudes pendientes. Los residentes las envían desde su vista.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['#', 'Fecha', 'Solicitante', 'Material', 'Und', 'Familia', 'Código a asignar', 'Acción'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {pend.map(s => {
                  const enRech = rech[s.n] !== undefined;
                  return (
                    <tr key={s.n} className="border-b border-slate-800 align-top">
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{s.n}</td>
                      <td className="py-2 px-1.5 text-slate-400">{fmt(s.fecha)}</td>
                      <td className="py-2 px-1.5 text-slate-400">{s.solicitante} · {s.proyecto}</td>
                      <td className="py-2 px-1.5">
                        {puedeAprobar ? <input value={getEdit(s).desc} onChange={e => setEditCampo(s, 'desc', e.target.value)} className={`w-52 ${inputCls}`} />
                          : <span className="text-slate-200">{s.desc}</span>}</td>
                      <td className="py-2 px-1.5">
                        {puedeAprobar ? (
                          <div>
                            <select value={getEdit(s).und} onChange={e => setEditCampo(s, 'und', e.target.value)} className={inputCls}>
                              {[...new Set([getEdit(s).und, ...unds])].map(u => <option key={u}>{u}</option>)}</select>
                            <label className="flex items-center gap-1 mt-1 cursor-pointer text-[9px] text-slate-400">
                              <input type="checkbox" checked={!!getEdit(s).perecedero} onChange={e => setEditCampo(s, 'perecedero', e.target.checked)} />
                              <span>Perecedero</span>
                            </label>
                          </div>
                        ) : <span className="text-slate-500">{s.und}{s.perecedero ? ' · perecedero' : ''}</span>}</td>
                      <td className="py-2 px-1.5">
                        {puedeAprobar ? (
                          <select value={getEdit(s).famIu} onChange={e => setEditCampo(s, 'famIu', e.target.value)} className={inputCls} style={{ maxWidth: '180px' }}>
                            <option value="">— Asignar familia —</option>
                            {familias.map(([iu, n]) => <option key={iu} value={iu}>{iu} · {n}</option>)}</select>
                        ) : <span className="text-slate-400">{s.fam || '—'}</span>}</td>
                      <td className="py-2 px-1.5">
                        <input value={getEdit(s).cod} onChange={e => setEditCampo(s, 'cod', e.target.value)}
                          className={`w-24 ${inputCls} font-mono`} maxLength={6} disabled={!puedeAprobar} />
                        <div className="text-[9px] text-slate-500 mt-1">Correlativo por familia; editable.</div></td>
                      <td className="py-2 px-1.5">
                        {!puedeAprobar ? <span className="text-slate-500 text-[10px]">Solo Compras aprueba</span> : !enRech ? (
                          <div className="flex gap-1">
                            <button onClick={() => aprobar(s)} className={btnVerde}>Aprobar y codificar</button>
                            <button onClick={() => setRech({ ...rech, [s.n]: '' })} className={btnRojo}>Rechazar</button>
                          </div>
                        ) : (
                          <div className="w-44">
                            <input value={rech[s.n]} onChange={e => setRech({ ...rech, [s.n]: e.target.value })} placeholder="Motivo (ej: duplicado de 210112)" className={`w-full ${inputCls}`} />
                            <button onClick={() => rechazar(s)} disabled={!(rech[s.n] || '').trim()}
                              className={`mt-1 w-full px-2 py-1 rounded text-[9px] font-bold uppercase ${(rech[s.n] || '').trim() ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>Confirmar rechazo</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">Solo el dueño del catálogo aprueba y codifica. Puedes corregir la descripción, la unidad y reasignar la familia antes de aprobar — el código correlativo se recalcula solo. Antes de aprobar, busca abajo si el material ya existe con otro nombre — evita duplicados.</div>
      </div>

      {puedeAprobar && (
        <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Familias del catálogo · {familias.length}</div>
            {!famForm && (
              <button onClick={() => setFamForm({ iu: sugerirIU(), nombre: '' })}
                className="ml-auto text-[11px] text-yellow-400 hover:text-yellow-300 underline underline-offset-2">＋ Nueva familia</button>
            )}
          </div>
          {famForm && (
            <div className="mt-3 bg-slate-950 border border-slate-700 rounded p-3">
              <div className={lblCls}>Nueva familia (IU de 2 dígitos + nombre)</div>
              <div className="flex gap-2 mt-1 flex-wrap items-start">
                <div>
                  <input value={famForm.iu} onChange={e => setFamForm({ ...famForm, iu: e.target.value })}
                    maxLength={2} className={`w-16 ${inputCls} font-mono`} />
                  <div className="text-[9px] text-slate-500 mt-1">Sugerido: primer IU libre.</div>
                </div>
                <input value={famForm.nombre} onChange={e => setFamForm({ ...famForm, nombre: e.target.value })}
                  placeholder="Nombre de la familia (ej: TUBERIA HDPE)" className={`flex-1 ${inputCls}`} style={{ minWidth: '220px' }} />
                <button onClick={crearFamilia} disabled={!famForm.nombre.trim() || !/^\d{2}$/.test(famForm.iu.trim())}
                  className={btnOk(!!(famForm.nombre.trim() && /^\d{2}$/.test(famForm.iu.trim())))}>Crear familia</button>
                <button onClick={() => setFamForm(null)} className="px-3 py-1.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-400 hover:text-slate-200">Cancelar</button>
              </div>
              <div className="text-[10px] text-slate-500 mt-2">Los materiales de esta familia llevarán códigos que empiezan con su IU. Crear una familia no se puede deshacer desde la app si ya tiene materiales.</div>
            </div>
          )}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Catálogo maestro · {catalogo.length} materiales</div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en el catálogo para verificar duplicados…" className={`w-full ${inputCls} py-2 text-sm mb-2`} />
        {res.length > 0 && (
          <table className="w-full text-xs">
            <thead><tr>{['Código', 'Descripción', 'Und', 'Familia', 'Perecedero'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>
              {res.map(m => (
                <tr key={m[0]} className="border-b border-slate-800">
                  <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{m[0]}</td>
                  <td className="py-2 px-1.5 text-slate-200">{m[1]}</td>
                  <td className="py-2 px-1.5 text-slate-500">{m[2]}{m[4] ? ` (${m[5]} de ${m[4]})` : ''}</td>
                  <td className="py-2 px-1.5 text-slate-400">{m[3]}</td>
                  <td className="py-2 px-1.5">
                    {puedeAprobar ? (
                      <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-400">
                        <input type="checkbox" checked={!!m[6]}
                          onChange={async e => {
                            const r = await api.setPerecedero(m[0], e.target.checked);
                            if (r.error) { setAviso('⚠ ' + r.error); return; }
                            setAviso(e.target.checked
                              ? `"${m[1]}" marcado como perecedero: la recepción exigirá fecha de caducidad.`
                              : `"${m[1]}" ya no es perecedero.`);
                            setTimeout(() => setAviso(''), 4000);
                          }} />
                        <span>{m[6] ? 'Sí · exige caducidad' : 'No'}</span>
                      </label>
                    ) : <span className="text-slate-500 text-[10px]">{m[6] ? 'Sí' : 'No'}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">Marca como perecederos los materiales con fecha de vencimiento (pinturas, aditivos, sellantes, cemento…): su recepción exigirá la fecha de caducidad y el stock mostrará el semáforo de vencimiento.</div>
      </div>
    </div>
  );
}

function Compras({ user, db, api, modo }) {
  const { rqs, facturas, proveedores, ultimaCompra } = db;
  const facturarSolo = modo === 'facturar';   // rol comprador: solo factura, no decide
  const puedeFacturar = user.rol === 'compras' || user.rol === 'comprador';
  const [rechazo, setRechazo] = useState({});
  const [aviso, setAviso] = useState('');
  const [proy, setProy] = useState('TODOS');
  const [fFact, setFFact] = useState({});
  const [triage, setTriage] = useState(null);
  const [busca, setBusca] = useState('');
  const [confAprRq, setConfAprRq] = useState(null);
  const [verArch, setVerArch] = useState(false);
  const [verPagadas, setVerPagadas] = useState(false);

  const updItem = async (i, patch, okMsg) => {
    const r = await api.updItem(i.id, patch);
    if (r.error) { setAviso('⚠ ' + r.error); setTimeout(() => setAviso(''), 7000); return false; }
    if (okMsg) { setAviso(okMsg); setTimeout(() => setAviso(''), 5000); }
    return true;
  };

  const rqMap = Object.fromEntries(rqs.map(r => [r.n, r]));
  const flatBase = rqs.flatMap(r => r.items.map(i => ({ ...i, rq: r.n, fechaRQ: r.fechaRQ, canal: r.canal, residente: r.residente, just: r.just, proyecto: r.proyecto, piso: r.piso })));
  // primero lo que se necesita antes (fecha necesitada ascendente)
  const flatAbierto = flatBase
    .filter(i => i.decision !== 'Rechazado' && i.decision !== 'Anulado')
    .filter(i => !(i.estado === 'Entregado' && i.pago === 'Pagado'))
    .filter(i => proy === 'TODOS' || i.proyecto === proy)
    // el comprador (Frank) solo factura lo que ÉL marcó Comprado
    .filter(i => !facturarSolo || (i.decision === 'Aprobado' && i.compradoPorId === user.id));
  const esTriage = {
    decidir: i => i.decision === 'Pendiente',
    facturar: i => i.decision === 'Aprobado' && !i.factura,
    comprado: i => i.estado === 'Comprado',
    incompleto: i => i.estado === 'Incompleto',
  };
  const chips = [
    !facturarSolo && ['decidir', 'Por decidir', 'text-yellow-400'],
    ['facturar', 'Por facturar', 'text-sky-400'],
    ['comprado', 'Comprado', 'text-green-400'],
    ['incompleto', 'Incompletos', 'text-red-400'],
  ].filter(Boolean);
  const matchBusca = i => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    const texto = `${i.desc} ${i.cod} rq-${String(i.rq).padStart(3, '0')} ${i.rq} ${i.residente} ${i.proyecto}`.toLowerCase();
    return q.split(/\s+/).every(p => texto.includes(p));
  };
  const ordenar = arr => [...arr].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.rq - b.rq));
  // Archivados: ítems ya cerrados (Entregado + Pagado). Salen de la vista activa
  // igual que en el residente; se ven bajo demanda con el botón.
  const flatArchivado = flatBase
    .filter(i => i.estado === 'Entregado' && i.pago === 'Pagado')
    .filter(i => proy === 'TODOS' || i.proyecto === proy)
    .filter(i => !facturarSolo || (i.decision === 'Aprobado' && i.compradoPorId === user.id));
  const flatActivos = ordenar(flatAbierto.filter(i => !triage || esTriage[triage](i)).filter(matchBusca));
  const archMostrados = verArch ? ordenar(flatArchivado.filter(matchBusca)) : [];
  const flat = [
    ...flatActivos.map(i => ({ ...i, _arch: false })),
    ...archMostrados.map(i => ({ ...i, _arch: true })),
  ];

  const enviarRechazo = async i => {
    const motivo = (rechazo[i.id] || '').trim();
    if (!motivo) return;
    const ok = await updItem(i, { decision: 'Rechazado', motivo_rechazo: motivo },
      `Rechazo de "${i.desc}" (RQ-${String(i.rq).padStart(3, '0')}) comunicado al residente ${i.residente}. El ítem quedó cerrado; puedes verlo en el Tablero.`);
    if (ok) { const r2 = { ...rechazo }; delete r2[i.id]; setRechazo(r2); }
  };

  const anularItem = (i, motivo) => {
    updItem(i, { decision: 'Anulado', anulacion: { motivo, por: user.nombre, fecha: HOY_ISO } },
      `Ítem "${i.desc}" anulado por ${user.nombre}. Queda registrado en el Tablero con motivo.`);
  };

  // Atajo: aprobar de un clic todos los pendientes de un RQ (con confirmación)
  const aprobarRq = async rqNum => {
    const pend = flatBase.filter(x => x.rq === rqNum && x.decision === 'Pendiente');
    setConfAprRq(null);
    for (const x of pend) {
      const ok = await updItem(x, { decision: 'Aprobado' });
      if (!ok) return;
    }
    setAviso(`${pend.length} ítem(s) del RQ-${String(rqNum).padStart(3, '0')} aprobados.`);
    setTimeout(() => setAviso(''), 4000);
  };

  // Enter salta al siguiente campo dentro del formulario de factura
  const enterSiguiente = e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const campos = [...e.currentTarget.closest('.form-factura').querySelectorAll('input:not([type=checkbox]):not([disabled]), select:not([disabled])')];
    const idx = campos.indexOf(e.currentTarget);
    if (idx >= 0 && idx < campos.length - 1) campos[idx + 1].focus();
  };

  const abrirFactura = i => {
    if (!puedeFacturar) { setAviso('⚠ Solo Compras registra facturas.'); setTimeout(() => setAviso(''), 5000); return; }
    setFFact({ ...fFact, [i.id]: fFact[i.id] || { serie: '', prov: '', ruc: '', fecha: HOY_ISO, monto: '', forma: FORMAS_PAGO[0], extras: [], precios: {}, efectivo: false, compromiso: false } });
  };
  const cerrarFactura = id => { const f2 = { ...fFact }; delete f2[id]; setFFact(f2); };

  const setFF = (id, k, v) => {
    const f = { ...fFact[id], [k]: v };
    if (k === 'prov') {
      const p = proveedores.find(x => x[1] === v);
      if (p) f.ruc = p[0];
    }
    setFFact({ ...fFact, [id]: f });
  };

  const toggleExtra = (id, itemId) => {
    const f = fFact[id];
    const extras = f.extras.includes(itemId) ? f.extras.filter(x => x !== itemId) : [...f.extras, itemId];
    setFFact({ ...fFact, [id]: { ...f, extras } });
  };

  const registrarFactura = async i => {
    const f = fFact[i.id];
    const cubiertos = [i, ...flatBase.filter(x => f.extras.includes(x.id))];
    const suma = cubiertos.reduce((a, x) => a + (Number(f.precios[x.id]) || 0) * x.cant, 0);
    const ok = (f.compromiso || f.serie.trim()) && f.prov.trim() && /^\d{11}$/.test(f.ruc) && f.fecha && Number(f.monto) > 0
      && cubiertos.every(x => Number(f.precios[x.id]) > 0) && Math.abs(suma - Number(f.monto)) <= 0.1;
    if (!ok) return;
    const serie = f.compromiso ? 'CRED-PEND' : f.serie.trim().toUpperCase();
    if (!f.compromiso && facturas.some(x => x.serie === serie && x.ruc === f.ruc)) {
      setAviso(`⚠ La factura ${serie} de ese RUC ya está registrada. Verifica el número.`);
      setTimeout(() => setAviso(''), 6000);
      return;
    }
    const r = await api.registrarFactura({
      serie, prov: f.prov.trim().toUpperCase(), ruc: f.ruc, fecha: f.fecha,
      monto: Number(f.monto), forma: f.compromiso ? 'Crédito' : f.efectivo ? 'Contado' : f.forma, proyecto: i.proyecto,
      efectivo: !!f.efectivo, compromiso: !!f.compromiso,
      lineas: cubiertos.map(x => ({ id: x.id, precio: Number(f.precios[x.id]) })),
    });
    if (r.error) { setAviso('⚠ ' + r.error); setTimeout(() => setAviso(''), 7000); return; }
    const f2 = { ...fFact }; delete f2[i.id]; setFFact(f2);
    setAviso(f.compromiso
      ? `Compromiso de crédito registrado cubriendo ${cubiertos.length} ítem(s): la deuda ya es visible en Pagos; la serie real se digita al pagar.`
      : `Factura ${serie} registrada cubriendo ${cubiertos.length} ítem(s).`);
    setTimeout(() => setAviso(''), 6000);
  };

  const factProy = facturas.filter(f => proy === 'TODOS' || f.proyecto === proy);
  const factPendientes = factProy.filter(f => f.estadoPago !== 'Pagada');
  const factPagadas = factProy.filter(f => f.estadoPago === 'Pagada');
  const factMostradas = verPagadas ? factProy : factPendientes;

  // Consolidado por comprar: ítems aprobados sin gestionar (sin factura y
  // sin estado logístico), agrupados por material entre todas las obras.
  const stocks = calcularStocks(db);
  const porComprar = Object.values(flatBase
    .filter(i => i.decision === 'Aprobado' && !i.factura && i.estado === '—')
    .reduce((acc, i) => {
      if (!acc[i.cod]) acc[i.cod] = { cod: i.cod, desc: i.desc, und: i.und, total: 0, porObra: {}, minFecha: i.fecha };
      const g = acc[i.cod];
      g.total += Number(i.cant);
      g.porObra[i.proyecto] = (g.porObra[i.proyecto] || 0) + Number(i.cant);
      if (i.fecha < g.minFecha) g.minFecha = i.fecha;
      return acc;
    }, {}))
    .sort((a, b) => a.minFecha < b.minFecha ? -1 : 1);

  // sugerencia: alguna obra ya tiene stock de ese material (peor si está por vencer)
  const stockEnOtrasObras = g => PROYECTOS
    .map(([c, p]) => ({ obra: p, ...((stocks[p] || {})[g.cod] || { cant: 0, cadMin: null }) }))
    .filter(x => x.cant > 0);

  return (
    <div>
    {!facturarSolo && porComprar.length > 0 && (
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">
          Consolidado por comprar · {porComprar.length} material(es) · une pedidos de varias obras (la factura sigue siendo una por obra)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr>{['Material', 'Total a comprar', 'Detalle por obra', 'Más urgente', 'Stock en otras obras'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>
              {porComprar.map(g => {
                const otras = stockEnOtrasObras(g);
                const urg = diasHoy(g.minFecha);
                return (
                  <tr key={g.cod} className="border-b border-slate-800 align-top">
                    <td className="py-2 px-1.5 text-slate-200">{g.desc} <span className="text-slate-500">({g.und})</span>
                      <div className="font-mono text-[10px] text-slate-500">{g.cod}</div></td>
                    <td className="py-2 px-1.5 font-mono font-bold text-yellow-400">{g.total} {g.und}</td>
                    <td className="py-2 px-1.5 text-slate-300 text-[10px]">
                      {Object.entries(g.porObra).map(([o, c]) => `${o}: ${c}`).join(' · ')}
                      {Object.keys(g.porObra).length > 1 && <span className="ml-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-green-950 text-green-400">consolidable</span>}</td>
                    <td className={`py-2 px-1.5 whitespace-nowrap ${urg < 2 ? 'text-red-400 font-bold' : 'text-slate-300'}`}>{fmt(g.minFecha)}{urg < 2 ? ' · URGENTE' : ''}</td>
                    <td className="py-2 px-1.5 text-[10px]">
                      {otras.length === 0 ? <span className="text-slate-600">—</span> : otras.map(x => {
                        const cad = estadoCaducidad(x.cadMin);
                        const porVencer = cad && (cad.cls.includes('yellow') || cad.cls.includes('red'));
                        const esSolicitante = !!g.porObra[x.obra];
                        return (
                          <div key={x.obra} className={porVencer ? 'text-yellow-400' : 'text-sky-400'}>
                            {esSolicitante
                              ? `${x.obra} ya tiene ${x.cant} ${g.und} en su almacén${porVencer ? ` (${cad.k})` : ''} — verificar antes de comprar`
                              : `${x.obra} tiene ${x.cant} ${g.und}${porVencer ? ` (${cad.k}) — transferir antes que comprar` : ' — considerar préstamo/transferencia'}`}
                          </div>
                        );
                      })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-slate-500 text-[11px]">Negocia el total con el proveedor y pídele factura separada por obra: mejor precio por volumen sin mezclar presupuestos.</div>
      </div>
    )}
    <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Gestión de compras · aprobación, estado y seguimiento</div>
        <div className="ml-auto"><FiltroProyecto value={proy} onChange={setProy} todos /></div>
      </div>
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {chips.map(([k, l, cls]) => {
          const n = flatAbierto.filter(esTriage[k]).length;
          const activo = triage === k;
          return (
            <button key={k} onClick={() => setTriage(activo ? null : k)}
              className={`px-2.5 py-1.5 rounded text-[10px] font-bold uppercase border ${activo ? 'border-yellow-400 ring-1 ring-yellow-400 bg-slate-800' : 'border-slate-700 bg-slate-800 hover:border-slate-500'}`}>
              <span className={`font-mono mr-1 ${cls}`}>{n}</span>
              <span className="text-slate-300">{l}{activo ? ' ✕' : ''}</span>
            </button>
          );
        })}
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar material, RQ, residente…" className={`ml-auto w-56 ${inputCls}`} />
        <button onClick={() => setVerArch(v => !v)}
          className={`px-2.5 py-1.5 rounded text-[10px] font-bold uppercase border ${verArch ? 'border-yellow-400 text-yellow-400 bg-slate-800' : 'border-slate-700 text-slate-400 bg-slate-800 hover:border-slate-500'}`}>
          📁 {verArch ? '✕ Ocultar' : `Archivados · ${flatArchivado.length}`}</button>
      </div>
      <Aviso msg={aviso} />
      {flat.length === 0 && <div className="text-center py-6 text-slate-500 text-sm">
        {triage || busca.trim() ? 'Nada que coincida con el filtro.' : `Sin requerimientos abiertos ${proy !== 'TODOS' ? 'en ' + proy : ''}.`}</div>}
      {flat.length > 0 && (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr>{['RQ', 'Proyecto', 'Nivel', 'Canal', 'Residente', 'Descripción', 'Cant', 'Necesitada', 'Decisión', 'Estado', 'Pago', 'Fecha entrega', 'Llegó en', 'Holgura', 'Recojo saldo', 'Entrega saldo', 'Saldo en', '¿Comunicó residente?', 'Destino saldo', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {flat.map((i, idx) => {
              const llego = i.fechaEntrega ? dias(i.fechaEntrega, i.fechaRQ) : null;
              const holg = i.fechaEntrega && i.fecha ? dias(i.fecha, i.fechaEntrega) : null;
              const saldoDias = i.fechaEntregaSaldo && i.fechaEntrega ? dias(i.fechaEntregaSaldo, i.fechaEntrega) : null;
              const inc = i.estado === 'Incompleto';
              const enRechazo = rechazo[i.id] !== undefined;
              const enFact = fFact[i.id] !== undefined;
              const post = i.decision === 'Aprobado';
              const ff = fFact[i.id];
              const cubiertosFF = enFact ? [i, ...flatBase.filter(x => ff.extras.includes(x.id))] : [];
              const sumaDesglose = cubiertosFF.reduce((a, x) => a + (Number(ff.precios[x.id]) || 0) * x.cant, 0);
              const cuadra = enFact && Number(ff.monto) > 0 && Math.abs(sumaDesglose - Number(ff.monto)) <= 0.1;
              const factOk = ff && (ff.compromiso || ff.serie.trim()) && ff.prov.trim() && /^\d{11}$/.test(ff.ruc) && ff.fecha && Number(ff.monto) > 0
                && cubiertosFF.every(x => Number(ff.precios[x.id]) > 0) && cuadra;
              const candidatosExtra = enFact ? flatBase.filter(x => x.id !== i.id && x.proyecto === i.proyecto && x.decision === 'Aprobado' && x.pago !== 'Pagado') : [];
              const rqDe = rqMap[i.rq];
              const pdfListo = rqDe.items.length > 0 && rqDe.items.every(x => x.decision !== 'Pendiente') && rqDe.items.some(x => x.decision === 'Aprobado');
              const esPrimerArch = i._arch && (idx === 0 || !flat[idx - 1]._arch);
              return (
                <Fragment key={i.id}>
                {esPrimerArch && (
                  <tr><td colSpan={20} className="pt-4 pb-1">
                    <span className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">📁 Archivados · {archMostrados.length} · entregados y pagados (cerrados)</span>
                  </td></tr>
                )}
                <tr className={`border-b border-slate-800 align-top ${i._arch ? 'opacity-60' : ''}`}>
                  <td className="py-2 px-1.5 whitespace-nowrap">
                    {i._arch && <span className="text-slate-500 text-[10px] mr-1">📁</span>}
                    {pdfListo ? (
                      <>
                        <button onClick={() => imprimirRQ(rqDe)} title="Ver PDF del requerimiento (solo ítems aprobados)"
                          className="font-mono text-[11px] text-slate-200 underline decoration-dotted underline-offset-2 hover:text-yellow-400">
                          RQ-{String(i.rq).padStart(3, '0')}</button>
                        <span className="text-yellow-400 text-[10px] ml-1">⤓</span>
                      </>
                    ) : (
                      <span className="font-mono text-[11px] text-slate-400" title="El PDF se emite cuando todos los ítems del RQ estén decididos (solo lleva los aprobados).">
                        RQ-{String(i.rq).padStart(3, '0')}</span>
                    )}</td>
                  <td className="py-2 px-1.5 text-slate-400 whitespace-nowrap">{i.proyecto}</td>
                  <td className="py-2 px-1.5 text-slate-400 whitespace-nowrap text-[10px]">{i.piso || '—'}</td>
                  <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 ${i.canal === 'URGENTE' ? 'text-red-400' : i.canal === 'GENERAL' ? 'text-green-400' : 'text-yellow-400'}`}>{i.canal}</span></td>
                  <td className="py-2 px-1.5 text-slate-400 whitespace-nowrap">{i.residente}</td>
                  <td className="py-2 px-1.5 text-slate-200">{i.desc} <span className="text-slate-500">({i.und})</span>
                    {i.just && <div className="text-yellow-400 text-[10px] mt-1">Motivo: {i.just}</div>}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-200">{i.cant}</td>
                  <td className="py-2 px-1.5 text-slate-200">{fmt(i.fecha)}</td>
                  <td className="py-2 px-1.5">
                    {i.decision === 'Pendiente' && !enRechazo && (
                      <div>
                        <div className="flex gap-1">
                          <button onClick={() => updItem(i, { decision: 'Aprobado' })} className={btnVerde}>Aprobar</button>
                          <button onClick={() => setRechazo({ ...rechazo, [i.id]: '' })} className={btnRojo}>Rechazar</button>
                        </div>
                        {rqDe.items.filter(x => x.decision === 'Pendiente').length > 1 && (
                          confAprRq === i.rq ? (
                            <button onClick={() => aprobarRq(i.rq)}
                              className="mt-1 w-full px-2 py-1 rounded text-[9px] font-bold uppercase bg-green-950 text-green-400 border border-green-700 hover:bg-green-900">
                              ¿Confirmar? Aprueba {rqDe.items.filter(x => x.decision === 'Pendiente').length} ítems</button>
                          ) : (
                            <button onClick={() => { setConfAprRq(i.rq); setTimeout(() => setConfAprRq(c => c === i.rq ? null : c), 5000); }}
                              className="mt-1 text-[9px] text-slate-500 underline decoration-dotted hover:text-green-400">
                              ≡ Aprobar todo el RQ ({rqDe.items.filter(x => x.decision === 'Pendiente').length} pend.)</button>
                          )
                        )}
                      </div>
                    )}
                    {enRechazo && (
                      <div className="w-48">
                        <textarea rows={2} value={rechazo[i.id]} onChange={e => setRechazo({ ...rechazo, [i.id]: e.target.value })}
                          placeholder="¿Por qué se rechazó? (obligatorio)" className={`w-full ${inputCls}`} />
                        <button onClick={() => enviarRechazo(i)} disabled={!(rechazo[i.id] || '').trim()}
                          className={`mt-1 w-full px-2 py-1.5 rounded text-[9px] font-bold uppercase ${(rechazo[i.id] || '').trim() ? 'bg-red-950 text-red-400 border border-red-800 hover:bg-red-900' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
                          Enviar y comunicar al residente</button>
                      </div>
                    )}
                    {i.decision === 'Aprobado' && <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${pillEstado('Aprobado')}`}>Aprobado</span>}
                  </td>
                  <td className="py-2 px-1.5">
                    {post ? (
                      i.estado === '—' ? (
                        puedeFacturar
                          ? <button onClick={() => updItem(i, { estado: 'Comprado' }, `Ítem "${i.desc}" marcado como Comprado. Ahora lo ve todo el equipo; el almacén lo cerrará al recibir.`)}
                              className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-green-400 border border-slate-700 hover:border-green-400"
                              title="Marca este ítem como comprado o recogido. Cambia el estado para todos.">✓ Comprado</button>
                          : <span className="text-slate-500 text-[10px]">Por comprar</span>
                      ) : (
                        <div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${pillEstado(i.estado)}`}
                            title="Comprado lo marca Compras o el comprador; Entregado e Incompleto los fija el almacén al recibir.">{i.estado}</span>
                          {i.estado === 'Comprado' && i.compradoPor && <div className="text-[9px] text-slate-500 mt-0.5">por {i.compradoPor}</div>}
                        </div>
                      )
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="py-2 px-1.5">{post ? (
                    <div>
                      {!i.factura && !enFact && (
                        puedeFacturar
                          ? <button onClick={() => abrirFactura(i)} className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-yellow-400 border border-slate-700 hover:border-yellow-400">＋ Factura</button>
                          : <span className="text-slate-600">Sin factura</span>
                      )}
                      {enFact && (
                        <div className="form-factura mt-1.5 w-60 bg-slate-950 border border-yellow-400 rounded p-2">
                          <div className="flex items-center mb-1.5">
                            <div className="text-[9px] font-bold text-yellow-400 uppercase">Datos de factura (obligatorios) · Enter salta al siguiente</div>
                            <button onClick={() => cerrarFactura(i.id)} className="ml-auto text-[10px] text-slate-500 hover:text-slate-200">✕</button>
                          </div>
                          {!ff.efectivo && (
                            <label className="flex items-start gap-1.5 mb-1.5 cursor-pointer text-[10px] text-slate-300">
                              <input type="checkbox" checked={!!ff.compromiso} onChange={e => setFF(i.id, 'compromiso', e.target.checked)} className="mt-0.5" />
                              <span><b>SIN factura aún</b>: el proveedor da crédito y emite la factura recién al pagar (compromiso)</span>
                            </label>
                          )}
                          {ff.compromiso ? (
                            <div className="mb-1 px-2 py-1.5 rounded border border-yellow-700 bg-yellow-950 text-[9px] text-yellow-400">
                              Serie interna CRED-… asignada por el sistema. La serie real la digita Pagos al pagar, con la factura en mano.</div>
                          ) : (
                            <input value={ff.serie} onChange={e => setFF(i.id, 'serie', e.target.value)} onKeyDown={enterSiguiente}
                              placeholder="N° factura: F001-000123" className={`w-full mb-1 ${pendCls(!!ff.serie.trim())} font-mono`} />
                          )}
                          <input list={`fprov-${i.id}`} value={ff.prov} onChange={e => setFF(i.id, 'prov', e.target.value)} onKeyDown={enterSiguiente}
                            disabled={!ff.compromiso && !ff.serie.trim()} placeholder="Proveedor (razón social)"
                            className={`w-full mb-1 ${pendCls(!!ff.prov.trim())} ${!ff.compromiso && !ff.serie.trim() ? 'opacity-60 cursor-not-allowed' : ''}`} />
                          <datalist id={`fprov-${i.id}`}>{proveedores.map(p => <option key={p[0]} value={p[1]} />)}</datalist>
                          <input value={ff.ruc} onChange={e => setFF(i.id, 'ruc', e.target.value)} onKeyDown={enterSiguiente}
                            disabled={!ff.prov.trim()} placeholder="RUC (11 dígitos)" maxLength={11}
                            className={`w-full mb-1 ${pendCls(/^\d{11}$/.test(ff.ruc))} font-mono ${!ff.prov.trim() ? 'opacity-60 cursor-not-allowed' : ''}`} />
                          {ff.ruc && !/^\d{11}$/.test(ff.ruc) && <div className="text-[9px] text-red-400 mb-1">RUC inválido</div>}
                          {ff.ruc && /^\d{11}$/.test(ff.ruc) && !proveedores.some(p => p[0] === ff.ruc) && <div className="text-[9px] text-sky-400 mb-1">Proveedor nuevo: se agregará al maestro.</div>}
                          <FechaInput value={ff.fecha} onChange={e => setFF(i.id, 'fecha', e.target.value)} onKeyDown={enterSiguiente} className={`w-full mb-1 ${inputCls}`} />
                          <input type="number" min="0.01" step="any" value={ff.monto} onChange={e => setFF(i.id, 'monto', e.target.value)} onKeyDown={enterSiguiente}
                            disabled={!/^\d{11}$/.test(ff.ruc)} placeholder="Monto TOTAL S/ (inc. IGV)"
                            className={`w-full mb-1 ${pendCls(Number(ff.monto) > 0)} font-mono ${!/^\d{11}$/.test(ff.ruc) ? 'opacity-60 cursor-not-allowed' : ''}`} />
                          {ff.compromiso ? (
                            <div className={`w-full mb-1 ${inputCls} bg-slate-800 text-slate-400`}>Forma: Crédito (fija en compromisos)</div>
                          ) : !ff.efectivo && (
                            <select value={ff.forma} onChange={e => setFF(i.id, 'forma', e.target.value)} onKeyDown={enterSiguiente} className={`w-full mb-1 ${inputCls}`}>
                              {FORMAS_PAGO.map(x => <option key={x}>{x}</option>)}</select>
                          )}
                          {!ff.compromiso && (
                          <label className="flex items-start gap-1.5 mb-1 cursor-pointer text-[10px] text-slate-300">
                            <input type="checkbox" checked={!!ff.efectivo} onChange={e => setFF(i.id, 'efectivo', e.target.checked)} className="mt-0.5" />
                            <span>Ya pagada en <b>EFECTIVO</b> (caja chica de hoy) — queda Pagada y entra a la rendición del día</span>
                          </label>
                          )}
                          {candidatosExtra.length > 0 && (
                            <div className="mb-1.5 border-t border-slate-700 pt-1.5">
                              <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">¿Esta factura cubre otros ítems? ({i.proyecto})</div>
                              <div className="max-h-24 overflow-y-auto">
                                {candidatosExtra.map(x => (
                                  <label key={x.id} className="flex items-start gap-1.5 text-[10px] text-slate-300 mb-1 cursor-pointer">
                                    <input type="checkbox" checked={ff.extras.includes(x.id)} onChange={() => toggleExtra(i.id, x.id)} className="mt-0.5" />
                                    <span>RQ-{String(x.rq).padStart(3, '0')} · {x.desc}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="mb-1.5 border-t border-slate-700 pt-1.5">
                            <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">Desglose: S/ por unidad de cada ítem (según factura)</div>
                            {cubiertosFF.map(x => {
                              const uc = ultimaCompra && ultimaCompra[x.cod];
                              const precioIng = Number(ff.precios[x.id]) || 0;
                              const subio = uc && precioIng > 0 && precioIng > uc.precio * 1.05;
                              return (
                              <div key={x.id} className="mb-1">
                                <div className="flex items-center gap-1">
                                  <span className="flex-1 text-[10px] text-slate-300 leading-tight">{x.desc.length > 26 ? x.desc.slice(0, 26) + '…' : x.desc} × {x.cant} {x.und}</span>
                                  <input type="number" min="0.01" step="any" value={ff.precios[x.id] || ''}
                                    onChange={e => setFF(i.id, 'precios', { ...ff.precios, [x.id]: e.target.value })} onKeyDown={enterSiguiente}
                                    placeholder="S/ und" className={`w-16 ${pendCls(precioIng > 0)} font-mono`} />
                                  <span className="text-[10px] font-mono text-slate-400 w-14 text-right">{(precioIng * x.cant).toFixed(2)}</span>
                                </div>
                                {uc && <div className={`text-[9px] ${subio ? 'text-yellow-400' : 'text-slate-500'}`}>
                                  últ. compra S/ {uc.precio.toFixed(2)} · {uc.prov.length > 18 ? uc.prov.slice(0, 18) + '…' : uc.prov} · {fmt(uc.fecha)}{subio ? ' · ▲ sube' : ''}</div>}
                              </div>
                              );
                            })}
                            <div className={`text-[10px] font-mono text-right ${cuadra ? 'text-green-400' : 'text-red-400'}`}>
                              Desglosado S/ {sumaDesglose.toFixed(2)} de S/ {(Number(ff.monto) || 0).toFixed(2)}
                              {!cuadra && Number(ff.monto) > 0 ? ` · falta cuadrar S/ ${(Number(ff.monto) - sumaDesglose).toFixed(2)}` : ''}
                            </div>
                          </div>
                          <button onClick={() => registrarFactura(i)} disabled={!factOk} className={`w-full ${btnOk(!!factOk)}`}>
                            {ff.compromiso ? 'Registrar compromiso' : 'Registrar factura'} ({1 + ff.extras.length} ítem{ff.extras.length ? 's' : ''})</button>
                          <div className="text-[9px] text-slate-500 mt-1">El pago lo ejecuta el área de Pagos con banco y N° de operación.</div>
                        </div>
                      )}
                      {i.factura && !enFact && (
                        <div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${pillEstado(i.pago)}`}>{i.pago}</span>
                          <div className="text-[9px] font-mono text-green-400 mt-1">{i.factura}</div>
                        </div>
                      )}
                    </div>
                  ) : <span className="text-slate-600">—</span>}</td>
                  <td className="py-2 px-1.5">{post ? (facturarSolo || i._arch ? <span className="text-slate-400">{fmt(i.fechaEntrega)}</span> : <FechaInput value={i.fechaEntrega} onChange={e => updItem(i, { fecha_entrega: e.target.value || null })} className={`w-32 ${inputCls}`} />) : <span className="text-slate-600">—</span>}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-300">{llego !== null ? llego + 'd' : '—'}</td>
                  <td className={`py-2 px-1.5 font-mono ${holg === null ? 'text-slate-500' : holg < 0 ? 'text-red-400' : 'text-green-400'}`}>{holg !== null ? holg + 'd' : '—'}</td>
                  <td className="py-2 px-1.5">{inc && !facturarSolo ? <FechaInput value={i.fechaRecojoSaldo} onChange={e => updItem(i, { fecha_recojo_saldo: e.target.value || null })} className={`w-32 ${inputCls}`} /> : <span className="text-slate-600">{inc ? fmt(i.fechaRecojoSaldo) : '—'}</span>}</td>
                  <td className="py-2 px-1.5">{inc && !facturarSolo ? <FechaInput value={i.fechaEntregaSaldo} onChange={e => updItem(i, { fecha_entrega_saldo: e.target.value || null })} className={`w-32 ${inputCls}`} /> : <span className="text-slate-600">{inc ? fmt(i.fechaEntregaSaldo) : '—'}</span>}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-300">{saldoDias !== null ? saldoDias + 'd' : '—'}</td>
                  <td className="py-2 px-1.5">{inc && !facturarSolo ? (
                    <select value={i.comunicoResidente} onChange={e => updItem(i, { comunico_residente: e.target.value === 'Sí' ? true : e.target.value === 'No' ? false : null })} className={inputCls}>
                      {['—', 'Sí', 'No'].map(x => <option key={x}>{x}</option>)}</select>) : <span className="text-slate-600">{inc ? i.comunicoResidente : '—'}</span>}</td>
                  <td className="py-2 px-1.5">{inc && !facturarSolo ? <input defaultValue={i.destinoSaldo} onBlur={e => { if (e.target.value !== i.destinoSaldo) updItem(i, { destino_saldo: e.target.value || null }); }} placeholder="Almacén de obra…" className={`w-32 ${inputCls}`} /> : <span className="text-slate-600">{inc ? (i.destinoSaldo || '—') : '—'}</span>}</td>
                  <td className="py-2 px-1.5">{!facturarSolo && !i._arch && <AnularBox onConfirm={m => anularItem(i, m)} />}</td>
                </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      <div className="mt-3 text-slate-500 text-[11px]">Paso 1: Aprobar o Rechazar. Paso 2: Compras o el comprador marca "Comprado" al comprar o recoger el ítem (visible para todos); "Entregado" e "Incompleto" los fija el almacén automáticamente al registrar la recepción. La factura se registra con desglose por ítem (una factura puede cubrir varios ítems); el pago lo ejecuta el área de Pagos y los ítems heredan el estado. Anular exige motivo y queda con rastro en el Tablero. Un ítem Entregado con factura Pagada se cierra y pasa solo al Tablero.</div>
    </div>

    <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">
          Facturas {verPagadas ? 'registradas' : 'por pagar'} · {factMostradas.length}{factMostradas.length > 0 ? ` · S/ ${factMostradas.reduce((a, f) => a + f.monto, 0).toFixed(2)}` : ''}</div>
        <button onClick={() => setVerPagadas(v => !v)}
          className={`ml-auto px-2.5 py-1 rounded text-[9px] font-bold uppercase border ${verPagadas ? 'border-yellow-400 text-yellow-400 bg-slate-800' : 'border-slate-700 text-slate-400 bg-slate-800 hover:border-slate-500'}`}>
          {verPagadas ? '✕ Solo pendientes' : `Ver pagadas · ${factPagadas.length}`}</button>
      </div>
      {factMostradas.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-sm">{verPagadas ? 'Sin facturas registradas.' : 'Sin facturas por pagar. ✓ Todo al día con Pagos.'}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr>{['N° Factura', 'Fecha', 'Proveedor', 'RUC', 'Proyecto', 'Ítems que cubre', 'Monto S/', 'Forma de pago', 'Pago', 'Registró'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>
              {factMostradas.map(f => (
                <tr key={f.n} className="border-b border-slate-800 align-top">
                  <td className="py-2 px-1.5 font-mono text-slate-200">{f.serie}
                    {f.tipoDoc === 'Compromiso' && <div className="text-[8px] font-bold uppercase text-yellow-400">Sin factura · la emite al pagar</div>}</td>
                  <td className="py-2 px-1.5 text-slate-400">{fmt(f.fecha)}</td>
                  <td className="py-2 px-1.5 text-slate-300">{f.prov}</td>
                  <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{f.ruc}</td>
                  <td className="py-2 px-1.5 text-slate-400">{f.proyecto}</td>
                  <td className="py-2 px-1.5 text-slate-300 text-[10px]">{f.items.map(x => `RQ-${String(x.rq).padStart(3, '0')} ${x.desc}`).join(' · ')}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-200 text-right">{f.monto.toFixed(2)}</td>
                  <td className="py-2 px-1.5 text-slate-400">{f.forma}</td>
                  <td className="py-2 px-1.5">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${pillEstado(f.estadoPago)}`}>{f.estadoPago}</span>
                    {f.estadoPago === 'Pagada' && <div className="text-[9px] text-slate-500 mt-1">{f.banco} · op. {f.numOp} · {fmt(f.fechaPago)}</div>}
                  </td>
                  <td className="py-2 px-1.5 text-slate-500 text-[10px]">{f.registradoPor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </div>
  );
}

function Almacen({ user, db, api }) {
  const { rqs, salidas, prestamos, stockInicial, factorMap, pereceMap } = db;
  const esAlm = user.rol === 'almacen';
  const [form, setForm] = useState({});
  const [aviso, setAviso] = useState('');
  const [proy, setProy] = useState(esAlm ? user.proyecto : (PROYECTOS[0] ? PROYECTOS[0][1] : ''));
  const [fSal, setFSal] = useState({});
  const [verif, setVerif] = useState({});
  const [fPres, setFPres] = useState({ cod: '', cant: '', destino: '', autoriza: '' });

  const avisar = (msg, ms = 5000) => { setAviso(msg); setTimeout(() => setAviso(''), ms); };

  const porRecibir = rqs.flatMap(r => r.items
    .filter(i => i.decision === 'Aprobado' && i.estado !== 'Entregado')
    .map(i => ({ ...i, rq: r.n, fechaRQ: r.fechaRQ, canal: r.canal, residente: r.residente, proyecto: r.proyecto })))
    .filter(i => i.proyecto === proy);

  const getF = id => form[id] || { cant: '', obs: '' };
  const setF = (id, k, v) => setForm({ ...form, [id]: { ...getF(id), [k]: v } });

  const recibir = async i => {
    const f = getF(i.id);
    const fc = factorMap[i.cod];
    const rec = fc ? (Number(f.cajas) || 0) * (Number(f.upc ?? fc.factor) || 0) : Number(f.cant);
    if (!(rec > 0)) return;
    if (pereceMap[i.cod] && !f.cad) { avisar('⚠ Este material es perecedero: registra la fecha de caducidad de la etiqueta.', 5000); return; }
    const yaRecibido = Number(i.cantRecibida || 0);
    const pedido = Number(i.cant);
    if (yaRecibido + rec > pedido) {
      avisar(`⚠ No se puede recibir ${rec}: excede lo pedido (falta ${pedido - yaRecibido} de ${pedido}). Si el proveedor entregó de más, corrige el RQ con Compras.`, 6000);
      return;
    }
    const r = await api.recibir(i, rec, f.obs.trim(), pereceMap[i.cod] ? f.cad : null);
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
    const total = yaRecibido + rec;
    const completo = total >= pedido;
    const f2 = { ...form }; delete f2[i.id]; setForm(f2);
    avisar(completo
      ? `Recepción completa de "${i.desc}" registrada (${total}/${pedido}).`
      : `Recepción parcial de "${i.desc}": ${total}/${pedido}. Marcado como Incompleto en Compras y Almacén. Saldo pendiente: ${pedido - total}.`);
  };

  const salidasProy = salidas.filter(s => s.proyecto === proy);
  const stock = stockDetalleObra(db, proy);

  const darSalida = async (s, f) => {
    const r = await api.darSalida({ proyecto: proy, cod: s.cod, cant: Number(f.cant), hoja: f.hoja.trim(), zona: f.zona.trim() });
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
    const f2 = { ...fSal }; delete f2[s.cod]; setFSal(f2);
    avisar(`Salida registrada: ${f.cant} ${s.und} de "${s.desc}" → ${f.zona} (${f.hoja}).`, 4000);
  };

  const anularSalida = async (sa, motivo) => {
    const r = await api.updSalida(sa.id, { anulacion: { motivo, por: user.nombre, fecha: HOY_ISO } });
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
    avisar(`Salida #${sa.n} anulada — el stock se restauró. Motivo registrado.`);
  };

  const marcarUso = async (sa, uso, motivo = '') => {
    const r = await api.updSalida(sa.id, { uso, motivo_uso: motivo || null });
    if (r.error) avisar('⚠ ' + r.error, 7000);
  };

  const confirmarIncorrecto = sa => {
    const v = verif[sa.n];
    const motivo = v.motivo === 'Otro' ? v.otro.trim() : v.motivo;
    if (!motivo) return;
    marcarUso(sa, 'Incorrecto', motivo);
    const v2 = { ...verif }; delete v2[sa.n]; setVerif(v2);
  };

  const matPres = stock.find(s => s.cod === fPres.cod);
  const presOk = esAlm && matPres && Number(fPres.cant) > 0 && Number(fPres.cant) <= matPres.stock && fPres.destino && fPres.autoriza.trim();

  const prestar = async () => {
    const r = await api.prestar({ origen: proy, destino: fPres.destino, cod: matPres.cod, cant: Number(fPres.cant), autoriza: fPres.autoriza.trim() });
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
    avisar(`Préstamo registrado: ${fPres.cant} ${matPres.und} de "${matPres.desc}" → almacén ${fPres.destino}. Queda como deuda hasta devolución o transferencia al costo.`);
    setFPres({ cod: '', cant: '', destino: '', autoriza: '' });
  };

  const presProy = prestamos.filter(p => p.origen === proy || p.destino === proy);

  const setPres = async (p, estado) => {
    const r = await api.updPrestamo(p.id, { estado });
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
  };
  const anularPrestamo = async (p, motivo) => {
    const r = await api.updPrestamo(p.id, { estado: 'Anulado', anulacion: { motivo, por: user.nombre, fecha: HOY_ISO } });
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
    avisar(`Préstamo #${p.n} anulado — stock restaurado en ambos almacenes.`);
  };

  return (
    <div>
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Almacén de obra · recepción de materiales</div>
          <div className="ml-auto flex items-center gap-2">
            {esAlm ? <span className="text-slate-300 text-[11px] font-semibold">{(PROYECTOS.find(p => p[1] === proy) || [''])[0]} · {proy}</span>
              : <FiltroProyecto value={proy} onChange={setProy} />}
            {ALMACENEROS[proy] && <span className="text-slate-400 text-[11px]">Almacenero: {ALMACENEROS[proy]}</span>}
          </div>
        </div>
        {!esAlm && <div className="text-slate-500 text-[11px] mb-3">Vista de consulta: las recepciones, salidas y préstamos los registra el almacenero de cada obra.</div>}
        <Aviso msg={aviso} />
        {porRecibir.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Nada por recibir en {proy}. Los ítems aparecen aquí cuando Compras los aprueba.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['RQ', 'Descripción', 'Pedido', 'Recibido', 'Falta', 'Estado', 'Cant. que llega', 'Observaciones', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {porRecibir.map(i => {
                  const f = getF(i.id);
                  const fc = factorMap[i.cod];
                  const llega = fc ? (Number(f.cajas) || 0) * (Number(f.upc ?? fc.factor) || 0) : Number(f.cant);
                  const rec = Number(i.cantRecibida || 0);
                  const falta = Number(i.cant) - rec;
                  const listo = esAlm && llega > 0 && llega <= falta;
                  return (
                    <tr key={i.id} className="border-b border-slate-800 align-top">
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-200">RQ-{String(i.rq).padStart(3, '0')}</td>
                      <td className="py-2 px-1.5 text-slate-200">{i.desc} <span className="text-slate-500">({i.und})</span></td>
                      <td className="py-2 px-1.5 font-mono text-slate-200">{i.cant}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{rec}</td>
                      <td className={`py-2 px-1.5 font-mono ${falta > 0 ? 'text-orange-400' : 'text-green-400'}`}>{falta}</td>
                      <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${pillEstado(i.estado)}`}>{i.estado}</span></td>
                      <td className="py-2 px-1.5">
                        {fc ? (
                          <div>
                            <div className="flex items-center gap-1">
                              <input type="number" min="1" step="any" value={f.cajas || ''} onChange={e => { const v = e.target.value; if (v === '' || Number(v) > 0) setF(i.id, 'cajas', v); }} disabled={!esAlm} placeholder={fc.undCompra.toLowerCase() + 's'} className={`w-14 ${inputCls}`} />
                              <span className="text-slate-500 text-[10px]">×</span>
                              <input type="number" min="1" step="any" value={f.upc ?? fc.factor} onChange={e => { const v = e.target.value; if (v === '' || Number(v) > 0) setF(i.id, 'upc', v); }} disabled={!esAlm} title={`${i.und} por ${fc.undCompra.toLowerCase()} (precargado del catálogo; ajústalo si la ${fc.undCompra.toLowerCase()} vino distinta)`} className={`w-14 ${inputCls}`} />
                            </div>
                            <div className="text-[9px] text-slate-400 mt-1">= {llega > 0 ? llega : '—'} {i.und}</div>
                          </div>
                        ) : (
                          <input type="number" min="1" step="any" value={f.cant} onChange={e => { const v = e.target.value; if (v === '' || Number(v) > 0) setF(i.id, 'cant', v); }} disabled={!esAlm} className={`w-16 ${inputCls}`} />
                        )}
                        {llega > falta && <div className="text-[9px] text-red-400 mt-1">Excede lo pedido</div>}
                        {pereceMap[i.cod] && (
                          <div className="mt-1">
                            <div className="text-[9px] text-yellow-400">Perecedero: fecha de caducidad *</div>
                            <FechaInput value={f.cad || ''} onChange={e => setF(i.id, 'cad', e.target.value)} className={`w-32 ${inputCls}`} />
                          </div>
                        )}</td>
                      <td className="py-2 px-1.5">
                        <textarea rows={2} value={f.obs} onChange={e => setF(i.id, 'obs', e.target.value)} disabled={!esAlm}
                          placeholder="Estado del material, faltantes, daños…" className={`w-48 ${inputCls} resize-y`} />
                        {i.obsAlmacen && <div className="text-[9px] text-slate-500 mt-1 w-48">Anterior: {i.obsAlmacen}</div>}</td>
                      <td className="py-2 px-1.5">
                        <button onClick={() => recibir(i)} disabled={!listo} className={btnOk(listo)}>Registrar recepción</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">Si la cantidad recibida es menor a la pedida, el ítem pasa a Incompleto automáticamente (visible en Compras y Almacén); al llegar el saldo se registra otra recepción y pasa a Entregado.</div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Stock del almacén · {proy}</div>
        {stock.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Sin materiales en este almacén. El stock se forma con las recepciones registradas arriba.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['Código', 'Material', 'Und', 'Caducidad', 'Inicial', 'Recibido', 'Salidas', 'Préstamos ±', 'Stock', 'Cant. salida', 'N° hoja de trabajo', 'Zona de trabajo', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {stock.map(s => {
                  const f = fSal[s.cod] || { cant: '', hoja: '', zona: '' };
                  const setS = (k, v) => setFSal({ ...fSal, [s.cod]: { ...f, [k]: v } });
                  const cad = estadoCaducidad(s.cadMin);
                  const vencido = cad && cad.k === 'VENCIDO';
                  const listo = esAlm && !vencido && Number(f.cant) > 0 && Number(f.cant) <= s.stock && f.hoja.trim() && f.zona.trim();
                  return (
                    <tr key={s.cod} className="border-b border-slate-800 align-top">
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{s.cod}</td>
                      <td className="py-2 px-1.5 text-slate-200">{s.desc}</td>
                      <td className="py-2 px-1.5 text-slate-500">{s.und}</td>
                      <td className="py-2 px-1.5">
                        {cad ? (
                          <div>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase whitespace-nowrap ${cad.cls}`}>{cad.k}</span>
                            {vencido && <div className="text-[9px] text-red-400 mt-1 w-28 leading-tight">Salida bloqueada: dar de baja o corregir con Gerencia</div>}
                          </div>
                        ) : <span className="text-slate-600">—</span>}</td>
                      <td className={`py-2 px-1.5 font-mono ${s.inicial > 0 ? 'text-sky-400' : 'text-slate-500'}`}>{s.inicial}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{s.recibido}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{s.salido}</td>
                      <td className={`py-2 px-1.5 font-mono ${s.prestNeto < 0 ? 'text-purple-400' : s.prestNeto > 0 ? 'text-green-400' : 'text-slate-500'}`}>{s.prestNeto > 0 ? '+' + s.prestNeto : s.prestNeto}</td>
                      <td className={`py-2 px-1.5 font-mono font-bold ${s.stock > 0 ? 'text-green-400' : 'text-slate-500'}`}>{s.stock}</td>
                      <td className="py-2 px-1.5"><input type="number" min="1" step="any" value={f.cant} onChange={e => { const v = e.target.value; if (v === '' || Number(v) > 0) setS('cant', v); }} disabled={!esAlm} className={`w-16 ${inputCls}`} />
                        {Number(f.cant) > s.stock && <div className="text-[9px] text-red-400 mt-1">Excede stock</div>}</td>
                      <td className="py-2 px-1.5"><input value={f.hoja} onChange={e => setS('hoja', e.target.value)} disabled={!esAlm} placeholder="HT-001" className={`w-20 ${inputCls} font-mono`} /></td>
                      <td className="py-2 px-1.5"><input value={f.zona} onChange={e => setS('zona', e.target.value)} disabled={!esAlm} placeholder="Piso 3 - Dpto 301" className={`w-32 ${inputCls}`} /></td>
                      <td className="py-2 px-1.5">
                        <button onClick={() => darSalida(s, f)} disabled={!listo} className={btnOk(listo)}>Registrar salida</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">Toda salida exige N° de hoja de trabajo y zona de trabajo. Stock = inicial (inventario físico) + recibido − salidas ± préstamos.</div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Préstamos entre almacenes</div>
        <div className="grid md:grid-cols-5 gap-2 mb-3">
          <div className="md:col-span-2"><label className={lblCls}>Material (con stock)</label>
            <select value={fPres.cod} onChange={e => setFPres({ ...fPres, cod: e.target.value })} disabled={!esAlm} className={`w-full ${inputCls}`}>
              <option value="">— Elegir —</option>
              {stock.filter(s => s.stock > 0).map(s => <option key={s.cod} value={s.cod}>{s.desc} (stock: {s.stock})</option>)}</select></div>
          <div><label className={lblCls}>Cantidad</label>
            <input type="number" min="1" step="any" value={fPres.cant} onChange={e => { const v = e.target.value; if (v === '' || Number(v) > 0) setFPres({ ...fPres, cant: v }); }} disabled={!esAlm} className={`w-full ${inputCls}`} />
            {matPres && Number(fPres.cant) > matPres.stock && <div className="text-[9px] text-red-400 mt-1">Excede stock</div>}</div>
          <div><label className={lblCls}>Almacén destino</label>
            <FiltroProyecto value={fPres.destino} onChange={v => setFPres({ ...fPres, destino: v })} excluir={proy} /></div>
          <div><label className={lblCls}>Quién autoriza *</label>
            <input value={fPres.autoriza} onChange={e => setFPres({ ...fPres, autoriza: e.target.value })} disabled={!esAlm} placeholder="Nombre" className={`w-full ${inputCls}`} /></div>
        </div>
        <button onClick={prestar} disabled={!presOk} className={btnOk(!!presOk)}>Registrar préstamo</button>

        {presProy.length > 0 && (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-xs">
              <thead><tr>{['#', 'Fecha', 'Material', 'Cant', 'Origen', 'Destino', 'Autoriza', 'Estado', 'Acción'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {presProy.map(p => (
                  <tr key={p.n} className="border-b border-slate-800 align-top">
                    <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{p.n}</td>
                    <td className="py-2 px-1.5 text-slate-400">{fmt(p.fecha)}</td>
                    <td className="py-2 px-1.5 text-slate-200">{p.desc} <span className="text-slate-500">({p.cant} {p.und})</span>
                      {p.motivoAnulacion && <div className="text-red-400 text-[10px] mt-1">Anulado: {p.motivoAnulacion} ({p.anuladoPor})</div>}</td>
                    <td className="py-2 px-1.5 font-mono text-slate-200">{p.cant}</td>
                    <td className={`py-2 px-1.5 ${p.origen === proy ? 'text-purple-400 font-semibold' : 'text-slate-400'}`}>{p.origen}</td>
                    <td className={`py-2 px-1.5 ${p.destino === proy ? 'text-green-400 font-semibold' : 'text-slate-400'}`}>{p.destino}</td>
                    <td className="py-2 px-1.5 text-slate-400">{p.autoriza}</td>
                    <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${pillEstado(p.estado)}`}>{p.estado}{p.estado === 'Transferido' ? ' al costo' : ''}</span></td>
                    <td className="py-2 px-1.5">
                      {esAlm && p.estado === 'Prestado' && (
                        <div>
                          <div className="flex gap-1">
                            <button onClick={() => setPres(p, 'Devuelto')} className={btnVerde}>Devuelto</button>
                            <button onClick={() => setPres(p, 'Transferido')}
                              className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-sky-950 text-sky-400 border border-sky-800 hover:bg-sky-900">Transferir al costo</button>
                          </div>
                          <AnularBox onConfirm={m => anularPrestamo(p, m)} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">Un préstamo resta stock al origen y suma al destino, y queda como deuda. "Devuelto" revierte el stock; "Transferir al costo" lo vuelve permanente y el gasto pasa al proyecto destino. Anular exige motivo y solo procede si el destino no consumió el material.</div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Salidas registradas · {proy} · verificación de uso</div>
        {salidasProy.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Sin salidas registradas en {proy}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['#', 'Fecha', 'Material', 'Cant', 'Hoja de trabajo', 'Zona', 'Uso', 'Acción', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {salidasProy.map(sa => {
                  const v = verif[sa.n];
                  return (
                    <tr key={sa.n} className={`border-b border-slate-800 align-top ${sa.anulada ? 'opacity-50' : ''}`}>
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{sa.n}</td>
                      <td className="py-2 px-1.5 text-slate-400">{fmt(sa.fecha)}</td>
                      <td className="py-2 px-1.5 text-slate-200">{sa.desc} <span className="text-slate-500">({sa.und})</span>
                        {sa.anulada && <div className="text-red-400 text-[10px] mt-1">ANULADA: {sa.motivoAnulacion} ({sa.anuladoPor}, {fmt(sa.fechaAnulacion)})</div>}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-200">{sa.cant}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-200">{sa.hoja}</td>
                      <td className="py-2 px-1.5 text-slate-400">{sa.zona}</td>
                      <td className="py-2 px-1.5">
                        {sa.anulada ? <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-red-300 line-through">Anulada</span>
                        : sa.uso === 'Pendiente' ? <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-yellow-950 text-yellow-400">Pendiente</span>
                        : sa.uso === 'Correcto' ? <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-green-950 text-green-400">Correcto uso</span>
                        : <div><span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-red-950 text-red-400">Uso incorrecto</span>
                            <div className="text-red-400 text-[10px] mt-1">{sa.motivoUso}</div></div>}
                      </td>
                      <td className="py-2 px-1.5">
                        {esAlm && !sa.anulada && sa.uso === 'Pendiente' && !v && (
                          <div className="flex gap-1">
                            <button onClick={() => marcarUso(sa, 'Correcto')} className={btnVerde}>Correcto uso</button>
                            <button onClick={() => setVerif({ ...verif, [sa.n]: { motivo: MOTIVOS_USO[0], otro: '' } })} className={btnRojo}>Uso incorrecto</button>
                          </div>
                        )}
                        {v && (
                          <div className="w-48">
                            <select value={v.motivo} onChange={e => setVerif({ ...verif, [sa.n]: { ...v, motivo: e.target.value } })} className={`w-full ${inputCls}`}>
                              {MOTIVOS_USO.map(x => <option key={x}>{x}</option>)}</select>
                            {v.motivo === 'Otro' && (
                              <input value={v.otro} onChange={e => setVerif({ ...verif, [sa.n]: { ...v, otro: e.target.value } })}
                                placeholder="Especificar…" className={`w-full mt-1 ${inputCls}`} />
                            )}
                            <button onClick={() => confirmarIncorrecto(sa)} disabled={v.motivo === 'Otro' && !v.otro.trim()}
                              className={`mt-1 w-full px-2 py-1.5 rounded text-[9px] font-bold uppercase ${(v.motivo !== 'Otro' || v.otro.trim()) ? 'bg-red-950 text-red-400 border border-red-800 hover:bg-red-900' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
                              Confirmar uso incorrecto</button>
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-1.5">{esAlm && !sa.anulada && <AnularBox onConfirm={m => anularSalida(sa, m)} />}</td>
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

// Vista del COMPRADOR (Frank): su lista de trabajo del día.
// Prioriza urgentes y fechas necesitadas; consolida el mismo material
// entre obras y le dice cuántas facturas pedir.
function ComprasDelDia({ db, api }) {
  const { rqs } = db;
  const EN_LETRAS = { 2: 'dos', 3: 'tres', 4: 'cuatro', 5: 'cinco' };
  const [aviso, setAviso] = useState('');

  const marcarComprado = async it => {
    const r = await api.updItem(it.id, { estado: 'Comprado' });
    if (r.error) { setAviso('⚠ ' + r.error); setTimeout(() => setAviso(''), 7000); return; }
    setAviso(`RQ-${String(it.rq).padStart(3, '0')} · ${it.proyecto}: marcado como Comprado. Ya lo ve todo el equipo.`);
    setTimeout(() => setAviso(''), 4000);
  };

  const pendientes = rqs.flatMap(r => r.items.map(i => ({ ...i, rq: r.n, proyecto: r.proyecto })))
    .filter(i => i.decision === 'Aprobado' && !i.factura && i.estado === '—');

  const grupos = Object.values(pendientes.reduce((acc, i) => {
    if (!acc[i.cod]) acc[i.cod] = { cod: i.cod, desc: i.desc, und: i.und, total: 0, porRQ: [], minFecha: i.fecha, proyectos: new Set() };
    const g = acc[i.cod];
    g.total += Number(i.cant);
    g.porRQ.push({ id: i.id, rq: i.rq, proyecto: i.proyecto, cant: Number(i.cant), fecha: i.fecha });
    if (i.fecha < g.minFecha) g.minFecha = i.fecha;
    g.proyectos.add(i.proyecto);
    return acc;
  }, {}))
    .map(g => ({ ...g, urgente: diasHoy(g.minFecha) < 2, nProy: g.proyectos.size }))
    .sort((a, b) => (a.urgente !== b.urgente) ? (a.urgente ? -1 : 1) : (a.minFecha < b.minFecha ? -1 : 1));

  return (
    <div>
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">
          Compras del día · {grupos.length} material(es) por comprar · urgentes primero</div>
        <Aviso msg={aviso} />
        {grupos.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Nada por comprar: no hay ítems aprobados pendientes. ¡Buen día!</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['', 'Ítem', 'Cantidad total', 'Por RQ / obra', 'Necesitado para', 'Observación', 'Marcar'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {grupos.map(g => (
                  <tr key={g.cod} className="border-b border-slate-800 align-top">
                    <td className="py-2 px-1.5">
                      {g.urgente && <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-red-950 text-red-400">URGENTE</span>}</td>
                    <td className="py-2 px-1.5 text-slate-200">{g.desc} <span className="text-slate-500">({g.und})</span>
                      <div className="font-mono text-[10px] text-slate-500">{g.cod}</div></td>
                    <td className="py-2 px-1.5 font-mono font-bold text-yellow-400 whitespace-nowrap">{g.total} {g.und}</td>
                    <td className="py-2 px-1.5 text-slate-300 text-[10px]">
                      {g.porRQ.map((x, k) => (
                        <div key={k} className="h-7 flex items-center whitespace-nowrap">RQ-{String(x.rq).padStart(3, '0')} · {x.proyecto}: <b className="mx-1">{x.cant}</b> (para {fmt(x.fecha)})</div>
                      ))}</td>
                    <td className={`py-2 px-1.5 whitespace-nowrap font-mono ${g.urgente ? 'text-red-400 font-bold' : 'text-slate-300'}`}>{fmt(g.minFecha)}</td>
                    <td className="py-2 px-1.5 text-[10px]">
                      {g.nProy > 1
                        ? <span className="text-green-400 font-semibold">Consolidar: pedir {EN_LETRAS[g.nProy] || g.nProy} facturas (una por obra)</span>
                        : <span className="text-slate-400">Pedir una factura ({[...g.proyectos][0]})</span>}
                    </td>
                    <td className="py-2 px-1.5">
                      {g.porRQ.map((x, k) => (
                        <div key={k} className="h-7 flex items-center">
                          <button onClick={() => marcarComprado(x)}
                            className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-green-400 border border-slate-700 hover:border-green-400 whitespace-nowrap"
                            title="Marca este ítem como comprado o recogido. Cambia el estado para todo el equipo.">✓ Comprado</button>
                        </div>
                      ))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">Marca <b>✓ Comprado</b> cuando compres o recojas cada ítem (RQ por RQ): el estado cambia para todo el equipo y sale de esta lista. La factura de caja chica se registra aparte en la pestaña Facturar (sin factura no hay rendición); lo que ya pagó administración solo lo recoges y marcas Comprado.</div>
      </div>
    </div>
  );
}

function Pagos({ user, db, api }) {
  const { facturas, rendiciones, bancoDe } = db;
  const puede = user.rol === 'pagos';
  const [proy, setProy] = useState('TODOS');
  const [fPago, setFPago] = useState({});
  const [fRep, setFRep] = useState({});
  const [aviso, setAviso] = useState('');

  const fs = facturas.filter(f => proy === 'TODOS' || f.proyecto === proy);
  const pend = fs.filter(f => f.estadoPago !== 'Pagada');
  const pagadas = fs.filter(f => f.estadoPago === 'Pagada');
  // reposiciones de caja chica: rendiciones aprobadas aún sin reponer
  const porReponer = rendiciones
    .filter(r => r.estado === 'Aprobada' && !r.repOp)
    .filter(r => proy === 'TODOS' || r.proyecto === proy)
    .map(r => ({ ...r, monto: facturas.filter(f => f.rendicionId === r.id).reduce((a, f) => a + f.monto, 0) }));

  const vencimiento = vencimientoDe;

  const getP = id => fPago[id] || { medio: 'Transferencia', op: '', fecha: HOY_ISO, serieReal: '' };
  const setP = (id, k, v) => setFPago({ ...fPago, [id]: { ...getP(id), [k]: v } });

  const pagar = async f => {
    const p = getP(f.id);
    const banco = (bancoDe[f.proyecto] || {}).banco || '';
    const esComp = f.tipoDoc === 'Compromiso';
    if (!p.medio || !p.op.trim() || !p.fecha || !banco || (esComp && !(p.serieReal || '').trim())) return;
    const r = await api.pagarFactura(f.id, {
      medio: p.medio, banco, op: p.op.trim(), fecha: p.fecha,
      serieReal: esComp ? p.serieReal.trim() : null,
    });
    if (r.error) { setAviso('⚠ ' + r.error); setTimeout(() => setAviso(''), 7000); return; }
    const f2 = { ...fPago }; delete f2[f.id]; setFPago(f2);
    setAviso(esComp
      ? `Compromiso ${f.serie} pagado y convertido en factura ${p.serieReal.trim().toUpperCase()} (${p.medio} · ${banco} · ${p.op}).`
      : `Factura ${f.serie} pagada (${p.medio} · ${banco} · ${p.op}).`);
    setTimeout(() => setAviso(''), 5000);
  };

  const reponer = async r => {
    const p = fRep[r.id] || {};
    if (!(p.op || '').trim() || !(p.fecha || HOY_ISO)) return;
    const res = await api.reponerRendicion(r.id, { op: p.op.trim(), fecha: p.fecha || HOY_ISO });
    if (res.error) { setAviso('⚠ ' + res.error); setTimeout(() => setAviso(''), 7000); return; }
    const f2 = { ...fRep }; delete f2[r.id]; setFRep(f2);
    setAviso(`Reposición de caja chica de ${r.proyecto} registrada (S/ ${r.monto.toFixed(2)}).`);
    setTimeout(() => setAviso(''), 5000);
  };

  return (
    <div>
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">
            Pagos · facturas por pagar · {pend.length}{pend.length > 0 ? ` · S/ ${pend.reduce((a, f) => a + f.monto, 0).toFixed(2)}` : ''}</div>
          <div className="ml-auto"><FiltroProyecto value={proy} onChange={setProy} todos /></div>
        </div>
        {!puede && <div className="text-slate-500 text-[11px] mb-3">Vista de consulta: los pagos los registra el área de Pagos.</div>}
        <Aviso msg={aviso} />
        {pend.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Sin facturas pendientes de pago{proy !== 'TODOS' ? ' en ' + proy : ''}. Aparecen aquí cuando Compras las registra.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['N° Factura', 'Fecha', 'Proveedor', 'RUC', 'Proyecto', 'Rellenó', 'Ítems', 'Monto S/', 'Forma', 'Vence', 'Medio', 'Banco (según obra)', 'N°', 'F. pago', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {pend.map(f => {
                  const p = getP(f.id);
                  const venc = vencimiento(f);
                  const atrasada = diasHoy(venc) < 0;
                  const bancoObra = (bancoDe[f.proyecto] || {}).banco || '—';
                  const cuentaObra = (bancoDe[f.proyecto] || {}).cuenta || '';
                  const esComp = f.tipoDoc === 'Compromiso';
                  const listo = puede && p.medio && p.op.trim() && p.fecha && bancoObra !== '—' && (!esComp || (p.serieReal || '').trim());
                  return (
                    <tr key={f.n} className="border-b border-slate-800 align-top">
                      <td className="py-2 px-1.5 font-mono text-slate-200">{f.serie}
                        {esComp && (
                          <div className="mt-1 w-32">
                            <div className="text-[8px] font-bold uppercase text-yellow-400 mb-0.5">Sin factura · exige el comprobante al pagar</div>
                            <input value={p.serieReal || ''} onChange={e => setP(f.id, 'serieReal', e.target.value)} disabled={!puede}
                              placeholder="Serie real: F001-000123" className={`w-full ${pendCls(!!(p.serieReal || '').trim())} font-mono`} />
                          </div>
                        )}</td>
                      <td className="py-2 px-1.5 text-slate-400">{fmt(f.fecha)}</td>
                      <td className="py-2 px-1.5 text-slate-300">{f.prov}</td>
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{f.ruc}</td>
                      <td className="py-2 px-1.5 text-slate-400 whitespace-nowrap">{f.proyecto}</td>
                      <td className="py-2 px-1.5 text-slate-400 whitespace-nowrap text-[10px]">{f.registradoPor || '—'}</td>
                      <td className="py-2 px-1.5 text-slate-300 text-[10px]">{f.items.map(x => `RQ-${String(x.rq).padStart(3, '0')} ${x.desc}`).join(' · ')}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-200 text-right">{f.monto.toFixed(2)}</td>
                      <td className="py-2 px-1.5 text-slate-400 whitespace-nowrap">{f.forma}</td>
                      <td className={`py-2 px-1.5 whitespace-nowrap font-mono ${atrasada ? 'text-red-400 font-bold' : 'text-slate-300'}`}>{fmt(venc)}{atrasada ? ` · ${-diasHoy(venc)}d atraso` : ''}</td>
                      <td className="py-2 px-1.5">
                        <select value={p.medio} onChange={e => setP(f.id, 'medio', e.target.value)} disabled={!puede} className={inputCls}>
                          {MEDIOS_PAGO.map(b => <option key={b}>{b}</option>)}</select></td>
                      <td className="py-2 px-1.5 whitespace-nowrap">
                        <span className="text-slate-300">{bancoObra}</span>
                        {cuentaObra && <div className="text-[9px] font-mono text-slate-500">{cuentaObra}</div>}</td>
                      <td className="py-2 px-1.5"><input value={p.op} onChange={e => setP(f.id, 'op', e.target.value)} disabled={!puede} placeholder={ETIQUETA_NRO[p.medio] || 'N°'} className={`w-24 ${inputCls} font-mono`} /></td>
                      <td className="py-2 px-1.5"><FechaInput value={p.fecha} onChange={e => setP(f.id, 'fecha', e.target.value)} className={`w-32 ${inputCls}`} /></td>
                      <td className="py-2 px-1.5"><button onClick={() => pagar(f)} disabled={!listo} className={btnOk(!!listo)}>Registrar pago</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">Cada obra paga desde su propia cuenta: filtra por proyecto para trabajar banco por banco. Una factura pagada queda congelada (no se puede editar ni volver a pagar).</div>
      </div>

      {porReponer.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">
            Reposiciones de caja chica · {porReponer.length} · rendiciones aprobadas por administración</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['Obra', 'Fecha rendición', 'Responsable', 'Monto a reponer S/', 'Banco (según obra)', 'N° operación del retiro', 'F. reposición', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {porReponer.map(r => {
                  const p = fRep[r.id] || { op: '', fecha: HOY_ISO };
                  const setR = (k, v) => setFRep({ ...fRep, [r.id]: { ...p, [k]: v } });
                  const bancoObra = (bancoDe[r.proyecto] || {}).banco || '—';
                  const listo = puede && (p.op || '').trim();
                  return (
                    <tr key={r.id} className="border-b border-slate-800 align-top">
                      <td className="py-2 px-1.5 text-slate-200 whitespace-nowrap">{r.proyecto}</td>
                      <td className="py-2 px-1.5 text-slate-400">{fmt(r.fecha)}</td>
                      <td className="py-2 px-1.5 text-slate-400">{r.responsable}</td>
                      <td className="py-2 px-1.5 font-mono font-bold text-yellow-400 text-right">{r.monto.toFixed(2)}</td>
                      <td className="py-2 px-1.5 text-slate-300 whitespace-nowrap">{bancoObra}
                        {(bancoDe[r.proyecto] || {}).cuenta && <div className="text-[9px] font-mono text-slate-500">{bancoDe[r.proyecto].cuenta}</div>}</td>
                      <td className="py-2 px-1.5"><input value={p.op} onChange={e => setR('op', e.target.value)} disabled={!puede} placeholder="N° operación" className={`w-24 ${inputCls} font-mono`} /></td>
                      <td className="py-2 px-1.5"><FechaInput value={p.fecha} onChange={e => setR('fecha', e.target.value)} className={`w-32 ${inputCls}`} /></td>
                      <td className="py-2 px-1.5"><button onClick={() => reponer(r)} disabled={!listo} className={btnOk(!!listo)}>Registrar reposición</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-slate-500 text-[11px]">La reposición completa el fondo fijo para que la caja arranque llena a la mañana siguiente. Sale de la cuenta de la obra.</div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">
          Facturas pagadas · {pagadas.length}{pagadas.length > 0 ? ` · S/ ${pagadas.reduce((a, f) => a + f.monto, 0).toFixed(2)}` : ''}</div>
        {pagadas.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Aún no hay facturas pagadas{proy !== 'TODOS' ? ' en ' + proy : ''}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['N° Factura', 'Proveedor', 'Proyecto', 'Monto S/', 'Medio', 'Banco', 'N°', 'F. pago', 'Pagó'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {pagadas.map(f => (
                  <tr key={f.n} className="border-b border-slate-800">
                    <td className="py-2 px-1.5 font-mono text-slate-200">{f.serie}</td>
                    <td className="py-2 px-1.5 text-slate-300">{f.prov}</td>
                    <td className="py-2 px-1.5 text-slate-400">{f.proyecto}</td>
                    <td className="py-2 px-1.5 font-mono text-slate-200 text-right">{f.monto.toFixed(2)}</td>
                    <td className="py-2 px-1.5">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${f.medio === 'Efectivo' ? 'bg-yellow-950 text-yellow-400' : 'bg-slate-800 text-slate-400'}`}>{f.medio || '—'}</span></td>
                    <td className="py-2 px-1.5 text-slate-300">{f.banco || '—'}</td>
                    <td className="py-2 px-1.5 font-mono text-slate-300">{f.numOp || '—'}</td>
                    <td className="py-2 px-1.5 text-slate-400">{fmt(f.fechaPago)}</td>
                    <td className="py-2 px-1.5 text-slate-500 text-[10px]">{f.pagadoPor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Rendiciones({ user, db, api }) {
  const { rendiciones, facturas, cajas, bancoDe } = db;
  // administración aprueba; el rol pagos también (Mónica lleva ambos frentes)
  const puede = user.rol === 'administracion' || user.rol === 'pagos';
  const [proy, setProy] = useState('TODOS');
  const [obs, setObs] = useState({});
  const [aviso, setAvisoRaw] = useState('');
  const setAviso = m => { setAvisoRaw(m); if (m) setTimeout(() => setAvisoRaw(''), m.startsWith('⚠') ? 8000 : 6000); };

  const lista = rendiciones
    .filter(r => proy === 'TODOS' || r.proyecto === proy)
    .map(r => {
      const fs = facturas.filter(f => f.rendicionId === r.id);
      const total = fs.reduce((a, f) => a + f.monto, 0);
      return { ...r, facturas: fs, total, sobrante: r.montoFondo - total };
    })
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  const resolver = async (r, estado) => {
    const observacion = (obs[r.id] || '').trim();
    if (estado === 'Observada' && !observacion) { setAviso('⚠ Para observar una rendición escribe el motivo.'); return; }
    const res = await api.resolverRendicion(r.id, { estado, observacion });
    if (res.error) { setAviso('⚠ ' + res.error); return; }
    const o2 = { ...obs }; delete o2[r.id]; setObs(o2);
    setAviso(estado === 'Aprobada'
      ? `Rendición de ${r.proyecto} (${fmt(r.fecha)}) aprobada. La reposición de S/ ${r.total.toFixed(2)} pasó a la cola del área de Pagos.`
      : `Rendición de ${r.proyecto} observada; coordina la corrección con ${r.responsable}.`);
  };

  return (
    <div>
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Rendiciones de caja chica · fondo fijo diario por obra</div>
          <div className="ml-auto"><FiltroProyecto value={proy} onChange={setProy} todos /></div>
        </div>
        {!puede && <div className="text-slate-500 text-[11px] mb-3">Vista de consulta: las rendiciones las aprueba administración.</div>}
        <Aviso msg={aviso} />
        {lista.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Sin rendiciones{proy !== 'TODOS' ? ' en ' + proy : ''}. Se crean solas cuando Compras registra la primera factura en efectivo del día.</div>
        ) : lista.map(r => (
          <div key={r.id} className="mb-3 border border-slate-800 rounded p-3">
            <div className="flex items-center gap-2.5 mb-2 flex-wrap">
              <b className="text-sm text-slate-100">{r.proyecto}</b>
              <span className="text-slate-500 text-[11px]">{fmt(r.fecha)} · rinde: {r.responsable}</span>
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${r.estado === 'Aprobada' ? 'bg-green-950 text-green-400' : r.estado === 'Observada' ? 'bg-red-950 text-red-400' : 'bg-yellow-950 text-yellow-400'}`}>{r.estado}</span>
              <span className="ml-auto text-[11px] font-mono text-slate-300">
                Fondo S/ {r.montoFondo.toFixed(2)} · Rendido <b className="text-yellow-400">S/ {r.total.toFixed(2)}</b> · Sobrante teórico S/ {r.sobrante.toFixed(2)}</span>
            </div>
            {r.facturas.length > 0 && (
              <table className="w-full text-xs mb-2">
                <thead><tr>{['Factura', 'Proveedor', 'Ítems', 'Monto S/'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
                <tbody>
                  {r.facturas.map(f => (
                    <tr key={f.n} className="border-b border-slate-800">
                      <td className="py-1.5 px-1.5 font-mono text-slate-200">{f.serie}</td>
                      <td className="py-1.5 px-1.5 text-slate-300">{f.prov}</td>
                      <td className="py-1.5 px-1.5 text-slate-400 text-[10px]">{f.items.map(x => x.desc).join(' · ')}</td>
                      <td className="py-1.5 px-1.5 font-mono text-slate-200 text-right">{f.monto.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {r.estado === 'Abierta' && puede && (
              <div className="flex gap-2 items-start flex-wrap">
                <button onClick={() => resolver(r, 'Aprobada')} className={btnVerde}>Aprobar rendición</button>
                <input value={obs[r.id] || ''} onChange={e => setObs({ ...obs, [r.id]: e.target.value })}
                  placeholder="Motivo de observación (obligatorio para observar)" className={`${inputCls}`} style={{ minWidth: '260px' }} />
                <button onClick={() => resolver(r, 'Observada')} className={btnRojo}>Observar</button>
              </div>
            )}
            {r.estado === 'Observada' && <div className="text-red-400 text-[11px]">Observada: {r.observacion} ({r.aprobadoPor})</div>}
            {r.estado === 'Aprobada' && (
              <div className="text-[11px] text-slate-500">
                Aprobada por {r.aprobadoPor} el {fmt(r.fechaAprobacion)} ·
                {r.repOp
                  ? ` repuesta: ${(bancoDe[r.proyecto] || {}).banco || ''} op. ${r.repOp} (${fmt(r.repFecha)}, ${r.repuestoPor})`
                  : ' reposición pendiente en la cola del área de Pagos'}
              </div>
            )}
          </div>
        ))}
        <div className="mt-3 text-slate-500 text-[11px]">Fondo fijo: cada obra arranca el día con su monto completo (config en tabla cajas_chicas{Object.keys(cajas).length ? ` · ${Object.entries(cajas).map(([o, m]) => `${o}: S/ ${m}`).join(' · ')}` : ''}). Las facturas en efectivo del día se rinden aquí; administración aprueba y Pagos repone.</div>
      </div>
    </div>
  );
}

function Auditoria({ user, db, api }) {
  const { facturas, rendiciones, bancoDe, precioProm, salidas, prestamos } = db;
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
      alertas.push({ tipo: 'N° de operación repetido', detalle: `${v[0].banco} op. ${v[0].numOp} usado en ${v.length} pagos: ${v.map(f => `${f.serie} (S/ ${f.monto.toFixed(2)})`).join(' · ')}` });
    });
  }
  pagadas.filter(f => f.medio !== 'Efectivo' && f.banco && (bancoDe[f.proyecto] || {}).banco && f.banco !== bancoDe[f.proyecto].banco)
    .forEach(f => alertas.push({ tipo: 'Banco distinto al de la obra', detalle: `${f.serie} (${f.proyecto}) pagada desde ${f.banco}; la obra opera con ${bancoDe[f.proyecto].banco}` }));
  pagadas.filter(f => f.fechaPago && f.fechaPago < f.fecha)
    .forEach(f => alertas.push({ tipo: 'Pago anterior a la factura', detalle: `${f.serie}: factura del ${fmt(f.fecha)} pagada el ${fmt(f.fechaPago)}` }));
  rendiciones.filter(r => r.estado === 'Aprobada' && !r.repOp && r.fechaAprobacion && diasHoy(r.fechaAprobacion) <= -2)
    .forEach(r => alertas.push({ tipo: 'Rendición sin reposición', detalle: `${r.proyecto} (${fmt(r.fecha)}): aprobada hace ${-diasHoy(r.fechaAprobacion)} días y la caja sigue incompleta` }));
  {
    const vencidas = facturas.filter(f => f.estadoPago !== 'Pagada' && diasHoy(vencimientoDe(f)) < 0);
    if (vencidas.length) {
      const monto = vencidas.reduce((a, f) => a + f.monto, 0);
      alertas.push({ tipo: 'Facturas vencidas sin pagar', detalle: `${vencidas.length} factura(s) por S/ ${monto.toFixed(2)}; la más antigua: ${vencidas.sort((a, b) => (vencimientoDe(a) < vencimientoDe(b) ? -1 : 1))[0].serie} (venció ${fmt(vencimientoDe(vencidas[0]))})` });
    }
  }
  pagadas.filter(f => f.monto > UMBRAL_MONTO_INUSUAL)
    .forEach(f => alertas.push({ tipo: 'Monto inusual', detalle: `${f.serie} (${f.proyecto}): S/ ${f.monto.toFixed(2)} — revisar con lupa (umbral S/ ${UMBRAL_MONTO_INUSUAL})` }));
  pagadas.filter(f => !f.conciliada && f.fechaPago && diasHoy(f.fechaPago) <= -14)
    .forEach(f => alertas.push({ tipo: 'Sin conciliar hace 14+ días', detalle: `${f.serie} (${f.proyecto}) pagada el ${fmt(f.fechaPago)} sigue sin conciliar contra el banco` }));

  const conciliar = async (f, valor) => {
    const r = await api.conciliarFactura(f.id, valor);
    if (r.error) { setAviso('⚠ ' + r.error); return; }
    setAviso(valor ? `${f.serie} conciliada contra el estado de cuenta.` : `${f.serie} marcada como NO conciliada.`);
  };

  const csvSemana = () => {
    const cab = ['Obra', 'Banco', 'Cuenta', 'Medio', 'N_Operacion', 'Factura', 'Proveedor', 'RUC', 'Monto', 'F_Pago', 'Pago_Por', 'Conciliada'];
    const esc = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const filas = enSemana.map(f => [f.proyecto, f.banco || 'EFECTIVO', (bancoDe[f.proyecto] || {}).cuenta || '', f.medio, f.numOp || '', f.serie, f.prov, f.ruc, f.monto.toFixed(2), f.fechaPago, f.pagadoPor, f.conciliada ? 'SI' : 'NO'].map(esc).join(','));
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

      <div className={`border rounded-md p-4 mb-3 ${alertas.length === 0 ? 'bg-green-950 border-green-800' : 'bg-slate-900 border-red-800'}`}>
        <div className={`text-[11px] font-bold tracking-widest uppercase mb-2 ${alertas.length === 0 ? 'text-green-400' : 'text-red-400'}`}>
          {alertas.length === 0 ? '✓ 0 alertas — sin hallazgos automáticos' : `⚠ ${alertas.length} alerta(s) detectada(s) automáticamente`}</div>
        {alertas.map((a, i) => (
          <div key={i} className="mb-1.5 text-xs">
            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-red-950 text-red-400 mr-2">{a.tipo}</span>
            <span className="text-slate-300">{a.detalle}</span>
          </div>
        ))}
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

function Tablero({ db }) {
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

  const kpis = [['RQs', rqsF.length], ['Ítems', flat.length], ['% Urgentes', pctUrg + '%'], ['Entregados', entregados], ['Llegaron tarde', tarde], ['Rechazados', flat.filter(i => i.decision === 'Rechazado').length], ['Anulados', flat.filter(i => i.decision === 'Anulado').length], ['Incompletos', flat.filter(i => i.estado === 'Incompleto').length], ['Facturado S/', factF.reduce((a, f) => a + f.monto, 0).toFixed(0)], ['Préstamos activos', presActivos], ['Holgura prom.', holgProm + (holgProm !== '—' ? 'd' : '')], ['Entrega a tiempo', aTiempo], ['Uso incorrecto', pctIncorrecto], ['Falta pago más antiguo', faltaMax]];
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
            <thead><tr>{['Obra', 'RQs', '% Urg', 'Facturado S/', 'Holgura prom', 'A tiempo', '% Uso incorr.', 'Prést. activos'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>
              {porProyecto.map(x => (
                <tr key={x.p} className="border-b border-slate-800">
                  <td className="py-2 px-1.5 text-slate-200">{x.p}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-300">{x.rqs}</td>
                  <td className={`py-2 px-1.5 font-mono font-bold ${x.urgPct === null ? 'text-slate-500' : x.urgPct >= 50 ? 'text-red-400' : x.urgPct >= 25 ? 'text-yellow-400' : 'text-green-400'}`}>{x.urgPct === null ? '—' : x.urgPct + '%'}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-200 text-right">
                    {x.fact.toFixed(2)}
                    <div className="h-1 bg-slate-800 rounded mt-1"><div className="h-1 bg-yellow-400 rounded" style={{ width: `${Math.round(x.fact / maxFact * 100)}%` }} /></div>
                  </td>
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

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = verificando
  const [user, setUser] = useState(null);            // perfil de la tabla usuarios
  const [perfilError, setPerfilError] = useState('');
  const [db, setDb] = useState(null);
  const [cargaError, setCargaError] = useState('');
  const [tab, setTab] = useState('tab');
  const dbRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Una pestaña abierta durante la medianoche quedaría con la fecha del día
  // anterior (HOY se calcula al cargar): al detectar el cambio de día, recargar.
  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (iso !== HOY_ISO) window.location.reload();
    }, 60000);
    return () => clearInterval(t);
  }, []);

  const cargarTodo = useCallback(async () => {
    // Supabase devuelve máximo 1,000 filas por consulta: traer por lotes
    // hasta completar (el catálogo tiene 1,740 materiales).
    const LOTE = 1000;
    const fetchAll = async crearQuery => {
      const filas = [];
      for (let desde = 0; ; desde += LOTE) {
        const { data, error } = await crearQuery().range(desde, desde + LOTE - 1);
        if (error) return { error };
        filas.push(...data);
        if (data.length < LOTE) return { data: filas };
      }
    };
    const q = [
      fetchAll(() => supabase.from('proyectos').select('*').order('codigo')),
      fetchAll(() => supabase.from('usuarios').select('*').order('id')),
      fetchAll(() => supabase.from('materiales').select('*').eq('activo', true).order('codigo')),
      fetchAll(() => supabase.from('proveedores').select('*').order('razon_social').order('ruc')),
      fetchAll(() => supabase.from('rqs').select('*').order('numero')),
      fetchAll(() => supabase.from('rq_items').select('*').order('creado_en').order('id')),
      fetchAll(() => supabase.from('facturas').select('*').order('numero')),
      fetchAll(() => supabase.from('factura_items').select('*').order('factura_id').order('rq_item_id')),
      fetchAll(() => supabase.from('salidas').select('*').order('numero')),
      fetchAll(() => supabase.from('prestamos').select('*').order('numero')),
      fetchAll(() => supabase.from('solicitudes_material').select('*').order('numero')),
      fetchAll(() => supabase.from('familias').select('*').order('iu')),
      fetchAll(() => supabase.from('stock_inicial').select('*').order('proyecto').order('codigo')),
      fetchAll(() => supabase.from('cajas_chicas').select('*').order('proyecto')),
      fetchAll(() => supabase.from('rendiciones').select('*').order('numero')),
    ];
    const [prjR, usrR, matR, provR, rqsR, itemR, factR, fitR, salR, preR, solR, famR, siR, cajR, renR] = await Promise.all(q);
    const conError = [prjR, usrR, matR, provR, rqsR, itemR, factR, fitR, salR, preR, solR, famR, siR, cajR, renR].find(r => r.error);
    if (conError) { setCargaError(conError.error.message); return null; }

    const prj = prjR.data, usrs = usrR.data, mats = matR.data, provs = provR.data, fams = famR.data;
    const famMap = {}; fams.forEach(f => { famMap[f.iu] = f.nombre; });
    const nomProy = {}, codProy = {}, bancoDe = {};
    prj.forEach(p => { nomProy[p.codigo] = p.nombre; codProy[p.nombre] = p.codigo; bancoDe[p.nombre] = { banco: p.banco || '', cuenta: p.nro_cuenta || '' }; });
    PROYECTOS = prj.filter(p => p.activo).map(p => [p.codigo, p.nombre]);
    ALMACENEROS = {};
    usrs.filter(u => u.rol === 'almacen' && u.activo && u.proyecto_asignado).forEach(u => { ALMACENEROS[nomProy[u.proyecto_asignado]] = u.nombre; });

    const matMap = {}; mats.forEach(m => { matMap[m.codigo] = m; });
    // unidad de consumo: si el material se compra en caja, la base es und_base
    const undDe = m => (m && (m.und_base || m.und)) || '';
    const factorMap = {};
    mats.forEach(m => { if (m.factor_caja) factorMap[m.codigo] = { factor: Number(m.factor_caja), undCompra: m.und, undBase: m.und_base || 'UND' }; });
    const usrMap = {}; usrs.forEach(u => { usrMap[u.id] = u; });
    const provMap = {}; provs.forEach(p => { provMap[p.ruc] = p; });
    const factMap = {}; factR.data.forEach(f => { factMap[f.id] = f; });
    // Precio promedio ponderado por material (del desglose de facturas):
    // base de la valorización del cierre mensual de almacén
    const itemById = {}; itemR.data.forEach(r => { itemById[r.id] = r; });
    const acumPrecio = {};
    fitR.data.forEach(fi => {
      if (fi.precio_unitario == null) return;
      const it = itemById[fi.rq_item_id]; if (!it) return;
      const a = (acumPrecio[it.codigo] = acumPrecio[it.codigo] || { m: 0, c: 0 });
      a.m += Number(fi.precio_unitario) * Number(it.cant);
      a.c += Number(it.cant);
    });
    const precioProm = {};
    Object.entries(acumPrecio).forEach(([k, v]) => { if (v.c > 0) precioProm[k] = v.m / v.c; });
    // Última compra por material (referencia anti-sobreprecio al facturar)
    const ultimaCompra = {};
    fitR.data.forEach(fi => {
      if (fi.precio_unitario == null) return;
      const it = itemById[fi.rq_item_id]; if (!it) return;
      const fx = factMap[fi.factura_id]; if (!fx) return;
      const u = ultimaCompra[it.codigo];
      if (!u || fx.fecha > u.fecha || (fx.fecha === u.fecha && fx.numero > u.n)) {
        ultimaCompra[it.codigo] = {
          precio: Number(fi.precio_unitario), fecha: fx.fecha, n: fx.numero,
          prov: provMap[fx.proveedor_ruc] ? provMap[fx.proveedor_ruc].razon_social : fx.proveedor_ruc,
        };
      }
    });
    const factDeItem = {}; const itemsDeFactura = {};
    fitR.data.forEach(fi => {
      factDeItem[fi.rq_item_id] = factMap[fi.factura_id] || null;
      (itemsDeFactura[fi.factura_id] = itemsDeFactura[fi.factura_id] || []).push(fi.rq_item_id);
    });
    // El estado de pago del ítem se hereda de su factura:
    // sin factura → '—' · factura pendiente al crédito → 'Crédito'
    // factura pendiente contado/transferencia → 'Falta' · pagada → 'Pagado'
    const pagoDe = fx => {
      if (!fx) return '—';
      if (fx.estado_pago === 'Pagada') return 'Pagado';
      return (fx.forma_pago || '').toLowerCase().includes('cr') ? 'Crédito' : 'Falta';
    };

    const itemsPorRq = {};
    itemR.data.forEach(r => {
      const m = matMap[r.codigo] || {};
      const it = {
        id: r.id, cod: r.codigo, desc: m.descripcion || r.codigo, und: undDe(m),
        cant: Number(r.cant), fecha: r.fecha_necesitada, destino: r.destino, color: r.color || '', obs: r.obs || '',
        canal: r.canal, decision: r.decision, estado: r.estado, motivoRechazo: r.motivo_rechazo || '',
        motivoAnulacion: r.anulacion ? r.anulacion.motivo : '', anuladoPor: r.anulacion ? r.anulacion.por : '',
        fechaAnulacion: r.anulacion ? r.anulacion.fecha : '',
        pago: pagoDe(factDeItem[r.id]), factura: factDeItem[r.id] ? factDeItem[r.id].serie : null,
        fechaEntrega: r.fecha_entrega || '', fechaRecojoSaldo: r.fecha_recojo_saldo || '', fechaEntregaSaldo: r.fecha_entrega_saldo || '',
        comunicoResidente: r.comunico_residente === true ? 'Sí' : r.comunico_residente === false ? 'No' : '—',
        destinoSaldo: r.destino_saldo || '', cantRecibida: Number(r.cant_recibida || 0), obsAlmacen: r.obs_almacen || '',
        fechaCaducidad: r.fecha_caducidad || '',
        compradoPorId: r.comprado_por || null, compradoPor: usrMap[r.comprado_por] ? usrMap[r.comprado_por].nombre : '',
      };
      (itemsPorRq[r.rq_id] = itemsPorRq[r.rq_id] || []).push(it);
    });

    const rqs = rqsR.data.map(r => ({
      id: r.id, n: r.numero, proyecto: nomProy[r.proyecto] || r.proyecto, partida: r.partida,
      residente: usrMap[r.residente_id] ? usrMap[r.residente_id].nombre : '', almacen: r.almacen_resp || '',
      piso: r.piso || '', canal: r.canal, just: r.justificacion || '', fechaRQ: r.fecha_rq,
      creadoPor: usrMap[r.creado_por] ? usrMap[r.creado_por].nombre : '', items: itemsPorRq[r.id] || [],
    }));

    const rqNumDeItem = {}, descDeItem = {};
    rqs.forEach(r => r.items.forEach(i => { rqNumDeItem[i.id] = r.n; descDeItem[i.id] = i.desc; }));

    const facturas = factR.data.map(f => ({
      id: f.id, n: f.numero, serie: f.serie, tipoDoc: f.tipo_doc || 'Factura',
      prov: provMap[f.proveedor_ruc] ? provMap[f.proveedor_ruc].razon_social : f.proveedor_ruc,
      ruc: f.proveedor_ruc, fecha: f.fecha, monto: Number(f.monto), forma: f.forma_pago,
      proyecto: nomProy[f.proyecto] || f.proyecto,
      registradoPor: usrMap[f.registrado_por] ? usrMap[f.registrado_por].nombre : '',
      estadoPago: f.estado_pago || 'Pendiente', banco: f.banco || '', numOp: f.numero_operacion || '',
      medio: f.medio_pago || '', rendicionId: f.rendicion_id || null,
      conciliada: !!f.conciliada, conciliadaPor: usrMap[f.conciliada_por] ? usrMap[f.conciliada_por].nombre : '',
      fechaConciliacion: f.fecha_conciliacion || '',
      fechaPago: f.fecha_pago || '', pagadoPor: usrMap[f.pagado_por] ? usrMap[f.pagado_por].nombre : '',
      items: (itemsDeFactura[f.id] || []).map(id => ({ rq: rqNumDeItem[id], desc: descDeItem[id] })),
    }));

    const cajas = {};
    cajR.data.forEach(c => { cajas[nomProy[c.proyecto] || c.proyecto] = Number(c.monto_fondo); });
    const rendiciones = renR.data.map(r => ({
      id: r.id, n: r.numero, proyecto: nomProy[r.proyecto] || r.proyecto, fecha: r.fecha,
      responsable: usrMap[r.responsable_id] ? usrMap[r.responsable_id].nombre : '',
      montoFondo: Number(r.monto_fondo), estado: r.estado, observacion: r.observacion || '',
      aprobadoPor: usrMap[r.aprobado_por] ? usrMap[r.aprobado_por].nombre : '',
      fechaAprobacion: r.fecha_aprobacion || '', repOp: r.reposicion_operacion || '',
      repFecha: r.reposicion_fecha || '', repuestoPor: usrMap[r.repuesto_por] ? usrMap[r.repuesto_por].nombre : '',
    }));

    const salidas = salR.data.map(s => ({
      id: s.id, n: s.numero, fecha: s.fecha, proyecto: nomProy[s.proyecto] || s.proyecto,
      cod: s.codigo, desc: matMap[s.codigo] ? matMap[s.codigo].descripcion : s.codigo,
      und: undDe(matMap[s.codigo]), cant: Number(s.cant),
      hoja: s.hoja_trabajo, zona: s.zona, uso: s.uso, motivoUso: s.motivo_uso || '',
      registradoPor: usrMap[s.registrado_por] ? usrMap[s.registrado_por].nombre : '',
      anulada: !!s.anulacion, motivoAnulacion: s.anulacion ? s.anulacion.motivo : '',
      anuladoPor: s.anulacion ? s.anulacion.por : '', fechaAnulacion: s.anulacion ? s.anulacion.fecha : '',
    }));

    const prestamos = preR.data.map(p => ({
      id: p.id, n: p.numero, fecha: p.fecha,
      origen: nomProy[p.origen] || p.origen, destino: nomProy[p.destino] || p.destino,
      cod: p.codigo, desc: matMap[p.codigo] ? matMap[p.codigo].descripcion : p.codigo,
      und: undDe(matMap[p.codigo]), cant: Number(p.cant),
      autoriza: p.autoriza, estado: p.estado, fechaCierre: p.fecha_cierre,
      motivoAnulacion: p.anulacion ? p.anulacion.motivo : '', anuladoPor: p.anulacion ? p.anulacion.por : '',
      registradoPor: usrMap[p.registrado_por] ? usrMap[p.registrado_por].nombre : '',
    }));

    const stockInicial = siR.data.map(si => ({
      proyecto: nomProy[si.proyecto] || si.proyecto, cod: si.codigo,
      desc: matMap[si.codigo] ? matMap[si.codigo].descripcion : si.codigo,
      und: undDe(matMap[si.codigo]),
      cant: Number(si.cant), fecha: si.fecha_inventario,
    }));

    const solicitudes = solR.data.map(s => ({
      id: s.id, n: s.numero, fecha: s.fecha, desc: s.descripcion, und: s.und,
      perecedero: !!s.perecedero,
      fam: s.familia_iu ? (famMap[s.familia_iu] || s.familia_iu) : '', famIu: s.familia_iu || '',
      solicitante: usrMap[s.solicitante_id] ? usrMap[s.solicitante_id].nombre : '', solicitanteId: s.solicitante_id,
      proyecto: nomProy[s.proyecto] || s.proyecto, estado: s.estado, motivo: s.motivo || '', codigo: s.codigo_asignado,
    }));

    const nuevo = {
      rqs, facturas, salidas, prestamos, solicitudes, stockInicial, cajas, rendiciones, bancoDe,
      catalogo: mats.map(m => [m.codigo, m.descripcion, undDe(m), famMap[m.codigo.slice(0, 2)] || '', m.factor_caja ? Number(m.factor_caja) : null, m.factor_caja ? m.und : null, !!m.perecedero]),
      pereceMap: Object.fromEntries(mats.filter(m => m.perecedero).map(m => [m.codigo, true])),
      precioProm, ultimaCompra,
      proveedores: provs.map(p => [p.ruc, p.razon_social]),
      familias: fams.map(f => [f.iu, f.nombre]),
      factorMap,
      nomProy, codProy,
    };
    dbRef.current = nuevo;
    setDb(nuevo);
    setCargaError('');
    return nuevo;
  }, []);

  // Cargar perfil + datos al iniciar sesión
  useEffect(() => {
    if (!session) { setUser(null); setDb(null); return; }
    (async () => {
      const { data: perfil, error } = await supabase.from('usuarios').select('*').eq('id', session.user.id).single();
      if (error || !perfil) {
        setPerfilError('Tu cuenta no tiene perfil asignado en el sistema. Pide a administración que registre tu usuario.');
        return;
      }
      const datos = await cargarTodo();
      const nomProy = datos ? datos.nomProy : {};
      setUser({
        id: perfil.id, nombre: perfil.nombre, rol: perfil.rol,
        proyecto: perfil.proyecto_asignado ? (nomProy[perfil.proyecto_asignado] || perfil.proyecto_asignado) : null,
      });
      setTab(TAB_INICIAL[perfil.rol] || 'res');
      setPerfilError('');
    })();
  }, [session, cargarTodo]);

  const api = useMemo(() => {
    const cod = nombre => (dbRef.current ? dbRef.current.codProy[nombre] : null) || nombre;
    const wrap = async (fn) => {
      try {
        const r = await fn();
        if (r && r.error) return { error: r.error.message || String(r.error) };
        await cargarTodo();
        return r || {};
      } catch (e) { return { error: e.message || String(e) }; }
    };
    return {
      crearRq: ({ cab, items, just, canal }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        const { data: rq, error } = await supabase.from('rqs').insert({
          proyecto: cod(cab.proyecto), partida: cab.partida, residente_id: u.id,
          almacen_resp: cab.almacen, piso: cab.piso, canal, justificacion: just || null, creado_por: u.id,
        }).select().single();
        if (error) return { error };
        const rows = items.map(i => ({
          rq_id: rq.id, codigo: i.cod, cant: Number(i.cant), fecha_necesitada: cab.fecha,
          destino: i.destino.trim(), color: i.color.trim() || null, obs: i.obs.trim() || null,
        }));
        const { error: e2 } = await supabase.from('rq_items').insert(rows);
        if (e2) return { error: e2 };
        return { numero: rq.numero };
      }),
      updItem: (id, patch) => wrap(async () => await supabase.from('rq_items').update(patch).eq('id', id)),
      registrarFactura: ({ serie, prov, ruc, fecha, monto, forma, proyecto, efectivo, compromiso, lineas }) => wrap(async () => {
        const existe = dbRef.current.proveedores.some(p => p[0] === ruc);
        if (!existe) {
          const { error: eP } = await supabase.from('proveedores').insert({ ruc, razon_social: prov });
          if (eP && eP.code !== '23505') return { error: eP };
        }
        const u = (await supabase.auth.getUser()).data.user;

        // Efectivo: la factura nace Pagada contra la rendición del día de la obra
        let rendicionId = null;
        if (efectivo) {
          const proyCod = cod(proyecto);
          let { data: ren } = await supabase.from('rendiciones').select('id,estado')
            .eq('proyecto', proyCod).eq('fecha', HOY_ISO).maybeSingle();
          if (ren && ren.estado !== 'Abierta') return { error: { message: `La rendición de hoy de ${proyecto} ya fue ${ren.estado.toLowerCase()}; coordina con administración.` } };
          if (!ren) {
            const fondo = dbRef.current.cajas[proyecto] || 2000;
            const ins = await supabase.from('rendiciones').insert({
              proyecto: proyCod, fecha: HOY_ISO, responsable_id: u.id, monto_fondo: fondo,
            }).select().single();
            if (ins.error && ins.error.code === '23505') {
              // otro registro la creó en paralelo: reintentar lectura
              ({ data: ren } = await supabase.from('rendiciones').select('id,estado')
                .eq('proyecto', proyCod).eq('fecha', HOY_ISO).maybeSingle());
            } else if (ins.error) return { error: ins.error };
            else ren = ins.data;
          }
          rendicionId = ren.id;
        }

        const { data: fact, error } = await supabase.from('facturas').insert({
          serie, proveedor_ruc: ruc, fecha, monto, forma_pago: forma,
          // solo se envía en compromisos: así las facturas normales no dependen de la migración 14
          ...(compromiso ? { tipo_doc: 'Compromiso' } : {}),
          proyecto: cod(proyecto), registrado_por: u.id,
          ...(efectivo ? {
            estado_pago: 'Pagada', medio_pago: 'Efectivo', fecha_pago: HOY_ISO,
            pagado_por: u.id, rendicion_id: rendicionId,
          } : {}),
        }).select().single();
        if (error) return { error: error.code === '23505' ? { message: `La factura ${serie} de ese RUC ya está registrada.` } : error };
        const { error: e2 } = await supabase.from('factura_items').insert(lineas.map(l => ({ factura_id: fact.id, rq_item_id: l.id, precio_unitario: l.precio })));
        if (e2) return { error: e2 };
        return {};
      }),
      pagarFactura: (id, { medio, banco, op, fecha, serieReal }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        const r = await supabase.from('facturas').update({
          estado_pago: 'Pagada', medio_pago: medio, banco, numero_operacion: op,
          fecha_pago: fecha, pagado_por: u.id,
          // compromiso → factura real: la serie llega con el comprobante al pagar
          ...(serieReal ? { serie: serieReal.trim().toUpperCase(), tipo_doc: 'Factura' } : {}),
        }).eq('id', id);
        if (r.error && r.error.code === '23505') return { error: { message: `La factura ${serieReal} de ese RUC ya está registrada. Verifica la serie.` } };
        return r;
      }),
      resolverRendicion: (id, { estado, observacion }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('rendiciones').update({
          estado, observacion: observacion || null, aprobado_por: u.id, fecha_aprobacion: HOY_ISO,
        }).eq('id', id);
      }),
      reponerRendicion: (id, { op, fecha }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('rendiciones').update({
          reposicion_operacion: op, reposicion_fecha: fecha, repuesto_por: u.id,
        }).eq('id', id);
      }),
      recibir: (item, rec, obs, cad) => wrap(async () => {
        const total = Number(item.cantRecibida || 0) + rec;
        const esSaldo = item.estado === 'Incompleto';
        const patch = { cant_recibida: total };
        if (esSaldo) patch.fecha_entrega_saldo = HOY_ISO;
        else patch.fecha_entrega = item.fechaEntrega || HOY_ISO;
        if (obs) patch.obs_almacen = item.obsAlmacen ? item.obsAlmacen + ' · ' + obs : obs;
        // perecedero: se conserva la caducidad más próxima entre recepciones
        if (cad) patch.fecha_caducidad = (item.fechaCaducidad && item.fechaCaducidad < cad) ? item.fechaCaducidad : cad;
        return await supabase.from('rq_items').update(patch).eq('id', item.id);
      }),
      darSalida: ({ proyecto, cod: codigo, cant, hoja, zona }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('salidas').insert({
          proyecto: cod(proyecto), codigo, cant, hoja_trabajo: hoja, zona, registrado_por: u.id,
        });
      }),
      updSalida: (id, patch) => wrap(async () => await supabase.from('salidas').update(patch).eq('id', id)),
      prestar: ({ origen, destino, cod: codigo, cant, autoriza }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('prestamos').insert({
          origen: cod(origen), destino: cod(destino), codigo, cant, autoriza, registrado_por: u.id,
        });
      }),
      updPrestamo: (id, patch) => wrap(async () => await supabase.from('prestamos').update(patch).eq('id', id)),
      crearSolicitud: ({ desc, und, famIu, perecedero, proyecto }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('solicitudes_material').insert({
          descripcion: desc, und, familia_iu: famIu, perecedero, solicitante_id: u.id, proyecto: cod(proyecto),
        });
      }),
      // Aprobación en una sola transacción (RPC): material + solicitud juntos
      aprobarSolicitud: (s, { codigo, desc, und, famIu, perecedero }) => wrap(async () =>
        await supabase.rpc('aprobar_material', {
          p_solicitud: s.id, p_codigo: codigo, p_descripcion: desc,
          p_und: und, p_familia_iu: famIu, p_perecedero: perecedero,
        })),
      rechazarSolicitud: (s, motivo) => wrap(async () =>
        await supabase.from('solicitudes_material').update({ estado: 'Rechazado', motivo }).eq('id', s.id)),
      crearFamilia: ({ iu, nombre }) => wrap(async () =>
        await supabase.from('familias').insert({ iu, nombre })),
      setPerecedero: (codigo, valor) => wrap(async () =>
        await supabase.from('materiales').update({ perecedero: valor }).eq('codigo', codigo)),
      conciliarFactura: (id, valor) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('facturas').update(valor
          ? { conciliada: true, conciliada_por: u.id, fecha_conciliacion: HOY_ISO }
          : { conciliada: false, conciliada_por: null, fecha_conciliacion: null }
        ).eq('id', id);
      }),
    };
  }, [cargarTodo]);

  if (session === undefined) return <div className="bg-slate-950 min-h-screen" />;

  if (!session) return (
    <div className="bg-slate-950 min-h-screen text-slate-100" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <Login />
    </div>
  );

  if (perfilError) return (
    <div className="bg-slate-950 min-h-screen text-slate-100 flex items-center justify-center p-4" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div className="max-w-sm text-center">
        <div className="text-red-400 text-sm mb-4">{perfilError}</div>
        <button onClick={() => supabase.auth.signOut()} className="px-4 py-2 rounded text-xs font-bold uppercase bg-slate-800 text-slate-300">Salir</button>
      </div>
    </div>
  );

  if (!user || !db) return (
    <div className="bg-slate-950 min-h-screen text-slate-400 flex items-center justify-center text-sm" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {cargaError ? <span className="text-red-400">Error cargando datos: {cargaError}</span> : 'Cargando datos…'}
    </div>
  );

  const tabs = TABS_POR_ROL[user.rol] || [];

  return (
    <div className="bg-slate-950 min-h-screen text-slate-100" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div className="bg-black border-b-2 border-yellow-400 px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="font-extrabold text-sm tracking-widest text-yellow-400">
          COPACABANA <span className="text-slate-600 font-medium">/ RQ</span></div>
        <div className="text-slate-400 text-[11px]">{user.nombre}{user.proyecto ? ' · ' + user.proyecto : ''} <span className="text-slate-600">({user.rol})</span></div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="flex gap-0.5 bg-slate-800 p-1 rounded">
            {tabs.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-3 py-1.5 rounded text-[11px] font-semibold tracking-wide uppercase ${tab === k ? 'bg-yellow-400 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}>{l}</button>
            ))}
          </div>
          <button onClick={() => cargarTodo()} title="Traer los últimos datos"
            className="px-2.5 py-1.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700 hover:text-yellow-400 hover:border-yellow-400">⟳ Actualizar</button>
          <button onClick={() => supabase.auth.signOut()} className="px-2.5 py-1.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200">Salir</button>
        </div>
      </div>
      <div className="p-4">
        {tab === 'res' && <Residente user={user} db={db} api={api} />}
        {tab === 'com' && <Compras user={user} db={db} api={api} />}
        {tab === 'dia' && <ComprasDelDia db={db} api={api} />}
        {tab === 'sto' && <AlmacenResidente user={user} db={db} />}
        {tab === 'his' && <HistorialMateriales user={user} db={db} />}
        {tab === 'fac' && <Compras user={user} db={db} api={api} modo="facturar" />}
        {tab === 'alm' && <Almacen user={user} db={db} api={api} />}
        {tab === 'cat' && <Catalogo user={user} db={db} api={api} />}
        {tab === 'pag' && <Pagos user={user} db={db} api={api} />}
        {tab === 'ren' && <Rendiciones user={user} db={db} api={api} />}
        {tab === 'aud' && <Auditoria user={user} db={db} api={api} />}
        {tab === 'tab' && <Tablero db={db} />}
      </div>
    </div>
  );
}
