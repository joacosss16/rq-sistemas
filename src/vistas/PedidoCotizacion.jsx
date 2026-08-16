// Movido de App.jsx (etapa 9 de la separacion en modulos), texto identico.
import { useState } from 'react';
import { HOY_ISO } from '../fechas';
import { PROYECTOS } from '../maestros';
import { Aviso, FiltroProyecto, FechaInput, inputCls, lblCls, thCls, btnOk } from '../ui';

// Las props user/db que no se usan viajan tal cual: limpiar firmas de
// props es de otra revision, no de la mudanza.

// Pedido por cotización (enchapes): lo registra Lucía con la cotización que
// le alcanza el arquitecto. Crea cada material 97xxxx y el pedido, ya aprobado.
export function PedidoCotizacion({ user, db, api }) {
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
