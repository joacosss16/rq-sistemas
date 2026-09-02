// Movido de App.jsx (etapa 9 de la separacion en modulos), texto identico.
import { useState, useEffect } from 'react';
import { HOY_ISO, fmt, dias, diasHoy } from '../fechas';
import { estadoCaducidad, stockDetalleObra } from '../stock';
import { coincide } from '../busqueda';
import { PROYECTOS, ALMACENEROS } from '../maestros';
import { Aviso, AnularBox, FiltroProyecto, FechaInput, inputCls, lblCls, thCls, btnOk, btnRojo, btnVerde, pillEstado } from '../ui';

// La lista de motivos de uso incorrecto viaja con la vista: nadie mas la usa.
const MOTIVOS_USO = ['No se completó el trabajo', 'Se encontró botado', 'Uso inadecuado', 'Otro'];

// Cuantas filas se pintan de golpe en las tablas largas. Con las 309 salidas
// que tenia MAIA en pruebas, pintarlas todas -- cada una con sus inputs y sus
// botones -- congelaba la pestana del navegador durante decenas de segundos.
// 50 entra de sobra en cualquier pantalla y el resto esta a un clic.
const TOPE_FILAS = 50;

// Pie comun de las tablas recortadas. Decir cuantas hay es lo que impide que
// un tope se lea como "no hay mas": un corte silencioso es peor que la lentitud.
// Buscador de tabla. Va arriba de la tabla, con el contador de lo que queda a
// la vista: sin el numero, un filtro que no encuentra nada se confunde con una
// tabla vacia o con una pantalla rota.
function Buscar({ valor, onChange, placeholder, encontradas, total }) {
  return (
    <div className="flex items-center gap-2 flex-wrap mb-2">
      <input value={valor} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`w-64 ${inputCls}`} />
      {valor.trim() && (
        <>
          <span className={`text-[10px] font-mono ${encontradas ? 'text-slate-400' : 'text-yellow-400'}`}>
            {encontradas} de {total}{encontradas === 0 ? ' · nada coincide' : ''}
          </span>
          <button onClick={() => onChange('')}
            className="text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-200">✕ limpiar</button>
        </>
      )}
    </div>
  );
}

function PieTope({ mostradas, total, abierto, onToggle }) {
  if (total <= mostradas && !abierto) return null;
  return (
    <div className="mt-2 text-center">
      <button onClick={onToggle}
        className="px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest bg-slate-800 text-slate-300 border border-slate-700 hover:border-slate-500">
        {abierto ? `✕ mostrar solo las ${TOPE_FILAS} más recientes` : `ver las ${total} · ahora se muestran ${mostradas}`}
      </button>
      {abierto && total > TOPE_FILAS && (
        <div className="text-[9px] text-yellow-500 mt-1">Con muchas filas la pantalla puede tardar en responder.</div>
      )}
    </div>
  );
}

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
  // La vista era UNA sola columna con cinco tablas apiladas: para llegar a las
  // salidas había que pasar por delante de todo el stock. Ahora cada tarea
  // tiene su pestaña. Va aquí arriba, con el resto de los ganchos: un useState
  // más abajo, después de cualquier return, deja la pantalla en blanco para
  // todos -- ya pasó una vez en este proyecto.
  const [pestana, setPestana] = useState('recepcion');
  // Los préstamos ya cerrados se archivan detrás de un clic (ver más abajo).
  // El gancho vive aquí arriba con los demás, no junto a su tabla.
  const [verCerrados, setVerCerrados] = useState(false);
  const [verArchivadas, setVerArchivadas] = useState(false);
  // TOPE DE FILAS. Con 309 salidas en la bandeja, cada una con sus inputs y
  // botones, el navegador se CONGELA: pantalla negra varios segundos y, dos
  // veces en la prueba del 31 ago, el renderer sin responder durante 30s. No
  // hay error de JavaScript — es puro trabajo de pintado bloqueando el hilo.
  // Se recorta a las más recientes y el resto va detrás de un clic, que es el
  // patrón de la casa. No se pierde nada: el pie dice cuántas hay.
  const [sinTope, setSinTope] = useState({});
  // La ventana efímera de confirmación del reingreso: { n, cant }.
  const [confirmReing, setConfirmReing] = useState(null);
  // Marcas de tiempo de las verificaciones de esta sesión, para el recordatorio
  // de "vas muy seguido". Vive solo en memoria: no es un control, es un aviso.
  const [marcas, setMarcas] = useState([]);
  // Buscadores de las tablas de Stock y Recepcion: { stock, recepcion }.
  const [busq, setBusq] = useState({});
  const [verCeros, setVerCeros] = useState(false);
  const [fSal, setFSal] = useState({});
  const [verif, setVerif] = useState({});
  const [fReing, setFReing] = useState({});
  const [fPres, setFPres] = useState({ cod: '', cant: '', destino: '', autoriza: '' });

  // 12 segundos, no 5. En la prueba del 31 ago el mensaje desaparecía antes de
  // que diera tiempo a leerlo, y quien probaba concluyó —con razón— que "no hay
  // confirmación". Es el mismo malentendido que hizo parecer muertos a tres
  // botones de Compras: el aviso existía, pero nadie llegaba a verlo. Estos
  // mensajes dicen cosas que importan ("alguien más ya había devuelto 1"), así
  // que el coste de que sobre tiempo es cero y el de que falte, alto.
  const avisar = (msg, ms = 12000) => { setAviso(msg); setTimeout(() => setAviso(''), ms); };

  const porRecibir = rqs.flatMap(r => r.items
    .filter(i => i.decision === 'Aprobado' && i.estado !== 'Entregado')
    .map(i => ({ ...i, rq: r.n, fechaRQ: r.fechaRQ, canalRq: r.canal, residente: r.residente, proyecto: r.proyecto })))
    .filter(i => i.proyecto === proy);
  // Misma razón que en las salidas: 82 filas con inputs ya se notan, y la lista
  // crece sola. Lo urgente primero — la fecha en que se necesita el material.
  const porRecibirOrden = porRecibir.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  // Se busca por material, por código y por número de RQ: "RQ-311" es como lo
  // pregunta el residente por WhatsApp, así que es como hay que poder buscarlo.
  const qRec = (busq.recepcion || '').trim();
  const porRecibirFiltrado = porRecibirOrden.filter(i =>
    coincide(`${i.cod} ${i.desc} RQ-${String(i.rq).padStart(3, '0')} ${i.rq}`, qRec));
  const porRecibirMostrar = (qRec || sinTope.recepcion) ? porRecibirFiltrado : porRecibirFiltrado.slice(0, TOPE_FILAS);

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
  const stockTodo = stockDetalleObra(db, proy);

  // MATERIALES EN CERO, ARCHIVADOS HASTA QUE VUELVAN A TENER.
  // Un material entra a esta lista la primera vez que pasa por el almacén y ya
  // no sale nunca: con 1.740 en el catálogo, en unos meses el almacenero abre
  // Stock y se encuentra cientos de filas en cero. Vuelven solas en cuanto
  // entra material, sin que nadie tenga que hacer nada.
  //
  // OJO CON EL CRITERIO, que no es "stock <= 0": los NEGATIVOS se quedan
  // SIEMPRE a la vista. Un negativo es un descuadre real —salió más de lo que
  // entró— y esconderlo es justo el fallo que ya se pagó una vez (ver el
  // comentario de stockDetalleObra en stock.js). Lo reservado tampoco se
  // archiva: hay material comprometido esperando una firma.
  const enCero = s => s.stock === 0 && s.reservado === 0;
  const stockVivo = stockTodo.filter(s => !enCero(s));
  const stockCero = stockTodo.filter(enCero);
  // Buscar mira SIEMPRE en todo, incluidos los archivados: si alguien escribe
  // el nombre de un material, quiere ese material — que esté en cero es la
  // respuesta, no un motivo para no enseñárselo.
  const qStock = (busq.stock || '').trim();
  const stockBase = qStock ? stockTodo : (verCeros ? stockTodo : stockVivo);
  const stockFiltrado = stockBase.filter(s => coincide(`${s.cod} ${s.desc}`, qStock));
  const stock = qStock || verCeros ? stockFiltrado : stockFiltrado.slice(0, TOPE_FILAS);

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
  const sinMov = stockTodo.filter(s => s.stock > 0)
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
  const negativos = stockTodo.filter(s => s.stock < 0).length;
  const cadVencidos = stockTodo.filter(s => s.cadMin && diasHoy(s.cadMin) < 0).length;
  const cadPorVencer = stockTodo.filter(s => s.cadMin && diasHoy(s.cadMin) >= 0 && diasHoy(s.cadMin) <= 30).length;
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
  const valorizado = stockTodo.reduce((a, x) => a + (precioProm[x.cod] != null ? x.stock * precioProm[x.cod] : 0), 0);
  const sinPrecio = stockTodo.filter(x => x.stock > 0 && precioProm[x.cod] == null).length;

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
    { k: 'Materiales', n: stockVivo.length, cls: 'text-slate-200' },
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
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
    // RECORDATORIO, NO ACUSACIÓN. Marcar seis seguidas es perfectamente normal:
    // el almacenero recorre la obra por la mañana y registra al volver. Esto no
    // pretende atrapar a nadie —para eso está la alerta de Auditoría, que mira
    // el patrón y no se esquiva esperando— sino recordarle PARA QUÉ sirve lo
    // que está marcando, que casi siempre es el problema real y no la mala fe.
    // No bloquea, no exige nada y no se puede fallar.
    const ahora = Date.now();
    const recientes = [...marcas.filter(t => ahora - t < 60000), ahora];
    setMarcas(recientes);
    if (recientes.length === 6) {
      avisar('Llevas 6 salidas verificadas en un minuto. Si alguna llevaba material mal usado y se marca como correcta, ese material desaparece de los indicadores y nadie irá a recogerlo a la obra.', 12000);
    }
  };

  // Deshacer una verificación equivocada (migración 80). Solo si no hubo
  // reingreso: si volvió material, ESO sí movió stock y no se deshace por aquí.
  const corregirUso = async (sa, motivo) => {
    const r = await api.corregirUso(sa, motivo);
    if (r.error) { avisar('⚠ ' + r.error, 9000); return; }
    avisar(`HT ${sa.hoja}: la verificación se deshizo y la salida vuelve a estar por verificar. Queda registrado con tu nombre, la hora y el motivo.`);
  };

  const confirmarIncorrecto = sa => {
    const v = verif[sa.n];
    const motivo = v.motivo === 'Otro' ? v.otro.trim() : v.motivo;
    if (!motivo) return;
    marcarUso(sa, 'Incorrecto', motivo);
    const v2 = { ...verif }; delete v2[sa.n]; setVerif(v2);
  };

  // ---- La bandeja de verificación ----
  // Una salida está RESUELTA cuando ya no le pide nada a nadie. Lo que queda
  // fuera de esta lista es el trabajo del almacenero, y es lo único que debe
  // ver: la tabla enseñaba todo el historial para siempre, así que había que
  // buscar la tarea de hoy entre lo verificado hace dos meses.
  //
  // El caso que obligó a la migración 79: "uso incorrecto, volvieron 3 de 10".
  // ¿Los 7 vuelven o se perdieron? Nadie lo decía nunca, así que esa fila se
  // quedaba a la vista para siempre. Ahora se pregunta, y `reingresoCerrado`
  // guarda la respuesta.
  const salidaResuelta = sa =>
    sa.anulada
    || sa.aprobacion === 'Rechazada'
    || sa.uso === 'Correcto'
    || (sa.uso === 'Incorrecto' && (sa.reingresoCerrado || Number(sa.reingresada) >= Number(sa.cant)));
  const salBandeja = salidasProy.filter(s => !salidaResuelta(s));
  const salArchivadas = salidasProy.filter(salidaResuelta);
  // Lo más reciente arriba: el almacenero verifica lo de hoy, no lo de marzo.
  // Antes salían en el orden en que llegaron de la base, así que su trabajo del
  // día quedaba al final de trescientas filas.
  const salOrden = (verArchivadas ? salidasProy : salBandeja).slice().sort((a, b) => b.n - a.n);
  const salMostrar = sinTope.salidas ? salOrden : salOrden.slice(0, TOPE_FILAS);

  // La hora de cada acción (migración 79) es un dato de AUDITORÍA, y solo la ve
  // GERENCIA (decisión del dueño, 31 ago 2026). Sirve para saber si el almacén
  // verifica al recibir el parte o tres semanas después — que es justo lo que
  // distingue un control de un trámite. Al almacenero no le aporta nada: él
  // sabe cuándo lo hizo, y además es el vigilado, no el vigilante. En su
  // pantalla sería una columna más de ruido en una tabla que ya va apretada.
  // Lo anterior a la 79 no tiene hora, y se dice en vez de inventar una.
  const horaTxt = iso => iso ? new Date(iso).toLocaleString('es-PE') : 'sin hora registrada';

  const reingresar = async (sa, cant, cerrar) => {
    const disponible = Number(sa.cant) - Number(sa.reingresada || 0);
    if (!(cant >= 0) || cant > disponible) return;
    // Viaja lo que VUELVE, no el total: la suma la hace la base bloqueando la
    // fila (migración 78). Y la firma ya no se manda desde aquí — la estampa
    // el servidor, igual que la de la anulación.
    const r = await api.reingresar(sa, cant, cerrar);
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
    // Los números los devuelve el servidor, que es el único que sabe cuánto
    // había vuelto de verdad: si alguien más reingresó mientras esta pantalla
    // estaba abierta, aquí sale el total real y no el que esta vista suponía.
    const d = r.data || {};
    const yaHabia = Number(sa.reingresada || 0);
    const total = d.total != null ? Number(d.total) : yaHabia + cant;
    const otro = d.yaHabia != null && Number(d.yaHabia) !== yaHabia
      ? ` (ojo: alguien más ya había devuelto ${d.yaHabia}, tu pantalla estaba desactualizada)` : '';
    const f2 = { ...fReing }; delete f2[sa.n]; setFReing(f2);
    setConfirmReing(null);
    const cerrada = d.cerrado != null ? d.cerrado : cerrar;
    avisar(cant === 0
      ? `HT ${sa.hoja}: registrado que no volverá material de "${sa.desc}". Sale de la lista por verificar; queda en el archivo con la hora.`
      : `Reingreso: ${cant} ${sa.und} de "${sa.desc}" devueltos a stock (${total} de ${sa.cant}).${cerrada
          ? ` HT ${sa.hoja} cerrada — sale de la lista por verificar.`
          : ' Sigue en la lista: dijiste que puede volver más.'}${otro}`, otro ? 9000 : 6000);
  };

  const matPres = stockTodo.find(s => s.cod === fPres.cod);
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
    const st = stockTodo.find(x => x.cod === p.cod);
    return st && Number(st.stock) < Number(p.cant);
  });
  // Un préstamo CERRADO ya no pide nada a nadie: devuelto, transferido,
  // rechazado o anulado. Se archiva detrás de un clic para que la tabla sea la
  // lista de lo que sigue vivo y no un historial donde hay que buscar.
  //
  // Antes esto solo lo tenía gerencia, y filtraba por 'Prestado' — lo que
  // escondía los 'Solicitado', que son justo los que se quedan atascados
  // reservando material. Ahora el corte es abierto/cerrado y vale para todos,
  // almacenero incluido. Nada se pierde: el contador dice cuántos hay y el
  // botón los trae.
  const CERRADOS = ['Devuelto', 'Transferido', 'Rechazado', 'Anulado'];
  const presAbiertos = presProy.filter(p => !CERRADOS.includes(p.estado));
  const presCerrados = presProy.filter(p => CERRADOS.includes(p.estado));
  const presMostrar = verCerrados ? presProy : presAbiertos;

  // (Aquí vivía `setPres`, que mandaba el estado a mano. Su único uso era el
  // botón "Devuelto" de un solo clic, que la migración 81 retiró: ahora el
  // estado lo deriva la base cuando llegan las dos confirmaciones, y mandarlo
  // a mano está prohibido. Se quita para que nadie lo reutilice creyendo que
  // sigue siendo un camino válido.)

  // DEVOLVER: las dos confirmaciones (migración 81). Cada almacén firma SU lado
  // —el destino "lo entregué", el origen "lo recibí y lo conté"— y la base
  // cierra el préstamo cuando llegan las dos. El contenido de la firma lo pone
  // el servidor; desde aquí solo se manda la intención.
  const confirmarDevol = async (p, lado) => {
    const r = await api.updPrestamo(p.id, { [lado === 'origen' ? 'devol_origen' : 'devol_destino']: {} });
    if (r.error) { avisar('⚠ ' + r.error, 9000); return; }
    const otro = lado === 'origen' ? p.devolDestino : p.devolOrigen;
    avisar(otro
      ? `Préstamo #${p.n} DEVUELTO: confirmado por los dos almacenes. El stock vuelve a ${p.origen}.`
      : `Confirmado tu lado del préstamo #${p.n}. Queda a medias hasta que ${lado === 'origen' ? p.destino : p.origen} confirme; el material sigue contando en ${p.destino}.`);
  };
  const anularPrestamo = async (p, motivo) => {
    const solicitado = p.estado === 'Solicitado';
    const r = await api.updPrestamo(p.id, { estado: 'Anulado', anulacion: { motivo, por: user.nombre, fecha: HOY_ISO } });
    if (r.error) { avisar('⚠ ' + r.error, 7000); return; }
    // El mensaje no puede ser el mismo: un prestamo que nunca se activo no
    // "restaura stock en ambos almacenes" -- solo libera la reserva del origen,
    // porque al destino no llego nunca nada.
    avisar(solicitado
      ? `Préstamo #${p.n} anulado — nunca llegó a moverse. El material vuelve a estar disponible en ${p.origen}.`
      : `Préstamo #${p.n} anulado — stock restaurado en ambos almacenes.`);
  };

  // Las pestañas, en el orden que pidió el dueño (31 ago 2026). Cada una lleva
  // su número, como el resto del sistema: el sistema no manda avisos, así que
  // el número es lo único que le dice a quien está mirando que algo le espera.
  // `urge` lo pinta en rojo -- se reserva para lo que tiene a alguien parado o
  // para un descuadre real, no para "hay cosas".
  const porVerificar = salBandeja.filter(s => !s.anulada && s.aprobacion === 'Aprobada').length;
  // EL AVISO DE LAS 16:00 (pedido del dueño, 31 ago 2026).
  //
  // NO es una notificación: el sistema no manda ninguna, y esa decisión sigue
  // en pie. Una notificación del navegador solo llegaría si el almacenero
  // tuviera el sistema abierto justo a esa hora, y a las cuatro de la tarde
  // está en el almacén, no delante de la pantalla — o sea, el día que
  // importara, no llegaría. Esto es lo contrario: el aviso le ESPERA. Cuando
  // abra, a las 16:05 o a las 19:00, lo primero que ve es lo que le falta.
  const HORA_AVISO = 16;
  const esTarde = new Date().getHours() >= HORA_AVISO;
  const presEsperando = presProy.filter(p => p.estado === 'Solicitado').length;

  // DEVOLUCIONES A MEDIAS: uno de los dos almacenes confirmó y el otro no.
  // Media firma se queda dormida para siempre si nadie la mira, y este sistema
  // no manda avisos: lo único que despierta a alguien es el color de un número
  // que ya tiene delante. Por eso se pintan en ROJO al final de la jornada.
  //
  // SE EXCLUYEN LOS QUE NO TIENEN SALIDA. Si el destino ya consumió el
  // material, la segunda firma va a fallar SIEMPRE —la guarda de la migración
  // 73 lo impide, y ni transferir (74) ni anular (misma guarda) son caminos—.
  // Pintar en rojo, todos los días, algo que nadie puede resolver es la forma
  // más rápida de que el almacenero aprenda que el rojo no significa nada.
  // Esos salen ya en `presPorLiquidar`, que es su sitio.
  const sinSalida = p => {
    const st = stockTodo.find(x => x.cod === p.cod);
    return p.destino === proy && st && Number(st.stock) < Number(p.cant);
  };
  const aMedias = presProy.filter(p => p.estado === 'Prestado'
    && ((p.devolOrigen && !p.devolDestino) || (p.devolDestino && !p.devolOrigen))
    && !sinSalida(p));
  // Los días que lleva esperando la primera firma. Si pasa de hoy, el aviso
  // deja de ser "cierra el día" y pasa a ser "esto se quedó colgado".
  const diasAMedias = p => {
    const f = p.devolOrigenFecha || p.devolDestinoFecha;
    return f ? -diasHoy(String(f).slice(0, 10)) : 0;
  };
  const aMediasViejas = aMedias.filter(p => diasAMedias(p) >= 1);

  // A las 16:00 el aviso de cierre del día mira DOS cosas: los usos sin
  // verificar y las devoluciones a medias. Las segundas van en rojo aunque no
  // sean muchas: cada una es material que dos obras cuentan distinto.
  //
  // VA AQUÍ ABAJO, DESPUÉS de `aMedias`, y no es un detalle de estilo: una
  // primera versión lo puso ANTES y era un ReferenceError en zona muerta. Y no
  // saltaba nunca en las pruebas, porque `esAlm && esTarde` corta por la
  // izquierda: la pantalla funcionaba toda la mañana y se caía en blanco a las
  // 16:00, solo para el almacenero. Compilaba y las 73 pruebas pasaban. Es el
  // mismo fallo que ya tumbó producción una vez (ver CLAUDE.md).
  const avisoTarde = esAlm && esTarde && (porVerificar > 0 || aMedias.length > 0);
  const PESTANAS = [
    { k: 'recepcion', t: 'Recepción',  n: porRecibir.length,             urge: false, nota: 'comprado sin llegar' },
    { k: 'salidas',   t: 'Salidas',    n: porVerificar,                  urge: false, nota: 'sin verificar el uso' },
    { k: 'stock',     t: 'Stock',      n: negativos + cadVencidos,       urge: true,  nota: 'negativos y vencidos' },
    { k: 'prestamos', t: 'Préstamos',  n: presEsperando + presPorLiquidar.length + aMedias.length, urge: true, nota: 'esperando firma, a medias o por liquidar' },
  ];

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

      {/* Cabecera FIJA: la obra, el almacenero y el aviso mandan en todas las
          pestañas. El aviso sobre todo -- si viviera dentro de una pestaña, un
          mensaje disparado desde otra se pintaría donde nadie lo ve, que es
          exactamente lo que hizo parecer muertos a tres botones de Compras. */}
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Almacén de obra</div>
          <div className="ml-auto flex items-center gap-2">
            {esAlm || mandaLaCabecera
              ? <span className="text-slate-300 text-[11px] font-semibold">{(PROYECTOS.find(p => p[1] === proy) || [''])[0]} · {proy}
                  {mandaLaCabecera && <span className="text-slate-500 font-normal"> · elegida arriba</span>}</span>
              : <FiltroProyecto value={proy} onChange={setProy} />}
            {ALMACENEROS[proy] && <span className="text-slate-400 text-[11px]">Almacenero: {ALMACENEROS[proy]}</span>}
          </div>
        </div>
        {!esAlm && <div className="text-slate-500 text-[11px] mb-3">Vista de consulta: las recepciones, salidas y préstamos los registra el almacenero de cada obra.</div>}
        <div className="flex gap-1 flex-wrap border-t border-slate-800 pt-3">
          {PESTANAS.map(p => (
            <button key={p.k} onClick={() => setPestana(p.k)} title={p.nota}
              className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest border ${pestana === p.k
                ? 'bg-slate-800 text-slate-100 border-slate-600'
                : 'bg-slate-950 text-slate-500 border-slate-800 hover:border-slate-600 hover:text-slate-300'}`}>
              {p.t}
              {p.n > 0 && <span className={`ml-1.5 font-mono ${p.urge ? 'text-red-400' : 'text-sky-400'}`}>{p.n}</span>}
            </button>
          ))}
        </div>
        {avisoTarde && (
          <div className="mt-3 border border-yellow-700 bg-yellow-950/40 rounded px-3 py-2">
            <div className="text-[11px] font-bold tracking-widest text-yellow-400 uppercase">
              ⏰ Antes de cerrar el día
            </div>
            {porVerificar > 0 && (
              <div className="text-[11px] text-slate-300 mt-0.5">
                Te faltan verificar <b className="text-yellow-400 font-mono">{porVerificar}</b> salida(s):
                hay que decir si el material se usó bien o mal.
                {pestana !== 'salidas' && (
                  <button onClick={() => setPestana('salidas')}
                    className="ml-2 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-slate-800 text-yellow-400 border border-yellow-700 hover:bg-slate-700">
                    Ir a Salidas
                  </button>
                )}
              </div>
            )}
            {aMedias.length > 0 && (
              <div className="text-[11px] text-slate-300 mt-1">
                <b className="text-red-400 font-mono">{aMedias.length}</b> devolución(es) de préstamo
                <b className="text-red-400"> a medias</b>: un almacén confirmó y el otro no, así que
                las dos obras cuentan ese material distinto.
                {aMediasViejas.length > 0 && <span className="text-red-400"> {aMediasViejas.length} llevan más de un día.</span>}
                {pestana !== 'prestamos' && (
                  <button onClick={() => setPestana('prestamos')}
                    className="ml-2 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-slate-800 text-red-400 border border-red-800 hover:bg-slate-700">
                    Ir a Préstamos
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <div className="mt-3"><Aviso msg={aviso} /></div>
      </div>

      {pestana === 'recepcion' && (
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Recepción de materiales · {proy}</div>
        <Buscar valor={busq.recepcion || ''} onChange={v => setBusq(b => ({ ...b, recepcion: v }))}
          placeholder="Buscar material, código o RQ…"
          encontradas={porRecibirFiltrado.length} total={porRecibir.length} />
        {porRecibirMostrar.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">
            {qRec ? `Nada por recibir coincide con "${qRec}" en ${proy}.`
              : `Nada por recibir en ${proy}. Los ítems aparecen aquí cuando Compras los aprueba.`}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{(soloVigila
                ? ['RQ', 'Descripción', 'Pedido', 'Recibido', 'Falta', 'Estado']
                : ['RQ', 'Descripción', 'Pedido', 'Recibido', 'Falta', 'Estado', 'Cant. que llega', 'Observaciones', '']
              ).map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {porRecibirMostrar.map(i => {
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
        <PieTope mostradas={porRecibirMostrar.length} total={porRecibirFiltrado.length}
          abierto={!!sinTope.recepcion} onToggle={() => setSinTope(s => ({ ...s, recepcion: !s.recepcion }))} />
        <div className="mt-3 text-slate-500 text-[11px]">Si la cantidad recibida es menor a la pedida, el ítem pasa a Incompleto automáticamente (visible en Compras y Almacén); al llegar el saldo se registra otra recepción y pasa a Entregado.</div>
      </div>
      )}

      {/* Corregir una cantidad mal digitada. Va en su propio bloque porque
          alcanza también a lo ya Entregado, que sale de la tabla de arriba:
          justo el caso de digitar 40 donde iba 4 y completar el pedido.
          Acompaña a la recepción en su pestaña: es la misma tarea. */}
      {pestana === 'recepcion' && !soloVigila && recibidasRecientes.length > 0 && (
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

      {pestana === 'stock' && (<>
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="flex items-baseline gap-3 mb-3 flex-wrap">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Stock del almacén · {proy}</div>
          {/* El valorizado NO se le muestra al almacenero (decision del dueno,
              30 ago 2026). Su rol no puede leer factura_items -- la RLS de la
              migracion 13 mantiene el dinero fuera del alcance de almacen y
              residente, y eso esta bien-- asi que `precioProm` le llega vacio y
              el numero le salia siempre "S/ 0.00 ... parcial: N sin precio".
              Un cero que no significa cero: parece que el almacen no vale nada.
              De las dos salidas posibles --abrir el acceso al dinero a dos roles
              mas, o quitar el numero-- el dueno eligio quitarlo: el almacenero
              no necesita saber cuanto vale su stock para hacer su trabajo.
              Gerencia SI lo ve, y para ella el numero es real. */}
          {soloVigila && (
            <div className="ml-auto text-right">
              <div className="text-xl font-bold font-mono text-green-400">S/ {valorizado.toFixed(2)}</div>
              <div className="text-[9px] text-slate-500 uppercase tracking-widest">
                valorizado · con IGV{sinPrecio > 0 ? ` · parcial: ${sinPrecio} sin precio` : ''}</div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Buscar valor={busq.stock || ''} onChange={v => setBusq(b => ({ ...b, stock: v }))}
            placeholder="Buscar material o código…"
            encontradas={stockFiltrado.length} total={stockTodo.length} />
          {stockCero.length > 0 && !qStock && (
            <button onClick={() => setVerCeros(v => !v)}
              className="mb-2 px-2.5 py-1 rounded border border-slate-700 bg-slate-800 hover:border-slate-500"
              title="Materiales que pasaron por este almacén y hoy están en cero. Vuelven solos a la lista en cuanto entre material.">
              <span className="font-mono font-bold text-slate-400">{stockCero.length}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 ml-1.5">
                sin stock · {verCeros ? '✕ ocultar' : 'ver'}</span>
            </button>
          )}
        </div>
        {stock.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">
            {qStock ? `Ningún material coincide con "${qStock}" en ${proy}.`
              : stockTodo.length === 0 ? 'Sin materiales en este almacén. El stock se forma con las recepciones registradas en Recepción.'
              : `Nada con stock en ${proy}. Hay ${stockCero.length} material(es) en cero, archivados arriba.`}
          </div>
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
                  // NO SE BLOQUEA TODO POR TENER ALGO VENCIDO. El stock real es
                  // MIXTO: con 110 unidades de las que 10 caducaron, parar las
                  // 110 es desproporcionado y deja al almacenero sin poder
                  // trabajar, sin ninguna forma de dar de baja las 10. Se limita
                  // a lo SANO — ni reservado ni vencido — y se dice cuánto hay
                  // de cada cosa. Quien mira las bolsas es él.
                  const tope = s.sano;
                  const listo = esAlm && tope > 0 && Number(f.cant) > 0 && Number(f.cant) <= tope && f.hoja.trim() && f.zona.trim();
                  return (
                    <tr key={s.cod} className="border-b border-slate-800 align-top">
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{s.cod}</td>
                      <td className="py-2 px-1.5 text-slate-200">{s.desc}</td>
                      <td className="py-2 px-1.5 text-slate-500">{s.und}</td>
                      <td className="py-2 px-1.5">
                        {cad ? (
                          <div>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase whitespace-nowrap ${cad.cls}`}>{cad.k}</span>
                            {s.vencida > 0 && (
                          <div className="text-[9px] text-red-400 mt-1 w-28 leading-tight">
                            {s.vencida} {s.und} vencida(s) en el estante. No las uses.
                            {s.sano > 0 ? ` Puedes sacar hasta ${s.sano}.` : ' No queda nada sano que sacar.'}
                            {' '}Avisa a gerencia.
                          </div>
                        )}
                          </div>
                        ) : <span className="text-slate-600">—</span>}</td>
                      <td className={`py-2 px-1.5 font-mono ${s.inicial > 0 ? 'text-sky-400' : 'text-slate-500'}`}>{s.inicial}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{s.recibido}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{s.salido}</td>
                      <td className={`py-2 px-1.5 font-mono ${s.prestNeto < 0 ? 'text-purple-400' : s.prestNeto > 0 ? 'text-green-400' : 'text-slate-500'}`}>{s.prestNeto > 0 ? '+' + s.prestNeto : s.prestNeto}</td>
                      <td className={`py-2 px-1.5 font-mono font-bold ${s.stock > 0 ? 'text-green-400' : 'text-slate-500'}`}>{s.stock}
                        {/* Desglosado: una salida sin firmar y un prestamo pedido son dos
                            conversaciones distintas -- con el residente de esta obra o con
                            el de la otra. Juntos en un solo numero, el almacenero leia
                            "-10 pend. aprob." y no sabia a quien ir a buscar. */}
                        {s.reservado > 0 && (
                          <div className="text-[9px] text-yellow-400 font-normal leading-tight">−{s.reservado} reservado
                            <div className="text-slate-500">{[
                              s.resSalidas > 0 && `${s.resSalidas} en salida sin firmar`,
                              s.resPrestamos > 0 && `${s.resPrestamos} en préstamo pedido`,
                            ].filter(Boolean).join(' · ')}</div>
                          </div>
                        )}</td>
                      {!soloVigila && (<>
                      <td className="py-2 px-1.5"><input type="number" min="1" step="any" value={f.cant} onChange={e => { const v = e.target.value; if (v === '' || Number(v) > 0) setS('cant', v); }} disabled={!esAlm} className={`w-16 ${inputCls}`} />
                        {Number(f.cant) > tope && (
                        <div className="text-[9px] text-red-400 mt-1">
                          Excede lo que se puede sacar ({tope})
                          {s.vencida > 0 && <span> · {s.vencida} vencida(s)</span>}
                          {s.reservado > 0 && <span> · {s.reservado} reservada(s)</span>}
                        </div>
                      )}</td>
                      <td className="py-2 px-1.5"><input value={f.hoja} onChange={e => setS('hoja', e.target.value)} disabled={!esAlm} placeholder="N° de hoja" className={`w-20 ${inputCls} font-mono`} /></td>
                      <td className="py-2 px-1.5"><input value={f.zona} onChange={e => setS('zona', e.target.value)} disabled={!esAlm} placeholder="¿En qué zona?" className={`w-32 ${inputCls}`} /></td>
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
        <PieTope mostradas={stock.length} total={stockFiltrado.length}
          abierto={!!verCeros} onToggle={() => setVerCeros(v => !v)} />
        {/* El aviso del descuadre estaba SOLO en la version de gerencia -- y
            quien tiene que ir a contar el estante es el almacenero, que era el
            unico que no lo leia. Ahora lo ven los dos, y al almacenero se le
            dice ademas que haga el conteo. */}
        <div className="mt-3 text-slate-500 text-[11px]">
          Stock = inicial (inventario físico) + recibido − salidas ± préstamos.
          {!soloVigila && ' Toda salida exige N° de hoja de trabajo y zona de trabajo.'}
          {negativos > 0
            ? <b className="text-red-400"> Hay {negativos} material(es) en negativo: eso es un descuadre real —el sistema dice que salió más de lo que entró— y solo se arregla contando el estante.</b>
            : ' Un stock negativo indica un descuadre que hay que ir a contar.'}
        </div>
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
      </>)}

      {pestana === 'prestamos' && (
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Préstamos entre almacenes</div>
          {presCerrados.length > 0 && (
            <button onClick={() => setVerCerrados(v => !v)}
              className="ml-auto px-2.5 py-1 rounded border border-slate-700 bg-slate-800 hover:border-slate-500"
              title="Devueltos, transferidos, rechazados y anulados. Ya no piden nada a nadie, pero la historia no se borra.">
              <span className="font-mono font-bold text-slate-400">{presCerrados.length}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 ml-1.5">
                cerrado(s) · {verCerrados ? '✕ ocultar' : 'ver'}</span>
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
              {stockTodo.filter(s => s.disponible > 0).map(s => <option key={s.cod} value={s.cod}>{s.desc} (disp: {s.disponible} {s.und})</option>)}</select></div>
          <div><label className={lblCls}>Cantidad{matPres ? ` (en ${matPres.und})` : ''}</label>
            <input type="number" min="1" step="any" value={fPres.cant} onChange={e => { const v = e.target.value; if (v === '' || Number(v) > 0) setFPres({ ...fPres, cant: v }); }} disabled={!esAlm} className={`w-full ${inputCls}`} />
            {matPres && Number(fPres.cant) > matPres.disponible && <div className="text-[9px] text-red-400 mt-1">Excede disponible ({matPres.disponible} {matPres.und})</div>}</div>
          <div><label className={lblCls}>Almacén destino</label>
            <FiltroProyecto value={fPres.destino} onChange={v => setFPres({ ...fPres, destino: v })} excluir={proy} /></div>
        </div>
        <button onClick={prestar} disabled={!presOk} className={btnOk(!!presOk)}>Solicitar aprobación (origen + destino)</button>
        </>)}

        {presMostrar.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">
            Ningún préstamo abierto en {proy}.
            {presCerrados.length > 0 && ` Hay ${presCerrados.length} cerrado(s) archivado(s) arriba.`}
          </div>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-xs">
              <thead><tr>{['#', 'Fecha', 'Material', 'Cant', 'Origen', 'Destino', 'Aprobación', 'Estado', 'Acción'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {presMostrar.map(p => (
                  <tr key={p.n} className={`border-b align-top ${
                    p.estado === 'Prestado' && ((p.devolOrigen && !p.devolDestino) || (p.devolDestino && !p.devolOrigen))
                      ? 'border-red-800 bg-red-950/30' : 'border-slate-800'}`}>
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
                      {/* Un prestamo SOLICITADO ya reserva material en el origen
                          (migracion 73), pero hasta ahora la unica accion en pantalla
                          era para los 'Prestado'. Si el residente de origen ya firmo,
                          el prestamo sale de SU bandeja, y si el de destino no firma
                          nunca, el material se queda reservado indefinidamente sin que
                          nadie del almacen pueda hacer nada. La base SI permite
                          Solicitado -> Anulado (migracion 41): faltaba el boton. */}
                      {esAlm && p.estado === 'Solicitado' && (
                        <div>
                          <div className="text-[9px] text-slate-500 leading-tight mb-1">
                            Esperando la firma de los dos residentes. El material ya está
                            reservado en {p.origen}: si el préstamo se quedó parado, anúlalo
                            para liberarlo.
                          </div>
                          <AnularBox onConfirm={m => anularPrestamo(p, m)} />
                        </div>
                      )}
                      {esAlm && p.estado === 'Prestado' && (
                        <div>
                          <div className="text-[9px] text-slate-500 leading-tight mb-1">
                            Si la otra obra ya consumió el material, avisa a gerencia: durante el
                            piloto no se transfiere el costo (hace falta factura entre empresas).</div>
                          {/* DEVOLVER, CON LAS DOS FIRMAS (migración 81). Antes era
                              un solo botón "Devuelto" que veían los dos almacenes,
                              así que el que TENÍA el material podía darlo por
                              devuelto sin moverlo: el stock volvía al origen, que
                              no tenía nada. Ahora cada uno confirma su lado y la
                              base cierra sola cuando llegan los dos. */}
                          <div className="mb-1">
                            {[['destino', p.destino, p.devolDestino, 'lo entregué'],
                              ['origen',  p.origen,  p.devolOrigen,  'lo recibí y lo conté']].map(([lado, obra, firma, texto]) => (
                              <div key={lado} className="flex items-center gap-1 mb-0.5">
                                {firma
                                  ? <span className="text-[9px] text-green-400">✓ {obra}: {texto} ({firma})</span>
                                  : proy === obra
                                    ? <button onClick={() => confirmarDevol(p, lado)}
                                        className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-green-400 border border-slate-700 hover:border-green-400"
                                        title={`Confirma que ${texto}. El préstamo se cierra cuando lo confirmen los dos almacenes.`}>
                                        ↩ {texto}</button>
                                    : <span className="text-[9px] text-yellow-400">⋯ falta que {obra} confirme</span>}
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-1">
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
        {/* El pie describía "Transferir al costo" como si fuera una opción viva.
            La migración 74 la deshabilitó durante el piloto, así que mandaba a
            una puerta tapiada. (Los mensajes de error de la BASE siguen diciendo
            lo mismo: eso necesita migración y está apuntado en ESTADO.md.) */}
        <div className="mt-3 text-slate-500 text-[11px]">El préstamo nace "Solicitado" y ya reserva material en el origen, aunque no lo mueve hasta que lo aprueban los residentes de las dos obras. Si se queda parado sin firmar, el almacén puede anularlo y liberar la reserva. Ya activo: resta al origen y suma al destino como deuda. "Devuelto" revierte el stock y solo procede si el destino no lo consumió; si ya lo consumió, el préstamo <b className="text-slate-400">queda abierto a propósito</b> hasta que se liquide entre las empresas — durante el piloto no se transfiere el costo. Anular exige motivo.</div>
      </div>
      )}

      {pestana === 'salidas' && (
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Salidas · {proy} · verificación de uso</div>
          {salArchivadas.length > 0 && (
            <button onClick={() => setVerArchivadas(v => !v)}
              className="ml-auto px-2.5 py-1 rounded border border-slate-700 bg-slate-800 hover:border-slate-500"
              title="Ya verificadas, anuladas o rechazadas. No piden nada; la historia no se borra.">
              <span className="font-mono font-bold text-slate-400">{salArchivadas.length}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 ml-1.5">
                archivada(s) · {verArchivadas ? '✕ ocultar' : 'ver'}</span>
            </button>
          )}
        </div>
        {esAlm && <div className="text-[11px] text-slate-500 mb-3">Aquí solo lo que falta por verificar. Para registrar una salida nueva, ve a <b className="text-slate-400">Stock</b>: se saca desde la fila del material.</div>}
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
        {salMostrar.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">
            {salidasProy.length === 0
              ? `Sin salidas registradas en ${proy}.`
              : `Nada por verificar en ${proy}. 👍`}
            {salArchivadas.length > 0 && salidasProy.length > 0 &&
              ` Hay ${salArchivadas.length} archivada(s) arriba.`}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['#', 'Fecha', 'Material', 'Cant', 'Hoja de trabajo', 'Zona', 'Aprobación', 'Uso', 'Acción', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {salMostrar.map(sa => {
                  const v = verif[sa.n];
                  const archivada = salidaResuelta(sa);
                  return (
                    <tr key={sa.n} className={`border-b border-slate-800 align-top ${sa.anulada ? 'opacity-50' : archivada ? 'opacity-60' : ''}`}>
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
                        : sa.uso === 'Correcto' ? <div><span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-green-950 text-green-400">Correcto uso</span>
                            {soloVigila && <div className="text-[9px] text-slate-500 mt-0.5">verificado {horaTxt(sa.usoEn)}</div>}</div>
                        : <div><span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-red-950 text-red-400">Uso incorrecto</span>
                            {soloVigila && <div className="text-[9px] text-slate-500 mt-0.5">verificado {horaTxt(sa.usoEn)}</div>}
                            <div className="text-red-400 text-[10px] mt-1">{sa.motivoUso}</div>
                            {sa.reingresada > 0 && <div className="text-green-400 text-[10px] mt-1">↩ {sa.reingresada} {sa.und} reingresado a stock{sa.reingresoPor ? ` (${sa.reingresoPor})` : ''}
                              {soloVigila && <span className="text-slate-500"> · {horaTxt(sa.reingresoEn)}</span>}</div>}
                            {/* Que se vea POR QUÉ salió de la bandeja: sin esto,
                                una fila archivada con 0 devueltos parece un olvido. */}
                            {sa.reingresoCerrado && Number(sa.reingresada) < Number(sa.cant) && (
                              <div className="text-slate-500 text-[10px] mt-1">
                                ✓ cerrado: no vuelve más ({Number(sa.cant) - Number(sa.reingresada)} {sa.und} sin recuperar)
                                {soloVigila && sa.reingresoEn && <span> · {horaTxt(sa.reingresoEn)}</span>}</div>
                            )}</div>}
                      </td>
                      <td className="py-2 px-1.5">
                        {esAlm && !sa.anulada && sa.aprobacion === 'Aprobada' && sa.uso === 'Pendiente' && !v && (
                          <div className="flex gap-1">
                            <button onClick={() => marcarUso(sa, 'Correcto')} className={btnVerde}>Correcto uso</button>
                            <button onClick={() => setVerif({ ...verif, [sa.n]: { motivo: MOTIVOS_USO[0], otro: '' } })} className={btnRojo}>Uso incorrecto</button>
                          </div>
                        )}
                        {/* CORREGIR UNA VERIFICACIÓN EQUIVOCADA (migración 80).
                            "Correcto uso" se marca con UN clic, sin confirmación, en
                            una tabla larga: el clic en la fila de al lado es cuestión
                            de tiempo. Sin este camino, esa salida quedaba congelada
                            mal para siempre — no se podía re-verificar, ni anular, ni
                            reingresar. Solo aparece mientras no haya vuelto material:
                            un reingreso SÍ movió stock y no se deshace desde aquí. */}
                        {esAlm && !sa.anulada && sa.uso !== 'Pendiente' && Number(sa.reingresada || 0) === 0 && (
                          <AnularBox label="↺ Corregir verificación"
                            placeholder="¿Por qué se corrige? (obligatorio)"
                            titulo="Deshacer esta verificación: la salida vuelve a quedar por verificar. No mueve stock; queda el rastro con tu nombre y la hora."
                            onConfirm={m => corregirUso(sa, m)} />
                        )}
                        {/* Uso incorrecto y sin cerrar: hay que decidir el reingreso.
                            Tres pasos, y el último es la ventana de confirmación —
                            devolver material MUEVE stock, así que no se dispara con
                            un solo clic sobre un campo de texto. */}
                        {esAlm && !sa.anulada && sa.uso === 'Incorrecto' && !sa.reingresoCerrado && sa.reingresada < sa.cant && (
                          confirmReing && confirmReing.n === sa.n ? (
                            // PASO 3 · confirmar. Si el reingreso es PARCIAL se
                            // aprovecha para preguntar lo único que la base no
                            // puede deducir: si va a volver algo más. El
                            // almacenero lo sabe ahora; dentro de un mes, no.
                            <div className="w-52 border border-yellow-700 bg-yellow-950/40 rounded p-2">
                              <div className="text-[10px] text-slate-200 leading-tight">
                                ¿Confirmas el reingreso de <b className="text-yellow-400 font-mono">{confirmReing.cant} {sa.und}</b>?
                              </div>
                              {Number(confirmReing.cant) + Number(sa.reingresada) < Number(sa.cant) ? (
                                <>
                                  {/* NO usar Sí/No aquí. La primera versión preguntaba
                                      "¿esperas que vuelva algo más?" y ponía [No, esto es
                                      todo] primero y en VERDE: la pregunta pedía un sí/no
                                      y el botón destacado decía "No", así que quien iba
                                      rápido cerraba la HT creyendo que la dejaba abierta.
                                      Pasó en la prueba del 31 ago. Ahora cada botón dice
                                      la CONSECUENCIA, no una respuesta. */}
                                  <div className="text-[9px] text-slate-400 mt-1 leading-tight">
                                    Vuelven {Number(confirmReing.cant) + Number(sa.reingresada)} de {sa.cant} según esta pantalla.
                                    Quedarían {Number(sa.cant) - Number(confirmReing.cant) - Number(sa.reingresada)} sin recuperar.
                                  </div>
                                  <div className="flex flex-col gap-1 mt-1.5">
                                    <button onClick={() => reingresar(sa, Number(confirmReing.cant), false)}
                                      className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-200 border border-slate-500 hover:border-slate-300 text-left">
                                      ↩ Registrar y DEJAR ABIERTA<br />
                                      <span className="font-normal normal-case text-slate-400">puede volver más material</span></button>
                                    <button onClick={() => reingresar(sa, Number(confirmReing.cant), true)}
                                      className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-orange-300 border border-orange-800 hover:bg-orange-950 text-left">
                                      ✓ Registrar y CERRAR<br />
                                      <span className="font-normal normal-case text-orange-200/70">no volverá nada más; sale de la lista</span></button>
                                  </div>
                                </>
                              ) : (
                                <button onClick={() => reingresar(sa, Number(confirmReing.cant), true)}
                                  className="mt-1.5 w-full px-2 py-1 rounded text-[9px] font-bold uppercase bg-green-950 text-green-400 border border-green-800 hover:bg-green-900">
                                  Confirmar · vuelve todo</button>
                              )}
                              <button onClick={() => setConfirmReing(null)}
                                className="mt-1 w-full px-2 py-0.5 rounded text-[9px] text-slate-500 hover:text-slate-200">Cancelar</button>
                            </div>
                          ) : fReing[sa.n] !== undefined ? (
                            // PASO 2 · cuánto vuelve
                            <div className="w-40">
                              <div className="text-[9px] text-slate-400 mb-1">Devolver a stock (máx {sa.cant - sa.reingresada} {sa.und}):</div>
                              <input type="number" min="1" step="any" max={sa.cant - sa.reingresada}
                                value={fReing[sa.n].cant} onChange={e => setFReing({ ...fReing, [sa.n]: { cant: e.target.value } })}
                                placeholder="Cantidad" className={`w-full ${inputCls}`} />
                              <div className="flex gap-1 mt-1">
                                <button onClick={() => setConfirmReing({ n: sa.n, cant: fReing[sa.n].cant })}
                                  disabled={!(Number(fReing[sa.n].cant) > 0 && Number(fReing[sa.n].cant) <= sa.cant - sa.reingresada)}
                                  className={`flex-1 ${btnOk(Number(fReing[sa.n].cant) > 0 && Number(fReing[sa.n].cant) <= sa.cant - sa.reingresada)}`}>Reingresar</button>
                                <button onClick={() => { const f2 = { ...fReing }; delete f2[sa.n]; setFReing(f2); }} className="px-2 py-1 rounded text-[9px] text-slate-500 hover:text-slate-200">✕</button>
                              </div>
                            </div>
                          ) : (
                            // PASO 1 · ¿hay reingreso o no? Si no lo hay, la HT se
                            // cierra igual: "no vuelve nada" es una respuesta, y
                            // hasta ahora no había forma de darla — por eso esas
                            // filas se quedaban a la vista para siempre.
                            <div className="w-44">
                              <div className="text-[9px] text-slate-400 mb-1">¿Vuelve material al almacén?</div>
                              <div className="flex gap-1">
                                <button onClick={() => setFReing({ ...fReing, [sa.n]: { cant: '' } })}
                                  className="flex-1 px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-green-400 border border-slate-700 hover:border-green-400"
                                  title="Devolver a stock lo recuperable de esta salida mal usada.">Sí</button>
                                <button onClick={() => reingresar(sa, 0, true)}
                                  className="flex-1 px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-500"
                                  title="No vuelve nada: la HT se cierra y sale de la lista por verificar. Queda archivada con la hora.">No</button>
                              </div>
                            </div>
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
                      {/* ANULAR SOLO ANTES DE VERIFICAR EL USO.
                          Anular devuelve al stock TODO lo que salió. Si el uso ya
                          se verificó, ese material se consumió (uso correcto) o se
                          perdió (uso incorrecto sin recuperar), así que devolverlo
                          INVENTA existencias: una salida de 10 con 5 recuperados
                          anulada mete 10 al stock, cinco de ellas inexistentes.
                          Anular sirve para el error de registro —"esto no salió"—,
                          y eso se sabe antes de verificar. Después, el camino es
                          registrar el movimiento que corresponda, no borrar este.
                          Tampoco se anula una RECHAZADA: nunca movió stock.
                          OJO: la base todavía lo permite (falta la guarda; anotado
                          en ESTADO.md como migración pendiente). Esto es solo la
                          pantalla, y una regla que solo vive en la pantalla se
                          esquiva. */}
                      <td className="py-2 px-1.5">
                        {esAlm && !sa.anulada && sa.aprobacion !== 'Rechazada' && sa.uso === 'Pendiente'
                          ? <AnularBox onConfirm={m => anularSalida(sa, m)} />
                          : esAlm && !sa.anulada && sa.uso !== 'Pendiente' && (
                            <span className="text-[9px] text-slate-600 leading-tight"
                              title="El uso ya se verificó: anularla devolvería al stock material que se consumió o se perdió. Si hay que corregir algo, se registra el movimiento que toque.">
                              uso verificado:<br />no se anula</span>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <PieTope mostradas={salMostrar.length} total={salOrden.length}
              abierto={!!sinTope.salidas} onToggle={() => setSinTope(s => ({ ...s, salidas: !s.salidas }))} />
          </div>
        )}
      </div>
      )}
    </div>
  );
}
