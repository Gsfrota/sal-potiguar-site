(function () {
  "use strict";

  var WHATSAPP = "5584996951133";
  var fragment = new URLSearchParams(window.location.hash.slice(1));
  var message = fragment.get("text") || "Olá, Gonzaga. Vim pelo site e gostaria de falar sobre uma compra em grande volume.";
  var source = fragment.get("source") || "site";
  var preview = fragment.get("preview") === "1";
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var destination = "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(message);
  var openLink = document.getElementById("handoff-open");
  var status = document.getElementById("handoff-status");
  var context = document.getElementById("handoff-context");
  var redirectDelay = reducedMotion ? 450 : 2700;
  var timers = [];

  var contextBySource = {
    "produto-sal": "Cotação de sal branco",
    "produto-ureia": "Cotação de ureia",
    "produto-fosfato": "Cotação de fosfato",
    "assistente-guiado": "Solicitação organizada no site",
    "form": "Cotação organizada no formulário",
    "perfil-fabrica": "Atendimento para fábrica de ração",
    "perfil-cooperativa": "Atendimento para cooperativa",
    "perfil-confinamento": "Atendimento para confinamento",
    "perfil-industria": "Atendimento para operação industrial"
  };

  function schedule(callback, delay) {
    timers.push(window.setTimeout(callback, delay));
  }

  function redirect() {
    timers.forEach(function (timer) { window.clearTimeout(timer); });
    status.textContent = "WhatsApp pronto.";
    window.location.replace(destination);
  }

  openLink.href = destination;
  context.textContent = contextBySource[source] || "Cotação em grande volume";

  if (!reducedMotion) {
    schedule(function () {
      document.body.setAttribute("data-phase", "2");
      status.textContent = "Conexão preparada.";
    }, 760);

    schedule(function () {
      document.body.setAttribute("data-phase", "3");
      status.textContent = "Abrindo sua conversa.";
    }, 1580);
  } else {
    document.body.setAttribute("data-phase", "3");
    status.textContent = "Abrindo sua conversa.";
  }

  if (!preview) schedule(redirect, redirectDelay);

  openLink.addEventListener("click", function () {
    timers.forEach(function (timer) { window.clearTimeout(timer); });
  });
})();
