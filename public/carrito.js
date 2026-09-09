/* Valora tu carro.AI — carrito, ficha del vehículo y checkout con Bold.
   Mismo comportamiento que el carrito de valoratucasa: se agrega, se ve el
   resumen, se dejan los datos de contacto y se paga con Bold; si Bold no
   carga, el pedido sale por WhatsApp. Este archivo se inyecta solo: no toca
   el HTML exportado del diseño. */
(function () {
  "use strict";

  var WA_NUMBER = "573165017403";
  var EN = /^\/en\//.test(location.pathname);
  var PLAN = {
    clave: "informe",
    nombre: EN ? "Valuation report · 1 car" : "Informe de valoración · 1 carro",
    detalle: EN ? "PDF + 6-sheet Excel, same day" : "PDF + Excel de 6 hojas, el mismo día",
    precio: 30000,
    max: 10
  };
  var T = EN ? {
    carrito: "Your cart", cerrar: "Close", vacio: "Nothing here yet. Add a report and it shows up.",
    verPlan: "Add a report", total: "Total", pagar: "Pay with Bold", wa: "Order on WhatsApp",
    fichaOk: "Car details attached to your order.", fichaFalta: "We still don't have your car's details.",
    fichaLink: "Fill them in now", fichaResto: "(2 minutes) or we ask for them right after payment.",
    nota: "Secure payment processed by Bold: cards, PSE, Nequi and bank button.",
    ultimo: "Last step before paying", sub: "We send the report and the receipt to these details.",
    nombre: "Full name", correo: "Email", tel: "WhatsApp", seguir: "Continue to payment",
    volver: "Back", preparando: "Preparing the payment…", quitar: "Remove one", agregar: "Add one",
    legal: "By continuing you agree we use your details to prepare and deliver the valuation. Bold processes the payment; we never store your card.",
    unidad: "each", cta: "Cart", pedido: "Hi, I want to order:"
  } : {
    carrito: "Su carrito", cerrar: "Cerrar", vacio: "Todavía no ha agregado nada. Agregue un informe y aparece aquí.",
    verPlan: "Agregar un informe", total: "Total", pagar: "Pagar con Bold", wa: "Pedir por WhatsApp",
    fichaOk: "Los datos del carro van con su pedido.", fichaFalta: "Todavía no tenemos los datos de su carro.",
    fichaLink: "Llénelos ahora", fichaResto: "(2 minutos) o se los pedimos apenas termine el pago.",
    nota: "Pago seguro procesado por Bold: tarjetas, PSE, Nequi y botón bancario.",
    ultimo: "Último paso antes de pagar", sub: "A estos datos le enviamos el informe y la factura.",
    nombre: "Nombre completo", correo: "Correo electrónico", tel: "WhatsApp", seguir: "Continuar al pago",
    volver: "Volver", preparando: "Preparando el pago…", quitar: "Quitar uno", agregar: "Agregar uno",
    legal: "Al continuar acepta que usemos sus datos para preparar y entregar la valoración. El pago lo procesa Bold; no guardamos los datos de su tarjeta.",
    unidad: "c/u", cta: "Carrito", pedido: "Hola, quiero pedir:"
  };

  var CAMPOS = [
    ["modelo", EN ? "Make, model and year" : "Marca, modelo y año"],
    ["version", EN ? "Trim" : "Versión"],
    ["km", EN ? "Mileage" : "Kilometraje"],
    ["ciudad", EN ? "City" : "Ciudad"],
    ["estado", EN ? "Condition" : "Estado general"],
    ["accidentes", EN ? "Reported accidents" : "Accidentes reportados"],
    ["modificaciones", EN ? "Modifications" : "Modificaciones"],
    ["uso", EN ? "Needed for" : "Para qué la necesita"]
  ];

  function cop(n) {
    return EN ? "$" + new Intl.NumberFormat("en-US").format(n)
              : "$" + new Intl.NumberFormat("es-CO").format(n);
  }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function wa(t) { return "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(t); }
  function leer(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var cantidad = leer("vca_cart", 0) || 0;
  var leadId = leer("vca_lead", null);

  /* ---------- ficha del vehículo ----------
     El formulario de la landing lo dibuja el runtime del diseño, así que en vez
     de leer cada input se lee el enlace que ese mismo formulario construye
     (/checkout/?modelo=...): siempre trae el estado actual. */
  function fichaActual() {
    var a = $('a[href^="/checkout/"]');
    if (!a) return null;
    var q;
    try { q = new URL(a.href, location.origin).searchParams; } catch (e) { return null; }
    var d = {};
    CAMPOS.forEach(function (c) { d[c[0]] = (q.get(c[0]) || "").trim(); });
    // Los segmentos (estado, uso…) traen valor por defecto; la ficha solo cuenta
    // como llena cuando el cliente escribió al menos el carro.
    return d.modelo && d.modelo !== "—" ? d : null;
  }
  function textoFicha(d) {
    return CAMPOS.map(function (c) {
      return c[1] + ": " + ((d[c[0]] || "").trim() || (EN ? "to be defined" : "por definir"));
    }).join("\n");
  }

  /* ---------- estilos ---------- */
  var CSS = '\
#vca-cart,#vca-contacto{position:fixed;inset:0;z-index:120;display:flex;background:rgba(4,5,6,.62);\
  backdrop-filter:blur(3px);animation:vcaFade .18s ease-out}\
#vca-contacto{align-items:center;justify-content:center;padding:24px}\
.vca-oculto{display:none !important}\
@keyframes vcaFade{from{opacity:0}to{opacity:1}}\
@keyframes vcaSlide{from{transform:translateX(26px);opacity:.4}to{transform:none;opacity:1}}\
#vca-cart .vca-tapa{flex:1;border:0;background:transparent;cursor:pointer}\
.vca-panel{width:min(430px,100%);background:#0a0c0e;color:#eef2f6;display:flex;flex-direction:column;\
  border-left:1px solid rgba(240,244,248,.22);animation:vcaSlide .24s cubic-bezier(.22,.61,.36,1)}\
.vca-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 22px;\
  border-bottom:1px solid rgba(240,244,248,.16)}\
.vca-head h3{margin:0;font-family:"Barlow Condensed",system-ui,sans-serif;font-size:22px;font-weight:600;\
  text-transform:uppercase;letter-spacing:.02em}\
.vca-body{flex:1;overflow:auto;padding:20px 22px;display:grid;gap:14px;align-content:start}\
.vca-foot{border-top:1px solid rgba(240,244,248,.16);padding:18px 22px 22px;display:grid;gap:12px;\
  background:rgba(6,8,10,.66)}\
.vca-item{border:1px solid rgba(240,244,248,.16);padding:16px 18px;display:grid;gap:10px;background:rgba(13,16,19,.74)}\
.vca-item-top{display:flex;justify-content:space-between;gap:12px;align-items:baseline}\
.vca-item-top b{font-family:"Barlow Condensed",system-ui,sans-serif;font-size:17px;font-weight:600;\
  text-transform:uppercase;line-height:1.15}\
.vca-item-top span{font-family:"Barlow Condensed",system-ui,sans-serif;font-size:17px;font-weight:600;white-space:nowrap}\
.vca-muted{color:rgba(240,244,248,.6);font-size:13px;line-height:1.5;margin:0}\
.vca-mini{color:rgba(240,244,248,.5);font-size:12px;line-height:1.5;margin:0}\
.vca-qty{display:flex;align-items:center;gap:10px}\
.vca-qty b{min-width:22px;text-align:center;font-family:"Barlow Condensed",system-ui,sans-serif;font-size:17px}\
.vca-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-family:"Barlow Condensed",system-ui,sans-serif;\
  font-size:14px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:11px 18px;border-radius:0;\
  border:1px solid transparent;cursor:pointer;text-decoration:none;transition:background .18s,border-color .18s,color .18s}\
.vca-btn-primary{background:#ffffff;color:#0a0c0e}\
.vca-btn-primary:hover{background:#c9cdd1}\
.vca-btn-primary[disabled]{opacity:.45;cursor:default}\
.vca-btn-ghost{background:transparent;color:#eef2f6;border-color:rgba(240,244,248,.28)}\
.vca-btn-ghost:hover{border-color:#eef2f6}\
.vca-ico{width:32px;height:32px;padding:0;font-size:17px;line-height:1;letter-spacing:0}\
.vca-total{display:flex;justify-content:space-between;align-items:baseline}\
.vca-total .lab{color:rgba(240,244,248,.6);font-size:13px;text-transform:uppercase;letter-spacing:.12em}\
.vca-total b{font-family:"Barlow Condensed",system-ui,sans-serif;font-size:30px;font-weight:600}\
.vca-aviso{margin:0;font-size:13px;line-height:1.5;color:#eef2f6;background:rgba(240,244,248,.06);\
  border:1px solid rgba(240,244,248,.2);padding:11px 13px}\
.vca-aviso a{color:#ffffff;text-decoration:underline}\
.vca-caja{width:min(440px,100%);background:#0a0c0e;color:#eef2f6;border:1px solid rgba(240,244,248,.22);\
  padding:26px 26px 22px;max-height:92vh;overflow:auto}\
.vca-caja h3{margin:0 0 6px;font-family:"Barlow Condensed",system-ui,sans-serif;font-size:26px;font-weight:600;\
  text-transform:uppercase;letter-spacing:.02em}\
.vca-campo{display:grid;gap:6px;margin-bottom:14px}\
.vca-campo label{font-family:"Barlow Condensed",system-ui,sans-serif;font-size:11px;letter-spacing:.16em;\
  text-transform:uppercase;color:rgba(240,244,248,.6)}\
.vca-campo input{font-family:"Barlow",system-ui,sans-serif;font-size:15px;padding:11px 12px;\
  border:1px solid rgba(240,244,248,.2);border-radius:0;background:rgba(13,16,19,.74);color:#eef2f6;width:100%}\
.vca-campo input:focus{outline:none;border-color:#ffffff}\
.vca-error{margin:0 0 12px;font-size:13.5px;color:#ff8a80;border:1px solid #ff8a80;padding:10px 12px}\
.vca-cta{position:relative}\
.vca-n{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;\
  background:#ffffff;color:#0a0c0e;font-size:12px;font-weight:600;line-height:1;letter-spacing:0}\
.vca-cta.vca-vacio .vca-n{background:rgba(240,244,248,.28);color:#0a0c0e}\
@media (max-width:520px){.vca-panel{width:100%}}';

  /* ---------- markup ---------- */
  var MARKUP = '\
<div id="vca-cart" class="vca-oculto" role="dialog" aria-modal="true" aria-label="' + T.carrito + '">\
  <button type="button" class="vca-tapa" data-vca-close aria-label="' + T.cerrar + '"></button>\
  <aside class="vca-panel">\
    <div class="vca-head"><h3>' + T.carrito + '</h3>\
      <button type="button" class="vca-btn vca-btn-ghost vca-ico" data-vca-close aria-label="' + T.cerrar + '">×</button></div>\
    <div class="vca-body">\
      <div id="vca-empty" style="display:grid;gap:14px">\
        <p class="vca-muted">' + T.vacio + '</p>\
        <button type="button" class="vca-btn vca-btn-ghost" data-vca-add style="justify-self:start">' + T.verPlan + '</button>\
      </div>\
      <div id="vca-items"></div>\
      <p id="vca-ficha" class="vca-aviso vca-oculto"></p>\
    </div>\
    <div class="vca-foot">\
      <div class="vca-total"><span class="lab">' + T.total + '</span><b id="vca-total">' + cop(0) + '</b></div>\
      <button type="button" id="vca-pay" class="vca-btn vca-btn-primary" style="padding:14px">' + T.pagar + '</button>\
      <a id="vca-wa" class="vca-btn vca-btn-ghost" style="padding:13px" target="_blank" rel="noopener" href="#">' + T.wa + '</a>\
      <p class="vca-mini">' + T.nota + '</p>\
    </div>\
  </aside>\
</div>\
<div id="vca-contacto" class="vca-oculto" role="dialog" aria-modal="true" aria-label="' + T.ultimo + '">\
  <div class="vca-caja">\
    <h3>' + T.ultimo + '</h3>\
    <p class="vca-muted" style="margin:0 0 18px">' + T.sub + '</p>\
    <form id="vca-form">\
      <div class="vca-campo"><label for="vca-nombre">' + T.nombre + '</label>\
        <input id="vca-nombre" name="fullName" required placeholder="Juan Pablo Parra"></div>\
      <div class="vca-campo"><label for="vca-mail">' + T.correo + '</label>\
        <input id="vca-mail" name="email" type="email" required placeholder="nombre@correo.com"></div>\
      <div class="vca-campo"><label for="vca-tel">' + T.tel + '</label>\
        <input id="vca-tel" name="phone" required inputmode="tel" placeholder="300 000 0000"></div>\
      <p id="vca-error" class="vca-error vca-oculto"></p>\
      <button type="submit" id="vca-submit" class="vca-btn vca-btn-primary" style="width:100%;padding:13px">' + T.seguir + '</button>\
      <button type="button" class="vca-btn vca-btn-ghost" data-vca-contacto-close style="width:100%;padding:13px;margin-top:10px">' + T.volver + '</button>\
      <p class="vca-mini" style="margin-top:14px">' + T.legal + '</p>\
    </form>\
  </div>\
</div>';

  /* ---------- montaje ---------- */
  function montar() {
    var st = document.createElement("style"); st.id = "vca-estilos"; st.textContent = CSS;
    document.head.appendChild(st);
    var wrap = document.createElement("div"); wrap.innerHTML = MARKUP;
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    render();
    esperarHeader();
  }

  function botonCarrito(extra) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "vca-btn vca-btn-ghost vca-cta";
    b.setAttribute("data-vca-open", "1");
    b.style.cssText = extra || "font-size:13px;padding:9px 13px";
    b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="9" cy="20" r="1.3"></circle><circle cx="18" cy="20" r="1.3"></circle>' +
      '<path d="M2 3h2.2l2.6 12.4h11.4L21 7H6"></path></svg>' +
      '<span>' + T.cta + '</span><span class="vca-n" data-vca-count>0</span>';
    return b;
  }

  /* El header lo dibuja el runtime del diseño, así que puede llegar después:
     se reintenta un rato y, si no aparece, el carrito queda flotando. */
  function montarBotonHeader() {
    if ($("[data-vca-open]")) return true;
    var cta = $$("header a").filter(function (a) {
      return /#pedir$/.test(a.getAttribute("href") || "");
    }).pop();
    if (!cta || !cta.parentNode) return false;
    cta.parentNode.insertBefore(botonCarrito(), cta);
    render();
    return true;
  }

  function botonFlotante() {
    if ($("[data-vca-open]")) return;
    var b = botonCarrito("position:fixed; right:18px; bottom:18px; z-index:110; padding:12px 18px;" +
      "background:#0a0c0e; border-color:rgba(240,244,248,.28)");
    document.body.appendChild(b);
    render();
  }

  function esperarHeader() {
    var intentos = 0;
    if (montarBotonHeader()) return;
    var t = setInterval(function () {
      intentos++;
      if (montarBotonHeader() || intentos > 24) {
        clearInterval(t);
        botonFlotante();
      }
    }, 250);
  }

  /* ---------- render ---------- */
  function render() {
    var ficha = fichaActual();
    $$("[data-vca-count]").forEach(function (el) { el.textContent = cantidad; });
    $$(".vca-cta").forEach(function (el) { el.classList.toggle("vca-vacio", cantidad === 0); });

    var cont = $("#vca-items"); if (!cont) return;
    $("#vca-empty").classList.toggle("vca-oculto", cantidad > 0);
    cont.innerHTML = "";
    if (cantidad > 0) {
      var d = document.createElement("div");
      d.className = "vca-item";
      d.innerHTML =
        '<div class="vca-item-top"><b>' + PLAN.nombre + '</b><span>' + cop(PLAN.precio * cantidad) + '</span></div>' +
        '<p class="vca-mini">' + PLAN.detalle + ' · ' + cop(PLAN.precio) + ' ' + T.unidad + '</p>' +
        '<div class="vca-qty">' +
          '<button type="button" class="vca-btn vca-btn-ghost vca-ico" data-vca-menos aria-label="' + T.quitar + '">−</button>' +
          '<b>' + cantidad + '</b>' +
          '<button type="button" class="vca-btn vca-btn-ghost vca-ico" data-vca-mas aria-label="' + T.agregar + '">+</button>' +
        '</div>';
      cont.appendChild(d);
    }

    var av = $("#vca-ficha");
    if (cantidad === 0) { av.classList.add("vca-oculto"); }
    else {
      av.classList.remove("vca-oculto");
      av.innerHTML = ficha
        ? "✓ " + T.fichaOk + " <span style=\"color:rgba(240,244,248,.6)\">" + (ficha.modelo || "") + "</span>"
        : T.fichaFalta + ' <a href="#pedir" data-vca-close><strong>' + T.fichaLink + "</strong></a> " + T.fichaResto;
    }

    $("#vca-total").textContent = cop(PLAN.precio * cantidad);
    $("#vca-pay").disabled = cantidad === 0;
    $("#vca-wa").href = wa(T.pedido + "\n· " + cantidad + " × " + PLAN.nombre +
      "\n" + T.total + ": " + cop(PLAN.precio * cantidad) + (ficha ? "\n\n" + textoFicha(ficha) : ""));
  }

  function agregar(delta) {
    cantidad = Math.max(0, Math.min(PLAN.max, cantidad + delta));
    guardar("vca_cart", cantidad);
    render();
  }
  function abrir() { $("#vca-cart").classList.remove("vca-oculto"); document.body.style.overflow = "hidden"; }
  function cerrar() { $("#vca-cart").classList.add("vca-oculto"); document.body.style.overflow = ""; }
  function abrirContacto() { $("#vca-contacto").classList.remove("vca-oculto"); setTimeout(function () { $("#vca-nombre").focus(); }, 60); }
  function cerrarContacto() { $("#vca-contacto").classList.add("vca-oculto"); }

  /* ---------- lead ---------- */
  function registrarLead(ficha) {
    if (!ficha || leadId) return;
    fetch("/api/leads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehiculo: ficha })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.leadId) { leadId = j.leadId; guardar("vca_lead", leadId); } })
      .catch(function () {});
  }

  /* ---------- pago ---------- */
  function pagarPorWhatsApp() { window.open($("#vca-wa").href, "_blank", "noopener"); }

  function iniciarPago(cliente) {
    var btn = $("#vca-submit"), err = $("#vca-error");
    btn.disabled = true; btn.textContent = T.preparando; err.classList.add("vca-oculto");
    var ficha = fichaActual();

    fetch("/api/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ plan: PLAN.clave, cantidad: cantidad }],
        cliente: cliente, leadId: leadId, vehiculo: ficha
      })
    })
      .then(function (r) { return r.json().then(function (j) {
        if (!r.ok) throw new Error(j && j.error ? j.error : (EN ? "We couldn't create the order" : "No pudimos crear la orden"));
        return j;
      }); })
      .then(function (orden) {
        guardar("vca_last_order", orden.orderId);
        if (typeof window.BoldCheckout !== "function") {
          cerrarContacto(); cerrar(); pagarPorWhatsApp(); return;
        }
        var checkout = new window.BoldCheckout({
          orderId: orden.orderId, currency: orden.currency, amount: String(orden.amount),
          apiKey: orden.apiKey, integritySignature: orden.integritySignature,
          description: orden.description, redirectionUrl: orden.redirectionUrl,
          customerData: JSON.stringify({
            email: cliente.email, fullName: cliente.fullName,
            phone: String(cliente.phone).replace(/[^0-9]/g, ""), dialCode: "+57"
          }),
          renderMode: "embedded"
        });
        cerrarContacto(); cerrar(); checkout.open();
      })
      .catch(function (e) {
        err.textContent = e.message + (EN ? ". You can try again or send the order on WhatsApp."
                                          : ". Puede intentar de nuevo o mandarnos el pedido por WhatsApp.");
        err.classList.remove("vca-oculto");
      })
      .finally(function () { btn.disabled = false; btn.textContent = T.seguir; });
  }

  /* ---------- eventos ---------- */
  document.addEventListener("click", function (e) {
    // Los botones de pago del diseño llevan a /checkout/: ahora abren el carrito.
    var link = e.target.closest && e.target.closest('a[href*="/checkout/"]');
    if (link) {
      e.preventDefault();
      var ficha = fichaActual();
      registrarLead(ficha);
      if (cantidad === 0) agregar(1); else render();
      abrir();
      return;
    }
    var t = e.target.closest && e.target.closest("[data-vca-open],[data-vca-close],[data-vca-add],[data-vca-mas],[data-vca-menos],[data-vca-contacto-close]");
    if (!t) return;
    if (t.hasAttribute("data-vca-open")) { e.preventDefault(); abrir(); }
    else if (t.hasAttribute("data-vca-add")) { agregar(1); }
    else if (t.hasAttribute("data-vca-mas")) agregar(1);
    else if (t.hasAttribute("data-vca-menos")) agregar(-1);
    else if (t.hasAttribute("data-vca-close")) { if (t.tagName === "A") cerrar(); else { e.preventDefault(); cerrar(); } }
    else if (t.hasAttribute("data-vca-contacto-close")) cerrarContacto();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { cerrarContacto(); cerrar(); }
  });

  function arrancar() {
    montar();
    $("#vca-pay").addEventListener("click", function () { if (cantidad > 0) abrirContacto(); });
    var f = $("#vca-form");
    var g = leer("vca_cliente", null);
    if (g) { f.elements.fullName.value = g.fullName || ""; f.elements.email.value = g.email || ""; f.elements.phone.value = g.phone || ""; }
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var c = {
        fullName: f.elements.fullName.value.trim(),
        email: f.elements.email.value.trim(),
        phone: f.elements.phone.value.trim()
      };
      guardar("vca_cliente", c);
      iniciarPago(c);
    });
    // el formulario del diseño cambia el enlace de pago: refrescamos el aviso de la ficha
    document.addEventListener("input", function () { if (cantidad > 0) render(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
