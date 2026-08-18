// ============================================================
// Residente: crear RQs, mis requerimientos, solicitudes de material.
// Movido de App.jsx (etapa 10 de la separacion en modulos) el 16 ago
// 2026, cuando el dueno descongelo el modulo. Texto identico; solo se
// agrego export y estos imports. Viajan con el sus tres piezas de uso
// exclusivo: canalDeFecha (el canal URGENTE/GENERAL/ANTICIPADO se
// decide solo con la fecha), NIVELES y el Buscador del catalogo.
// ============================================================
import { useState, useMemo, useRef, Fragment } from 'react';
import { HOY_ISO, fmt, dias, diasHoy } from '../fechas';
import { calcularStocks } from '../stock';
import { imprimirRQ } from '../pdf';
import { PROYECTOS, ALMACENEROS } from '../maestros';
import { buscarEnCatalogo } from '../busqueda';
import { Aviso, AlertaCerrable, FechaInput, FiltroProyecto, inputCls, lblCls, thCls, btnOk, pillEstado, pendCls, canalClases } from '../ui';

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

export function Residente({ user, db, api }) {
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

  const misRqs = esRes
    ? rqs.filter(r => r.proyecto === user.proyecto && r.tipo !== 'Cotizacion')
    : rqs.filter(r => proyF === 'TODOS' || r.proyecto === proyF);
  const misSol = esRes ? solicitudes.filter(s => s.solicitanteId === user.id) : solicitudes;
  // Aviso: ítems míos anulados por Compras/gerencia en los últimos 15 días
  const anuladosRecientes = misRqs
    .flatMap(r => r.items.map(i => ({ ...i, rq: r.n })))
    .filter(i => i.decision === 'Anulado' && i.fechaAnulacion && dias(HOY_ISO, i.fechaAnulacion) <= 15)
    .sort((a, b) => (a.fechaAnulacion < b.fechaAnulacion ? 1 : -1));

  // Un RQ se archiva solo cuando ya no queda nada por atender:
  // cada ítem está Entregado, o cerrado por rechazo/anulación.
  const [verArchivados, setVerArchivados] = useState(false);
  // Gerencia entra aqui sin obra propia y ve los RQ de las cinco obras
  // mezclados. Un residente no necesita filtro -- solo tiene una obra --
  // pero sin el, esta pantalla es inservible para gerencia.
  const [proyF, setProyF] = useState('TODOS');
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
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">
            {esRes ? 'Mis requerimientos' : 'Requerimientos de todas las obras'} · estado (solo lectura — lo gestiona Compras)</div>
          {!esRes && <FiltroProyecto value={proyF} onChange={setProyF} todos />}
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
