# Automatización de Valora tu carro.AI

Estos scripts convierten una venta en un informe entregado. La valoración la
hace la skill del motor; esto es la tubería alrededor.

**Estos archivos viven aquí solo para distribuirse por el repo.** Van copiados a
la **raíz del proyecto del motor** (donde están la plantilla, la base de
comparables y la carpeta `Valoraciones/`), en una carpeta
`herramientas/automatizacion/`. Los scripts calculan las rutas desde ahí.

## Dos máquinas, y no son intercambiables

**El Mac no tiene salida a internet desde la terminal.** Ni DNS ni HTTPS. Por
eso los pasos se reparten:

| Script | Dónde corre | Por qué |
|---|---|---|
| `bajar_pendientes.py` | contenedor | llama a la API de vtc.lat |
| `validar_informe.py` | Mac | solo lee archivos locales |
| `enviar_informe.py` | contenedor | llama a Resend y a la API |

Los dos del contenedor aceptan rutas explícitas (`--env`, `--pdf`, `--excel`,
`--validacion`, `--trabajo`) para trabajar con copias subidas desde el Mac.

**Trampa del User-Agent:** `urllib` se identifica como `Python-urllib/3.x` y el
Cloudflare que protege a Resend lo bloquea con `403 error code: 1010`. El correo
nunca sale y el error no dice por qué. Ya está puesto el User-Agent propio en
los dos scripts; no lo quites.

## Uso

```bash
# 1. Bajar los trabajos pagados (CONTENEDOR)
python3 bajar_pendientes.py --env /ruta/.env --salida /ruta/pendientes

# 2. (aquí corre la skill de valoración con el código asignado)

# 3. Portero de calidad (MAC)
python3 herramientas/automatizacion/validar_informe.py VTC001

# 4. Enviar el PDF y el Excel, y marcar entregado (CONTENEDOR)
python3 enviar_informe.py VCA-XXXX VTC001 --env /ruta/.env \
  --pdf /ruta/Valoracion_VTC001.pdf --excel /ruta/Valoracion_VTC001.xlsx \
  --validacion /ruta/validacion.json --trabajo /ruta/VCA-XXXX.json

# variantes
python3 enviar_informe.py VCA-XXXX VTC001 ... --prueba
python3 enviar_informe.py VCA-XXXX VTC001 --env /ruta/.env --fallo "portal bloqueó"
```

## Qué se le entrega al cliente

**Siempre los dos archivos**: el PDF y el Excel. Si falta el Excel,
`enviar_informe.py` se niega a enviar en vez de mandar media entrega.

## El validador

Reglas específicas de carros, además de las obvias:

- **Un solo código Fasecolda** entre los comparables. En carros la versión pesa
  más que el modelo: mezclar versiones daña la valoración.
- **Banda de kilometraje**: los comparables deben caer dentro de ±40% del km del
  vehículo valorado.
- **Desviación contra Fasecolda**: si el valor estimado se aleja más de ±35% del
  valor de referencia, casi siempre es un comparable malo, no un hallazgo.
- **"Por definir" en una cifra del PDF** bloquea el envío. Es el bug de orden de
  recálculo: el cliente recibiría el informe sin el número que compró.

**LOS UMBRALES NO ESTÁN CALIBRADOS.** Están arriba del archivo
`validar_informe.py`. Correr el validador contra dos o tres informes ya
entregados y ajustarlos antes de confiar en él. En la web de inmuebles el primer
umbral del PDF rechazaba el 100% de los informes buenos.

## Modo prueba

Copiar `MODO_PRUEBA.ejemplo` como `Valoraciones/_pendientes/MODO_PRUEBA` en el
proyecto del motor. Mientras exista, los informes van al correo interno en vez
de al cliente y las órdenes no se marcan entregadas. Borrarlo después de cinco o
seis informes automáticos revisados.
