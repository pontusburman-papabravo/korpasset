(function () {
  const oauth = window.KORPASSET_OAUTH || {};
  const PENDING_KEY = "korpasset.pendingInvite";
  const DEBUG_KEY = "korpasset.deeplinkDebug";
  const TOKEN = /^[A-Za-z0-9_-]+$/;

  function plugin(name) {
    const cap = window.Capacitor;
    if (!cap || !cap.Plugins) return null;
    return cap.Plugins[name] || null;
  }

  function showError(message) {
    const el = document.getElementById("oauth-error");
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
  }

  function idTokenFrom(result) {
    if (!result) return "";
    return (
      result.result?.idToken ||
      result.idToken ||
      result.result?.accessToken?.idToken ||
      result.authentication?.idToken ||
      ""
    );
  }

  function displayNameFrom(result) {
    const profile = result?.result?.profile || result?.profile || result?.result || {};
    const given = profile.givenName || profile.given_name || "";
    const family = profile.familyName || profile.family_name || "";
    const combined = [given, family].filter(Boolean).join(" ").trim();
    return combined || profile.name || profile.fullName || "";
  }

  function randomNonce() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let hex = "";
    for (let i = 0; i < bytes.length; i += 1) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
  }

  function platform() {
    const cap = window.Capacitor;
    if (!cap || typeof cap.getPlatform !== "function") return "";
    return cap.getPlatform();
  }

  function googleReady() {
    if (platform() === "ios") return Boolean(oauth.googleIosClientId);
    return Boolean(oauth.googleWebClientId);
  }

  async function initialize(SocialLogin) {
    if (!SocialLogin || typeof SocialLogin.initialize !== "function") return;
    const payload = {
      apple: {
        clientId: oauth.appleClientId || "se.korpasset.app",
      },
    };
    if (googleReady()) {
      const google = { mode: "online" };
      if (oauth.googleWebClientId) {
        google.webClientId = oauth.googleWebClientId;
        google.iOSServerClientId = oauth.googleWebClientId;
      }
      if (oauth.googleIosClientId) {
        google.iOSClientId = oauth.googleIosClientId;
      }
      payload.google = google;
    }
    await SocialLogin.initialize(payload);
  }

  async function continueWith(provider) {
    const stack = document.querySelector(".oauth-stack, .oauth-continue");
    const returnTo =
      (stack && stack.getAttribute("data-return-to")) ||
      window.location.pathname + window.location.search;
    const SocialLogin = plugin("SocialLogin");

    if (!SocialLogin || typeof SocialLogin.login !== "function") {
      showError("Öppna Körpasset-appen för att fortsätta med Apple eller Google.");
      return;
    }

    if (provider === "google" && !googleReady()) {
      showError(
        platform() === "ios"
          ? "Google-inloggning på iPhone är inte redo i den här versionen. Fortsätt med Apple."
          : "Google-inloggning är inte redo ännu. Fortsätt med Apple.",
      );
      return;
    }

    try {
      await initialize(SocialLogin);
      const nonce = randomNonce();
      const scopes = provider === "google" ? ["email", "profile"] : ["email", "name"];
      const result = await SocialLogin.login({
        provider,
        options: { scopes: scopes, nonce: nonce },
      });
      const identityToken = idTokenFrom(result);
      if (!identityToken) {
        showError("Inloggningen gav ingen identitet. Försök igen.");
        return;
      }
      const response = await fetch("/api/auth/" + provider, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          identityToken,
          displayName: displayNameFrom(result),
          returnTo,
          nonce: nonce,
        }),
      });
      const body = await response.json().catch(function () {
        return {};
      });
      if (!response.ok) {
        showError(body.error || "Kunde inte logga in. Försök igen.");
        return;
      }
      window.location.assign(body.redirectTo || "/app");
    } catch (error) {
      showError("Inloggningen avbröts. Försök igen.");
    }
  }

  function nativeApp() {
    const cap = window.Capacitor;
    if (!cap) return false;
    if (typeof cap.isNativePlatform === "function") return cap.isNativePlatform();
    if (typeof cap.getPlatform !== "function") return false;
    const name = cap.getPlatform();
    return name === "ios" || name === "android";
  }

  function memoryStore() {
    const data = Object.create(null);
    return {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
      },
      setItem(key, value) {
        data[key] = String(value);
      },
      removeItem(key) {
        delete data[key];
      },
    };
  }

  function storage(override) {
    if (override) return override;
    try {
      if (window.sessionStorage) return window.sessionStorage;
    } catch (error) {
      /* private mode */
    }
    if (!window.__KORPASSET_DEEPLINK_STORE__) {
      window.__KORPASSET_DEEPLINK_STORE__ = memoryStore();
    }
    return window.__KORPASSET_DEEPLINK_STORE__;
  }

  function validToken(value) {
    return typeof value === "string" && TOKEN.test(value) ? value : null;
  }

  function inviteDestination(token) {
    return "/invite/" + token;
  }

  function parseInviteUrl(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;
    let parsed;
    try {
      parsed = new URL(rawUrl.trim());
    } catch (error) {
      return null;
    }
    const scheme = (parsed.protocol || "").replace(/:$/, "").toLowerCase();
    const host = (parsed.hostname || parsed.host || "").toLowerCase();
    const path = parsed.pathname || "";

    if (scheme === "korpasset") {
      if (host === "invite") {
        const token = validToken(path.replace(/^\/+/, "").replace(/\/+$/, ""));
        return token ? { token: token, destination: inviteDestination(token) } : null;
      }
      const match = path.match(/^\/invite\/([A-Za-z0-9_-]+)\/?$/);
      return match ? { token: match[1], destination: inviteDestination(match[1]) } : null;
    }

    if (scheme !== "https" && scheme !== "http") return null;
    if (host !== "korpasset.se" && host !== "www.korpasset.se") return null;
    const match = path.match(/^\/invite\/([A-Za-z0-9_-]+)\/?$/);
    return match ? { token: match[1], destination: inviteDestination(match[1]) } : null;
  }

  function shouldNavigateToPending(currentPath, token) {
    if (!validToken(token)) return false;
    const path = String(currentPath || "").split("?")[0];
    return path !== inviteDestination(token);
  }

  function readPending(store) {
    try {
      return validToken(storage(store).getItem(PENDING_KEY));
    } catch (error) {
      return null;
    }
  }

  function savePending(token, store) {
    const valid = validToken(token);
    if (!valid) return false;
    storage(store).setItem(PENDING_KEY, valid);
    return true;
  }

  function clearPending(store) {
    try {
      storage(store).removeItem(PENDING_KEY);
    } catch (error) {
      /* ignore */
    }
  }

  function deeplinkDebugUiEnabled(ctx) {
    if (ctx && ctx.debugUi === true) return true;
    try {
      const search = (ctx && ctx.search) || window.location.search || "";
      return /(?:^|[?&])deeplink_debug=1(?:&|$)/.test(search);
    } catch (error) {
      return false;
    }
  }

  function diagnose(result, ctx) {
    try {
      console.info("[korpasset-deeplink]", result);
    } catch (error) {
      /* ignore */
    }
    try {
      storage().setItem(DEBUG_KEY, JSON.stringify(result));
    } catch (error) {
      /* ignore */
    }
    if (!deeplinkDebugUiEnabled(ctx)) return;
    try {
      if (!document || typeof document.getElementById !== "function") return;
      let el = document.getElementById("deeplink-debug");
      if (!el && document.body && typeof document.createElement === "function") {
        el = document.createElement("pre");
        el.id = "deeplink-debug";
        el.className = "muted";
        el.setAttribute("data-deeplink-debug", "1");
        document.body.appendChild(el);
      }
      if (!el) return;
      el.hidden = false;
      el.textContent = [
        "deeplink " + result.eventType,
        "raw: " + (result.rawUrl || "-"),
        "token: " + (result.token || "-"),
        "from: " + (result.currentUrl || "-"),
        "to: " + (result.destinationUrl || "-"),
        "pending: " + String(result.pendingSaved),
        result.earlyReturn ? "early: " + result.earlyReturn : "",
        result.error ? "error: " + result.error : "",
      ]
        .filter(Boolean)
        .join("\n");
    } catch (error) {
      /* ignore */
    }
  }

  function currentPathFrom(ctx) {
    if (ctx && ctx.currentPath) return ctx.currentPath;
    return window.location.pathname || "";
  }

  function currentUrlFrom(ctx) {
    if (ctx && ctx.currentUrl) return ctx.currentUrl;
    try {
      return window.location.href || currentPathFrom(ctx);
    } catch (error) {
      return currentPathFrom(ctx);
    }
  }

  function assignLocation(url, ctx) {
    if (ctx && typeof ctx.assign === "function") {
      ctx.assign(url);
      return;
    }
    window.location.assign(url);
  }

  function consumeIncomingUrl(rawUrl, eventType, ctx) {
    const result = {
      rawUrl: rawUrl || "",
      eventType: eventType || "unknown",
      token: null,
      currentUrl: currentUrlFrom(ctx),
      destinationUrl: null,
      pendingSaved: false,
      earlyReturn: null,
      error: null,
    };
    try {
      const parsed = parseInviteUrl(rawUrl);
      if (!parsed) {
        result.earlyReturn = "unparsed";
        diagnose(result, ctx);
        return result;
      }
      result.token = parsed.token;
      result.destinationUrl = parsed.destination;
      result.pendingSaved = savePending(parsed.token, ctx && ctx.storage);
      const path = currentPathFrom(ctx);
      if (!shouldNavigateToPending(path, parsed.token)) {
        result.earlyReturn = "already-on-invite";
        diagnose(result, ctx);
        return result;
      }
      diagnose(result, ctx);
      assignLocation(parsed.destination, ctx);
      return result;
    } catch (error) {
      result.error = error && error.message ? error.message : String(error);
      result.earlyReturn = "exception";
      diagnose(result, ctx);
      return result;
    }
  }

  function consumePendingIfNeeded(eventType, ctx) {
    const token = readPending(ctx && ctx.storage);
    if (!token) {
      return {
        rawUrl: "",
        eventType: eventType || "pending",
        token: null,
        currentUrl: currentUrlFrom(ctx),
        destinationUrl: null,
        pendingSaved: false,
        earlyReturn: "no-pending",
        error: null,
      };
    }
    return consumeIncomingUrl("https://korpasset.se" + inviteDestination(token), eventType, ctx);
  }

  function hideInviteOpenApp() {
    const panel = document.getElementById("invite-open-app");
    if (panel) panel.hidden = true;
  }

  function prepareInviteHandoff() {
    if (nativeApp()) {
      hideInviteOpenApp();
      return;
    }
    const match = window.location.pathname.match(/^\/invite\/([A-Za-z0-9_-]+)$/);
    if (!match) return;
    const panel = document.getElementById("invite-open-app");
    if (!panel) return;
    panel.hidden = false;
    const link = document.getElementById("invite-open-app-link");
    if (link) link.setAttribute("href", "korpasset://invite/" + match[1]);
    const form = document.querySelector('form[action^="/invite/"]');
    if (form) form.hidden = true;
  }

  function prepareNativeInviteLogin() {
    if (!nativeApp()) return;
    const match = (window.location.pathname || "").match(/^\/invite\/([A-Za-z0-9_-]+)$/);
    if (!match) return;
    hideInviteOpenApp();
    clearPending();
    if (document.querySelector && document.querySelector("[data-oauth-provider]")) return;
    if (typeof document.createElement !== "function") return;
    const form = document.querySelector && document.querySelector('form[action^="/invite/"]');
    const parent = (form && form.parentNode) || document.body;
    if (!parent) return;
    const wrap = document.createElement("div");
    wrap.className = "stack oauth-continue";
    wrap.setAttribute("data-return-to", inviteDestination(match[1]));
    const intro = document.createElement("p");
    intro.textContent = "Logga in i appen med Apple eller Google för att ansluta som handledare.";
    const error = document.createElement("p");
    error.id = "oauth-error";
    error.className = "banner banner-error";
    error.hidden = true;
    const apple = document.createElement("button");
    apple.type = "button";
    apple.className = "btn btn-primary";
    apple.setAttribute("data-oauth-provider", "apple");
    apple.textContent = "Fortsätt med Apple";
    const google = document.createElement("button");
    google.type = "button";
    google.className = "btn btn-secondary";
    google.setAttribute("data-oauth-provider", "google");
    google.textContent = "Fortsätt med Google";
    wrap.appendChild(intro);
    wrap.appendChild(error);
    wrap.appendChild(apple);
    wrap.appendChild(google);
    if (form) parent.insertBefore(wrap, form);
    else parent.appendChild(wrap);
  }

  async function bootNativeInviteHandoff() {
    if (!nativeApp()) return;
    const App = plugin("App");
    const path = window.location.pathname || "";
    const onInvite = /^\/invite\/[A-Za-z0-9_-]+$/.test(path);
    if (onInvite) clearPending();

    if (App && typeof App.addListener === "function") {
      App.addListener("appUrlOpen", function (event) {
        consumeIncomingUrl(event && event.url, "appUrlOpen");
      });
    }

    let launchUrl = "";
    try {
      if (App && typeof App.getLaunchUrl === "function") {
        const launched = await App.getLaunchUrl();
        launchUrl = (launched && launched.url) || "";
      }
    } catch (error) {
      diagnose({
        rawUrl: "",
        eventType: "cold start",
        token: null,
        currentUrl: currentUrlFrom(),
        destinationUrl: null,
        pendingSaved: false,
        earlyReturn: "getLaunchUrl-failed",
        error: error && error.message ? error.message : String(error),
      });
    }

    if (launchUrl) {
      consumeIncomingUrl(launchUrl, "cold start");
      return;
    }

    if (!onInvite) consumePendingIfNeeded("pending");
  }

  window.KORPASSET_DEEPLINK = {
    PENDING_KEY: PENDING_KEY,
    DEBUG_KEY: DEBUG_KEY,
    parseInviteUrl: parseInviteUrl,
    shouldNavigateToPending: shouldNavigateToPending,
    savePending: savePending,
    readPending: readPending,
    clearPending: clearPending,
    consumeIncomingUrl: consumeIncomingUrl,
    consumePendingIfNeeded: consumePendingIfNeeded,
    inviteDestination: inviteDestination,
    deeplinkDebugUiEnabled: deeplinkDebugUiEnabled,
  };

  document.addEventListener("click", function (event) {
    const button = event.target.closest("[data-oauth-provider]");
    if (!button) return;
    event.preventDefault();
    continueWith(button.getAttribute("data-oauth-provider"));
  });

  prepareInviteHandoff();
  prepareNativeInviteLogin();
  bootNativeInviteHandoff();
})();
