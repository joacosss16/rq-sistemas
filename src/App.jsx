import { useState, useMemo, useEffect, useRef, useCallback, Fragment } from 'react';
import { supabase, ENTORNO, ES_PRODUCCION } from './supabaseClient';
import { cuadreCaja, diferenciaArqueo, excedeTolerancia } from './caja';
import { esDelDia, HOY_ISO, fmt, dias, diasHoy } from './fechas';
import { estadoCaducidad, calcularStocks, stockDetalleObra } from './stock';
import { FORMAS_PAGO, PLAZOS_CREDITO, esCredito, vencimientoDe, MEDIOS_PAGO, ETIQUETA_NRO, SIN_BANCO } from './pago';
import { imprimirRQ, imprimirCierre, imprimirConteo } from './pdf';
import { PROYECTOS, ALMACENEROS, setMaestros } from './maestros';
import { canalClases, pillEstado, inputCls, lblCls, thCls, btnOk, btnRojo, btnVerde, Aviso, AnularBox, AlertaCerrable, FiltroProyecto, FechaInput, pendCls, avisoLeido, alEnterarse } from './ui';
import { buscarEnCatalogo } from './busqueda';
import { Login } from './vistas/Login';
import { Catalogo } from './vistas/Catalogo';
import { ReporteMensual } from './vistas/ReporteMensual';
import { AlmacenResidente } from './vistas/AlmacenResidente';
import { HistorialMateriales } from './vistas/HistorialMateriales';
import { AprobacionesResidente } from './vistas/AprobacionesResidente';
import { Almacen } from './vistas/Almacen';
import { ComprasDelDia } from './vistas/ComprasDelDia';
import { Pagos } from './vistas/Pagos';
import { Rendiciones } from './vistas/Rendiciones';
import { Auditoria } from './vistas/Auditoria';
import { Tablero } from './vistas/Tablero';
import { Compras } from './vistas/Compras';
import { Residente } from './vistas/Residente';

const TABS_POR_ROL = {
  gerente: [['res', 'Residente'], ['com', 'Compras'], ['alm', 'Almacén'], ['apr', 'Aprobaciones'], ['cat', 'Catálogo'], ['his', 'Historial'], ['pag', 'Pagos'], ['ren', 'Rendiciones'], ['aud', 'Auditoría'], ['tab', 'Tablero'], ['rep', 'Reporte mensual']],
  compras: [['com', 'Compras'], ['cat', 'Catálogo'], ['tab', 'Tablero']],
  residente: [['res', 'Mis requerimientos'], ['apr', 'Aprobaciones'], ['sto', 'Mi almacén'], ['his', 'Historial']],
  almacen: [['alm', 'Mi almacén']],
  pagos: [['pag', 'Pagos'], ['ren', 'Rendiciones']],
  administracion: [['pag', 'Pagos'], ['ren', 'Rendiciones']],
  comprador: [['dia', 'Compras del día'], ['fac', 'Facturar'], ['ren', 'Rendiciones']],
};
const TAB_INICIAL = { gerente: 'tab', compras: 'com', residente: 'res', almacen: 'alm', pagos: 'pag', administracion: 'ren', comprador: 'dia' };

// Historial de precios por material: herramienta de negociación de Compras.
// Todas las compras del material, comparativa por proveedor y tendencia.
// Bandeja del RESIDENTE: aprueba/rechaza salidas de su obra y su lado de los préstamos.
// Vista del COMPRADOR (Frank): su lista de trabajo del día.
// Prioriza urgentes y fechas necesitadas; consolida el mismo material
// entre obras y le dice cuántas facturas pedir.
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = verificando
  const [user, setUser] = useState(null);            // perfil de la tabla usuarios
  const [perfilError, setPerfilError] = useState('');
  const [db, setDb] = useState(null);
  const [cargaError, setCargaError] = useState('');
  const [tab, setTab] = useState('tab');
  const dbRef = useRef(null);
  const estaticosRef = useRef(null);   // cache de tablas casi-estáticas (catálogo, maestros)
  const dinamicosRef = useRef(null);   // último crudo de las transaccionales, para refrescar solo lo que cambió
  // Hasta qué momento tenemos cada tabla al día (migración 44). Con esto el
  // refresco pide "lo cambiado desde entonces" en vez de bajarlo todo otra vez.
  const sincroRef = useRef({});
  // Contador de generacion: si dos cargas se solapan (el refresco de 40 s y el
  // de un clic), la que empezo antes NO puede pisar a la que empezo despues.
  const epocaRef = useRef(0);
  // MODO INSPECCIÓN DE OBRA (solo gerencia). El tablero y el reporte mensual
  // NUNCA se filtran: ahí se comparan las cinco obras y es lo que señala cuál
  // se está saliendo. Elegida la obra, los módulos operativos la obedecen para
  // ir a mirar de cerca. Arranca en TODOS: elegir es un acto consciente.
  // Almacén es la excepción: es de UNA obra y tiene su propio selector, así
  // que este se oculta mientras se está ahí.
  const [obraGlobal, setObraGlobal] = useState('TODOS');

  // Dar por leído un aviso no cambia ningún dato de la base, así que React no
  // redibuja solo y la insignia de la pestaña se quedaría encendida hasta el
  // refresco siguiente. Esto la apaga en el momento.
  //
  // OJO: estos dos ganchos van AQUÍ ARRIBA con los demás, nunca más abajo.
  // Debajo hay cortes que devuelven la pantalla de carga antes de llegar al
  // final, y un gancho puesto después de un corte se ejecuta unas veces sí y
  // otras no. React lo detecta y tumba la aplicación entera: pantalla en
  // blanco después de "cargando datos". Pasó exactamente eso el 18 ago 2026.
  const [, redibujar] = useState(0);
  alEnterarse(useCallback(() => redibujar(n => n + 1), []));

  useEffect(() => {
    // Supabase entrega un objeto NUEVO en cada evento (refresco de token,
    // foco de ventana…). Si lo guardamos tal cual, el efecto de arranque
    // se vuelve a ejecutar y le resetea la pestaña al usuario en plena
    // faena. Solo cambiamos de sesión cuando cambia la persona.
    const mismo = (a, b) => (a && a.user && a.user.id) === (b && b.user && b.user.id);
    supabase.auth.getSession().then(({ data }) => setSession(s => (mismo(s, data.session) ? s : data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => setSession(p => (mismo(p, s) ? p : s)));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Una pestaña abierta durante la medianoche quedaría con la fecha del día
  // anterior (HOY se calcula al cargar): al detectar el cambio de día, recargar.
  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (iso !== HOY_ISO) window.location.reload();
    }, 60000);
    return () => clearInterval(t);
  }, []);

  const cargarTodo = useCallback(async (soloDinamicos = false, soloTablas = null) => {
    // Supabase devuelve máximo 1,000 filas por consulta: traer por lotes
    // hasta completar (el catálogo tiene 1,740 materiales).
    const LOTE = 1000;
    const fetchAll = async crearQuery => {
      const filas = [];
      for (let desde = 0; ; desde += LOTE) {
        const { data, error } = await crearQuery().range(desde, desde + LOTE - 1);
        if (error) return { error };
        filas.push(...data);
        if (data.length < LOTE) return { data: filas };
      }
    };
    // Transaccional. Tras una acción solo se vuelven a traer las tablas que
    // esa acción pudo tocar; el resto sale de la caché. Antes cada clic
    // rebajaba las 10 tablas enteras (~840 KB) y por eso se sentía lento.
    // Tabla, orden, y si admite carga INCREMENTAL (migración 44).
    // Incremental = "dame solo lo que cambió desde la última vez". Solo vale
    // para tablas de las que NUNCA se borran filas: una fila borrada no puede
    // llegar como cambio, el navegador no se enteraría jamás. Por eso
    // factura_items (anular una factura borra sus líneas), stock_inicial y
    // cajas_chicas (clave compuesta, sin `id`) y alertas_levantadas (se borran
    // al reabrirlas) se siguen trayendo enteras. Pesan poco.
    const DIN = [
      ['rqs',                  ['numero'],                   true],
      ['rq_items',             ['creado_en', 'id'],          true],
      ['facturas',             ['numero'],                   true],
      ['factura_items',        ['factura_id', 'rq_item_id'], false],
      ['salidas',              ['numero'],                   true],
      ['prestamos',            ['numero'],                   true],
      ['solicitudes_material', ['numero'],                   true],
      ['stock_inicial',        ['proyecto', 'codigo'],       false],
      ['cajas_chicas',         ['proyecto'],                 false],
      ['rendiciones',          ['numero'],                   true],
      ['entregas_caja',        ['numero'],                   true],
      ['alertas_levantadas',   [],                           false],
    ];
    const crearQ = (tabla, orden, desde) => () => {
      let q = supabase.from(tabla).select('*');
      if (desde) q = q.gt('actualizado_en', desde);
      orden.forEach(o => { q = q.order(o); });
      return q;
    };
    // Mezcla lo que llegó con lo que ya había, por id. Las filas que no
    // cambiaron se quedan donde estaban; las nuevas van al final.
    const mezclar = (previo, filas) => {
      if (!previo || !previo.data) return { data: filas };
      if (!filas.length) return previo;
      const porId = new Map(previo.data.map(r => [r.id, r]));
      filas.forEach(r => porId.set(r.id, r));
      return { data: [...porId.values()] };
    };
    const epoca = ++epocaRef.current;
    const cache = dinamicosRef.current;
    const marcas = sincroRef.current;
    // Las marcas nuevas se acumulan aparte y solo se publican si esta carga
    // gana. Si se movieran aqui, una carga que acaba descartandose dejaria la
    // marca adelantada y esas filas no se volverian a pedir NUNCA.
    const marcasNuevas = {};
    const qDin = DIN.map(([nombre, orden, incremental]) => {
      if (soloTablas && cache && !soloTablas.includes(nombre)) return Promise.resolve(cache[nombre]);
      // Solo se pide "lo cambiado" si ya tenemos la foto completa de antes.
      const desde = incremental && cache && cache[nombre] && cache[nombre].data ? marcas[nombre] : null;
      return fetchAll(crearQ(nombre, orden, desde)).then(r => {
        if (r.error) return r;
        // La marca de agua se retrasa 2 segundos a propósito: si dos escrituras
        // caen en el mismo instante, preferimos repetir una fila (la mezcla la
        // ignora) antes que perderla para siempre.
        const max = r.data.reduce((m, f) => (f.actualizado_en > m ? f.actualizado_en : m), '');
        if (max) marcasNuevas[nombre] = new Date(Date.parse(max) - 2000).toISOString();
        return desde ? mezclar(cache[nombre], r.data) : r;
      });
    });
    // Casi-estático: catálogo + maestros. Se trae una vez (o en refresco completo);
    // el auto-refresco reusa la caché para no volver a bajar los 1,740 materiales.
    const usarCache = soloDinamicos && estaticosRef.current;
    const qEst = usarCache ? [] : [
      // Columnas explícitas, no select('*'): así una columna nueva y sensible
      // no viaja sola al navegador de los 7 roles sin que nadie se entere.
      fetchAll(() => supabase.from('proyectos').select('codigo,nombre,activo').order('codigo')),
      fetchAll(() => supabase.from('usuarios').select('id,nombre,rol,proyecto_asignado,activo').order('id')),
      fetchAll(() => supabase.from('materiales').select('*').eq('activo', true).order('codigo')),
      fetchAll(() => supabase.from('proveedores').select('*').order('razon_social').order('ruc')),
      fetchAll(() => supabase.from('familias').select('*').order('iu')),
      // Cuentas bancarias por obra (migración 32). La tabla está cerrada a
      // gerencia y pagos: a los demás roles les devuelve 0 filas, sin error.
      fetchAll(() => supabase.from('proyectos_banco').select('codigo,banco,nro_cuenta')),
    ];
    const [dinR, estR] = await Promise.all([Promise.all(qDin), Promise.all(qEst)]);
    // Otra carga empezo mientras esta viajaba: la nuestra esta vieja y pisarla
    // perderia lo que trajo la otra. Se descarta entera, marcas incluidas.
    if (epoca !== epocaRef.current) return null;
    // guardar el crudo para poder refrescar solo una tabla la próxima vez
    dinamicosRef.current = Object.fromEntries(DIN.map(([n], k) => [n, dinR[k]]));
    Object.assign(marcas, marcasNuevas);
    const [rqsR, itemR, factR, fitR, salR, preR, solR, siR, cajR, renR, entR, alvR] = dinR;
    let prjR, usrR, matR, provR, famR, pbR;
    if (usarCache) {
      ({ prjR, usrR, matR, provR, famR, pbR } = estaticosRef.current);
    } else {
      [prjR, usrR, matR, provR, famR, pbR] = estR;
      // Si la consulta de bancos falló, NO se cachea nada: un error guardado
      // aquí se queda pegado para siempre y Pagos no podría pagar hasta
      // recargar la página entera. Sin caché, el siguiente ciclo reintenta.
      if (!(pbR && pbR.error)) estaticosRef.current = { prjR, usrR, matR, provR, famR, pbR };
    }
    // pbR queda FUERA de conError a propósito: si la migración 32 no estuviera
    // corrida, o Supabase aún no hubiera recargado su esquema, lo peor que pasa
    // es que Pagos vea el banco vacío — no que los 7 roles vean pantalla de error.
    const conError = [prjR, usrR, matR, provR, rqsR, itemR, factR, fitR, salR, preR, solR, famR, siR, cajR, renR].find(r => r.error);
    if (conError) { setCargaError(conError.error.message); return null; }

    const prj = prjR.data, usrs = usrR.data, mats = matR.data, provs = provR.data, fams = famR.data;
    const famMap = {}; fams.forEach(f => { famMap[f.iu] = f.nombre; });
    const nomProy = {}, codProy = {}, bancoDe = {};
    prj.forEach(p => { nomProy[p.codigo] = p.nombre; codProy[p.nombre] = p.codigo; });
    // bancoDe se indexa por NOMBRE de obra, que es como lo consultan Pagos,
    // Rendiciones y Auditoría. Para los roles que no pueden leer la tabla
    // queda vacío, y todos los accesos ya usan (bancoDe[x] || {}).
    ((pbR || {}).data || []).forEach(b => {
      const n = nomProy[b.codigo];
      if (n) bancoDe[n] = { banco: b.banco || '', cuenta: b.nro_cuenta || '' };
    });
    // ÚNICO cambio de texto deliberado de la mudanza (etapa 5): un import es
    // de solo lectura, así que ya no se asigna aquí — se arma en locales con
    // LAS MISMAS expresiones de antes y se publica con setMaestros.
    const proy2 = prj.filter(p => p.activo).map(p => [p.codigo, p.nombre]);
    const alm2 = {};
    usrs.filter(u => u.rol === 'almacen' && u.activo && u.proyecto_asignado).forEach(u => { alm2[nomProy[u.proyecto_asignado]] = u.nombre; });
    setMaestros(proy2, alm2);

    const matMap = {}; mats.forEach(m => { matMap[m.codigo] = m; });
    // Unidad de consumo: si el material se compra en caja, la base es und_base.
    // OJO: esto es solo el RESPALDO. Desde la migracion 59 la unidad viaja
    // congelada en cada linea, porque deducirla del catalogo reescribia el
    // pasado: cargar una equivalencia de caja convertia un '3 CAJA' ya
    // registrado en '3 UND', sin tocar el numero y sin que nadie lo notara.
    const undDe = m => (m && (m.und_base || m.und)) || '';
    const factorMap = {};
    mats.forEach(m => { if (m.factor_caja) factorMap[m.codigo] = { factor: Number(m.factor_caja), undCompra: m.und, undBase: m.und_base || 'UND' }; });
    const usrMap = {}; usrs.forEach(u => { usrMap[u.id] = u; });
    const provMap = {}; provs.forEach(p => { provMap[p.ruc] = p; });
    const factMap = {}; factR.data.forEach(f => { factMap[f.id] = f; });
    // Precio promedio ponderado por material (del desglose de facturas):
    // base de la valorización del cierre mensual de almacén
    const itemById = {}; itemR.data.forEach(r => { itemById[r.id] = r; });
    const acumPrecio = {};
    fitR.data.forEach(fi => {
      if (fi.precio_unitario == null) return;
      const it = itemById[fi.rq_item_id]; if (!it) return;
      const a = (acumPrecio[it.codigo] = acumPrecio[it.codigo] || { m: 0, c: 0 });
      a.m += Number(fi.precio_unitario) * Number(it.cant);
      a.c += Number(it.cant);
    });
    const precioProm = {};
    Object.entries(acumPrecio).forEach(([k, v]) => { if (v.c > 0) precioProm[k] = v.m / v.c; });
    // Última compra por material (referencia anti-sobreprecio al facturar)
    const ultimaCompra = {};
    fitR.data.forEach(fi => {
      if (fi.precio_unitario == null) return;
      const it = itemById[fi.rq_item_id]; if (!it) return;
      const fx = factMap[fi.factura_id]; if (!fx) return;
      const u = ultimaCompra[it.codigo];
      if (!u || fx.fecha > u.fecha || (fx.fecha === u.fecha && fx.numero > u.n)) {
        ultimaCompra[it.codigo] = {
          precio: Number(fi.precio_unitario), fecha: fx.fecha, n: fx.numero,
          prov: provMap[fx.proveedor_ruc] ? provMap[fx.proveedor_ruc].razon_social : fx.proveedor_ruc,
        };
      }
    });
    // Historial de precios por material: todas las compras con proveedor y fecha.
    // Es la herramienta de negociación de Compras (backlog 4).
    const historialPrecios = {};
    fitR.data.forEach(fi => {
      if (fi.precio_unitario == null) return;
      const it = itemById[fi.rq_item_id]; if (!it) return;
      const fx = factMap[fi.factura_id]; if (!fx) return;
      (historialPrecios[it.codigo] = historialPrecios[it.codigo] || []).push({
        precio: Number(fi.precio_unitario), cant: Number(it.cant), fecha: fx.fecha,
        serie: fx.serie, proyecto: nomProy[fx.proyecto] || fx.proyecto,
        ruc: fx.proveedor_ruc,
        prov: provMap[fx.proveedor_ruc] ? provMap[fx.proveedor_ruc].razon_social : fx.proveedor_ruc,
      });
    });
    // de la compra más reciente a la más antigua
    Object.values(historialPrecios).forEach(l => l.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)));

    // Mejor precio de cada material en los ÚLTIMOS 2 MESES: el piso al que
    // ya se compró, para negociar con el proveedor sin cotizar de nuevo.
    const hace2meses = (() => {
      const d = new Date(HOY_ISO + 'T00:00:00Z');
      d.setUTCMonth(d.getUTCMonth() - 2);
      return d.toISOString().slice(0, 10);
    })();
    const mejorPrecio2m = {};
    Object.entries(historialPrecios).forEach(([cod, compras]) => {
      const recientes = compras.filter(c => c.fecha >= hace2meses);
      if (!recientes.length) return;
      const min = recientes.reduce((a, b) => (b.precio < a.precio ? b : a));
      mejorPrecio2m[cod] = { precio: min.precio, prov: min.prov, fecha: min.fecha, n: recientes.length };
    });

    const factDeItem = {}; const itemsDeFactura = {};
    fitR.data.forEach(fi => {
      factDeItem[fi.rq_item_id] = factMap[fi.factura_id] || null;
      (itemsDeFactura[fi.factura_id] = itemsDeFactura[fi.factura_id] || []).push(fi.rq_item_id);
    });
    // El estado de pago del ítem se hereda de su factura:
    // sin factura → '—' · factura pendiente al crédito → 'Crédito'
    // factura pendiente contado/transferencia → 'Falta' · pagada → 'Pagado'
    const pagoDe = fx => {
      if (!fx) return '—';
      if (fx.estado_pago === 'Pagada') return 'Pagado';
      return (fx.forma_pago || '').toLowerCase().includes('cr') ? 'Crédito' : 'Falta';
    };

    const itemsPorRq = {};
    itemR.data.forEach(r => {
      const m = matMap[r.codigo] || {};
      const it = {
        id: r.id, cod: r.codigo, desc: m.descripcion || r.codigo, und: r.und || undDe(m),
        cant: Number(r.cant), fecha: r.fecha_necesitada, destino: r.destino, color: r.color || '', obs: r.obs || '',
        canal: r.canal, decision: r.decision, estado: r.estado, motivoRechazo: r.motivo_rechazo || '',
        motivoAnulacion: r.anulacion ? r.anulacion.motivo : '', anuladoPor: r.anulacion ? r.anulacion.por : '',
        fechaAnulacion: r.anulacion ? r.anulacion.fecha : '',
        // anulación pedida por Compras, pendiente del visto bueno de gerencia (migración 22)
        anulSolMotivo: r.anulacion_solicitud ? r.anulacion_solicitud.motivo : '',
        anulSolPor: r.anulacion_solicitud ? r.anulacion_solicitud.por : '',
        anulSolFecha: r.anulacion_solicitud ? r.anulacion_solicitud.fecha : '',
        anulRechMotivo: r.anulacion_rechazo ? r.anulacion_rechazo.motivo : '',
        anulRechPor: r.anulacion_rechazo ? r.anulacion_rechazo.por : '',
        pago: pagoDe(factDeItem[r.id]), factura: factDeItem[r.id] ? factDeItem[r.id].serie : null,
        fechaEntrega: r.fecha_entrega || '', fechaRecojoSaldo: r.fecha_recojo_saldo || '', fechaEntregaSaldo: r.fecha_entrega_saldo || '',
        comunicoResidente: r.comunico_residente === true ? 'Sí' : r.comunico_residente === false ? 'No' : '—',
        destinoSaldo: r.destino_saldo || '', cantRecibida: Number(r.cant_recibida || 0), obsAlmacen: r.obs_almacen || '',
        correcciones: Array.isArray(r.correcciones) ? r.correcciones : [],
        fechaCaducidad: r.fecha_caducidad || '',
        compradoPorId: r.comprado_por || null, compradoPor: usrMap[r.comprado_por] ? usrMap[r.comprado_por].nombre : '',
        decididoPor: usrMap[r.decidido_por] ? usrMap[r.decidido_por].nombre : '',
        // "yo me encargo" (migración 50). Solo vale el mismo día: al siguiente
        // vuelve a estar libre sin que nadie tenga que soltarlo.
        // La hora se convierte al reloj de quien mira antes de comparar: la base
        // guarda en UTC y Cusco va 5 horas por detrás, así que a partir de las
        // 19:00 el texto guardado ya lleva la fecha del día siguiente. Leerle el
        // prefijo hacía desaparecer todo lo que Frank tomaba al cerrar su jornada.
        tomadoPor: esDelDia(r.tomado_en, HOY_ISO) && usrMap[r.tomado_por]
          ? usrMap[r.tomado_por].nombre : '',
        tomadoPorId: esDelDia(r.tomado_en, HOY_ISO) ? r.tomado_por : null,
        fechaCompra: r.fecha_compra || '',
        creadoEn: r.creado_en || null, decididoEn: r.decidido_en || null,
      };
      (itemsPorRq[r.rq_id] = itemsPorRq[r.rq_id] || []).push(it);
    });

    // El canal de un RQ es el de su ítem MÁS urgente, y el de cada ítem lo
    // calcula la BASE con las fechas reales (trg_rq_items_biu). El canal que
    // viaja en la cabecera lo declara el navegador de quien crea el RQ: si se
    // usara ese, el "% de urgentes" -- con el que se mide quién planifica y
    // quién apaga incendios -- lo estaría declarando la persona medida. El
    // sistema ya sabía la verdad y la tiraba al dibujar; aquí se recupera.
    const ORDEN_CANAL = { URGENTE: 0, GENERAL: 1, ANTICIPADO: 2, 'ESPECIAL LIMA': 2 };
    const canalDeItems = (items, declarado) => {
      const cs = (items || []).map(i => i.canal).filter(Boolean);
      if (!cs.length) return declarado;   // RQ sin líneas: no hay de dónde derivarlo
      return cs.reduce((a, b) => (ORDEN_CANAL[b] ?? 9) < (ORDEN_CANAL[a] ?? 9) ? b : a);
    };

    const rqs = rqsR.data.map(r => ({
      id: r.id, n: r.numero, proyecto: nomProy[r.proyecto] || r.proyecto, partida: r.partida,
      tipo: r.tipo || 'RQ', cotizacionRef: r.cotizacion_ref || '', arquitecto: r.solicitante_diseno || '',
      residente: r.tipo === 'Cotizacion' ? (r.solicitante_diseno || 'Diseño') : (usrMap[r.residente_id] ? usrMap[r.residente_id].nombre : ''),
      almacen: r.almacen_resp || '',
      piso: r.piso || '', canal: canalDeItems(itemsPorRq[r.id], r.canal),
      canalDeclarado: r.canal,   // lo que dijo el navegador al crear: se guarda para poder auditarlo
      just: r.justificacion || '', fechaRQ: r.fecha_rq,
      creadoEn: r.creado_en || null,   // marca real con hora (auditoría y patrón horario)
      creadoPor: usrMap[r.creado_por] ? usrMap[r.creado_por].nombre : '', items: itemsPorRq[r.id] || [],
    }));

    const rqNumDeItem = {}, descDeItem = {};
    rqs.forEach(r => r.items.forEach(i => { rqNumDeItem[i.id] = r.n; descDeItem[i.id] = i.desc; }));

    const facturas = factR.data.map(f => ({
      id: f.id, n: f.numero, serie: f.serie, tipoDoc: f.tipo_doc || 'Factura',
      anulMotivo: f.anulacion ? f.anulacion.motivo : '', anulPor: f.anulacion ? f.anulacion.por : '',
      anulFecha: f.anulacion ? f.anulacion.fecha : '',
      prov: provMap[f.proveedor_ruc] ? provMap[f.proveedor_ruc].razon_social : f.proveedor_ruc,
      ruc: f.proveedor_ruc, fecha: f.fecha, monto: Number(f.monto), forma: f.forma_pago,
      proyecto: nomProy[f.proyecto] || f.proyecto,
      registradoPor: usrMap[f.registrado_por] ? usrMap[f.registrado_por].nombre : '',
      registradoPorId: f.registrado_por || null,
      estadoPago: f.estado_pago || 'Pendiente', banco: f.banco || '', numOp: f.numero_operacion || '',
      medio: f.medio_pago || '', rendicionId: f.rendicion_id || null,
      conciliada: !!f.conciliada, conciliadaPor: usrMap[f.conciliada_por] ? usrMap[f.conciliada_por].nombre : '',
      fechaConciliacion: f.fecha_conciliacion || '',
      fechaPago: f.fecha_pago || '', pagadoPor: usrMap[f.pagado_por] ? usrMap[f.pagado_por].nombre : '',
      items: (itemsDeFactura[f.id] || []).map(id => ({ rq: rqNumDeItem[id], desc: descDeItem[id] })),
    }));

    const cajas = {};
    const tolerancias = {};
    cajR.data.forEach(c => {
      cajas[nomProy[c.proyecto] || c.proyecto] = Number(c.monto_fondo);
      tolerancias[nomProy[c.proyecto] || c.proyecto] = c.tolerancia == null ? 20 : Number(c.tolerancia);
    });
    const rendiciones = renR.data.map(r => ({
      id: r.id, n: r.numero, proyecto: nomProy[r.proyecto] || r.proyecto, fecha: r.fecha,
      responsable: usrMap[r.responsable_id] ? usrMap[r.responsable_id].nombre : '',
      montoFondo: Number(r.monto_fondo), estado: r.estado, observacion: r.observacion || '',
      aprobadoPor: usrMap[r.aprobado_por] ? usrMap[r.aprobado_por].nombre : '',
      fechaAprobacion: r.fecha_aprobacion || '', repOp: r.reposicion_operacion || '',
      repFecha: r.reposicion_fecha || '', repuestoPor: usrMap[r.repuesto_por] ? usrMap[r.repuesto_por].nombre : '',
      // corrección hecha por administración (la ve gerencia, migración 26)
      corrDetalle: r.correccion ? r.correccion.detalle : '', corrPor: r.correccion ? r.correccion.por : '',
      corrFecha: r.correccion ? r.correccion.fecha : '',
      // arqueo de caja (migración 27)
      efectivoContado: r.efectivo_contado == null ? null : Number(r.efectivo_contado),
      diferencia: r.diferencia == null ? null : Number(r.diferencia),
      difMotivo: r.dif_motivo || '',
      difDecision: r.dif_resolucion ? r.dif_resolucion.decision : '',
      difNota: r.dif_resolucion ? r.dif_resolucion.nota : '',
      difPor: r.dif_resolucion ? r.dif_resolucion.por : '',
      difFecha: r.dif_resolucion ? r.dif_resolucion.fecha : '',
    }));

    // Entregas de efectivo del día (migración 38). La caja chica no es un fondo
    // fijo: el disponible de cada jornada es la suma de estas entregas.
    // Queda fuera del control de errores a propósito: si la migración no
    // estuviera corrida, la caja se ve vacía en vez de tumbar toda la app.
    const entregas = (((entR || {}).data) || []).map(e => ({
      id: e.id, n: e.numero, proyecto: nomProy[e.proyecto] || e.proyecto,
      fecha: e.fecha, monto: Number(e.monto), medio: e.medio,
      numOp: e.num_operacion || '',
      entregadoPor: usrMap[e.entregado_por] ? usrMap[e.entregado_por].nombre : '',
      motivoAtraso: e.motivo_atraso || '',
      anulMotivo: e.anulacion ? e.anulacion.motivo : '',
      anulPor: e.anulacion ? e.anulacion.por : '',
      anulFecha: e.anulacion ? e.anulacion.fecha : '',
    }));

    // Alertas de Auditoría que gerencia dio por resueltas (migración 39).
    // Fuera del control de errores, como las entregas: si la migración no
    // estuviera corrida, las alertas se ven todas en vez de romper la app.
    const levantadas = Object.fromEntries((((alvR || {}).data) || []).map(a => [a.clave, {
      nota: a.nota, fecha: a.fecha,
      por: usrMap[a.levantada_por] ? usrMap[a.levantada_por].nombre : '',
    }]));

    const salidas = salR.data.map(s => ({
      id: s.id, n: s.numero, fecha: s.fecha, proyecto: nomProy[s.proyecto] || s.proyecto,
      cod: s.codigo, desc: matMap[s.codigo] ? matMap[s.codigo].descripcion : s.codigo,
      und: s.und || undDe(matMap[s.codigo]), cant: Number(s.cant),
      reingresada: Number(s.cant_reingresada || 0),
      reingresoPor: s.reingreso ? s.reingreso.por : '', fechaReingreso: s.reingreso ? s.reingreso.fecha : '',
      aprobacion: s.aprobacion || 'Aprobada',
      aprobadoPor: usrMap[s.aprobado_por] ? usrMap[s.aprobado_por].nombre : '',
      fechaAprobacion: s.fecha_aprobacion || '', motivoRechazo: s.motivo_rechazo || '',
      hoja: s.hoja_trabajo, zona: s.zona, uso: s.uso, motivoUso: s.motivo_uso || '',
      registradoPor: usrMap[s.registrado_por] ? usrMap[s.registrado_por].nombre : '',
      anulada: !!s.anulacion, motivoAnulacion: s.anulacion ? s.anulacion.motivo : '',
      anuladoPor: s.anulacion ? s.anulacion.por : '', fechaAnulacion: s.anulacion ? s.anulacion.fecha : '',
    }));

    const prestamos = preR.data.map(p => ({
      id: p.id, n: p.numero, fecha: p.fecha,
      origen: nomProy[p.origen] || p.origen, destino: nomProy[p.destino] || p.destino,
      cod: p.codigo, desc: matMap[p.codigo] ? matMap[p.codigo].descripcion : p.codigo,
      und: p.und || undDe(matMap[p.codigo]), cant: Number(p.cant),
      autoriza: p.autoriza, estado: p.estado, fechaCierre: p.fecha_cierre,
      aprobOrigen: p.aprob_origen ? p.aprob_origen.por : '', aprobDestino: p.aprob_destino ? p.aprob_destino.por : '',
      rechazoMotivo: p.rechazo ? p.rechazo.motivo : '', rechazoPor: p.rechazo ? p.rechazo.por : '',
      motivoAnulacion: p.anulacion ? p.anulacion.motivo : '', anuladoPor: p.anulacion ? p.anulacion.por : '',
      registradoPor: usrMap[p.registrado_por] ? usrMap[p.registrado_por].nombre : '',
    }));

    const stockInicial = siR.data.map(si => ({
      proyecto: nomProy[si.proyecto] || si.proyecto, cod: si.codigo,
      desc: matMap[si.codigo] ? matMap[si.codigo].descripcion : si.codigo,
      und: si.und || undDe(matMap[si.codigo]),
      cant: Number(si.cant), fecha: si.fecha_inventario,
    }));

    const solicitudes = solR.data.map(s => ({
      id: s.id, n: s.numero, fecha: s.fecha, desc: s.descripcion, und: s.und,
      perecedero: !!s.perecedero,
      fam: s.familia_iu ? (famMap[s.familia_iu] || s.familia_iu) : '', famIu: s.familia_iu || '',
      solicitante: usrMap[s.solicitante_id] ? usrMap[s.solicitante_id].nombre : '', solicitanteId: s.solicitante_id,
      proyecto: nomProy[s.proyecto] || s.proyecto, estado: s.estado, motivo: s.motivo || '', codigo: s.codigo_asignado,
    }));

    const nuevo = {
      rqs, facturas, salidas, prestamos, solicitudes, stockInicial, cajas, tolerancias, rendiciones, bancoDe, entregas, levantadas,
      catalogo: mats.map(m => [m.codigo, m.descripcion, undDe(m), famMap[m.codigo.slice(0, 2)] || '', m.factor_caja ? Number(m.factor_caja) : null, m.factor_caja ? m.und : null, !!m.perecedero]),
      pereceMap: Object.fromEntries(mats.filter(m => m.perecedero).map(m => [m.codigo, true])),
      precioProm, ultimaCompra, historialPrecios, mejorPrecio2m,
      proveedores: provs.map(p => [p.ruc, p.razon_social]),
      familias: fams.map(f => [f.iu, f.nombre]),
      factorMap,
      nomProy, codProy,
    };
    dbRef.current = nuevo;
    setDb(nuevo);
    setCargaError('');
    return nuevo;
  }, []);

  // Cargar perfil + datos al iniciar sesión
  useEffect(() => {
    // Cambio de persona (o cierre de sesion): se vacia TODA la memoria. Sin
    // esto, quien entra despues hereda las filas y la marca de agua del
    // anterior: veria datos que no le tocan y le faltaria casi todo lo suyo,
    // porque solo se le pediria "lo cambiado desde la ultima vez del otro".
    dinamicosRef.current = null;
    sincroRef.current = {};
    estaticosRef.current = null;
    if (!session) { setUser(null); setDb(null); return; }
    (async () => {
      const { data: perfil, error } = await supabase.from('usuarios').select('*').eq('id', session.user.id).single();
      if (error || !perfil) {
        setPerfilError('Tu cuenta no tiene perfil asignado en el sistema. Pide a administración que registre tu usuario.');
        return;
      }
      // Desactivado = fuera. mi_rol() y mi_proyecto() filtran por `activo`,
      // así que sin esto la persona entraba, veía TODOS los datos de su obra
      // y solo descubría que no podía guardar al pulsar el botón.
      if (!perfil.activo) {
        setPerfilError('Tu cuenta está desactivada: puedes iniciar sesión pero no registrar ni consultar nada. Pide a administración que la reactive.');
        return;
      }
      const datos = await cargarTodo();
      const nomProy = datos ? datos.nomProy : {};
      setUser({
        id: perfil.id, nombre: perfil.nombre, rol: perfil.rol,
        proyecto: perfil.proyecto_asignado ? (nomProy[perfil.proyecto_asignado] || perfil.proyecto_asignado) : null,
      });
      setTab(TAB_INICIAL[perfil.rol] || 'res');
      setPerfilError('');
    })();
  }, [session, cargarTodo]);

  // Auto-refresco: trae los últimos datos cada 40 s (para que las salidas y
  // préstamos por aprobar le aparezcan al residente sin refrescar a mano).
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => { if (!document.hidden) cargarTodo(true); }, 40000);
    return () => clearInterval(t);
  }, [session, cargarTodo]);

  const api = useMemo(() => {
    const cod = nombre => (dbRef.current ? dbRef.current.codProy[nombre] : null) || nombre;
    // tablas: qué pudo tocar esta acción. Solo eso se vuelve a traer;
    // el resto sale de la caché. Sin lista, se refresca todo (por si acaso).
    // maestros: catálogo, proveedores, familias… Se cachean para no bajar los
    // 1,740 materiales en cada refresco, así que hay que invalidar la caché
    // a mano en las pocas acciones que los cambian; si no, quien aprueba un
    // material no lo ve hasta recargar la página.
    const wrap = async (fn, tablas = null, refrescarMaestros = false) => {
      try {
        const r = await fn();
        if (r && r.error) return { error: r.error.message || String(r.error) };
        if (refrescarMaestros) estaticosRef.current = null;
        await cargarTodo(true, tablas);
        return r || {};
      } catch (e) { return { error: e.message || String(e) }; }
    };
    return {
      crearRq: ({ cab, items, just, canal }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        const { data: rq, error } = await supabase.from('rqs').insert({
          proyecto: cod(cab.proyecto), partida: cab.partida, residente_id: u.id,
          almacen_resp: cab.almacen, piso: cab.piso, canal, justificacion: just || null, creado_por: u.id,
        }).select().single();
        if (error) return { error };
        const rows = items.map(i => ({
          rq_id: rq.id, codigo: i.cod, cant: Number(i.cant), fecha_necesitada: cab.fecha,
          destino: i.destino.trim(), color: i.color.trim() || null, obs: i.obs.trim() || null,
        }));
        const { error: e2 } = await supabase.from('rq_items').insert(rows);
        if (e2) return { error: e2 };
        return { numero: rq.numero };
      }, ['rqs', 'rq_items']),
      updItem: (id, patch) => wrap(async () => await supabase.from('rq_items').update(patch).eq('id', id), ['rq_items']),
      // Una sola transacción en la base (migraciones 28/30): proveedor +
      // rendición + factura + líneas. Si algo falla no queda nada a medias.
      registrarFactura: ({ serie, prov, ruc, fecha, monto, forma, proyecto,
                           efectivo, compromiso, pendiente, medio, banco, numOp, lineas }) => wrap(async () => {
        const { error } = await supabase.rpc('registrar_factura', {
          p_serie: serie, p_ruc: ruc, p_prov: prov, p_fecha: fecha, p_monto: monto,
          p_forma: forma, p_proyecto: cod(proyecto),
          p_compromiso: !!compromiso, p_efectivo: !!efectivo, p_pendiente: !!pendiente,
          p_medio: medio || null, p_banco: banco || null, p_num_op: numOp || null,
          p_lineas: lineas.map(l => ({ item: l.id, precio: l.precio })),
        });
        if (error) {
          const m = error.message || '';
          if (m.includes('uq_factura') || error.code === '23505') {
            return { error: { message: `La factura ${serie} de ese RUC ya está registrada.` } };
          }
          return { error: { message: m.replace(/^.*?:\s*/, '') } };
        }
        return {};
        // refrescarMaestros: el RPC da de alta al proveedor si es nuevo,
        // y si no se invalida la caché no aparece en la lista hasta recargar.
      }, ['facturas', 'factura_items', 'rendiciones'], true),
      // Llega el documento físico: administración digita la serie real
      completarSerie: (id, serieReal) => wrap(async () => {
        const r = await supabase.from('facturas')
          .update({ serie: serieReal.trim().toUpperCase(), tipo_doc: 'Factura' }).eq('id', id);
        if (r.error && r.error.code === '23505') {
          return { error: { message: `La factura ${serieReal} de ese RUC ya está registrada. Verifica la serie.` } };
        }
        return r;
      }, ['facturas']),
      anularFactura: (id, motivo) => wrap(async () =>
        await supabase.rpc('anular_factura', { p_id: id, p_motivo: motivo }), ['facturas', 'factura_items']),
      pagarFactura: (id, { medio, banco, op, fecha, serieReal }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        const r = await supabase.from('facturas').update({
          estado_pago: 'Pagada', medio_pago: medio, banco, numero_operacion: op,
          fecha_pago: fecha, pagado_por: u.id,
          // compromiso → factura real: la serie llega con el comprobante al pagar
          ...(serieReal ? { serie: serieReal.trim().toUpperCase(), tipo_doc: 'Factura' } : {}),
        }).eq('id', id);
        // El numero de la serie se perdio de este mensaje el 11 ago 2026 al
        // reescribir esta capa por rendimiento: decia "La factura  de ese RUC",
        // con el hueco. Sin el numero, la salida natural era inventar una
        // variante ("F001-000500-B") que no existe en ningun comprobante.
        if (r.error && r.error.code === '23505') {
          const n = (serieReal || '').trim().toUpperCase();
          const fs = (dbRef.current && dbRef.current.facturas) || [];
          const esta = fs.find(f => f.id === id);
          const otra = fs.find(f => f.serie === n && esta && f.ruc === esta.ruc && f.id !== id);
          const donde = otra ? ` Ya la usa la factura de ${otra.proyecto} por S/ ${otra.monto.toFixed(2)}.` : '';
          return { error: { message: `⚠ El numero ${n} ya esta registrado para ese proveedor.${donde} `
            + `Suele pasar cuando el proveedor junta varias entregas en una sola factura. `
            + `NO invente una variante del numero: avise a Compras para resolverlo.` } };
        }
        return r;
      }, ['facturas']),
      resolverRendicion: (id, { estado, observacion }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('rendiciones').update({
          estado, observacion: observacion || null, aprobado_por: u.id, fecha_aprobacion: HOY_ISO,
        }).eq('id', id);
      }, ["rendiciones"]),
      // Arqueo: cierra la rendición con el efectivo contado. Si la diferencia
      // supera la tolerancia de la obra, queda "Con diferencia" para gerencia.
      cerrarConArqueo: (id, { contado, diferencia, excede, motivo, nombre }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        const patch = {
          efectivo_contado: contado, diferencia,
          dif_motivo: motivo || null,
          estado: excede ? 'Con diferencia' : 'Aprobada',
        };
        if (!excede) { patch.aprobado_por = u.id; patch.fecha_aprobacion = HOY_ISO; }
        return await supabase.from('rendiciones').update(patch).eq('id', id);
      }, ["rendiciones"]),
      // Gerencia resuelve la diferencia: recién ahí Pagos puede reponer
      resolverDiferencia: (id, { decision, nota, nombre }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('rendiciones').update({
          estado: 'Aprobada', aprobado_por: u.id, fecha_aprobacion: HOY_ISO,
          dif_resolucion: { decision, nota: nota || null, por: nombre, fecha: HOY_ISO },
        }).eq('id', id);
      }, ["rendiciones"]),
      // Administración corrige una rendición observada: queda aprobada con rastro
      corregirRendicion: (id, { detalle, nombre }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('rendiciones').update({
          estado: 'Aprobada', aprobado_por: u.id, fecha_aprobacion: HOY_ISO,
          correccion: { detalle, por: nombre, fecha: HOY_ISO },
        }).eq('id', id);
      }, ['rendiciones']),
      // Entregas de efectivo al comprador (migración 38). Quién entregó lo
      // estampa la base; aquí solo va lo que se digita.
      // Levantar una alerta de Auditoría: gerencia la da por resuelta, con nota.
      // Quién y cuándo los pone la base.
      levantarAlerta: ({ clave, tipo, detalle, nota }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('alertas_levantadas').insert({
          clave, tipo, detalle, nota: nota.trim(), levantada_por: u.id,
        });
      }, ['alertas_levantadas']),
      reabrirAlerta: clave => wrap(async () =>
        await supabase.from('alertas_levantadas').delete().eq('clave', clave),
        ['alertas_levantadas']),
      registrarEntrega: ({ proyecto, monto, medio, numOp, fecha, motivo }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('entregas_caja').insert({
          proyecto: cod(proyecto), monto: Number(monto), medio,
          num_operacion: medio === 'Efectivo' ? null : numOp.trim(),
          fecha: fecha || HOY_ISO, entregado_por: u.id,
          // Solo cuando la fecha no es hoy; la base lo exige en ese caso.
          motivo_atraso: (fecha && fecha !== HOY_ISO) ? (motivo || '').trim() : null,
        });
      }, ['entregas_caja']),
      anularEntrega: (id, motivo) => wrap(async () =>
        await supabase.from('entregas_caja').update({ anulacion: { motivo } }).eq('id', id),
        ['entregas_caja']),
      recibir: (item, rec, obs, cad) => wrap(async () => {
        const total = Number(item.cantRecibida || 0) + rec;
        const esSaldo = item.estado === 'Incompleto';
        const patch = { cant_recibida: total };
        // La fecha de entrega es la del PRIMER lote que ingresa (no editable a mano);
        // la del saldo se estampa en la recepción del saldo.
        if (esSaldo) patch.fecha_entrega_saldo = HOY_ISO;
        else patch.fecha_entrega = HOY_ISO;
        if (obs) patch.obs_almacen = item.obsAlmacen ? item.obsAlmacen + ' · ' + obs : obs;
        // perecedero: se conserva la caducidad más próxima entre recepciones
        if (cad) patch.fecha_caducidad = (item.fechaCaducidad && item.fechaCaducidad < cad) ? item.fechaCaducidad : cad;
        return await supabase.from('rq_items').update(patch).eq('id', item.id);
      }, ['rq_items']),
      // Corregir una cantidad mal digitada (migración 35). Solo se manda el
      // motivo: quién y cuándo los estampa la base, para que el rastro no se
      // pueda falsear. El historial no se pisa, se le agrega una entrada.
      corregirRecepcion: (item, nuevaCant, motivo) => wrap(async () =>
        await supabase.from('rq_items').update({
          cant_recibida: nuevaCant,
          correcciones: [...(item.correcciones || []), { motivo }],
        }).eq('id', item.id), ['rq_items']),
      darSalida: ({ proyecto, cod: codigo, cant, hoja, zona }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('salidas').insert({
          proyecto: cod(proyecto), codigo, cant, hoja_trabajo: hoja, zona, registrado_por: u.id,
        });
      }, ['salidas']),
      updSalida: (id, patch) => wrap(async () => await supabase.from('salidas').update(patch).eq('id', id), ['salidas']),
      prestar: ({ origen, destino, cod: codigo, cant }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('prestamos').insert({
          origen: cod(origen), destino: cod(destino), codigo, cant, registrado_por: u.id,
        });
      }),
      updPrestamo: (id, patch) => wrap(async () => await supabase.from('prestamos').update(patch).eq('id', id), ['prestamos']),
      crearSolicitud: ({ desc, und, famIu, perecedero, proyecto }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('solicitudes_material').insert({
          descripcion: desc, und, familia_iu: famIu, perecedero, solicitante_id: u.id, proyecto: cod(proyecto),
        });
      }),
      // Aprobación en una sola transacción (RPC): material + solicitud juntos
      aprobarSolicitud: (s, { codigo, desc, und, famIu, perecedero }) => wrap(async () =>
        await supabase.rpc('aprobar_material', {
          p_solicitud: s.id, p_codigo: codigo, p_descripcion: desc,
          p_und: und, p_familia_iu: famIu, p_perecedero: perecedero,
        }), ['solicitudes_material'], true),
      rechazarSolicitud: (s, motivo) => wrap(async () =>
        await supabase.from('solicitudes_material').update({ estado: 'Rechazado', motivo }).eq('id', s.id)),
      crearFamilia: ({ iu, nombre }) => wrap(async () =>
        await supabase.from('familias').insert({ iu, nombre }), [], true),
      // Pedido por cotización (enchapes): crea cada material 97xxxx + el pedido aprobado
      crearPedidoCotizacion: ({ proyecto, cotizacionRef, arquitecto, fecha, lineas }) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        const cat = dbRef.current.catalogo;
        let cod97 = Math.max(970100, ...cat.filter(m => String(m[0]).startsWith('97')).map(m => Number(m[0])));
        const mats = [];
        for (const l of lineas) {
          cod97 += 1;
          const codigo = String(cod97);
          const { error } = await supabase.from('materiales').insert({
            codigo, descripcion: l.desc.trim().toUpperCase(), und: 'M2',
          });
          if (error) return { error };
          mats.push({ codigo, cant: Number(l.cant), destino: l.destino.trim() });
        }
        const { data: rq, error: e1 } = await supabase.from('rqs').insert({
          proyecto: cod(proyecto), partida: cotizacionRef.trim(), residente_id: u.id, creado_por: u.id,
          tipo: 'Cotizacion', cotizacion_ref: cotizacionRef.trim(), solicitante_diseno: arquitecto.trim(), canal: 'GENERAL',
        }).select().single();
        if (e1) return { error: e1 };
        const rows = mats.map(m => ({ rq_id: rq.id, codigo: m.codigo, cant: m.cant, fecha_necesitada: fecha, destino: m.destino, decision: 'Aprobado' }));
        const { error: e2 } = await supabase.from('rq_items').insert(rows);
        if (e2) return { error: e2 };
        return { numero: rq.numero };
        // crea materiales 97xxxx nuevos -> hay que refrescar el catálogo
      }, ['rqs', 'rq_items'], true),
      // Compra parcial (migración 49): el ítem se parte en dos — lo conseguido y
      // el saldo — para que la factura cubra lo comprado de verdad con su precio
      // real, en vez de forzar un precio inventado sobre la cantidad pedida.
      // Tomar un ítem para comprarlo, o soltarlo. Quién lo tomó lo pone la base.
      tomarItem: (id, tomar) => wrap(async () =>
        await supabase.from('rq_items').update({ tomado_en: tomar ? HOY_ISO : null }).eq('id', id),
        ['rq_items']),
      compraParcial: (item, cant, motivo, cerrarSaldo) => wrap(async () =>
        await supabase.rpc('compra_parcial', {
          p_item: item.id, p_cant: Number(cant), p_motivo: motivo.trim(),
          p_cerrar_saldo: !!cerrarSaldo,
        }), ['rqs', 'rq_items']),
      setPerecedero: (codigo, valor) => wrap(async () =>
        await supabase.from('materiales').update({ perecedero: valor }).eq('codigo', codigo), [], true),
      conciliarFactura: (id, valor) => wrap(async () => {
        const u = (await supabase.auth.getUser()).data.user;
        return await supabase.from('facturas').update(valor
          ? { conciliada: true, conciliada_por: u.id, fecha_conciliacion: HOY_ISO }
          : { conciliada: false, conciliada_por: null, fecha_conciliacion: null }
        ).eq('id', id);
      }),
    };
  }, [cargarTodo]);

  if (session === undefined) return <div className="bg-slate-950 min-h-screen" />;

  if (!session) return (
    <div className="bg-slate-950 min-h-screen text-slate-100" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <Login />
    </div>
  );

  if (perfilError) return (
    <div className="bg-slate-950 min-h-screen text-slate-100 flex items-center justify-center p-4" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div className="max-w-sm text-center">
        <div className="text-red-400 text-sm mb-4">{perfilError}</div>
        <button onClick={() => supabase.auth.signOut()} className="px-4 py-2 rounded text-xs font-bold uppercase bg-slate-800 text-slate-300">Salir</button>
      </div>
    </div>
  );

  if (!user || !db) return (
    <div className="bg-slate-950 min-h-screen text-slate-400 flex items-center justify-center text-sm" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {cargaError ? <span className="text-red-400">Error cargando datos: {cargaError}</span> : 'Cargando datos…'}
    </div>
  );

  const tabs = TABS_POR_ROL[user.rol] || [];
  // pendientes de aprobación del residente (para avisar en la pestaña)
  const pendAprob = (user.rol === 'residente' && db) ? (
    db.salidas.filter(s => s.proyecto === user.proyecto && !s.anulada && s.aprobacion === 'Pendiente').length +
    db.prestamos.filter(p => p.estado === 'Solicitado' && ((p.origen === user.proyecto && !p.aprobOrigen) || (p.destino === user.proyecto && !p.aprobDestino))).length
  ) : 0;
  // Aviso al residente: ítems suyos anulados en los últimos 15 días.
  // La insignia se apaga con el mismo "Enterado" que cierra el aviso de la
  // vista: la clave se arma IGUAL que allí (ver Residente.jsx). Antes eran dos
  // cálculos independientes, así que el panel se iba y el número rojo se
  // quedaba quince días — y quien pulsaba Enterado concluía, con razón, que no
  // había servido de nada.
  const anuladosRes = (user.rol === 'residente' && db)
    ? db.rqs.filter(r => r.proyecto === user.proyecto)
        .flatMap(r => r.items)
        .filter(i => i.decision === 'Anulado' && i.fechaAnulacion && dias(HOY_ISO, i.fechaAnulacion) <= 15)
        .sort((a, b) => (a.fechaAnulacion < b.fechaAnulacion ? 1 : -1))
    : [];
  const anulRecientes = anuladosRes.length && !avisoLeido('anulados:' + anuladosRes.map(i => i.id).join(','))
    ? anuladosRes.length : 0;

  return (
    <div className="bg-slate-950 min-h-screen text-slate-100" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {!ES_PRODUCCION && (
        <div className="bg-fuchsia-700 text-white text-center text-[11px] font-bold uppercase tracking-widest py-1">
          Entorno de {ENTORNO} · estos NO son los datos reales de la empresa
        </div>
      )}
      <div className="bg-black border-b-2 border-yellow-400 px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="font-extrabold text-sm tracking-widest text-yellow-400">
          COPACABANA <span className="text-slate-600 font-medium">/ RQ</span></div>
        <div className="text-slate-400 text-[11px]">{user.nombre}{user.proyecto ? ' · ' + user.proyecto : ''} <span className="text-slate-600">({user.rol})</span></div>
        {/* En Almacén no se muestra: esa vista es de UNA obra y tiene su propio
            selector. Dos controles a la vez, en desacuerdo, confunden. */}
        {!user.proyecto && user.rol === 'gerente' && tab !== 'alm' && (
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded border ${obraGlobal === 'TODOS'
            ? 'border-slate-700 bg-slate-900' : 'border-yellow-400 bg-yellow-950'}`}>
            <span className={`text-[9px] font-bold uppercase tracking-widest ${obraGlobal === 'TODOS' ? 'text-slate-500' : 'text-yellow-400'}`}>
              {obraGlobal === 'TODOS' ? 'Viendo todas las obras' : 'Viendo solo'}</span>
            <FiltroProyecto value={obraGlobal} onChange={setObraGlobal} todos />
          </div>
        )}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="flex gap-0.5 bg-slate-800 p-1 rounded">
            {tabs.map(([k, l]) => {
              const cuenta = k === 'apr' ? pendAprob : k === 'res' ? anulRecientes : 0;
              const rojo = k === 'res' && anulRecientes > 0;   // anulaciones: aviso en rojo
              const alerta = cuenta > 0 && tab !== k;
              return (
              <button key={k} onClick={() => setTab(k)}
                className={`px-3 py-1.5 rounded text-[11px] font-semibold tracking-wide uppercase ${tab === k ? 'bg-yellow-400 text-slate-950' : alerta ? (rojo ? 'text-red-400 ring-1 ring-red-400 bg-red-400/10' : 'text-yellow-400 ring-1 ring-yellow-400 bg-yellow-400/10') : 'text-slate-400 hover:text-slate-200'}`}>
                {l}{cuenta > 0 && <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${rojo ? 'bg-red-500 text-white' : 'bg-yellow-400 text-slate-950'}`}>{cuenta}</span>}</button>
              );
            })}
          </div>
          <button onClick={() => cargarTodo()} title="Traer los últimos datos"
            className="px-2.5 py-1.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700 hover:text-yellow-400 hover:border-yellow-400">⟳ Actualizar</button>
          <button onClick={() => supabase.auth.signOut()} className="px-2.5 py-1.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200">Salir</button>
        </div>
      </div>
      <div className="p-4">
        {tab === 'res' && <Residente user={user} db={db} api={api} obraGlobal={obraGlobal} />}
        {tab === 'com' && <Compras user={user} db={db} api={api} obraGlobal={obraGlobal} />}
        {tab === 'dia' && <ComprasDelDia db={db} api={api} />}
        {tab === 'sto' && <AlmacenResidente user={user} db={db} />}
        {tab === 'his' && <HistorialMateriales user={user} db={db} obraGlobal={obraGlobal} />}
        {tab === 'apr' && <AprobacionesResidente user={user} db={db} api={api} obraGlobal={obraGlobal} />}
        {tab === 'fac' && <Compras user={user} db={db} api={api} modo="facturar" />}
        {tab === 'alm' && <Almacen user={user} db={db} api={api} obraGlobal={obraGlobal} />}
        {tab === 'cat' && <Catalogo user={user} db={db} api={api} />}
        {tab === 'pag' && <Pagos user={user} db={db} api={api} obraGlobal={obraGlobal} />}
        {tab === 'ren' && <Rendiciones user={user} db={db} api={api} obraGlobal={obraGlobal} />}
        {tab === 'aud' && <Auditoria user={user} db={db} api={api} />}
        {tab === 'tab' && <Tablero db={db} user={user} />}
        {tab === 'rep' && user.rol === 'gerente' && <ReporteMensual db={db} />}
      </div>
    </div>
  );
}
