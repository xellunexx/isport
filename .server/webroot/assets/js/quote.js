/* Infraconcept 2026 — quote page: render cart, edit qty, send via mailto, export JSON. */
(function () {
  "use strict";
  var box = document.getElementById("q-items");
  if (!box) return;
  var META = window.IC_CART_META || {}, Q = window.IC_Q || {};

  function render() {
    var cart = window.IC_CART.all(), ids = Object.keys(cart);
    var empty = document.getElementById("q-empty");
    box.innerHTML = "";
    if (!ids.length) { if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    var h = document.createElement("h3");
    h.textContent = (Q.items || "Items") + " (" + window.IC_CART.count() + ")";
    box.appendChild(h);
    ids.forEach(function (id) {
      var m = META[id]; if (!m) return;
      var row = document.createElement("div");
      row.className = "qitem";
      row.innerHTML = '<div><span class="qn"></span> <small></small></div>' +
        '<div class="qqty"><button type="button" data-d="-1">−</button><b></b>' +
        '<button type="button" data-d="1">＋</button>' +
        '<button type="button" class="qrm"></button></div>';
      row.querySelector(".qn").textContent = m.name;
      row.querySelector("small").textContent = m.series + " " + m.model;
      row.querySelector("b").textContent = cart[id];
      row.querySelector(".qrm").textContent = Q.rm || "Remove";
      row.querySelectorAll(".qqty button[data-d]").forEach(function (b) {
        b.addEventListener("click", function () {
          window.IC_CART.set(id, (window.IC_CART.all()[id] || 0) + parseInt(b.dataset.d, 10));
          render();
        });
      });
      row.querySelector(".qrm").addEventListener("click", function () {
        window.IC_CART.set(id, 0); render();
      });
      box.appendChild(row);
    });
  }

  function payload(f) {
    var cart = window.IC_CART.all();
    return {
      name: f.name.value, org: f.org.value, email: f.email.value,
      phone: f.phone.value, msg: f.msg.value,
      items: Object.keys(cart).map(function (id) {
        return { id: id, qty: cart[id], product: (META[id] || {}).name,
                 model: (META[id] || {}).model };
      })
    };
  }

  var form = document.getElementById("q-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var p = payload(form);
      var lines = p.items.map(function (i) { return i.qty + " × " + i.product; });
      var body = [p.msg, "", "— " + p.name + " (" + p.org + ")", p.email, p.phone, ""]
        .concat(lines).join("\n");
      location.href = "mailto:office@infraconcept.bg?subject=" +
        encodeURIComponent("[Infraconcept] " + (Q.items || "Enquiry") + " — " + p.name) +
        "&body=" + encodeURIComponent(body);
      return false;
    });
    var dl = document.getElementById("q-dl");
    if (dl) dl.addEventListener("click", function () {
      var blob = new Blob([JSON.stringify(payload(form), null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "infraconcept-enquiry.json";
      a.click();
    });
  }
  render();
})();
