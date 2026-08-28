// ============================================================
// Catálogo de materiales: solicitudes de material nuevo, familias
// y catálogo maestro. Vista de Lucía (compras aprueba y codifica).
// Movido de App.jsx (etapa 8 de la separación en módulos) con el
// texto idéntico; solo se agregó "export" y estos imports.
// ============================================================
import { useState, useMemo, useEffect, useRef } from 'react';
import { fmt, HOY_ISO } from '../fechas';
import { buscarEnCatalogo } from '../busqueda';
import { Aviso, inputCls, lblCls, thCls, btnOk, btnRojo, btnVerde } from '../ui';

export function Catalogo({ user, db, api }) {
  const { catalogo, solicitudes, familias, levantadas = {}, codigosUsados = [], nombreDe = {} } = db;
  const puedeAprobar = user.rol === 'compras';
  const [edit, setEdit] = useState({});   // n -> { desc, und, famIu, cod }
  const [rech, setRech] = useState({});
  const [q, setQ] = useState('');
  const [aviso, setAvisoRaw] = useState('');
  // los avisos (incluidos los de error) se autolimpian
  const setAviso = m => { setAvisoRaw(m); if (m) setTimeout(() => setAvisoRaw(''), m.startsWith('⚠') ? 8000 : 6000); };
  const pend = solicitudes.filter(s => s.estado === 'Pendiente');
  const unds = useMemo(() => [...new Set(catalogo.map(m => m[2]))].sort(), [catalogo]);

  // Correlativo por familia: máximo código de la familia + 1.
  // Sobre codigosUsados (TODOS, incluidos los desactivados), no sobre el
  // catálogo activo: al desactivar un duplicado, su código quedaría libre y
  // el siguiente material nuevo lo heredaría junto con todo su historial.
  const sugerirCodigo = famIu => {
    if (!famIu) return '';
    const delaFam = codigosUsados.filter(c => c.startsWith(famIu)).map(c => [c]);
    if (delaFam.length) {
      const max = Math.max(...delaFam.map(m => Number(m[0])));
      return String(max + 1).padStart(6, '0');
    }
    return famIu + '0101';
  };

  const getEdit = s => edit[s.n] || { desc: s.desc, und: s.und, famIu: s.famIu || '', cod: sugerirCodigo(s.famIu), perecedero: !!s.perecedero };
  const setEditCampo = (s, k, v) => {
    const e = { ...getEdit(s), [k]: v };
    if (k === 'famIu') e.cod = sugerirCodigo(v);   // al reasignar familia se recalcula el correlativo
    setEdit({ ...edit, [s.n]: e });
  };

  const [famForm, setFamForm] = useState(null);   // null | { iu, nombre }

  // POSIBLES DUPLICADOS. Un mismo material cargado dos veces con codigos
  // distintos hace tres danos a la vez: el consolidado no los junta (se compra
  // dos veces en vez de negociar por volumen), el historial de precios se parte
  // en dos series, y el stock aparece partido. Un catalogo sucio quita poder de
  // negociacion sin que nadie lo note.
  // El parecido se mide por palabras compartidas dentro de la MISMA familia:
  // dos descripciones que comparten el 80% de sus palabras son sospechosas.
  const [verDup, setVerDup] = useState(false);
  const [resolviendo, setResolviendo] = useState(null);   // clave del par eligiendo cual se queda
  // Un clic a la vez. Sin esto, tocar los dos códigos seguidos desactivaba
  // los DOS materiales y el registro solo recordaba uno.
  const [enCurso, setEnCurso] = useState(false);
  const palabrasDe = t => new Set(String(t).toUpperCase().replace(/[^A-Z0-9ÑÁÉÍÓÚ ]/g, ' ').split(/\s+/).filter(w => w.length > 1));
  const parecidos = (a, b) => {
    const A = palabrasDe(a), B = palabrasDe(b);
    if (A.size < 2 || B.size < 2) return false;
    let comunes = 0; A.forEach(w => { if (B.has(w)) comunes++; });
    return comunes / Math.min(A.size, B.size) >= 0.8;
  };
  // El descarte vive en la BASE (alertas_levantadas), no en el navegador: si
  // Lucia revisa un par y no son duplicados, gerencia tampoco lo vuelve a ver,
  // y al reves. Es la leccion del Enterado que se quedaba en un solo aparato.
  const claveDup = (c1, c2) => 'dup:' + [c1, c2].sort().join(':');
  const duplicados = useMemo(() => {
    const porFam = {};
    catalogo.forEach(m => { const iu = String(m[0]).slice(0, 2); (porFam[iu] = porFam[iu] || []).push(m); });
    const pares = [];
    Object.values(porFam).forEach(ms => {
      for (let i = 0; i < ms.length && pares.length < 40; i++)
        for (let j = i + 1; j < ms.length && pares.length < 40; j++)
          if (!levantadas[claveDup(ms[i][0], ms[j][0])] && parecidos(ms[i][1], ms[j][1]))
            pares.push([ms[i], ms[j]]);
    });
    return pares;
  }, [catalogo, levantadas]);
  // Los ya revisados, por si uno se descarto por error: se pueden reabrir.
  const dupDescartados = Object.entries(levantadas)
    .filter(([k]) => k.startsWith('dup:'))
    .map(([k, v]) => {
      const [, c1, c2] = k.split(':');
      const d = c => nombreDe[c] || c;   // nombreDe incluye los desactivados
      return { clave: k, c1, c2, d1: d(c1), d2: d(c2), por: v.por, fecha: v.fecha, nota: v.nota || '' };
    });
  const esDuplicado = async (m1, m2, ganador) => {
    if (enCurso) return;
    setEnCurso(true);
    try {
      const perdedor = ganador[0] === m1[0] ? m2 : m1;
      // Una sola llamada: el servidor desactiva y registra en la misma
      // transacción. O quedan las dos cosas, o no queda ninguna.
      const r = await api.resolverDuplicado(ganador[0], perdedor[0]);
      if (r.error) { setAviso('⚠ ' + r.error); return; }
      setResolviendo(null);
      setAviso(`Listo: ${perdedor[0]} desactivado. Ya no se puede pedir; todo lo registrado con él conserva su nombre. De ahora en adelante se usa ${ganador[0]}.`);
    } finally { setEnCurso(false); }
  };
  const noSonDuplicados = async (m1, m2) => {
    if (enCurso) return;
    setEnCurso(true);
    try {
      const r = await api.descartarDuplicado(m1[0], m2[0]);
      if (r.error) { setAviso('⚠ ' + r.error); return; }
      setAviso(`Par descartado. No se vuelve a mostrar a nadie; se puede reabrir desde la lista de revisados.`);
    } finally { setEnCurso(false); }
  };
  // Lo mismo, para avisar ANTES de aprobar una solicitud: el duplicado se
  // evita aqui o no se evita nunca.
  const parecidosEnCatalogo = desc => catalogo.filter(m => parecidos(desc, m[1])).slice(0, 2);

  // Primer IU libre entre 01 y 99
  const sugerirIU = () => {
    const usados = new Set(familias.map(f => f[0]));
    for (let i = 1; i <= 99; i++) {
      const iu = String(i).padStart(2, '0');
      if (!usados.has(iu)) return iu;
    }
    return '';
  };

  const crearFamilia = async () => {
    const iu = famForm.iu.trim();
    const nombre = famForm.nombre.trim().toUpperCase();
    if (!/^\d{2}$/.test(iu)) { setAviso('⚠ El IU debe tener exactamente 2 dígitos.'); return; }
    if (familias.some(f => f[0] === iu)) { setAviso(`⚠ El IU ${iu} ya está usado por "${familias.find(f => f[0] === iu)[1]}".`); return; }
    if (!nombre) return;
    if (familias.some(f => f[1].toUpperCase() === nombre)) { setAviso('⚠ Ya existe una familia con ese nombre.'); return; }
    const r = await api.crearFamilia({ iu, nombre });
    if (r.error) { setAviso('⚠ ' + r.error); return; }
    setFamForm(null);
    setAviso(`Familia ${iu} · "${nombre}" creada. Ya aparece en las listas de familia.`);
    setTimeout(() => setAviso(''), 4000);
  };

  const aprobar = async s => {
    const e = getEdit(s);
    const cod = e.cod.trim();
    if (!e.famIu) { setAviso('⚠ Asigna una familia antes de aprobar.'); return; }
    if (!e.desc.trim()) { setAviso('⚠ La descripción no puede quedar vacía.'); return; }
    if (!/^\d{6}$/.test(cod)) { setAviso('⚠ El código debe tener exactamente 6 dígitos.'); return; }
    if (!cod.startsWith(e.famIu)) { setAviso(`⚠ El código ${cod} no corresponde a la familia ${e.famIu} (debe empezar con ${e.famIu}).`); return; }
    if (codigosUsados.includes(cod)) { setAviso('⚠ Ese código ya existe en el catálogo (o pertenece a un material desactivado). Los códigos no se reciclan.'); return; }
    const r = await api.aprobarSolicitud(s, { codigo: cod, desc: e.desc.trim().toUpperCase(), und: e.und, famIu: e.famIu, perecedero: !!e.perecedero });
    if (r.error) { setAviso('⚠ ' + r.error); return; }
    const e2 = { ...edit }; delete e2[s.n]; setEdit(e2);
    setAviso(`Material "${e.desc.trim()}" aprobado con código ${cod}.`);
    setTimeout(() => setAviso(''), 4000);
  };

  const rechazar = async s => {
    const motivo = (rech[s.n] || '').trim();
    if (!motivo) return;
    const r = await api.rechazarSolicitud(s, motivo);
    if (r.error) { setAviso('⚠ ' + r.error); return; }
    const r2 = { ...rech }; delete r2[s.n]; setRech(r2);
  };

  const res = useMemo(() => buscarEnCatalogo(catalogo, q, 15), [q, catalogo]);

  // Lista completa agrupada: familia (2 primeros dígitos) → subfamilia/grupo (dígitos 3-4)
  const [verLista, setVerLista] = useState(false);
  const [famAbierta, setFamAbierta] = useState({});
  // Ubicar un material dentro de la lista: abre su familia, baja hasta él y lo resalta
  const [resaltado, setResaltado] = useState('');
  const [scrollA, setScrollA] = useState('');
  const filaRefs = useRef({});
  const irAMaterial = cod => {
    if (!cod) return;
    setVerLista(true);
    setFamAbierta(p => ({ ...p, [String(cod).slice(0, 2)]: true }));
    setResaltado(cod);
    setScrollA(cod);
  };
  useEffect(() => {
    if (!scrollA) return;
    const el = filaRefs.current[scrollA];
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setScrollA(''); }
  }, [scrollA, verLista, famAbierta]);
  const porFamilia = useMemo(() => {
    const fams = {};
    catalogo.forEach(m => {
      const iu = String(m[0]).slice(0, 2), grupo = String(m[0]).slice(2, 4);
      if (!fams[iu]) fams[iu] = { iu, nombre: m[3] || '(sin familia)', total: 0, grupos: {} };
      if (!fams[iu].grupos[grupo]) fams[iu].grupos[grupo] = [];
      fams[iu].grupos[grupo].push(m);
      fams[iu].total += 1;
    });
    return Object.values(fams).sort((a, b) => a.iu.localeCompare(b.iu))
      .map(f => ({ ...f, grupos: Object.keys(f.grupos).sort().map(g => ({ g, mats: f.grupos[g].sort((a, b) => String(a[0]).localeCompare(String(b[0]))) })) }));
  }, [catalogo]);

  return (
    <div>
      <Aviso msg={aviso} />
      {user.rol === 'gerente' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {[
            { k: 'Materiales', n: catalogo.length, cls: 'text-slate-200' },
            { k: 'Solicitudes pendientes', n: pend.length, cls: 'text-yellow-400' },
            { k: 'Aprobados este mes', n: solicitudes.filter(x => x.estado === 'Aprobado' && (x.fecha || '').slice(0, 7) === HOY_ISO.slice(0, 7)).length, cls: 'text-green-400' },
            { k: 'Posibles duplicados', n: duplicados.length, cls: 'text-orange-400' },
          ].map(x => (
            <div key={x.k} className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2">
              <div className={`text-2xl font-bold font-mono ${x.n > 0 ? x.cls : 'text-slate-600'}`}>{x.n}</div>
              <div className="text-[9px] font-bold tracking-widest text-slate-500 uppercase leading-tight">{x.k}</div>
            </div>
          ))}
        </div>
      )}
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Solicitudes de material nuevo · {pend.length} pendiente(s)</div>
        {pend.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Sin solicitudes pendientes. Los residentes las envían desde su vista.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['#', 'Fecha', 'Solicitante', 'Material', 'Und', 'Familia', 'Código a asignar', 'Acción'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {pend.map(s => {
                  const enRech = rech[s.n] !== undefined;
                  return (
                    <tr key={s.n} className="border-b border-slate-800 align-top">
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{s.n}</td>
                      <td className="py-2 px-1.5 text-slate-400">{fmt(s.fecha)}</td>
                      <td className="py-2 px-1.5 text-slate-400">{s.solicitante} · {s.proyecto}</td>
                      <td className="py-2 px-1.5">
                        {puedeAprobar ? (
                          <div>
                            <input value={getEdit(s).desc} onChange={e => setEditCampo(s, 'desc', e.target.value)} className={`w-52 ${inputCls}`} />
                            {/* El duplicado se evita AQUI o no se evita nunca: este es el
                                momento en que todavia no existe. */}
                            {parecidosEnCatalogo(getEdit(s).desc).map(m => (
                              <div key={m[0]} className="text-[9px] text-orange-400 mt-1 w-52 leading-tight">
                                ⚠ Parecido a {m[0]} · {m[1]} — ¿es el mismo? Si lo es, recházalo con ese código como motivo.</div>
                            ))}
                          </div>
                        ) : <span className="text-slate-200">{s.desc}</span>}</td>
                      <td className="py-2 px-1.5">
                        {puedeAprobar ? (
                          <div>
                            <select value={getEdit(s).und} onChange={e => setEditCampo(s, 'und', e.target.value)} className={inputCls}>
                              {[...new Set([getEdit(s).und, ...unds])].map(u => <option key={u}>{u}</option>)}</select>
                            <label className="flex items-center gap-1 mt-1 cursor-pointer text-[9px] text-slate-400">
                              <input type="checkbox" checked={!!getEdit(s).perecedero} onChange={e => setEditCampo(s, 'perecedero', e.target.checked)} />
                              <span>Perecedero</span>
                            </label>
                          </div>
                        ) : <span className="text-slate-500">{s.und}{s.perecedero ? ' · perecedero' : ''}</span>}</td>
                      <td className="py-2 px-1.5">
                        {puedeAprobar ? (
                          <select value={getEdit(s).famIu} onChange={e => setEditCampo(s, 'famIu', e.target.value)} className={inputCls} style={{ maxWidth: '180px' }}>
                            <option value="">— Asignar familia —</option>
                            {familias.map(([iu, n]) => <option key={iu} value={iu}>{iu} · {n}</option>)}</select>
                        ) : <span className="text-slate-400">{s.fam || '—'}</span>}</td>
                      <td className="py-2 px-1.5">
                        <input value={getEdit(s).cod} onChange={e => setEditCampo(s, 'cod', e.target.value)}
                          className={`w-24 ${inputCls} font-mono`} maxLength={6} disabled={!puedeAprobar} />
                        <div className="text-[9px] text-slate-500 mt-1">Correlativo por familia; editable.</div></td>
                      <td className="py-2 px-1.5">
                        {!puedeAprobar ? <span className="text-slate-500 text-[10px]">Solo Compras aprueba</span> : !enRech ? (
                          <div className="flex gap-1">
                            <button onClick={() => aprobar(s)} className={btnVerde}>Aprobar y codificar</button>
                            <button onClick={() => setRech({ ...rech, [s.n]: '' })} className={btnRojo}>Rechazar</button>
                          </div>
                        ) : (
                          <div className="w-44">
                            <input value={rech[s.n]} onChange={e => setRech({ ...rech, [s.n]: e.target.value })} placeholder="Motivo (ej: duplicado de 210112)" className={`w-full ${inputCls}`} />
                            <button onClick={() => rechazar(s)} disabled={!(rech[s.n] || '').trim()}
                              className={`mt-1 w-full px-2 py-1 rounded text-[9px] font-bold uppercase ${(rech[s.n] || '').trim() ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>Confirmar rechazo</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">Solo el dueño del catálogo aprueba y codifica. Puedes corregir la descripción, la unidad y reasignar la familia antes de aprobar — el código correlativo se recalcula solo. Antes de aprobar, busca abajo si el material ya existe con otro nombre — evita duplicados.</div>
      </div>

      {puedeAprobar && (
        <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Familias del catálogo · {familias.length}</div>
            {!famForm && (
              <button onClick={() => setFamForm({ iu: sugerirIU(), nombre: '' })}
                className="ml-auto text-[11px] text-yellow-400 hover:text-yellow-300 underline underline-offset-2">＋ Nueva familia</button>
            )}
          </div>
          {famForm && (
            <div className="mt-3 bg-slate-950 border border-slate-700 rounded p-3">
              <div className={lblCls}>Nueva familia (IU de 2 dígitos + nombre)</div>
              <div className="flex gap-2 mt-1 flex-wrap items-start">
                <div>
                  <input value={famForm.iu} onChange={e => setFamForm({ ...famForm, iu: e.target.value })}
                    maxLength={2} className={`w-16 ${inputCls} font-mono`} />
                  <div className="text-[9px] text-slate-500 mt-1">Sugerido: primer IU libre.</div>
                </div>
                <input value={famForm.nombre} onChange={e => setFamForm({ ...famForm, nombre: e.target.value })}
                  placeholder="Nombre de la familia (ej: TUBERIA HDPE)" className={`flex-1 ${inputCls}`} style={{ minWidth: '220px' }} />
                <button onClick={crearFamilia} disabled={!famForm.nombre.trim() || !/^\d{2}$/.test(famForm.iu.trim())}
                  className={btnOk(!!(famForm.nombre.trim() && /^\d{2}$/.test(famForm.iu.trim())))}>Crear familia</button>
                <button onClick={() => setFamForm(null)} className="px-3 py-1.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-400 hover:text-slate-200">Cancelar</button>
              </div>
              <div className="text-[10px] text-slate-500 mt-2">Los materiales de esta familia llevarán códigos que empiezan con su IU. Crear una familia no se puede deshacer desde la app si ya tiene materiales.</div>
            </div>
          )}
        </div>
      )}

      {(duplicados.length > 0 || dupDescartados.length > 0) && (
        <div className="bg-slate-900 border border-orange-900 rounded-md p-4 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`text-[11px] font-bold tracking-widest uppercase ${duplicados.length ? 'text-orange-400' : 'text-green-500'}`}>
              {duplicados.length
                ? `⚠ Posibles duplicados · ${duplicados.length} par(es)`
                : `✓ Duplicados · todos revisados (${dupDescartados.length})`}</div>
            <button onClick={() => setVerDup(v => !v)}
              className="ml-auto text-[10px] font-bold uppercase text-slate-400 hover:text-slate-200">
              {verDup ? '✕ cerrar' : 'ver'}</button>
          </div>
          {!verDup && (
            <div className="text-[11px] text-slate-500 mt-1">
              El mismo material con dos códigos hace tres daños a la vez: el consolidado no los junta
              (se compra dos veces en vez de negociar por volumen), el historial de precios se parte
              en dos, y el stock aparece dividido.</div>
          )}
          {verDup && duplicados.length > 0 && (
            <table className="w-full text-xs mt-3">
              <thead><tr>{['Código', 'Material', 'Código', 'Se parece a', 'Und', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {duplicados.map(([m1, m2]) => (
                  <tr key={m1[0] + m2[0]} className="border-b border-slate-800">
                    <td className="py-1.5 px-1.5 font-mono text-[11px] text-slate-500">{m1[0]}</td>
                    <td className="py-1.5 px-1.5 text-slate-200">{m1[1]}</td>
                    <td className="py-1.5 px-1.5 font-mono text-[11px] text-slate-500">{m2[0]}</td>
                    <td className="py-1.5 px-1.5 text-slate-200">{m2[1]}</td>
                    <td className="py-1.5 px-1.5 text-slate-500">{m1[2]}{m1[2] !== m2[2] ? ` / ${m2[2]}` : ''}</td>
                    <td className="py-1.5 px-1.5">
                      {puedeAprobar && (resolviendo === claveDup(m1[0], m2[0]) ? (
                        <div className="w-44">
                          <div className="text-[9px] font-bold uppercase text-orange-400 mb-1">¿Cuál código se queda?</div>
                          <div className="flex gap-1 flex-wrap">
                            <button onClick={() => esDuplicado(m1, m2, m1)} disabled={enCurso}
                              className="px-2 py-1 rounded text-[9px] font-mono font-bold bg-slate-800 text-green-400 border border-green-800 hover:bg-green-950">{m1[0]}</button>
                            <button onClick={() => esDuplicado(m1, m2, m2)} disabled={enCurso}
                              className="px-2 py-1 rounded text-[9px] font-mono font-bold bg-slate-800 text-green-400 border border-green-800 hover:bg-green-950">{m2[0]}</button>
                            <button onClick={() => setResolviendo(null)} className="px-1.5 text-slate-500">✕</button>
                          </div>
                          <div className="text-[9px] text-slate-500 mt-1 leading-tight">El otro se desactiva: nadie podrá pedirlo más. Lo histórico no se toca.</div>
                        </div>
                      ) : (
                        <div className="flex gap-1 flex-wrap">
                          <button onClick={() => setResolviendo(claveDup(m1[0], m2[0]))}
                            className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-orange-400 border border-orange-900 hover:border-orange-700 whitespace-nowrap">
                            Es duplicado</button>
                          <button onClick={() => noSonDuplicados(m1, m2)} disabled={enCurso}
                            className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700 hover:border-green-700 hover:text-green-400 whitespace-nowrap">
                            No lo son</button>
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {verDup && duplicados.length > 0 && (
            <div className="text-[10px] text-slate-500 mt-2">
              <b>Es duplicado</b>: elige qué código se queda; el otro se desactiva y nadie podrá pedirlo
              más. Lo ya registrado con él conserva su nombre, y el stock que haya en almacén se puede
              seguir sacando. <b>No lo son</b>: el par se descarta y no vuelve a aparecer.
              Las dos decisiones se pueden deshacer abajo.</div>
          )}
          {(verDup || duplicados.length === 0) && dupDescartados.length > 0 && (
            <div className="mt-3 border-t border-slate-800 pt-2">
              <div className="text-[9px] font-bold tracking-widest text-slate-500 uppercase mb-1">
                Revisados · {dupDescartados.length}</div>
              {dupDescartados.map(d => (
                <div key={d.clave} className="flex items-center gap-2 text-[10px] text-slate-500 py-0.5">
                  <span className="font-mono">{d.c1}</span> {d.d1} <span className="text-slate-700">≠</span>
                  <span className="font-mono">{d.c2}</span> {d.d2}
                  <span className={d.nota.startsWith('Se desactivó') ? 'text-orange-400' : 'text-green-500'}>· {d.nota || 'no son duplicados'}</span>
                  <span className="text-slate-600">· {d.por}</span>
                  {puedeAprobar && (
                    <button onClick={async () => {
                      // El servidor decide: si el par se había confirmado,
                      // reactiva el código desactivado; si se había descartado,
                      // solo devuelve el par a la lista.
                      if (enCurso) return;
                      setEnCurso(true);
                      try { const r = await api.reabrirDuplicado(d.clave); if (r.error) setAviso('⚠ ' + r.error); }
                      finally { setEnCurso(false); }
                    }}
                      className="text-slate-500 hover:text-yellow-400 underline underline-offset-2">reabrir</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Catálogo maestro · {catalogo.length} materiales</div>
          <button onClick={() => setVerLista(v => !v)}
            className={`ml-auto px-2.5 py-1 rounded text-[9px] font-bold uppercase border ${verLista ? 'border-yellow-400 text-yellow-400 bg-slate-800' : 'border-slate-700 text-slate-400 bg-slate-800 hover:border-slate-500'}`}>
            {verLista ? '✕ Cerrar lista' : '☰ Ver lista completa'}</button>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && res.length > 0) { e.preventDefault(); irAMaterial(res[0][0]); } }}
          placeholder="Buscar material… (Enter baja hasta él en la lista y lo resalta)" className={`w-full ${inputCls} py-2 text-sm mb-2`} />
        {res.length > 0 && <div className="text-[10px] text-slate-500 mb-1">Clic en un resultado para ubicarlo dentro de su familia ↓</div>}
        {res.length > 0 && (
          <table className="w-full text-xs">
            <thead><tr>{['Código', 'Descripción', 'Und', 'Familia', 'Perecedero'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>
              {res.map(m => (
                <tr key={m[0]} className="border-b border-slate-800">
                  <td onClick={() => irAMaterial(m[0])} title="Ubicar en la lista completa"
                    className="py-2 px-1.5 font-mono text-[11px] text-slate-500 cursor-pointer hover:text-yellow-400">{m[0]}</td>
                  <td onClick={() => irAMaterial(m[0])} title="Ubicar en la lista completa"
                    className="py-2 px-1.5 text-slate-200 cursor-pointer hover:text-yellow-400">{m[1]}</td>
                  <td className="py-2 px-1.5 text-slate-500">{m[2]}{m[4] ? ` (${m[5]} de ${m[4]})` : ''}</td>
                  <td className="py-2 px-1.5 text-slate-400">{m[3]}</td>
                  <td className="py-2 px-1.5">
                    {puedeAprobar ? (
                      <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-400">
                        <input type="checkbox" checked={!!m[6]}
                          onChange={async e => {
                            const r = await api.setPerecedero(m[0], e.target.checked);
                            if (r.error) { setAviso('⚠ ' + r.error); return; }
                            setAviso(e.target.checked
                              ? `"${m[1]}" marcado como perecedero: la recepción exigirá fecha de caducidad.`
                              : `"${m[1]}" ya no es perecedero.`);
                            setTimeout(() => setAviso(''), 4000);
                          }} />
                        <span>{m[6] ? 'Sí · exige caducidad' : 'No'}</span>
                      </label>
                    ) : <span className="text-slate-500 text-[10px]">{m[6] ? 'Sí' : 'No'}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {verLista && (
          <div className="mt-3 border-t border-slate-800 pt-3">
            <div className="text-[10px] text-slate-500 mb-2">
              Ordenado por familia (2 primeros dígitos) y subfamilia (dígitos 3-4). Haz clic en una familia para desplegar sus materiales.</div>
            <div className="space-y-1">
              {porFamilia.map(f => {
                const abierta = !!famAbierta[f.iu];
                return (
                  <div key={f.iu} className="border border-slate-800 rounded">
                    <button onClick={() => setFamAbierta(p => ({ ...p, [f.iu]: !p[f.iu] }))}
                      className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-slate-800 sticky top-0 z-20 bg-slate-900 border-b border-slate-800">
                      <span className="text-slate-500 text-[10px] w-3">{abierta ? '▾' : '▸'}</span>
                      <span className="font-mono text-[11px] text-yellow-400">{f.iu}</span>
                      <span className="text-slate-200 text-[11px] font-semibold uppercase">{f.nombre}</span>
                      <span className="ml-auto text-slate-500 text-[10px]">{f.total} material(es) · {f.grupos.length} subfamilia(s)</span>
                    </button>
                    {abierta && (
                      <div className="px-2.5 pb-2">
                        {f.grupos.map(({ g, mats }) => (
                          <div key={g} className="mt-2">
                            <div className="text-[9px] font-bold uppercase text-slate-500 tracking-wider border-b border-slate-800 pb-1 mb-1 sticky top-9 z-10 bg-slate-900">
                              Subfamilia {f.iu}{g} · {mats.length}</div>
                            <table className="w-full text-xs">
                              <tbody>
                                {mats.map(m => {
                                  const esRes = resaltado === m[0];
                                  return (
                                  <tr key={m[0]} ref={el => { filaRefs.current[m[0]] = el; }}
                                    className={`border-b border-slate-900 ${esRes ? 'bg-yellow-400/20 ring-1 ring-yellow-400' : ''}`}>
                                    <td className={`py-1 px-1.5 font-mono text-[11px] w-20 ${esRes ? 'text-yellow-400 font-bold' : 'text-slate-500'}`}>{m[0]}</td>
                                    <td className={`py-1 px-1.5 ${esRes ? 'text-yellow-300 font-semibold' : 'text-slate-200'}`}>{m[1]}</td>
                                    <td className="py-1 px-1.5 text-slate-500 w-24">{m[2]}{m[4] ? ` (${m[5]} de ${m[4]})` : ''}</td>
                                    <td className="py-1 px-1.5 w-20 text-[10px] text-slate-500">{m[6] ? 'Perecedero' : ''}</td>
                                  </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">Marca como perecederos los materiales con fecha de vencimiento (pinturas, aditivos, sellantes, cemento…): su recepción exigirá la fecha de caducidad y el stock mostrará el semáforo de vencimiento.</div>
      </div>
    </div>
  );
}
