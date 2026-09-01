"use strict";

/**
 * Fuente de verdad de los precios. El frontend muestra estos mismos valores,
 * pero el monto que se firma y se cobra SIEMPRE se calcula aquí, en el servidor.
 * Precios en pesos colombianos, sin decimales (Bold no acepta decimales en COP).
 */
const PLANES = {
  informe: {
    nombre: "Informe de valoración · 1 carro",
    precio: 30000,
    normal: 30000,
    maxCantidad: 10
  }
};

const MONTO_MINIMO_COP = 1000; // mínimo que acepta Bold

function calcularOrden(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error("El carrito está vacío"), { status: 400 });
  }
  let total = 0;
  const detalle = [];
  for (const item of items) {
    const plan = PLANES[item && item.plan];
    if (!plan) throw Object.assign(new Error("Plan no válido: " + (item && item.plan)), { status: 400 });
    const cantidad = Math.floor(Number(item.cantidad));
    if (!Number.isFinite(cantidad) || cantidad < 1 || cantidad > plan.maxCantidad) {
      throw Object.assign(new Error("Cantidad no válida para " + plan.nombre), { status: 400 });
    }
    total += plan.precio * cantidad;
    detalle.push({ plan: item.plan, nombre: plan.nombre, cantidad, precioUnitario: plan.precio });
  }
  if (total < MONTO_MINIMO_COP) {
    throw Object.assign(new Error("El monto mínimo de pago es $1.000"), { status: 400 });
  }
  const descripcion = detalle
    .map((d) => `${d.cantidad} x ${d.nombre}`)
    .join(" + ")
    .slice(0, 100);
  return { total, detalle, descripcion };
}

module.exports = { PLANES, calcularOrden, MONTO_MINIMO_COP };
