// Movido de App.jsx (etapa 9 de la separacion en modulos), texto identico.
import { useState, Fragment, useEffect } from 'react';
import { HOY_ISO, fmt, dias, diasHoy } from '../fechas';
import { estadoCaducidad, calcularStocks } from '../stock';
import { FORMAS_PAGO, PLAZOS_CREDITO, esCredito, vencimientoDe, rucValido } from '../pago';
import { imprimirRQ } from '../pdf';
import { PROYECTOS } from '../maestros';
import { Aviso, AnularBox, AlertaCerrable, FiltroProyecto, FechaInput, inputCls, thCls, btnOk, btnRojo, btnVerde, pillEstado, pendCls } from '../ui';
import { PedidoCotizacion } from './PedidoCotizacion';
import { HistorialPrecios } from './HistorialPrecios';

// DOS COMPORTAMIENTOS QUE NO SE TOCAN:
// 1. App monta Compras DOS veces: pestania com (decidir+facturar) y
//    pestania fac con modo='facturar' (Frank). Facturar NO es un
//    componente aparte -- extraerlo seria reescritura.
// 2. HistorialPrecios se muestra en AMBOS modos (Frank negocia en
//    mostrador con el, y gerencia tambien lo consulta); PedidoCotizacion solo
//    para quien compra y cuando NO es facturar.

// Unidades que no admiten decimales: 2.5 tornillos no existen. Las de peso,
// volumen o longitud sí (2.5 KG de clavos es de todos los días).
const UND_ENTERA = u => ['UND', 'PZA', 'JUEGO', 'PAR', 'CAJA', 'ROLLO', 'PQT', 'VARILLA', 'BOLSA', 'BALDE', 'GALON', 'MILLAR'].includes((u || '').toUpperCase());

export function Compras({ user, db, api, modo, obraGlobal }) {
  const { rqs, facturas, proveedores, ultimaCompra, mejorPrecio2m = {}, rendiciones = [] } = db;
  // Obras con la caja chica trabada: descuadre o observación sin resolver de días anteriores
  const cajasTrabadas = rendiciones.filter(r =>
    (r.estado === 'Con diferencia' || r.estado === 'Observada') && r.fecha < HOY_ISO);
  const facturarSolo = modo === 'facturar';   // rol comprador: solo factura, no decide
  const puedeFacturar = user.rol === 'compras' || user.rol === 'comprador';
  // Dar por cerrado el saldo de una compra parcial es decisión de compra, no de
  // quien fue a buscar el material: solo Lucía. La base lo exige igual.
  const esCompras = user.rol === 'compras';
  const [rechazo, setRechazo] = useState({});
  const [aviso, setAviso] = useState('');
  const [proy, setProy] = useState('TODOS');
  // Gerencia elige la obra en la cabecera y los modulos la siguen. Va pegado
  // al estado del filtro, con los demas ganchos: bajarlo tumba la vista.
  useEffect(() => { if (obraGlobal) setProy(obraGlobal); }, [obraGlobal]);
  const [fFact, setFFact] = useState({});
  const [buscaExtra, setBuscaExtra] = useState({});   // filtro de la lista "otros ítems que cubre"
  const [triage, setTriage] = useState(null);
  const [busca, setBusca] = useState('');
  const [confAprRq, setConfAprRq] = useState(null);
  const [verArch, setVerArch] = useState(false);
  const [verPagadas, setVerPagadas] = useState(false);

  const updItem = async (i, patch, okMsg) => {
    const r = await api.updItem(i.id, patch);
    if (r.error) { setAviso('⚠ ' + r.error); setTimeout(() => setAviso(''), 7000); return false; }
    if (okMsg) { setAviso(okMsg); setTimeout(() => setAviso(''), 5000); }
    return true;
  };

  const rqMap = Object.fromEntries(rqs.map(r => [r.n, r]));
  const flatBase = rqs.flatMap(r => r.items.map(i => ({ ...i, rq: r.n, fechaRQ: r.fechaRQ, canalRq: r.canal, residente: r.residente, just: r.just, proyecto: r.proyecto, piso: r.piso, tipoRq: r.tipo, cotizacionRef: r.cotizacionRef })));
  // Cerrado para Compras: aprobado, comprado y pagado. Lo que falte recibir
  // lo sigue viendo el almacén y el Tablero, pero aquí ya no estorba.
  const cerradoParaCompras = i => i.pago === 'Pagado'
    && i.decision === 'Aprobado' && (i.estado === 'Comprado' || i.estado === 'Entregado');
  // primero lo que se necesita antes (fecha necesitada ascendente)
  const flatAbierto = flatBase
    .filter(i => i.decision !== 'Rechazado' && i.decision !== 'Anulado')
    .filter(i => !cerradoParaCompras(i))
    .filter(i => proy === 'TODOS' || i.proyecto === proy)
    // el comprador (Frank) solo factura lo que ÉL marcó Comprado
    .filter(i => !facturarSolo || (i.decision === 'Aprobado' && i.compradoPorId === user.id));
  const esTriage = {
    decidir: i => i.decision === 'Pendiente',
    porComprar: i => i.decision === 'Aprobado' && i.estado === '—' && !i.compraParcial && !i.anulSolMotivo,
    anulPend: i => !!i.anulSolMotivo,
    facturar: i => i.decision === 'Aprobado' && !i.factura && i.estado !== '—',
    // Comprado hace más de 48 h y todavía sin factura: no entra a Pagos
    sinFactura48: i => i.estado === 'Comprado' && !i.factura && dias(HOY_ISO, i.fechaCompra || i.fechaRQ) >= 2,
    // Ya pagado, esperando que el proveedor entregue el documento
    porLlegar: i => {
      const f = facturas.find(x => x.serie === i.factura);
      return !!f && f.tipoDoc === 'Pendiente';
    },
    comprado: i => i.estado === 'Comprado',
    incompleto: i => i.estado === 'Incompleto',
  };
  // Cada contador que representa trabajo DETENIDO lleva ademas la ESPERA DEL MAS
  // VIEJO, que es lo que de verdad mide. No es lo mismo tener 12 pendientes de
  // hoy que 12 donde el mas antiguo lleva nueve dias: el numero dice cuanto hay,
  // la espera dice cuanto duele.
  //
  // Cada uno se mide desde SU momento, no desde una fecha generica:
  //   por decidir  -> desde que el residente lo pidio (es lo que el espera)
  //   por comprar  -> desde que Lucia lo aprobo
  //   anulacion    -> desde que se pidio la anulacion (espera al dueno)
  //   sin factura  -> desde que se compro
  //   incompletos  -> desde que llego la parte
  // Los de flujo normal no llevan espera: siempre hay material en transito.
  const espera = {
    decidir:      i => i.fechaRQ,
    porComprar:   i => (i.decididoEn || '').slice(0, 10) || i.fechaRQ,
    anulPend:     i => i.anulSolFecha,
    sinFactura48: i => i.fechaCompra || i.fechaRQ,
    incompleto:   i => i.fechaEntrega,
  };
  const masViejo = k => {
    const f = espera[k];
    if (!f) return null;
    const ds = flatAbierto.filter(esTriage[k]).map(f).filter(Boolean).map(x => dias(HOY_ISO, x));
    return ds.length ? Math.max(...ds) : null;
  };
  const chips = [
    !facturarSolo && ['decidir', 'Por decidir', 'text-yellow-400'],
    !facturarSolo && ['porComprar', 'Por comprar', 'text-orange-400'],
    !facturarSolo && ['anulPend', 'Anulación en gerencia', 'text-red-400'],
    ['facturar', 'Por facturar', 'text-sky-400'],
    ['sinFactura48', '+48h sin factura', 'text-red-400'],
    ['porLlegar', 'Factura por llegar', 'text-sky-400'],
    ['comprado', 'Comprado', 'text-green-400'],
    ['incompleto', 'Incompletos', 'text-red-400'],
  ].filter(Boolean);
  const matchBusca = i => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    const texto = `${i.desc} ${i.cod} rq-${String(i.rq).padStart(3, '0')} ${i.rq} ${i.residente} ${i.proyecto} ${i.compradoPor || ''}`.toLowerCase();
    return q.split(/\s+/).every(p => texto.includes(p));
  };
  const ordenar = arr => [...arr].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.rq - b.rq));
  // Archivados: para Compras el trabajo termina cuando el ítem está decidido,
  // comprado y pagado. La recepción es tarea del almacén, así que ya no tiene
  // por qué seguir ocupando la bandeja de Lucía ni la de Frank.
  const flatArchivado = flatBase
    .filter(cerradoParaCompras)
    .filter(i => proy === 'TODOS' || i.proyecto === proy)
    .filter(i => !facturarSolo || (i.decision === 'Aprobado' && i.compradoPorId === user.id));
  const flatActivos = ordenar(flatAbierto.filter(i => !triage || esTriage[triage](i)).filter(matchBusca));
  const archMostrados = verArch ? ordenar(flatArchivado.filter(matchBusca)) : [];
  const flat = [
    ...flatActivos.map(i => ({ ...i, _arch: false })),
    ...archMostrados.map(i => ({ ...i, _arch: true })),
  ];

  const enviarRechazo = async i => {
    // El ítem pudo aprobarse mientras esta caja estaba abierta (otro clic, otra
    // persona, "Aprobar todo el RQ"). Rechazar entonces sería deshacer por la
    // puerta de atrás algo ya comprado o recibido.
    if (i.decision !== 'Pendiente') {
      const r = { ...rechazo }; delete r[i.id]; setRechazo(r);
      setAviso(`⚠ Ese ítem ya no está pendiente (está ${i.decision}): no se puede rechazar. Si hay que darlo de baja, usa Anular, que deja rastro y pasa por gerencia.`);
      return;
    }
    const motivo = (rechazo[i.id] || '').trim();
    if (!motivo) return;
    const ok = await updItem(i, { decision: 'Rechazado', motivo_rechazo: motivo },
      `Rechazo de "${i.desc}" (RQ-${String(i.rq).padStart(3, '0')}) comunicado al residente ${i.residente}. El ítem quedó cerrado; puedes verlo en el Tablero.`);
    if (ok) { const r2 = { ...rechazo }; delete r2[i.id]; setRechazo(r2); }
  };

  // La anulación la confirma GERENCIA (migración 22): Compras solicita, gerencia decide.
  const esGerente = user.rol === 'gerente';
  const solicitarAnulacion = (i, motivo) => {
    // Un ítem facturado o ya recibido no se anula: la base lo rechaza, y
    // pedirlo solo crea una solicitud que gerencia nunca podrá confirmar.
    if (i.factura) {
      setAviso('⚠ Ese ítem ya tiene factura: no se puede anular. Si la factura está mal, gerencia la anula primero y entonces el ítem queda libre.');
      setTimeout(() => setAviso(''), 9000);
      return;
    }
    if (Number(i.cantRecibida) > 0) {
      setAviso(`⚠ Ese ítem ya tiene ${i.cantRecibida} recibido en almacén: no se anula. Corrige primero la recepción con el almacenero.`);
      setTimeout(() => setAviso(''), 9000);
      return;
    }
    if (esGerente) {
      updItem(i, { decision: 'Anulado', anulacion: { motivo, por: user.nombre, fecha: HOY_ISO }, anulacion_solicitud: null, anulacion_rechazo: null },
        `Ítem "${i.desc}" anulado por ${user.nombre}. Queda registrado en el Tablero con motivo.`);
      return;
    }
    updItem(i, { anulacion_solicitud: { motivo, por: user.nombre, fecha: HOY_ISO }, anulacion_rechazo: null },
      `Anulación de "${i.desc}" enviada a gerencia. El ítem sigue activo hasta que gerencia la confirme.`);
  };
  const aprobarAnulacion = i =>
    updItem(i, {
      decision: 'Anulado',
      anulacion: { motivo: i.anulSolMotivo, por: user.nombre, fecha: HOY_ISO, solicitado_por: i.anulSolPor },
      anulacion_solicitud: null,
    }, `Anulación de "${i.desc}" confirmada. El ítem queda anulado con rastro completo.`);
  const rechazarAnulacion = (i, motivo) =>
    updItem(i, { anulacion_solicitud: null, anulacion_rechazo: { motivo, por: user.nombre, fecha: HOY_ISO } },
      `Anulación de "${i.desc}" rechazada. El ítem sigue vigente y Compras verá el motivo.`);

  // Atajo: aprobar de un clic todos los pendientes de un RQ (con confirmación)
  const aprobarRq = async rqNum => {
    const pend = flatBase.filter(x => x.rq === rqNum && x.decision === 'Pendiente');
    setConfAprRq(null);
    for (const x of pend) {
      const ok = await updItem(x, { decision: 'Aprobado' });
      if (!ok) return;
    }
    setAviso(`${pend.length} ítem(s) del RQ-${String(rqNum).padStart(3, '0')} aprobados.`);
    setTimeout(() => setAviso(''), 4000);
  };

  // Enter salta al siguiente campo dentro del formulario de factura
  const enterSiguiente = e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const campos = [...e.currentTarget.closest('.form-factura').querySelectorAll('input:not([type=checkbox]):not([disabled]), select:not([disabled])')];
    const idx = campos.indexOf(e.currentTarget);
    if (idx >= 0 && idx < campos.length - 1) campos[idx + 1].focus();
  };

  const abrirFactura = i => {
    if (!puedeFacturar) { setAviso('⚠ Solo Compras registra facturas.'); setTimeout(() => setAviso(''), 5000); return; }
    setFFact({ ...fFact, [i.id]: fFact[i.id] || { serie: '', prov: '', ruc: '', fecha: HOY_ISO, monto: '', forma: FORMAS_PAGO[0], extras: [], precios: {}, efectivo: false, compromiso: false, pendiente: false, medio: 'Transferencia', banco: '', numOp: '' } });
  };
  const cerrarFactura = id => { const f2 = { ...fFact }; delete f2[id]; setFFact(f2); };

  // Anular una factura mal registrada: la confirma gerencia y libera los ítems
  const anularFact = async (f, motivo) => {
    const r = await api.anularFactura(f.id, motivo);
    if (r.error) { setAviso('⚠ ' + r.error); setTimeout(() => setAviso(''), 8000); return; }
    setAviso(`Factura ${f.serie} anulada. Sus ${f.items.length} ítem(s) quedaron libres para volver a facturarse.`);
    setTimeout(() => setAviso(''), 6000);
  };

  const setFF = (id, k, v) => {
    const f = { ...fFact[id], [k]: v };
    if (k === 'prov') {
      const p = proveedores.find(x => x[1] === v);
      if (p) f.ruc = p[0];
    }
    // Un compromiso es siempre al crédito, pero el PLAZO importa: es lo que le
    // dice a Pagos cuándo vence. Antes se guardaba 'Crédito' pelado y vencía el
    // mismo día, así que todos los compromisos nacían en rojo.
    if (k === 'compromiso') f.forma = v ? (esCredito(f.forma) ? f.forma : 'Crédito 30 días') : FORMAS_PAGO[0];
    // Si ya pagaste no hay plazo que pactar: el dinero ya salió. Ofrecer aquí
    // "Crédito 30 días" era un callejón sin salida — el servidor la rechaza
    // diciendo que eso sería un compromiso, y nadie entiende por qué.
    if (k === 'pendiente' && v) f.forma = 'Inmediato';
    setFFact({ ...fFact, [id]: f });
  };

  const toggleExtra = (id, itemId) => {
    const f = fFact[id];
    const extras = f.extras.includes(itemId) ? f.extras.filter(x => x !== itemId) : [...f.extras, itemId];
    setFFact({ ...fFact, [id]: { ...f, extras } });
  };

  const tomar = async (i, valor) => {
    const r = await api.tomarItem(i.id, valor);
    if (r.error) { setAviso('⚠ ' + r.error); setTimeout(() => setAviso(''), 7000); return; }
    setAviso(valor ? `Te encargas de comprar "${i.desc}". El resto lo verá tomado por ti.`
                   : `Soltaste "${i.desc}": vuelve a quedar libre.`);
    setTimeout(() => setAviso(''), 5000);
  };

  const [parcial, setParcial] = useState({});
  const registrarParcial = async i => {
    const f = parcial[i.id];
    if (UND_ENTERA(i.und) && !Number.isInteger(Number(f.cant))) {
      setAviso(`⚠ ${i.und} no admite decimales: no existen ${f.cant} ${i.und.toLowerCase()}. Escribe una cantidad entera.`);
      setTimeout(() => setAviso(''), 8000);
      return;
    }
    const r = await api.compraParcial(i, f.cant, f.motivo, f.cerrar);
    if (r.error) { setAviso('⚠ ' + r.error); setTimeout(() => setAviso(''), 9000); return; }
    const p2 = { ...parcial }; delete p2[i.id]; setParcial(p2);
    const saldo = Number(i.cant) - Number(f.cant);
    setAviso(f.cerrar
      ? `Compra parcial de "${i.desc}": ${f.cant} de ${i.cant}. Las ${saldo} que faltan quedaron cerradas con tu motivo.`
      : `Compra parcial de "${i.desc}": ${f.cant} de ${i.cant}. El saldo de ${saldo} vuelve a la cola de compras.`);
    setTimeout(() => setAviso(''), 8000);
  };

  const registrarFactura = async i => {
    const f = fFact[i.id];
    const cubiertos = [i, ...flatBase.filter(x => f.extras.includes(x.id))];
    const suma = cubiertos.reduce((a, x) => a + (Number(f.precios[x.id]) || 0) * x.cant, 0);
    // Nunca fallar en silencio: si algo falta, decir QUÉ falta.
    const falta = [];
    if (!(f.compromiso || f.pendiente || f.serie.trim())) falta.push('el N° de factura');
    if (f.pendiente && !f.efectivo && !(f.banco || '').trim()) falta.push('el banco del pago');
    if (f.pendiente && !f.efectivo && !(f.numOp || '').trim()) falta.push('el N° de operación');
    if (!f.prov.trim()) falta.push('el proveedor');
    const vr = rucValido(f.ruc);
    if (!vr.ok) { setAviso('⚠ ' + vr.motivo); return; }
    if (!(Number(f.monto) > 0)) { setAviso('⚠ El monto de la factura tiene que ser mayor que cero. Una devolución o un descuento van por nota de crédito, que todavía no está en el sistema — avisa a gerencia.'); return; }
    if (cubiertos.some(x => Number(f.precios[x.id]) < 0)) { setAviso('⚠ Hay un precio negativo en el desglose. Revisa las cantidades: un precio nunca es negativo.'); return; }
    if (!f.fecha) falta.push('la fecha');
    else if (f.fecha > HOY_ISO) { setAviso('⚠ La fecha de la factura no puede ser futura. Revisa el año.'); return; }
    if (!f.monto && f.monto !== 0) falta.push('el monto total');
    const sinPrecio = cubiertos.filter(x => !(Number(f.precios[x.id]) > 0));
    if (sinPrecio.length) falta.push(`el precio de ${sinPrecio.length} ítem(s): ${sinPrecio.map(x => x.desc).join(', ')}`);
    if (falta.length) {
      setAviso('⚠ Falta ' + falta.join(' · '));
      setTimeout(() => setAviso(''), 8000);
      return;
    }
    if (Math.abs(suma - Number(f.monto)) > 0.1) {
      setAviso(`⚠ El desglose no cuadra: sumaste S/ ${suma.toFixed(2)} y la factura dice S/ ${Number(f.monto).toFixed(2)} (diferencia S/ ${Math.abs(suma - Number(f.monto)).toFixed(2)}).`);
      setTimeout(() => setAviso(''), 8000);
      return;
    }
    // Compromiso y pendiente reciben serie interna de la base (CRED-#### / PEND-####)
    const interna = f.compromiso || f.pendiente;
    const serie = interna ? 'X' : f.serie.trim().toUpperCase();
    if (!interna && facturas.some(x => x.serie === serie && x.ruc === f.ruc && !x.anulMotivo)) {
      setAviso(`⚠ La factura ${serie} de ese RUC ya está registrada. Verifica el número.`);
      setTimeout(() => setAviso(''), 6000);
      return;
    }
    const r = await api.registrarFactura({
      serie, prov: f.prov.trim().toUpperCase(), ruc: f.ruc, fecha: f.fecha,
      monto: Number(f.monto),
      forma: f.compromiso ? (esCredito(f.forma) ? f.forma : 'Crédito 30 días')
           : (f.efectivo || f.pendiente) ? 'Inmediato' : f.forma,
      proyecto: i.proyecto,
      efectivo: !!f.efectivo, compromiso: !!f.compromiso, pendiente: !!f.pendiente,
      medio: f.pendiente && !f.efectivo ? f.medio : null,
      banco: f.pendiente && !f.efectivo ? f.banco.trim() : null,
      numOp: f.pendiente && !f.efectivo ? f.numOp.trim() : null,
      lineas: cubiertos.map(x => ({ id: x.id, precio: Number(f.precios[x.id]) })),
    });
    if (r.error) { setAviso('⚠ ' + r.error); setTimeout(() => setAviso(''), 7000); return; }
    const f2 = { ...fFact }; delete f2[i.id]; setFFact(f2);
    setAviso(f.compromiso
      ? `Compromiso de crédito registrado cubriendo ${cubiertos.length} ítem(s): la deuda ya es visible en Pagos; la serie real se digita al pagar.`
      : f.pendiente
        ? `Compra registrada como PAGADA cubriendo ${cubiertos.length} ítem(s). Queda pendiente la factura: administración digitará la serie cuando llegue.`
        : `Factura ${serie} registrada cubriendo ${cubiertos.length} ítem(s).`);
    setTimeout(() => setAviso(''), 6000);
  };

  // El comprador solo ve LAS FACTURAS QUE ÉL REGISTRÓ: la deuda de la empresa
  // con todos los proveedores no es información que necesite para comprar.
  const factProy = facturas
    .filter(f => !facturarSolo || f.registradoPorId === user.id)
    .filter(f => proy === 'TODOS' || f.proyecto === proy);
  const factPendientes = factProy.filter(f => f.estadoPago !== 'Pagada');
  const factPagadas = factProy.filter(f => f.estadoPago === 'Pagada');
  const factMostradas = verPagadas ? factProy : factPendientes;

  // Consolidado por comprar: ítems aprobados sin gestionar (sin factura y
  // sin estado logístico), agrupados por material entre todas las obras.
  const stocks = calcularStocks(db);
  const porComprar = Object.values(flatBase
    .filter(i => i.decision === 'Aprobado' && !i.factura && i.estado === '—')
    // Lo que YA se consiguió no se vuelve a mandar comprar. Un ítem con compra
    // parcial registrada quedaba aquí con la cantidad conseguida y sin marca de
    // comprado, así que el consolidado sumaba lo conseguido MÁS su saldo y
    // pedía otra vez el total: se compraba dos veces.
    .filter(i => !i.compraParcial)
    // Ni lo que está esperando que gerencia confirme su anulación: mandarlo a
    // comprar es gastar en lo que se acaba de pedir cancelar.
    .filter(i => !i.anulSolMotivo)
    .reduce((acc, i) => {
      // Se agrupa por material Y UNIDAD. Antes la clave era solo el código: si
      // una obra pedía 3 CAJA y otra 36 UND del mismo material, el consolidado
      // mostraba "39" con la unidad de la primera línea que encontró. Nunca
      // deben sumarse cantidades de unidades distintas.
      const k = i.cod + '|' + (i.und || '');
      if (!acc[k]) acc[k] = { cod: i.cod, desc: i.desc, und: i.und, total: 0, porObra: {}, minFecha: i.fecha, tomados: {}, nItems: 0 };
      const g = acc[k];
      g.total += Number(i.cant);
      g.nItems += 1;
      g.porObra[i.proyecto] = (g.porObra[i.proyecto] || 0) + Number(i.cant);
      // Quién dijo que se encarga de comprarlo (migración 50). Va aquí porque
      // este consolidado es donde Lucía decide qué comprar: si el aviso solo
      // estuviera en la tabla de gestión, ella no lo vería a tiempo.
      if (i.tomadoPor) g.tomados[i.tomadoPor] = (g.tomados[i.tomadoPor] || 0) + 1;
      if (i.fecha < g.minFecha) g.minFecha = i.fecha;
      return acc;
    }, {}))
    .sort((a, b) => a.minFecha < b.minFecha ? -1 : 1);

  // sugerencia: alguna obra ya tiene stock de ese material (peor si está por vencer)
  const stockEnOtrasObras = g => PROYECTOS
    .map(([c, p]) => ({ obra: p, ...((stocks[p] || {})[g.cod] || { cant: 0, cadMin: null }) }))
    .filter(x => x.cant > 0);

  return (
    <div>
    {cajasTrabadas.length > 0 && (
      <AlertaCerrable
        id={'caja-trabada:' + cajasTrabadas.map(r => r.id).join(',')}
        resumen={`⛔ Caja chica bloqueada · ${cajasTrabadas.map(r => r.proyecto).join(', ')}`}>
        <div className="text-[11px] font-bold tracking-widest text-red-400 uppercase mb-1">
          ⛔ Caja chica bloqueada · {cajasTrabadas.length} obra(s)</div>
        {cajasTrabadas.map(r => (
          <div key={r.id} className="text-[11px] text-slate-200">
            <b>{r.proyecto}</b> · rendición del {fmt(r.fecha)}: {r.estado === 'Con diferencia'
              ? <>diferencia sin resolver{r.diferencia != null && <> ({r.diferencia < 0 ? 'faltan' : 'sobran'} S/ {Math.abs(r.diferencia).toFixed(2)})</>} — la levanta gerencia</>
              : <>observada por administración — hay que corregirla</>}
          </div>
        ))}
        <div className="text-[10px] text-red-300/80 mt-1">
          No se pueden registrar más compras en efectivo de esa obra hasta que se resuelva. Las compras con factura a crédito o transferencia siguen normales.</div>
      </AlertaCerrable>
    )}
    {/* Lo registra Lucia con la cotizacion del arquitecto. Gerencia no lo usa:
        es un formulario de trabajo, no informacion para analizar. */}
    {puedeFacturar && !facturarSolo && <PedidoCotizacion user={user} db={db} api={api} />}
    {/* El consolidado es la herramienta de compra de Lucia: junta el mismo
        material de varias obras para comprarlo una vez. Gerencia no compra --
        para ella es ruido operativo, no analisis. Lo mismo con el historial de
        precios, que es para negociar en el mostrador. */}
    {puedeFacturar && !facturarSolo && porComprar.length > 0 && (
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">
          Consolidado por comprar · {porComprar.length} material(es) · une pedidos de varias obras (la factura sigue siendo una por obra)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr>{['Material', 'Total a comprar', 'Detalle por obra', 'Más urgente', 'Stock en otras obras'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>
              {porComprar.map(g => {
                const otras = stockEnOtrasObras(g);
                const urg = diasHoy(g.minFecha);
                return (
                  <tr key={g.cod} className="border-b border-slate-800 align-top">
                    <td className="py-2 px-1.5 text-slate-200">{g.desc} <span className="text-slate-500">({g.und})</span>
                      <div className="font-mono text-[10px] text-slate-500">{g.cod}</div>
                      {mejorPrecio2m[g.cod] && (
                        <div className="text-[10px] text-sky-400 mt-1" title="Precio más bajo al que se compró en los últimos 2 meses. Úsalo para negociar.">
                          ▼ Más barato 2 meses: <b>S/ {mejorPrecio2m[g.cod].precio.toFixed(2)}</b> · {mejorPrecio2m[g.cod].prov}</div>
                      )}</td>
                    <td className="py-2 px-1.5 font-mono font-bold text-yellow-400">{g.total} {g.und}</td>
                    <td className="py-2 px-1.5 text-slate-300 text-[10px]">
                      {Object.entries(g.porObra).map(([o, c]) => `${o}: ${c}`).join(' · ')}
                      {Object.keys(g.porObra).length > 1 && <span className="ml-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-green-950 text-green-400">consolidable</span>}
                      {/* Quién se encargó ya de comprarlo. Avisa, no bloquea: si
                          Lucía tiene motivo para comprarlo igual, puede. */}
                      {Object.keys(g.tomados).length > 0 && (
                        <div className="text-[10px] text-sky-400 mt-1">
                          ✋ {Object.entries(g.tomados).map(([quien, n]) =>
                            `${quien.split(' ')[0]} se encarga${n < g.nItems ? ` de ${n} de ${g.nItems} pedidos` : ''}`).join(' · ')}
                        </div>
                      )}</td>
                    <td className={`py-2 px-1.5 whitespace-nowrap ${urg < 2 ? 'text-red-400 font-bold' : 'text-slate-300'}`}>{fmt(g.minFecha)}{urg < 2 ? ' · URGENTE' : ''}</td>
                    <td className="py-2 px-1.5 text-[10px]">
                      {otras.length === 0 ? <span className="text-slate-600">—</span> : otras.map(x => {
                        const cad = estadoCaducidad(x.cadMin);
                        // VENCIDO no es "por vencer": es material que ya no se
                        // puede usar. Antes caía en el mismo saco y el
                        // consolidado lo empujaba con más fuerza —"transferir
                        // antes que comprar"—, mandando a la otra obra material
                        // inservible; y al llegar por préstamo la caducidad no
                        // viaja, así que allá aparecía como bueno.
                        const vencido = cad && cad.k === 'VENCIDO';
                        const porVencer = !vencido && cad && (cad.cls.includes('yellow') || cad.cls.includes('red'));
                        const esSolicitante = !!g.porObra[x.obra];
                        return (
                          <div key={x.obra} className={vencido ? 'text-red-400' : porVencer ? 'text-yellow-400' : 'text-sky-400'}>
                            {vencido
                              ? `⛔ ${x.obra} tiene ${x.cant} ${g.und} VENCIDO(S) — no transferir; hay que darlos de baja. Comprar nuevo.`
                              : esSolicitante
                                ? `${x.obra} ya tiene ${x.cant} ${g.und} en su almacén${porVencer ? ` (${cad.k})` : ''} — verificar antes de comprar`
                                : `${x.obra} tiene ${x.cant} ${g.und}${porVencer ? ` (${cad.k}) — transferir antes que comprar` : ' — considerar préstamo/transferencia'}`}
                          </div>
                        );
                      })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-slate-500 text-[11px]">Negocia el total con el proveedor y pídele factura separada por obra: mejor precio por volumen sin mezclar presupuestos.</div>
      </div>
    )}
    <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">
          {facturarSolo ? 'Lo que compraste · registra aquí su factura' : 'Gestión de compras · aprobación, estado y seguimiento'}</div>
        <div className="ml-auto"><FiltroProyecto value={proy} onChange={setProy} todos /></div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {chips.map(([k, l, cls]) => {
          const n = flatAbierto.filter(esTriage[k]).length;
          const activo = triage === k;
          const dm = n > 0 ? masViejo(k) : null;
          return (
            <button key={k} onClick={() => setTriage(activo ? null : k)} title="Clic para ver solo estos"
              className={`text-left px-3 py-2 rounded border ${activo
                ? 'border-yellow-400 ring-1 ring-yellow-400 bg-slate-800'
                : 'border-slate-800 bg-slate-900 hover:border-slate-600'}`}>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className={`text-2xl font-bold font-mono ${n === 0 ? 'text-slate-600' : cls}`}>{n}</span>
                {n === 0 && espera[k] && <span className="text-[10px] font-mono text-green-500">✓ al día</span>}
                {dm !== null && <span className={`text-[10px] font-mono ${cls}`}>· el más viejo: {dm} d</span>}
              </div>
              <div className="text-[9px] font-bold tracking-widest text-slate-500 uppercase">{l}{activo ? ' · ✕ quitar filtro' : ''}</div>
            </button>
          );
        })}
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar material, RQ, residente…" className={`ml-auto w-56 ${inputCls}`} />
        <button onClick={() => setVerArch(v => !v)}
          className={`px-2.5 py-1.5 rounded text-[10px] font-bold uppercase border ${verArch ? 'border-yellow-400 text-yellow-400 bg-slate-800' : 'border-slate-700 text-slate-400 bg-slate-800 hover:border-slate-500'}`}>
          📁 {verArch ? '✕ Ocultar' : `Archivados · ${flatArchivado.length}`}</button>
      </div>
      <Aviso msg={aviso} />
      {flat.length === 0 && <div className="text-center py-6 text-slate-500 text-sm">
        {triage || busca.trim() ? 'Nada que coincida con el filtro.' : `Sin requerimientos abiertos ${proy !== 'TODOS' ? 'en ' + proy : ''}.`}</div>}
      {flat.length > 0 && (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr>{['RQ', 'Proyecto', 'Nivel', 'Canal', 'Residente', 'Descripción', 'Cant', 'Necesitada', 'Decisión', 'Estado', 'Pago', 'Fecha entrega', 'Llegó en', 'Holgura', 'Recojo saldo', 'Entrega saldo', 'Saldo en', '¿Comunicó residente?', 'Destino saldo', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {flat.map((i, idx) => {
              const llego = i.fechaEntrega ? dias(i.fechaEntrega, i.fechaRQ) : null;
              const holg = i.fechaEntrega && i.fecha ? dias(i.fecha, i.fechaEntrega) : null;
              const saldoDias = i.fechaEntregaSaldo && i.fechaEntrega ? dias(i.fechaEntregaSaldo, i.fechaEntrega) : null;
              const inc = i.estado === 'Incompleto';
              const enRechazo = rechazo[i.id] !== undefined;
              const enFact = fFact[i.id] !== undefined;
              const post = i.decision === 'Aprobado';
              const ff = fFact[i.id];
              const cubiertosFF = enFact ? [i, ...flatBase.filter(x => ff.extras.includes(x.id))] : [];
              const sumaDesglose = cubiertosFF.reduce((a, x) => a + (Number(ff.precios[x.id]) || 0) * x.cant, 0);
              const cuadra = enFact && Number(ff.monto) > 0 && Math.abs(sumaDesglose - Number(ff.monto)) <= 0.1;
              // Las tres formas de no tener número de factura al registrarla:
              // compromiso de crédito (serie CRED-), ya pagada con la factura
              // por llegar (serie PEND-), o la serie de verdad. Faltaba
              // `pendiente`, y como al marcarlo el campo de serie desaparece,
              // el botón se quedaba gris para siempre y sin explicar por qué.
              const factOk = ff && (ff.compromiso || ff.pendiente || ff.serie.trim())
                && ff.prov.trim() && rucValido(ff.ruc).ok && ff.fecha && Number(ff.monto) !== 0 && !Number.isNaN(Number(ff.monto))
                // Ya pagada por banco: el servidor exige banco y N° de operación
                && (!ff.pendiente || ff.efectivo || ((ff.banco || '').trim() && (ff.numOp || '').trim()))
                && cubiertosFF.every(x => Number(ff.precios[x.id]) > 0) && cuadra;
              // Solo ítems SIN factura: uno que ya tiene la suya haría fallar
              // toda la transacción (un ítem pertenece a una sola factura).
              const candidatosExtra = enFact ? flatBase.filter(x =>
                x.id !== i.id && x.proyecto === i.proyecto && x.decision === 'Aprobado' && !x.factura) : [];
              const rqDe = rqMap[i.rq];
              const pdfListo = rqDe.items.length > 0 && rqDe.items.every(x => x.decision !== 'Pendiente') && rqDe.items.some(x => x.decision === 'Aprobado');
              const esPrimerArch = i._arch && (idx === 0 || !flat[idx - 1]._arch);
              return (
                <Fragment key={i.id}>
                {esPrimerArch && (
                  <tr><td colSpan={20} className="pt-4 pb-1">
                    <span className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">📁 Archivados · {archMostrados.length} · entregados y pagados (cerrados)</span>
                  </td></tr>
                )}
                <tr className={`border-b border-slate-800 align-top ${i._arch ? 'opacity-60' : ''}`}>
                  <td className="py-2 px-1.5 whitespace-nowrap">
                    {i._arch && <span className="text-slate-500 text-[10px] mr-1">📁</span>}
                    {pdfListo ? (
                      <>
                        <button onClick={() => imprimirRQ(rqDe)} title="Ver PDF del requerimiento (solo ítems aprobados)"
                          className="font-mono text-[11px] text-slate-200 underline decoration-dotted underline-offset-2 hover:text-yellow-400">
                          RQ-{String(i.rq).padStart(3, '0')}</button>
                        <span className="text-yellow-400 text-[10px] ml-1">⤓</span>
                      </>
                    ) : (
                      <span className="font-mono text-[11px] text-slate-400" title="El PDF se emite cuando todos los ítems del RQ estén decididos (solo lleva los aprobados).">
                        RQ-{String(i.rq).padStart(3, '0')}</span>
                    )}</td>
                  <td className="py-2 px-1.5 text-slate-400 whitespace-nowrap">{i.proyecto}</td>
                  <td className="py-2 px-1.5 text-slate-400 whitespace-nowrap text-[10px]">{i.piso || '—'}</td>
                  <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 ${i.canal === 'URGENTE' ? 'text-red-400' : i.canal === 'GENERAL' ? 'text-green-400' : 'text-yellow-400'}`}>{i.canal}</span></td>
                  <td className="py-2 px-1.5 text-slate-400 whitespace-nowrap">{i.residente}
                    {i.tipoRq === 'Cotizacion' && <div className="text-[8px] font-bold uppercase text-amber-400">Cotización · {i.cotizacionRef}</div>}</td>
                  <td className="py-2 px-1.5 text-slate-200">{i.desc} <span className="text-slate-500">({i.und})</span>
                    {i.just && <div className="text-yellow-400 text-[10px] mt-1">Motivo: {i.just}</div>}
                    {mejorPrecio2m[i.cod] && (
                      <div className="text-[10px] text-sky-400 mt-1"
                        title="El precio más bajo al que se compró este material en los últimos 2 meses. Úsalo para negociar.">
                        ▼ Más barato 2 meses: <b>S/ {mejorPrecio2m[i.cod].precio.toFixed(2)}</b> · {mejorPrecio2m[i.cod].prov} ({fmt(mejorPrecio2m[i.cod].fecha)})
                      </div>
                    )}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-200">{i.cant}</td>
                  <td className="py-2 px-1.5 text-slate-200">{fmt(i.fecha)}</td>
                  <td className="py-2 px-1.5">
                    {i.decision === 'Pendiente' && !enRechazo && (
                      <div>
                        <div className="flex gap-1">
                          <button onClick={() => updItem(i, { decision: 'Aprobado' })} className={btnVerde}>Aprobar</button>
                          <button onClick={() => setRechazo({ ...rechazo, [i.id]: '' })} className={btnRojo}>Rechazar</button>
                        </div>
                        {rqDe.items.filter(x => x.decision === 'Pendiente').length > 1 && (
                          confAprRq === i.rq ? (
                            <button onClick={() => aprobarRq(i.rq)}
                              className="mt-1 w-full px-2 py-1 rounded text-[9px] font-bold uppercase bg-green-950 text-green-400 border border-green-700 hover:bg-green-900">
                              ¿Confirmar? Aprueba {rqDe.items.filter(x => x.decision === 'Pendiente').length} ítems</button>
                          ) : (
                            <button onClick={() => { setConfAprRq(i.rq); setTimeout(() => setConfAprRq(c => c === i.rq ? null : c), 5000); }}
                              className="mt-1 text-[9px] text-slate-500 underline decoration-dotted hover:text-green-400">
                              ≡ Aprobar todo el RQ ({rqDe.items.filter(x => x.decision === 'Pendiente').length} pend.)</button>
                          )
                        )}
                      </div>
                    )}
                    {enRechazo && i.decision === 'Pendiente' && (
                      <div className="w-48">
                        <textarea rows={2} value={rechazo[i.id]} onChange={e => setRechazo({ ...rechazo, [i.id]: e.target.value })}
                          placeholder="¿Por qué se rechazó? (obligatorio)" className={`w-full ${inputCls}`} />
                        <div className="flex gap-1 mt-1">
                          <button onClick={() => enviarRechazo(i)} disabled={!(rechazo[i.id] || '').trim()}
                            className={`flex-1 px-2 py-1.5 rounded text-[9px] font-bold uppercase ${(rechazo[i.id] || '').trim() ? 'bg-red-950 text-red-400 border border-red-800 hover:bg-red-900' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
                            Enviar y comunicar al residente</button>
                          <button onClick={() => { const r = { ...rechazo }; delete r[i.id]; setRechazo(r); }}
                            title="Cancelar el rechazo y volver a Aprobar / Rechazar"
                            className="px-2 py-1.5 rounded text-[9px] font-bold bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200">✕</button>
                        </div>
                      </div>
                    )}
                    {i.decision === 'Aprobado' && <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${pillEstado('Aprobado')}`}>Aprobado</span>}
                  </td>
                  <td className="py-2 px-1.5">
                    {post ? (
                      i.estado === '—' && !i.factura ? (
                        puedeFacturar
                          ? (parcial[i.id] ? (
                              <div className="p-2 bg-slate-950 border border-orange-800 rounded w-56">
                                <div className="text-[9px] font-bold uppercase text-orange-400 mb-1">Compra parcial · pedido: {i.cant}</div>
                                <input type="number" min={UND_ENTERA(i.und) ? 1 : 0.01} step={UND_ENTERA(i.und) ? 1 : 'any'} value={parcial[i.id].cant}
                                  onChange={e => setParcial({ ...parcial, [i.id]: { ...parcial[i.id], cant: e.target.value } })}
                                  placeholder={`¿Cuánto se consiguió? (menos de ${i.cant})`} className={`w-full mb-1 ${inputCls}`} />
                                <input value={parcial[i.id].motivo}
                                  onChange={e => setParcial({ ...parcial, [i.id]: { ...parcial[i.id], motivo: e.target.value } })}
                                  placeholder="¿Por qué no había todo?" className={`w-full mb-1 ${inputCls}`} />
                                {esCompras && (
                                  <label className="flex items-start gap-1 text-[9px] text-slate-300 mb-1 cursor-pointer">
                                    <input type="checkbox" checked={!!parcial[i.id].cerrar}
                                      onChange={e => setParcial({ ...parcial, [i.id]: { ...parcial[i.id], cerrar: e.target.checked } })} />
                                    <span>Lo que falta ya no se va a comprar</span>
                                  </label>
                                )}
                                <div className="flex gap-1">
                                  <button onClick={() => registrarParcial(i)}
                                    disabled={!(Number(parcial[i.id].cant) > 0 && Number(parcial[i.id].cant) < Number(i.cant) && parcial[i.id].motivo.trim())}
                                    className={btnOk(Number(parcial[i.id].cant) > 0 && Number(parcial[i.id].cant) < Number(i.cant) && !!parcial[i.id].motivo.trim())}>Registrar</button>
                                  <button onClick={() => { const p2 = { ...parcial }; delete p2[i.id]; setParcial(p2); }}
                                    className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-400">Cancelar</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {/* Quién se encargó de comprarlo (migración 50). No bloquea:
                                    avisa. Un candado que solo abre quien lo puso traba el
                                    trabajo el día que esa persona no viene. */}
                                {i.tomadoPor
                                  ? <button onClick={() => tomar(i, false)}
                                      className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-sky-950 text-sky-300 border border-sky-800"
                                      title="Alguien dijo que se encarga de comprarlo hoy. Pulsa para soltarlo.">✋ Lo compra {i.tomadoPor.split(' ')[0]}</button>
                                  : <button onClick={() => tomar(i, true)}
                                      className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-sky-400 border border-slate-700 hover:border-sky-400"
                                      title="Avisa al resto de que tú te encargas de comprarlo hoy. Caduca solo mañana.">Me encargo</button>}
                                <button onClick={() => updItem(i, { estado: 'Comprado' }, `Ítem "${i.desc}" marcado como Comprado. Ahora lo ve todo el equipo; el almacén lo cerrará al recibir.`)}
                                  className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-green-400 border border-slate-700 hover:border-green-400"
                                  title={i.tomadoPor ? `Ojo: ${i.tomadoPor} dijo que se encargaba. Puedes comprarlo igual.` : 'Marca este ítem como comprado o recogido. Cambia el estado para todos.'}>
                                  {i.tomadoPor ? '✓ Comprar igual' : '✓ Comprado'}</button>
                                <button onClick={() => setParcial({ ...parcial, [i.id]: { cant: '', motivo: '', cerrar: false } })}
                                  className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-orange-400 border border-slate-700 hover:border-orange-400"
                                  title="Si el proveedor no tenía todo: se registra lo conseguido y el saldo vuelve a la cola de compras.">Compra parcial</button>
                              </div>
                            ))
                          : <span className="text-slate-500 text-[10px]">Por comprar</span>
                      ) : (
                        <div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${pillEstado(i.estado)}`}
                            title="Comprado lo marca Compras o el comprador; Entregado e Incompleto los fija el almacén al recibir.">{i.estado}</span>
                          {i.estado === 'Comprado' && i.compradoPor && <div className="text-[9px] text-slate-500 mt-0.5">por {i.compradoPor}</div>}
                          {i.compraParcial && (
                            <div className="text-[9px] text-orange-400 mt-0.5 leading-tight"
                              title="Se consiguió menos de lo pedido; el saldo quedó como un ítem aparte.">
                              ✂ {i.compraParcial.conseguido} de {i.compraParcial.pedido} · «{i.compraParcial.motivo}»
                              <span className="text-slate-500"> · {i.compraParcial.por}</span></div>
                          )}
                          {esTriage.sinFactura48(i) && (
                            <div className="text-[9px] text-red-400 font-bold mt-0.5"
                              title="Comprado hace más de 48 h y todavía sin factura: no ha entrado a Pagos.">
                              ⚠ {dias(HOY_ISO, i.fechaCompra || i.fechaRQ)}d sin factura</div>
                          )}
                        </div>
                      )
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="py-2 px-1.5">{post ? (
                    <div>
                      {!i.factura && !enFact && (
                        puedeFacturar
                          ? <button onClick={() => abrirFactura(i)} className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-yellow-400 border border-slate-700 hover:border-yellow-400">＋ Factura</button>
                          : <span className="text-slate-600">Sin factura</span>
                      )}
                      {enFact && (
                        <div className="form-factura mt-1.5 w-60 bg-slate-950 border border-yellow-400 rounded p-2">
                          <div className="flex items-center mb-1.5">
                            <div className="text-[9px] font-bold text-yellow-400 uppercase">Datos de factura (obligatorios) · Enter salta al siguiente</div>
                            <button onClick={() => cerrarFactura(i.id)} className="ml-auto text-[10px] text-slate-500 hover:text-slate-200">✕</button>
                          </div>
                          {/* Excluyentes: o el proveedor da crédito, o ya pagaste.
                              Marcar las dos hacía que el servidor rechazara la
                              factura con un mensaje que no explicaba el porqué. */}
                          {!ff.efectivo && !ff.pendiente && (
                            <label className="flex items-start gap-1.5 mb-1.5 cursor-pointer text-[10px] text-slate-300">
                              <input type="checkbox" checked={!!ff.compromiso} onChange={e => setFF(i.id, 'compromiso', e.target.checked)} className="mt-0.5" />
                              <span><b>SIN factura aún</b>: el proveedor da crédito y emite la factura recién al pagar (compromiso)</span>
                            </label>
                          )}
                          {!ff.compromiso && (
                            <label className="flex items-start gap-1.5 mb-1.5 cursor-pointer text-[10px] text-slate-300">
                              <input type="checkbox" checked={!!ff.pendiente} onChange={e => setFF(i.id, 'pendiente', e.target.checked)} className="mt-0.5" />
                              <span><b>YA PAGUÉ, aún no me dan la factura</b>: la entregan mañana o pasado. No es crédito — el dinero ya salió.</span>
                            </label>
                          )}
                          {ff.compromiso ? (
                            <div className="mb-1 px-2 py-1.5 rounded border border-yellow-700 bg-yellow-950 text-[9px] text-yellow-400">
                              Serie interna CRED-… asignada por el sistema. La serie real la digita Pagos al pagar, con la factura en mano.</div>
                          ) : ff.pendiente ? (
                            <div className="mb-1 px-2 py-1.5 rounded border border-sky-700 bg-sky-950 text-[9px] text-sky-300">
                              Serie interna PEND-… asignada por el sistema. La compra queda PAGADA y el material entra igual; administración digita la serie real cuando llegue el documento.</div>
                          ) : (
                            <input value={ff.serie} onChange={e => setFF(i.id, 'serie', e.target.value)} onKeyDown={enterSiguiente}
                              placeholder="N° factura: F001-000123" className={`w-full mb-1 ${pendCls(!!ff.serie.trim())} font-mono`} />
                          )}
                          <input list={`fprov-${i.id}`} value={ff.prov} onChange={e => setFF(i.id, 'prov', e.target.value)} onKeyDown={enterSiguiente}
                            disabled={!ff.compromiso && !ff.pendiente && !ff.serie.trim()} placeholder="Proveedor (razón social)"
                            className={`w-full mb-1 ${pendCls(!!ff.prov.trim())} ${!ff.compromiso && !ff.pendiente && !ff.serie.trim() ? 'opacity-60 cursor-not-allowed' : ''}`} />
                          <datalist id={`fprov-${i.id}`}>{proveedores.map(p => <option key={p[0]} value={p[1]} />)}</datalist>
                          <input value={ff.ruc} onChange={e => setFF(i.id, 'ruc', e.target.value)} onKeyDown={enterSiguiente}
                            disabled={!ff.prov.trim()} placeholder="RUC (11 dígitos)" maxLength={11}
                            className={`w-full mb-1 ${pendCls(rucValido(ff.ruc).ok)} font-mono ${!ff.prov.trim() ? 'opacity-60 cursor-not-allowed' : ''}`} />
                          {ff.ruc && !rucValido(ff.ruc).ok && <div className="text-[9px] text-red-400 mb-1">{rucValido(ff.ruc).motivo}</div>}
                          {ff.ruc && rucValido(ff.ruc).ok && !proveedores.some(p => p[0] === ff.ruc) && <div className="text-[9px] text-sky-400 mb-1">Proveedor nuevo: se agregará al maestro.</div>}
                          {/* Aviso PREVENTIVO, nunca bloqueante. Si el proveedor junta las
                              entregas del mes en una sola factura, al pagar el segundo
                              compromiso el sistema lo rechaza (serie+RUC no se repiten) y
                              el pago ya salió del banco. Este es el único momento en que
                              todavía se puede evitar. NO convertirlo en guarda: dos compras
                              al mismo proveedor con dos facturas reales distintas es lo
                              normal todos los días. */}
                          {(() => {
                            if (!rucValido(ff.ruc).ok) return null;
                            const vivos = facturas.filter(f => f.tipoDoc === 'Compromiso' && f.estadoPago !== 'Pagada'
                              && !f.anulMotivo && f.ruc === ff.ruc && f.proyecto === i.proyecto);
                            if (!vivos.length) return null;
                            return (
                              <div className="text-[9px] text-orange-400 bg-orange-950 border border-orange-800 rounded px-2 py-1 mb-1">
                                Ojo: ya hay {vivos.length} compromiso(s) sin pagar de este proveedor en {i.proyecto}
                                {' '}({vivos.map(f => f.serie).join(', ')}). Si a fin de mes emite UNA sola factura por
                                todas las entregas, solo se va a poder cerrar una. Conviene acordar con él una factura
                                por entrega.
                              </div>
                            );
                          })()}
                          <FechaInput value={ff.fecha} max={HOY_ISO} onChange={e => setFF(i.id, 'fecha', e.target.value)} onKeyDown={enterSiguiente} className={`w-full mb-1 ${inputCls}`} />
                          <input type="number" min="0.01" step="any" value={ff.monto} onChange={e => setFF(i.id, 'monto', e.target.value)} onKeyDown={enterSiguiente}
                            disabled={!rucValido(ff.ruc).ok}
                            placeholder={rucValido(ff.ruc).ok ? 'Monto TOTAL S/ (inc. IGV)' : 'Primero el RUC'}
                            className={`w-full mb-1 font-mono ${rucValido(ff.ruc).ok ? pendCls(Number(ff.monto) > 0) : 'bg-slate-900 border border-slate-800 text-slate-600 rounded px-2 py-1.5 text-xs cursor-not-allowed'}`} />
                          {ff.compromiso ? (
                            <select value={esCredito(ff.forma) ? ff.forma : 'Crédito 30 días'} onChange={e => setFF(i.id, 'forma', e.target.value)}
                              onKeyDown={enterSiguiente} className={`w-full mb-1 ${inputCls}`}>
                              {PLAZOS_CREDITO.map(x => <option key={x}>{x}</option>)}</select>
                          ) : !ff.efectivo && !ff.pendiente && (
                            <select value={ff.forma} onChange={e => setFF(i.id, 'forma', e.target.value)} onKeyDown={enterSiguiente} className={`w-full mb-1 ${inputCls}`}>
                              {FORMAS_PAGO.map(x => <option key={x}>{x}</option>)}</select>
                          )}
                          {/* La caja chica es de Frank: a Lucía no se le entrega efectivo.
                              Si marcara esta casilla, el sistema le abriría una rendición
                              del día a su nombre que nadie va a cerrar. */}
                          {!ff.compromiso && !esCompras && (
                          <label className="flex items-start gap-1.5 mb-1 cursor-pointer text-[10px] text-slate-300">
                            <input type="checkbox" checked={!!ff.efectivo} onChange={e => setFF(i.id, 'efectivo', e.target.checked)} className="mt-0.5" />
                            <span>Ya pagada en <b>EFECTIVO</b> (caja chica de hoy) — queda Pagada y entra a la rendición del día</span>
                          </label>
                          )}
                          {ff.pendiente && !ff.efectivo && (
                            <div className="mb-1.5 px-2 py-1.5 rounded border border-slate-700 bg-slate-950">
                              <div className="text-[9px] font-bold uppercase text-slate-400 mb-1">¿Cómo pagaste?</div>
                              <div className="flex gap-1 flex-wrap">
                                <select value={ff.medio} onChange={e => setFF(i.id, 'medio', e.target.value)} className={`${inputCls} w-28`}>
                                  {['Transferencia', 'Cheque', 'Tarjeta'].map(m => <option key={m}>{m}</option>)}
                                </select>
                                <input value={ff.banco} onChange={e => setFF(i.id, 'banco', e.target.value)}
                                  placeholder="Banco" className={`${pendCls(!!(ff.banco || '').trim())} w-24`} />
                                <input value={ff.numOp} onChange={e => setFF(i.id, 'numOp', e.target.value)}
                                  placeholder="N° operación" className={`${pendCls(!!(ff.numOp || '').trim())} font-mono flex-1`} style={{ minWidth: '110px' }} />
                              </div>
                            </div>
                          )}
                          {candidatosExtra.length > 0 && (
                            <div className="mb-1.5 border-t border-slate-700 pt-1.5">
                              <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">¿Esta factura cubre otros ítems? ({i.proyecto})</div>
                              {(() => {
                                const q = (buscaExtra[i.id] || '').trim().toLowerCase();
                                // los ya marcados quedan siempre visibles, aunque no coincidan con la búsqueda
                                const vis = candidatosExtra.filter(x => ff.extras.includes(x.id) || !q
                                  || `${x.desc} rq-${String(x.rq).padStart(3, '0')} ${x.rq} ${x.cod}`.toLowerCase().includes(q));
                                return (
                                  <>
                                    {candidatosExtra.length > 4 && (
                                      <input value={buscaExtra[i.id] || ''} onChange={e => setBuscaExtra({ ...buscaExtra, [i.id]: e.target.value })}
                                        placeholder={`Buscar entre ${candidatosExtra.length} ítems…`} className={`w-full ${inputCls} mb-1`} />
                                    )}
                                    <div className="max-h-24 overflow-y-auto">
                                      {vis.length === 0 ? (
                                        <div className="text-[9px] text-slate-500">Sin coincidencias.</div>
                                      ) : vis.map(x => (
                                        <label key={x.id} className="flex items-start gap-1.5 text-[10px] text-slate-300 mb-1 cursor-pointer">
                                          <input type="checkbox" checked={ff.extras.includes(x.id)} onChange={() => toggleExtra(i.id, x.id)} className="mt-0.5" />
                                          <span>RQ-{String(x.rq).padStart(3, '0')} · {x.desc}</span>
                                        </label>
                                      ))}
                                    </div>
                                    {q && <div className="text-[9px] text-slate-500">{vis.length} de {candidatosExtra.length} · {ff.extras.length} marcado(s)</div>}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                          <div className="mb-1.5 border-t border-slate-700 pt-1.5">
                            <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">Desglose: S/ por unidad de cada ítem (según factura)</div>
                            {cubiertosFF.map(x => {
                              const uc = ultimaCompra && ultimaCompra[x.cod];
                              const precioIng = Number(ff.precios[x.id]) || 0;
                              const subio = uc && precioIng > 0 && precioIng > uc.precio * 1.05;
                              return (
                              <div key={x.id} className="mb-1">
                                <div className="flex items-center gap-1">
                                  <span className="flex-1 text-[10px] text-slate-300 leading-tight">{x.desc.length > 26 ? x.desc.slice(0, 26) + '…' : x.desc} × {x.cant} {x.und}</span>
                                  <input type="number" min="0.01" step="any" value={ff.precios[x.id] || ''}
                                    onChange={e => setFF(i.id, 'precios', { ...ff.precios, [x.id]: e.target.value })} onKeyDown={enterSiguiente}
                                    placeholder="S/ und" className={`w-16 ${pendCls(precioIng > 0)} font-mono`} />
                                  <span className="text-[10px] font-mono text-slate-400 w-14 text-right">{(precioIng * x.cant).toFixed(2)}</span>
                                </div>
                                {uc && <div className={`text-[9px] ${subio ? 'text-yellow-400' : 'text-slate-500'}`}>
                                  últ. compra S/ {uc.precio.toFixed(2)} · {uc.prov.length > 18 ? uc.prov.slice(0, 18) + '…' : uc.prov} · {fmt(uc.fecha)}{subio ? ' · ▲ sube' : ''}</div>}
                              </div>
                              );
                            })}
                            <div className={`text-[10px] font-mono text-right ${cuadra ? 'text-green-400' : 'text-red-400'}`}>
                              Desglosado S/ {sumaDesglose.toFixed(2)} de S/ {(Number(ff.monto) || 0).toFixed(2)}
                              {!cuadra && Number(ff.monto) > 0 ? ` · falta cuadrar S/ ${(Number(ff.monto) - sumaDesglose).toFixed(2)}` : ''}
                            </div>
                          </div>
                          <button onClick={() => registrarFactura(i)} disabled={!factOk} className={`w-full ${btnOk(!!factOk)}`}>
                            {ff.compromiso ? 'Registrar compromiso' : 'Registrar factura'} ({1 + ff.extras.length} ítem{ff.extras.length ? 's' : ''})</button>
                          <div className="text-[9px] text-slate-500 mt-1">El pago lo ejecuta el área de Pagos con banco y N° de operación.</div>
                        </div>
                      )}
                      {i.factura && !enFact && (
                        <div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${pillEstado(i.pago)}`}>{i.pago}</span>
                          <div className="text-[9px] font-mono text-green-400 mt-1">{i.factura}</div>
                        </div>
                      )}
                    </div>
                  ) : <span className="text-slate-600">—</span>}</td>
                  <td className="py-2 px-1.5">{post ? <span className="text-slate-400" title="La fija el almacén al registrar la recepción del primer lote; no se edita a mano.">{i.fechaEntrega ? fmt(i.fechaEntrega) : '—'}</span> : <span className="text-slate-600">—</span>}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-300">{llego !== null ? llego + 'd' : '—'}</td>
                  <td className={`py-2 px-1.5 font-mono ${holg === null ? 'text-slate-500' : holg < 0 ? 'text-red-400' : 'text-green-400'}`}>{holg !== null ? holg + 'd' : '—'}</td>
                  <td className="py-2 px-1.5">{inc && !facturarSolo ? <FechaInput value={i.fechaRecojoSaldo} onChange={e => updItem(i, { fecha_recojo_saldo: e.target.value || null })} className={`w-32 ${inputCls}`} /> : <span className="text-slate-600">{inc ? fmt(i.fechaRecojoSaldo) : '—'}</span>}</td>
                  <td className="py-2 px-1.5"><span className="text-slate-600" title="La fija el almacén al recibir el saldo; no se edita a mano.">{inc ? fmt(i.fechaEntregaSaldo) : '—'}</span></td>
                  <td className="py-2 px-1.5 font-mono text-slate-300">{saldoDias !== null ? saldoDias + 'd' : '—'}</td>
                  <td className="py-2 px-1.5">{inc && !facturarSolo ? (
                    <select value={i.comunicoResidente} onChange={e => updItem(i, { comunico_residente: e.target.value === 'Sí' ? true : e.target.value === 'No' ? false : null })} className={inputCls}>
                      {['—', 'Sí', 'No'].map(x => <option key={x}>{x}</option>)}</select>) : <span className="text-slate-600">{inc ? i.comunicoResidente : '—'}</span>}</td>
                  <td className="py-2 px-1.5">{inc && !facturarSolo ? <input defaultValue={i.destinoSaldo} onBlur={e => { if (e.target.value !== i.destinoSaldo) updItem(i, { destino_saldo: e.target.value || null }); }} placeholder="Almacén de obra…" className={`w-32 ${inputCls}`} /> : <span className="text-slate-600">{inc ? (i.destinoSaldo || '—') : '—'}</span>}</td>
                  <td className="py-2 px-1.5">
                    {!facturarSolo && !i._arch && (
                      Number(i.cantRecibida) > 0 ? (
                        <div className="w-44">
                          <span className="text-[9px] text-slate-500 leading-tight block"
                            title="El material ya está en la obra: anularlo descuadraría el stock. Si hay que devolverlo, es una devolución al proveedor.">
                            Ya recibido ({i.cantRecibida} {i.und}) — no se anula</span>
                          {/* Rastro de las correcciones de cantidad del almacén (migración 35) */}
                          {(i.correcciones || []).map((x, k) => (
                            <div key={k} className="text-[9px] text-yellow-500 leading-tight mt-1">
                              Corregido de {x.de} a {x.a}: {x.motivo} ({x.por}, {fmt(x.fecha)})</div>
                          ))}
                        </div>
                      ) : i.anulSolMotivo ? (
                        <div className="w-44">
                          <div className="text-[9px] font-bold uppercase text-orange-400">Anulación en gerencia</div>
                          <div className="text-[9px] text-slate-500 leading-tight">{i.anulSolMotivo} · pidió {i.anulSolPor}</div>
                          {esGerente && (
                            <div className="mt-1">
                              <button onClick={() => aprobarAnulacion(i)}
                                className="w-full px-2 py-1 rounded text-[9px] font-bold uppercase bg-red-950 text-red-400 border border-red-800 hover:bg-red-900">Confirmar anulación</button>
                              <AnularBox label="Rechazar la anulación" onConfirm={m => rechazarAnulacion(i, m)} />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          {i.anulRechMotivo && (
                            <div className="text-[9px] text-yellow-400 leading-tight mb-1">
                              Gerencia rechazó anular: {i.anulRechMotivo} ({i.anulRechPor})</div>
                          )}
                          {i.factura ? (
                            <span className="text-[9px] text-slate-500 leading-tight"
                              title="Para anular este ítem, gerencia tiene que anular antes su factura; entonces el ítem queda libre.">
                              Ya facturado — para anularlo, gerencia anula antes la factura</span>
                          ) : Number(i.cantRecibida) > 0 ? (
                            <span className="text-[9px] text-slate-500 leading-tight">
                              Ya recibido ({i.cantRecibida} {i.und}) — corrige primero la recepción con el almacén</span>
                          ) : (
                            <AnularBox label={esGerente ? 'Anular' : 'Solicitar anulación'} onConfirm={m => solicitarAnulacion(i, m)} />
                          )}
                        </div>
                      )
                    )}
                  </td>
                </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      <div className="mt-3 text-slate-500 text-[11px]">Paso 1: Aprobar o Rechazar. Paso 2: Compras o el comprador marca "Comprado" al comprar o recoger el ítem (visible para todos); "Entregado" e "Incompleto" los fija el almacén automáticamente al registrar la recepción. La factura se registra con desglose por ítem (una factura puede cubrir varios ítems); el pago lo ejecuta el área de Pagos y los ítems heredan el estado. Anular exige motivo y queda con rastro en el Tablero. Un ítem Entregado con factura Pagada se cierra y pasa solo al Tablero.</div>
    </div>

    <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">
          {facturarSolo ? 'Facturas que registraste' : `Facturas ${verPagadas ? 'registradas' : 'por pagar'}`} · {factMostradas.length}</div>
        <button onClick={() => setVerPagadas(v => !v)}
          className={`ml-auto px-2.5 py-1 rounded text-[9px] font-bold uppercase border ${verPagadas ? 'border-yellow-400 text-yellow-400 bg-slate-800' : 'border-slate-700 text-slate-400 bg-slate-800 hover:border-slate-500'}`}>
          {verPagadas ? '✕ Solo pendientes' : `Ver pagadas · ${factPagadas.length}`}</button>
      </div>
      {factMostradas.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-sm">{verPagadas ? 'Sin facturas registradas.' : 'Sin facturas por pagar. ✓ Todo al día con Pagos.'}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr>{['N° Factura', 'Fecha', 'Proveedor', 'RUC', 'Proyecto', 'Ítems que cubre', 'Monto S/', 'Forma de pago', 'Pago', 'Registró', ...(esGerente ? ['Anular'] : [])].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>
              {factMostradas.map(f => (
                <tr key={f.n} className={`border-b border-slate-800 align-top ${f.anulMotivo ? 'opacity-60 line-through' : ''}`}>
                  <td className="py-2 px-1.5 font-mono text-slate-200">{f.serie}
                    {f.tipoDoc === 'Compromiso' && <div className="text-[8px] font-bold uppercase text-yellow-400">Sin factura · la emite al pagar</div>}
                    {f.tipoDoc === 'Pendiente' && <div className="text-[8px] font-bold uppercase text-sky-400">Pagada · factura por llegar</div>}
                    {f.anulMotivo && <div className="text-[8px] text-red-400 no-underline">Anulada: {f.anulMotivo} ({f.anulPor})</div>}</td>
                  <td className="py-2 px-1.5 text-slate-400">{fmt(f.fecha)}</td>
                  <td className="py-2 px-1.5 text-slate-300">{f.prov}</td>
                  <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{f.ruc}</td>
                  <td className="py-2 px-1.5 text-slate-400">{f.proyecto}</td>
                  <td className="py-2 px-1.5 text-slate-300 text-[10px]">{f.items.map(x => `RQ-${String(x.rq).padStart(3, '0')} ${x.desc}`).join(' · ')}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-200 text-right">{f.monto.toFixed(2)}</td>
                  <td className="py-2 px-1.5 text-slate-400">{f.forma}
                    {esCredito(f.forma) && f.estadoPago !== 'Pagada' && (() => {
                      const ve = vencimientoDe(f);
                      const d = ve ? dias(ve, HOY_ISO) : null;
                      if (d == null) return null;
                      return (
                        <div className={`text-[9px] mt-0.5 font-bold ${d < 0 ? 'text-red-400' : d <= 3 ? 'text-yellow-400' : 'text-slate-500'}`}>
                          {d < 0 ? `⚠ vencida hace ${-d} d` : d === 0 ? '⚠ vence HOY' : `vence en ${d} d`} · {fmt(ve)}</div>
                      );
                    })()}</td>
                  <td className="py-2 px-1.5">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${pillEstado(f.estadoPago)}`}>{f.estadoPago}</span>
                    {f.estadoPago === 'Pagada' && <div className="text-[9px] text-slate-500 mt-1">{f.banco} · op. {f.numOp} · {fmt(f.fechaPago)}</div>}
                  </td>
                  <td className="py-2 px-1.5 text-slate-500 text-[10px]">{f.registradoPor}</td>
                  {esGerente && (
                    <td className="py-2 px-1.5 no-underline">
                      {f.anulMotivo
                        ? <span className="text-[9px] text-slate-600">anulada</span>
                        : <AnularBox label="Anular factura" onConfirm={m => anularFact(f, m)} />}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
      {/* Al final: es consulta para negociar, no parte del trabajo del dia.
          Arriba estorbaba lo que si hay que atender. Lo ven Lucia, Frank
          (que negocia en el mostrador) y gerencia. */}
      <HistorialPrecios db={db} />
    </div>
  );
}
