// Movido de App.jsx (etapa 9 de la separacion en modulos), texto identico.
import { useState, useEffect } from 'react';
import { HOY_ISO, fmt, dias, diasHoy } from '../fechas';
import { estadoCaducidad, stockDetalleObra } from '../stock';
import { PROYECTOS, ALMACENEROS } from '../maestros';
import { Aviso, AnularBox, FiltroProyecto, FechaInput, inputCls, lblCls, thCls, btnOk, btnRojo, btnVerde, pillEstado } from '../ui';

// La lista de motivos de uso incorrecto viaja con la vista: nadie mas la usa.
const MOTIVOS_USO = ['No se completó el trabajo', 'Se encontró botado', 'Uso inadecuado', 'Otro'];

export function Almacen({ user, db, api, obraGlobal }) {
  const { rqs, salidas, prestamos, stockInicial, factorMap, pereceMap, precioProm = {} } = db;
  const esAlm = user.rol === 'almacen';
  // Gerencia entra aqui a VIGILAR, no a operar (decision del dueno, 18 ago
  // 2026). Los formularios de recibir, corregir y prestar son la mesa de
  // trabajo del almacenero y para quien viene a mirar son ruido.
  // La suplencia (almacenero de vacaciones) NO se resuelve devolviendo estos
  // formularios: va con cuentas de emergencia, apuntado para despues del piloto.
  const soloVigila = !esAlm;
  const [form, setForm] = useState({});
  const [aviso, setAviso] = useState('');
  const [proy, setProy] = useState(esAlm ? user.proyecto : (PROYECTOS[0] ? PROYECTOS[0][1] : ''));
  // Gerencia elige la obra en la cabecera y los modulos la siguen. Va pegado
  // al estado del filtro, con los demas ganchos: bajarlo tumba la vista.
  // Un almacen es de UNA obra: no existe el "stock de todas", asi que esta vista
  // NO usa el selector global -- que ademas se oculta mientras se esta aqui.
  // Manda solo el de esta pantalla. Tener dos controles encendidos y en
  // desacuerdo era exactamente lo que confundia (18 ago 2026).
  const mandaLaCabecera = false;
  const [fSal, setFSal] = useState({});
  const [verif, setVerif] = useState({});
  const [fReing, setFReing] = useState({});
  const [fPres, setFPres] = useState({ cod: '', cant: '', destino: '', autoriza: '' });

  const avisar = (msg, ms = 5000) => { setAviso(msg); setTimeout(() => setAviso(''), ms); };

  const porRecibir = rqs.flatMap(r => r.items
    .filter(i => i.decision === 'Aprobado' && i.estado !== 'Entregado')
    .map(i => ({ ...i, rq: r.n, fechaRQ: r.fechaRQ, canalRq: r.canal, residente: r.residente, proyecto: r.proyecto })))
    .filter(i => i.proyecto === proy);

  const getF = id => form[id] || { cant: '', obs: '' };
  const setF = (id, k, v) => setForm({ ...form, [id]: { ...getF(id), [k]: v } });

  // Corrección de una cantidad mal digitada (migración 35). Se listan aparte
  // porque incluye lo ya ENTREGADO, que `porRecibir` deja fuera: es justo el
  // caso en que el error completó el pedido y el ítem desapareció de arriba.
  const DIAS_CORREGIR = 7;
  const fechaRec = i => i.fechaEntregaSaldo || i.fechaEntrega;
  const recibidasRecientes = rqs.flatMap(r => r.items
    .filter(i => i.decision === 'Aprobado' && Number(i.cantRecibida) > 0)
    .map(i => ({ ...i, rq: r.n, proyecto: r.proyecto })))
    .filter(i => i.proyecto === proy)
    .filter(i => fechaRec(i) && -diasHoy(fechaRec(i)) <= DIAS_CORREGIR)
    .sort((a, b) => (fechaRec(a) < fechaRec(b) ? 1 : -1));
  const [corr, setCorr] = useState({});
  const getC = id => corr[id] || { cant: '', motivo: '' };
  const setC = (id, k, v) => setCorr({ ...corr, [id]: { ...getC(id), [k]: v } });

  const corregir = async i => {
    const c = getC(i.id);
    const nueva = Number(c.cant);
    const motivo = c.motivo.trim();
    if (!motivo || c.cant === '' || !(nueva >= 0) || nueva > Number(i.cant) || nueva === Number(i.cantRecibida)) return;
    const r = await api.corregirRecepcion(i, nueva, motivo);
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
    const c2 = { ...corr }; delete c2[i.id]; setCorr(c2);
    avisar(`Recepción corregida: "${i.desc}" pasa de ${i.cantRecibida} a ${nueva}. Queda registrado con tu nombre, la fecha y el motivo.`, 6000);
  };

  const recibir = async i => {
    const f = getF(i.id);
    const fc = factorMap[i.cod];
    const rec = fc ? (Number(f.cajas) || 0) * (Number(f.upc ?? i.factorCaja ?? fc.factor) || 0) : Number(f.cant);
    if (!(rec > 0)) return;
    if (pereceMap[i.cod] && !f.cad) { avisar('⚠ Este material es perecedero: registra la fecha de caducidad de la etiqueta.', 5000); return; }
    const yaRecibido = Number(i.cantRecibida || 0);
    const pedido = Number(i.cant);
    if (yaRecibido + rec > pedido) {
      avisar(`⚠ No se puede recibir ${rec}: excede lo pedido (falta ${pedido - yaRecibido} de ${pedido}). Si el proveedor entregó de más, corrige el RQ con Compras.`, 6000);
      return;
    }
    const r = await api.recibir(i, rec, f.obs.trim(), pereceMap[i.cod] ? f.cad : null);
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
    // Los números los devuelve el servidor, que es el único que sabe cuánto
    // había de verdad: si alguien más recibió mientras esta pantalla estaba
    // abierta, aquí aparece el total real y no el que esta vista suponía.
    const d = r.data || {};
    const total = d.total != null ? Number(d.total) : yaRecibido + rec;
    const completo = d.completo != null ? !!d.completo : total >= pedido;
    const otro = d.yaHabia != null && Number(d.yaHabia) !== yaRecibido
      ? ` (ojo: alguien más ya había registrado ${d.yaHabia}, tu pantalla estaba desactualizada)` : '';
    const f2 = { ...form }; delete f2[i.id]; setForm(f2);
    avisar(completo
      ? `Recepción completa de "${i.desc}" registrada (${total}/${pedido})${otro}.`
      : `Recepción parcial de "${i.desc}": ${total}/${pedido}. Marcado como Incompleto en Compras y Almacén. Saldo pendiente: ${pedido - total}${otro}.`, otro ? 9000 : 5000);
  };

  const salidasProy = salidas.filter(s => s.proyecto === proy);
  const stock = stockDetalleObra(db, proy);

  // Alerta de materiales SIN MOVIMIENTO: con stock parado y sin entradas ni
  // salidas hace más de 30 días (capital y espacio inmovilizados).
  const DIAS_SIN_MOV = 30;
  const ultimoMov = {};
  const marcarMov = (c, d) => { if (d && (!ultimoMov[c] || d > ultimoMov[c])) ultimoMov[c] = d; };
  stockInicial.filter(si => si.proyecto === proy).forEach(si => marcarMov(si.cod, si.fecha));
  rqs.filter(r => r.proyecto === proy).forEach(r => r.items.forEach(i => {
    if (i.decision === 'Aprobado' && Number(i.cantRecibida) > 0) marcarMov(i.cod, i.fechaEntregaSaldo || i.fechaEntrega);
  }));
  salidas.filter(s => s.proyecto === proy && !s.anulada && s.aprobacion === 'Aprobada').forEach(s => marcarMov(s.cod, s.fecha));
  const sinMov = stock.filter(s => s.stock > 0)
    .map(s => ({ ...s, dias: ultimoMov[s.cod] ? -diasHoy(ultimoMov[s.cod]) : null, desde: ultimoMov[s.cod] || null }))
    .filter(s => s.dias === null || s.dias > DIAS_SIN_MOV)
    .sort((a, b) => (b.dias ?? 99999) - (a.dias ?? 99999));

  // Resumen de vigilancia. Sigue a la obra elegida, igual que el resto.
  //   NEGATIVO   -- descuadre real de inventario: el sistema dice que salio mas
  //                 de lo que entro. Alguien tiene que ir a contar.
  //   VENCIDO    -- ya no se puede usar y bloquea la salida. Plata perdida.
  //   POR VENCER -- a 30 dias o menos. Todavia se puede consumir o transferir.
  //   SIN MOVER  -- comprado y quieto +30 dias. Plata detenida en esta obra
  //                 mientras quiza otra lo esta comprando: candidato a prestamo.
  //   USO INCORRECTO -- material pagado y desperdiciado. Va SIEMPRE con el % de
  //                 salidas verificadas al lado: un 0% sobre el 10% revisado no
  //                 es un cero, es un "no sabemos".
  const negativos = stock.filter(s => s.stock < 0).length;
  const cadVencidos = stock.filter(s => s.cadMin && diasHoy(s.cadMin) < 0).length;
  const cadPorVencer = stock.filter(s => s.cadMin && diasHoy(s.cadMin) >= 0 && diasHoy(s.cadMin) <= 30).length;
  const salVerif = salidasProy.filter(s => !s.anulada && s.aprobacion === 'Aprobada');
  const verificadas = salVerif.filter(s => s.uso !== 'Pendiente');
  const incorrectas = verificadas.filter(s => s.uso === 'Incorrecto').length;
  const pctIncorrecto = verificadas.length ? Math.round(incorrectas / verificadas.length * 100) : null;
  const pctVerificado = salVerif.length ? Math.round(verificadas.length / salVerif.length * 100) : null;
  // Valorizado del almacen: stock x precio promedio pagado. Los materiales sin
  // ninguna compra registrada no tienen precio, asi que el total es PARCIAL y
  // hay que decirlo -- un total que finge estar completo se usa para decidir.
  // OJO: los precios salen del desglose de la factura, o sea CON IGV. El total
  // va rotulado como tal. No se divide entre 1.18 a ojo: no todas las compras
  // llevan IGV y el desglose real (base imponible / IGV) aun no se guarda -- va
  // con el bloque de SUNAT, post-piloto. Rotularlo es honesto; "corregirlo" con
  // un 18% supuesto seria falso, y encima invisible.
  const valorizado = stock.reduce((a, x) => a + (precioProm[x.cod] != null ? x.stock * precioProm[x.cod] : 0), 0);
  const sinPrecio = stock.filter(x => x.stock > 0 && precioProm[x.cod] == null).length;

  // Material que llego a medias y sigue esperando el saldo: obra parada.
  const incompletos = rqs.filter(r => r.proyecto === proy)
    .flatMap(r => r.items).filter(i => i.estado === 'Incompleto').length;

  // USO INCORRECTO POR CAUSA. NO se promedia el reingreso entre causas: para
  // "no se completo el trabajo" lo esperable es que vuelva casi todo, y para
  // "uso inadecuado" que no vuelva nada. Un promedio entre 100% y 0% da 50% y
  // no significa nada -- se mueve solo con la mezcla de causas del mes.
  // Cada causa es una conversacion distinta con una persona distinta:
  //   no se completo, sin recuperar -> hay material tirado en obra, ir por el
  //   uso inadecuado                -> supervision o capacitacion
  //   se encontro botado            -> desorden en obra
  const porCausa = MOTIVOS_USO.map(m => {
    const ss = verificadas.filter(x => x.uso === 'Incorrecto' && (x.motivoUso || 'Otro') === m);
    const salio = ss.reduce((a, x) => a + Number(x.cant), 0);
    const volvio = ss.reduce((a, x) => a + Number(x.reingresada || 0), 0);
    return { m, n: ss.length, salio, volvio, pct: salio > 0 ? Math.round(volvio / salio * 100) : null };
  }).filter(x => x.n > 0);

  const resumen = [
    { k: 'Materiales', n: stock.length, cls: 'text-slate-200' },
    { k: 'Stock negativo', n: negativos, cls: 'text-red-400', nota: negativos ? 'hay que ir a contar' : null },
    { k: 'Vencidos', n: cadVencidos, cls: 'text-red-400' },
    { k: 'Por vencer · 30 d', n: cadPorVencer, cls: 'text-yellow-400' },
    { k: 'Sin mover · +30 d', n: sinMov.length, cls: 'text-orange-400', nota: sinMov.length ? 'candidatos a préstamo' : null },
    { k: 'Por recibir', n: porRecibir.length, cls: 'text-sky-400', nota: porRecibir.length ? 'comprado sin llegar' : null },
    { k: 'Incompletos', n: incompletos, cls: 'text-orange-400', nota: incompletos ? 'esperando el saldo' : null },
    { k: 'Uso incorrecto', n: pctIncorrecto === null ? '—' : pctIncorrecto + '%', cls: 'text-red-400',
      nota: pctVerificado === null ? 'sin salidas' : `sobre el ${pctVerificado}% verificado` },
  ];

  const darSalida = async (s, f) => {
    const r = await api.darSalida({ proyecto: proy, cod: s.cod, cant: Number(f.cant), hoja: f.hoja.trim(), zona: f.zona.trim() });
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
    const f2 = { ...fSal }; delete f2[s.cod]; setFSal(f2);
    avisar(`Salida solicitada: ${f.cant} ${s.und} de "${s.desc}" → ${f.zona} (${f.hoja}). Pendiente de aprobación del residente; no descuenta stock hasta el OK.`, 6000);
  };

  const anularSalida = async (sa, motivo) => {
    const r = await api.updSalida(sa.id, { anulacion: { motivo, por: user.nombre, fecha: HOY_ISO } });
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
    avisar(`Salida #${sa.n} anulada — el stock se restauró. Motivo registrado.`);
  };

  const marcarUso = async (sa, uso, motivo = '') => {
    const r = await api.updSalida(sa.id, { uso, motivo_uso: motivo || null });
    if (r.error) avisar('⚠ ' + r.error, 7000);
  };

  const confirmarIncorrecto = sa => {
    const v = verif[sa.n];
    const motivo = v.motivo === 'Otro' ? v.otro.trim() : v.motivo;
    if (!motivo) return;
    marcarUso(sa, 'Incorrecto', motivo);
    const v2 = { ...verif }; delete v2[sa.n]; setVerif(v2);
  };

  const reingresar = async sa => {
    const f = fReing[sa.n] || {};
    const cant = Number(f.cant);
    const disponible = Number(sa.cant) - Number(sa.reingresada || 0);
    if (!(cant > 0) || cant > disponible) return;
    const total = Number(sa.reingresada || 0) + cant;
    const r = await api.updSalida(sa.id, { cant_reingresada: total, reingreso: { cant: total, por: user.nombre, fecha: HOY_ISO } });
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
    const f2 = { ...fReing }; delete f2[sa.n]; setFReing(f2);
    avisar(`Reingreso: ${cant} ${sa.und} de "${sa.desc}" devueltos a stock. La salida queda con su registro de uso incorrecto.`);
  };

  const matPres = stock.find(s => s.cod === fPres.cod);
  const presOk = esAlm && matPres && Number(fPres.cant) > 0 && Number(fPres.cant) <= matPres.disponible && fPres.destino;

  const prestar = async () => {
    const r = await api.prestar({ origen: proy, destino: fPres.destino, cod: matPres.cod, cant: Number(fPres.cant) });
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
    avisar(`Préstamo solicitado: ${fPres.cant} ${matPres.und} de "${matPres.desc}" → almacén ${fPres.destino}. Pendiente de aprobación de ambos residentes (origen y destino).`, 6000);
    setFPres({ cod: '', cant: '', destino: '', autoriza: '' });
  };

  const presProy = prestamos.filter(p => p.origen === proy || p.destino === proy);
  // Para vigilar, lo que importa es lo ACTIVO: material que fisicamente esta en
  // otra obra ahora mismo y no hay que confundir con faltante. Lo devuelto y lo
  // transferido ya no mueve nada, asi que se archiva detras del clic.
  const presActivos = presProy.filter(p => p.estado === 'Prestado');
  // Prestados cuyo destino ya NO tiene el material: son los que antes se
  // habrían cerrado con "Transferir al costo", que está fuera durante el
  // piloto (migración 74). Se quedan abiertos a propósito —reflejan una deuda
  // entre dos obras que la contabilidad todavía no puede liquidar— pero hay
  // que poder verlos, o se acumulan sin que nadie se entere.
  const presPorLiquidar = presActivos.filter(p => {
    if (p.destino !== proy) return false;        // solo se juzga el propio almacén
    const st = stock.find(x => x.cod === p.cod);
    return st && Number(st.stock) < Number(p.cant);
  });
  const [verPres, setVerPres] = useState(false);
  // La lista de "por recibir" es la mesa del almacenero: para gerencia son
  // decenas de filas que dicen lo mismo. El DATO si sirve -- material comprado
  // que no ha llegado -- asi que se queda como contador y la tabla se archiva
  // detras del clic. Mismo trato que los prestamos y las solicitudes.
  const [verRecibir, setVerRecibir] = useState(false);
  const presMostrar = soloVigila ? (verPres ? presProy : presActivos) : presProy;

  const setPres = async (p, estado) => {
    const r = await api.updPrestamo(p.id, { estado });
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
  };
  const anularPrestamo = async (p, motivo) => {
    const r = await api.updPrestamo(p.id, { estado: 'Anulado', anulacion: { motivo, por: user.nombre, fecha: HOY_ISO } });
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
    avisar(`Préstamo #${p.n} anulado — stock restaurado en ambos almacenes.`);
  };

  return (
    <div>
      {soloVigila && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {resumen.map(x => (
            <div key={x.k} className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2">
              <div className={`text-2xl font-bold font-mono ${x.n && x.n !== '—' ? x.cls : 'text-slate-600'}`}>{x.n}</div>
              <div className="text-[9px] font-bold tracking-widest text-slate-500 uppercase leading-tight">{x.k}</div>
              {x.nota && <div className="text-[9px] text-slate-500 leading-tight mt-0.5">{x.nota}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">{soloVigila ? 'Almacén de obra' : 'Almacén de obra · recepción de materiales'}</div>
          <div className="ml-auto flex items-center gap-2">
            {esAlm || mandaLaCabecera
              ? <span className="text-slate-300 text-[11px] font-semibold">{(PROYECTOS.find(p => p[1] === proy) || [''])[0]} · {proy}
                  {mandaLaCabecera && <span className="text-slate-500 font-normal"> · elegida arriba</span>}</span>
              : <FiltroProyecto value={proy} onChange={setProy} />}
            {ALMACENEROS[proy] && <span className="text-slate-400 text-[11px]">Almacenero: {ALMACENEROS[proy]}</span>}
            {soloVigila && porRecibir.length > 0 && (
              <button onClick={() => setVerRecibir(v => !v)}
                className="px-2.5 py-1 rounded border border-slate-700 bg-slate-800 hover:border-slate-500">
                <span className="font-mono font-bold text-sky-400">{porRecibir.length}</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 ml-1.5">
                  por recibir · {verRecibir ? '✕ cerrar' : 'ver'}</span>
              </button>
            )}
          </div>
        </div>
        {!esAlm && <div className="text-slate-500 text-[11px] mb-3">Vista de consulta: las recepciones, salidas y préstamos los registra el almacenero de cada obra.</div>}
        <Aviso msg={aviso} />
        {soloVigila && !verRecibir ? null : porRecibir.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Nada por recibir en {proy}. Los ítems aparecen aquí cuando Compras los aprueba.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{(soloVigila
                ? ['RQ', 'Descripción', 'Pedido', 'Recibido', 'Falta', 'Estado']
                : ['RQ', 'Descripción', 'Pedido', 'Recibido', 'Falta', 'Estado', 'Cant. que llega', 'Observaciones', '']
              ).map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {porRecibir.map(i => {
                  const f = getF(i.id);
                  const fc = factorMap[i.cod];
                  const llega = fc ? (Number(f.cajas) || 0) * (Number(f.upc ?? i.factorCaja ?? fc.factor) || 0) : Number(f.cant);
                  const rec = Number(i.cantRecibida || 0);
                  const falta = Number(i.cant) - rec;
                  const listo = esAlm && llega > 0 && llega <= falta;
                  return (
                    <tr key={i.id} className="border-b border-slate-800 align-top">
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-200">RQ-{String(i.rq).padStart(3, '0')}</td>
                      <td className="py-2 px-1.5 text-slate-200">{i.desc} <span className="text-slate-500">({i.und})</span></td>
                      <td className="py-2 px-1.5 font-mono text-slate-200">{i.cant}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{rec}</td>
                      <td className={`py-2 px-1.5 font-mono ${falta > 0 ? 'text-orange-400' : 'text-green-400'}`}>{falta}</td>
                      <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${pillEstado(i.estado)}`}>{i.estado}</span></td>
                      {!soloVigila && (<>
                      <td className="py-2 px-1.5">
                        {fc ? (
                          <div>
                            <div className="flex items-center gap-1">
                              <input type="number" min="1" step="any" value={f.cajas || ''} onChange={e => { const v = e.target.value; if (v === '' || Number(v) > 0) setF(i.id, 'cajas', v); }} disabled={!esAlm} placeholder={fc.undCompra.toLowerCase() + 's'} className={`w-14 ${inputCls}`} />
                              <span className="text-slate-500 text-[10px]">×</span>
                              <input type="number" min="1" step="any" value={f.upc ?? fc.factor} onChange={e => { const v = e.target.value; if (v === '' || Number(v) > 0) setF(i.id, 'upc', v); }} disabled={!esAlm} title={`${i.und} por ${fc.undCompra.toLowerCase()} (precargado del catálogo; ajústalo si la ${fc.undCompra.toLowerCase()} vino distinta)`} className={`w-14 ${inputCls}`} />
                            </div>
                            <div className="text-[9px] text-slate-400 mt-1">= {llega > 0 ? llega : '—'} {i.und}</div>
                          </div>
                        ) : (
                          <input type="number" min="1" step="any" value={f.cant} onChange={e => { const v = e.target.value; if (v === '' || Number(v) > 0) setF(i.id, 'cant', v); }} disabled={!esAlm} className={`w-16 ${inputCls}`} />
                        )}
                        {llega > falta && <div className="text-[9px] text-red-400 mt-1">Excede lo pedido</div>}
                        {pereceMap[i.cod] && (
                          <div className="mt-1">
                            <div className="text-[9px] text-yellow-400">Perecedero: fecha de caducidad *</div>
                            <FechaInput value={f.cad || ''} onChange={e => setF(i.id, 'cad', e.target.value)} className={`w-32 ${inputCls}`} />
                          </div>
                        )}</td>
                      <td className="py-2 px-1.5">
                        <textarea rows={2} value={f.obs} onChange={e => setF(i.id, 'obs', e.target.value)} disabled={!esAlm}
                          placeholder="Estado del material, faltantes, daños…" className={`w-48 ${inputCls} resize-y`} />
                        {i.obsAlmacen && <div className="text-[9px] text-slate-500 mt-1 w-48">Anterior: {i.obsAlmacen}</div>}</td>
                      <td className="py-2 px-1.5">
                        <button onClick={() => recibir(i)} disabled={!listo} className={btnOk(listo)}>Registrar recepción</button></td>
                      </>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">Si la cantidad recibida es menor a la pedida, el ítem pasa a Incompleto automáticamente (visible en Compras y Almacén); al llegar el saldo se registra otra recepción y pasa a Entregado.</div>
      </div>

      {/* Corregir una cantidad mal digitada. Va en su propio bloque porque
          alcanza también a lo ya Entregado, que sale de la tabla de arriba:
          justo el caso de digitar 40 donde iba 4 y completar el pedido. */}
      {!soloVigila && recibidasRecientes.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-1">Recepciones de los últimos {DIAS_CORREGIR} días · corregir</div>
          <div className="text-[11px] text-slate-500 mb-3">Si te equivocaste al digitar una cantidad, corrígela aquí. Se te pedirá el motivo y queda registrado con tu nombre y la fecha: no se borra nada.</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['RQ', 'Descripción', 'Pedido', 'Recibido', 'Estado', 'Cantidad correcta', 'Motivo de la corrección', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {recibidasRecientes.map(i => {
                  const c = getC(i.id);
                  const nueva = Number(c.cant);
                  const valida = esAlm && c.cant !== '' && nueva >= 0 && nueva <= Number(i.cant)
                    && nueva !== Number(i.cantRecibida) && c.motivo.trim().length > 0;
                  return (
                    <tr key={i.id} className="border-b border-slate-800 align-top">
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-200">RQ-{String(i.rq).padStart(3, '0')}</td>
                      <td className="py-2 px-1.5 text-slate-200">{i.desc} <span className="text-slate-500">({i.und})</span>
                        {(i.correcciones || []).map((x, k) => (
                          <div key={k} className="text-[9px] text-yellow-500 mt-1">
                            Corregido de {x.de} a {x.a} · {x.motivo} · {x.por}, {fmt(x.fecha)}
                          </div>
                        ))}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-200">{i.cant}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{i.cantRecibida}</td>
                      <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${pillEstado(i.estado)}`}>{i.estado}</span></td>
                      <td className="py-2 px-1.5">
                        <input type="number" min="0" step="any" value={c.cant} disabled={!esAlm}
                          onChange={e => setC(i.id, 'cant', e.target.value)} placeholder={String(i.cantRecibida)} className={`w-20 ${inputCls}`} />
                        {c.cant !== '' && nueva > Number(i.cant) && <div className="text-[9px] text-red-400 mt-1">Más de lo pedido</div>}</td>
                      <td className="py-2 px-1.5">
                        <input value={c.motivo} disabled={!esAlm} onChange={e => setC(i.id, 'motivo', e.target.value)}
                          placeholder="Ej.: digité 40 en vez de 4" className={`w-56 ${inputCls}`} /></td>
                      <td className="py-2 px-1.5">
                        <button onClick={() => corregir(i)} disabled={!valida} className={btnOk(!!valida)}>Corregir</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="flex items-baseline gap-3 mb-3 flex-wrap">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Stock del almacén · {proy}</div>
          <div className="ml-auto text-right">
            <div className="text-xl font-bold font-mono text-green-400">S/ {valorizado.toFixed(2)}</div>
            <div className="text-[9px] text-slate-500 uppercase tracking-widest">
              valorizado · con IGV{sinPrecio > 0 ? ` · parcial: ${sinPrecio} sin precio` : ''}</div>
          </div>
        </div>
        {stock.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Sin materiales en este almacén. El stock se forma con las recepciones registradas arriba.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{(soloVigila
                ? ['Código', 'Material', 'Und', 'Caducidad', 'Inicial', 'Recibido', 'Salidas', 'Préstamos ±', 'Stock']
                : ['Código', 'Material', 'Und', 'Caducidad', 'Inicial', 'Recibido', 'Salidas', 'Préstamos ±', 'Stock', 'Cant. salida', 'N° hoja de trabajo', 'Zona de trabajo', '']
              ).map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {stock.map(s => {
                  const f = fSal[s.cod] || { cant: '', hoja: '', zona: '' };
                  const setS = (k, v) => setFSal({ ...fSal, [s.cod]: { ...f, [k]: v } });
                  const cad = estadoCaducidad(s.cadMin);
                  const vencido = cad && cad.k === 'VENCIDO';
                  const listo = esAlm && !vencido && Number(f.cant) > 0 && Number(f.cant) <= s.disponible && f.hoja.trim() && f.zona.trim();
                  return (
                    <tr key={s.cod} className="border-b border-slate-800 align-top">
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{s.cod}</td>
                      <td className="py-2 px-1.5 text-slate-200">{s.desc}</td>
                      <td className="py-2 px-1.5 text-slate-500">{s.und}</td>
                      <td className="py-2 px-1.5">
                        {cad ? (
                          <div>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase whitespace-nowrap ${cad.cls}`}>{cad.k}</span>
                            {vencido && <div className="text-[9px] text-red-400 mt-1 w-28 leading-tight">Salida bloqueada: dar de baja o corregir con Gerencia</div>}
                          </div>
                        ) : <span className="text-slate-600">—</span>}</td>
                      <td className={`py-2 px-1.5 font-mono ${s.inicial > 0 ? 'text-sky-400' : 'text-slate-500'}`}>{s.inicial}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{s.recibido}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{s.salido}</td>
                      <td className={`py-2 px-1.5 font-mono ${s.prestNeto < 0 ? 'text-purple-400' : s.prestNeto > 0 ? 'text-green-400' : 'text-slate-500'}`}>{s.prestNeto > 0 ? '+' + s.prestNeto : s.prestNeto}</td>
                      <td className={`py-2 px-1.5 font-mono font-bold ${s.stock > 0 ? 'text-green-400' : 'text-slate-500'}`}>{s.stock}
                        {s.reservado > 0 && <div className="text-[9px] text-yellow-400 font-normal">−{s.reservado} pend. aprob.</div>}</td>
                      {!soloVigila && (<>
                      <td className="py-2 px-1.5"><input type="number" min="1" step="any" value={f.cant} onChange={e => { const v = e.target.value; if (v === '' || Number(v) > 0) setS('cant', v); }} disabled={!esAlm} className={`w-16 ${inputCls}`} />
                        {Number(f.cant) > s.disponible && <div className="text-[9px] text-red-400 mt-1">Excede disponible ({s.disponible})</div>}</td>
                      <td className="py-2 px-1.5"><input value={f.hoja} onChange={e => setS('hoja', e.target.value)} disabled={!esAlm} placeholder="HT-001" className={`w-20 ${inputCls} font-mono`} /></td>
                      <td className="py-2 px-1.5"><input value={f.zona} onChange={e => setS('zona', e.target.value)} disabled={!esAlm} placeholder="Piso 3 - Dpto 301" className={`w-32 ${inputCls}`} /></td>
                      <td className="py-2 px-1.5">
                        <button onClick={() => darSalida(s, f)} disabled={!listo} className={btnOk(listo)}>Solicitar aprobación</button></td>
                      </>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">{soloVigila ? 'Stock = inicial (inventario físico) + recibido − salidas ± préstamos. Lo negativo indica un descuadre que hay que ir a contar.' : 'Toda salida exige N° de hoja de trabajo y zona de trabajo. Stock = inicial (inventario físico) + recibido − salidas ± préstamos.'}</div>
      </div>

      <div className={`bg-slate-900 border rounded-md p-4 mb-3 ${sinMov.length ? 'border-yellow-700' : 'border-slate-800'}`}>
        <div className="text-[11px] font-bold tracking-widest uppercase mb-3 flex items-center gap-2">
          <span className={sinMov.length ? 'text-yellow-400' : 'text-slate-500'}>⚠ Materiales sin movimiento · +{DIAS_SIN_MOV} días</span>
          <span className="text-slate-500 normal-case tracking-normal font-normal">· {proy}</span>
        </div>
        {sinMov.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Nada parado: todo el stock tuvo entrada o salida en el último mes. 👍</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['Código', 'Material', 'Stock parado', 'Último movimiento', 'Días sin mover', 'Sugerencia'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {sinMov.map(s => (
                  <tr key={s.cod} className="border-b border-slate-800 align-top">
                    <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{s.cod}</td>
                    <td className="py-2 px-1.5 text-slate-200">{s.desc} <span className="text-slate-500">({s.und})</span></td>
                    <td className="py-2 px-1.5 font-mono font-bold text-yellow-400">{s.stock} {s.und}</td>
                    <td className="py-2 px-1.5 text-slate-400 whitespace-nowrap">{s.desde ? fmt(s.desde) : 'sin registro'}</td>
                    <td className={`py-2 px-1.5 font-mono font-bold whitespace-nowrap ${s.dias === null || s.dias > 60 ? 'text-red-400' : 'text-yellow-400'}`}>{s.dias === null ? '+60d' : s.dias + 'd'}</td>
                    <td className="py-2 px-1.5 text-slate-400 text-[10px]">Prestar a otra obra que lo necesite, o revisar con gerencia.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">Material con stock que no entra ni sale hace más de un mes: capital y espacio inmovilizados. Considera prestarlo a otra obra (queda como deuda) antes de que se vuelva merma.</div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Préstamos entre almacenes</div>
          {soloVigila && (
            <button onClick={() => setVerPres(v => !v)}
              className="ml-auto px-2.5 py-1 rounded border border-slate-700 bg-slate-800 hover:border-slate-500">
              <span className="font-mono font-bold text-purple-400">{presActivos.length}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 ml-1.5">
                activo(s) · {verPres ? '✕ cerrar' : 'ver'}</span>
            </button>
          )}
          {presPorLiquidar.length > 0 && (
            <div className="w-full text-[10px] text-orange-400 leading-tight mt-1"
              title="El material prestado ya se consumió en la obra de destino, así que no se puede devolver. Antes se cerraba transfiriendo el costo; durante el piloto eso no se hace porque las obras son de empresas distintas y hace falta una factura entre ellas.">
              ⚠ {presPorLiquidar.length} préstamo(s) con el material ya consumido en destino: quedan
              abiertos hasta que se liquide entre las empresas. No se pierden — se resuelven todos juntos.</div>
          )}
        </div>
        {!soloVigila && (<>
        <div className="grid md:grid-cols-4 gap-2 mb-3">
          <div className="md:col-span-2"><label className={lblCls}>Material (con stock)</label>
            <select value={fPres.cod} onChange={e => setFPres({ ...fPres, cod: e.target.value })} disabled={!esAlm} className={`w-full ${inputCls}`}>
              <option value="">— Elegir —</option>
              {stock.filter(s => s.disponible > 0).map(s => <option key={s.cod} value={s.cod}>{s.desc} (disp: {s.disponible})</option>)}</select></div>
          <div><label className={lblCls}>Cantidad</label>
            <input type="number" min="1" step="any" value={fPres.cant} onChange={e => { const v = e.target.value; if (v === '' || Number(v) > 0) setFPres({ ...fPres, cant: v }); }} disabled={!esAlm} className={`w-full ${inputCls}`} />
            {matPres && Number(fPres.cant) > matPres.disponible && <div className="text-[9px] text-red-400 mt-1">Excede disponible ({matPres.disponible})</div>}</div>
          <div><label className={lblCls}>Almacén destino</label>
            <FiltroProyecto value={fPres.destino} onChange={v => setFPres({ ...fPres, destino: v })} excluir={proy} /></div>
        </div>
        <button onClick={prestar} disabled={!presOk} className={btnOk(!!presOk)}>Solicitar aprobación (origen + destino)</button>
        </>)}

        {(soloVigila ? verPres : presProy.length > 0) && presMostrar.length > 0 && (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-xs">
              <thead><tr>{['#', 'Fecha', 'Material', 'Cant', 'Origen', 'Destino', 'Aprobación', 'Estado', 'Acción'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {presMostrar.map(p => (
                  <tr key={p.n} className="border-b border-slate-800 align-top">
                    <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{p.n}</td>
                    <td className="py-2 px-1.5 text-slate-400">{fmt(p.fecha)}</td>
                    <td className="py-2 px-1.5 text-slate-200">{p.desc} <span className="text-slate-500">({p.cant} {p.und})</span>
                      {p.motivoAnulacion && <div className="text-red-400 text-[10px] mt-1">Anulado: {p.motivoAnulacion} ({p.anuladoPor})</div>}
                      {p.rechazoMotivo && <div className="text-red-400 text-[10px] mt-1">Rechazado: {p.rechazoMotivo} ({p.rechazoPor})</div>}</td>
                    <td className="py-2 px-1.5 font-mono text-slate-200">{p.cant}</td>
                    <td className={`py-2 px-1.5 ${p.origen === proy ? 'text-purple-400 font-semibold' : 'text-slate-400'}`}>{p.origen}</td>
                    <td className={`py-2 px-1.5 ${p.destino === proy ? 'text-green-400 font-semibold' : 'text-slate-400'}`}>{p.destino}</td>
                    <td className="py-2 px-1.5 text-[10px]">
                      <div className={p.aprobOrigen ? 'text-green-400' : 'text-yellow-400'}>{p.aprobOrigen ? '✓' : '⋯'} origen{p.aprobOrigen ? ` (${p.aprobOrigen})` : ''}</div>
                      <div className={p.aprobDestino ? 'text-green-400' : 'text-yellow-400'}>{p.aprobDestino ? '✓' : '⋯'} destino{p.aprobDestino ? ` (${p.aprobDestino})` : ''}</div></td>
                    <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${pillEstado(p.estado)}`}>{p.estado}{p.estado === 'Transferido' ? ' al costo' : ''}</span></td>
                    <td className="py-2 px-1.5">
                      {esAlm && p.estado === 'Prestado' && (
                        <div>
                          <div className="text-[9px] text-slate-500 leading-tight mb-1">
                            Si la otra obra ya consumió el material, avisa a gerencia: durante el
                            piloto no se transfiere el costo (hace falta factura entre empresas).</div>
                          <div className="flex gap-1">
                            <button onClick={() => setPres(p, 'Devuelto')} className={btnVerde}>Devuelto</button>
                            {/* "Transferir al costo" queda FUERA durante el piloto (decisión del
                                dueño, 28 ago 2026): las obras pertenecen a razones sociales
                                distintas, y mover el costo de una empresa a otra sin emitir la
                                factura entre ellas no es un asiento contable válido. Se explica
                                en lugar de esconderlo: el almacenero tiene que saber qué hacer
                                el día que el material prestado ya se haya consumido. */}
                            <span className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed"
                              title="Durante el piloto no se transfiere el costo: cada obra es de una empresa distinta y hace falta una factura entre ellas. Si el material ya se consumió, avisa a gerencia y deja el préstamo abierto.">
                              Transferir al costo · no disponible</span>
                          </div>
                          <AnularBox onConfirm={m => anularPrestamo(p, m)} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">El préstamo nace "Solicitado" y recién mueve stock cuando lo aprueban los residentes de origen y destino. Ya activo: resta al origen y suma al destino como deuda. "Devuelto" revierte el stock; "Transferir al costo" lo vuelve permanente (gasto al destino). Anular exige motivo y solo procede si el destino no consumió el material.</div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Salidas registradas · {proy} · verificación de uso</div>
        {soloVigila && porCausa.length > 0 && (
          <div className="border border-slate-800 rounded p-3 mb-3">
            <div className="text-[10px] font-bold tracking-widest text-red-400 uppercase mb-2">Uso incorrecto · por causa</div>
            <table className="w-full text-xs">
              <thead><tr>{['Causa', 'Veces', 'Salió', 'Volvió al almacén', 'Se perdió'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {porCausa.map(c => (
                  <tr key={c.m} className="border-b border-slate-900">
                    <td className="py-1.5 px-1.5 text-slate-200">{c.m}</td>
                    <td className="py-1.5 px-1.5 font-mono text-slate-300">{c.n}</td>
                    <td className="py-1.5 px-1.5 font-mono text-slate-300">{c.salio}</td>
                    <td className={`py-1.5 px-1.5 font-mono ${c.pct >= 80 ? 'text-green-400' : c.pct >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {c.volvio} {c.pct !== null && <span className="text-[10px]">({c.pct}%)</span>}</td>
                    <td className="py-1.5 px-1.5 font-mono text-red-400">{c.salio - c.volvio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 text-slate-500 text-[10px] leading-relaxed">
              Cada causa es una conversación distinta. <b className="text-slate-400">No se completó el trabajo</b> con poco
              reingreso significa material sano tirado en obra: hay que ir a recogerlo, no es desperdicio.
              <b className="text-slate-400"> Uso inadecuado</b> sí es pérdida — es supervisión o capacitación.
              <b className="text-slate-400"> Se encontró botado</b> es desorden en obra.
              Por eso no se promedia el reingreso entre causas: lo esperable es casi todo en la primera y casi nada en la tercera.
            </div>
          </div>
        )}
        {salidasProy.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Sin salidas registradas en {proy}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['#', 'Fecha', 'Material', 'Cant', 'Hoja de trabajo', 'Zona', 'Aprobación', 'Uso', 'Acción', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {salidasProy.map(sa => {
                  const v = verif[sa.n];
                  return (
                    <tr key={sa.n} className={`border-b border-slate-800 align-top ${sa.anulada ? 'opacity-50' : ''}`}>
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{sa.n}</td>
                      <td className="py-2 px-1.5 text-slate-400">{fmt(sa.fecha)}</td>
                      <td className="py-2 px-1.5 text-slate-200">{sa.desc} <span className="text-slate-500">({sa.und})</span>
                        {sa.anulada && <div className="text-red-400 text-[10px] mt-1">ANULADA: {sa.motivoAnulacion} ({sa.anuladoPor}, {fmt(sa.fechaAnulacion)})</div>}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-200">{sa.cant}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-200">{sa.hoja}</td>
                      <td className="py-2 px-1.5 text-slate-400">{sa.zona}</td>
                      <td className="py-2 px-1.5">
                        {sa.aprobacion === 'Aprobada' ? <div><span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-green-950 text-green-400">Salida aprobada</span>{sa.aprobadoPor && <div className="text-[9px] text-slate-500 mt-0.5">por {sa.aprobadoPor}</div>}</div>
                        : sa.aprobacion === 'Rechazada' ? <div><span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-red-950 text-red-400">Rechazada</span><div className="text-red-400 text-[10px] mt-0.5">{sa.motivoRechazo}</div></div>
                        : <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-yellow-950 text-yellow-400">Pendiente aprob.</span>}
                      </td>
                      <td className="py-2 px-1.5">
                        {sa.anulada ? <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-red-300 line-through">Anulada</span>
                        : sa.aprobacion !== 'Aprobada' ? <span className="text-slate-600">—</span>
                        : sa.uso === 'Pendiente' ? <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-yellow-950 text-yellow-400">Pendiente</span>
                        : sa.uso === 'Correcto' ? <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-green-950 text-green-400">Correcto uso</span>
                        : <div><span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-red-950 text-red-400">Uso incorrecto</span>
                            <div className="text-red-400 text-[10px] mt-1">{sa.motivoUso}</div>
                            {sa.reingresada > 0 && <div className="text-green-400 text-[10px] mt-1">↩ {sa.reingresada} {sa.und} reingresado a stock{sa.reingresoPor ? ` (${sa.reingresoPor})` : ''}</div>}</div>}
                      </td>
                      <td className="py-2 px-1.5">
                        {esAlm && !sa.anulada && sa.aprobacion === 'Aprobada' && sa.uso === 'Pendiente' && !v && (
                          <div className="flex gap-1">
                            <button onClick={() => marcarUso(sa, 'Correcto')} className={btnVerde}>Correcto uso</button>
                            <button onClick={() => setVerif({ ...verif, [sa.n]: { motivo: MOTIVOS_USO[0], otro: '' } })} className={btnRojo}>Uso incorrecto</button>
                          </div>
                        )}
                        {esAlm && !sa.anulada && sa.uso === 'Incorrecto' && sa.reingresada < sa.cant && (
                          fReing[sa.n] !== undefined ? (
                            <div className="w-40">
                              <div className="text-[9px] text-slate-400 mb-1">Devolver a stock (máx {sa.cant - sa.reingresada} {sa.und}):</div>
                              <input type="number" min="1" step="any" max={sa.cant - sa.reingresada}
                                value={fReing[sa.n].cant} onChange={e => setFReing({ ...fReing, [sa.n]: { cant: e.target.value } })}
                                placeholder="Cantidad" className={`w-full ${inputCls}`} />
                              <div className="flex gap-1 mt-1">
                                <button onClick={() => reingresar(sa)} disabled={!(Number(fReing[sa.n].cant) > 0 && Number(fReing[sa.n].cant) <= sa.cant - sa.reingresada)}
                                  className={`flex-1 ${btnOk(Number(fReing[sa.n].cant) > 0 && Number(fReing[sa.n].cant) <= sa.cant - sa.reingresada)}`}>Reingresar</button>
                                <button onClick={() => { const f2 = { ...fReing }; delete f2[sa.n]; setFReing(f2); }} className="px-2 py-1 rounded text-[9px] text-slate-500 hover:text-slate-200">✕</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setFReing({ ...fReing, [sa.n]: { cant: '' } })}
                              className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-green-400 border border-slate-700 hover:border-green-400"
                              title="Devolver a stock lo recuperable de esta salida mal usada.">↩ Reingreso</button>
                          )
                        )}
                        {v && (
                          <div className="w-48">
                            <select value={v.motivo} onChange={e => setVerif({ ...verif, [sa.n]: { ...v, motivo: e.target.value } })} className={`w-full ${inputCls}`}>
                              {MOTIVOS_USO.map(x => <option key={x}>{x}</option>)}</select>
                            {v.motivo === 'Otro' && (
                              <input value={v.otro} onChange={e => setVerif({ ...verif, [sa.n]: { ...v, otro: e.target.value } })}
                                placeholder="Especificar…" className={`w-full mt-1 ${inputCls}`} />
                            )}
                            <button onClick={() => confirmarIncorrecto(sa)} disabled={v.motivo === 'Otro' && !v.otro.trim()}
                              className={`mt-1 w-full px-2 py-1.5 rounded text-[9px] font-bold uppercase ${(v.motivo !== 'Otro' || v.otro.trim()) ? 'bg-red-950 text-red-400 border border-red-800 hover:bg-red-900' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
                              Confirmar uso incorrecto</button>
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-1.5">{esAlm && !sa.anulada && <AnularBox onConfirm={m => anularSalida(sa, m)} />}</td>
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
