(function () {
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id"];
  var STORAGE_KEY = "korpasset_go_utm";
  var DONE_KEY = "korpasset_go_done";

  function root() {
    return document.querySelector(".go");
  }

  function readUrlCampaign() {
    var params = new URLSearchParams(window.location.search);
    var campaign = {};
    for (var i = 0; i < UTM_KEYS.length; i += 1) {
      var value = params.get(UTM_KEYS[i]);
      if (value) campaign[UTM_KEYS[i]] = value;
    }
    var variant = params.get("h");
    if (variant === "a" || variant === "b" || variant === "c") campaign.h = variant;
    var fbclid = params.get("fbclid");
    if (fbclid) campaign.fbclid = fbclid;
    return campaign;
  }

  function readStored() {
    try {
      if (!window.sessionStorage) return {};
      var raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (ignore) {
      return {};
    }
  }

  function persist(campaign) {
    var stored = {};
    for (var i = 0; i < UTM_KEYS.length; i += 1) {
      if (campaign[UTM_KEYS[i]]) stored[UTM_KEYS[i]] = campaign[UTM_KEYS[i]];
    }
    if (campaign.h) stored.h = campaign.h;
    try {
      if (window.sessionStorage) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch (ignore) {}
  }

  function campaign() {
    var page = root();
    var merged = readStored();
    var fromUrl = readUrlCampaign();
    var key;
    for (key in fromUrl) {
      if (Object.prototype.hasOwnProperty.call(fromUrl, key)) merged[key] = fromUrl[key];
    }
    if (!merged.h && page) merged.h = page.getAttribute("data-variant") || "a";
    persist(merged);
    return merged;
  }

  function searchFrom(data) {
    var params = new URLSearchParams();
    var keys = UTM_KEYS.concat(["fbclid", "h"]);
    for (var i = 0; i < keys.length; i += 1) {
      if (data[keys[i]]) params.append(keys[i], data[keys[i]]);
    }
    var serialized = params.toString();
    return serialized ? "?" + serialized : "";
  }

  function keepCampaignOnLinks(data) {
    var search = searchFrom(data);
    var links = document.querySelectorAll("a[href^='/']");
    for (var i = 0; i < links.length; i += 1) {
      var href = links[i].getAttribute("href") || "";
      if (href.indexOf("/kom-igang/event") === 0) continue;
      var hash = "";
      var hashAt = href.indexOf("#");
      if (hashAt >= 0) {
        hash = href.slice(hashAt);
        href = href.slice(0, hashAt);
      }
      var path = href.split("?")[0];
      links[i].setAttribute("href", path + search + hash);
    }
    var forms = document.querySelectorAll("[data-android-form]");
    for (var f = 0; f < forms.length; f += 1) {
      var action = forms[f].getAttribute("action") || "/kom-igang/android";
      forms[f].setAttribute("action", action.split("?")[0] + search);
    }
  }

  function devicePlatform() {
    var ua = navigator.userAgent || "";
    var touchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    if (/iPhone|iPad|iPod/i.test(ua) || touchMac) return "ios";
    if (/Android/i.test(ua)) return "android";
    return "";
  }

  var pendingConsent = [];

  function track(name, fields) {
    var page = root();
    var data = campaign();
    var payload = {
      event: name,
      variant: (page && page.getAttribute("data-variant")) || data.h || "a",
      placement: fields.placement || "",
      platform: fields.platform || "",
      utm_source: data.utm_source || "",
      utm_medium: data.utm_medium || "",
      utm_campaign: data.utm_campaign || "",
      utm_content: data.utm_content || "",
      utm_term: data.utm_term || "",
    };
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/kom-igang/event", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/kom-igang/event", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: body,
          keepalive: true,
        });
      }
    } catch (ignore) {}
    pendingConsent.push({ payload: payload, analytics: false, marketing: false });
    flushConsent();
  }

  function flushConsent() {
    var consent = window.korpassetConsent;
    if (!consent || typeof consent.get !== "function") return;
    var choice = consent.get();
    for (var i = 0; i < pendingConsent.length; i += 1) {
      var item = pendingConsent[i];
      if (choice.analytics && !item.analytics && typeof window.gtag === "function") {
        window.gtag("event", item.payload.event, item.payload);
        item.analytics = true;
      }
      if (choice.marketing && !item.marketing && typeof window.fbq === "function") {
        window.fbq("trackCustom", item.payload.event, item.payload);
        item.marketing = true;
      }
    }
  }

  var tracked = {};

  function trackOnce(key, name, fields) {
    if (tracked[key]) return;
    tracked[key] = true;
    track(name, fields);
  }

  function placementEvent(placement) {
    if (placement === "hero") return "hero_cta_click";
    if (placement === "product") return "product_cta_click";
    if (placement === "final") return "final_cta_click";
    return "";
  }

  function openAndroid(placement) {
    var details = document.getElementById("android-notify");
    if (!details) details = document.getElementById("android-final");
    if (!details) return;
    details.open = true;
    if (details.scrollIntoView) details.scrollIntoView({ block: "nearest" });
    var email = details.querySelector("input[type='email']");
    if (email) email.focus();
    trackOnce("android-start", "android_notify_started", {
      platform: "android",
      placement: placement || "hero",
    });
  }

  function showAndroidSuccess() {
    var forms = document.querySelectorAll("[data-android-form]");
    for (var i = 0; i < forms.length; i += 1) {
      var fields = forms[i].querySelector("[data-android-fields]");
      var success = forms[i].querySelector("[data-android-success]");
      if (fields) fields.hidden = true;
      if (success) success.hidden = false;
      var details = forms[i].closest("details");
      if (details) details.open = true;
    }
  }

  function bindForms() {
    var forms = document.querySelectorAll("[data-android-form]");
    for (var i = 0; i < forms.length; i += 1) {
      forms[i].addEventListener("submit", function (event) {
        var form = event.currentTarget;
        if (!window.fetch || !form) return;
        event.preventDefault();
        var submit = form.querySelector("button[type='submit']");
        if (submit) submit.disabled = true;
        fetch(form.getAttribute("action") || "/kom-igang/android", {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams(new FormData(form)),
        })
          .then(function (response) {
            return response.json().then(function (payload) {
              if (!response.ok) {
                var message = payload && payload.message ? payload.message : "Kunde inte spara mejladressen.";
                throw new Error(message);
              }
              showAndroidSuccess();
              trackOnce("android-done", "android_notify_completed", {
                platform: "android",
                placement: "form",
              });
            });
          })
          .catch(function () {
            if (submit) submit.disabled = false;
            HTMLFormElement.prototype.submit.call(form);
          });
      });
    }
  }

  function bindClicks() {
    document.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var control = target.closest("[data-cta-kind]");
      if (!control) return;
      var kind = control.getAttribute("data-cta-kind");
      var placement = control.getAttribute("data-cta-placement") || "";
      var named = placementEvent(placement);
      var platform = kind === "store" ? "ios" : "android";
      if (named && control.tagName !== "SUMMARY") {
        track(named, { platform: platform, placement: placement });
      }
      if (kind === "store") {
        track("app_store_click", { platform: "ios", placement: placement });
      }
      if (kind === "play") {
        track("google_play_click", { platform: "android", placement: placement });
      }
      if (kind === "android" && control.tagName !== "SUMMARY") {
        event.preventDefault();
        openAndroid(placement);
      }
      if (kind === "android" && control.tagName === "SUMMARY") {
        var details = control.closest("details");
        if (details && details.open) return;
        if (named) track(named, { platform: "android", placement: placement });
        trackOnce("android-start", "android_notify_started", {
          platform: "android",
          placement: placement,
        });
      }
    });
  }

  function bindSticky() {
    var bar = document.querySelector("[data-go-sticky]");
    var heroCta = document.querySelector("[data-cta-placement='hero'][data-cta-kind='store']");
    if (!bar || !heroCta || typeof IntersectionObserver !== "function") return;
    var page = root();
    var platform = devicePlatform();
    var link = bar.querySelector("a");
    if (platform === "android" && link && page) {
      if (page.getAttribute("data-play-live") === "1") {
        link.href = page.getAttribute("data-play-url") || link.href;
        link.setAttribute("data-cta-kind", "play");
      } else {
        link.href = "#android-notify";
        link.setAttribute("data-cta-kind", "android");
        link.textContent = "Lämna mejl";
      }
    }
    var observer = new IntersectionObserver(
      function (entries) {
        var entry = entries[0];
        if (!entry) return;
        var past = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        bar.hidden = !past;
      },
      { threshold: 0 },
    );
    observer.observe(heroCta);
  }

  function bindDone() {
    var page = root();
    if (!page) return;
    var done = page.getAttribute("data-android-done");
    if (!done) return;
    var seen = "";
    try {
      seen = window.sessionStorage ? window.sessionStorage.getItem(DONE_KEY) || "" : "";
      if (seen.indexOf(done) !== -1) return;
      if (window.sessionStorage) window.sessionStorage.setItem(DONE_KEY, (seen + " " + done).slice(-240));
    } catch (ignore) {}
    trackOnce("android-done", "android_notify_completed", {
      platform: "android",
      placement: "form",
    });
  }

  function init() {
    var data = campaign();
    keepCampaignOnLinks(data);
    trackOnce("landing", "landing_view", { platform: devicePlatform(), placement: "" });
    bindClicks();
    bindForms();
    bindSticky();
    bindDone();
    if (window.korpassetConsent && typeof window.korpassetConsent.onChange === "function") {
      window.korpassetConsent.onChange(flushConsent);
    }
    flushConsent();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
