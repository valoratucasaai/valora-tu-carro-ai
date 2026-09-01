"use strict";

const crypto = require("crypto");

const BOLD_API = "https://payments.api.bold.co";

/**
 * Firma de integridad del botón de pagos.
 * Bold la define como SHA-256 de: {Identificador}{Monto}{Divisa}{LlaveSecreta}
 * https://developers.bold.co/pagos-en-linea/boton-de-pagos/integracion-manual/integracion-manual
 */
function integritySignature({ orderId, amount, currency, secretKey }) {
  const cadena = `${orderId}${amount}${currency}${secretKey}`;
  return crypto.createHash("sha256").update(cadena, "utf8").digest("hex");
}

/**
 * Validación de webhooks: HMAC-SHA256 sobre el cuerpo crudo en Base64,
 * comparado contra el header x-bold-signature.
 */
function verifyWebhookSignature(rawBody, signature, secretKey) {
  if (!signature) return false;
  const encoded = Buffer.from(rawBody).toString("base64");
  const esperado = crypto
    .createHmac("sha256", secretKey == null ? "" : secretKey)
    .update(encoded)
    .digest("hex");
  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(String(signature), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Consulta el estado real de la transacción contra la API de Bold.
 * GET /v2/payment-voucher/{orderId} con Authorization: x-api-key {identity key}
 */
async function fetchPaymentStatus(orderId, identityKey) {
  const res = await fetch(`${BOLD_API}/v2/payment-voucher/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: {
      Authorization: `x-api-key ${identityKey}`,
      "Content-Type": "application/json"
    }
  });
  const texto = await res.text();
  let cuerpo;
  try { cuerpo = JSON.parse(texto); } catch (e) { cuerpo = { raw: texto }; }
  if (!res.ok) {
    const err = new Error(`Bold respondió ${res.status}`);
    err.status = res.status;
    err.body = cuerpo;
    throw err;
  }
  return cuerpo;
}

const ESTADOS_FINALES = ["APPROVED", "REJECTED", "FAILED", "VOIDED"];

module.exports = { integritySignature, verifyWebhookSignature, fetchPaymentStatus, ESTADOS_FINALES };
