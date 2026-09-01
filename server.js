"use strict";

require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const express = require("express");

const store = require("./src/store");
const { calcularOrden } = require("./src/planes");
const { integritySignature, verifyWebhookSignature, fetchPaymentStatus } = require("./src/bold");

const app = express();
const PORT = process.env.PORT || 3000;

const BOLD_IDENTITY_KEY = process.env.BOLD_IDENTITY_KEY || "";
const BOLD_SECRET_KEY = process.env.BOLD_SECRET_KEY || "";
const BOLD_WEBHOOK_SECRET = process.env.BOLD_WEBHOOK_SECRET || BOLD_SECRET_KEY;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

if (!BOLD_IDENTITY_KEY || !BOLD_SECRET_KEY) {
  console.warn(
    "\n[Valora tu carro.AI] Faltan BOLD_IDENTITY_KEY y/o BOLD_SECRET_KEY.\n" +
    "El sitio arranca, pero /api/checkout devolverá error hasta que las configures en el archivo .env.\n"
  );
}

app.set("trust proxy", 1);
app.disable("x-powered-by");

/* El webhook necesita el cuerpo crudo para validar la firma: se registra antes del json() global. */
app.post(
  "/api/webhooks/bold",
  express.raw({ type: "*/*", limit: "1mb" }),
  (req, res) => {
    const firma = req.get("x-bold-signature");
    const raw = req.body instanceof Buffer ? req.body : Buffer.from(String(req.body || ""));

    if (!verifyWebhookSignature(raw, firma, BOLD_WEBHOOK_SECRET)) {
      console.warn("[webhook] firma inválida");
      return res.status(401).json({ ok: false });
    }

    // Bold espera un 200 en menos de 2 segundos: se responde primero y se procesa después.
    res.status(200).json({ ok: true });

    let evento;
    try { evento = JSON.parse(raw.toString("utf8")); } catch (e) { return; }

    const tipo = evento && evento.type;
    const datos = (evento && evento.data) || {};
    const orderId =
      datos.metadata && datos.metadata.reference
        ? datos.metadata.reference
        : datos.reference_id || datos.order_id || null;

    console.log("[webhook]", tipo, "orden:", orderId, "tx:", evento && evento.subject);
    if (!orderId) return;

    const orden = store.obtenerOrden(orderId);
    if (!orden) return;

    // Idempotencia: si ya procesamos este evento, no repetimos.
    const vistos = orden.eventosBold || [];
    if (evento.id && vistos.includes(evento.id)) return;

    const mapa = {
      SALE_APPROVED: "APPROVED",
      SALE_REJECTED: "REJECTED",
      VOID_APPROVED: "VOIDED",
      VOID_REJECTED: orden.estado
    };

    store.actualizarOrden(orderId, {
      estado: mapa[tipo] || orden.estado,
      transactionId: evento.subject || orden.transactionId || null,
      eventosBold: vistos.concat(evento.id ? [evento.id] : []),
      ultimoEvento: { tipo, recibidoEn: new Date().toISOString() }
    });
  }
);

app.use(express.json({ limit: "256kb" }));

/* ---------- API ---------- */

/** Guarda la ficha del vehículo antes de pagar (por si el cliente abandona el checkout). */
app.post("/api/leads", (req, res) => {
  const vehiculo = (req.body && (req.body.vehiculo || req.body.propiedad)) || null;
  if (!vehiculo || typeof vehiculo !== "object") {
    return res.status(400).json({ error: "Faltan los datos del vehículo" });
  }
  const lead = {
    leadId: "LEAD-" + crypto.randomBytes(6).toString("hex").toUpperCase(),
    vehiculo,
    cliente: (req.body && req.body.cliente) || null,
    createdAt: new Date().toISOString(),
    origen: req.get("referer") || null
  };
  store.guardarLead(lead);
  res.json({ leadId: lead.leadId });
});

/** Crea la orden y devuelve la firma de integridad para abrir el checkout de Bold. */
app.post("/api/checkout", (req, res) => {
  try {
    if (!BOLD_IDENTITY_KEY || !BOLD_SECRET_KEY) {
      return res.status(503).json({ error: "La pasarela de pagos todavía no está configurada" });
    }

    const { items, cliente, leadId, vehiculo } = req.body || {};
    const { total, detalle, descripcion } = calcularOrden(items);

    if (!cliente || !cliente.email || !cliente.fullName) {
      return res.status(400).json({ error: "Faltan tus datos de contacto" });
    }

    const orderId = "VCA-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();
    const currency = "COP";
    const amount = String(total);

    const firma = integritySignature({ orderId, amount, currency, secretKey: BOLD_SECRET_KEY });

    store.guardarOrden({
      orderId,
      amount: total,
      currency,
      descripcion,
      detalle,
      cliente: {
        fullName: String(cliente.fullName).slice(0, 120),
        email: String(cliente.email).slice(0, 120),
        phone: String(cliente.phone || "").slice(0, 30)
      },
      leadId: leadId || null,
      vehiculo: vehiculo || (leadId ? (store.obtenerLead(leadId) || {}).vehiculo : null) || null,
      estado: "CREATED",
      createdAt: new Date().toISOString()
    });

    res.json({
      orderId,
      amount: total,
      currency,
      description: descripcion,
      integritySignature: firma,
      apiKey: BOLD_IDENTITY_KEY,
      redirectionUrl: `${PUBLIC_URL}/pago/`
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Error creando la orden" });
  }
});

/** Adjunta (o corrige) la ficha del vehículo en una orden ya creada. */
app.post("/api/orders/:orderId/vehiculo", (req, res) => {
  const orderId = req.params.orderId;
  const vehiculo = (req.body && req.body.vehiculo) || null;
  if (!vehiculo || typeof vehiculo !== "object") {
    return res.status(400).json({ error: "Faltan los datos del vehículo" });
  }
  const orden = store.obtenerOrden(orderId);
  if (!orden) return res.status(404).json({ error: "Orden no encontrada" });

  store.actualizarOrden(orderId, { vehiculo, fichaRecibidaEn: new Date().toISOString() });
  console.log("[ficha] recibida para la orden", orderId, "·", vehiculo.modelo || "sin modelo");
  res.json({ ok: true });
});

/** Estado real de la orden: se consulta a Bold, nunca se confía en el parámetro de la URL. */
app.get("/api/orders/:orderId/status", async (req, res) => {
  const orderId = req.params.orderId;
  const orden = store.obtenerOrden(orderId);

  let boldStatus = null;
  let boldError = null;
  if (BOLD_IDENTITY_KEY) {
    try {
      const voucher = await fetchPaymentStatus(orderId, BOLD_IDENTITY_KEY);
      boldStatus = voucher && voucher.payment_status ? voucher.payment_status : null;
      if (orden && boldStatus && boldStatus !== "NO_TRANSACTION_FOUND" && boldStatus !== orden.estado) {
        store.actualizarOrden(orderId, {
          estado: boldStatus,
          transactionId: (voucher && voucher.transaction_id) || orden.transactionId || null,
          metodoPago: (voucher && voucher.payment_method) || null
        });
      }
    } catch (e) {
      boldError = e.message;
    }
  }

  if (!orden && !boldStatus) return res.status(404).json({ error: "Orden no encontrada" });

  const actual = store.obtenerOrden(orderId) || {};
  res.json({
    orderId,
    estado: boldStatus || actual.estado || "UNKNOWN",
    amount: actual.amount || null,
    descripcion: actual.descripcion || null,
    planes: (actual.detalle || []).map((d) => d.plan),
    transactionId: actual.transactionId || null,
    metodoPago: actual.metodoPago || null,
    boldError
  });
});

/** Panel mínimo: lista de órdenes y fichas. Protegido con ADMIN_TOKEN. */
app.get("/api/admin/orders", (req, res) => {
  if (!ADMIN_TOKEN || req.get("x-admin-token") !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "No autorizado" });
  }
  res.json({ ordenes: store.listarOrdenes(), leads: store.listarLeads() });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    sitio: "valora-tu-carro-ai",
    boldConfigurado: Boolean(BOLD_IDENTITY_KEY && BOLD_SECRET_KEY),
    publicUrl: PUBLIC_URL
  });
});

/* ---------- estáticos ---------- */
app.use(
  express.static(path.join(__dirname, "public"), {
    extensions: ["html"],
    setHeaders(res, filePath) {
      // Los assets llevan hash en el nombre: se pueden cachear para siempre.
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "public, max-age=600");
      }
    }
  })
);

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "No encontrado" });
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

app.listen(PORT, () => {
  console.log(`Valora tu carro.AI escuchando en ${PUBLIC_URL} (puerto ${PORT})`);
});
