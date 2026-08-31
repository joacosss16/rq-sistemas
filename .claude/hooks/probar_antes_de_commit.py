# -*- coding: utf-8 -*-
# ============================================================
# HOOK: las pruebas y la compilación corren antes de cada commit
# (PreToolUse Bash)
#
# Si el comando que va a ejecutarse contiene un `git commit`, primero
# corren `npm test` (las 62 pruebas de la lógica pura) y `npm run build`.
# Si algo falla, el commit se bloquea y el error llega a Claude.
#
# Honestidad sobre el alcance: las dos veces que se rompió producción,
# COMPILABA Y LAS PRUEBAS PASABAN — esto no habría atrapado esos casos.
# Cierra la puerta de al lado: el commit con un import roto, una prueba
# olvidada en rojo, un archivo a medias. La regla que sí atrapó aquellos
# casos sigue siendo abrir la aplicación en el navegador.
#
# Para cualquier comando sin `git commit`, sale al instante sin hacer nada.
# ============================================================
import json
import re
import subprocess
import sys


def main():
    try:
        datos = json.load(sys.stdin)
    except Exception:
        return
    comando = (datos.get('tool_input') or {}).get('command') or ''
    if not re.search(r'\bgit\b[^\n]*?\bcommit\b', comando):
        return

    for etiqueta, orden in (('npm test', 'npm test'),
                            ('npm run build', 'npm run build')):
        r = subprocess.run(orden, shell=True, capture_output=True,
                           text=True, errors='replace', timeout=240)
        if r.returncode != 0:
            cola = ((r.stdout or '') + '\n' + (r.stderr or '')).strip()[-2500:]
            sys.stderr.write(
                'COMMIT BLOQUEADO: `%s` falló (regla de la casa: probar antes de '
                'commitear). Arreglar la causa y volver a intentar — nunca saltarse '
                'la comprobación.\n\n%s\n' % (etiqueta, cola))
            sys.exit(2)


if __name__ == '__main__':
    main()
