// ============================================================
// PDFs: los documentos formales con bloque de firmas.
// Movido de App.jsx (etapa 4 de la separación en módulos) con el
// texto idéntico; solo se agregó "export" y este encabezado.
//
// TRES COSAS QUE PARECEN ERRORES Y NO LO SON — no "corregirlas":
// 1. Los `<\/script>` llevan la barra invertida A PROPÓSITO: sin
//    ella, el navegador cerraría el script del document.write y el
//    documento saldría roto.
// 2. imprimirRQ tiene su propio estilo, casi igual pero NO igual a
//    ESTILO_PDF (firmas a 50px vs 60px, tablas distintas). Es el
//    PDF formal que firma gente en obra: unificarlos lo cambiaría.
// 3. La hoja de conteo NO imprime cantidades a propósito (conteo
//    CIEGO): la comparación la hace gerencia. "Completar" esa
//    tabla destruiría el control.
// ============================================================
import { fmt } from './fechas.js';

// Todo texto que escribio una persona pasa por aqui antes de entrar al HTML de
// un PDF. Sin esto, un "<" en una partida rompe el documento en silencio, y un
// texto con etiquetas se ejecutaria al abrirlo: el PDF se arma pegando cadenas
// dentro de HTML y el navegador no distingue el dato del marcado.
export const escHtml = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function imprimirRQ(r) {
  const colorCanal = r.canal === 'URGENTE' ? '#b91c1c' : r.canal === 'GENERAL' ? '#15803d' : '#a16207';
  // El PDF formal solo lleva los ítems aprobados por Compras
  const aprobados = r.items.filter(i => i.decision === 'Aprobado');
  const filas = aprobados.map((i, idx) => `
    <tr>
      <td class="c">${idx + 1}</td>
      <td class="c mono">${i.cod}</td>
      <td>${escHtml(i.desc)}</td>
      <td class="c">${escHtml(i.und)}</td>
      <td class="c">${i.cant}</td>
      <td class="c">${fmt(i.fecha)}</td>
      <td>${escHtml(i.destino)}</td>
      <td class="c">${escHtml(i.color || '—')}</td>
      <td>${escHtml(i.obs || '—')}</td>
    </tr>`).join('');
  const w = window.open('', '_blank');
  if (!w) { alert('El navegador bloqueó la ventana. Permite ventanas emergentes para descargar el PDF.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>RQ-${String(r.n).padStart(3, '0')} · ${escHtml(r.proyecto)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; padding: 24px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
    .logo { font-size: 16px; font-weight: 800; letter-spacing: 2px; }
    .logo small { display: block; font-size: 9px; font-weight: 400; letter-spacing: 1px; color: #555; }
    .nrq { text-align: right; }
    .nrq b { font-size: 15px; }
    h1 { font-size: 13px; text-align: center; margin: 8px 0; letter-spacing: 1px; }
    .meta { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .meta td { border: 1px solid #999; padding: 4px 6px; }
    .meta .l { background: #f0f0f0; font-weight: 700; width: 16%; font-size: 9px; text-transform: uppercase; }
    .canal { display: inline-block; padding: 2px 10px; border: 2px solid ${colorCanal}; color: ${colorCanal}; font-weight: 800; letter-spacing: 1px; }
    .just { border: 1px solid #999; background: #fffbe6; padding: 6px 8px; margin-bottom: 8px; }
    .just b { font-size: 9px; text-transform: uppercase; }
    table.items { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
    table.items th { background: #111; color: #fff; padding: 5px 4px; font-size: 9px; text-transform: uppercase; }
    table.items td { border: 1px solid #999; padding: 4px; }
    .c { text-align: center; }
    .mono { font-family: 'Courier New', monospace; }
    .firmas { display: flex; gap: 16px; margin-top: 50px; }
    .firma { flex: 1; text-align: center; }
    .firma .linea { border-top: 1px solid #111; padding-top: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
    .firma .campos { font-size: 9px; color: #555; margin-top: 14px; text-align: left; }
    @media print { body { padding: 10mm; } }
  </style></head><body>
  <div class="head">
    <div class="logo">GRUPO COPACABANA<small>CONSTRUCCIÓN E INMOBILIARIA · CUSCO</small></div>
    <div class="nrq"><b>RQ-${String(r.n).padStart(3, '0')}</b><br>Fecha: ${fmt(r.fechaRQ)}<br><span class="canal">${escHtml(r.canal)}</span></div>
  </div>
  <h1>REQUERIMIENTO DE MATERIALES</h1>
  <table class="meta">
    <tr><td class="l">Proyecto</td><td>${escHtml(r.proyecto)}</td><td class="l">Partida</td><td>${escHtml(r.partida)}</td></tr>
    <tr><td class="l">Residente de obra</td><td>${escHtml(r.residente)}</td><td class="l">Adm. de almacén</td><td>${escHtml(r.almacen)}</td></tr>
    <tr><td class="l">Nivel</td><td>${escHtml(r.piso || '—')}</td><td class="l">Ítems aprobados</td><td>${aprobados.length} de ${r.items.length}</td></tr>
  </table>
  ${r.just ? `<div class="just"><b>Motivo (¿por qué no se previó?):</b> ${escHtml(r.just)}</div>` : ''}
  <table class="items">
    <thead><tr><th>Ítem</th><th>Código</th><th>Descripción</th><th>Und</th><th>Cant</th><th>Fecha necesitada</th><th>Destino</th><th>Color</th><th>Obs</th></tr></thead>
    <tbody>${filas}</tbody>
  </table>
  <div class="firmas">
    ${['RESIDENTE DE OBRA', 'V°B° GERENTE DE OPERACIONES', 'RECEPCIÓN EN OBRA', 'ENTREGADO POR'].map(f => `
      <div class="firma"><div class="campos">FECHA:<br><br>NOMBRE:</div><br><br><div class="linea">${f}</div></div>`).join('')}
  </div>
  <script>window.onload = () => { window.print(); };<\/script>
  </body></html>`);
  w.document.close();
}

export const ESTILO_PDF = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; padding: 24px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
  .logo { font-size: 16px; font-weight: 800; letter-spacing: 2px; }
  .logo small { display: block; font-size: 9px; font-weight: 400; letter-spacing: 1px; color: #555; }
  .meta { text-align: right; font-size: 11px; }
  h1 { font-size: 13px; text-align: center; margin: 8px 0 12px; letter-spacing: 1px; }
  table.t { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  table.t th { background: #111; color: #fff; padding: 5px 4px; font-size: 9px; text-transform: uppercase; text-align: left; }
  table.t td { border: 1px solid #999; padding: 4px; }
  .c { text-align: center; } .r { text-align: right; } .mono { font-family: 'Courier New', monospace; }
  .tot td { font-weight: 800; background: #f0f0f0; }
  .nota { border: 1px solid #999; background: #fffbe6; padding: 6px 8px; margin-bottom: 10px; font-size: 10px; }
  .firmas { display: flex; gap: 16px; margin-top: 60px; }
  .firma { flex: 1; text-align: center; }
  .firma .linea { border-top: 1px solid #111; padding-top: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
  .firma .campos { font-size: 9px; color: #555; margin-top: 14px; text-align: left; }
  @media print { body { padding: 10mm; } }
`;

export function abrirPDF(titulo, cuerpo) {
  const w = window.open('', '_blank');
  if (!w) { alert('El navegador bloqueó la ventana. Permite ventanas emergentes para descargar el PDF.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escHtml(titulo)}</title><style>${ESTILO_PDF}</style></head><body>${cuerpo}<script>window.onload = () => { window.print(); };<\/script></body></html>`);
  w.document.close();
}

// Cierre mensual valorizado (documento contable, para gerencia y contabilidad)
export function imprimirCierre({ obra, corte, filas, salidasMes, prestamosActivos }) {
  const totValor = filas.reduce((a, f) => a + (f.valor ?? 0), 0);
  const sinPrecio = filas.filter(f => f.valor == null).length;
  const cuerpo = `
  <div class="head">
    <div class="logo">GRUPO COPACABANA<small>CONSTRUCCIÓN E INMOBILIARIA · CUSCO</small></div>
    <div class="meta"><b>CIERRE DE ALMACÉN</b><br>Obra: ${escHtml(obra)}<br>Fecha de corte: ${fmt(corte)}</div>
  </div>
  <h1>CIERRE MENSUAL DE ALMACÉN — VALORIZADO</h1>
  ${sinPrecio > 0 ? `<div class="nota"><b>${sinPrecio} material(es) sin precio de compra registrado</b> (aparecen como "sin valorizar"): el total es parcial hasta contar con sus precios.</div>` : ''}
  <table class="t">
    <thead><tr><th>Código</th><th>Material</th><th>Und</th><th class="r">Stock</th><th class="r">Precio prom. S/<br><small>(con IGV)</small></th><th class="r">Valor S/</th></tr></thead>
    <tbody>
      ${filas.map(f => `<tr>
        <td class="mono c">${escHtml(f.cod)}</td><td>${escHtml(f.desc)}</td><td class="c">${escHtml(f.und)}</td>
        <td class="r mono">${f.cant}</td>
        <td class="r mono">${f.precio != null ? f.precio.toFixed(2) : '—'}</td>
        <td class="r mono">${f.valor != null ? f.valor.toFixed(2) : 'sin valorizar'}</td>
      </tr>`).join('')}
      <tr class="tot"><td colspan="5" class="r">VALOR TOTAL DEL ALMACÉN (precios con IGV)</td><td class="r mono">S/ ${totValor.toFixed(2)}</td></tr>
    </tbody>
  </table>
  <div class="nota">Movimientos del mes: <b>${salidasMes.n}</b> salida(s) por <b>${salidasMes.cant}</b> unidades · Préstamos activos: <b>${prestamosActivos}</b>. Stock = inicial + recibido − salidas ± préstamos (foto al corte).</div>
  <div class="firmas">
    ${['ALMACENERO', 'V°B° GERENCIA'].map(f => `
      <div class="firma"><div class="campos">FECHA:<br><br>NOMBRE:</div><br><br><div class="linea">${f}</div></div>`).join('')}
  </div>`;
  abrirPDF(`Cierre ${obra} ${corte}`, cuerpo);
}

// Hoja de conteo CIEGO (para el verificador de confianza: sin cantidades)
export function imprimirConteo({ obra, corte, filas }) {
  const cuerpo = `
  <div class="head">
    <div class="logo">GRUPO COPACABANA<small>CONSTRUCCIÓN E INMOBILIARIA · CUSCO</small></div>
    <div class="meta"><b>HOJA DE CONTEO</b><br>Obra: ${escHtml(obra)}<br>Fecha: ${fmt(corte)}</div>
  </div>
  <h1>VERIFICACIÓN FÍSICA DE ALMACÉN — CONTEO CIEGO</h1>
  <div class="nota"><b>Instrucciones:</b> cuente físicamente cada material y anote la cantidad encontrada. Este documento NO muestra las cantidades del sistema a propósito: la comparación la hace gerencia al recibir la hoja firmada. No pida las cantidades al almacenero.</div>
  <table class="t">
    <thead><tr><th>#</th><th>Código</th><th>Material</th><th>Und</th><th class="c" style="width:18%">CANTIDAD CONTADA</th><th style="width:20%">Observaciones</th></tr></thead>
    <tbody>
      ${filas.map((f, i) => `<tr>
        <td class="c">${i + 1}</td><td class="mono c">${escHtml(f.cod)}</td><td>${escHtml(f.desc)}</td><td class="c">${escHtml(f.und)}</td>
        <td style="height:26px"></td><td></td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div class="firmas">
    ${['CONTÓ (VERIFICADOR)', 'ALMACENERO PRESENTE', 'REVISÓ GERENCIA'].map(f => `
      <div class="firma"><div class="campos">FECHA:<br><br>NOMBRE:</div><br><br><div class="linea">${f}</div></div>`).join('')}
  </div>`;
  abrirPDF(`Conteo ${obra} ${corte}`, cuerpo);
}
