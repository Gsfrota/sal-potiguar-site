(function () {
  "use strict";

  var TRACKING_VERSION = "2026-07-23.7";
  var GOOGLE_ADS_ID = "AW-18304080818";
  var GOOGLE_ADS_LEAD_DESTINATION = "AW-18304080818/eQfICP6t_dQcELK3iJhE";
  var WHATSAPP_HANDOFF_PATH = "/whatsapp.html";
  var SESSION_ATTRIBUTION_KEY = "junior-sal-attribution-v1";
  var SESSION_LEAD_KEY = "junior-sal-lead-v1";
  var SESSION_TRANSACTION_KEY = "junior-sal-transaction-v1";
  var query = new URLSearchParams(window.location.search);
  var debug = query.get("tracking_debug") === "1";
  var dryRun = query.get("tracking_dry_run") === "1";
  var formStarted = false;
  var sectionViews = Object.create(null);
  var scrollMarks = Object.create(null);
  var videoMarks = Object.create(null);

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

  function clean(value, maxLength) {
    if (value === undefined || value === null || value === "") return undefined;
    return String(value)
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, maxLength || 100);
  }

  function compact(object) {
    var output = {};
    Object.keys(object || {}).forEach(function (key) {
      var value = object[key];
      if (value !== undefined && value !== null && value !== "") output[key] = value;
    });
    return output;
  }

  function readAttribution() {
    var saved = safeSessionGet(SESSION_ATTRIBUTION_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (error) {
        safeSessionSet(SESSION_ATTRIBUTION_KEY, "");
      }
    }

    var attribution = compact({
      traffic_source: clean(query.get("utm_source"), 80) || "direct",
      traffic_medium: clean(query.get("utm_medium"), 80) || "none",
      traffic_campaign: clean(query.get("utm_campaign"), 100),
      traffic_term: clean(query.get("utm_term"), 100),
      traffic_content: clean(query.get("utm_content"), 100),
      gad_source: clean(query.get("gad_source"), 20),
      gad_campaign_id: clean(query.get("gad_campaignid"), 40),
      has_gclid: query.has("gclid") ? "yes" : "no",
      has_gbraid: query.has("gbraid") ? "yes" : "no",
      has_wbraid: query.has("wbraid") ? "yes" : "no",
      landing_path: clean(window.location.pathname, 120),
      referrer_host: document.referrer ? clean((function () {
        try {
          return new URL(document.referrer).hostname;
        } catch (error) {
          return "invalid";
        }
      })(), 100) : "direct"
    });

    safeSessionSet(SESSION_ATTRIBUTION_KEY, JSON.stringify(attribution));
    return attribution;
  }

  function makeTransactionId() {
    var current = safeSessionGet(SESSION_TRANSACTION_KEY);
    if (current) return current;

    var randomPart;
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      randomPart = window.crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    } else {
      randomPart = Math.random().toString(36).slice(2, 12);
    }

    current = "jsal-" + Date.now().toString(36) + "-" + randomPart;
    safeSessionSet(SESSION_TRANSACTION_KEY, current);
    return current;
  }

  var attribution = readAttribution();

  function commonParameters() {
    return compact({
      tracking_version: TRACKING_VERSION,
      page_path: window.location.pathname,
      page_title: clean(document.title, 100),
      device_group: window.matchMedia("(max-width: 720px)").matches ? "mobile" : "desktop",
      traffic_source: attribution.traffic_source,
      traffic_medium: attribution.traffic_medium,
      traffic_campaign: attribution.traffic_campaign,
      traffic_term: attribution.traffic_term,
      traffic_content: attribution.traffic_content,
      gad_source: attribution.gad_source,
      gad_campaign_id: attribution.gad_campaign_id,
      has_gclid: attribution.has_gclid,
      has_gbraid: attribution.has_gbraid,
      has_wbraid: attribution.has_wbraid,
      landing_path: attribution.landing_path,
      referrer_host: attribution.referrer_host
    });
  }

  function debugLog(name, parameters) {
    if (!debug) return;
    window.console.info("[Junior Tracking]", name, parameters);
  }

  function pushAuditEvent(name, parameters) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(compact({
      event: "junior_tracking",
      tracking_event: name,
      tracking_version: TRACKING_VERSION,
      event_parameters: parameters
    }));
  }

  function trackEvent(name, parameters) {
    var payload = Object.assign({}, commonParameters(), compact(parameters || {}));
    pushAuditEvent(name, payload);
    debugLog(name, payload);

    if (!dryRun && typeof window.gtag === "function") {
      window.gtag("event", name, payload);
    }

    return payload;
  }

  function productFromSource(source) {
    var products = {
      "produto-sal": "sal_branco",
      "produto-ureia": "ureia",
      "produto-fosfato": "fosfato"
    };
    return products[source] || undefined;
  }

  function sectionFromElement(element) {
    var section = element && element.closest ? element.closest("section") : null;
    if (!section) return "global";
    return clean(section.id || section.className.split(" ")[0], 60) || "global";
  }

  function trackConversion(source, details) {
    var sourceName = clean(source, 80) || "unknown";
    var metadata = compact(details || {});
    var alreadySent = safeSessionGet(SESSION_LEAD_KEY) === "sent";
    var transactionId = makeTransactionId();

    if (alreadySent) {
      trackEvent("lead_repeat_action", Object.assign({
        lead_source: sourceName,
        transaction_id: transactionId
      }, metadata));
      return false;
    }

    safeSessionSet(SESSION_LEAD_KEY, "sent");

    var conversionPayload = Object.assign({}, commonParameters(), metadata, {
      send_to: GOOGLE_ADS_LEAD_DESTINATION,
      transaction_id: transactionId,
      lead_source: sourceName,
      transport_type: "beacon",
      event_timeout: 2000
    });

    pushAuditEvent("google_ads_conversion", conversionPayload);
    debugLog("google_ads_conversion", conversionPayload);

    if (!dryRun && typeof window.gtag === "function") {
      window.gtag("event", "conversion", conversionPayload);
    }

    trackEvent("generate_lead", Object.assign({
      method: sourceName === "form" ? "form" : "whatsapp",
      lead_source: sourceName,
      transaction_id: transactionId
    }, metadata));

    return true;
  }

  function trackWhatsApp(anchor) {
    var source = clean(anchor.getAttribute("data-wa"), 80) || "whatsapp";
    var product = productFromSource(source);
    var section = sectionFromElement(anchor);
    var qualifiedByAssistant = source === "assistente-guiado"
      && anchor.getAttribute("data-lead-qualified") === "true";
    var qualificationPath = qualifiedByAssistant ? "assistant" : "direct_contact";

    trackEvent("whatsapp_click", {
      cta_id: source,
      section_id: section,
      product: product,
      link_domain: "wa.me",
      qualification_status: qualifiedByAssistant ? "qualified" : "intent"
    });

    if (qualifiedByAssistant) {
      trackConversion("assistant_qualified", {
        section_id: section,
        product: clean(anchor.getAttribute("data-lead-product"), 60),
        profile: clean(anchor.getAttribute("data-lead-profile"), 80),
        qualification_path: qualificationPath,
        volume_provided: "yes",
        destination_provided: "yes"
      });
      return;
    }

    trackEvent("contact_intent", {
      cta_id: source,
      section_id: section,
      product: product,
      qualification_path: qualificationPath
    });
  }

  function makeWhatsAppHandoffUrl(destination, source) {
    var whatsappUrl;
    var message = "";
    var payload = new URLSearchParams();
    var handoffUrl = new URL(WHATSAPP_HANDOFF_PATH, window.location.origin);

    try {
      whatsappUrl = new URL(destination);
      message = whatsappUrl.searchParams.get("text") || "";
    } catch (error) {
      message = "";
    }

    payload.set("text", message);
    payload.set("source", clean(source, 80) || "site");
    handoffUrl.hash = payload.toString();
    return handoffUrl.href;
  }

  function prepareWhatsAppLink(anchor) {
    var originalHref = anchor.getAttribute("data-whatsapp-href") || anchor.href;
    if (!originalHref || originalHref.indexOf("wa.me") === -1) return;

    anchor.setAttribute("data-whatsapp-href", originalHref);
    anchor.href = makeWhatsAppHandoffUrl(originalHref, anchor.getAttribute("data-wa"));
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }

  function installClickTracking() {
    document.querySelectorAll('a[href*="wa.me"]').forEach(prepareWhatsAppLink);

    document.addEventListener("click", function (event) {
      var target = event.target.closest("a, button, summary");
      if (!target) return;

      var whatsapp = target.closest('a[data-whatsapp-href], a[href*="wa.me"]');
      if (whatsapp) {
        prepareWhatsAppLink(whatsapp);
        trackWhatsApp(whatsapp);
        return;
      }

      if (target.id === "sales-assistant-launcher") {
        trackEvent("chatbot_open", { section_id: "assistant" });
        return;
      }

      if (target.classList.contains("sales-chat__choice")) {
        trackEvent("chatbot_choice", {
          section_id: "assistant",
          choice_label: clean(target.textContent, 80)
        });
        return;
      }

      if (target.id === "sales-chat-reset") {
        trackEvent("chatbot_reset", { section_id: "assistant" });
        return;
      }

      if (target.matches(".faq summary")) {
        var detail = target.closest("details");
        if (detail && detail.open) return;
        var faqItems = Array.prototype.slice.call(document.querySelectorAll(".faq details"));
        trackEvent("faq_open", {
          section_id: "faq",
          faq_index: faqItems.indexOf(detail) + 1,
          faq_question: clean(target.textContent, 100)
        });
        return;
      }

      if (target.matches('.nav a[href^="#"], .hero__cta a[href^="#"], .foot a[href^="#"]')) {
        trackEvent("navigation_click", {
          section_id: sectionFromElement(target),
          target_section: clean(target.getAttribute("href").replace("#", ""), 60),
          link_text: clean(target.textContent, 80)
        });
        return;
      }

      if (target.matches('a[href^="http"]')) {
        var destination;
        try {
          destination = new URL(target.href);
        } catch (error) {
          return;
        }
        if (destination.hostname !== window.location.hostname) {
          trackEvent("outbound_click", {
            section_id: sectionFromElement(target),
            link_domain: clean(destination.hostname, 100),
            link_text: clean(target.textContent, 80)
          });
        }
      }
    }, true);
  }

  function installFormTracking() {
    var form = document.getElementById("lead-form");
    if (!form) return;

    form.addEventListener("focusin", function () {
      if (formStarted) return;
      formStarted = true;
      trackEvent("form_start", {
        form_id: "lead-form",
        section_id: "contato"
      });
    });

    form.addEventListener("submit", function () {
      var invalid = Array.prototype.slice.call(form.querySelectorAll("[required]"))
        .filter(function (field) { return !field.checkValidity(); })
        .map(function (field) { return field.name || field.id; });

      if (invalid.length) {
        trackEvent("form_error", {
          form_id: "lead-form",
          section_id: "contato",
          missing_fields: invalid.join("|")
        });
        return;
      }

      var productField = document.getElementById("f-produto");
      var nameField = document.getElementById("f-nome");
      var emailField = document.getElementById("f-email");
      var phoneField = document.getElementById("f-telefone");
      trackEvent("form_submit", {
        form_id: "lead-form",
        section_id: "contato",
        product: clean(productField && productField.value, 60),
        name_provided: nameField && nameField.value ? "yes" : "no",
        email_provided: emailField && emailField.value ? "yes" : "no",
        phone_provided: phoneField && phoneField.value ? "yes" : "no",
        volume_provided: document.getElementById("f-volume").value ? "yes" : "no",
        destination_provided: document.getElementById("f-cidade").value ? "yes" : "no",
        observation_provided: document.getElementById("f-obs").value ? "yes" : "no"
      });
    });
  }

  function installSectionTracking() {
    if (!("IntersectionObserver" in window)) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id || entry.target.className.split(" ")[0];
        if (!id || sectionViews[id]) return;
        sectionViews[id] = true;
        trackEvent("section_view", { section_id: clean(id, 60) });
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.35 });

    document.querySelectorAll("main > section").forEach(function (section) {
      observer.observe(section);
    });
  }

  function installScrollTracking() {
    var marks = [25, 50, 75, 90];
    var ticking = false;

    function measure() {
      ticking = false;
      var available = document.documentElement.scrollHeight - window.innerHeight;
      var depth = available > 0 ? Math.round((window.scrollY / available) * 100) : 100;
      marks.forEach(function (mark) {
        if (depth >= mark && !scrollMarks[mark]) {
          scrollMarks[mark] = true;
          trackEvent("scroll_depth", { percent_scrolled: mark });
        }
      });
    }

    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(measure);
    }, { passive: true });
  }

  function installVideoTracking() {
    var video = document.querySelector("#marca video");
    if (!video) return;
    var videoId = "operacao_sal_potiguar";

    video.addEventListener("play", function () {
      if (videoMarks.play) return;
      videoMarks.play = true;
      trackEvent("video_start", { video_id: videoId, section_id: "marca" });
    });

    video.addEventListener("timeupdate", function () {
      if (!video.duration || !Number.isFinite(video.duration)) return;
      var percent = Math.floor((video.currentTime / video.duration) * 100);
      [25, 50, 75].forEach(function (mark) {
        if (percent >= mark && !videoMarks[mark]) {
          videoMarks[mark] = true;
          trackEvent("video_progress", {
            video_id: videoId,
            section_id: "marca",
            video_percent: mark
          });
        }
      });
    });

    video.addEventListener("ended", function () {
      if (videoMarks.complete) return;
      videoMarks.complete = true;
      trackEvent("video_complete", { video_id: videoId, section_id: "marca" });
    });
  }

  function installEngagementTracking() {
    window.setTimeout(function () {
      if (document.visibilityState !== "visible") return;
      trackEvent("engaged_visit", { engagement_time_seconds: 30 });
    }, 30000);
  }

  window.JuniorTracking = {
    version: TRACKING_VERSION,
    googleAdsId: GOOGLE_ADS_ID,
    conversionDestination: GOOGLE_ADS_LEAD_DESTINATION,
    attribution: attribution,
    event: trackEvent,
    lead: trackConversion,
    getState: function () {
      return {
        version: TRACKING_VERSION,
        googleAdsId: GOOGLE_ADS_ID,
        conversionDestination: GOOGLE_ADS_LEAD_DESTINATION,
        attribution: attribution,
        conversionSent: safeSessionGet(SESSION_LEAD_KEY) === "sent",
        transactionId: safeSessionGet(SESSION_TRANSACTION_KEY),
        debug: debug,
        dryRun: dryRun
      };
    }
  };

  window.trackLead = function (source, details) {
    return trackConversion(source, details);
  };

  window.openWhatsAppHandoff = function (destination, source) {
    return window.open(makeWhatsAppHandoffUrl(destination, source), "_blank", "noopener");
  };

  function initialize() {
    installClickTracking();
    installFormTracking();
    installSectionTracking();
    installScrollTracking();
    installVideoTracking();
    installEngagementTracking();
    trackEvent("tracking_ready", { google_ads_id: GOOGLE_ADS_ID });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
