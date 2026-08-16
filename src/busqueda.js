// ============================================================
// Búsqueda del catálogo de materiales.
// Movido de App.jsx (etapa 7 de la separación en módulos) con el
// texto idéntico; solo se agregó "export" y este encabezado.
//
// CONTRATO con la capa de datos (implícito hasta hoy, fijado por
// las pruebas): cada material del catálogo es un arreglo donde
//   m[0] = código de 6 dígitos
//   m[1] = descripción
//   m[3] = familia
// Si la capa de datos cambia ese orden, la búsqueda deja de
// encontrar por familia sin dar ningún error.
// ============================================================

// Búsqueda por palabras: ignora espacios extra y encuentra materiales que
// contengan TODAS las palabras escritas, en cualquier orden.
export function buscarEnCatalogo(catalogo, q, max) {
  const palabras = q.toUpperCase().split(/\s+/).filter(Boolean);
  if (!palabras.length || q.trim().length < 2) return [];
  return catalogo.filter(m => {
    const texto = m[1].toUpperCase() + ' ' + m[0] + ' ' + (m[3] || '').toUpperCase();
    return palabras.every(p => texto.includes(p));
  }).slice(0, max);
}
