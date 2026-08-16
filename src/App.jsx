import { useState, useMemo, useEffect, useRef, useCallback, Fragment } from 'react';
import { supabase, ENTORNO, ES_PRODUCCION } from './supabaseClient';
import { cuadreCaja, diferenciaArqueo, excedeTolerancia } from './caja';
import { esDelDia, HOY_ISO, fmt, dias, diasHoy } from './fechas';
import { estadoCaducidad, calcularStocks, stockDetalleObra } from './stock';
import { FORMAS_PAGO, PLAZOS_CREDITO, esCredito, vencimientoDe, MEDIOS_PAGO, ETIQUETA_NRO, SIN_BANCO } from './pago';
import { imprimirRQ, imprimirCierre, imprimirConteo } from './pdf';
import { PROYECTOS, ALMACENEROS, setMaestros } from './maestros';
import { canalClases, pillEstado, inputCls, lblCls, thCls, btnOk, btnRojo, btnVerde, Aviso, AnularBox, AlertaCerrable, FiltroProyecto, FechaInput, pendCls } from './ui';
import { buscarEnCatalogo } from './busqueda';
import { Login } from './vistas/Login';
import { Catalogo } from './vistas/Catalogo';
import { HistorialPrecios } from './vistas/HistorialPrecios';
import { ReporteMensual } from './vistas/ReporteMensual';
import { AlmacenResidente } from './vistas/AlmacenResidente';
import { HistorialMateriales } from './vistas/HistorialMateriales';
import { AprobacionesResidente } from './vistas/AprobacionesResidente';
import { Almacen } from './vistas/Almacen';
import { ComprasDelDia } from './vistas/ComprasDelDia';
import { Pagos } from './vistas/Pagos';
import { Rendiciones } from './vistas/Rendiciones';
import { Auditoria } from './vistas/Auditoria';

const TABS_POR_ROL = {
  gerente: [['res', 'Residente'], ['com', 'Compras'], ['alm', 'Almacén'], ['apr', 'Aprobaciones'], ['cat', 'Catálogo'], ['his', 'Historial'], ['pag', 'Pagos'], ['ren', 'Rendiciones'], ['aud', 'Auditoría'], ['tab', 'Tablero'], ['rep', 'Reporte mensual']],
  compras: [['com', 'Compras'], ['cat', 'Catálogo'], ['tab', 'Tablero']],
  residente: [['res', 'Mis requerimientos'], ['apr', 'Aprobaciones'], ['sto', 'Mi almacén'], ['his', 'Historial']],
  almacen: [['alm', 'Mi almacén']],
  pagos: [['pag', 'Pagos'], ['ren', 'Rendiciones']],
  administracion: [['pag', 'Pagos'], ['ren', 'Rendiciones']],
  comprador: [['dia', 'Compras del día'], ['fac', 'Facturar'], ['ren', 'Rendiciones']],
};
const TAB_INICIAL = { gerente: 'tab', compras: 'com', residente: 'res', almacen: 'alm', pagos: 'pag', administracion: 'ren', comprador: 'dia' };

function canalDeFecha(f) {
  if (!f) return null;
  const m = diasHoy(f);
  const k = m < 2 ? 'URGENTE' : m <= 7 ? 'GENERAL' : 'ANTICIPADO';
  return { k, cls: canalClases[k] };
}

// Niveles de obra para análisis de gasto por nivel
const NIVELES = [
  'SÓTANO 1', 'SÓTANO 2', 'SEMI SÓTANO', 'PLATEA CIMENTACIÓN', 'ESTRUCTURA',
  ...Array.from({ length: 11 }, (_, i) => `NIVEL ${i + 1}`),
];


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

  const cabOk = cab.residente.trim() && cab.piso && cab.fecha && cab.fecha >= HOY_ISO;
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

  const misRqs = esRes ? rqs.filter(r => r.proyecto === user.proyecto && r.tipo !== 'Cotizacion') : rqs;
  const misSol = esRes ? solicitudes.filter(s => s.solicitanteId === user.id) : solicitudes;
  // Aviso: ítems míos anulados por Compras/gerencia en los últimos 15 días
  const anuladosRecientes = misRqs
    .flatMap(r => r.items.map(i => ({ ...i, rq: r.n })))
    .filter(i => i.decision === 'Anulado' && i.fechaAnulacion && dias(HOY_ISO, i.fechaAnulacion) <= 15)
    .sort((a, b) => (a.fechaAnulacion < b.fechaAnulacion ? 1 : -1));

  // Un RQ se archiva solo cuando ya no queda nada por atender:
  // cada ítem está Entregado, o cerrado por rechazo/anulación.
  const [verArchivados, setVerArchivados] = useState(false);
  const rqCerrado = r => r.items.length > 0 &&
    r.items.every(i => i.decision === 'Rechazado' || i.decision === 'Anulado' || i.estado === 'Entregado');
  // Orden a elección del residente: N° de RQ (el más reciente arriba, que es
  // lo que uno acaba de mandar) o fecha necesitada (lo más próximo primero).
  const [ordenRqs, setOrdenRqs] = useState('num');
  const fechaNecDe = r => r.items.reduce((m, i) => (i.fecha && (!m || i.fecha < m) ? i.fecha : m), '');
  const ordenar = arr => ordenRqs === 'fecha'
    ? [...arr].sort((a, b) => {
        const fa = fechaNecDe(a) || '9999', fb = fechaNecDe(b) || '9999';
        return fa < fb ? -1 : fa > fb ? 1 : b.n - a.n;
      })
    : [...arr].sort((a, b) => b.n - a.n);
  const rqsActivos = ordenar(misRqs.filter(r => !rqCerrado(r)));
  const rqsArchivados = ordenar(misRqs.filter(rqCerrado));
  const mostrados = [...rqsActivos, ...(verArchivados ? rqsArchivados : [])];

  return (
    <div>
      <Aviso msg={aviso} />
      {esRes && anuladosRecientes.length > 0 && (
        <AlertaCerrable
          id={'anulados:' + anuladosRecientes.map(i => i.id).join(',')}
          resumen={`⚠ Te anularon ${anuladosRecientes.length} ítem(s)`}
          desaparece>
          <div className="text-[11px] font-bold tracking-widest text-red-400 uppercase mb-2">
            ⚠ Te anularon {anuladosRecientes.length} ítem(s) · últimos 15 días</div>
          <table className="w-full text-xs">
            <thead><tr>{['RQ', 'Material', 'Cant', 'Motivo', 'Anuló', 'Fecha'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>
              {anuladosRecientes.map(i => (
                <tr key={i.id} className="border-b border-red-900/50">
                  <td className="py-1.5 px-1.5 font-mono text-slate-300">RQ-{String(i.rq).padStart(3, '0')}</td>
                  <td className="py-1.5 px-1.5 text-slate-200">{i.desc}</td>
                  <td className="py-1.5 px-1.5 font-mono text-slate-400">{i.cant} {i.und}</td>
                  <td className="py-1.5 px-1.5 text-red-300">{i.motivoAnulacion || '—'}</td>
                  <td className="py-1.5 px-1.5 text-slate-400">{i.anuladoPor || '—'}</td>
                  <td className="py-1.5 px-1.5 text-slate-400">{fmt(i.fechaAnulacion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[10px] text-red-300/70 mt-2">
            Si necesitas igual el material, vuelve a pedirlo en un RQ nuevo o conversa con Compras.</div>
        </AlertaCerrable>
      )}
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

// Pedido por cotización (enchapes): lo registra Lucía con la cotización que
// le alcanza el arquitecto. Crea cada material 97xxxx y el pedido, ya aprobado.
function PedidoCotizacion({ user, db, api }) {
  const [abierto, setAbierto] = useState(false);
  const [cab, setCab] = useState({ proyecto: PROYECTOS[0] ? PROYECTOS[0][1] : '', ref: '', arq: '', fecha: HOY_ISO });
  const [lineas, setLineas] = useState([{ desc: '', cant: '', destino: '' }]);
  const [aviso, setAviso] = useState('');
  const avisar = (m, ms = 6000) => { setAviso(m); setTimeout(() => setAviso(''), ms); };

  const setL = (i, k, v) => setLineas(lineas.map((l, j) => j === i ? { ...l, [k]: v } : l));
  const addL = () => setLineas([...lineas, { desc: '', cant: '', destino: '' }]);
  const delL = i => setLineas(lineas.filter((_, j) => j !== i));

  const lineasOk = lineas.filter(l => l.desc.trim() && Number(l.cant) > 0 && l.destino.trim());
  const listo = cab.proyecto && cab.ref.trim() && cab.arq.trim() && cab.fecha >= HOY_ISO && lineasOk.length > 0;

  const enviar = async () => {
    if (!listo) return;
    const r = await api.crearPedidoCotizacion({
      proyecto: cab.proyecto, cotizacionRef: cab.ref, arquitecto: cab.arq, fecha: cab.fecha,
      lineas: lineasOk.map(l => ({ desc: l.desc, cant: l.cant, destino: l.destino })),
    });
    if (r.error) { avisar('⚠ ' + r.error); return; }
    avisar(`Pedido por cotización ${cab.ref} registrado (RQ-${String(r.numero).padStart(3, '0')}) con ${lineasOk.length} enchape(s). Ya está aprobado y listo para facturar y recibir en almacén.`);
    setCab({ proyecto: cab.proyecto, ref: '', arq: '', fecha: HOY_ISO });
    setLineas([{ desc: '', cant: '', destino: '' }]);
    setAbierto(false);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Pedido por cotización · enchapes y acabados personalizados</div>
        <button onClick={() => setAbierto(v => !v)}
          className="ml-auto px-2.5 py-1.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-yellow-400 border border-slate-700 hover:border-yellow-400">
          {abierto ? '✕ Cerrar' : '＋ Nuevo pedido'}</button>
      </div>
      <Aviso msg={aviso} />
      {!abierto ? (
        <div className="text-slate-500 text-[11px] mt-2">Para materiales que elige el arquitecto con el propietario (no van por RQ del residente). Cada modelo se crea con código propio de la familia <b>97 · ENCHAPES</b> y entra al almacén de la obra como cualquier material.</div>
      ) : (
        <div className="mt-3">
          <div className="grid md:grid-cols-4 gap-2 mb-3">
            <div><label className={lblCls}>Obra</label><FiltroProyecto value={cab.proyecto} onChange={v => setCab({ ...cab, proyecto: v })} /></div>
            <div><label className={lblCls}>N° de cotización *</label><input value={cab.ref} onChange={e => setCab({ ...cab, ref: e.target.value })} placeholder="COT-2503-011" className={`w-full ${inputCls} font-mono`} /></div>
            <div><label className={lblCls}>Arquitecto que solicita *</label><input value={cab.arq} onChange={e => setCab({ ...cab, arq: e.target.value })} placeholder="Nombre del arquitecto" className={`w-full ${inputCls}`} /></div>
            <div><label className={lblCls}>Fecha necesitada *</label><FechaInput value={cab.fecha} min={HOY_ISO} onChange={e => setCab({ ...cab, fecha: e.target.value })} className={`w-full ${inputCls}`} /></div>
          </div>
          <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">Enchapes de esta cotización</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['Descripción (modelo · color · formato)', 'Cantidad (m²)', 'Destino (baño / depto)', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={i} className="border-b border-slate-800">
                    <td className="py-1.5 px-1"><input value={l.desc} onChange={e => setL(i, 'desc', e.target.value)} placeholder="Porcelanato gris 60x60" className={`w-full ${inputCls}`} /></td>
                    <td className="py-1.5 px-1"><input type="number" min="0" step="any" value={l.cant} onChange={e => setL(i, 'cant', e.target.value)} placeholder="m²" className={`w-24 ${inputCls}`} /></td>
                    <td className="py-1.5 px-1"><input value={l.destino} onChange={e => setL(i, 'destino', e.target.value)} placeholder="Baño Dpto 302" className={`w-full ${inputCls}`} /></td>
                    <td className="py-1.5 px-1">{lineas.length > 1 && <button onClick={() => delL(i)} className="text-slate-500 hover:text-red-400 text-sm">✕</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button onClick={addL} className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700 hover:border-slate-500">＋ Otro enchape</button>
            <button onClick={enviar} disabled={!listo} className={`ml-auto ${btnOk(listo)}`}>Registrar pedido por cotización</button>
          </div>
          <div className="mt-2 text-slate-500 text-[10px]">Los enchapes se piden y se controlan en m²: el almacén recibe en m² y el precio por m² se registra al facturar, como cualquier material.</div>
        </div>
      )}
    </div>
  );
}

// Historial de precios por material: herramienta de negociación de Compras.
// Todas las compras del material, comparativa por proveedor y tendencia.
function Compras({ user, db, api, modo }) {
  const { rqs, facturas, proveedores, ultimaCompra, mejorPrecio2m = {}, rendiciones = [] } = db;
  // Obras con la caja chica trabada: descuadre o observación sin resolver de días anteriores
  const cajasTrabadas = rendiciones.filter(r =>
    (r.estado === 'Con diferencia' || r.estado === 'Observada') && r.fecha < HOY_ISO);
  const facturarSolo = modo === 'facturar';   // rol comprador: solo factura, no decide
  const puedeFacturar = user.rol === 'compras' || user.rol === 'comprador';
  // Dar por cerrado el saldo de una compra parcial es decisión de compra, no de
  // quien fue a buscar el material: solo Lucía. La base lo exige igual.
  const esCompras = user.rol === 'compras';
  const [rechazo, setRechazo] = useState({});
  const [aviso, setAviso] = useState('');
  const [proy, setProy] = useState('TODOS');
  const [fFact, setFFact] = useState({});
  const [buscaExtra, setBuscaExtra] = useState({});   // filtro de la lista "otros ítems que cubre"
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
  const flatBase = rqs.flatMap(r => r.items.map(i => ({ ...i, rq: r.n, fechaRQ: r.fechaRQ, canal: r.canal, residente: r.residente, just: r.just, proyecto: r.proyecto, piso: r.piso, tipoRq: r.tipo, cotizacionRef: r.cotizacionRef })));
  // Cerrado para Compras: aprobado, comprado y pagado. Lo que falte recibir
  // lo sigue viendo el almacén y el Tablero, pero aquí ya no estorba.
  const cerradoParaCompras = i => i.pago === 'Pagado'
    && i.decision === 'Aprobado' && (i.estado === 'Comprado' || i.estado === 'Entregado');
  // primero lo que se necesita antes (fecha necesitada ascendente)
  const flatAbierto = flatBase
    .filter(i => i.decision !== 'Rechazado' && i.decision !== 'Anulado')
    .filter(i => !cerradoParaCompras(i))
    .filter(i => proy === 'TODOS' || i.proyecto === proy)
    // el comprador (Frank) solo factura lo que ÉL marcó Comprado
    .filter(i => !facturarSolo || (i.decision === 'Aprobado' && i.compradoPorId === user.id));
  const esTriage = {
    decidir: i => i.decision === 'Pendiente',
    porComprar: i => i.decision === 'Aprobado' && i.estado === '—',
    anulPend: i => !!i.anulSolMotivo,
    facturar: i => i.decision === 'Aprobado' && !i.factura,
    // Comprado hace más de 48 h y todavía sin factura: no entra a Pagos
    sinFactura48: i => i.estado === 'Comprado' && !i.factura && dias(HOY_ISO, i.fechaCompra || i.fechaRQ) >= 2,
    // Ya pagado, esperando que el proveedor entregue el documento
    porLlegar: i => {
      const f = facturas.find(x => x.serie === i.factura);
      return !!f && f.tipoDoc === 'Pendiente';
    },
    comprado: i => i.estado === 'Comprado',
    incompleto: i => i.estado === 'Incompleto',
  };
  const chips = [
    !facturarSolo && ['decidir', 'Por decidir', 'text-yellow-400'],
    !facturarSolo && ['porComprar', 'Por comprar', 'text-orange-400'],
    !facturarSolo && ['anulPend', 'Anulación en gerencia', 'text-red-400'],
    ['facturar', 'Por facturar', 'text-sky-400'],
    ['sinFactura48', '+48h sin factura', 'text-red-400'],
    ['porLlegar', 'Factura por llegar', 'text-sky-400'],
    ['comprado', 'Comprado', 'text-green-400'],
    ['incompleto', 'Incompletos', 'text-red-400'],
  ].filter(Boolean);
  const matchBusca = i => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    const texto = `${i.desc} ${i.cod} rq-${String(i.rq).padStart(3, '0')} ${i.rq} ${i.residente} ${i.proyecto} ${i.compradoPor || ''}`.toLowerCase();
    return q.split(/\s+/).every(p => texto.includes(p));
  };
  const ordenar = arr => [...arr].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.rq - b.rq));
  // Archivados: para Compras el trabajo termina cuando el ítem está decidido,
  // comprado y pagado. La recepción es tarea del almacén, así que ya no tiene
  // por qué seguir ocupando la bandeja de Lucía ni la de Frank.
  const flatArchivado = flatBase
    .filter(cerradoParaCompras)
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

  // La anulación la confirma GERENCIA (migración 22): Compras solicita, gerencia decide.
  const esGerente = user.rol === 'gerente';
  const solicitarAnulacion = (i, motivo) => {
    if (esGerente) {
      updItem(i, { decision: 'Anulado', anulacion: { motivo, por: user.nombre, fecha: HOY_ISO }, anulacion_solicitud: null, anulacion_rechazo: null },
        `Ítem "${i.desc}" anulado por ${user.nombre}. Queda registrado en el Tablero con motivo.`);
      return;
    }
    updItem(i, { anulacion_solicitud: { motivo, por: user.nombre, fecha: HOY_ISO }, anulacion_rechazo: null },
      `Anulación de "${i.desc}" enviada a gerencia. El ítem sigue activo hasta que gerencia la confirme.`);
  };
  const aprobarAnulacion = i =>
    updItem(i, {
      decision: 'Anulado',
      anulacion: { motivo: i.anulSolMotivo, por: user.nombre, fecha: HOY_ISO, solicitado_por: i.anulSolPor },
      anulacion_solicitud: null,
    }, `Anulación de "${i.desc}" confirmada. El ítem queda anulado con rastro completo.`);
  const rechazarAnulacion = (i, motivo) =>
    updItem(i, { anulacion_solicitud: null, anulacion_rechazo: { motivo, por: user.nombre, fecha: HOY_ISO } },
      `Anulación de "${i.desc}" rechazada. El ítem sigue vigente y Compras verá el motivo.`);

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
    setFFact({ ...fFact, [i.id]: fFact[i.id] || { serie: '', prov: '', ruc: '', fecha: HOY_ISO, monto: '', forma: FORMAS_PAGO[0], extras: [], precios: {}, efectivo: false, compromiso: false, pendiente: false, medio: 'Transferencia', banco: '', numOp: '' } });
  };
  const cerrarFactura = id => { const f2 = { ...fFact }; delete f2[id]; setFFact(f2); };

  // Anular una factura mal registrada: la confirma gerencia y libera los ítems
  const anularFact = async (f, motivo) => {
    const r = await api.anularFactura(f.id, motivo);
    if (r.error) { setAviso('⚠ ' + r.error); setTimeout(() => setAviso(''), 8000); return; }
    setAviso(`Factura ${f.serie} anulada. Sus ${f.items.length} ítem(s) quedaron libres para volver a facturarse.`);
    setTimeout(() => setAviso(''), 6000);
  };

  const setFF = (id, k, v) => {
    const f = { ...fFact[id], [k]: v };
    if (k === 'prov') {
      const p = proveedores.find(x => x[1] === v);
      if (p) f.ruc = p[0];
    }
    // Un compromiso es siempre al crédito, pero el PLAZO importa: es lo que le
    // dice a Pagos cuándo vence. Antes se guardaba 'Crédito' pelado y vencía el
    // mismo día, así que todos los compromisos nacían en rojo.
    if (k === 'compromiso') f.forma = v ? (esCredito(f.forma) ? f.forma : 'Crédito 30 días') : FORMAS_PAGO[0];
    // Si ya pagaste no hay plazo que pactar: el dinero ya salió. Ofrecer aquí
    // "Crédito 30 días" era un callejón sin salida — el servidor la rechaza
    // diciendo que eso sería un compromiso, y nadie entiende por qué.
    if (k === 'pendiente' && v) f.forma = 'Inmediato';
    setFFact({ ...fFact, [id]: f });
  };

  const toggleExtra = (id, itemId) => {
    const f = fFact[id];
    const extras = f.extras.includes(itemId) ? f.extras.filter(x => x !== itemId) : [...f.extras, itemId];
    setFFact({ ...fFact, [id]: { ...f, extras } });
  };

  const tomar = async (i, valor) => {
    const r = await api.tomarItem(i.id, valor);
    if (r.error) { setAviso('⚠ ' + r.error); setTimeout(() => setAviso(''), 7000); return; }
    setAviso(valor ? `Te encargas de comprar "${i.desc}". El resto lo verá tomado por ti.`
                   : `Soltaste "${i.desc}": vuelve a quedar libre.`);
    setTimeout(() => setAviso(''), 5000);
  };

  const [parcial, setParcial] = useState({});
  const registrarParcial = async i => {
    const f = parcial[i.id];
    const r = await api.compraParcial(i, f.cant, f.motivo, f.cerrar);
    if (r.error) { setAviso('⚠ ' + r.error); setTimeout(() => setAviso(''), 9000); return; }
    const p2 = { ...parcial }; delete p2[i.id]; setParcial(p2);
    const saldo = Number(i.cant) - Number(f.cant);
    setAviso(f.cerrar
      ? `Compra parcial de "${i.desc}": ${f.cant} de ${i.cant}. Las ${saldo} que faltan quedaron cerradas con tu motivo.`
      : `Compra parcial de "${i.desc}": ${f.cant} de ${i.cant}. El saldo de ${saldo} vuelve a la cola de compras.`);
    setTimeout(() => setAviso(''), 8000);
  };

  const registrarFactura = async i => {
    const f = fFact[i.id];
    const cubiertos = [i, ...flatBase.filter(x => f.extras.includes(x.id))];
    const suma = cubiertos.reduce((a, x) => a + (Number(f.precios[x.id]) || 0) * x.cant, 0);
    // Nunca fallar en silencio: si algo falta, decir QUÉ falta.
    const falta = [];
    if (!(f.compromiso || f.pendiente || f.serie.trim())) falta.push('el N° de factura');
    if (f.pendiente && !f.efectivo && !(f.banco || '').trim()) falta.push('el banco del pago');
    if (f.pendiente && !f.efectivo && !(f.numOp || '').trim()) falta.push('el N° de operación');
    if (!f.prov.trim()) falta.push('el proveedor');
    if (!/^\d{11}$/.test(f.ruc)) falta.push('el RUC (11 dígitos)');
    if (!f.fecha) falta.push('la fecha');
    if (!(Number(f.monto) > 0)) falta.push('el monto total');
    const sinPrecio = cubiertos.filter(x => !(Number(f.precios[x.id]) > 0));
    if (sinPrecio.length) falta.push(`el precio de ${sinPrecio.length} ítem(s): ${sinPrecio.map(x => x.desc).join(', ')}`);
    if (falta.length) {
      setAviso('⚠ Falta ' + falta.join(' · '));
      setTimeout(() => setAviso(''), 8000);
      return;
    }
    if (Math.abs(suma - Number(f.monto)) > 0.1) {
      setAviso(`⚠ El desglose no cuadra: sumaste S/ ${suma.toFixed(2)} y la factura dice S/ ${Number(f.monto).toFixed(2)} (diferencia S/ ${Math.abs(suma - Number(f.monto)).toFixed(2)}).`);
      setTimeout(() => setAviso(''), 8000);
      return;
    }
    // Compromiso y pendiente reciben serie interna de la base (CRED-#### / PEND-####)
    const interna = f.compromiso || f.pendiente;
    const serie = interna ? 'X' : f.serie.trim().toUpperCase();
    if (!interna && facturas.some(x => x.serie === serie && x.ruc === f.ruc)) {
      setAviso(`⚠ La factura ${serie} de ese RUC ya está registrada. Verifica el número.`);
      setTimeout(() => setAviso(''), 6000);
      return;
    }
    const r = await api.registrarFactura({
      serie, prov: f.prov.trim().toUpperCase(), ruc: f.ruc, fecha: f.fecha,
      monto: Number(f.monto),
      forma: f.compromiso ? (esCredito(f.forma) ? f.forma : 'Crédito 30 días')
           : (f.efectivo || f.pendiente) ? 'Inmediato' : f.forma,
      proyecto: i.proyecto,
      efectivo: !!f.efectivo, compromiso: !!f.compromiso, pendiente: !!f.pendiente,
      medio: f.pendiente && !f.efectivo ? f.medio : null,
      banco: f.pendiente && !f.efectivo ? f.banco.trim() : null,
      numOp: f.pendiente && !f.efectivo ? f.numOp.trim() : null,
      lineas: cubiertos.map(x => ({ id: x.id, precio: Number(f.precios[x.id]) })),
    });
    if (r.error) { setAviso('⚠ ' + r.error); setTimeout(() => setAviso(''), 7000); return; }
    const f2 = { ...fFact }; delete f2[i.id]; setFFact(f2);
    setAviso(f.compromiso
      ? `Compromiso de crédito registrado cubriendo ${cubiertos.length} ítem(s): la deuda ya es visible en Pagos; la serie real se digita al pagar.`
      : f.pendiente
        ? `Compra registrada como PAGADA cubriendo ${cubiertos.length} ítem(s). Queda pendiente la factura: administración digitará la serie cuando llegue.`
        : `Factura ${serie} registrada cubriendo ${cubiertos.length} ítem(s).`);
    setTimeout(() => setAviso(''), 6000);
  };

  // El comprador solo ve LAS FACTURAS QUE ÉL REGISTRÓ: la deuda de la empresa
  // con todos los proveedores no es información que necesite para comprar.
  const factProy = facturas
    .filter(f => !facturarSolo || f.registradoPorId === user.id)
    .filter(f => proy === 'TODOS' || f.proyecto === proy);
  const factPendientes = factProy.filter(f => f.estadoPago !== 'Pagada');
  const factPagadas = factProy.filter(f => f.estadoPago === 'Pagada');
  const factMostradas = verPagadas ? factProy : factPendientes;

  // Consolidado por comprar: ítems aprobados sin gestionar (sin factura y
  // sin estado logístico), agrupados por material entre todas las obras.
  const stocks = calcularStocks(db);
  const porComprar = Object.values(flatBase
    .filter(i => i.decision === 'Aprobado' && !i.factura && i.estado === '—')
    .reduce((acc, i) => {
      if (!acc[i.cod]) acc[i.cod] = { cod: i.cod, desc: i.desc, und: i.und, total: 0, porObra: {}, minFecha: i.fecha, tomados: {}, nItems: 0 };
      const g = acc[i.cod];
      g.total += Number(i.cant);
      g.nItems += 1;
      g.porObra[i.proyecto] = (g.porObra[i.proyecto] || 0) + Number(i.cant);
      // Quién dijo que se encarga de comprarlo (migración 50). Va aquí porque
      // este consolidado es donde Lucía decide qué comprar: si el aviso solo
      // estuviera en la tabla de gestión, ella no lo vería a tiempo.
      if (i.tomadoPor) g.tomados[i.tomadoPor] = (g.tomados[i.tomadoPor] || 0) + 1;
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
    {cajasTrabadas.length > 0 && (
      <AlertaCerrable
        id={'caja-trabada:' + cajasTrabadas.map(r => r.id).join(',')}
        resumen={`⛔ Caja chica bloqueada · ${cajasTrabadas.map(r => r.proyecto).join(', ')}`}>
        <div className="text-[11px] font-bold tracking-widest text-red-400 uppercase mb-1">
          ⛔ Caja chica bloqueada · {cajasTrabadas.length} obra(s)</div>
        {cajasTrabadas.map(r => (
          <div key={r.id} className="text-[11px] text-slate-200">
            <b>{r.proyecto}</b> · rendición del {fmt(r.fecha)}: {r.estado === 'Con diferencia'
              ? <>diferencia sin resolver{r.diferencia != null && <> ({r.diferencia < 0 ? 'faltan' : 'sobran'} S/ {Math.abs(r.diferencia).toFixed(2)})</>} — la levanta gerencia</>
              : <>observada por administración — hay que corregirla</>}
          </div>
        ))}
        <div className="text-[10px] text-red-300/80 mt-1">
          No se pueden registrar más compras en efectivo de esa obra hasta que se resuelva. Las compras con factura a crédito o transferencia siguen normales.</div>
      </AlertaCerrable>
    )}
    {!facturarSolo && <PedidoCotizacion user={user} db={db} api={api} />}
    {/* el comprador también negocia en el mostrador: necesita el histórico de precios */}
    <HistorialPrecios db={db} />
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
                      <div className="font-mono text-[10px] text-slate-500">{g.cod}</div>
                      {mejorPrecio2m[g.cod] && (
                        <div className="text-[10px] text-sky-400 mt-1" title="Precio más bajo al que se compró en los últimos 2 meses. Úsalo para negociar.">
                          ▼ Más barato 2 meses: <b>S/ {mejorPrecio2m[g.cod].precio.toFixed(2)}</b> · {mejorPrecio2m[g.cod].prov}</div>
                      )}</td>
                    <td className="py-2 px-1.5 font-mono font-bold text-yellow-400">{g.total} {g.und}</td>
                    <td className="py-2 px-1.5 text-slate-300 text-[10px]">
                      {Object.entries(g.porObra).map(([o, c]) => `${o}: ${c}`).join(' · ')}
                      {Object.keys(g.porObra).length > 1 && <span className="ml-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-green-950 text-green-400">consolidable</span>}
                      {/* Quién se encargó ya de comprarlo. Avisa, no bloquea: si
                          Lucía tiene motivo para comprarlo igual, puede. */}
                      {Object.keys(g.tomados).length > 0 && (
                        <div className="text-[10px] text-sky-400 mt-1">
                          ✋ {Object.entries(g.tomados).map(([quien, n]) =>
                            `${quien.split(' ')[0]} se encarga${n < g.nItems ? ` de ${n} de ${g.nItems} pedidos` : ''}`).join(' · ')}
                        </div>
                      )}</td>
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
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">
          {facturarSolo ? 'Lo que compraste · registra aquí su factura' : 'Gestión de compras · aprobación, estado y seguimiento'}</div>
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
              // Las tres formas de no tener número de factura al registrarla:
              // compromiso de crédito (serie CRED-), ya pagada con la factura
              // por llegar (serie PEND-), o la serie de verdad. Faltaba
              // `pendiente`, y como al marcarlo el campo de serie desaparece,
              // el botón se quedaba gris para siempre y sin explicar por qué.
              const factOk = ff && (ff.compromiso || ff.pendiente || ff.serie.trim())
                && ff.prov.trim() && /^\d{11}$/.test(ff.ruc) && ff.fecha && Number(ff.monto) > 0
                // Ya pagada por banco: el servidor exige banco y N° de operación
                && (!ff.pendiente || ff.efectivo || ((ff.banco || '').trim() && (ff.numOp || '').trim()))
                && cubiertosFF.every(x => Number(ff.precios[x.id]) > 0) && cuadra;
              // Solo ítems SIN factura: uno que ya tiene la suya haría fallar
              // toda la transacción (un ítem pertenece a una sola factura).
              const candidatosExtra = enFact ? flatBase.filter(x =>
                x.id !== i.id && x.proyecto === i.proyecto && x.decision === 'Aprobado' && !x.factura) : [];
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
                  <td className="py-2 px-1.5 text-slate-400 whitespace-nowrap">{i.residente}
                    {i.tipoRq === 'Cotizacion' && <div className="text-[8px] font-bold uppercase text-amber-400">Cotización · {i.cotizacionRef}</div>}</td>
                  <td className="py-2 px-1.5 text-slate-200">{i.desc} <span className="text-slate-500">({i.und})</span>
                    {i.just && <div className="text-yellow-400 text-[10px] mt-1">Motivo: {i.just}</div>}
                    {mejorPrecio2m[i.cod] && (
                      <div className="text-[10px] text-sky-400 mt-1"
                        title="El precio más bajo al que se compró este material en los últimos 2 meses. Úsalo para negociar.">
                        ▼ Más barato 2 meses: <b>S/ {mejorPrecio2m[i.cod].precio.toFixed(2)}</b> · {mejorPrecio2m[i.cod].prov} ({fmt(mejorPrecio2m[i.cod].fecha)})
                      </div>
                    )}</td>
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
                          ? (parcial[i.id] ? (
                              <div className="p-2 bg-slate-950 border border-orange-800 rounded w-56">
                                <div className="text-[9px] font-bold uppercase text-orange-400 mb-1">Compra parcial · pedido: {i.cant}</div>
                                <input type="number" min="1" step="any" value={parcial[i.id].cant}
                                  onChange={e => setParcial({ ...parcial, [i.id]: { ...parcial[i.id], cant: e.target.value } })}
                                  placeholder={`¿Cuánto se consiguió? (menos de ${i.cant})`} className={`w-full mb-1 ${inputCls}`} />
                                <input value={parcial[i.id].motivo}
                                  onChange={e => setParcial({ ...parcial, [i.id]: { ...parcial[i.id], motivo: e.target.value } })}
                                  placeholder="¿Por qué no había todo?" className={`w-full mb-1 ${inputCls}`} />
                                {esCompras && (
                                  <label className="flex items-start gap-1 text-[9px] text-slate-300 mb-1 cursor-pointer">
                                    <input type="checkbox" checked={!!parcial[i.id].cerrar}
                                      onChange={e => setParcial({ ...parcial, [i.id]: { ...parcial[i.id], cerrar: e.target.checked } })} />
                                    <span>Lo que falta ya no se va a comprar</span>
                                  </label>
                                )}
                                <div className="flex gap-1">
                                  <button onClick={() => registrarParcial(i)}
                                    disabled={!(Number(parcial[i.id].cant) > 0 && Number(parcial[i.id].cant) < Number(i.cant) && parcial[i.id].motivo.trim())}
                                    className={btnOk(Number(parcial[i.id].cant) > 0 && Number(parcial[i.id].cant) < Number(i.cant) && !!parcial[i.id].motivo.trim())}>Registrar</button>
                                  <button onClick={() => { const p2 = { ...parcial }; delete p2[i.id]; setParcial(p2); }}
                                    className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-400">Cancelar</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {/* Quién se encargó de comprarlo (migración 50). No bloquea:
                                    avisa. Un candado que solo abre quien lo puso traba el
                                    trabajo el día que esa persona no viene. */}
                                {i.tomadoPor
                                  ? <button onClick={() => tomar(i, false)}
                                      className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-sky-950 text-sky-300 border border-sky-800"
                                      title="Alguien dijo que se encarga de comprarlo hoy. Pulsa para soltarlo.">✋ Lo compra {i.tomadoPor.split(' ')[0]}</button>
                                  : <button onClick={() => tomar(i, true)}
                                      className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-sky-400 border border-slate-700 hover:border-sky-400"
                                      title="Avisa al resto de que tú te encargas de comprarlo hoy. Caduca solo mañana.">Me encargo</button>}
                                <button onClick={() => updItem(i, { estado: 'Comprado' }, `Ítem "${i.desc}" marcado como Comprado. Ahora lo ve todo el equipo; el almacén lo cerrará al recibir.`)}
                                  className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-green-400 border border-slate-700 hover:border-green-400"
                                  title={i.tomadoPor ? `Ojo: ${i.tomadoPor} dijo que se encargaba. Puedes comprarlo igual.` : 'Marca este ítem como comprado o recogido. Cambia el estado para todos.'}>
                                  {i.tomadoPor ? '✓ Comprar igual' : '✓ Comprado'}</button>
                                <button onClick={() => setParcial({ ...parcial, [i.id]: { cant: '', motivo: '', cerrar: false } })}
                                  className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-orange-400 border border-slate-700 hover:border-orange-400"
                                  title="Si el proveedor no tenía todo: se registra lo conseguido y el saldo vuelve a la cola de compras.">Compra parcial</button>
                              </div>
                            ))
                          : <span className="text-slate-500 text-[10px]">Por comprar</span>
                      ) : (
                        <div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${pillEstado(i.estado)}`}
                            title="Comprado lo marca Compras o el comprador; Entregado e Incompleto los fija el almacén al recibir.">{i.estado}</span>
                          {i.estado === 'Comprado' && i.compradoPor && <div className="text-[9px] text-slate-500 mt-0.5">por {i.compradoPor}</div>}
                          {esTriage.sinFactura48(i) && (
                            <div className="text-[9px] text-red-400 font-bold mt-0.5"
                              title="Comprado hace más de 48 h y todavía sin factura: no ha entrado a Pagos.">
                              ⚠ {dias(HOY_ISO, i.fechaCompra || i.fechaRQ)}d sin factura</div>
                          )}
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
                          {/* Excluyentes: o el proveedor da crédito, o ya pagaste.
                              Marcar las dos hacía que el servidor rechazara la
                              factura con un mensaje que no explicaba el porqué. */}
                          {!ff.efectivo && !ff.pendiente && (
                            <label className="flex items-start gap-1.5 mb-1.5 cursor-pointer text-[10px] text-slate-300">
                              <input type="checkbox" checked={!!ff.compromiso} onChange={e => setFF(i.id, 'compromiso', e.target.checked)} className="mt-0.5" />
                              <span><b>SIN factura aún</b>: el proveedor da crédito y emite la factura recién al pagar (compromiso)</span>
                            </label>
                          )}
                          {!ff.compromiso && (
                            <label className="flex items-start gap-1.5 mb-1.5 cursor-pointer text-[10px] text-slate-300">
                              <input type="checkbox" checked={!!ff.pendiente} onChange={e => setFF(i.id, 'pendiente', e.target.checked)} className="mt-0.5" />
                              <span><b>YA PAGUÉ, aún no me dan la factura</b>: la entregan mañana o pasado. No es crédito — el dinero ya salió.</span>
                            </label>
                          )}
                          {ff.compromiso ? (
                            <div className="mb-1 px-2 py-1.5 rounded border border-yellow-700 bg-yellow-950 text-[9px] text-yellow-400">
                              Serie interna CRED-… asignada por el sistema. La serie real la digita Pagos al pagar, con la factura en mano.</div>
                          ) : ff.pendiente ? (
                            <div className="mb-1 px-2 py-1.5 rounded border border-sky-700 bg-sky-950 text-[9px] text-sky-300">
                              Serie interna PEND-… asignada por el sistema. La compra queda PAGADA y el material entra igual; administración digita la serie real cuando llegue el documento.</div>
                          ) : (
                            <input value={ff.serie} onChange={e => setFF(i.id, 'serie', e.target.value)} onKeyDown={enterSiguiente}
                              placeholder="N° factura: F001-000123" className={`w-full mb-1 ${pendCls(!!ff.serie.trim())} font-mono`} />
                          )}
                          <input list={`fprov-${i.id}`} value={ff.prov} onChange={e => setFF(i.id, 'prov', e.target.value)} onKeyDown={enterSiguiente}
                            disabled={!ff.compromiso && !ff.pendiente && !ff.serie.trim()} placeholder="Proveedor (razón social)"
                            className={`w-full mb-1 ${pendCls(!!ff.prov.trim())} ${!ff.compromiso && !ff.pendiente && !ff.serie.trim() ? 'opacity-60 cursor-not-allowed' : ''}`} />
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
                            <select value={esCredito(ff.forma) ? ff.forma : 'Crédito 30 días'} onChange={e => setFF(i.id, 'forma', e.target.value)}
                              onKeyDown={enterSiguiente} className={`w-full mb-1 ${inputCls}`}>
                              {PLAZOS_CREDITO.map(x => <option key={x}>{x}</option>)}</select>
                          ) : !ff.efectivo && !ff.pendiente && (
                            <select value={ff.forma} onChange={e => setFF(i.id, 'forma', e.target.value)} onKeyDown={enterSiguiente} className={`w-full mb-1 ${inputCls}`}>
                              {FORMAS_PAGO.map(x => <option key={x}>{x}</option>)}</select>
                          )}
                          {/* La caja chica es de Frank: a Lucía no se le entrega efectivo.
                              Si marcara esta casilla, el sistema le abriría una rendición
                              del día a su nombre que nadie va a cerrar. */}
                          {!ff.compromiso && !esCompras && (
                          <label className="flex items-start gap-1.5 mb-1 cursor-pointer text-[10px] text-slate-300">
                            <input type="checkbox" checked={!!ff.efectivo} onChange={e => setFF(i.id, 'efectivo', e.target.checked)} className="mt-0.5" />
                            <span>Ya pagada en <b>EFECTIVO</b> (caja chica de hoy) — queda Pagada y entra a la rendición del día</span>
                          </label>
                          )}
                          {ff.pendiente && !ff.efectivo && (
                            <div className="mb-1.5 px-2 py-1.5 rounded border border-slate-700 bg-slate-950">
                              <div className="text-[9px] font-bold uppercase text-slate-400 mb-1">¿Cómo pagaste?</div>
                              <div className="flex gap-1 flex-wrap">
                                <select value={ff.medio} onChange={e => setFF(i.id, 'medio', e.target.value)} className={`${inputCls} w-28`}>
                                  {['Transferencia', 'Cheque', 'Tarjeta'].map(m => <option key={m}>{m}</option>)}
                                </select>
                                <input value={ff.banco} onChange={e => setFF(i.id, 'banco', e.target.value)}
                                  placeholder="Banco" className={`${pendCls(!!(ff.banco || '').trim())} w-24`} />
                                <input value={ff.numOp} onChange={e => setFF(i.id, 'numOp', e.target.value)}
                                  placeholder="N° operación" className={`${pendCls(!!(ff.numOp || '').trim())} font-mono flex-1`} style={{ minWidth: '110px' }} />
                              </div>
                            </div>
                          )}
                          {candidatosExtra.length > 0 && (
                            <div className="mb-1.5 border-t border-slate-700 pt-1.5">
                              <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">¿Esta factura cubre otros ítems? ({i.proyecto})</div>
                              {(() => {
                                const q = (buscaExtra[i.id] || '').trim().toLowerCase();
                                // los ya marcados quedan siempre visibles, aunque no coincidan con la búsqueda
                                const vis = candidatosExtra.filter(x => ff.extras.includes(x.id) || !q
                                  || `${x.desc} rq-${String(x.rq).padStart(3, '0')} ${x.rq} ${x.cod}`.toLowerCase().includes(q));
                                return (
                                  <>
                                    {candidatosExtra.length > 4 && (
                                      <input value={buscaExtra[i.id] || ''} onChange={e => setBuscaExtra({ ...buscaExtra, [i.id]: e.target.value })}
                                        placeholder={`Buscar entre ${candidatosExtra.length} ítems…`} className={`w-full ${inputCls} mb-1`} />
                                    )}
                                    <div className="max-h-24 overflow-y-auto">
                                      {vis.length === 0 ? (
                                        <div className="text-[9px] text-slate-500">Sin coincidencias.</div>
                                      ) : vis.map(x => (
                                        <label key={x.id} className="flex items-start gap-1.5 text-[10px] text-slate-300 mb-1 cursor-pointer">
                                          <input type="checkbox" checked={ff.extras.includes(x.id)} onChange={() => toggleExtra(i.id, x.id)} className="mt-0.5" />
                                          <span>RQ-{String(x.rq).padStart(3, '0')} · {x.desc}</span>
                                        </label>
                                      ))}
                                    </div>
                                    {q && <div className="text-[9px] text-slate-500">{vis.length} de {candidatosExtra.length} · {ff.extras.length} marcado(s)</div>}
                                  </>
                                );
                              })()}
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
                  <td className="py-2 px-1.5">{post ? <span className="text-slate-400" title="La fija el almacén al registrar la recepción del primer lote; no se edita a mano.">{i.fechaEntrega ? fmt(i.fechaEntrega) : '—'}</span> : <span className="text-slate-600">—</span>}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-300">{llego !== null ? llego + 'd' : '—'}</td>
                  <td className={`py-2 px-1.5 font-mono ${holg === null ? 'text-slate-500' : holg < 0 ? 'text-red-400' : 'text-green-400'}`}>{holg !== null ? holg + 'd' : '—'}</td>
                  <td className="py-2 px-1.5">{inc && !facturarSolo ? <FechaInput value={i.fechaRecojoSaldo} onChange={e => updItem(i, { fecha_recojo_saldo: e.target.value || null })} className={`w-32 ${inputCls}`} /> : <span className="text-slate-600">{inc ? fmt(i.fechaRecojoSaldo) : '—'}</span>}</td>
                  <td className="py-2 px-1.5"><span className="text-slate-600" title="La fija el almacén al recibir el saldo; no se edita a mano.">{inc ? fmt(i.fechaEntregaSaldo) : '—'}</span></td>
                  <td className="py-2 px-1.5 font-mono text-slate-300">{saldoDias !== null ? saldoDias + 'd' : '—'}</td>
                  <td className="py-2 px-1.5">{inc && !facturarSolo ? (
                    <select value={i.comunicoResidente} onChange={e => updItem(i, { comunico_residente: e.target.value === 'Sí' ? true : e.target.value === 'No' ? false : null })} className={inputCls}>
                      {['—', 'Sí', 'No'].map(x => <option key={x}>{x}</option>)}</select>) : <span className="text-slate-600">{inc ? i.comunicoResidente : '—'}</span>}</td>
                  <td className="py-2 px-1.5">{inc && !facturarSolo ? <input defaultValue={i.destinoSaldo} onBlur={e => { if (e.target.value !== i.destinoSaldo) updItem(i, { destino_saldo: e.target.value || null }); }} placeholder="Almacén de obra…" className={`w-32 ${inputCls}`} /> : <span className="text-slate-600">{inc ? (i.destinoSaldo || '—') : '—'}</span>}</td>
                  <td className="py-2 px-1.5">
                    {!facturarSolo && !i._arch && (
                      Number(i.cantRecibida) > 0 ? (
                        <div className="w-44">
                          <span className="text-[9px] text-slate-500 leading-tight block"
                            title="El material ya está en la obra: anularlo descuadraría el stock. Si hay que devolverlo, es una devolución al proveedor.">
                            Ya recibido ({i.cantRecibida} {i.und}) — no se anula</span>
                          {/* Rastro de las correcciones de cantidad del almacén (migración 35) */}
                          {(i.correcciones || []).map((x, k) => (
                            <div key={k} className="text-[9px] text-yellow-500 leading-tight mt-1">
                              Corregido de {x.de} a {x.a}: {x.motivo} ({x.por}, {fmt(x.fecha)})</div>
                          ))}
                        </div>
                      ) : i.anulSolMotivo ? (
                        <div className="w-44">
                          <div className="text-[9px] font-bold uppercase text-orange-400">Anulación en gerencia</div>
                          <div className="text-[9px] text-slate-500 leading-tight">{i.anulSolMotivo} · pidió {i.anulSolPor}</div>
                          {esGerente && (
                            <div className="mt-1">
                              <button onClick={() => aprobarAnulacion(i)}
                                className="w-full px-2 py-1 rounded text-[9px] font-bold uppercase bg-red-950 text-red-400 border border-red-800 hover:bg-red-900">Confirmar anulación</button>
                              <AnularBox label="Rechazar la anulación" onConfirm={m => rechazarAnulacion(i, m)} />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          {i.anulRechMotivo && (
                            <div className="text-[9px] text-yellow-400 leading-tight mb-1">
                              Gerencia rechazó anular: {i.anulRechMotivo} ({i.anulRechPor})</div>
                          )}
                          <AnularBox label={esGerente ? 'Anular' : 'Solicitar anulación'} onConfirm={m => solicitarAnulacion(i, m)} />
                        </div>
                      )
                    )}
                  </td>
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
          {facturarSolo ? 'Facturas que registraste' : `Facturas ${verPagadas ? 'registradas' : 'por pagar'}`} · {factMostradas.length}</div>
        <button onClick={() => setVerPagadas(v => !v)}
          className={`ml-auto px-2.5 py-1 rounded text-[9px] font-bold uppercase border ${verPagadas ? 'border-yellow-400 text-yellow-400 bg-slate-800' : 'border-slate-700 text-slate-400 bg-slate-800 hover:border-slate-500'}`}>
          {verPagadas ? '✕ Solo pendientes' : `Ver pagadas · ${factPagadas.length}`}</button>
      </div>
      {factMostradas.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-sm">{verPagadas ? 'Sin facturas registradas.' : 'Sin facturas por pagar. ✓ Todo al día con Pagos.'}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr>{['N° Factura', 'Fecha', 'Proveedor', 'RUC', 'Proyecto', 'Ítems que cubre', 'Monto S/', 'Forma de pago', 'Pago', 'Registró', ...(esGerente ? ['Anular'] : [])].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>
              {factMostradas.map(f => (
                <tr key={f.n} className={`border-b border-slate-800 align-top ${f.anulMotivo ? 'opacity-60 line-through' : ''}`}>
                  <td className="py-2 px-1.5 font-mono text-slate-200">{f.serie}
                    {f.tipoDoc === 'Compromiso' && <div className="text-[8px] font-bold uppercase text-yellow-400">Sin factura · la emite al pagar</div>}
                    {f.tipoDoc === 'Pendiente' && <div className="text-[8px] font-bold uppercase text-sky-400">Pagada · factura por llegar</div>}
                    {f.anulMotivo && <div className="text-[8px] text-red-400 no-underline">Anulada: {f.anulMotivo} ({f.anulPor})</div>}</td>
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
                  {esGerente && (
                    <td className="py-2 px-1.5 no-underline">
                      {f.anulMotivo
                        ? <span className="text-[9px] text-slate-600">anulada</span>
                        : <AnularBox label="Anular factura" onConfirm={m => anularFact(f, m)} />}
                    </td>
                  )}
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

// Bandeja del RESIDENTE: aprueba/rechaza salidas de su obra y su lado de los préstamos.
// Vista del COMPRADOR (Frank): su lista de trabajo del día.
// Prioriza urgentes y fechas necesitadas; consolida el mismo material
// entre obras y le dice cuántas facturas pedir.
function Tablero({ db, user }) {
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

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = verificando
  const [user, setUser] = useState(null);            // perfil de la tabla usuarios
  const [perfilError, setPerfilError] = useState('');
  const [db, setDb] = useState(null);
  const [cargaError, setCargaError] = useState('');
  const [tab, setTab] = useState('tab');
  const dbRef = useRef(null);
  const estaticosRef = useRef(null);   // cache de tablas casi-estáticas (catálogo, maestros)
  const dinamicosRef = useRef(null);   // último crudo de las transaccionales, para refrescar solo lo que cambió
  // Hasta qué momento tenemos cada tabla al día (migración 44). Con esto el
  // refresco pide "lo cambiado desde entonces" en vez de bajarlo todo otra vez.
  const sincroRef = useRef({});
  // Contador de generacion: si dos cargas se solapan (el refresco de 40 s y el
  // de un clic), la que empezo antes NO puede pisar a la que empezo despues.
  const epocaRef = useRef(0);

  useEffect(() => {
    // Supabase entrega un objeto NUEVO en cada evento (refresco de token,
    // foco de ventana…). Si lo guardamos tal cual, el efecto de arranque
    // se vuelve a ejecutar y le resetea la pestaña al usuario en plena
    // faena. Solo cambiamos de sesión cuando cambia la persona.
    const mismo = (a, b) => (a && a.user && a.user.id) === (b && b.user && b.user.id);
    supabase.auth.getSession().then(({ data }) => setSession(s => (mismo(s, data.session) ? s : data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => setSession(p => (mismo(p, s) ? p : s)));
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

  const cargarTodo = useCallback(async (soloDinamicos = false, soloTablas = null) => {
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
    // Transaccional. Tras una acción solo se vuelven a traer las tablas que
    // esa acción pudo tocar; el resto sale de la caché. Antes cada clic
    // rebajaba las 10 tablas enteras (~840 KB) y por eso se sentía lento.
    // Tabla, orden, y si admite carga INCREMENTAL (migración 44).
    // Incremental = "dame solo lo que cambió desde la última vez". Solo vale
    // para tablas de las que NUNCA se borran filas: una fila borrada no puede
    // llegar como cambio, el navegador no se enteraría jamás. Por eso
    // factura_items (anular una factura borra sus líneas), stock_inicial y
    // cajas_chicas (clave compuesta, sin `id`) y alertas_levantadas (se borran
    // al reabrirlas) se siguen trayendo enteras. Pesan poco.
    const DIN = [
      ['rqs',                  ['numero'],                   true],
      ['rq_items',             ['creado_en', 'id'],          true],
      ['facturas',             ['numero'],                   true],
      ['factura_items',        ['factura_id', 'rq_item_id'], false],
      ['salidas',              ['numero'],                   true],
      ['prestamos',            ['numero'],                   true],
      ['solicitudes_material', ['numero'],                   true],
      ['stock_inicial',        ['proyecto', 'codigo'],       false],
      ['cajas_chicas',         ['proyecto'],                 false],
      ['rendiciones',          ['numero'],                   true],
      ['entregas_caja',        ['numero'],                   true],
      ['alertas_levantadas',   [],                           false],
    ];
    const crearQ = (tabla, orden, desde) => () => {
      let q = supabase.from(tabla).select('*');
      if (desde) q = q.gt('actualizado_en', desde);
      orden.forEach(o => { q = q.order(o); });
      return q;
    };
    // Mezcla lo que llegó con lo que ya había, por id. Las filas que no
    // cambiaron se quedan donde estaban; las nuevas van al final.
    const mezclar = (previo, filas) => {
      if (!previo || !previo.data) return { data: filas };
      if (!filas.length) return previo;
      const porId = new Map(previo.data.map(r => [r.id, r]));
      filas.forEach(r => porId.set(r.id, r));
      return { data: [...porId.values()] };
    };
    const epoca = ++epocaRef.current;
    const cache = dinamicosRef.current;
    const marcas = sincroRef.current;
    // Las marcas nuevas se acumulan aparte y solo se publican si esta carga
    // gana. Si se movieran aqui, una carga que acaba descartandose dejaria la
    // marca adelantada y esas filas no se volverian a pedir NUNCA.
    const marcasNuevas = {};
    const qDin = DIN.map(([nombre, orden, incremental]) => {
      if (soloTablas && cache && !soloTablas.includes(nombre)) return Promise.resolve(cache[nombre]);
      // Solo se pide "lo cambiado" si ya tenemos la foto completa de antes.
      const desde = incremental && cache && cache[nombre] && cache[nombre].data ? marcas[nombre] : null;
      return fetchAll(crearQ(nombre, orden, desde)).then(r => {
        if (r.error) return r;
        // La marca de agua se retrasa 2 segundos a propósito: si dos escrituras
        // caen en el mismo instante, preferimos repetir una fila (la mezcla la
        // ignora) antes que perderla para siempre.
        const max = r.data.reduce((m, f) => (f.actualizado_en > m ? f.actualizado_en : m), '');
        if (max) marcasNuevas[nombre] = new Date(Date.parse(max) - 2000).toISOString();
        return desde ? mezclar(cache[nombre], r.data) : r;
      });
    });
    // Casi-estático: catálogo + maestros. Se trae una vez (o en refresco completo);
    // el auto-refresco reusa la caché para no volver a bajar los 1,740 materiales.
    const usarCache = soloDinamicos && estaticosRef.current;
    const qEst = usarCache ? [] : [
      // Columnas explícitas, no select('*'): así una columna nueva y sensible
      // no viaja sola al navegador de los 7 roles sin que nadie se entere.
      fetchAll(() => supabase.from('proyectos').select('codigo,nombre,activo').order('codigo')),
      fetchAll(() => supabase.from('usuarios').select('id,nombre,rol,proyecto_asignado,activo').order('id')),
      fetchAll(() => supabase.from('materiales').select('*').eq('activo', true).order('codigo')),
      fetchAll(() => supabase.from('proveedores').select('*').order('razon_social').order('ruc')),
      fetchAll(() => supabase.from('familias').select('*').order('iu')),
      // Cuentas bancarias por obra (migración 32). La tabla está cerrada a
      // gerencia y pagos: a los demás roles les devuelve 0 filas, sin error.
      fetchAll(() => supabase.from('proyectos_banco').select('codigo,banco,nro_cuenta')),
    ];
    const [dinR, estR] = await Promise.all([Promise.all(qDin), Promise.all(qEst)]);
    // Otra carga empezo mientras esta viajaba: la nuestra esta vieja y pisarla
    // perderia lo que trajo la otra. Se descarta entera, marcas incluidas.
    if (epoca !== epocaRef.current) return null;
    // guardar el crudo para poder refrescar solo una tabla la próxima vez
    dinamicosRef.current = Object.fromEntries(DIN.map(([n], k) => [n, dinR[k]]));
    Object.assign(marcas, marcasNuevas);
    const [rqsR, itemR, factR, fitR, salR, preR, solR, siR, cajR, renR, entR, alvR] = dinR;
    let prjR, usrR, matR, provR, famR, pbR;
    if (usarCache) {
      ({ prjR, usrR, matR, provR, famR, pbR } = estaticosRef.current);
    } else {
      [prjR, usrR, matR, provR, famR, pbR] = estR;
      // Si la consulta de bancos falló, NO se cachea nada: un error guardado
      // aquí se queda pegado para siempre y Pagos no podría pagar hasta
      // recargar la página entera. Sin caché, el siguiente ciclo reintenta.
      if (!(pbR && pbR.error)) estaticosRef.current = { prjR, usrR, matR, provR, famR, pbR };
    }
    // pbR queda FUERA de conError a propósito: si la migración 32 no estuviera
    // corrida, o Supabase aún no hubiera recargado su esquema, lo peor que pasa
    // es que Pagos vea el banco vacío — no que los 7 roles vean pantalla de error.
    const conError = [prjR, usrR, matR, provR, rqsR, itemR, factR, fitR, salR, preR, solR, famR, siR, cajR, renR].find(r => r.error);
    if (conError) { setCargaError(conError.error.message); return null; }

    const prj = prjR.data, usrs = usrR.data, mats = matR.data, provs = provR.data, fams = famR.data;
    const famMap = {}; fams.forEach(f => { famMap[f.iu] = f.nombre; });
    const nomProy = {}, codProy = {}, bancoDe = {};
    prj.forEach(p => { nomProy[p.codigo] = p.nombre; codProy[p.nombre] = p.codigo; });
    // bancoDe se indexa por NOMBRE de obra, que es como lo consultan Pagos,
    // Rendiciones y Auditoría. Para los roles que no pueden leer la tabla
    // queda vacío, y todos los accesos ya usan (bancoDe[x] || {}).
    ((pbR || {}).data || []).forEach(b => {
      const n = nomProy[b.codigo];
      if (n) bancoDe[n] = { banco: b.banco || '', cuenta: b.nro_cuenta || '' };
    });
    // ÚNICO cambio de texto deliberado de la mudanza (etapa 5): un import es
    // de solo lectura, así que ya no se asigna aquí — se arma en locales con
    // LAS MISMAS expresiones de antes y se publica con setMaestros.
    const proy2 = prj.filter(p => p.activo).map(p => [p.codigo, p.nombre]);
    const alm2 = {};
    usrs.filter(u => u.rol === 'almacen' && u.activo && u.proyecto_asignado).forEach(u => { alm2[nomProy[u.proyecto_asignado]] = u.nombre; });
    setMaestros(proy2, alm2);

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
    // Historial de precios por material: todas las compras con proveedor y fecha.
    // Es la herramienta de negociación de Compras (backlog 4).
    const historialPrecios = {};
    fitR.data.forEach(fi => {
      if (fi.precio_unitario == null) return;
      const it = itemById[fi.rq_item_id]; if (!it) return;
      const fx = factMap[fi.factura_id]; if (!fx) return;
      (historialPrecios[it.codigo] = historialPrecios[it.codigo] || []).push({
        precio: Number(fi.precio_unitario), cant: Number(it.cant), fecha: fx.fecha,
        serie: fx.serie, proyecto: nomProy[fx.proyecto] || fx.proyecto,
        ruc: fx.proveedor_ruc,
        prov: provMap[fx.proveedor_ruc] ? provMap[fx.proveedor_ruc].razon_social : fx.proveedor_ruc,
      });
    });
    // de la compra más reciente a la más antigua
    Object.values(historialPrecios).forEach(l => l.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)));

    // Mejor precio de cada material en los ÚLTIMOS 2 MESES: el piso al que
    // ya se compró, para negociar con el proveedor sin cotizar de nuevo.
    const hace2meses = (() => {
      const d = new Date(HOY_ISO + 'T00:00:00Z');
      d.setUTCMonth(d.getUTCMonth() - 2);
      return d.toISOString().slice(0, 10);
    })();
    const mejorPrecio2m = {};
    Object.entries(historialPrecios).forEach(([cod, compras]) => {
      const recientes = compras.filter(c => c.fecha >= hace2meses);
      if (!recientes.length) return;
      const min = recientes.reduce((a, b) => (b.precio < a.precio ? b : a));
      mejorPrecio2m[cod] = { precio: min.precio, prov: min.prov, fecha: min.fecha, n: recientes.length };
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
        // anulación pedida por Compras, pendiente del visto bueno de gerencia (migración 22)
        anulSolMotivo: r.anulacion_solicitud ? r.anulacion_solicitud.motivo : '',
        anulSolPor: r.anulacion_solicitud ? r.anulacion_solicitud.por : '',
        anulSolFecha: r.anulacion_solicitud ? r.anulacion_solicitud.fecha : '',
        anulRechMotivo: r.anulacion_rechazo ? r.anulacion_rechazo.motivo : '',
        anulRechPor: r.anulacion_rechazo ? r.anulacion_rechazo.por : '',
        pago: pagoDe(factDeItem[r.id]), factura: factDeItem[r.id] ? factDeItem[r.id].serie : null,
        fechaEntrega: r.fecha_entrega || '', fechaRecojoSaldo: r.fecha_recojo_saldo || '', fechaEntregaSaldo: r.fecha_entrega_saldo || '',
        comunicoResidente: r.comunico_residente === true ? 'Sí' : r.comunico_residente === false ? 'No' : '—',
        destinoSaldo: r.destino_saldo || '', cantRecibida: Number(r.cant_recibida || 0), obsAlmacen: r.obs_almacen || '',
        correcciones: Array.isArray(r.correcciones) ? r.correcciones : [],
        fechaCaducidad: r.fecha_caducidad || '',
        compradoPorId: r.comprado_por || null, compradoPor: usrMap[r.comprado_por] ? usrMap[r.comprado_por].nombre : '',
        decididoPor: usrMap[r.decidido_por] ? usrMap[r.decidido_por].nombre : '',
        // "yo me encargo" (migración 50). Solo vale el mismo día: al siguiente
        // vuelve a estar libre sin que nadie tenga que soltarlo.
        // La hora se convierte al reloj de quien mira antes de comparar: la base
        // guarda en UTC y Cusco va 5 horas por detrás, así que a partir de las
        // 19:00 el texto guardado ya lleva la fecha del día siguiente. Leerle el
        // prefijo hacía desaparecer todo lo que Frank tomaba al cerrar su jornada.
        tomadoPor: esDelDia(r.tomado_en, HOY_ISO) && usrMap[r.tomado_por]
          ? usrMap[r.tomado_por].nombre : '',
        tomadoPorId: esDelDia(r.tomado_en, HOY_ISO) ? r.tomado_por : null,
        fechaCompra: r.fecha_compra || '',
        creadoEn: r.creado_en || null, decididoEn: r.decidido_en || null,
      };
      (itemsPorRq[r.rq_id] = itemsPorRq[r.rq_id] || []).push(it);
    });

    const rqs = rqsR.data.map(r => ({
      id: r.id, n: r.numero, proyecto: nomProy[r.proyecto] || r.proyecto, partida: r.partida,
      tipo: r.tipo || 'RQ', cotizacionRef: r.cotizacion_ref || '', arquitecto: r.solicitante_diseno || '',
      residente: r.tipo === 'Cotizacion' ? (r.solicitante_diseno || 'Diseño') : (usrMap[r.residente_id] ? usrMap[r.residente_id].nombre : ''),
      almacen: r.almacen_resp || '',
      piso: r.piso || '', canal: r.canal, just: r.justificacion || '', fechaRQ: r.fecha_rq,
      creadoEn: r.creado_en || null,   // marca real con hora (auditoría y patrón horario)
      creadoPor: usrMap[r.creado_por] ? usrMap[r.creado_por].nombre : '', items: itemsPorRq[r.id] || [],
    }));

    const rqNumDeItem = {}, descDeItem = {};
    rqs.forEach(r => r.items.forEach(i => { rqNumDeItem[i.id] = r.n; descDeItem[i.id] = i.desc; }));

    const facturas = factR.data.map(f => ({
      id: f.id, n: f.numero, serie: f.serie, tipoDoc: f.tipo_doc || 'Factura',
      anulMotivo: f.anulacion ? f.anulacion.motivo : '', anulPor: f.anulacion ? f.anulacion.por : '',
      anulFecha: f.anulacion ? f.anulacion.fecha : '',
      prov: provMap[f.proveedor_ruc] ? provMap[f.proveedor_ruc].razon_social : f.proveedor_ruc,
      ruc: f.proveedor_ruc, fecha: f.fecha, monto: Number(f.monto), forma: f.forma_pago,
      proyecto: nomProy[f.proyecto] || f.proyecto,
      registradoPor: usrMap[f.registrado_por] ? usrMap[f.registrado_por].nombre : '',
      registradoPorId: f.registrado_por || null,
      estadoPago: f.estado_pago || 'Pendiente', banco: f.banco || '', numOp: f.numero_operacion || '',
      medio: f.medio_pago || '', rendicionId: f.rendicion_id || null,
      conciliada: !!f.conciliada, conciliadaPor: usrMap[f.conciliada_por] ? usrMap[f.conciliada_por].nombre : '',
      fechaConciliacion: f.fecha_conciliacion || '',
      fechaPago: f.fecha_pago || '', pagadoPor: usrMap[f.pagado_por] ? usrMap[f.pagado_por].nombre : '',
      items: (itemsDeFactura[f.id] || []).map(id => ({ rq: rqNumDeItem[id], desc: descDeItem[id] })),
    }));

    const cajas = {};
    const tolerancias = {};
    cajR.data.forEach(c => {
      cajas[nomProy[c.proyecto] || c.proyecto] = Number(c.monto_fondo);
      tolerancias[nomProy[c.proyecto] || c.proyecto] = c.tolerancia == null ? 20 : Number(c.tolerancia);
    });
    const rendiciones = renR.data.map(r => ({
      id: r.id, n: r.numero, proyecto: nomProy[r.proyecto] || r.proyecto, fecha: r.fecha,
      responsable: usrMap[r.responsable_id] ? usrMap[r.responsable_id].nombre : '',
      montoFondo: Number(r.monto_fondo), estado: r.estado, observacion: r.observacion || '',
      aprobadoPor: usrMap[r.aprobado_por] ? usrMap[r.aprobado_por].nombre : '',
      fechaAprobacion: r.fecha_aprobacion || '', repOp: r.reposicion_operacion || '',
      repFecha: r.reposicion_fecha || '', repuestoPor: usrMap[r.repuesto_por] ? usrMap[r.repuesto_por].nombre : '',
      // corrección hecha por administración (la ve gerencia, migración 26)
      corrDetalle: r.correccion ? r.correccion.detalle : '', corrPor: r.correccion ? r.correccion.por : '',
      corrFecha: r.correccion ? r.correccion.fecha : '',
      // arqueo de caja (migración 27)
      efectivoContado: r.efectivo_contado == null ? null : Number(r.efectivo_contado),
      diferencia: r.diferencia == null ? null : Number(r.diferencia),
      difMotivo: r.dif_motivo || '',
      difDecision: r.dif_resolucion ? r.dif_resolucion.decision : '',
      difNota: r.dif_resolucion ? r.dif_resolucion.nota : '',
      difPor: r.dif_resolucion ? r.dif_resolucion.por : '',
      difFecha: r.dif_resolucion ? r.dif_resolucion.fecha : '',
    }));

    // Entregas de efectivo del día (migración 38). La caja chica no es un fondo
    // fijo: el disponible de cada jornada es la suma de estas entregas.
    // Queda fuera del control de errores a propósito: si la migración no
    // estuviera corrida, la caja se ve vacía en vez de tumbar toda la app.
    const entregas = (((entR || {}).data) || []).map(e => ({
      id: e.id, n: e.numero, proyecto: nomProy[e.proyecto] || e.proyecto,
      fecha: e.fecha, monto: Number(e.monto), medio: e.medio,
      numOp: e.num_operacion || '',
      entregadoPor: usrMap[e.entregado_por] ? usrMap[e.entregado_por].nombre : '',
      motivoAtraso: e.motivo_atraso || '',
      anulMotivo: e.anulacion ? e.anulacion.motivo : '',
      anulPor: e.anulacion ? e.anulacion.por : '',
      anulFecha: e.anulacion ? e.anulacion.fecha : '',
    }));

    // Alertas de Auditoría que gerencia dio por resueltas (migración 39).
    // Fuera del control de errores, como las entregas: si la migración no
    // estuviera corrida, las alertas se ven todas en vez de romper la app.
    const levantadas = Object.fromEntries((((alvR || {}).data) || []).map(a => [a.clave, {
      nota: a.nota, fecha: a.fecha,
      por: usrMap[a.levantada_por] ? usrMap[a.levantada_por].nombre : '',
    }]));

    const salidas = salR.data.map(s => ({
      id: s.id, n: s.numero, fecha: s.fecha, proyecto: nomProy[s.proyecto] || s.proyecto,
      cod: s.codigo, desc: matMap[s.codigo] ? matMap[s.codigo].descripcion : s.codigo,
      und: undDe(matMap[s.codigo]), cant: Number(s.cant),
      reingresada: Number(s.cant_reingresada || 0),
      reingresoPor: s.reingreso ? s.reingreso.por : '', fechaReingreso: s.reingreso ? s.reingreso.fecha : '',
      aprobacion: s.aprobacion || 'Aprobada',
      aprobadoPor: usrMap[s.aprobado_por] ? usrMap[s.aprobado_por].nombre : '',
      fechaAprobacion: s.fecha_aprobacion || '', motivoRechazo: s.motivo_rechazo || '',
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
      aprobOrigen: p.aprob_origen ? p.aprob_origen.por : '', aprobDestino: p.aprob_destino ? p.aprob_destino.por : '',
      rechazoMotivo: p.rechazo ? p.rechazo.motivo : '', rechazoPor: p.rechazo ? p.rechazo.por : '',
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
      rqs, facturas, salidas, prestamos, solicitudes, stockInicial, cajas, tolerancias, rendiciones, bancoDe, entregas, levantadas,
      catalogo: mats.map(m => [m.codigo, m.descripcion, undDe(m), famMap[m.codigo.slice(0, 2)] || '', m.factor_caja ? Number(m.factor_caja) : null, m.factor_caja ? m.und : null, !!m.perecedero]),
      pereceMap: Object.fromEntries(mats.filter(m => m.perecedero).map(m => [m.codigo, true])),
      precioProm, ultimaCompra, historialPrecios, mejorPrecio2m,
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
    // Cambio de persona (o cierre de sesion): se vacia TODA la memoria. Sin
    // esto, quien entra despues hereda las filas y la marca de agua del
    // anterior: veria datos que no le tocan y le faltaria casi todo lo suyo,
    // porque solo se le pediria "lo cambiado desde la ultima vez del otro".
    dinamicosRef.current = null;
    sincroRef.current = {};
    estaticosRef.current = null;
    if (!session) { setUser(null); setDb(null); return; }
    (async () => {
      const { data: perfil, error } = await supabase.from('usuarios').select('*').eq('id', session.user.id).single();
      if (error || !perfil) {
        setPerfilError('Tu cuenta no tiene perfil asignado en el sistema. Pide a administración que registre tu usuario.');
        return;
      }
      // Desactivado = fuera. mi_rol() y mi_proyecto() filtran por `activo`,
      // así que sin esto la persona entraba, veía TODOS los datos de su obra
      // y solo descubría que no podía guardar al pulsar el botón.
      if (!perfil.activo) {
        setPerfilError('Tu cuenta está desactivada: puedes iniciar sesión pero no registrar ni consultar nada. Pide a administración que la reactive.');
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

  // Auto-refresco: trae los últimos datos cada 40 s (para que las salidas y
  // préstamos por aprobar le aparezcan al residente sin refrescar a mano).
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => { if (!document.hidden) cargarTodo(true); }, 40000);
    return () => clearInterval(t);
  }, [session, cargarTodo]);

  const api = useMemo(() => {
    const cod = nombre => (dbRef.current ? dbRef.current.codProy[nombre] : null) || nombre;
    // tablas: qué pudo tocar esta acción. Solo eso se vuelve a traer;
    // el resto sale de la caché. Sin lista, se refresca todo (por si acaso).
    // maestros: catálogo, proveedores, familias… Se cachean para no bajar los
    // 1,740 materiales en cada refresco, así que hay que invalidar la caché
    // a mano en las pocas acciones que los cambian; si no, quien aprueba un
    // material no lo ve hasta recargar la página.
    const wrap = async (fn, tablas = null, refrescarMaestros = false) => {
      try {
        const r = await fn();
        if (r && r.error) return { error: r.error.message || String(r.error) };
        if (refrescarMaestros) estaticosRef.current = null;
        await cargarTodo(true, tablas);
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
      }, ['rqs', 'rq_items']),
      updItem: (id, patch) => wrap(async () => await supabase.from('rq_items').update(patch).eq('id', id), ['rq_items']),
      // Una sola transacción en la base (migraciones 28/30): proveedor +
      // rendición + factura + líneas. Si algo falla no queda nada a medias.
      registrarFactura: ({ serie, prov, ruc, fecha, monto, forma, proyecto,
                           efectivo, compromiso, pendiente, medio, banco, numOp, lineas }) => wrap(async () => {
        const { error } = await supabase.rpc('registrar_factura', {
          p_serie: serie, p_ruc: ruc, p_prov: prov, p_fecha: fecha, p_monto: monto,
          p_forma: forma, p_proyecto: cod(proyecto),
          p_compromiso: !!compromiso, p_efectivo: !!efectivo, p_pendiente: !!pendiente,
          p_medio: medio || null, p_banco: banco || null, p_num_op: numOp || null,
          p_lineas: lineas.map(l => ({ item: l.id, precio: l.precio })),
        });
        if (error) {
          const m = error.message || '';
          if (m.includes('uq_factura') || error.code === '23505') {
            return { error: { message: `La factura ${serie} de ese RUC ya está registrada.` } };
          }
          return { error: { message: m.replace(/^.*?:\s*/, '') } };
        }
        return {};
        // refrescarMaestros: el RPC da de alta al proveedor si es nuevo,
        // y si no se invalida la caché no aparece en la lista hasta recargar.
      }, ['facturas', 'factura_items', 'rendiciones'], true),
      // Llega el documento físico: administración digita la serie real
      completarSerie: (id, serieReal) => wrap(async () => {
        const r = await supabase.from('facturas')
          .update({ serie: serieReal.trim().toUpperCase(), tipo_doc: 'Factura' }).eq('id', id);
        if (r.error && r.error.code === '23505') {
          return { error: { message: `La factura ${serieReal} de ese RUC ya está registrada. Verifica la serie.` } };
        }
        return r;
      }, ['facturas']),
      anularFactura: (id, motivo) => wrap(async () =>
        await supabase.rpc('anular_factura', { p_id: id, p_motivo: motivo }), ['facturas', 'factura_items']),
      pagarFactura: (id, { medio, banco, op, fecha, serieReal }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        const r = await supabase.from('facturas').update({
          estado_pago: 'Pagada', medio_pago: medio, banco, numero_operacion: op,
          fecha_pago: fecha, pagado_por: u.id,
          // compromiso → factura real: la serie llega con el comprobante al pagar
          ...(serieReal ? { serie: serieReal.trim().toUpperCase(), tipo_doc: 'Factura' } : {}),
        }).eq('id', id);
        if (r.error && r.error.code === '23505') return { error: { message: `La factura  de ese RUC ya está registrada. Verifica la serie.` } };
        return r;
      }, ['facturas']),
      resolverRendicion: (id, { estado, observacion }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('rendiciones').update({
          estado, observacion: observacion || null, aprobado_por: u.id, fecha_aprobacion: HOY_ISO,
        }).eq('id', id);
      }, ["rendiciones"]),
      // Arqueo: cierra la rendición con el efectivo contado. Si la diferencia
      // supera la tolerancia de la obra, queda "Con diferencia" para gerencia.
      cerrarConArqueo: (id, { contado, diferencia, excede, motivo, nombre }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        const patch = {
          efectivo_contado: contado, diferencia,
          dif_motivo: motivo || null,
          estado: excede ? 'Con diferencia' : 'Aprobada',
        };
        if (!excede) { patch.aprobado_por = u.id; patch.fecha_aprobacion = HOY_ISO; }
        return await supabase.from('rendiciones').update(patch).eq('id', id);
      }, ["rendiciones"]),
      // Gerencia resuelve la diferencia: recién ahí Pagos puede reponer
      resolverDiferencia: (id, { decision, nota, nombre }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('rendiciones').update({
          estado: 'Aprobada', aprobado_por: u.id, fecha_aprobacion: HOY_ISO,
          dif_resolucion: { decision, nota: nota || null, por: nombre, fecha: HOY_ISO },
        }).eq('id', id);
      }, ["rendiciones"]),
      // Administración corrige una rendición observada: queda aprobada con rastro
      corregirRendicion: (id, { detalle, nombre }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('rendiciones').update({
          estado: 'Aprobada', aprobado_por: u.id, fecha_aprobacion: HOY_ISO,
          correccion: { detalle, por: nombre, fecha: HOY_ISO },
        }).eq('id', id);
      }, ['rendiciones']),
      // Entregas de efectivo al comprador (migración 38). Quién entregó lo
      // estampa la base; aquí solo va lo que se digita.
      // Levantar una alerta de Auditoría: gerencia la da por resuelta, con nota.
      // Quién y cuándo los pone la base.
      levantarAlerta: ({ clave, tipo, detalle, nota }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('alertas_levantadas').insert({
          clave, tipo, detalle, nota: nota.trim(), levantada_por: u.id,
        });
      }, ['alertas_levantadas']),
      reabrirAlerta: clave => wrap(async () =>
        await supabase.from('alertas_levantadas').delete().eq('clave', clave),
        ['alertas_levantadas']),
      registrarEntrega: ({ proyecto, monto, medio, numOp, fecha, motivo }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('entregas_caja').insert({
          proyecto: cod(proyecto), monto: Number(monto), medio,
          num_operacion: medio === 'Efectivo' ? null : numOp.trim(),
          fecha: fecha || HOY_ISO, entregado_por: u.id,
          // Solo cuando la fecha no es hoy; la base lo exige en ese caso.
          motivo_atraso: (fecha && fecha !== HOY_ISO) ? (motivo || '').trim() : null,
        });
      }, ['entregas_caja']),
      anularEntrega: (id, motivo) => wrap(async () =>
        await supabase.from('entregas_caja').update({ anulacion: { motivo } }).eq('id', id),
        ['entregas_caja']),
      recibir: (item, rec, obs, cad) => wrap(async () => {
        const total = Number(item.cantRecibida || 0) + rec;
        const esSaldo = item.estado === 'Incompleto';
        const patch = { cant_recibida: total };
        // La fecha de entrega es la del PRIMER lote que ingresa (no editable a mano);
        // la del saldo se estampa en la recepción del saldo.
        if (esSaldo) patch.fecha_entrega_saldo = HOY_ISO;
        else patch.fecha_entrega = HOY_ISO;
        if (obs) patch.obs_almacen = item.obsAlmacen ? item.obsAlmacen + ' · ' + obs : obs;
        // perecedero: se conserva la caducidad más próxima entre recepciones
        if (cad) patch.fecha_caducidad = (item.fechaCaducidad && item.fechaCaducidad < cad) ? item.fechaCaducidad : cad;
        return await supabase.from('rq_items').update(patch).eq('id', item.id);
      }, ['rq_items']),
      // Corregir una cantidad mal digitada (migración 35). Solo se manda el
      // motivo: quién y cuándo los estampa la base, para que el rastro no se
      // pueda falsear. El historial no se pisa, se le agrega una entrada.
      corregirRecepcion: (item, nuevaCant, motivo) => wrap(async () =>
        await supabase.from('rq_items').update({
          cant_recibida: nuevaCant,
          correcciones: [...(item.correcciones || []), { motivo }],
        }).eq('id', item.id), ['rq_items']),
      darSalida: ({ proyecto, cod: codigo, cant, hoja, zona }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('salidas').insert({
          proyecto: cod(proyecto), codigo, cant, hoja_trabajo: hoja, zona, registrado_por: u.id,
        });
      }, ['salidas']),
      updSalida: (id, patch) => wrap(async () => await supabase.from('salidas').update(patch).eq('id', id), ['salidas']),
      prestar: ({ origen, destino, cod: codigo, cant }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('prestamos').insert({
          origen: cod(origen), destino: cod(destino), codigo, cant, registrado_por: u.id,
        });
      }),
      updPrestamo: (id, patch) => wrap(async () => await supabase.from('prestamos').update(patch).eq('id', id), ['prestamos']),
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
        }), ['solicitudes_material'], true),
      rechazarSolicitud: (s, motivo) => wrap(async () =>
        await supabase.from('solicitudes_material').update({ estado: 'Rechazado', motivo }).eq('id', s.id)),
      crearFamilia: ({ iu, nombre }) => wrap(async () =>
        await supabase.from('familias').insert({ iu, nombre }), [], true),
      // Pedido por cotización (enchapes): crea cada material 97xxxx + el pedido aprobado
      crearPedidoCotizacion: ({ proyecto, cotizacionRef, arquitecto, fecha, lineas }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        const cat = dbRef.current.catalogo;
        let cod97 = Math.max(970100, ...cat.filter(m => String(m[0]).startsWith('97')).map(m => Number(m[0])));
        const mats = [];
        for (const l of lineas) {
          cod97 += 1;
          const codigo = String(cod97);
          const { error } = await supabase.from('materiales').insert({
            codigo, descripcion: l.desc.trim().toUpperCase(), und: 'M2',
          });
          if (error) return { error };
          mats.push({ codigo, cant: Number(l.cant), destino: l.destino.trim() });
        }
        const { data: rq, error: e1 } = await supabase.from('rqs').insert({
          proyecto: cod(proyecto), partida: cotizacionRef.trim(), residente_id: u.id, creado_por: u.id,
          tipo: 'Cotizacion', cotizacion_ref: cotizacionRef.trim(), solicitante_diseno: arquitecto.trim(), canal: 'GENERAL',
        }).select().single();
        if (e1) return { error: e1 };
        const rows = mats.map(m => ({ rq_id: rq.id, codigo: m.codigo, cant: m.cant, fecha_necesitada: fecha, destino: m.destino, decision: 'Aprobado' }));
        const { error: e2 } = await supabase.from('rq_items').insert(rows);
        if (e2) return { error: e2 };
        return { numero: rq.numero };
        // crea materiales 97xxxx nuevos -> hay que refrescar el catálogo
      }, ['rqs', 'rq_items'], true),
      // Compra parcial (migración 49): el ítem se parte en dos — lo conseguido y
      // el saldo — para que la factura cubra lo comprado de verdad con su precio
      // real, en vez de forzar un precio inventado sobre la cantidad pedida.
      // Tomar un ítem para comprarlo, o soltarlo. Quién lo tomó lo pone la base.
      tomarItem: (id, tomar) => wrap(async () =>
        await supabase.from('rq_items').update({ tomado_en: tomar ? HOY_ISO : null }).eq('id', id),
        ['rq_items']),
      compraParcial: (item, cant, motivo, cerrarSaldo) => wrap(async () =>
        await supabase.rpc('compra_parcial', {
          p_item: item.id, p_cant: Number(cant), p_motivo: motivo.trim(),
          p_cerrar_saldo: !!cerrarSaldo,
        }), ['rqs', 'rq_items']),
      setPerecedero: (codigo, valor) => wrap(async () =>
        await supabase.from('materiales').update({ perecedero: valor }).eq('codigo', codigo), [], true),
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
  // pendientes de aprobación del residente (para avisar en la pestaña)
  const pendAprob = (user.rol === 'residente' && db) ? (
    db.salidas.filter(s => s.proyecto === user.proyecto && !s.anulada && s.aprobacion === 'Pendiente').length +
    db.prestamos.filter(p => p.estado === 'Solicitado' && ((p.origen === user.proyecto && !p.aprobOrigen) || (p.destino === user.proyecto && !p.aprobDestino))).length
  ) : 0;
  // Aviso al residente: ítems suyos anulados en los últimos 15 días
  const anulRecientes = (user.rol === 'residente' && db)
    ? db.rqs.filter(r => r.proyecto === user.proyecto)
        .flatMap(r => r.items)
        .filter(i => i.decision === 'Anulado' && i.fechaAnulacion && dias(HOY_ISO, i.fechaAnulacion) <= 15).length
    : 0;

  return (
    <div className="bg-slate-950 min-h-screen text-slate-100" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {!ES_PRODUCCION && (
        <div className="bg-fuchsia-700 text-white text-center text-[11px] font-bold uppercase tracking-widest py-1">
          Entorno de {ENTORNO} · estos NO son los datos reales de la empresa
        </div>
      )}
      <div className="bg-black border-b-2 border-yellow-400 px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="font-extrabold text-sm tracking-widest text-yellow-400">
          COPACABANA <span className="text-slate-600 font-medium">/ RQ</span></div>
        <div className="text-slate-400 text-[11px]">{user.nombre}{user.proyecto ? ' · ' + user.proyecto : ''} <span className="text-slate-600">({user.rol})</span></div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="flex gap-0.5 bg-slate-800 p-1 rounded">
            {tabs.map(([k, l]) => {
              const cuenta = k === 'apr' ? pendAprob : k === 'res' ? anulRecientes : 0;
              const rojo = k === 'res' && anulRecientes > 0;   // anulaciones: aviso en rojo
              const alerta = cuenta > 0 && tab !== k;
              return (
              <button key={k} onClick={() => setTab(k)}
                className={`px-3 py-1.5 rounded text-[11px] font-semibold tracking-wide uppercase ${tab === k ? 'bg-yellow-400 text-slate-950' : alerta ? (rojo ? 'text-red-400 ring-1 ring-red-400 bg-red-400/10' : 'text-yellow-400 ring-1 ring-yellow-400 bg-yellow-400/10') : 'text-slate-400 hover:text-slate-200'}`}>
                {l}{cuenta > 0 && <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${rojo ? 'bg-red-500 text-white' : 'bg-yellow-400 text-slate-950'}`}>{cuenta}</span>}</button>
              );
            })}
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
        {tab === 'apr' && <AprobacionesResidente user={user} db={db} api={api} />}
        {tab === 'fac' && <Compras user={user} db={db} api={api} modo="facturar" />}
        {tab === 'alm' && <Almacen user={user} db={db} api={api} />}
        {tab === 'cat' && <Catalogo user={user} db={db} api={api} />}
        {tab === 'pag' && <Pagos user={user} db={db} api={api} />}
        {tab === 'ren' && <Rendiciones user={user} db={db} api={api} />}
        {tab === 'aud' && <Auditoria user={user} db={db} api={api} />}
        {tab === 'tab' && <Tablero db={db} user={user} />}
        {tab === 'rep' && user.rol === 'gerente' && <ReporteMensual db={db} />}
      </div>
    </div>
  );
}
