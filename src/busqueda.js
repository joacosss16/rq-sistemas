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

// La misma regla del catálogo, suelta, para filtrar cualquier tabla: TODAS las
// palabras escritas, en cualquier orden, sin distinguir mayúsculas ni acentos
// de más. Vive aquí y no en cada vista para que buscar signifique lo mismo en
// todo el sistema — si el catálogo encuentra "cemento tipo" y la tabla de stock
// no, quien busca deja de fiarse del buscador.
//
// Con la búsqueda vacía devuelve true: filtrar por nada es no filtrar.
export function coincide(texto, q) {
  const palabras = (q || '').toUpperCase().split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const t = String(texto || '').toUpperCase();
  return palabras.every(p => t.includes(p));
}

// Búsqueda por palabras: ignora espacios extra y encuentra materiales que
// contengan TODAS las palabras escritas, en cualquier orden.
export function buscarEnCatalogo(catalogo, q, max) {
  const palabras = q.toUpperCase().split(/\s+/).filter(Boolean);
  if (!palabras.length || q.trim().length < 2) return [];
  // Se sigue buscando en la familia y en el código —encontrar "todo lo de
  // cerámica" es útil— pero PRIMERO va lo que coincide en el NOMBRE.
  //
  // Sin este orden, buscar "ACERO" devolvía de primera una ABRAZADERA: la
  // palabra estaba en el nombre de su familia, no en el material. El resultado
  // era correcto y aun así parecía roto, que es la peor clase de resultado —
  // quien busca desconfía del buscador y vuelve a pedir por WhatsApp.
  const conPuntaje = [];
  catalogo.forEach(m => {
    const desc = m[1].toUpperCase();
    const texto = desc + ' ' + m[0] + ' ' + (m[3] || '').toUpperCase();
    if (!palabras.every(p => texto.includes(p))) return;
    // 0 = todas las palabras están en el nombre · 1 = alguna vino de la
    // familia o del código. Dentro de cada grupo se conserva el orden del
    // catálogo, que es por código.
    conPuntaje.push([palabras.every(p => desc.includes(p)) ? 0 : 1, m]);
  });
  return conPuntaje.sort((a, b) => a[0] - b[0]).map(x => x[1]).slice(0, max);
}
