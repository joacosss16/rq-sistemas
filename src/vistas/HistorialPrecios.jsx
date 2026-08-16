// ============================================================
// Historial de precios por material y proveedor, con CSV.
// Lo usan Compras y el comprador (Frank negocia en mostrador con el).
// Movido de App.jsx (etapa 8 de la separación en módulos) con el
// texto idéntico; solo se agregó "export" y estos imports.
//
// OJO: dentro del csv() hay un carácter INVISIBLE (U+FEFF) pegado a
// la primera comilla — es lo que hace que Excel abra las tildes bien.
// Si se reteclea esa línea, se pierde sin que nada falle.
// ============================================================
import { useState, useMemo } from 'react';
import { HOY_ISO } from '../fechas';
import { buscarEnCatalogo } from '../busqueda';
import { inputCls, thCls } from '../ui';

export function HistorialPrecios({ db }) {
  const { catalogo, historialPrecios } = db;
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [cod, setCod] = useState('');

  // solo materiales que ya se compraron alguna vez
  const conCompras = useMemo(
    () => catalogo.filter(m => (historialPrecios[m[0]] || []).length > 0),
    [catalogo, historialPrecios]);
  const res = useMemo(() => (q.trim() ? buscarEnCatalogo(conCompras, q, 12) : []), [q, conCompras]);

  const mat = cod ? catalogo.find(m => m[0] === cod) : null;
  const compras = cod ? (historialPrecios[cod] || []) : [];

  const stats = useMemo(() => {
    if (!compras.length) return null;
    const ps = compras.map(c => c.precio);
    const min = Math.min(...ps), max = Math.max(...ps);
    const prom = ps.reduce((a, b) => a + b, 0) / ps.length;
    const ult = compras[0].precio, prim = compras[compras.length - 1].precio;
    const varPct = prim > 0 ? ((ult - prim) / prim) * 100 : 0;
    return { min, max, prom, ult, varPct, n: compras.length };
  }, [compras]);

  // Comparativa por proveedor: quién lo vende más barato
  const porProv = useMemo(() => {
    const m = {};
    compras.forEach(c => {
      const p = (m[c.prov] = m[c.prov] || { prov: c.prov, ruc: c.ruc, veces: 0, suma: 0, min: Infinity, ult: null, ultFecha: '' });
      p.veces += 1; p.suma += c.precio; p.min = Math.min(p.min, c.precio);
      if (!p.ultFecha || c.fecha > p.ultFecha) { p.ultFecha = c.fecha; p.ult = c.precio; }
    });
    return Object.values(m).map(p => ({ ...p, prom: p.suma / p.veces })).sort((a, b) => a.prom - b.prom);
  }, [compras]);

  const csv = () => {
    const esc = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const cab = ['Codigo', 'Material', 'Und', 'Fecha', 'Proveedor', 'RUC', 'Precio_Unitario', 'Cantidad', 'Subtotal', 'Factura', 'Proyecto'];
    const filas = compras.map(c => [cod, mat[1], mat[2], c.fecha, c.prov, c.ruc,
      c.precio.toFixed(2), c.cant, (c.precio * c.cant).toFixed(2), c.serie, c.proyecto].map(esc).join(','));
    const texto = '﻿' + cab.join(',') + '\n' + filas.join('\n');
    const blob = new Blob([texto], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `precios_${cod}_${HOY_ISO}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const sol = n => 'S/ ' + n.toFixed(2);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">
          Historial de precios · negociación con proveedores</div>
        <button onClick={() => setAbierto(v => !v)}
          className="ml-auto px-2.5 py-1.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-yellow-400 border border-slate-700 hover:border-yellow-400">
          {abierto ? '✕ Cerrar' : '📈 Ver historial'}</button>
      </div>
      {!abierto ? (
        <div className="text-slate-500 text-[11px] mt-2">
          Qué te cobró cada proveedor por un material, cuándo, y si el precio subió. {conCompras.length} material(es) con compras registradas.</div>
      ) : (
        <div className="mt-3">
          <input value={q} onChange={e => { setQ(e.target.value); setCod(''); }}
            placeholder="Buscar el material que vas a negociar…" className={`w-full ${inputCls} py-2 text-sm`} />
          {res.length > 0 && !cod && (
            <div className="mt-2 border border-slate-800 rounded divide-y divide-slate-800">
              {res.map(m => (
                <button key={m[0]} onClick={() => { setCod(m[0]); setQ(m[1]); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-slate-800">
                  <span className="font-mono text-[11px] text-slate-500">{m[0]}</span>
                  <span className="text-slate-200 text-xs">{m[1]}</span>
                  <span className="ml-auto text-[10px] text-slate-500">{(historialPrecios[m[0]] || []).length} compra(s)</span>
                </button>
              ))}
            </div>
          )}
          {q.trim() && res.length === 0 && !cod && (
            <div className="text-slate-500 text-[11px] mt-2">Sin coincidencias entre los materiales ya comprados.</div>
          )}

          {mat && stats && (
            <div className="mt-3">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="font-mono text-[11px] text-slate-500">{mat[0]}</span>
                <span className="text-slate-100 text-sm font-semibold">{mat[1]}</span>
                <span className="text-slate-500 text-[10px]">({mat[2]})</span>
                <button onClick={csv} className="ml-auto px-2.5 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700 hover:border-yellow-400 hover:text-yellow-400">
                  ⤓ CSV</button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                {[['Última compra', sol(stats.ult), 'text-slate-100'],
                  ['Más barato', sol(stats.min), 'text-green-400'],
                  ['Más caro', sol(stats.max), 'text-red-400'],
                  ['Promedio', sol(stats.prom), 'text-slate-300'],
                  ['Variación', (stats.varPct >= 0 ? '▲ +' : '▼ ') + stats.varPct.toFixed(1) + '%',
                    stats.varPct > 5 ? 'text-red-400' : stats.varPct < -5 ? 'text-green-400' : 'text-slate-400']].map(([l, v, c]) => (
                  <div key={l} className="bg-slate-950 border border-slate-800 rounded p-2">
                    <div className={`text-sm font-bold ${c}`}>{v}</div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-500 mt-0.5">{l}</div>
                  </div>
                ))}
              </div>

              <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">
                Por proveedor · {porProv.length} — el más barato primero</div>
              <table className="w-full text-xs mb-3">
                <thead><tr>{['Proveedor', 'Veces', 'Promedio', 'Más barato', 'Último precio'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
                <tbody>
                  {porProv.map((p, idx) => (
                    <tr key={p.prov} className="border-b border-slate-800">
                      <td className="py-1.5 px-1.5 text-slate-200">{p.prov}
                        {idx === 0 && porProv.length > 1 && <span className="ml-2 px-1.5 py-0.5 rounded bg-green-950 text-green-400 text-[8px] font-bold uppercase">mejor precio</span>}</td>
                      <td className="py-1.5 px-1.5 text-slate-500">{p.veces}</td>
                      <td className="py-1.5 px-1.5 font-mono text-slate-300">{sol(p.prom)}</td>
                      <td className="py-1.5 px-1.5 font-mono text-green-400">{sol(p.min)}</td>
                      <td className="py-1.5 px-1.5 font-mono text-slate-200">{sol(p.ult)} <span className="text-slate-600 text-[9px]">{fmt(p.ultFecha)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">
                Todas las compras · {compras.length} — de la más reciente a la más antigua</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr>{['Fecha', 'Proveedor', 'Precio und', 'Cant', 'Subtotal', 'Factura', 'Obra'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
                  <tbody>
                    {compras.map((c, i) => {
                      const prev = compras[i + 1];   // la compra anterior en el tiempo
                      const sube = prev && c.precio > prev.precio * 1.05;
                      const baja = prev && c.precio < prev.precio * 0.95;
                      return (
                        <tr key={i} className="border-b border-slate-800">
                          <td className="py-1.5 px-1.5 text-slate-400">{fmt(c.fecha)}</td>
                          <td className="py-1.5 px-1.5 text-slate-300">{c.prov}</td>
                          <td className={`py-1.5 px-1.5 font-mono ${sube ? 'text-red-400' : baja ? 'text-green-400' : 'text-slate-200'}`}>
                            {sol(c.precio)} {sube && '▲'}{baja && '▼'}</td>
                          <td className="py-1.5 px-1.5 text-slate-500">{c.cant}</td>
                          <td className="py-1.5 px-1.5 font-mono text-slate-400">{sol(c.precio * c.cant)}</td>
                          <td className="py-1.5 px-1.5 font-mono text-[10px] text-slate-500">{c.serie}</td>
                          <td className="py-1.5 px-1.5 text-slate-500 text-[10px]">{c.proyecto}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-slate-500 text-[10px]">
                ▲ rojo: subió más de 5% respecto de la compra anterior · ▼ verde: bajó más de 5%.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
