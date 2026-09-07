#!/usr/bin/env python3
"""
Envia el informe al cliente por correo (Resend) con el PDF adjunto y avisa al
servidor que la orden quedo entregada.

Uso:
  python3 herramientas/automatizacion/enviar_informe.py <ORDER_ID> <CODIGO>
  python3 herramientas/automatizacion/enviar_informe.py <ORDER_ID> <CODIGO> --fallo "motivo"
  python3 herramientas/automatizacion/enviar_informe.py <ORDER_ID> <CODIGO> --prueba

--prueba manda el correo a CORREO_INTERNO en vez de al cliente. Uselo para los
primeros informes, hasta confiar en el pipeline.

IMPORTANTE: este script habla con internet (Resend y tu API), asi que corre en
el CONTENEDOR, no en la VM del Mac. Por eso acepta rutas explicitas de los tres
archivos que necesita, para poder trabajar con copias subidas:

    python3 enviar_informe.py VTC-XXXX VTI006 \
        --env /ruta/.env --pdf /ruta/Valoracion_VTI006.pdf \
        --validacion /ruta/validacion.json --trabajo /ruta/VTC-XXXX.json

Necesita en el .env: API_BASE, ADMIN_TOKEN, RESEND_API_KEY, CORREO_REMITENTE,
CORREO_INTERNO.
"""
import argparse
import base64
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from bajar_pendientes import cargar_env  # noqa: E402


def post_json(url, payload, headers, timeout=60):
    datos = json.dumps(payload).encode("utf-8")
    # El User-Agent por defecto de urllib ("Python-urllib/3.x") lo bloquea el
    # Cloudflare que protege a Resend, con un 403 "error code: 1010".
    h = {
        "Content-Type": "application/json",
        "User-Agent": "ValoraTuCarroAI/1.0 (+https://vtc.lat)",
        "Accept": "application/json",
    }
    h.update(headers)
    req = urllib.request.Request(url, data=datos, headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8") or "{}")


def avisar_servidor(env, order_id, ok, codigo=None, valor=None, error=None):
    base = (env.get("API_BASE") or "").rstrip("/")
    try:
        post_json(
            base + "/api/entregar",
            {"orderId": order_id, "ok": ok, "codigo": codigo,
             "valorEstimado": valor, "error": error, "canal": "correo"},
            {"x-admin-token": env.get("ADMIN_TOKEN", "")},
        )
        print(f"  servidor avisado: {'entregada' if ok else 'con error'}")
    except Exception as e:
        print(f"  AVISO: no se pudo avisar al servidor ({e}). Se reintenta en la siguiente pasada.")


def cuerpo_html(nombre, codigo, valor, rango):
    def cop(n):
        try:
            return "$ " + f"{int(float(n)):,}".replace(",", ".")
        except Exception:
            return "—"

    return f"""<!doctype html><html><body style="margin:0;background:#f6f6f4;padding:32px 16px;
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#141414">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:36px 32px">
  <p style="margin:0 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8a8a85">
    Valora tu carro.AI</p>
  <h1 style="margin:0 0 18px;font-size:24px;line-height:1.25">Tu valoración está lista</h1>
  <p style="margin:0 0 16px;font-size:15px;line-height:1.6">Hola {nombre}, aquí tienes el análisis
     comparativo de mercado de tu vehículo. Adjuntamos dos archivos: el <strong>informe en PDF</strong>
     para leer y compartir, y el <strong>Excel</strong> con los comparables y todos los cálculos por si
     quieres revisar el detalle o ajustar supuestos.</p>
  <div style="border:1px solid #e6e6e1;border-radius:10px;padding:20px;margin:24px 0">
    <p style="margin:0 0 4px;font-size:12px;color:#8a8a85;letter-spacing:.06em">VALOR COMERCIAL ESTIMADO</p>
    <p style="margin:0 0 14px;font-size:28px;font-weight:600">{cop(valor)}</p>
    <p style="margin:0;font-size:13px;color:#5a5a55">Rango recomendado de negociación:
       <strong>{cop(rango[0])}</strong> a <strong>{cop(rango[2])}</strong></p>
  </div>
  <p style="margin:0 0 16px;font-size:15px;line-height:1.6">Dentro encuentras los comparables que se
     usaron, los ajustes aplicados y la lógica detrás del número. Si algo no te cuadra o quieres que
     revisemos un supuesto, respóndenos este correo.</p>
  <p style="margin:24px 0 0;font-size:13px;color:#8a8a85">Informe {codigo} · Valora tu carro.AI</p>
</div></body></html>"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("order_id")
    ap.add_argument("codigo")
    ap.add_argument("--fallo", default=None, help="Reporta un fallo en vez de enviar")
    ap.add_argument("--prueba", action="store_true", help="Manda el correo al interno, no al cliente")
    ap.add_argument("--env", default=None, help="Ruta del archivo .env")
    ap.add_argument("--pdf", default=None, help="Ruta del PDF del informe")
    ap.add_argument("--excel", default=None, help="Ruta del Excel de la valoracion")
    ap.add_argument("--validacion", default=None, help="Ruta de validacion.json")
    ap.add_argument("--trabajo", default=None, help="Ruta del JSON del trabajo")
    args = ap.parse_args()

    env = cargar_env(args.env)
    faltan = [k for k in ("API_BASE", "ADMIN_TOKEN") if not env.get(k)]
    if faltan:
        print("ERROR: falta en el .env: " + ", ".join(faltan), file=sys.stderr)
        return 2

    if args.fallo:
        avisar_servidor(env, args.order_id, False, error=args.fallo)
        print(f"Fallo registrado para {args.order_id}: {args.fallo}")
        return 0

    carpeta = RAIZ / "Valoraciones" / args.codigo
    pdf = Path(args.pdf) if args.pdf else carpeta / f"Valoracion_{args.codigo}.pdf"
    excel = Path(args.excel) if args.excel else carpeta / f"Valoracion_{args.codigo}.xlsx"
    validacion = Path(args.validacion) if args.validacion else carpeta / "validacion.json"

    if not pdf.exists():
        print(f"ERROR: no existe {pdf}", file=sys.stderr)
        return 1
    if not excel.exists():
        print(f"ERROR: no existe el Excel {excel}. Se entrega junto con el PDF.", file=sys.stderr)
        return 1
    if not validacion.exists():
        print("ERROR: corre primero validar_informe.py; no hay validacion.json", file=sys.stderr)
        return 1

    v = json.loads(validacion.read_text(encoding="utf-8"))
    if not v.get("ok"):
        print("ERROR: el validador NO aprobo este informe. No se envia.", file=sys.stderr)
        for p in v.get("problemas", []):
            print("  ✗", p, file=sys.stderr)
        return 1

    # Datos del cliente, del JSON que bajo del servidor.
    trabajo_f = Path(args.trabajo) if args.trabajo else RAIZ / "Valoraciones" / "_pendientes" / f"{args.order_id}.json"
    if not trabajo_f.exists():
        trabajo_f = RAIZ / "Valoraciones" / "_procesados" / f"{args.order_id}.json"
    if not trabajo_f.exists():
        print(f"ERROR: no encuentro el trabajo {args.order_id}.json", file=sys.stderr)
        return 1
    trabajo = json.loads(trabajo_f.read_text(encoding="utf-8"))
    cliente = trabajo.get("cliente") or {}

    destino = env.get("CORREO_INTERNO") if args.prueba else cliente.get("email")
    if not destino:
        print("ERROR: no hay correo de destino", file=sys.stderr)
        return 1

    api_key = env.get("RESEND_API_KEY")
    remitente = env.get("CORREO_REMITENTE") or "informes@vtc.lat"
    if not api_key:
        print("ERROR: falta RESEND_API_KEY en el .env", file=sys.stderr)
        return 2

    datos = v.get("datos", {})
    nombre = (cliente.get("fullName") or "").split(" ")[0] or "hola"
    rango = datos.get("rango") or [None, datos.get("valor_estimado"), None]

    payload = {
        "from": f"Valora tu carro.AI <{remitente}>",
        "to": [destino],
        "subject": f"Tu valoración está lista · {trabajo.get('vehiculo', {}).get('modelo', args.codigo)}",
        "html": cuerpo_html(nombre, args.codigo, datos.get("valor_estimado"), rango),
        "attachments": [
            {
                "filename": f"Valoracion_{args.codigo}.pdf",
                "content": base64.b64encode(pdf.read_bytes()).decode("ascii"),
            },
            {
                "filename": f"Valoracion_{args.codigo}.xlsx",
                "content": base64.b64encode(excel.read_bytes()).decode("ascii"),
            },
        ],
    }
    if not args.prueba and env.get("CORREO_INTERNO"):
        payload["bcc"] = [env["CORREO_INTERNO"]]

    peso = pdf.stat().st_size + excel.stat().st_size
    if peso > 30 * 1024 * 1024:
        print(f"ERROR: los adjuntos pesan {peso // 1024 // 1024} MB; Resend no acepta mas de ~40 MB "
              "por correo (y el base64 los infla ~33%).", file=sys.stderr)
        return 1

    try:
        r = post_json("https://api.resend.com/emails", payload,
                      {"Authorization": f"Bearer {api_key}"})
    except urllib.error.HTTPError as e:
        detalle = e.read().decode("utf-8", "replace")[:300]
        print(f"ERROR enviando el correo: {e.code} {detalle}", file=sys.stderr)
        if not args.prueba:
            avisar_servidor(env, args.order_id, False, error=f"Resend {e.code}: {detalle}")
        return 1
    except Exception as e:
        print(f"ERROR enviando el correo: {e}", file=sys.stderr)
        if not args.prueba:
            avisar_servidor(env, args.order_id, False, error=str(e))
        return 1

    print(f"Correo enviado a {destino} (id {r.get('id')})")

    if args.prueba:
        print("  MODO PRUEBA: la orden NO se marca entregada.")
        return 0

    avisar_servidor(env, args.order_id, True, codigo=args.codigo,
                    valor=datos.get("valor_estimado"))

    origen = RAIZ / "Valoraciones" / "_pendientes" / f"{args.order_id}.json"
    if origen.exists():
        procesados = RAIZ / "Valoraciones" / "_procesados"
        procesados.mkdir(parents=True, exist_ok=True)
        origen.replace(procesados / f"{args.order_id}.json")
        print("  trabajo movido a _procesados/")
    else:
        print(f"  RECUERDA mover Valoraciones/_pendientes/{args.order_id}.json a _procesados/ en el Mac.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
