// Movido de App.jsx (etapa 9 de la separacion en modulos), texto identico.
import { useState, Fragment } from 'react';
import { HOY_ISO, fmt, dias, diasHoy } from '../fechas';
import { vencimientoDe, MEDIOS_PAGO, ETIQUETA_NRO, SIN_BANCO } from '../pago';
import { PROYECTOS } from '../maestros';
import { Aviso, AnularBox, FiltroProyecto, FechaInput, inputCls, thCls, btnOk, pendCls } from '../ui';

// El alias interno (const vencimiento = vencimientoDe) se conserva tal
// cual: de esa linea cuelga toda la columna Vence. No deduplicar.

export function Pagos({ user, db, api }) {
  const { facturas, rendiciones, bancoDe, entregas = [] } = db;
  // Mónica lleva una sola cuenta (rol administracion) y hace las dos cosas.
  // Se compensa haciéndolo visible: Auditoría avisa cuando la misma persona
  // registró las entregas de un día y además cerró el arqueo de esa jornada.
  const puede = user.rol === 'pagos' || user.rol === 'administracion';
  // Entregas de efectivo del día (migración 38)
  const [fEnt, setFEnt] = useState({
    proyecto: (PROYECTOS[0] || ['', ''])[1], monto: '', medio: 'Transferencia', numOp: '', fecha: HOY_ISO, motivo: '',
  });
  // Últimos días, no solo hoy: si nadie registró la entrega de ayer, tiene que
  // haber forma de ponerla. Si no, la rendición de ese día queda con recibido
  // en cero y el arqueo saca todo el efectivo como faltante, para siempre.
  const DIAS_ENTREGAS = 7;
  // Estado de la jornada de cada entrega. Si la rendicion de ese dia ya se
  // cerro, la entrega quedo cuadrada: se sigue viendo (Pagos necesita
  // comprobar que entrego) pero ya no se puede anular -- la base lo rechaza
  // porque cambiaria un arqueo aprobado, y un boton que no puede cumplir es
  // peor que no tenerlo.
  const diaCerrado = (proyecto, fecha) => {
    const r = rendiciones.find(x => x.proyecto === proyecto && x.fecha === fecha);
    return r && r.estado !== 'Abierta' ? r.estado : null;
  };
  // Por defecto solo lo que sigue vivo: una entrega de un dia ya cerrado esta
  // cuadrada y no le queda nada por hacer a Pagos. Se pueden ver con el enlace.
  const [verCuadradas, setVerCuadradas] = useState(false);
  const entregasRecientes = entregas
    .filter(e => -diasHoy(e.fecha) <= DIAS_ENTREGAS)
    .filter(e => verCuadradas || !diaCerrado(e.proyecto, e.fecha))
    .sort((a, b) => (a.fecha === b.fecha ? b.n - a.n : (a.fecha < b.fecha ? 1 : -1)));
  const nCuadradas = entregas.filter(e => -diasHoy(e.fecha) <= DIAS_ENTREGAS
    && diaCerrado(e.proyecto, e.fecha)).length;
  // Una entrega con fecha atrasada exige explicar por que no se registro en su
  // momento. La del dia -- el caso normal, varias veces por jornada -- no.
  const entregaAtrasada = fEnt.fecha !== HOY_ISO;
  const entregaOk = puede && Number(fEnt.monto) > 0
    && (fEnt.medio === 'Efectivo' || fEnt.numOp.trim().length > 0)
    && (!entregaAtrasada || fEnt.motivo.trim().length > 0);
  const [proy, setProy] = useState('TODOS');
  const [fPago, setFPago] = useState({});
  const [fSerie, setFSerie] = useState({});   // serie real de las facturas por llegar
  const [verPagadas, setVerPagadas] = useState(false);   // lo hecho, plegado por defecto
  const [aviso, setAviso] = useState('');
  // Quien compró no cierra su propio documento: lo digita administración
  const puedeSerie = user.rol === 'administracion' || user.rol === 'pagos' || user.rol === 'gerente';

  // Una factura anulada no se paga: la base rechaza cualquier cambio sobre ella.
  // Dejarla en la cola solo ofrecia un boton que iba a fallar DESPUES de que
  // Pagos ya hizo la transferencia en el banco, y de paso inflaba la deuda de
  // la obra. Su rastro se sigue viendo tachado en Compras, que es su sitio.
  const fs = facturas.filter(f => !f.anulMotivo && (proy === 'TODOS' || f.proyecto === proy));
  const pend = fs.filter(f => f.estadoPago !== 'Pagada');
  const pagadas = fs.filter(f => f.estadoPago === 'Pagada');
  // Se paga obra por obra: cada una tiene su cuenta, así que quien paga entra a
  // un banco, liquida lo de esa obra y recién cambia de cuenta. La lista va
  // agrupada por obra con su banco y su subtotal, no mezclada.
  const porObra = Object.entries(
    pend.reduce((acc, f) => { (acc[f.proyecto] = acc[f.proyecto] || []).push(f); return acc; }, {})
  ).sort((a, b) => a[0].localeCompare(b[0], 'es'));
  // Ninguna cuenta cargada = no se pudo leer la tabla, no es que falte
  // configurar una obra. Son dos problemas distintos y se avisan distinto.
  const sinCuentas = Object.keys(bancoDe).length === 0;
  // reposiciones de caja chica: rendiciones aprobadas aún sin reponer
  // Compras ya pagadas cuyo documento aún no llega (migración 29)
  const porLlegar = fs.filter(f => f.tipoDoc === 'Pendiente' && !f.anulMotivo)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));

  const completarSerie = async f => {
    const serie = (fSerie[f.id] || '').trim();
    if (!serie) return;
    const r = await api.completarSerie(f.id, serie);
    if (r.error) { setAviso('⚠ ' + r.error); setTimeout(() => setAviso(''), 7000); return; }
    const s2 = { ...fSerie }; delete s2[f.id]; setFSerie(s2);
    setAviso(`Factura ${serie.toUpperCase()} registrada: ${f.serie} queda cerrada con su documento.`);
    setTimeout(() => setAviso(''), 5000);
  };

  const vencimiento = vencimientoDe;

  const getP = id => fPago[id] || { medio: 'Transferencia', op: '', fecha: HOY_ISO, serieReal: '' };
  const setP = (id, k, v) => setFPago({ ...fPago, [id]: { ...getP(id), [k]: v } });

  const pagar = async f => {
    const p = getP(f.id);
    const banco = (bancoDe[f.proyecto] || {}).banco || '';
    const esComp = f.tipoDoc === 'Compromiso';
    if (!p.medio || !p.op.trim() || !p.fecha || (!banco && !SIN_BANCO(p.medio))
        || (esComp && !(p.serieReal || '').trim())) return;
    const r = await api.pagarFactura(f.id, {
      medio: p.medio, banco: SIN_BANCO(p.medio) ? null : banco, op: p.op.trim(), fecha: p.fecha,
      serieReal: esComp ? p.serieReal.trim() : null,
    });
    if (r.error) { setAviso('⚠ ' + r.error); setTimeout(() => setAviso(''), 7000); return; }
    const f2 = { ...fPago }; delete f2[f.id]; setFPago(f2);
    const detalle = SIN_BANCO(p.medio) ? `${p.medio} ${p.op}` : `${p.medio} · ${banco} · ${p.op}`;
    setAviso(esComp
      ? `Compromiso ${f.serie} pagado y convertido en factura ${p.serieReal.trim().toUpperCase()} (${detalle}).`
      : `Factura ${f.serie} saldada (${detalle}).`);
    setTimeout(() => setAviso(''), 5000);
  };

  const entregar = async () => {
    if (!entregaOk) return;
    const r = await api.registrarEntrega(fEnt);
    if (r.error) { setAviso('⚠ ' + r.error); setTimeout(() => setAviso(''), 7000); return; }
    setAviso(`Entrega de S/ ${Number(fEnt.monto).toFixed(2)} a ${fEnt.proyecto} registrada${fEnt.fecha !== HOY_ISO ? ` con fecha ${fmt(fEnt.fecha)}` : ''}.`);
    setFEnt({ ...fEnt, monto: '', numOp: '', motivo: '' });
    setTimeout(() => setAviso(''), 5000);
  };

  const anularEnt = async (e, motivo) => {
    const r = await api.anularEntrega(e.id, motivo);
    if (r.error) { setAviso('⚠ ' + r.error); setTimeout(() => setAviso(''), 8000); return; }
    setAviso(`Entrega de S/ ${e.monto.toFixed(2)} anulada.`);
    setTimeout(() => setAviso(''), 5000);
  };


  return (
    <div>
      {/* Entregas de efectivo del día (migración 38). La caja chica no es un
          fondo fijo: al comprador se le entrega dinero una o varias veces al
          día, y lo que reciba es contra lo que se cuadra el cierre. */}
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-1">
          Entregas de efectivo al comprador · días sin cerrar
          {nCuadradas > 0 && (
            <button onClick={() => setVerCuadradas(!verCuadradas)}
              className="ml-2 text-[10px] font-bold uppercase text-sky-400 hover:text-sky-300">
              {verCuadradas ? '· ocultar las cuadradas' : `· ver ${nCuadradas} ya cuadrada(s)`}
            </button>
          )}</div>
        <div className="text-[11px] text-slate-500 mb-3">
          Cada vez que le entregas dinero, regístralo aquí. Al cerrar el día, administración cuenta lo que devuelve y lo compara contra estas entregas menos lo gastado.</div>
        {puede && (
          <div className="flex items-end gap-2 flex-wrap mb-3">
            <div><div className="text-[9px] font-bold uppercase text-slate-500 mb-0.5">Obra</div>
              <FiltroProyecto value={fEnt.proyecto} onChange={v => setFEnt({ ...fEnt, proyecto: v })} /></div>
            <div><div className="text-[9px] font-bold uppercase text-slate-500 mb-0.5">Día de la entrega</div>
              {/* Se permiten dias anteriores (si nadie registro la de ayer hay que
                  poder ponerla) pero no futuros: no se entrega dinero manana.
                  La base ademas rechaza los dias con la rendicion ya cerrada. */}
              <FechaInput value={fEnt.fecha} max={HOY_ISO}
                onChange={e => setFEnt({ ...fEnt, fecha: e.target.value })} className={`w-32 ${inputCls}`} /></div>
            <div><div className="text-[9px] font-bold uppercase text-slate-500 mb-0.5">Monto S/</div>
              <input type="number" step="any" min="0" value={fEnt.monto}
                onChange={e => setFEnt({ ...fEnt, monto: e.target.value })} className={`w-28 ${inputCls} font-mono`} /></div>
            <div><div className="text-[9px] font-bold uppercase text-slate-500 mb-0.5">Medio</div>
              <select value={fEnt.medio} onChange={e => setFEnt({ ...fEnt, medio: e.target.value })} className={inputCls}>
                {['Transferencia', 'Efectivo', 'Cheque'].map(m => <option key={m}>{m}</option>)}</select></div>
            <div><div className="text-[9px] font-bold uppercase text-slate-500 mb-0.5">
              {fEnt.medio === 'Efectivo' ? 'N° operación (no aplica)' : 'N° de operación *'}</div>
              <input value={fEnt.numOp} disabled={fEnt.medio === 'Efectivo'}
                onChange={e => setFEnt({ ...fEnt, numOp: e.target.value })}
                placeholder={fEnt.medio === 'Efectivo' ? '—' : 'del banco'} className={`w-32 ${inputCls} font-mono`} /></div>
            {entregaAtrasada && (
              <div><div className="text-[9px] font-bold uppercase text-orange-400 mb-0.5">¿Por qué no se registró ese día? *</div>
                <input value={fEnt.motivo} onChange={e => setFEnt({ ...fEnt, motivo: e.target.value })}
                  placeholder="Ej.: se transfirió el viernes y se apuntó el lunes"
                  className={`w-72 ${inputCls}`} /></div>
            )}
            <button onClick={entregar} disabled={!entregaOk} className={btnOk(entregaOk)}>Registrar entrega</button>
          </div>
        )}
        {entregasRecientes.length === 0 ? (
          <div className="text-center py-4 text-slate-500 text-sm">
            {nCuadradas > 0 ? 'Todo cuadrado: no queda ninguna entrega de un día abierto.'
                            : `Sin entregas registradas en los últimos ${DIAS_ENTREGAS} días.`}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['Día', 'Obra', 'Monto S/', 'Medio', 'N° operación', 'Entregó', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {entregasRecientes.map(e => {
                  const cerrada = diaCerrado(e.proyecto, e.fecha);
                  return (
                  <tr key={e.id} className={`border-b border-slate-800 ${e.anulMotivo ? 'opacity-60 line-through' : cerrada ? 'opacity-70' : ''}`}>
                    <td className={`py-2 px-1.5 whitespace-nowrap ${e.fecha === HOY_ISO ? 'text-slate-300' : 'text-slate-500'}`}>{fmt(e.fecha)}
                      {cerrada && <div className="text-[9px] text-green-600 no-underline">rendicion {cerrada.toLowerCase()}</div>}</td>
                    <td className="py-2 px-1.5 text-slate-300 whitespace-nowrap">{e.proyecto}</td>
                    <td className="py-2 px-1.5 font-mono text-slate-200 text-right">{e.monto.toFixed(2)}</td>
                    <td className="py-2 px-1.5 text-slate-400">{e.medio}</td>
                    <td className="py-2 px-1.5 font-mono text-slate-400">{e.numOp || '—'}</td>
                    <td className="py-2 px-1.5 text-slate-400 text-[10px]">{e.entregadoPor}
                      {e.motivoAtraso && <div className="text-[9px] text-orange-400 no-underline">Registrada después: {e.motivoAtraso}</div>}
                      {e.anulMotivo && <div className="text-[9px] text-red-400 no-underline">Anulada: {e.anulMotivo} ({e.anulPor})</div>}</td>
                    <td className="py-2 px-1.5 no-underline">
                      {e.anulMotivo ? null
                        : cerrada ? <span className="text-[9px] text-slate-500 whitespace-nowrap" title="La rendicion de ese dia ya se cerro: anular esta entrega cambiaria un arqueo aprobado.">dia cuadrado</span>
                        : puede ? <AnularBox label="Anular" onConfirm={m => anularEnt(e, m)} />
                        : null}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
              <thead><tr>{['N° Factura', 'Fecha', 'Proveedor', 'RUC', 'Rellenó', 'Ítems', 'Monto S/', 'Forma', 'Vence', 'Medio', 'N°', 'F. pago', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {porObra.map(([obra, lista]) => (
                  <Fragment key={obra}>
                    <tr className="bg-slate-800/60 border-y border-slate-700">
                      <td colSpan={13} className="py-1.5 px-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-200">{obra}</span>
                          {(bancoDe[obra] || {}).banco
                            ? <span className="text-[10px] text-slate-400">{bancoDe[obra].banco}
                                {bancoDe[obra].cuenta && <span className="font-mono"> · {bancoDe[obra].cuenta}</span>}</span>
                            : <span className="text-[10px] font-bold text-red-400">{sinCuentas
                                ? '⚠ no se pudieron leer las cuentas · recarga la página antes de pagar'
                                : '⚠ esta obra no tiene cuenta configurada · no se puede pagar'}</span>}
                          <span className="ml-auto text-[10px] text-slate-400">{lista.length} por pagar ·{' '}
                            <span className="font-mono text-slate-200">S/ {lista.reduce((a, f) => a + f.monto, 0).toFixed(2)}</span></span>
                        </div>
                      </td>
                    </tr>
                    {lista.map(f => {
                  const p = getP(f.id);
                  const venc = vencimiento(f);
                  const atrasada = diasHoy(venc) < 0;
                  const bancoObra = (bancoDe[f.proyecto] || {}).banco || '—';
                  const esComp = f.tipoDoc === 'Compromiso';
                  const listo = puede && p.medio && p.op.trim() && p.fecha
                    && (bancoObra !== '—' || SIN_BANCO(p.medio))
                    && (!esComp || (p.serieReal || '').trim());
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
                      <td className="py-2 px-1.5 text-slate-400 whitespace-nowrap text-[10px]">{f.registradoPor || '—'}</td>
                      <td className="py-2 px-1.5 text-slate-300 text-[10px]">{f.items.map(x => `RQ-${String(x.rq).padStart(3, '0')} ${x.desc}`).join(' · ')}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-200 text-right">{f.monto.toFixed(2)}</td>
                      <td className="py-2 px-1.5 text-slate-400 whitespace-nowrap">{f.forma}</td>
                      <td className={`py-2 px-1.5 whitespace-nowrap font-mono ${atrasada ? 'text-red-400 font-bold' : 'text-slate-300'}`}>{fmt(venc)}{atrasada ? ` · ${-diasHoy(venc)}d atraso` : ''}</td>
                      <td className="py-2 px-1.5">
                        <select value={p.medio} onChange={e => setP(f.id, 'medio', e.target.value)} disabled={!puede} className={inputCls}>
                          {MEDIOS_PAGO.map(b => <option key={b}>{b}</option>)}</select></td>
                      <td className="py-2 px-1.5"><input value={p.op} onChange={e => setP(f.id, 'op', e.target.value)} disabled={!puede} placeholder={ETIQUETA_NRO[p.medio] || 'N°'} className={`w-24 ${inputCls} font-mono`} /></td>
                      <td className="py-2 px-1.5"><FechaInput value={p.fecha} onChange={e => setP(f.id, 'fecha', e.target.value)} className={`w-32 ${inputCls}`} /></td>
                      <td className="py-2 px-1.5"><button onClick={() => pagar(f)} disabled={!listo} className={btnOk(!!listo)}>Registrar pago</button></td>
                    </tr>
                  );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">Cada obra paga desde su propia cuenta y por eso la lista va separada por obra, con su banco y su subtotal. Una factura pagada queda congelada (no se puede editar ni volver a pagar).</div>
      </div>

      {porLlegar.length > 0 && (
        <div className="bg-slate-900 border border-sky-800 rounded-md p-4 mb-3">
          <div className="text-[11px] font-bold tracking-widest text-sky-400 uppercase">
            Facturas por llegar · {porLlegar.length}</div>
          <div className="text-[10px] text-slate-500 mb-3">
            Compras ya pagadas cuyo documento todavía no llega. Cuando lo tengas en la mano, digita su serie real.</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['Interna', 'Pagada el', 'Proveedor', 'RUC', 'Obra', 'Monto S/', 'Cómo se pagó', 'Espera', 'Serie real de la factura', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {porLlegar.map(f => {
                  const d = dias(HOY_ISO, f.fecha);
                  const col = d >= 7 ? 'text-red-400 font-bold' : d >= 3 ? 'text-yellow-400' : 'text-slate-400';
                  const v = (fSerie[f.id] || '').trim();
                  return (
                    <tr key={f.id} className="border-b border-slate-800">
                      <td className="py-2 px-1.5 font-mono text-sky-400">{f.serie}</td>
                      <td className="py-2 px-1.5 text-slate-400">{fmt(f.fecha)}</td>
                      <td className="py-2 px-1.5 text-slate-300">{f.prov}</td>
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{f.ruc}</td>
                      <td className="py-2 px-1.5 text-slate-400">{f.proyecto}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-200 text-right">{f.monto.toFixed(2)}</td>
                      <td className="py-2 px-1.5 text-slate-400 text-[10px]">{f.medio || f.forma}{f.numOp ? ` · op. ${f.numOp}` : ''}</td>
                      <td className={`py-2 px-1.5 font-mono ${col}`}>{d}d</td>
                      <td className="py-2 px-1.5">
                        <input value={fSerie[f.id] || ''} onChange={e => setFSerie({ ...fSerie, [f.id]: e.target.value })}
                          disabled={!puedeSerie} placeholder="F001-000123" className={`w-32 ${inputCls} font-mono`} /></td>
                      <td className="py-2 px-1.5">
                        <button onClick={() => completarSerie(f)} disabled={!puedeSerie || !v} className={btnOk(!!(puedeSerie && v))}>Registrar</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-slate-500 text-[10px]">
            Ámbar a los 3 días, rojo a los 7. Si el proveedor no entrega, coordina con Compras: ellos tienen la relación comercial.</div>
        </div>
      )}

      {/* El bloque de "Reposiciones de caja chica" se eliminó con la migración 38:
          reponer un fondo fijo no existe en este modelo. El dinero entra por las
          entregas del día (arriba) y sale por el vuelto que el comprador devuelve
          al cerrar, que administración cuenta al recibirlo. */}

      {/* Lo pagado ya no requiere ninguna accion de Pagos: se consulta cuando
          hace falta, no ocupa la pantalla de trabajo. Con 210 facturas encima,
          lo que si hay que pagar quedaba enterrado debajo. */}
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">
            Facturas pagadas · {pagadas.length}{pagadas.length > 0 ? ` · S/ ${pagadas.reduce((a, f) => a + f.monto, 0).toFixed(2)}` : ''}</div>
          {pagadas.length > 0 && (
            <button onClick={() => setVerPagadas(!verPagadas)}
              className="text-[10px] font-bold uppercase text-sky-400 hover:text-sky-300">
              {verPagadas ? '· ocultar' : '· ver el detalle'}
            </button>
          )}
        </div>
        {pagadas.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Aún no hay facturas pagadas{proy !== 'TODOS' ? ' en ' + proy : ''}.</div>
        ) : !verPagadas ? (
          <div className="text-slate-500 text-[11px]">Ya no requieren ninguna acción. Pulsa “ver el detalle” si necesitas consultar alguna.</div>
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
