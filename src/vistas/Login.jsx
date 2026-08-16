// ============================================================
// Login. Movido de App.jsx (etapa 8 de la separación en módulos)
// con el texto idéntico; solo se agregó "export" y este encabezado.
// ============================================================
import { useState } from 'react';
import { supabase, ENTORNO, ES_PRODUCCION } from '../supabaseClient';
import { inputCls, lblCls } from '../ui';

export function Login() {
  const [email, setEmail] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [cargando, setCargando] = useState(false);
  const entrar = async () => {
    if (!email.trim() || !p) return;
    setCargando(true); setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: p });
    setCargando(false);
    if (error) setErr(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-md p-6">
        <div className="text-center mb-5">
          <div className="font-extrabold text-lg tracking-widest text-yellow-400">COPACABANA <span className="text-slate-600 font-medium">/ RQ</span></div>
          <div className="text-slate-500 text-[11px] mt-1">Sistema de requerimientos de materiales</div>
          {!ES_PRODUCCION && (
            <div className="mt-2 px-2 py-1 rounded bg-fuchsia-700 text-white text-[10px] font-bold uppercase tracking-wider">
              Entorno de {ENTORNO}</div>
          )}
        </div>
        <label className={lblCls}>Correo</label>
        <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErr(''); }}
          placeholder="usuario@correo.com" className={`w-full ${inputCls} mb-3`} />
        <label className={lblCls}>Contraseña</label>
        <input type="password" value={p} onChange={e => { setP(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && entrar()}
          placeholder="••••••••" className={`w-full ${inputCls} mb-3`} />
        {err && <div className="text-red-400 text-[11px] mb-2">{err}</div>}
        <button onClick={entrar} disabled={cargando}
          className="w-full px-4 py-2.5 rounded text-xs font-bold tracking-wider uppercase bg-yellow-400 text-slate-950 hover:bg-yellow-300 disabled:opacity-50">
          {cargando ? 'Ingresando…' : 'Ingresar'}</button>
        <div className="text-slate-600 text-[10px] mt-4 text-center">Acceso con las cuentas creadas por administración.</div>
      </div>
    </div>
  );
}
