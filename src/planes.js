"use strict";

/**
 * Fuente de verdad de los precios. El frontend muestra estos mismos valores,
 * pero el monto que se firma y se cobra SIEMPRE se calcula aquí, en el servidor.
 *
 * DOS MERCADOS, UNA SOLA MONEDA DE COBRO.
 * Bold es una pasarela colombiana y cobra en pesos. Por eso los dos mercados
 * se cobran en COP y el sitio en inglés NO cobra dólares de verdad: cobra
 * 93.000 COP, que es lo que vale el informe para ese mercado, y le muestra al
 * cliente el equivalente en dólares para que sepa qué esperar en su extracto.
 *
 * `referencia` es SOLO para mostrar. Nunca se cobra ni se firma con ella.
 *
 * TASA USADA: 1 USD ~ 3.100 COP (TRM ~3.072 al 2026-09-15).
 * 93.000 COP ~ US$30. Si el dólar se mueve fuerte, hay que revisar este
 * número y el `referencia.valor` juntos, o la página va a mentir.
 */
const MERCADOS = {
  CO: {
    moneda: "COP",
    idioma: "es",
    precios: { informe: 30000 },
    referencia: null
  },
  US: {
    moneda: "COP",
    idioma: "en",
    precios: { informe: 93000 },
    referencia: { moneda: "USD", valor: 30 }
  }
};
const MERCADO_POR_DEFECTO = "CO";

const PLANES = {
  informe: {
    nombre: "Informe de valoración · 1 carro",
    nombreEn: "Valuation report · 1 car",
    maxCantidad: 10
  }
};

const MONEDAS = {
  COP: { decimales: 0, minimo: 1000 }
};

// Compatibilidad con código viejo que importaba el mínimo en pesos.
const MONTO_MINIMO_COP = MONEDAS.COP.minimo;

function normalizarMercado(valor) {
  const codigo = String(valor || MERCADO_POR_DEFECTO).toUpperCase().trim();
  if (!MERCADOS[codigo]) {
    throw Object.assign(new Error("Mercado no válido: " + codigo), { status: 400 });
  }
  return codigo;
}

/** El string exacto que va a Bold y que se firma. Deben ser el mismo. */
function formatearMonto(total, moneda) {
  const dec = MONEDAS[moneda].decimales;
  return dec === 0 ? String(Math.round(total)) : Number(total).toFixed(dec);
}

function calcularOrden(items, mercadoPedido) {
  const mercadoClave = normalizarMercado(mercadoPedido);
  const mercado = MERCADOS[mercadoClave];
  const moneda = mercado.moneda;

  if (!Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error("El carrito está vacío"), { status: 400 });
  }
  let total = 0;
  const detalle = [];
  for (const item of items) {
    const plan = PLANES[item && item.plan];
    if (!plan) throw Object.assign(new Error("Plan no válido: " + (item && item.plan)), { status: 400 });
    const precio = mercado.precios[item.plan];
    if (precio == null) {
      throw Object.assign(new Error("El plan no se vende en el mercado " + mercadoClave), { status: 400 });
    }
    const cantidad = Math.floor(Number(item.cantidad));
    if (!Number.isFinite(cantidad) || cantidad < 1 || cantidad > plan.maxCantidad) {
      throw Object.assign(new Error("Cantidad no válida para " + plan.nombre), { status: 400 });
    }
    const nombre = mercado.idioma === "en" ? plan.nombreEn || plan.nombre : plan.nombre;
    total += precio * cantidad;
    detalle.push({ plan: item.plan, nombre, cantidad, precioUnitario: precio, moneda });
  }
  total = Number(total.toFixed(MONEDAS[moneda].decimales));
  if (total < MONEDAS[moneda].minimo) {
    throw Object.assign(new Error("El monto mínimo de pago es " + MONEDAS[moneda].minimo + " " + moneda), { status: 400 });
  }

  // Equivalente aproximado, solo para mostrarlo en el recibo y en la página.
  let referencia = null;
  if (mercado.referencia) {
    const unitario = mercado.precios.informe;
    const factor = total / unitario;
    referencia = {
      moneda: mercado.referencia.moneda,
      valor: Number((mercado.referencia.valor * factor).toFixed(2))
    };
  }

  const descripcion = detalle
    .map((d) => `${d.cantidad} x ${d.nombre}`)
    .join(" + ")
    .slice(0, 100);

  return {
    total,
    moneda,
    mercado: mercadoClave,
    montoFirmado: formatearMonto(total, moneda),
    referencia,
    detalle,
    descripcion
  };
}

module.exports = {
  PLANES, MERCADOS, MERCADO_POR_DEFECTO, MONEDAS,
  calcularOrden, normalizarMercado, formatearMonto, MONTO_MINIMO_COP
};
