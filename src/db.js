"use strict";

/**
 * Capa de persistencia. Usa Postgres (Neon) cuando hay DATABASE_URL;
 * si no la hay, cae a archivos JSON para desarrollo local.
 *
 * Motivo: en el plan free de Render el disco es efímero — cada redespliegue
 * borraría las órdenes pagadas. Neon (plan free) es persistente de verdad.
 */

const fs = require("fs");
const path = require("path");

const DATABASE_URL = process.env.DATABASE_URL || "";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");

let pool = null;
let modo = DATABASE_URL ? "postgres" : "archivo";

/* ---------------- Postgres ---------------- */

async function initPostgres() {
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 30000
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ordenes (
      order_id   TEXT PRIMARY KEY,
      data       JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      lead_id    TEXT PRIMARY KEY,
      data       JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Índice para /api/pendientes: órdenes pagadas, con ficha y sin entregar.
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ordenes_estado_idx
      ON ordenes ((data->>'estado'), (data->>'entregadoEn'));
  `);
  console.log("[db] Postgres listo");
}

/* ---------------- Archivos (dev local) ---------------- */

const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");
let memOrders = {};
let memLeads = {};

function asegurarDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function leerArchivo(file) {
  asegurarDir();
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, "utf8") || "{}"); }
  catch (e) { console.error("No se pudo leer", file, e.message); return {}; }
}
function escribirArchivo(file, data) {
  asegurarDir();
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

/* ---------------- API pública ---------------- */

async function init() {
  if (modo === "postgres") {
    try {
      await initPostgres();
      return;
    } catch (e) {
      console.error("[db] No se pudo conectar a Postgres:", e.message);
      console.error("[db] Cayendo a almacenamiento en archivo. LOS DATOS NO SERÁN PERSISTENTES EN RENDER.");
      modo = "archivo";
    }
  }
  memOrders = leerArchivo(ORDERS_FILE);
  memLeads = leerArchivo(LEADS_FILE);
  console.log("[db] Modo archivo en", DATA_DIR);
}

async function guardarOrden(orden) {
  if (modo === "postgres") {
    await pool.query(
      `INSERT INTO ordenes (order_id, data) VALUES ($1, $2)
       ON CONFLICT (order_id) DO UPDATE SET data = $2, updated_at = now()`,
      [orden.orderId, JSON.stringify(orden)]
    );
    return orden;
  }
  memOrders[orden.orderId] = orden;
  escribirArchivo(ORDERS_FILE, memOrders);
  return orden;
}

async function obtenerOrden(orderId) {
  if (modo === "postgres") {
    const r = await pool.query(`SELECT data FROM ordenes WHERE order_id = $1`, [orderId]);
    return r.rows.length ? r.rows[0].data : null;
  }
  return memOrders[orderId] || null;
}

async function actualizarOrden(orderId, cambios) {
  const actual = await obtenerOrden(orderId);
  if (!actual) return null;
  const nueva = Object.assign({}, actual, cambios, { updatedAt: new Date().toISOString() });
  await guardarOrden(nueva);
  return nueva;
}

async function listarOrdenes(limite = 200) {
  if (modo === "postgres") {
    const r = await pool.query(
      `SELECT data FROM ordenes ORDER BY created_at DESC LIMIT $1`, [limite]
    );
    return r.rows.map((f) => f.data);
  }
  return Object.values(memOrders)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limite);
}

/** Órdenes pagadas, con ficha del inmueble y todavía sin entregar. */
async function listarPendientes() {
  if (modo === "postgres") {
    const r = await pool.query(`
      SELECT data FROM ordenes
      WHERE data->>'estado' = 'APPROVED'
        AND data->'vehiculo' IS NOT NULL
        AND data->'vehiculo' <> 'null'::jsonb
        AND (data->>'entregadoEn') IS NULL
      ORDER BY created_at ASC
      LIMIT 20
    `);
    return r.rows.map((f) => f.data);
  }
  return Object.values(memOrders)
    .filter((o) => o.estado === "APPROVED" && o.vehiculo && !o.entregadoEn)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

async function guardarLead(lead) {
  if (modo === "postgres") {
    await pool.query(
      `INSERT INTO leads (lead_id, data) VALUES ($1, $2)
       ON CONFLICT (lead_id) DO UPDATE SET data = $2`,
      [lead.leadId, JSON.stringify(lead)]
    );
    return lead;
  }
  memLeads[lead.leadId] = lead;
  escribirArchivo(LEADS_FILE, memLeads);
  return lead;
}

async function obtenerLead(leadId) {
  if (modo === "postgres") {
    const r = await pool.query(`SELECT data FROM leads WHERE lead_id = $1`, [leadId]);
    return r.rows.length ? r.rows[0].data : null;
  }
  return memLeads[leadId] || null;
}

async function listarLeads(limite = 200) {
  if (modo === "postgres") {
    const r = await pool.query(`SELECT data FROM leads ORDER BY created_at DESC LIMIT $1`, [limite]);
    return r.rows.map((f) => f.data);
  }
  return Object.values(memLeads)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limite);
}

function modoActual() { return modo; }

module.exports = {
  init, modoActual,
  guardarOrden, obtenerOrden, actualizarOrden, listarOrdenes, listarPendientes,
  guardarLead, obtenerLead, listarLeads
};
