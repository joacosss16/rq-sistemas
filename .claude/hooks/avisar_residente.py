# -*- coding: utf-8 -*-
# ============================================================
# HOOK: la vista del residente no se toca sin avisar (PreToolUse Write|Edit)
#
# Regla del dueño (27 ago 2026): "no tocar la vista del residente sin
# avisarme antes", aunque esté descongelada. Era la única regla de la
# casa que dependía de que Claude se acordara. Este hook la vuelve
# mecánica: cualquier edición de Residente.jsx se convierte en una
# pregunta de permiso — y quien responde esa pregunta ES el dueño,
# así que responder que sí es exactamente el aviso que la regla pide.
#
# Solo Residente.jsx exacto: AlmacenResidente.jsx y
# AprobacionesResidente.jsx no están bajo la regla.
# ============================================================
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")
from pathlib import PurePath


def main():
    try:
        datos = json.load(sys.stdin)
    except Exception:
        return
    ruta = (datos.get('tool_input') or {}).get('file_path') or ''
    if PurePath(ruta.replace('\\', '/')).name != 'Residente.jsx':
        return
    print(json.dumps({
        'hookSpecificOutput': {
            'hookEventName': 'PreToolUse',
            'permissionDecision': 'ask',
            'permissionDecisionReason': (
                'Regla del dueño (27 ago): la vista del residente no se toca sin '
                'avisarle antes. Aprobar esto ES el aviso — aprueba solo si estás '
                'de acuerdo con que se modifique Residente.jsx ahora.'),
        },
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
