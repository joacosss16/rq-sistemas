// Movido de App.jsx (etapa 9 de la separacion en modulos), texto identico.
import { estadoCaducidad, stockDetalleObra } from '../stock';
import { ALMACENEROS } from '../maestros';
import { thCls } from '../ui';

// Almacén del residente: la misma foto que ve su almacenero, en solo lectura
export function AlmacenResidente({ user, db }) {
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
