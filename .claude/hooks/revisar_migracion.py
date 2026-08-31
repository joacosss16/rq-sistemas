# -*- coding: utf-8 -*-
# ============================================================
# HOOK: revisar una migración recién escrita (PostToolUse Write|Edit)
#
# Automatiza las dos reglas de la casa que un hook SÍ puede comprobar:
#
# 1) "Comprobar el nombre real de la función que se reemplaza — y cuál es
#    su definición VIVA." Cada `create or replace function` del archivo se
#    busca en TODAS las demás migraciones y se le dice a Claude en qué
#    archivos ya se define, señalando el último como la versión viva.
#    El 28 de agosto la migración 72 se reescribió desde la versión 38
#    cuando ya la habían mejorado la 45, la 46 y la 48: se perdieron tres
#    guardas y la tarde costó 20 hallazgos. Esto es lo que ese día nadie
#    comprobó.
#
# 2) "Cada migración se ataca antes de correrla." Un hook no puede juzgar
#    el ataque, pero sí exigir su rastro: el bloque de comprobación al
#    pie (`-- Comprobación tras correrla`), que llevan todas las
#    migraciones buenas. Si falta, se bloquea con el motivo para que
#    Claude lo añada.
#
# No toca nada: lee el archivo ya escrito y devuelve contexto o un
# bloqueo. Sale en silencio para todo lo que no sea supabase/migrations/.
# ============================================================
import json
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
import unicodedata
from pathlib import Path


def sin_tildes(s):
    return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode()


def main():
    try:
        datos = json.load(sys.stdin)
    except Exception:
        return
    ruta = (datos.get('tool_input') or {}).get('file_path') or ''
    ruta = ruta.replace('\\', '/')
    if '/supabase/migrations/' not in ruta or not ruta.endswith('.sql'):
        return
    archivo = Path(ruta)
    if not archivo.exists():
        return
    contenido = archivo.read_text(encoding='utf-8', errors='replace')
    avisos = []

    # ── 1) Funciones que ya existen en otras migraciones ─────
    patron_def = re.compile(
        r'create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)',
        re.IGNORECASE)
    funciones = sorted(set(patron_def.findall(contenido)))
    carpeta = archivo.parent
    if funciones:
        otras = sorted(p for p in carpeta.glob('*.sql') if p.name != archivo.name)
        for fn in funciones:
            patron_fn = re.compile(
                r'create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?'
                + re.escape(fn) + r'\s*\(', re.IGNORECASE)
            donde = [p.name for p in otras
                     if patron_fn.search(p.read_text(encoding='utf-8', errors='replace'))]
            if donde:
                avisos.append(
                    'OJO: `%s` ya se define en %d migración(es) anteriores: %s. '
                    'La versión VIVA es la de `%s` — hay que haber partido de ESA, '
                    'no de una anterior. Confirmar línea por línea que nada de la '
                    'versión viva se perdió (regla de la casa; así se rompió la '
                    'migración 72, reparada en la 75).'
                    % (fn, len(donde), ', '.join(donde), donde[-1]))

    # ── 2) El bloque de comprobación al pie ──────────────────
    if 'comprobaci' not in sin_tildes(contenido).lower():
        print(json.dumps({
            'decision': 'block',
            'reason': ('A esta migración le falta el bloque `-- Comprobación tras '
                       'correrla` al pie, con las consultas de antes y después. Todas '
                       'las migraciones de este repo lo llevan: es el rastro de que se '
                       'atacó antes de correrla (regla de la casa). Hay que añadirlo.'
                       + ('\n\n' + '\n'.join(avisos) if avisos else '')),
        }, ensure_ascii=False))
        return

    if avisos:
        print(json.dumps({
            'hookSpecificOutput': {
                'hookEventName': 'PostToolUse',
                'additionalContext': '\n'.join(avisos),
            },
        }, ensure_ascii=False))


if __name__ == '__main__':
    main()
