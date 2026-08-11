import { createClient } from '@supabase/supabase-js';

// La anon key es pública por diseño: la seguridad real la da RLS en la base.
//
// SIN VALOR POR DEFECTO A PROPÓSITO. Antes, la URL de PRODUCCIÓN estaba
// escrita aquí como respaldo, así que `npm run dev` y cada vista previa de
// Vercel escribían sobre los datos reales sin que nadie lo notara. Ahora hay
// que decir explícitamente a qué base se conecta cada entorno.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Falta configurar a qué base de datos conectarse.\n' +
    'Crea un archivo .env.local con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY ' +
    '(copia .env.example). En Vercel se configuran en Settings → Environment Variables.'
  );
}

// Nombre del entorno, solo para que la app pueda avisar en pantalla cuando
// NO se está trabajando contra producción. Si no se define, se asume pruebas:
// es preferible una etiqueta de más en producción que trabajar sobre datos
// reales creyendo que son de prueba.
export const ENTORNO = import.meta.env.VITE_ENTORNO || 'pruebas';
export const ES_PRODUCCION = ENTORNO === 'produccion';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
