(function () {
  var config = window.KORPASSET_CONSENT_CONFIG || {};
  var VERSION = Number(config.version) || 1;
  var COOKIE_NAME = config.cookieName || "korpasset_consent";
  var MAX_AGE = Number(config.maxAgeSeconds) || 15552000;
  var GA_ID = typeof config.gaMeasurementId === "string" ? config.gaMeasurementId : "";
  var listeners = [];
  var marketingTools = [];
  var gaLoaded = false;
  var root = document.querySelector("[data-consent-root]");
  var banner = document.querySelector(".consent__banner");
  var panel = document.querySelector(".consent__panel");
  var reopen = document.querySelector(".consent__reopen");
  var analyticsInput = document.querySelector("[data-consent-analytics]");
  var marketingInput = document.querySelector("[data-consent-marketing]");

  if (!root || !banner || !panel || !reopen || !analyticsInput || !marketingInput) return;

  function parse(raw) {
    if (!raw) return null;
    var match = /^v(\d+)\.a([01])\.m([01])\.(\d+)$/.exec(raw);
    if (!match) return null;
    if (Number(match[1]) !== VERSION) return null;
    var at = Number(match[4]);
    if (!at || Math.floor(Date.now() / 1000) - at > MAX_AGE) return null;
    return {
      necessary: true,
      analytics: match[2] === "1",
      marketing: match[3] === "1",
      decided: true,
      at: at,
    };
  }

  function readCookie() {
    var parts = document.cookie ? document.cookie.split("; ") : [];
    for (var i = 0; i < parts.length; i += 1) {
      var item = parts[i];
      if (item.indexOf(COOKIE_NAME + "=") === 0) {
        return decodeURIComponent(item.slice(COOKIE_NAME.length + 1));
      }
    }
    return "";
  }

  function current() {
    return (
      parse(readCookie()) || {
        necessary: true,
        analytics: false,
        marketing: false,
        decided: false,
        at: 0,
      }
    );
  }

  function writeCookie(choice) {
    var value =
      "v" +
      VERSION +
      ".a" +
      (choice.analytics ? "1" : "0") +
      ".m" +
      (choice.marketing ? "1" : "0") +
      "." +
      Math.floor(Date.now() / 1000);
    var secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      COOKIE_NAME +
      "=" +
      encodeURIComponent(value) +
      "; Path=/; Max-Age=" +
      MAX_AGE +
      "; SameSite=Lax" +
      secure;
  }

  function cookieDomains(hostname) {
    var domains = [""];
    if (!hostname || hostname === "localhost" || /^[\d.]+$/.test(hostname)) {
      if (hostname) domains.push(hostname);
      return domains;
    }
    var parts = hostname.split(".").filter(Boolean);
    domains.push(hostname);
    domains.push("." + hostname);
    for (var i = 1; i <= parts.length - 2; i += 1) {
      var parent = parts.slice(i).join(".");
      domains.push(parent);
      domains.push("." + parent);
    }
    return domains;
  }

  function deleteCookie(name) {
    var domains = cookieDomains(location.hostname);
    for (var i = 0; i < domains.length; i += 1) {
      var domain = domains[i] ? "; Domain=" + domains[i] : "";
      document.cookie = name + "=; Path=/; Max-Age=0; SameSite=Lax" + domain;
    }
  }

  function clearMatching(pattern) {
    var parts = document.cookie ? document.cookie.split("; ") : [];
    for (var i = 0; i < parts.length; i += 1) {
      var name = parts[i].split("=")[0];
      if (pattern.test(name)) deleteCookie(name);
    }
  }

  function notify() {
    var choice = current();
    listeners.forEach(function (listener) {
      listener(choice);
    });
  }

  function loadGoogleAnalytics(choice) {
    if (!GA_ID || gaLoaded || !choice.analytics) return;
    gaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
      functionality_storage: "denied",
      personalization_storage: "denied",
      security_storage: "granted",
      wait_for_update: 500,
    });
    window.gtag("consent", "update", {
      analytics_storage: "granted",
      ad_storage: choice.marketing ? "granted" : "denied",
      ad_user_data: choice.marketing ? "granted" : "denied",
      ad_personalization: choice.marketing ? "granted" : "denied",
    });
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, { anonymize_ip: true });
    var script = document.createElement("script");
    script.async = true;
    script.src =
      "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA_ID);
    document.head.appendChild(script);
  }

  function runMarketingTools(choice) {
    if (!choice.marketing) return;
    marketingTools.splice(0).forEach(function (tool) {
      try {
        tool();
      } catch (ignore) {}
    });
  }

  function setGaDisabled(disabled) {
    if (!GA_ID) return;
    window["ga-disable-" + GA_ID] = disabled;
  }

  function syncGoogle(choice) {
    if (!GA_ID) return;
    if (!choice.analytics) {
      setGaDisabled(true);
      return;
    }
    setGaDisabled(false);
    if (!gaLoaded) {
      loadGoogleAnalytics(choice);
      return;
    }
    window.gtag("consent", "update", {
      analytics_storage: "granted",
      ad_storage: choice.marketing ? "granted" : "denied",
      ad_user_data: choice.marketing ? "granted" : "denied",
      ad_personalization: choice.marketing ? "granted" : "denied",
    });
  }

  function apply(choice) {
    if (!choice.analytics) clearMatching(/^(_ga|_gid|_gat)/);
    if (!choice.marketing) clearMatching(/^_gcl_/);
    syncGoogle(choice);
    if (choice.marketing) runMarketingTools(choice);
    notify();
  }

  function save(partial) {
    writeCookie({
      analytics: Boolean(partial.analytics),
      marketing: Boolean(partial.marketing),
    });
    apply(current());
  }

  function closeBanner() {
    banner.hidden = true;
    panel.hidden = true;
    root.hidden = true;
    reopen.hidden = false;
  }

  function syncChecks() {
    var choice = current();
    analyticsInput.checked = choice.analytics;
    marketingInput.checked = choice.marketing;
  }

  function openBanner() {
    syncChecks();
    panel.hidden = true;
    banner.hidden = false;
    root.hidden = false;
    reopen.hidden = true;
    var first = banner.querySelector("button");
    if (first) first.focus();
  }

  function openPanel() {
    syncChecks();
    banner.hidden = true;
    panel.hidden = false;
    root.hidden = false;
    reopen.hidden = true;
    analyticsInput.focus();
  }

  function acceptAll() {
    save({ analytics: true, marketing: true });
    closeBanner();
  }

  function rejectOptional() {
    save({ analytics: false, marketing: false });
    closeBanner();
  }

  function saveCustom() {
    save({
      analytics: analyticsInput.checked,
      marketing: marketingInput.checked,
    });
    closeBanner();
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    var control = target.closest(
      "[data-consent-open],[data-consent-accept],[data-consent-reject],[data-consent-customize],[data-consent-save]",
    );
    if (!control) return;
    if (control.hasAttribute("data-consent-open")) {
      if (control.closest("a, button") && control.tagName !== "BUTTON") event.preventDefault();
      openBanner();
      return;
    }
    event.preventDefault();
    if (control.hasAttribute("data-consent-accept")) acceptAll();
    else if (control.hasAttribute("data-consent-reject")) rejectOptional();
    else if (control.hasAttribute("data-consent-customize")) openPanel();
    else if (control.hasAttribute("data-consent-save")) saveCustom();
  });

  var existing = current();
  if (!existing.decided) {
    setGaDisabled(true);
    clearMatching(/^(_ga|_gid|_gat)/);
    clearMatching(/^_gcl_/);
    openBanner();
  } else {
    root.hidden = true;
    banner.hidden = true;
    panel.hidden = true;
    reopen.hidden = false;
    apply(existing);
  }

  window.korpassetConsent = {
    get: current,
    open: openBanner,
    onChange: function (listener) {
      listeners.push(listener);
      return function () {
        listeners = listeners.filter(function (item) {
          return item !== listener;
        });
      };
    },
    when: function (category, tool) {
      var choice = current();
      if (category === "marketing") {
        if (choice.marketing) tool();
        else marketingTools.push(tool);
        return;
      }
      if (category === "analytics" && choice.analytics) tool();
    },
  };
})();
