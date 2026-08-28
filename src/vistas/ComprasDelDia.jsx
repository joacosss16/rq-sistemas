// Movido de App.jsx (etapa 9 de la separacion en modulos), texto identico.
import { useState } from 'react';
import { fmt, diasHoy } from '../fechas';
import { Aviso, inputCls, thCls, btnOk } from '../ui';

export function ComprasDelDia({ db, api }) {
  const { rqs, mejorPrecio2m = {} } = db;
  const EN_LETRAS = { 2: 'dos', 3: 'tres', 4: 'cuatro', 5: 'cinco' };
  const [aviso, setAviso] = useState('');
  // Un solo avisador para toda la vista. Antes cada función repetía el
  // setTimeout a mano y `registrarParcial` llamaba a un `avisar()` que no
  // existía aquí: el caso más común del día de Frank —conseguir 8 de 10—
  // reventaba la pantalla entera, con el efectivo ya gastado.
  const avisar = (m, ms = 4000) => { setAviso(m); setTimeout(() => setAviso(''), ms); };

  const marcarComprado = async it => {
    const r = await api.updItem(it.id, { estado: 'Comprado' });
    if (r.error) { setAviso('⚠ ' + r.error); setTimeout(() => setAviso(''), 7000); return; }
    setAviso(`RQ-${String(it.rq).padStart(3, '0')} · ${it.proyecto}: marcado como Comprado. Ya lo ve todo el equipo.`);
    setTimeout(() => setAviso(''), 4000);
  };

  // Frank compra lo de esta semana; lo ANTICIPADO (más de 7 días) es
  // planificación de Lucía -- importaciones y compras grandes que se cotizan y
  // se programan. Mezclarlo aquí empuja a comprar antes de tiempo, y adelantarse
  // tampoco es gratis: inmoviliza plata, ocupa almacén y el material se estropea.
  const HORIZONTE = 7;
  const [verTodo, setVerTodo] = useState(false);
  const todosPendientes = rqs.flatMap(r => r.items.map(i => ({ ...i, rq: r.n, proyecto: r.proyecto })))
    .filter(i => i.decision === 'Aprobado' && !i.factura && i.estado === '—');
  const masAdelante = todosPendientes.filter(i => diasHoy(i.fecha) > HORIZONTE).length;
  const pendientes = verTodo ? todosPendientes
    : todosPendientes.filter(i => diasHoy(i.fecha) <= HORIZONTE);

  const tomar = async (x, valor) => {
    const r = await api.tomarItem(x.id, valor);
    if (r.error) { setAviso('⚠ ' + r.error); setTimeout(() => setAviso(''), 7000); return; }
    setAviso(valor
      ? `Te encargas de "${x.desc}" (RQ-${String(x.rq).padStart(3, '0')}). Lucía lo verá tomado por ti. Caduca solo mañana.`
      : `Soltaste "${x.desc}": vuelve a quedar libre.`);
    setTimeout(() => setAviso(''), 5000);
  };

  const [parcial, setParcial] = useState({});
  const registrarParcial = async x => {
    const f = parcial[x.id];
    const r = await api.compraParcial({ id: x.id }, f.cant, f.motivo, false);
    if (r.error) { avisar('⚠ ' + r.error, 8000); return; }
    const p2 = { ...parcial }; delete p2[x.id]; setParcial(p2);
    avisar(`Compra parcial registrada: ${f.cant} de ${x.cant}. El saldo de ${x.cant - Number(f.cant)} vuelve a la cola de compras.`, 7000);
  };

  const grupos = Object.values(pendientes.reduce((acc, i) => {
    if (!acc[i.cod]) acc[i.cod] = { cod: i.cod, desc: i.desc, und: i.und, total: 0, porRQ: [], minFecha: i.fecha, proyectos: new Set() };
    const g = acc[i.cod];
    g.total += Number(i.cant);
    g.porRQ.push({ id: i.id, rq: i.rq, proyecto: i.proyecto, cant: Number(i.cant), fecha: i.fecha,
                   desc: i.desc, tomadoPor: i.tomadoPor });
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
          Compras del día · {grupos.length} material(es) · {verTodo ? 'todo lo pendiente' : `para los próximos ${HORIZONTE} días`} · urgentes primero
          {masAdelante > 0 && (
            <button onClick={() => setVerTodo(!verTodo)}
              className="ml-2 text-[10px] font-bold uppercase text-sky-400 hover:text-sky-300">
              {verTodo ? '· ver solo esta semana' : `· ver ${masAdelante} para más adelante`}
            </button>
          )}</div>
        <Aviso msg={aviso} />
        {grupos.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">
            {masAdelante > 0
              ? `Nada urgente hoy. Hay ${masAdelante} ítem(s) para más adelante: los gestiona Lucía.`
              : 'Nada por comprar: no hay ítems aprobados pendientes. ¡Buen día!'}</div>
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
                      <div className="font-mono text-[10px] text-slate-500">{g.cod}</div>
                      {mejorPrecio2m[g.cod] && (
                        <div className="text-[10px] text-sky-400 mt-1" title="Precio más bajo al que se compró en los últimos 2 meses. Úsalo para negociar.">
                          ▼ Más barato 2 meses: <b>S/ {mejorPrecio2m[g.cod].precio.toFixed(2)}</b> · {mejorPrecio2m[g.cod].prov}</div>
                      )}</td>
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
                        <div key={k} className="h-7 flex items-center gap-1">
                          {x.tomadoPor
                            ? <button onClick={() => tomar(x, false)}
                                className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-sky-950 text-sky-300 border border-sky-800 whitespace-nowrap"
                                title="Lo tomaste tú (o alguien). Pulsa para soltarlo y que vuelva a quedar libre.">✋ {x.tomadoPor.split(' ')[0]}</button>
                            : <button onClick={() => tomar(x, true)}
                                className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-sky-400 border border-slate-700 hover:border-sky-400 whitespace-nowrap"
                                title="Avisa al resto de que tú te encargas de comprar esto hoy. Caduca solo mañana.">Me encargo</button>}
                          <button onClick={() => marcarComprado(x)}
                            className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-green-400 border border-slate-700 hover:border-green-400 whitespace-nowrap"
                            title="Marca este ítem como comprado o recogido. Cambia el estado para todo el equipo.">✓ Comprado</button>
                          <button onClick={() => setParcial({ ...parcial, [x.id]: { cant: '', motivo: '' } })}
                            className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-orange-400 border border-slate-700 hover:border-orange-400 whitespace-nowrap"
                            title="Si el proveedor no tenía todo: se registra lo que conseguiste y el saldo vuelve a la cola de compras.">Parcial</button>
                        </div>
                      ))}
                      {/* Formulario de compra parcial, debajo de los botones */}
                      {g.porRQ.filter(x => parcial[x.id]).map(x => (
                        <div key={'p' + x.id} className="mt-1 p-2 bg-slate-950 border border-orange-800 rounded w-64">
                          <div className="text-[9px] font-bold uppercase text-orange-400 mb-1">
                            Compra parcial · RQ-{String(x.rq).padStart(3, '0')} (pedido: {x.cant})</div>
                          <input type="number" min="1" step="any" value={parcial[x.id].cant}
                            onChange={e => setParcial({ ...parcial, [x.id]: { ...parcial[x.id], cant: e.target.value } })}
                            placeholder={`¿Cuánto conseguiste? (menos de ${x.cant})`} className={`w-full mb-1 ${inputCls}`} />
                          <input value={parcial[x.id].motivo}
                            onChange={e => setParcial({ ...parcial, [x.id]: { ...parcial[x.id], motivo: e.target.value } })}
                            placeholder="¿Por qué no había todo?" className={`w-full mb-1 ${inputCls}`} />
                          <div className="flex gap-1">
                            <button onClick={() => registrarParcial(x)}
                              disabled={!(Number(parcial[x.id].cant) > 0 && Number(parcial[x.id].cant) < x.cant && parcial[x.id].motivo.trim())}
                              className={btnOk(Number(parcial[x.id].cant) > 0 && Number(parcial[x.id].cant) < x.cant && !!parcial[x.id].motivo.trim())}>Registrar</button>
                            <button onClick={() => { const p2 = { ...parcial }; delete p2[x.id]; setParcial(p2); }}
                              className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-400">Cancelar</button>
                          </div>
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
