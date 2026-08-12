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
  const recibido = ents.reduce((a, e) => a + Number(e.monto), 0);

  return { facturas: fs, gastado, entregas: ents, recibido, debeDevolver: recibido - gastado };
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
