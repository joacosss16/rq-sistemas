// Movido de App.jsx (etapa 9 de la separacion en modulos), texto identico.
import { useState, Fragment, useEffect } from 'react';
import { fmt } from '../fechas';
import { calcularStocks } from '../stock';
import { PROYECTOS } from '../maestros';
import { FiltroProyecto, thCls, pillEstado } from '../ui';

// Historial de pedidos por material (residente: su obra · gerencia: todas)
export function HistorialMateriales({ user, db, obraGlobal }) {
  const esRes = user.rol === 'residente';
  const [proy, setProy] = useState(esRes ? user.proyecto : 'TODOS');
  // Gerencia elige la obra en la cabecera y los modulos la siguen. Va pegado
  // al estado del filtro, con los demas ganchos: bajarlo tumba la vista.
  useEffect(() => { if (obraGlobal) setProy(obraGlobal); }, [obraGlobal]);
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
