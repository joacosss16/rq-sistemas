// Movido de App.jsx (etapa 9 de la separacion en modulos), texto identico.
import { useState } from 'react';
import { HOY_ISO } from '../fechas';
import { Aviso, inputCls, thCls, btnRojo, btnVerde } from '../ui';

export function AprobacionesResidente({ user, db, api }) {
  const { salidas, prestamos } = db;
  const [aviso, setAviso] = useState('');
  const [rech, setRech] = useState({});
  const avisar = (m, ms = 5000) => { setAviso(m); setTimeout(() => setAviso(''), ms); };

  // Gerencia entra aquí sin obra propia: es la red de seguridad para el día en
  // que el residente de una obra esté de viaje, enfermo o todavía sin dar de
  // alta. Sin esto, esa obra no puede entregar material y la única salida es
  // el editor SQL en plena jornada.
  const todas = !user.proyecto;
  const miObra = p => todas || p === user.proyecto;

  const salPend = salidas.filter(s => miObra(s.proyecto) && !s.anulada && s.aprobacion === 'Pendiente');
  // préstamos donde falta una aprobación (la mía, o cualquiera si es gerencia)
  const presPend = prestamos.filter(p => p.estado === 'Solicitado' &&
    ((miObra(p.origen) && !p.aprobOrigen) || (miObra(p.destino) && !p.aprobDestino)));

  const aprobarSal = async sa => {
    const r = await api.updSalida(sa.id, { aprobacion: 'Aprobada' });
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
    avisar(`Salida #${sa.n} aprobada: ${sa.cant} ${sa.und} de "${sa.desc}". Ya descuenta stock.`);
  };
  const rechazarSal = async sa => {
    const m = (rech['s' + sa.n] || '').trim();
    if (!m) return;
    const r = await api.updSalida(sa.id, { aprobacion: 'Rechazada', motivo_rechazo: m });
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
    const r2 = { ...rech }; delete r2['s' + sa.n]; setRech(r2);
    avisar(`Salida #${sa.n} rechazada. El stock no se tocó. El almacenero verá el motivo.`);
  };
  // Gerencia no tiene obra propia, así que ELIGE el lado con un botón por
  // cada uno. Antes se le elegía solo — el primero sin firmar — y eso
  // significaba que su clic firmaba POR el residente de origen: el préstamo
  // desaparecía de la bandeja de Edwin sin que él lo viera, y la firma no se
  // puede deshacer. Peor todavía, la columna decía "Recibes (destino)"
  // mientras el botón firmaba el origen. Un residente normal no elige nada:
  // solo puede firmar su propio lado.
  const aprobarPres = async (p, ladoElegido) => {
    const lado = ladoElegido
      || (p.origen === user.proyecto ? 'aprob_origen' : 'aprob_destino');
    const r = await api.updPrestamo(p.id, { [lado]: { por: user.nombre, fecha: HOY_ISO } });
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
    const cual = lado === 'aprob_origen' ? `origen (${p.origen})` : `destino (${p.destino})`;
    avisar(`Préstamo #${p.n}: lado ${cual} aprobado. Se activa cuando ambos den el OK.`);
  };
  const rechazarPres = async p => {
    const m = (rech['p' + p.n] || '').trim();
    if (!m) return;
    const r = await api.updPrestamo(p.id, { rechazo: { por: user.nombre, fecha: HOY_ISO, motivo: m } });
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
    const r2 = { ...rech }; delete r2['p' + p.n]; setRech(r2);
    avisar(`Préstamo #${p.n} rechazado. No se movió stock.`);
  };

  return (
    <div>
      <Aviso msg={aviso} />
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Salidas de almacén por aprobar · {salPend.length}</div>
        {salPend.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Nada pendiente. Aquí llegan las salidas que pide el almacenero; sin tu OK no descuentan stock.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['#', 'Material', 'Cantidad', 'Hoja de trabajo', 'Zona', 'Pide', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {salPend.map(sa => (
                  <tr key={sa.n} className="border-b border-slate-800 align-top">
                    <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{sa.n}</td>
                    <td className="py-2 px-1.5 text-slate-200">{sa.desc} <span className="text-slate-500">({sa.und})</span></td>
                    <td className="py-2 px-1.5 font-mono text-slate-200">{sa.cant}</td>
                    <td className="py-2 px-1.5 font-mono text-slate-200">{sa.hoja}</td>
                    <td className="py-2 px-1.5 text-slate-300">{sa.zona}</td>
                    <td className="py-2 px-1.5 text-slate-400 text-[10px]">{sa.registradoPor}</td>
                    <td className="py-2 px-1.5">
                      {rech['s' + sa.n] !== undefined ? (
                        <div className="w-44">
                          <textarea rows={2} value={rech['s' + sa.n]} onChange={e => setRech({ ...rech, ['s' + sa.n]: e.target.value })}
                            placeholder="Motivo del rechazo…" className={`w-full ${inputCls}`} />
                          <div className="flex gap-1 mt-1">
                            <button onClick={() => rechazarSal(sa)} disabled={!(rech['s' + sa.n] || '').trim()}
                              className={`flex-1 px-2 py-1 rounded text-[9px] font-bold uppercase ${(rech['s' + sa.n] || '').trim() ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-slate-800 text-slate-600'}`}>Confirmar rechazo</button>
                            <button onClick={() => { const r2 = { ...rech }; delete r2['s' + sa.n]; setRech(r2); }} className="px-2 text-slate-500">✕</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <button onClick={() => aprobarSal(sa)} className={btnVerde}>Aprobar</button>
                          <button onClick={() => setRech({ ...rech, ['s' + sa.n]: '' })} className={btnRojo}>Rechazar</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Préstamos por aprobar (tu lado) · {presPend.length}</div>
        {presPend.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Nada pendiente. Un préstamo se activa solo cuando lo aprueban los residentes de origen y destino.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['#', 'Material', 'Cant', 'Origen', 'Destino', 'Tu rol', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {presPend.map(p => (
                  <tr key={p.n} className="border-b border-slate-800 align-top">
                    <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{p.n}</td>
                    <td className="py-2 px-1.5 text-slate-200">{p.desc} <span className="text-slate-500">({p.und})</span></td>
                    <td className="py-2 px-1.5 font-mono text-slate-200">{p.cant}</td>
                    <td className="py-2 px-1.5 text-slate-300">{p.origen}</td>
                    <td className="py-2 px-1.5 text-slate-300">{p.destino}</td>
                    <td className="py-2 px-1.5 text-[10px] font-semibold text-slate-400">
                      {todas ? (
                        <>
                          <div className={p.aprobOrigen ? 'text-green-400' : 'text-yellow-400'}>
                            {p.aprobOrigen ? `✓ origen · ${p.aprobOrigen}` : '○ origen sin firmar'}</div>
                          <div className={p.aprobDestino ? 'text-green-400' : 'text-yellow-400'}>
                            {p.aprobDestino ? `✓ destino · ${p.aprobDestino}` : '○ destino sin firmar'}</div>
                        </>
                      ) : (p.origen === user.proyecto ? 'Prestas (origen)' : 'Recibes (destino)')}
                    </td>
                    <td className="py-2 px-1.5">
                      {rech['p' + p.n] !== undefined ? (
                        <div className="w-44">
                          <textarea rows={2} value={rech['p' + p.n]} onChange={e => setRech({ ...rech, ['p' + p.n]: e.target.value })}
                            placeholder="Motivo del rechazo…" className={`w-full ${inputCls}`} />
                          <div className="flex gap-1 mt-1">
                            <button onClick={() => rechazarPres(p)} disabled={!(rech['p' + p.n] || '').trim()}
                              className={`flex-1 px-2 py-1 rounded text-[9px] font-bold uppercase ${(rech['p' + p.n] || '').trim() ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-slate-800 text-slate-600'}`}>Confirmar rechazo</button>
                            <button onClick={() => { const r2 = { ...rech }; delete r2['p' + p.n]; setRech(r2); }} className="px-2 text-slate-500">✕</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-1 flex-wrap">
                          {todas ? (
                            <>
                              {/* Gerencia elige el lado a mano: firmar por el residente
                                  de origen le quita su material sin que se entere, y no
                                  se puede deshacer. Solo se ofrece el lado sin firmar. */}
                              {!p.aprobOrigen && (
                                <button onClick={() => aprobarPres(p, 'aprob_origen')} className={btnVerde}
                                  title={`Firmar por la obra que PRESTA (${p.origen}). Úsalo solo si esa obra no tiene residente.`}>
                                  Firmar origen · {p.origen}</button>
                              )}
                              {!p.aprobDestino && (
                                <button onClick={() => aprobarPres(p, 'aprob_destino')} className={btnVerde}
                                  title={`Firmar por la obra que RECIBE (${p.destino}). Úsalo solo si esa obra no tiene residente.`}>
                                  Firmar destino · {p.destino}</button>
                              )}
                            </>
                          ) : (
                            <button onClick={() => aprobarPres(p)} className={btnVerde}>Aprobar</button>
                          )}
                          <button onClick={() => setRech({ ...rech, ['p' + p.n]: '' })} className={btnRojo}>Rechazar</button>
                        </div>
                      )}
                    </td>
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
