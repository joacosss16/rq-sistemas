// ============================================================
// UI compartida: colores, clases y widgets que usan varias vistas.
// Movido de App.jsx (etapa 6 de la separación en módulos) con el
// texto idéntico; solo se agregó "export" y este encabezado.
//
// DOS TRAMPAS DOCUMENTADAS — no reordenar por prolijidad:
// 1. pendCls se fabrica buscando el texto exacto border-slate-700
//    dentro de inputCls. Si alguien reordena las clases de inputCls,
//    la búsqueda no encuentra nada y el amarillo de campo obligatorio
//    desaparece en Residente, Compras y Pagos — sin ningún error.
//    Por eso viajan pegadas, en este mismo archivo.
// 2. AlertaCerrable guarda los Enterado en el navegador con claves
//    armadas con el CONTENIDO del aviso. Cambiar cómo se arma una
//    clave reabriría avisos ya leídos por todo el equipo.
// ============================================================
import { useState, useEffect } from 'react';
import { PROYECTOS } from './maestros';

export const canalClases = {
  URGENTE: 'bg-red-950 text-red-400 border-red-800',
  GENERAL: 'bg-green-950 text-green-400 border-green-800',
  ANTICIPADO: 'bg-yellow-950 text-yellow-400 border-yellow-800',
};

export const pillEstado = e =>
  e === 'Pendiente' || e === 'Solicitado' ? 'bg-yellow-950 text-yellow-400'
  : e === 'Aprobado' ? 'bg-green-950 text-green-400'
  : e === 'Comprado' ? 'bg-sky-950 text-sky-400'
  : e === 'Entregado' ? 'bg-blue-950 text-blue-400'
  : e === 'Incompleto' ? 'bg-orange-950 text-orange-400'
  : e === 'Rechazado' ? 'bg-red-950 text-red-400'
  : e === 'Anulado' ? 'bg-slate-800 text-red-300 line-through'
  : e === 'Prestado' ? 'bg-purple-950 text-purple-400'
  : e === 'Devuelto' ? 'bg-green-950 text-green-400'
  : e === 'Transferido' ? 'bg-sky-950 text-sky-400'
  : e === 'Pagado' || e === 'Pagada' ? 'bg-green-950 text-green-400'
  : e === 'Crédito' ? 'bg-sky-950 text-sky-400'
  : e === 'Falta' ? 'bg-red-950 text-red-400'
  : 'bg-slate-800 text-slate-500';

export const inputCls = "bg-slate-950 border border-slate-700 text-slate-100 px-2 py-1.5 rounded text-xs outline-none focus:border-yellow-400";
export const lblCls = "block text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-1";
export const thCls = "text-left text-[9px] font-bold tracking-widest text-slate-500 uppercase py-2 px-1.5 border-b border-slate-700 whitespace-nowrap";
export const btnOk = ok => `px-3 py-1.5 rounded text-[9px] font-bold uppercase whitespace-nowrap ${ok ? 'bg-yellow-400 text-slate-950 hover:bg-yellow-300' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`;
export const btnRojo = "px-2 py-1 rounded text-[9px] font-bold uppercase bg-red-950 text-red-400 border border-red-800 hover:bg-red-900";
export const btnVerde = "px-2 py-1 rounded text-[9px] font-bold uppercase bg-green-950 text-green-400 border border-green-800 hover:bg-green-900";

export function Aviso({ msg }) {
  if (!msg) return null;
  const esError = msg.startsWith('⚠');
  return (
    <div className={`px-3 py-2 rounded text-xs mb-3 border ${esError ? 'bg-red-950 border-red-800 text-red-400' : 'bg-green-950 border-green-800 text-green-400'}`}>
      {esError ? msg : '✓ ' + msg}
    </div>
  );
}

export function AnularBox({ label = 'Anular', onConfirm }) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState('');
  if (!open) return <button onClick={() => setOpen(true)} className="text-[9px] text-slate-500 hover:text-red-400 underline underline-offset-2">{label}</button>;
  return (
    <div className="w-44 mt-1">
      <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo de anulación (obligatorio)" className={`w-full ${inputCls}`} />
      <div className="flex gap-1 mt-1">
        <button onClick={() => { if (motivo.trim()) { onConfirm(motivo.trim()); setOpen(false); setMotivo(''); } }}
          disabled={!motivo.trim()}
          className={`flex-1 px-2 py-1 rounded text-[9px] font-bold uppercase ${motivo.trim() ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>Confirmar</button>
        <button onClick={() => setOpen(false)} className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-400">✕</button>
      </div>
    </div>
  );
}

// Aviso persistente que la persona puede dar por leído.
//
// No desaparece del todo: se colapsa a una línea que se puede volver a abrir,
// porque la situación que lo provoca sigue ahí. Un aviso que se borra del todo
// deja a alguien sin saber por qué el sistema no le deja hacer algo.
//
// La clave incluye el CONTENIDO: si mañana aparece un caso nuevo (otro ítem
// anulado, otra obra bloqueada), el aviso se vuelve a abrir solo. Dar por
// leído significa "ya vi esto", no "no me avises nunca más".
// `desaparece`: para avisos INFORMATIVOS, que una vez vistos ya no hacen falta —
// lo anulado se sigue viendo en su sitio. Sin esa marca, el aviso se colapsa a una
// línea que se puede reabrir, que es lo correcto cuando la situación sigue activa
// y explica por qué el sistema no deja hacer algo (la caja bloqueada, por ejemplo):
// ahí borrarlo del todo dejaría a la persona sin saber qué pasa.
export function AlertaCerrable({ id, tono = 'rojo', resumen, desaparece = false, children }) {
  const clave = 'rq:aviso:' + id;
  const leido = () => { try { return localStorage.getItem(clave) === '1'; } catch { return false; } };
  const [cerrada, setCerrada] = useState(leido);
  useEffect(() => { setCerrada(leido()); }, [clave]);   // clave nueva = situación nueva
  const cls = tono === 'naranja'
    ? 'bg-orange-950 border-orange-800 text-orange-400'
    : 'bg-red-950 border-red-800 text-red-400';

  if (cerrada) return desaparece ? null : (
    <button onClick={() => { try { localStorage.removeItem(clave); } catch { /* sin almacenamiento */ } setCerrada(false); }}
      className={`w-full text-left px-3 py-1.5 rounded border mb-3 text-[10px] font-bold uppercase opacity-60 hover:opacity-100 ${cls}`}>
      {resumen} · ver de nuevo
    </button>
  );

  return (
    <div className={`rounded-md border p-4 mb-3 ${cls}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">{children}</div>
        <button onClick={() => { try { localStorage.setItem(clave, '1'); } catch { /* sin almacenamiento */ } setCerrada(true); }}
          className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-300 hover:bg-slate-700 whitespace-nowrap shrink-0">
          Enterado
        </button>
      </div>
    </div>
  );
}

export function FiltroProyecto({ value, onChange, todos, excluir }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
      {todos && <option value="TODOS">Todos los proyectos</option>}
      {PROYECTOS.filter(([c, p]) => p !== excluir).map(([c, p]) => <option key={c} value={p}>{c} · {p}</option>)}
    </select>
  );
}

export function FechaInput({ value, onChange, className, min, max, disabled, inputRef, onKeyDown }) {
  return (
    <input type="date" value={value} onChange={onChange} min={min} max={max} disabled={disabled}
      ref={inputRef} onKeyDown={onKeyDown}
      onClick={e => { try { e.target.showPicker(); } catch (_) {} }}
      className={`${className} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`} />
  );
}

// Estilo de campo obligatorio pendiente: amarillo hasta que se llena
export const pendCls = ok => ok ? inputCls : `${inputCls.replace('border-slate-700', 'border-yellow-400')} bg-yellow-950`;
