// ============================================================
// Cuadre del día de caja chica (migración 38).
//
// Vive fuera de App.jsx para poder probarlo: es la aritmética de la
// que depende el arqueo, y de ella sale si una obra tiene un faltante
// de efectivo o no. Un error aquí no se ve en pantalla — se ve como
// una diferencia de caja que nadie sabe explicar.
//
// LA CAJA CHICA NO ES UN FONDO FIJO. El disponible de cada jornada es
// lo que Pagos le entregó al comprador ese día (una o varias veces).
// Al cerrar, el comprador devuelve el vuelto y administración lo
// cuenta al recibirlo.
//
//     debe devolver = Σ entregas del día − Σ gastado del día
//     diferencia    = efectivo contado − debe devolver
// ============================================================

// Día en que se cambió el modelo (migración 38). Las rendiciones ANTERIORES
// se cerraron con el fondo fijo y hay que seguir leyéndolas con ese criterio:
// recalcularlas con el modelo nuevo las dejaría a todas en negativo, con la
// alarma de "falta registrar la entrega" encendida en cada fila del histórico.
// Y una alarma que salta siempre enseña a ignorar las alarmas.
export const MODELO_ENTREGAS_DESDE = '2026-08-12';

export function esHistorica(rendicion) {
  return rendicion.fecha < MODELO_ENTREGAS_DESDE;
}

export function cuadreCaja(rendicion, facturas, entregas) {
  // Una factura anulada NO es gasto: o el dinero volvió a la caja, o la
  // compra se registra de nuevo bien y entonces sí cuenta. Contándola,
  // el arqueo mostraba un sobrante fantasma igual al monto anulado.
  const fs = (facturas || []).filter(f => f.rendicionId === rendicion.id && !f.anulMotivo);
  const gastado = fs.reduce((a, f) => a + Number(f.monto), 0);

  // Las entregas se atan por obra y día, no por id de rendición: pueden
  // registrarse antes de que exista la rendición (que nace con la
  // primera factura en efectivo de la jornada).
  const ents = (entregas || [])
    .filter(e => e.proyecto === rendicion.proyecto && e.fecha === rendicion.fecha && !e.anulMotivo)
    .sort((a, b) => a.n - b.n);

  // Una rendición anterior al cambio de modelo se lee con su fondo fijo
  // guardado: es como se cerró y como la firmó quien la aprobó.
  const historica = esHistorica(rendicion) && ents.length === 0;
  const recibido = historica ? Number(rendicion.montoFondo || 0)
                             : ents.reduce((a, e) => a + Number(e.monto), 0);

  return {
    facturas: fs, gastado, entregas: ents, recibido,
    debeDevolver: recibido - gastado,
    historica,
    // Solo es un problema si el día es del modelo nuevo y nadie registró
    // la entrega. En el histórico no falta nada: nunca hubo entregas.
    faltaEntrega: !historica && ents.length === 0,
  };
}

// Diferencia del arqueo. Positiva = sobra efectivo, negativa = falta.
// `contado` es lo que administración cuenta al recibir el vuelto.
export function diferenciaArqueo(contado, debeDevolver) {
  return Number(contado) - Number(debeDevolver);
}

// ¿Escala a gerencia? Solo si supera la tolerancia de esa obra.
export function excedeTolerancia(diferencia, tolerancia) {
  return Math.abs(diferencia) > Number(tolerancia);
}
