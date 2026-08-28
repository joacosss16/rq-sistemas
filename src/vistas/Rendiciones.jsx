// Movido de App.jsx (etapa 9 de la separacion en modulos), texto identico.
import { useState, useEffect } from 'react';
import { fmt, HOY_ISO, dias } from '../fechas';
import { cuadreCaja, diferenciaArqueo, excedeTolerancia } from '../caja';
import { Aviso, FiltroProyecto, inputCls, thCls, btnOk, btnRojo } from '../ui';

// La prop cajas que no se usa se conserva tal cual: limpiar firmas de
// props es de otra revision, no de la mudanza.

export function Rendiciones({ user, db, api, obraGlobal }) {
  const { rendiciones, facturas, cajas, tolerancias = {}, bancoDe, entregas = [] } = db;
  // Solo administración cierra la caja del día. Antes el rol `pagos` también
  // podía, porque Mónica llevaba los dos frentes; eso ponía a la misma persona
  // en las dos puntas del circuito del efectivo (aprobar el gasto y reponer el
  // fondo). Pagos conserva la pestaña en modo consulta: necesita ver qué
  // rendiciones están aprobadas para saber qué reponer.
  const puede = user.rol === 'administracion';
  const [proy, setProy] = useState('TODOS');
  // Gerencia elige la obra en la cabecera y los modulos la siguen. Va pegado
  // al estado del filtro, con los demas ganchos: bajarlo tumba la vista.
  useEffect(() => { if (obraGlobal) setProy(obraGlobal); }, [obraGlobal]);
  const [obs, setObs] = useState({});
  const [corr, setCorr] = useState({});   // texto de la corrección de una rendición observada
  const [arqueo, setArqueo] = useState({});     // efectivo contado al cerrar el día
  const [difMot, setDifMot] = useState({});     // motivo cuando la diferencia excede la tolerancia
  const [difNota, setDifNota] = useState({});   // decisión de gerencia sobre la diferencia
  const [aviso, setAvisoRaw] = useState('');
  const setAviso = m => { setAvisoRaw(m); if (m) setTimeout(() => setAvisoRaw(''), m.startsWith('⚠') ? 8000 : 6000); };

  const lista = rendiciones
    .filter(r => proy === 'TODOS' || r.proyecto === proy)
    .map(r => {
      // Una factura anulada NO es gasto: o el dinero volvió a la caja, o la
      // compra se registra de nuevo bien y entonces sí cuenta. Contándola,
      // el arqueo mostraba un sobrante fantasma igual al monto anulado, que
      // excede cualquier tolerancia y escalaba a gerencia sin motivo.
      // La aritmética vive en src/caja.js para poder probarla aparte: de ella
      // sale si una obra tiene un faltante de efectivo o no.
      const c = cuadreCaja(r, facturas, entregas);
      return { ...r, facturas: c.facturas, total: c.gastado, entregas: c.entregas,
               recibido: c.recibido, sobrante: c.debeDevolver,
               historica: c.historica, faltaEntrega: c.faltaEntrega };
    })
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  // Una rendicion aprobada ya no requiere ninguna accion: se archiva fuera de la
  // vista de trabajo y se consulta con un clic. Lo que queda arriba es lo que
  // hay que atender: abierta (falta cerrarla), observada (falta corregirla) o
  // con diferencia (esperando a gerencia).
  const cerrada = r => r.estado === 'Aprobada';
  const pendientes = lista.filter(r => !cerrada(r));
  const archivadas = lista.filter(cerrada);
  const [verArchivadas, setVerArchivadas] = useState(false);

  // Resumen de vigilancia (solo gerencia). Lo que importa del efectivo:
  //   CON DIFERENCIA / OBSERVADA -- ademas del dinero, BLOQUEAN la caja de esa
  //     obra: al dia siguiente el comprador no puede registrar compras en
  //     efectivo hasta que se resuelva. Cada dia sin resolver es una obra
  //     comprando sin caja.
  //   ABIERTAS DE DIAS ANTERIORES -- jornadas que nadie cerro: el efectivo de
  //     ese dia sigue sin arquear.
  const conProblema = pendientes.filter(r => r.estado === 'Con diferencia' || r.estado === 'Observada');
  const problemaMax = conProblema.length ? Math.max(...conProblema.map(r => dias(HOY_ISO, r.fecha))) : null;
  const abiertasViejas = pendientes.filter(r => r.estado === 'Abierta' && r.fecha < HOY_ISO);
  const difAcum = conProblema.reduce((a, r) => a + Math.abs(Number(r.diferencia) || 0), 0);
  const resumenRen = [
    { k: 'Jornadas por cerrar', n: pendientes.length, on: pendientes.length > 0, cls: 'text-yellow-400' },
    { k: 'Con diferencia u observadas', n: conProblema.length, on: conProblema.length > 0, cls: 'text-red-400',
      nota: conProblema.length ? `bloquean la caja de su obra · la más vieja: ${problemaMax} d` : null },
    { k: 'Diferencia acumulada', n: 'S/ ' + difAcum.toFixed(2), on: difAcum > 0, cls: 'text-red-400' },
    { k: 'Abiertas de días anteriores', n: abiertasViejas.length, on: abiertasViejas.length > 0, cls: 'text-orange-400',
      nota: abiertasViejas.length ? 'efectivo del día sin arquear' : null },
  ];
  const mostradas = verArchivadas ? lista : pendientes;

  // Los números de la pantalla son para que Mónica VEA lo que va a pasar; los
  // que valen son los que devuelve el servidor, que recalcula todo con los
  // datos de la base. Si por lo que sea no coinciden, manda el servidor y se
  // avisa: significa que algo se movió entre que abrió la pantalla y cerró.
  const cerrarArqueo = async (r, contado, diferencia, excede, motivo) => {
    const res = await api.cerrarConArqueo(r.id, { contado, motivo });
    if (res.error) { setAviso('⚠ ' + res.error); return; }
    const s = res.data || {};
    const difReal = s.diferencia != null ? Number(s.diferencia) : diferencia;
    const excedeReal = s.excede != null ? !!s.excede : excede;
    const a2 = { ...arqueo }; delete a2[r.id]; setArqueo(a2);
    const m2 = { ...difMot }; delete m2[r.id]; setDifMot(m2);
    const cambio = Math.abs(difReal - diferencia) >= 0.005
      ? ` (el sistema recalculó la diferencia: la pantalla decía S/ ${Math.abs(diferencia).toFixed(2)} y los movimientos del día dan S/ ${Math.abs(difReal).toFixed(2)})`
      : '';
    setAviso(excedeReal
      ? `Diferencia de S/ ${Math.abs(difReal).toFixed(2)} en ${r.proyecto}: enviada a gerencia. Pagos no repone hasta que la resuelvan${cambio}.`
      : `Rendición de ${r.proyecto} cerrada y aprobada${Math.abs(difReal) >= 0.005 ? ` (diferencia de S/ ${Math.abs(difReal).toFixed(2)}, dentro de la tolerancia)` : ' — la caja cuadra exacto'}${cambio}.`);
  };

  const resolverDif = async r => {
    const nota = (difNota[r.id] || '').trim();
    if (!nota) return;
    const res = await api.resolverDiferencia(r.id, { decision: 'Resuelta', nota, nombre: user.nombre });
    if (res.error) { setAviso('⚠ ' + res.error); return; }
    const n2 = { ...difNota }; delete n2[r.id]; setDifNota(n2);
    setAviso(`Diferencia de ${r.proyecto} resuelta. La reposición pasó a la cola de Pagos.`);
  };

  const corregir = async r => {
    const detalle = (corr[r.id] || '').trim();
    if (!detalle) { setAviso('⚠ Escribe qué corregiste antes de aprobar.'); return; }
    const res = await api.corregirRendicion(r.id, { detalle, nombre: user.nombre });
    if (res.error) { setAviso('⚠ ' + res.error); return; }
    const c2 = { ...corr }; delete c2[r.id]; setCorr(c2);
    setAviso(`Rendición de ${r.proyecto} corregida y aprobada. Gerencia verá qué se corrigió y cuándo.`);
  };

  const resolver = async (r, estado) => {
    const observacion = (obs[r.id] || '').trim();
    if (estado === 'Observada' && !observacion) { setAviso('⚠ Para observar una rendición escribe el motivo.'); return; }
    const res = await api.resolverRendicion(r.id, { estado, observacion });
    if (res.error) { setAviso('⚠ ' + res.error); return; }
    const o2 = { ...obs }; delete o2[r.id]; setObs(o2);
    setAviso(estado === 'Aprobada'
      ? `Rendición de ${r.proyecto} (${fmt(r.fecha)}) aprobada: se gastaron S/ ${r.total.toFixed(2)} y el vuelto quedó contado.`
      : `Rendición de ${r.proyecto} observada; coordina la corrección con ${r.responsable}.`);
  };

  return (
    <div>
      {user.rol === 'gerente' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {resumenRen.map(x => (
            <div key={x.k} className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2">
              <div className={`text-xl font-bold font-mono ${x.on ? x.cls : 'text-slate-600'}`}>{x.n}</div>
              <div className="text-[9px] font-bold tracking-widest text-slate-500 uppercase leading-tight">{x.k}</div>
              {x.nota && <div className="text-[9px] text-slate-500 leading-tight mt-0.5">{x.nota}</div>}
            </div>
          ))}
        </div>
      )}
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">
            Rendiciones de caja chica · {pendientes.length} por atender
            {archivadas.length > 0 && (
              <button onClick={() => setVerArchivadas(!verArchivadas)}
                className="ml-2 text-[10px] font-bold uppercase text-sky-400 hover:text-sky-300">
                {verArchivadas ? '· ocultar las cerradas' : `· ver ${archivadas.length} ya cerrada(s)`}
              </button>
            )}
          </div>
          <div className="ml-auto"><FiltroProyecto value={proy} onChange={setProy} todos /></div>
        </div>
        {!puede && (
          user.rol === 'comprador' ? (
            <div className="bg-slate-950 border border-yellow-800 rounded p-3 mb-3">
              <div className="text-yellow-400 text-[11px] font-bold uppercase tracking-wider mb-1">¿Cómo rindo mis compras en efectivo?</div>
              <div className="text-slate-300 text-[11px] leading-relaxed">
                La rendición <b>no se crea desde aquí</b>: se arma sola. Ve a la pestaña <b>Facturar</b>, registra la
                factura de tu compra y marca <b>“Ya pagada en EFECTIVO (caja chica de hoy)”</b>. Esa factura entra
                automáticamente a la rendición del día de esa obra. Esta pantalla es solo para consultar cómo van.
              </div>
              <div className="text-slate-500 text-[10px] mt-1">
                Administración la aprueba al cierre del día y Pagos repone el fondo. Una rendición por obra y por día.
              </div>
            </div>
          ) : (
            <div className="text-slate-500 text-[11px] mb-3">Vista de consulta: las rendiciones las aprueba administración.</div>
          )
        )}
        <Aviso msg={aviso} />
        {mostradas.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">
            {archivadas.length > 0
              ? 'Todo al día: no queda ninguna rendición por cerrar.'
              : `Sin rendiciones${proy !== 'TODOS' ? ' en ' + proy : ''}. Se abren solas al registrar una entrega de efectivo o la primera compra en efectivo del día.`}</div>
        ) : mostradas.map(r => (
          <div key={r.id} className="mb-3 border border-slate-800 rounded p-3">
            <div className="flex items-center gap-2.5 mb-2 flex-wrap">
              <b className="text-sm text-slate-100">{r.proyecto}</b>
              <span className="text-slate-500 text-[11px]">{fmt(r.fecha)} · rinde: {r.responsable}</span>
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${r.estado === 'Aprobada' ? 'bg-green-950 text-green-400' : r.estado === 'Observada' ? 'bg-red-950 text-red-400' : 'bg-yellow-950 text-yellow-400'}`}>{r.estado}</span>
              <span className="ml-auto text-[11px] font-mono text-slate-300">
                {r.historica ? 'Fondo' : 'Recibido'} S/ {r.recibido.toFixed(2)} · Gastado <b className="text-yellow-400">S/ {r.total.toFixed(2)}</b> · {r.historica ? 'Sobrante' : 'Debe devolver'} S/ {r.sobrante.toFixed(2)}</span>
            </div>
            {/* De dónde sale el "recibido": las entregas de efectivo del día.
                Las rendiciones anteriores al cambio de modelo se leen con su
                fondo fijo, que es como se cerraron y como las firmaron. */}
            {r.historica ? (
              <div className="text-[10px] text-slate-500 mb-2">
                Rendición del modelo anterior (fondo fijo de la obra). Desde el 12 de agosto el disponible del día son las entregas que registra Pagos.</div>
            ) : r.faltaEntrega ? (
              <div className="text-[10px] text-orange-400 mb-2">
                ⚠ No hay ninguna entrega de efectivo registrada para este día. Pagos debe registrarla, o el arqueo saldrá con toda la plata como faltante.</div>
            ) : (
              <div className="text-[10px] text-slate-400 mb-2">
                Entregas del día:{' '}
                {r.entregas.map((e, k) => (
                  <span key={e.id}>{k > 0 ? ' · ' : ''}
                    <span className="font-mono text-slate-300">S/ {e.monto.toFixed(2)}</span>
                    {' '}{e.medio.toLowerCase()}{e.numOp ? ` op. ${e.numOp}` : ''}
                    <span className="text-slate-600"> ({e.entregadoPor})</span>
                    {e.motivoAtraso && <span className="text-orange-400"> · registrada después: {e.motivoAtraso}</span>}
                  </span>
                ))}
              </div>
            )}
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
            {/* También en 'Observada': antes, observar dejaba la rendición sin
                arqueo posible y la caja en efectivo de la obra bloqueada, sin
                más salida que aprobarla a ciegas sin contar el vuelto. */}
            {(r.estado === 'Abierta' || r.estado === 'Observada') && puede && (() => {
              const tol = tolerancias[r.proyecto] ?? 20;
              const cont = arqueo[r.id];
              const hayArqueo = cont !== undefined && cont !== '' && !isNaN(Number(cont));
              const dif = hayArqueo ? diferenciaArqueo(cont, r.sobrante) : null;
              const excede = dif != null && excedeTolerancia(dif, tol);
              const motivo = (difMot[r.id] || '').trim();
              return (
              <div className="bg-slate-950 border border-slate-700 rounded p-2 mb-2">
                <div className="text-[9px] font-bold uppercase text-slate-400 mb-1">
                  Cierre del día · arqueo de caja (tolerancia de {r.proyecto}: S/ {tol.toFixed(2)})</div>
                <div className="flex gap-2 items-center flex-wrap">
                  <label className="text-[10px] text-slate-400" title="El efectivo que el comprador devuelve al cerrar el día. Contarlo aquí es el registro de que lo recibiste.">Efectivo devuelto y contado S/</label>
                  <input type="number" step="any" min="0" value={cont ?? ''}
                    onChange={e => setArqueo({ ...arqueo, [r.id]: e.target.value })}
                    placeholder={r.sobrante.toFixed(2)} className={`w-28 ${inputCls} font-mono`} />
                  {hayArqueo && (
                    <span className={`text-[11px] font-mono font-bold ${Math.abs(dif) < 0.005 ? 'text-green-400' : excede ? 'text-red-400' : 'text-yellow-400'}`}>
                      {Math.abs(dif) < 0.005 ? '✓ Cuadra exacto'
                        : `${dif < 0 ? 'Falta' : 'Sobra'} S/ ${Math.abs(dif).toFixed(2)}`}
                      {hayArqueo && Math.abs(dif) >= 0.005 && (excede
                        ? ' · supera la tolerancia: lo resuelve gerencia'
                        : ' · dentro de la tolerancia')}
                    </span>
                  )}
                </div>
                {excede && (
                  <input value={difMot[r.id] || ''} onChange={e => setDifMot({ ...difMot, [r.id]: e.target.value })}
                    placeholder="¿Qué pasó con el dinero? (obligatorio para enviar a gerencia)"
                    className={`w-full ${inputCls} mt-2`} />
                )}
                <div className="flex gap-2 mt-2 flex-wrap">
                  <button onClick={() => cerrarArqueo(r, Number(cont), dif, excede, motivo)}
                    disabled={!hayArqueo || (excede && !motivo)}
                    className={excede ? btnOk(!!(hayArqueo && motivo)) : btnOk(hayArqueo)}>
                    {excede ? 'Enviar a gerencia' : 'Cerrar y aprobar'}</button>
                  <span className="text-[9px] text-slate-500 self-center">
                    Cuenta el efectivo que queda en la caja y anótalo: sin arqueo no se puede cerrar el día.</span>
                </div>
              </div>
              );
            })()}
            {r.estado === 'Con diferencia' && (
              <div className="bg-red-950 border border-red-800 rounded p-2 mb-2">
                <div className="text-[10px] font-bold uppercase text-red-400">
                  Diferencia de caja · {r.diferencia < 0 ? 'faltan' : 'sobran'} S/ {Math.abs(r.diferencia || 0).toFixed(2)} — esperando a gerencia</div>
                <div className="text-[10px] text-slate-300 mt-1">
                  Contado S/ {(r.efectivoContado ?? 0).toFixed(2)} vs. teórico S/ {r.sobrante.toFixed(2)}
                  {r.difMotivo && <> · <span className="text-slate-400">{r.difMotivo}</span></>}</div>
                <div className="text-[9px] text-slate-500 mt-1">Pagos no repone el fondo hasta que gerencia lo resuelva.</div>
                {user.rol === 'gerente' && (
                  <div className="mt-2 flex gap-2 flex-wrap items-start">
                    <input value={difNota[r.id] || ''} onChange={e => setDifNota({ ...difNota, [r.id]: e.target.value })}
                      placeholder="Decisión de gerencia (se asume, se descuenta, se justificó…)"
                      className={`${inputCls} flex-1`} style={{ minWidth: '260px' }} />
                    <button onClick={() => resolverDif(r)} disabled={!(difNota[r.id] || '').trim()}
                      className={btnOk(!!(difNota[r.id] || '').trim())}>Resolver y aprobar</button>
                  </div>
                )}
              </div>
            )}
            {/* El campo de observación aparece solo al pulsar Observar, no todo el
                rato: observar es la excepción, y un campo de texto siempre abierto
                es ruido en la pantalla que se usa todos los días. Sigue estando
                disponible aunque la caja cuadre — se observa por una factura que
                falta o un comprobante ilegible, no solo por un descuadre. */}
            {r.estado === 'Abierta' && puede && (
              obs[r.id] === undefined ? (
                <button onClick={() => setObs({ ...obs, [r.id]: '' })} className={btnRojo}>Observar</button>
              ) : (
                <div className="flex gap-2 items-start flex-wrap">
                  <input autoFocus value={obs[r.id]} onChange={e => setObs({ ...obs, [r.id]: e.target.value })}
                    placeholder="¿Qué hay que corregir?" className={`${inputCls}`} style={{ minWidth: '260px' }} />
                  <button onClick={() => resolver(r, 'Observada')} disabled={!obs[r.id].trim()}
                    className={obs[r.id].trim() ? btnRojo : 'px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-600 cursor-not-allowed'}>Confirmar observación</button>
                  <button onClick={() => { const o2 = { ...obs }; delete o2[r.id]; setObs(o2); }}
                    className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-400">Cancelar</button>
                </div>
              )
            )}
            {r.estado === 'Observada' && (
              <div>
                <div className="text-red-400 text-[11px]">Observada: {r.observacion} ({r.aprobadoPor})</div>
                {puede && (
                  <div className="mt-2 bg-slate-950 border border-slate-700 rounded p-2">
                    <div className="text-[9px] font-bold uppercase text-slate-400 mb-1">Corregir y aprobar</div>
                    <div className="flex gap-2 flex-wrap items-start">
                      <input value={corr[r.id] || ''} onChange={e => setCorr({ ...corr, [r.id]: e.target.value })}
                        placeholder="¿Qué corregiste? (obligatorio — lo revisa gerencia)"
                        className={`${inputCls} flex-1`} style={{ minWidth: '280px' }} />
                      <button onClick={() => corregir(r)} disabled={!(corr[r.id] || '').trim()}
                        className={btnOk(!!(corr[r.id] || '').trim())}>Guardar corrección y aprobar</button>
                    </div>
                    <div className="text-[9px] text-slate-500 mt-1">
                      Queda aprobada y pasa a la cola de reposición. El detalle y la fecha quedan visibles para gerencia.</div>
                  </div>
                )}
              </div>
            )}
            {r.estado === 'Aprobada' && (
              <div className="text-[11px] text-slate-500">
                {r.diferencia != null && Math.abs(r.diferencia) >= 0.005 && (
                  <div className={`mb-1 ${r.difPor ? 'text-red-400' : 'text-yellow-400'}`}>
                    {r.diferencia < 0 ? 'Faltaron' : 'Sobraron'} S/ {Math.abs(r.diferencia).toFixed(2)} en el arqueo
                    {r.difMotivo && <> · {r.difMotivo}</>}
                    {r.difPor && <> · resuelto por {r.difPor} el {fmt(r.difFecha)}: {r.difNota}</>}
                  </div>
                )}
                {r.corrDetalle && (user.rol === 'gerente' || user.rol === 'administracion') && (
                  <div className="text-yellow-400 mb-1">
                    ⚠ Corregida por {r.corrPor} el {fmt(r.corrFecha)}: {r.corrDetalle}
                    {r.observacion && <span className="text-slate-500"> · se observó: {r.observacion}</span>}
                  </div>
                )}
                {/* Ya no se habla de reposición: con el modelo de entregas (mig. 38)
                    el comprador devuelve el vuelto y no hay fondo que reponer. Las
                    rendiciones viejas sí conservan su reposición y se siguen viendo. */}
                Aprobada por {r.aprobadoPor} el {fmt(r.fechaAprobacion)}
                {r.repOp && ` · repuesta (modelo anterior): ${[(bancoDe[r.proyecto] || {}).banco, `op. ${r.repOp}`].filter(Boolean).join(' ')} (${fmt(r.repFecha)}, ${r.repuestoPor})`}
              </div>
            )}
          </div>
        ))}
        <div className="mt-3 text-slate-500 text-[11px]">El comprador arranca el día en cero: Pagos le entrega dinero una o varias veces y esas entregas son el disponible de la jornada. Al cerrar devuelve el vuelto, administración lo cuenta al recibirlo y esa cuenta es el arqueo: <span className="font-mono">devuelto − (entregas − gastado)</span>. Si la diferencia supera la tolerancia de la obra, la resuelve gerencia.</div>
      </div>
    </div>
  );
}
