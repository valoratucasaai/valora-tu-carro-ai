# Valora tu carro.AI

Landing + backend de pagos con **Bold** para el servicio de valoración de vehículos.
Es el mismo motor que ya corre en Valora tu casa.AI, con la ficha adaptada a carros y un solo producto: **informe por $30.000**.

- **Frontend**: las dos páginas del diseño (español e inglés) tal cual quedaron, servidas como estáticos. Fuentes y scripts van dentro del proyecto, no dependen de ningún CDN salvo la librería de Bold.
- **Backend**: Node + Express. Crea las órdenes, firma el hash de integridad de Bold, recibe el webhook y consulta el estado real de cada pago.
- **Datos**: archivos JSON en `data/`. Suficiente para el lanzamiento; se cambia por Postgres tocando solo `src/store.js`.

---

## Mapa del proyecto

```
sitio/
├── server.js                  API + estáticos
├── src/planes.js              EL PRECIO ($30.000). Fuente de verdad.
├── src/bold.js                firma, webhook y consulta de estado (igual que en casas)
├── src/store.js               persistencia en JSON
├── public/index.html          landing en español
├── public/en/index.html       landing en inglés
├── public/checkout/index.html ficha del carro + datos + pago con Bold
├── public/pago/index.html     a dónde vuelve el cliente después de pagar
├── public/assets/             fuentes, imagen y runtime del diseño (con hash en el nombre)
├── render.yaml · Dockerfile   despliegue
└── .env.example               las variables que hay que llenar
```

**Flujo del cliente**: landing → llena la ficha del carro en la sección *Pedir* → botón "O pagar $30.000 y enviarlo" → `/checkout/` con los datos ya prellenados → paga con Bold → vuelve a `/pago/`, que le pregunta a Bold cómo quedó realmente la transacción.
Si la librería de Bold no carga (adblocker, mala red), el cliente siempre tiene el botón de WhatsApp.

---

## Paso a paso para subirlo

### Paso 1 — Las llaves de Bold
Son **las mismas** de Valora tu casa.AI. Las encuentras en el panel de Bold → **Integraciones → Llaves de integración**, o copiadas del `.env` del otro proyecto.

- Llave de identidad → `BOLD_IDENTITY_KEY` (pública, viaja al navegador).
- Llave secreta → `BOLD_SECRET_KEY` (**nunca** va al frontend ni a GitHub).

### Paso 2 — Probarlo en tu computador
```bash
cd "Valora tu Carro AI/Web/sitio"
cp .env.example .env      # y llena las llaves
npm install
npm start
```
Abre `http://localhost:3000`. Revisa `http://localhost:3000/api/health`: debe decir `"boldConfigurado": true`.

### Paso 3 — Subirlo a GitHub (repo NUEVO, no el de casas)
```bash
cd "Valora tu Carro AI/Web/sitio"
git init
git add .
git commit -m "Landing y backend de Valora tu carro.AI con pagos Bold"
git branch -M main
git remote add origin https://github.com/valoratucasaai/valora-tu-carro.git
git push -u origin main
```
Antes de hacer push, corre `git status` y confirma que **`.env` NO aparece**.

### Paso 4 — Desplegar en Render
Necesita un servidor Node: GitHub Pages o Netlify a secas no sirven, porque la firma se calcula en el servidor.

1. render.com → **New → Web Service** → conecta el repo nuevo.
2. Build Command `npm install` · Start Command `npm start`.
3. En **Environment** carga las variables del Paso 5.
4. En **Disks** monta un disco en `/var/data` y pon `DATA_DIR=/var/data`. Si no, pierdes las órdenes en cada despliegue.
5. Deploy. Render te da una URL tipo `https://valora-tu-carro-ai.onrender.com`.

### Paso 5 — Variables de entorno

| Variable | Qué va |
|---|---|
| `BOLD_IDENTITY_KEY` | Llave de identidad de Bold |
| `BOLD_SECRET_KEY` | Llave secreta de Bold |
| `BOLD_WEBHOOK_SECRET` | Llave secreta del webhook (si la dejas vacía se usa la secreta) |
| `PUBLIC_URL` | La URL pública real, sin barra final. Ej: `https://vtc.lat` |
| `ADMIN_TOKEN` | Un token largo que te inventas, para ver tus órdenes |
| `DATA_DIR` | `/var/data` en Render; `./data` en local |

`PUBLIC_URL` importa: de ahí sale la URL a la que Bold devuelve al cliente después de pagar.

### Paso 6 — Registrar el webhook en Bold
En el panel de Bold, apunta el webhook a:

```
https://TU-DOMINIO/api/webhooks/bold
```

Bold te muestra una llave secreta del webhook → va en `BOLD_WEBHOOK_SECRET`. Es un webhook **distinto** al de casas: cada sitio tiene el suyo, aunque la cuenta de Bold sea la misma.

### Paso 7 — El dominio
En tu proveedor de dominio, apunta el dominio de carros a Render (Render → Settings → Custom Domain te da el CNAME). Después actualiza `PUBLIC_URL` con el dominio final y vuelve a desplegar.

### Paso 8 — Prueba real
1. Entra a la landing, llena la ficha, dale a "O pagar $30.000 y enviarlo".
2. Paga con una tarjeta de prueba de Bold (o $30.000 reales y luego anulas).
3. Debe devolverte a `/pago/` diciendo **Pago aprobado**.
4. Revisa tus órdenes:
```bash
curl -H "x-admin-token: TU_ADMIN_TOKEN" https://TU-DOMINIO/api/admin/orders
```

---

## Cambiar el precio
Está en **dos** sitios y tienen que coincidir:

1. `src/planes.js` → `precio: 30000` (esto es lo que se cobra de verdad).
2. `public/checkout/index.html` → `var PRECIO = 30000;` (lo que ve el cliente).

Y los textos "$30.000" que aparecen escritos en `public/index.html` y `public/en/index.html`.

## Cambiar el número de WhatsApp
Está en `public/checkout/index.html` (`WA_NUMBER`), en `public/pago/index.html` (`WA`) y dentro del script del diseño en `public/index.html` y `public/en/index.html` (busca `wa.me/`).

## Sobre las dos landings
`public/index.html` y `public/en/index.html` salieron del diseño y se renderizan con un runtime propio (React + el runtime del diseño, todo servido desde `public/assets/`). Si más adelante rehacen el diseño, se reemplazan esos dos archivos y ya: el backend, el checkout y la página de pago no cambian.

## API
| Ruta | Para qué |
|---|---|
| `POST /api/leads` | Guarda la ficha del carro antes de pagar |
| `POST /api/checkout` | Crea la orden y firma el hash de Bold |
| `POST /api/webhooks/bold` | Recibe los eventos de Bold |
| `GET /api/orders/:id/status` | Estado real de la orden, consultado a Bold |
| `GET /api/admin/orders` | Tus órdenes y fichas (requiere `x-admin-token`) |
| `GET /api/health` | Diagnóstico |
