// ============================================================
// Reglas de pago: cuándo se paga (FORMA) y con qué (MEDIO).
// Movido de App.jsx (etapa 3 de la separación en módulos) con el
// texto idéntico; solo se agregó "export" y este encabezado.
//
// Viajan juntas a propósito: todas hablan de los mismos textos
// ('Crédito 15 días', 'Nota de crédito'…). Separarlas permitiría
// que un día diverjan y el vencimiento dejara de reconocer una
// forma que el selector sí ofrece.
// ============================================================

// La FORMA dice CUANDO se paga; el MEDIO (mas abajo) dice CON QUE. Antes esta
// lista mezclaba los dos ejes -- tenia 'Contado' y 'Transferencia' como si fueran
// alternativas del mismo tipo -- y ademas las dos hacian lo mismo: vencer hoy.
// 'Inmediato' las reemplaza porque no se confunde con "en efectivo": pagar en el
// acto por transferencia tambien es inmediato. Las facturas viejas guardadas como
// 'Contado' o 'Transferencia' siguen venciendo el mismo dia, igual que antes.
export const FORMAS_PAGO = ['Inmediato', 'Crédito 15 días', 'Crédito 30 días'];
export const PLAZOS_CREDITO = FORMAS_PAGO.filter(f => f.startsWith('Crédito'));
export const esCredito = f => (f || '').startsWith('Crédito');

// Vencimiento de una factura: fecha + días de crédito (contado vence el mismo día)
export function vencimientoDe(f) {
  const d = new Date(f.fecha + 'T00:00:00');
  d.setDate(d.getDate() + (f.forma === 'Crédito 15 días' ? 15 : f.forma === 'Crédito 30 días' ? 30 : 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// 'Nota de crédito' no mueve dinero del banco: el proveedor cancela la deuda con
// un documento. Por eso no pide banco (pide la serie de la nota) y queda fuera
// del CSV de conciliación bancaria, donde solo debe ir lo que movió plata.
export const MEDIOS_PAGO = ['Transferencia', 'Cheque', 'Tarjeta', 'Nota de crédito'];
export const ETIQUETA_NRO = { Transferencia: 'N° operación', Cheque: 'N° de cheque', Tarjeta: 'N° de voucher', 'Nota de crédito': 'Serie de la nota' };
export const SIN_BANCO = m => m === 'Nota de crédito';
