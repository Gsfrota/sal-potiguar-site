(function () {
  "use strict";

  var WHATSAPP = "5584996951133";
  var root = document.getElementById("sales-assistant");

  if (!root) return;

  var launcher = document.getElementById("sales-assistant-launcher");
  var scrim = document.getElementById("sales-assistant-scrim");
  var panel = document.getElementById("sales-assistant-panel");
  var closeButton = document.getElementById("sales-assistant-close");
  var hero = document.getElementById("hero");
  var contactSection = document.getElementById("contato");
  var log = document.getElementById("sales-chat-log");
  var choices = document.getElementById("sales-chat-choices");
  var form = document.getElementById("sales-chat-form");
  var input = document.getElementById("sales-chat-input");
  var resetButton = document.getElementById("sales-chat-reset");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var responseDelay = reduceMotion ? 0 : 320;
  var busy = false;
  var openedByUser = false;
  var proactiveTimer;
  var stage;
  var lead;

  var intentLabels = {
    quote: "Solicitar uma cotação",
    delivery: "Consultar entrega e frete",
    products: "Consultar os produtos",
    payment: "Formas de pagamento",
    spec: "Especificação e documentação",
    human: "Falar diretamente com o Gonzaga",
    doubt: "Tirar uma dúvida"
  };

  var startOptions = [
    { label: "Quero uma cotação", value: "quote" },
    { label: "Entrega e frete", value: "delivery" },
    { label: "Pagamento e condições", value: "payment" },
    { label: "Falar com o Gonzaga", value: "human" }
  ];

  var productOptions = [
    { label: "Sal Potiguar", value: "Sal Potiguar" },
    { label: "Ureia pecuária, sob consulta", value: "Ureia pecuária" },
    { label: "Fosfato bicálcico, sob consulta", value: "Fosfato bicálcico" },
    { label: "Mais de um produto", value: "Mais de um produto" },
    { label: "Ainda não defini", value: "Ainda não definido" }
  ];

  var profileOptions = [
    { label: "Fábrica ou formuladora", value: "Fábrica de ração ou formuladora" },
    { label: "Cooperativa", value: "Cooperativa" },
    { label: "Confinamento ou fazenda", value: "Confinamento ou fazenda" },
    { label: "Indústria, curtume ou frigorífico", value: "Indústria (curtume, frigorífico ou processo industrial)" },
    { label: "Distribuidor ou revenda", value: "Distribuidor ou revenda" },
    { label: "Outra operação", value: "Outra operação" }
  ];

  var volumeOptions = [
    { label: "Carga fechada (carreta)", value: "Carga fechada (carreta)" },
    { label: "10 a 25 toneladas", value: "10 a 25 toneladas" },
    { label: "25 a 50 toneladas", value: "25 a 50 toneladas" },
    { label: "Mais de 50 toneladas", value: "Mais de 50 toneladas" },
    { label: "Ainda não defini", value: "Ainda não definido" }
  ];

  function emptyLead() {
    return {
      intent: "",
      product: "",
      profile: "",
      volume: "",
      destination: "",
      note: "",
      disqualified: false
    };
  }

  function isMeaningfulQualificationValue(value) {
    var normalized = normalizeText(value || "").trim();
    if (!normalized) return false;
    return !/ainda nao|nao defin|prefiro informar|nao sei/.test(normalized);
  }

  function parseCommercialNumber(value) {
    var compact = (value || "").replace(/\s+/g, "");
    if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(compact)) {
      return Number(compact.replace(/\./g, "").replace(",", "."));
    }
    return Number(compact.replace(",", "."));
  }

  function isCommercialVolume(value) {
    var normalized = normalizeText(value || "").trim();
    var tonneMatch;
    var kgMatch;
    var sackMatch;

    if (!isMeaningfulQualificationValue(normalized)) return false;
    if (/big ?bags?|carga|carreta|caminhao/.test(normalized)) return true;

    tonneMatch = normalized.match(/\b(\d[\d.,]*|uma?)\s*(?:t\b|tons?\b|toneladas?\b)/);
    if (tonneMatch) return tonneMatch[1].charAt(0) === "u" || parseCommercialNumber(tonneMatch[1]) >= 1;

    kgMatch = normalized.match(/\b(\d[\d.,]*)\s*(?:kg|quilos?|kilos?)\b/);
    if (kgMatch) return parseCommercialNumber(kgMatch[1]) >= 1000;

    sackMatch = normalized.match(/\b(\d[\d.,]*)\s*(?:sacos?|sacas?)\b/);
    if (sackMatch) return parseCommercialNumber(sackMatch[1]) >= 10;

    return false;
  }

  function isQualifiedLead() {
    return !lead.disqualified
      && isMeaningfulQualificationValue(lead.product)
      && isCommercialVolume(lead.volume)
      && isMeaningfulQualificationValue(lead.destination);
  }

  function setPanelOpen(open, focusFirstChoice) {
    root.setAttribute("data-open", open ? "true" : "false");
    launcher.setAttribute("aria-expanded", open ? "true" : "false");
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    panel.inert = !open;

    if (open && focusFirstChoice) {
      window.setTimeout(function () {
        var firstChoice = choices.querySelector("button, a");
        if (firstChoice) firstChoice.focus();
        else input.focus();
      }, reduceMotion ? 0 : 260);
    }
  }

  function safeSessionGet(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeSessionSet(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch (error) {
      return;
    }
  }

  function scrollConversation() {
    window.requestAnimationFrame(function () {
      log.scrollTop = log.scrollHeight;
    });
  }

  function addMessage(author, text) {
    var message = document.createElement("div");
    message.className = "sales-chat__message sales-chat__message--" + author;
    message.textContent = text;
    log.appendChild(message);
    scrollConversation();
    return message;
  }

  function addTyping() {
    var typing = document.createElement("div");
    typing.className = "sales-chat__typing";
    typing.setAttribute("role", "status");
    typing.setAttribute("aria-label", "Preparando a próxima pergunta");
    typing.innerHTML = "<span></span><span></span><span></span>";
    log.appendChild(typing);
    scrollConversation();
    return typing;
  }

  function setComposer(placeholder, disabled) {
    input.placeholder = placeholder || "Escreva sua necessidade";
    input.disabled = Boolean(disabled);
    form.querySelector("button").disabled = Boolean(disabled);
  }

  function showChoices(options) {
    choices.replaceChildren();
    options.forEach(function (option) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "sales-chat__choice";
      button.textContent = option.label;
      button.addEventListener("click", function () {
        choose(option.label, option.value);
      });
      choices.appendChild(button);
    });
  }

  function botReply(text, options, placeholder) {
    busy = true;
    setComposer(placeholder, true);
    choices.replaceChildren();
    var typing = addTyping();

    window.setTimeout(function () {
      typing.remove();
      addMessage("bot", text);
      showChoices(options || []);
      busy = false;
      setComposer(placeholder, false);
    }, responseDelay);
  }

  function resetConversation() {
    stage = "start";
    lead = emptyLead();
    busy = false;
    log.replaceChildren();
    choices.replaceChildren();
    input.value = "";
    addMessage("bot", "Olá! Como posso lhe ajudar?");
    addMessage("bot", "Escolha uma opção ou escreva o que você precisa. Eu preparo a conversa com o Junior.");
    showChoices(startOptions);
    setComposer("Escreva sua necessidade", false);
  }

  function askProduct() {
    stage = "product";
    botReply("Qual produto você procura?", productOptions, "Digite o produto");
  }

  function askProfile() {
    stage = "profile";
    botReply("Qual opção descreve melhor a sua operação?", profileOptions, "Digite o tipo de operação");
  }

  function askVolume() {
    stage = "volume";
    botReply("Qual volume você pretende comprar? Uma estimativa já ajuda.", volumeOptions, "Digite o volume estimado");
  }

  function askDestination() {
    stage = "destination";
    botReply(
      "Para onde seria a entrega? Digite a cidade e o estado.",
      [{ label: "Informar no WhatsApp", value: "Prefiro informar no WhatsApp" }],
      "Cidade e estado"
    );
  }

  function addIntentAck(intent, askedPrice) {
    if (intent === "payment") addMessage("bot", "Existe opção de faturamento por boleto. A condição é confirmada por Gonzaga Junior conforme o produto e o volume.");
    else if (intent === "spec") addMessage("bot", "Granulometria, apresentação e documentação são confirmadas conforme o produto e o lote.");
    else if (intent === "delivery") addMessage("bot", "A viabilidade do atendimento e o frete são calculados conforme o produto, o volume e o destino.");
    else if (intent === "quote" && askedPrice) addMessage("bot", "Preço e frete variam conforme o produto, o volume e o destino. Vou organizar os dados da solicitação:");
  }

  function askSmallGate() {
    stage = "smallgate";
    botReply(
      "O atendimento comercial é direcionado a compras em volume, incluindo sacaria em quantidade, big bags e cargas. Qual é a quantidade aproximada necessária?",
      [
        { label: "Alguns quilos ou poucos sacos", value: "pequeno" },
        { label: "Sacos em quantidade ou toneladas", value: "volume" },
        { label: "Carga fechada (carreta)", value: "carga" }
      ],
      "Ex.: 30 toneladas, 200 sacos, 20 kg"
    );
  }

  function smallEnd() {
    stage = "smallend";
    lead.disqualified = true;
    botReply(
      "Para essa quantidade, o comércio da sua região poderá oferecer um atendimento mais adequado. Este canal é direcionado a compras em volume para empresas e propriedades rurais.",
      [{ label: "Falar com o Gonzaga mesmo assim", value: "human" }]
    );
  }

  function routeToNextQuestion() {
    if (lead.intent === "small") {
      askSmallGate();
      return;
    }

    if (lead.intent === "human" || lead.intent === "doubt") {
      finishConversation();
      return;
    }

    if (!lead.product) {
      askProduct();
      return;
    }

    if ((lead.intent === "quote" || lead.intent === "products") && !lead.profile) {
      askProfile();
      return;
    }

    if (lead.intent === "products") {
      finishConversation();
      return;
    }

    if (!lead.volume) {
      askVolume();
      return;
    }

    if (!lead.destination) {
      askDestination();
      return;
    }

    finishConversation();
  }

  function choose(label, value) {
    if (busy) return;
    addMessage("user", label);
    input.value = "";

    if (stage === "start") {
      lead.intent = value;
      addIntentAck(lead.intent);
      routeToNextQuestion();
      return;
    }

    if (stage === "smallgate") {
      if (value === "pequeno") {
        smallEnd();
      } else {
        lead.intent = "quote";
        lead.disqualified = false;
        if (value === "carga") lead.volume = "Carga fechada (carreta)";
        routeToNextQuestion();
      }
      return;
    }

    if (stage === "smallend") {
      lead.intent = "human";
      finishConversation();
      return;
    }

    if (stage === "product") lead.product = value;
    if (stage === "profile") lead.profile = value;
    if (stage === "volume") lead.volume = value;
    if (stage === "destination") lead.destination = value;
    routeToNextQuestion();
  }

  function normalizeText(value) {
    return value
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function inferSlots(text) {
    var normalized = normalizeText(text);
    var productsFound = [];
    var volumeMatch;
    var destinationMatch;

    if (/sal potiguar|sal branco|sal refinado|sal grosso|sal moido|\bsal\b/.test(normalized)) productsFound.push("Sal Potiguar");
    if (/ureia|\burea\b/.test(normalized)) productsFound.push("Ureia pecuária");
    if (/fosfato|bicalcico|bicalcio/.test(normalized)) productsFound.push("Fosfato bicálcico");
    if (productsFound.length === 1) lead.product = productsFound[0];
    if (productsFound.length > 1) lead.product = productsFound.join(" e ");

    if (/fabrica|formuladora|\bracao\b/.test(normalized)) lead.profile = "Fábrica de ração ou formuladora";
    else if (/cooperativa/.test(normalized)) lead.profile = "Cooperativa";
    else if (/confinamento|fazenda|homemixer/.test(normalized)) lead.profile = "Confinamento ou fazenda";
    else if (/frigorifico|curtume|matadouro|abatedouro|industria/.test(normalized)) lead.profile = "Indústria (curtume, frigorífico ou processo industrial)";
    else if (/distribuidor|revenda|revendedor|atacad/.test(normalized)) lead.profile = "Distribuidor ou revenda";

    volumeMatch = text.match(/\b\d+(?:[,.]\d+)?\s*(?:t\b|tons?\b|toneladas?)/i)
      || text.match(/\b\d+\s*(?:sacos?|sacas?|big\s?bags?)\b/i)
      || text.match(/\b(?:meia|\d+)\s*(?:carretas?|cargas?|trucks?)\b/i)
      || (/carga fechada|carreta fechada/i.test(text) ? ["Carga fechada"] : null);
    if (volumeMatch) lead.volume = volumeMatch[0];

    destinationMatch = text.match(/(?:entrega(?:m|r)?|chega(?:r|da)?|destino)\s+(?:em|para|pra|ate|até)\s+([A-Za-zÀ-ÿ][^,.!?\n]{2,41})/i);
    if (!destinationMatch) destinationMatch = text.match(/\b(?:para|pra|ate|até)\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ.'-]*(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ý][A-Za-zÀ-ÿ.'-]*)*(?:\s*[-\/]?\s*[A-Z]{2})?)/);
    if (destinationMatch) lead.destination = destinationMatch[1].trim();
  }

  function inferIntent(text) {
    var normalized = normalizeText(text);
    if (/churrasco|piscina|cozinha|tempero|consumo proprio|minha casa|para casa|\b\d+\s*(?:kg|quilos?|kilos?)\b|\b[12]\s*sac[oa]s?\b|\bum saco\b|\bdois sacos\b/.test(normalized)) return "small";
    if (/falar|atendente|humano|pessoa|me liga|ligar|\bliga\b|contato|numero|whatsapp|telefone|vendedor|reclamac|errad|problema/.test(normalized)) return "human";
    if (/boleto|\bpix\b|cartao|parcel|pagamento|faturamento|fatura|adiantado|a prazo/.test(normalized)) return "payment";
    if (/laudo|granulometria|iodad|refinad|ficha tecnica|especificac|pureza|\b46\b|embalagem|sacaria|documentac|certificac|nota fiscal|origem|procedencia/.test(normalized)) return "spec";
    if (/entrega|frete|chega|prazo|destino|logistica|\bcif\b|\bfob\b/.test(normalized)) return "delivery";
    if (/cota(?:r|cao)|orcamento|preco|valor|custa|quanto|\bqto\b|tabela|\bcompra\b|comprar|comprador|pedido|precis|quero|disponibilidade|disponivel|fornecedor|fornece(?:m|r)?|industria|industrial/.test(normalized)) return "quote";
    if (/insumo|produto|apresentacao|catalogo|conhecer/.test(normalized)) return "products";
    return "";
  }

  function handleTypedAnswer(text) {
    addMessage("user", text);

    if (stage === "start") {
      inferSlots(text);
      lead.intent = inferIntent(text);
      lead.note = text;
      if (!lead.intent && (lead.product || lead.profile || lead.volume || lead.destination)) lead.intent = "quote";
      if (!lead.intent) lead.intent = "doubt";
      if (lead.intent === "small" && lead.volume && !/kg|quilos?|kilos?|^[1-9]\s*sac/i.test(lead.volume)) lead.intent = "quote";
      addIntentAck(lead.intent, /preco|valor|custa|quanto|qto|tabela/.test(normalizeText(text)));
    } else if (stage === "smallgate" || stage === "smallend") {
      inferSlots(text);
      var normalizedGate = normalizeText(text);
      var tiny = /\b\d+\s*(?:kg|quilos?|kilos?)\b|\b[1-9]\s*sac[oa]s?\b|\bum saco\b|\bdois sacos\b|pouquinho|\bpouco\b/.test(normalizedGate);
      var bulky = /tonelada|\btons?\b|\b\d+\s*t\b|big ?bag|carreta|carga|caminhao|\d{2,}\s*sac/.test(normalizedGate);
      if (tiny && !bulky) {
        smallEnd();
        return;
      }
      lead.intent = "quote";
      lead.disqualified = false;
      routeToNextQuestion();
      return;
    } else if (stage === "product") {
      inferSlots(text);
      if (!lead.product) lead.product = text;
    } else if (stage === "profile") {
      inferSlots(text);
      if (!lead.profile) lead.profile = text;
    } else if (stage === "volume") {
      lead.volume = text;
    } else if (stage === "destination") {
      lead.destination = text;
    }

    routeToNextQuestion();
  }

  function buildWhatsappMessage() {
    var lines = ["Olá, Gonzaga. Vim pelo atendimento guiado do site.", ""];

    if (lead.intent === "quote") lines.push("Quero solicitar uma cotação.");
    if (lead.intent === "delivery") lines.push("Quero consultar uma entrega.");
    if (lead.intent === "products") lines.push("Quero entender qual produto é mais adequado para minha operação.");
    if (lead.intent === "payment") lines.push("Quero entender as formas de pagamento para uma compra em volume.");
    if (lead.intent === "spec") lines.push("Quero confirmar especificação e documentação de produto.");
    if (lead.intent === "human") lines.push("Quero falar diretamente com você.");
    if (lead.intent === "doubt") lines.push("Quero tirar uma dúvida.");

    if (lead.product) lines.push("Produto: " + lead.product);
    if (lead.profile) lines.push("Operação: " + lead.profile);
    if (lead.volume) lines.push("Volume estimado: " + lead.volume);
    if (lead.destination) lines.push("Destino: " + lead.destination);
    if (lead.note) lines.push("Observação: " + lead.note);

    lines.push("");
    if (lead.intent === "delivery") lines.push("Pode verificar a possibilidade de entrega e o prazo para esse destino?");
    else if (lead.intent === "products") lines.push("Pode me orientar sobre a apresentação mais adequada?");
    else if (lead.intent === "payment") lines.push("Pode me passar as formas de pagamento e a condição para essa compra?");
    else if (lead.intent === "spec") lines.push("Pode confirmar a especificação e a documentação na cotação?");
    else if (lead.intent === "human") lines.push("Quando puder, gostaria de falar com você.");
    else if (lead.intent === "doubt") lines.push("Pode me ajudar com essa dúvida?");
    else lines.push("Pode me passar a condição comercial e a programação de fornecimento?");

    return lines.join("\n");
  }

  function appendSummary() {
    var summary = document.createElement("div");
    summary.className = "sales-chat__summary";

    var title = document.createElement("strong");
    title.textContent = "Resumo para o WhatsApp";
    summary.appendChild(title);

    var details = [];
    if (lead.product) details.push(lead.product);
    if (lead.volume) details.push(lead.volume);
    if (lead.destination) details.push(lead.destination);

    var description = document.createElement("p");
    description.textContent = details.length ? details.join(" | ") : intentLabels[lead.intent];
    summary.appendChild(description);
    log.appendChild(summary);
    scrollConversation();
  }

  function finishConversation() {
    var qualified;
    stage = "finished";
    busy = true;
    choices.replaceChildren();
    setComposer("Mensagem pronta", true);
    var typing = addTyping();

    window.setTimeout(function () {
      typing.remove();
      addMessage("bot", "Pronto. Os dados estão estruturados para o Junior.");
      appendSummary();

      var link = document.createElement("a");
      link.className = "sales-chat__whatsapp";
      link.href = "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(buildWhatsappMessage());
      link.target = "_blank";
      link.rel = "noopener";
      link.setAttribute("data-wa", "assistente-guiado");
      qualified = isQualifiedLead();
      link.setAttribute("data-lead-qualified", qualified ? "true" : "false");
      if (qualified) {
        link.setAttribute("data-lead-product", lead.product);
        link.setAttribute("data-lead-profile", lead.profile || "");
      }
      link.innerHTML = '<svg class="ico icon-premium" viewBox="0 0 256 256" aria-hidden="true"><use href="assets/phosphor-premium.svg#ph-whatsapp-logo"></use></svg><span>Continuar no WhatsApp</span>';
      choices.appendChild(link);

      var note = document.createElement("p");
      note.className = "sales-chat__ready-note";
      note.textContent = "A mensagem abrirá preenchida para você revisar e enviar.";
      choices.appendChild(note);
      busy = false;
    }, responseDelay);
  }

  launcher.addEventListener("click", function () {
    window.clearTimeout(proactiveTimer);
    openedByUser = true;
    setPanelOpen(true, true);
  });

  closeButton.addEventListener("click", function () {
    safeSessionSet("junior-assistant-prompted", "1");
    setPanelOpen(false, false);
    launcher.focus();
  });

  scrim.addEventListener("click", function () {
    safeSessionSet("junior-assistant-prompted", "1");
    setPanelOpen(false, false);
  });

  resetButton.addEventListener("click", function () {
    resetConversation();
    var firstChoice = choices.querySelector("button");
    if (firstChoice) firstChoice.focus();
  });

  form.addEventListener("submit", function (event) {
    var text;
    event.preventDefault();
    if (busy) return;
    text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }
    input.value = "";
    handleTypedAnswer(text);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && root.getAttribute("data-open") === "true") {
      setPanelOpen(false, false);
      if (openedByUser) launcher.focus();
    }
  });

  document.addEventListener("click", function (event) {
    if (event.target.closest("[data-wa]")) {
      window.clearTimeout(proactiveTimer);
      safeSessionSet("junior-assistant-prompted", "1");
    }
  });

  resetConversation();

  if (hero && "IntersectionObserver" in window) {
    root.setAttribute("data-hero-visible", "true");
    var heroObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        root.setAttribute("data-hero-visible", entry.isIntersecting ? "true" : "false");
        if (!entry.isIntersecting && root.getAttribute("data-open") !== "true") {
          root.setAttribute("data-attention", "true");
          window.setTimeout(function () {
            root.removeAttribute("data-attention");
          }, 3600);
        }
      });
    }, { threshold: 0.08 });
    heroObserver.observe(hero);
  }

  if (contactSection && "IntersectionObserver" in window) {
    var contactObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        root.setAttribute("data-contact-visible", entry.isIntersecting ? "true" : "false");
      });
    }, { threshold: 0.12 });
    contactObserver.observe(contactSection);
  }

  if (!safeSessionGet("junior-assistant-prompted")) {
    proactiveTimer = window.setTimeout(function () {
      if (document.visibilityState === "visible" && root.getAttribute("data-open") !== "true") {
        safeSessionSet("junior-assistant-prompted", "1");
        root.setAttribute("data-attention", "true");
        window.setTimeout(function () {
          root.removeAttribute("data-attention");
        }, 5200);
      }
    }, window.matchMedia("(max-width: 560px)").matches ? 6200 : 4800);
  }
})();
