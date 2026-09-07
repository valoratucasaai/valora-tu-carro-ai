"use strict";
/**
 * Compatibilidad: el almacenamiento real vive en src/db.js (Postgres/Neon con
 * respaldo en archivo). Este módulo se conserva para no romper imports viejos.
 * OJO: todos los métodos ahora son asíncronos (devuelven Promesas).
 */
module.exports = require("./db");
