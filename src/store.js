"use strict";

/**
 * Almacenamiento simple en archivo JSON (índice en memoria + escritura atómica).
 * Suficiente para el volumen de lanzamiento y sin dependencias nativas.
 * Si más adelante crece, se reemplaza este módulo por Postgres/SQLite sin tocar las rutas.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR_LOCAL = path.join(__dirname, "..", "data");

/**
 * Si DATA_DIR apunta a una carpeta donde no se puede escribir (típico: se configuró
 * /var/data pero el plan de Render no tiene disco montado), se cae de vuelta a la
 * carpeta del proyecto en vez de tumbar el servidor. Se pierden los datos en cada
 * despliegue, pero el sitio sigue vendiendo y Bold conserva el registro de los pagos.
 */
function resolverDataDir() {
  const pedido = process.env.DATA_DIR || DATA_DIR_LOCAL;
  try {
    fs.mkdirSync(pedido, { recursive: true });
    fs.accessSync(pedido, fs.constants.W_OK);
    return pedido;
  } catch (e) {
    console.warn(
      "[store] No se puede escribir en " + pedido + " (" + e.code + "). " +
      "Uso " + DATA_DIR_LOCAL + ". Los datos NO sobreviven a un redespliegue: " +
      "monta un disco persistente y apunta DATA_DIR ahí."
    );
    try { fs.mkdirSync(DATA_DIR_LOCAL, { recursive: true }); } catch (e2) {}
    return DATA_DIR_LOCAL;
  }
}

const DATA_DIR = resolverDataDir();
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");

function asegurarDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function leerArchivo(file) {
  asegurarDir();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8") || "{}");
  } catch (e) {
    console.error("No se pudo leer", file, e.message);
    return {};
  }
}

function escribirArchivo(file, data) {
  asegurarDir();
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

let orders = leerArchivo(ORDERS_FILE);
let leads = leerArchivo(LEADS_FILE);

const store = {
  guardarOrden(orden) {
    orders[orden.orderId] = orden;
    escribirArchivo(ORDERS_FILE, orders);
    return orden;
  },
  obtenerOrden(orderId) {
    return orders[orderId] || null;
  },
  actualizarOrden(orderId, cambios) {
    if (!orders[orderId]) return null;
    orders[orderId] = Object.assign({}, orders[orderId], cambios, { updatedAt: new Date().toISOString() });
    escribirArchivo(ORDERS_FILE, orders);
    return orders[orderId];
  },
  listarOrdenes() {
    return Object.values(orders).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  },
  guardarLead(lead) {
    leads[lead.leadId] = lead;
    escribirArchivo(LEADS_FILE, leads);
    return lead;
  },
  obtenerLead(leadId) {
    return leads[leadId] || null;
  },
  listarLeads() {
    return Object.values(leads).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
};

module.exports = store;
