#!/usr/bin/env python3
"""
Baja los trabajos pendientes del servidor y los deja como JSON en
Valoraciones/_pendientes/<orderId>.json

IMPORTANTE: este script habla con internet, asi que corre en el CONTENEDOR,
no en la VM del Mac (esa no tiene salida de red). Por eso acepta rutas
explicitas del .env y de la carpeta de salida.

Uso en el Mac (solo si algun dia hay red ahi):
    python3 herramientas/automatizacion/bajar_pendientes.py

Uso desde el contenedor, con los archivos ya subidos:
    python3 bajar_pendientes.py --env /ruta/.env --salida /ruta/salida

Requiere en el .env:  API_BASE  y  ADMIN_TOKEN
"""
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
PENDIENTES = RAIZ / "Valoraciones" / "_pendientes"


def cargar_env(ruta=None):
    env = {}
    f = Path(ruta) if ruta else (RAIZ / ".env")
    if f.exists():
        for linea in f.read_text(encoding="utf-8").splitlines():
            linea = linea.strip()
            if not linea or linea.startswith("#") or "=" not in linea:
                continue
            k, v = linea.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("API_BASE", "ADMIN_TOKEN"):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--env", default=None, help="Ruta del archivo .env")
    ap.add_argument("--salida", default=None, help="Carpeta donde escribir los JSON")
    args = ap.parse_args()

    destino_dir = Path(args.salida) if args.salida else PENDIENTES
    env = cargar_env(args.env)
    base = (env.get("API_BASE") or "").rstrip("/")
    token = env.get("ADMIN_TOKEN") or ""
    if not base or not token:
        print("ERROR: falta API_BASE o ADMIN_TOKEN en el .env de la raiz", file=sys.stderr)
        return 2

    req = urllib.request.Request(
        base + "/api/pendientes",
        headers={
            "x-admin-token": token,
            "Accept": "application/json",
            # Sin User-Agent propio, algunos CDN bloquean a urllib.
            "User-Agent": "ValoraTuCarroAI/1.0 (+https://vtc.lat)",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            datos = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"ERROR HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:300]}", file=sys.stderr)
        return 1
    except Exception as e:
        # Render free tarda en despertar: no es un fallo real, se reintenta en la siguiente pasada.
        print(f"ERROR de red: {e}", file=sys.stderr)
        return 1

    destino_dir.mkdir(parents=True, exist_ok=True)
    trabajos = datos.get("trabajos", [])
    nuevos = []
    for t in trabajos:
        destino = destino_dir / f"{t['orderId']}.json"
        destino.write_text(json.dumps(t, ensure_ascii=False, indent=2), encoding="utf-8")
        nuevos.append(t["orderId"])

    print(f"Pendientes en el servidor: {len(trabajos)}")
    for t in trabajos:
        v = t.get("vehiculo") or {}
        aviso = f"  · {t['orderId']} — {v.get('modelo', 'sin modelo')} {v.get('version', '')} · {v.get('km', '?')} km ({v.get('ciudad', '?')})"
        if t.get("intentos"):
            aviso += f"  [intento {t['intentos'] + 1}, ultimo error: {t.get('ultimoError')}]"
        print(aviso)
    if not trabajos:
        print("No hay nada que valorar.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
