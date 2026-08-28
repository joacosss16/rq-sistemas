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

// ── RUC: 11 dígitos NO alcanza ──────────────────────────────────
//
// La validación de "exactamente 11 dígitos" atrapa que falte o sobre un
// número, pero NO atrapa el error que de verdad ocurre: el dedazo. Si el RUC
// es 20100047218 y se teclea 20100047219, son 11 dígitos y pasa — y el sistema
// da de alta un proveedor fantasma con ese RUC, al que después se le emiten
// facturas que Contabilidad no puede cruzar con nada.
//
// El RUC peruano lleva dígito verificador: el último número sale de los otros
// diez por módulo 11. Si uno está mal, la cuenta no cuadra. Y los dos primeros
// dígitos dicen qué tipo de contribuyente es: 10 y 15 persona natural, 17
// sucesión indivisa, 20 persona jurídica. Cualquier otro par no existe.
//
// Comprobado contra el RUC real que ya está en la base (20138651917,
// SANICENTER): la cuenta da 7, que es su último dígito.
export const TIPOS_RUC = ['10', '15', '17', '20'];

export function rucValido(ruc) {
  const r = String(ruc || '').trim();
  if (!/^\d{11}$/.test(r)) return { ok: false, motivo: 'El RUC tiene que ser de 11 dígitos, ni uno más ni uno menos.' };
  if (!TIPOS_RUC.includes(r.slice(0, 2))) {
    return { ok: false, motivo: `Un RUC empieza por 10, 15, 17 o 20 (este empieza por ${r.slice(0, 2)}).` };
  }
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((a, p, i) => a + Number(r[i]) * p, 0);
  const resto = 11 - (suma % 11);
  const dv = resto === 10 ? 0 : resto === 11 ? 1 : resto;
  if (dv !== Number(r[10])) {
    return { ok: false, motivo: 'Ese RUC no existe: el último dígito no corresponde. Revisa si hay un número cambiado.' };
  }
  return { ok: true, motivo: '' };
}
