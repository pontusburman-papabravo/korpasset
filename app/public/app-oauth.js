(function () {
  const oauth = window.KORPASSET_OAUTH || {};
  const PENDING_KEY = "korpasset.pendingInvite";
  const DEBUG_KEY = "korpasset.deeplinkDebug";
  const AUTH_KEY = "korpasset.pendingAuth";
  const GOOGLE_HINT_KEY = "korpasset.googleDeviceHint";
  const GOOGLE_HINT_TEXT =
    "Första gången med Körpasset kan Google stoppa inloggningen, även på en telefon du redan använder. Det är Google som gör det, inte Körpasset.";
  const GOOGLE_REAUTH_ERROR =
    "Google stoppade inloggningen. Det visades inget att godkänna. Tryck Fortsätt med Google igen.";
  const GOOGLE_REAUTH_HOW =
    "Google avbröt efter kontoväljaren utan mejl och utan en ruta att godkänna. Tryck Fortsätt med Google igen. Samma sak en gång till betyder att Google nekar Körpasset på den här telefonen just nu — inte att du missat en knapp.";
  const TOKEN = /^[A-Za-z0-9_-]+$/;
  const AUTH_SETTLE_MS = 40;
  const authRuntime = {
    attemptId: null,
    provider: null,
    inProgress: false,
    navigating: false,
    completed: false,
    callbackReceived: false,
    nativePickerPresented: false,
    path: "",
  };
  const initializedProviders = Object.create(null);
  const completedAttempts = Object.create(null);
  const consumedHandoffs = Object.create(null);
  const recoveryTraces = Object.create(null);
  let recoverPromise = null;

  function plugin(name) {
    const cap = window.Capacitor;
    if (!cap || !cap.Plugins) return null;
    return cap.Plugins[name] || null;
  }

  function oauthErrorVisible() {
    try {
      const el = document.getElementById && document.getElementById("oauth-error");
      return Boolean(el && !el.hidden && String(el.textContent || "").trim());
    } catch (error) {
      return false;
    }
  }

  function showError(message, options) {
    const el = document.getElementById("oauth-error");
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
    hideGoogleDeviceHint();
    try {
      if (options && options.googleReauth) showGoogleReauthHelp();
      else hideGoogleReauthHelp();
    } catch (error) {
      /* Login must still fail cleanly if the help row cannot be drawn. */
    }
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

  // @capgo/capacitor-social-login 8.5.10 (the plugin in iOS 1.0 build 7)
  // leaves useProperTokenExchange false unless initialize asks for it.
  // In that mode authorizationCode is nil and the raw authorization code
  // is accessToken.token. redirectUrl stays empty, so the plugin does not
  // exchange the code itself.
  function appleAuthorizationCodeFrom(result, identityToken) {
    if (!result) return "";
    const nested = result.result || {};
    const explicit =
      (typeof nested.authorizationCode === "string" && nested.authorizationCode.trim()) ||
      (typeof result.authorizationCode === "string" && result.authorizationCode.trim()) ||
      "";
    const access = nested.accessToken || result.accessToken || {};
    const legacy = typeof access.token === "string" ? access.token.trim() : "";
    const code = explicit || legacy;
    if (!code || code === identityToken) return "";
    return code;
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

  // Android @capgo/capacitor-social-login 8.5.10 rejects the whole
  // initialize() when Apple is included without redirectUrl, before Google
  // is registered. Google on Android must be initialized alone.
  function shouldInitializeApple(provider) {
    return provider === "apple" || platform() !== "android";
  }

  function shouldInitializeGoogle(provider) {
    return googleReady() && (provider === "google" || platform() !== "android");
  }

  async function initialize(SocialLogin, provider) {
    if (!SocialLogin || typeof SocialLogin.initialize !== "function") return;
    const payload = {};
    if (shouldInitializeApple(provider)) {
      payload.apple = {
        clientId: oauth.appleClientId || "se.korpasset.app",
      };
    }
    if (shouldInitializeGoogle(provider)) {
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

  // Any scopes array makes that Android build reject Google login unless
  // MainActivity implements ModifiedMainActivityForSocialLoginPlugin.
  // The plugin already requests email, profile, and openid by default.
  function loginOptions(provider, nonce) {
    const options = { nonce: nonce };
    if (provider === "google" && platform() === "android") return options;
    options.scopes = provider === "google" ? ["email", "profile"] : ["email", "name"];
    return options;
  }

  // 16 = GET_CREDENTIAL / account reauth failed. It is thrown after
  // Credential Manager has already shown (or retried) the account picker.
  // 28444 = this APK's signing cert is not registered on the Google Cloud
  // OAuth client. Also observed after login() has started, i.e. after UI.
  // Neither code can be known before native UI, so a same-attempt browser
  // fallback would be a second picker. Treat both as a failed attempt.
  // Browser fallback is only allowed when login() was never called.
  function googleCredentialManagerRejected(error) {
    const code = pluginFailureCode(error);
    return code === "16" || code === "28444";
  }

  function googleBrowserAuthorizeUrl(nonce, returnTo) {
    let state = nonce;
    const invite =
      typeof returnTo === "string" ? returnTo.match(/^\/invite\/([A-Za-z0-9_-]+)$/) : null;
    if (invite) state = nonce + "." + invite[1];
    const params = new URLSearchParams({
      client_id: oauth.googleWebClientId || "",
      redirect_uri: "https://korpasset.se/app",
      response_type: "id_token",
      // form_post keeps the id_token out of the URL. Android App Links drop
      // #fragments, which is why a fragment callback can never be recovered
      // from an Intent. The server turns the POST into ?oauth_handoff=.
      response_mode: "form_post",
      scope: "openid email profile",
      nonce: nonce,
      state: state,
      prompt: "select_account",
    });
    return "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
  }

  function androidAppIntentUrl(code) {
    const open = "https://korpasset.se/app?oauth_handoff=" + code;
    return (
      "intent://korpasset.se/app?oauth_handoff=" +
      code +
      "#Intent;scheme=https;package=se.korpasset.app;S.browser_fallback_url=" +
      encodeURIComponent(open) +
      ";end"
    );
  }

  function nonceFromState(state) {
    const raw = typeof state === "string" ? state : "";
    const nonce = raw.split(".")[0] || "";
    const invite = raw.split(".")[1] || "";
    return {
      nonce: nonce,
      returnTo: TOKEN.test(invite) ? "/invite/" + invite : "",
    };
  }

  function validHandoffCode(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]{20,128}$/.test(value);
  }

  function loginWasCancelled(error) {
    const code = error && typeof error.code === "string" ? error.code : "";
    if (code === "USER_CANCELLED") return true;
    const message = error && typeof error.message === "string" ? error.message : "";
    return /cancel/i.test(message);
  }

  function googleNativeErrorMessage(error) {
    if (loginWasCancelled(error)) return "Inloggningen avbröts. Försök igen.";
    const code = pluginFailureCode(error);
    if (code === "16") {
      return GOOGLE_REAUTH_ERROR;
    }
    return "Kunde inte logga in. Försök igen.";
  }

  function sanitizeTraceCode(value) {
    const text = typeof value === "string" ? value.trim() : "";
    return /^[A-Za-z0-9_.:-]{1,64}$/.test(text) ? text : "";
  }

  function pluginFailureCode(error) {
    const code = error && typeof error.code === "string" ? error.code : "";
    if (code === "USER_CANCELLED") return "USER_CANCELLED";
    const message = error && typeof error.message === "string" ? error.message : "";
    const bracket = message.match(/\[(\d{1,6})\]/);
    if (bracket) return bracket[1];
    if (/\b28444\b/.test(message)) return "28444";
    if (/\b10:/.test(message)) return "10";
    return "";
  }

  function sanitizePluginMessage(error) {
    const message = error && typeof error.message === "string" ? error.message : "";
    return message
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted]")
      .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[redacted]")
      .replace(/[^A-Za-z0-9 ._:\[\]()-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
  }

  function googleBackendStep(code) {
    if (
      code === "identity_conflict" ||
      code === "provider_already_linked" ||
      code === "identity_on_other_user" ||
      code === "account_unavailable" ||
      code === "not_found"
    ) {
      return "google_account_creation_failed";
    }
    return "google_backend_rejected";
  }

  // Safe breadcrumb for a physical device. Never include tokens, nonce,
  // subject, email, name, or cookies.
  function oauthTrace(step, detail) {
    const info = detail || {};
    const event = {
      step: step,
      platform: platform() || "web",
      attemptId:
        sanitizeTraceCode(info.attemptId) || sanitizeTraceCode(authRuntime.attemptId),
      provider: sanitizeTraceCode(info.provider) || sanitizeTraceCode(authRuntime.provider),
      reason: sanitizeTraceCode(info.reason),
      hasIdentityToken: Boolean(info.hasIdentityToken),
      pluginCode: sanitizeTraceCode(info.pluginCode),
      pluginMessage: typeof info.pluginMessage === "string" ? info.pluginMessage : "",
      httpStatus: typeof info.httpStatus === "number" ? info.httpStatus : 0,
      backendCode: sanitizeTraceCode(info.backendCode),
      created: typeof info.created === "boolean" ? info.created : null,
    };
    try {
      console.info("[korpasset-oauth]", event);
    } catch (error) {
      /* ignore */
    }
    try {
      const message = [
        "oauth",
        "step=" + event.step,
        "platform=" + event.platform,
        "attemptId=" + (event.attemptId || "-"),
        "provider=" + (event.provider || "-"),
        "reason=" + (event.reason || "-"),
        "hasIdentityToken=" + (event.hasIdentityToken ? "1" : "0"),
        "pluginCode=" + (event.pluginCode || "-"),
        "httpStatus=" + (event.httpStatus || "-"),
        "backendCode=" + (event.backendCode || "-"),
        "created=" + (event.created === null ? "-" : event.created ? "1" : "0"),
        "pluginMessage=" + (event.pluginMessage || "-"),
      ].join(" ");
      fetch("/api/client-error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify({
          message: message.slice(0, 500),
          path: "/app",
        }),
      }).catch(function () {
        /* ignore */
      });
    } catch (error) {
      /* ignore */
    }
  }

  function traceGoogleFailure(step, error, extra) {
    oauthTrace(step, {
      pluginCode: pluginFailureCode(error),
      pluginMessage: sanitizePluginMessage(error),
      hasIdentityToken: Boolean(extra && extra.hasIdentityToken),
      httpStatus: extra && extra.httpStatus,
      backendCode: extra && extra.backendCode,
    });
  }

  async function initializeOnce(SocialLogin, provider) {
    const key = provider + ":" + (platform() || "web");
    if (initializedProviders[key]) return;
    await initialize(SocialLogin, provider);
    initializedProviders[key] = true;
  }

  async function continueWith(provider) {
    if (authRuntime.inProgress || authRuntime.navigating) {
      oauthTrace("auth_duplicate_start_blocked", { provider: provider });
      return;
    }
    authRuntime.inProgress = true;
    const attemptId = randomNonce();
    authRuntime.attemptId = attemptId;
    authRuntime.provider = provider;

    const stack = document.querySelector(".oauth-stack, .oauth-continue");
    const returnTo =
      (stack && stack.getAttribute("data-return-to")) ||
      window.location.pathname + window.location.search;
    persistAuth({
      attemptId: attemptId,
      provider: provider,
      returnTo: returnTo,
      startedAt: Date.now(),
      phase: "started",
    });
    setLoginBusy(true);
    hideConsentForAuth();
    if (provider === "google") oauthTrace("auth_google_started", { provider: provider });

    try {
      if (recoverPromise) {
        const recovered = await recoverPromise;
        if ((recovered && recovered.authenticated) || authRuntime.navigating) return;
      }

      const SocialLogin = plugin("SocialLogin");
      if (!SocialLogin || typeof SocialLogin.login !== "function") {
        showError("Öppna Körpasset-appen för att fortsätta med Apple eller Google.");
        failAuth("plugin-missing");
        return;
      }

      if (provider === "google" && !googleReady()) {
        showError(
          platform() === "ios"
            ? "Google-inloggning på iPhone är inte redo i den här versionen. Fortsätt med Apple."
            : "Google-inloggning är inte redo ännu. Fortsätt med Apple.",
        );
        failAuth("google-not-ready");
        return;
      }

      const nonce = randomNonce();
      try {
        await initializeOnce(SocialLogin, provider);
      } catch (error) {
        if (provider === "google") traceGoogleFailure("google_initialize_failed", error);
        if (
          provider === "google" &&
          platform() === "android" &&
          !authRuntime.nativePickerPresented &&
          googleCredentialManagerRejected(error) &&
          oauth.googleWebClientId
        ) {
          selectAuthPath("browser-before-picker");
          startGoogleBrowserFallback(returnTo, nonce, pluginFailureCode(error));
          return;
        }
        showError(
          loginWasCancelled(error)
            ? "Inloggningen avbröts. Försök igen."
            : "Kunde inte logga in. Försök igen.",
        );
        failAuth("initialize-failed");
        return;
      }

      selectAuthPath("native");
      authRuntime.nativePickerPresented = true;
      let result;
      try {
        result = await SocialLogin.login({
          provider,
          options: loginOptions(provider, nonce),
        });
      } catch (error) {
        const cancelled = loginWasCancelled(error);
        if (provider === "google") {
          traceGoogleFailure(
            cancelled ? "google_login_cancelled" : "google_native_login_failed",
            error,
          );
        }
        showError(googleNativeErrorMessage(error), {
          googleReauth: pluginFailureCode(error) === "16",
        });
        failAuth(
          cancelled
            ? "cancelled"
            : googleCredentialManagerRejected(error)
              ? "credential-manager-rejected"
              : "native-failed",
        );
        return;
      }

      const identityToken = idTokenFrom(result);
      if (!identityToken) {
        if (provider === "google") {
          oauthTrace("google_no_identity_token", { hasIdentityToken: false });
        }
        showError("Inloggningen gav ingen identitet. Försök igen.");
        failAuth("no-identity");
        return;
      }
      markCallbackReceived({ hasIdentityToken: true });
      if (provider === "google") {
        oauthTrace("auth_google_account_selected", { hasIdentityToken: true });
      }
      updateAuthPhase("callback");
      const payload = {
        identityToken: identityToken,
        displayName: displayNameFrom(result),
        returnTo: returnTo,
        nonce: nonce,
      };
      if (provider === "apple") {
        const authorizationCode = appleAuthorizationCodeFrom(result, identityToken);
        if (authorizationCode) payload.authorizationCode = authorizationCode;
      }

      await postProvider(provider, payload);
    } catch (error) {
      showError("Kunde inte logga in. Försök igen.");
      failAuth("exception");
    }
  }

  function selectAuthPath(path) {
    if (authRuntime.path) return;
    authRuntime.path = path;
    oauthTrace("auth_path_selected", { reason: path });
  }

  function markCallbackReceived(detail) {
    if (authRuntime.callbackReceived) return;
    authRuntime.callbackReceived = true;
    oauthTrace("auth_callback_received", detail || { hasIdentityToken: true });
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function startGoogleBrowserFallback(returnTo, nonce, pluginCode) {
    oauthTrace("google_browser_fallback", {
      pluginCode: pluginCode,
      hasIdentityToken: false,
    });
    updateAuthPhase("browser");
    window.location.assign(googleBrowserAuthorizeUrl(nonce, returnTo));
  }

  async function postProvider(provider, payload) {
    let response;
    try {
      response = await fetch("/api/auth/" + provider, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (provider === "google") {
        oauthTrace("google_backend_request_failed", { hasIdentityToken: true });
      }
      showError("Kunde inte logga in. Försök igen.");
      failAuth("backend-transport");
      return;
    }

    const body = await response.json().catch(function () {
      return {};
    });
    if (!response.ok) {
      if (provider === "google") {
        const backendCode = sanitizeTraceCode(body.code);
        oauthTrace(googleBackendStep(backendCode), {
          hasIdentityToken: true,
          httpStatus: response.status,
          backendCode: backendCode,
        });
      }
      showError(body.error || "Kunde inte logga in. Försök igen.");
      failAuth("backend-rejected");
      return;
    }
    if (provider === "google") {
      oauthTrace("google_login_success", {
        hasIdentityToken: true,
        httpStatus: response.status,
        created: body.created === true,
      });
      oauthTrace("auth_session_verified", {
        hasIdentityToken: true,
        httpStatus: response.status,
        created: body.created === true,
      });
    }
    navigateAfterAuth(body.redirectTo || "/app");
  }

  async function finishBrowserHandoff(idToken, state) {
    const parsed = nonceFromState(state);
    adoptCallbackAttempt(parsed.nonce, parsed.returnTo || "/app");
    oauthTrace("google_browser_return", { hasIdentityToken: true });
    markCallbackReceived({ hasIdentityToken: true });
    let response;
    try {
      response = await fetch("/api/auth/google/browser-handoff", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          identityToken: idToken,
          nonce: parsed.nonce,
          returnTo: parsed.returnTo || "/app",
        }),
      });
    } catch (error) {
      oauthTrace("google_backend_request_failed", { hasIdentityToken: true });
      showError("Kunde inte logga in. Försök igen.");
      failAuth("backend-transport");
      return;
    }
    const body = await response.json().catch(function () {
      return {};
    });
    if (!response.ok || !validHandoffCode(body.handoff)) {
      const backendCode = sanitizeTraceCode(body.code);
      oauthTrace(response.ok ? "google_browser_return_failed" : googleBackendStep(backendCode), {
        hasIdentityToken: true,
        httpStatus: response.status,
        backendCode: backendCode,
      });
      showError(body.error || "Kunde inte logga in. Försök igen.");
      failAuth("handoff-failed");
      return;
    }
    oauthTrace("google_browser_handoff", {
      hasIdentityToken: true,
      httpStatus: response.status,
      created: body.created === true,
    });
    const intentUrl = androidAppIntentUrl(body.handoff);
    try {
      if (document.body && typeof document.createElement === "function") {
        let link = document.getElementById("oauth-open-app");
        if (!link) {
          link = document.createElement("a");
          link.id = "oauth-open-app";
          link.className = "btn btn-primary";
          link.textContent = "Öppna Körpasset";
          document.body.appendChild(link);
        }
        link.setAttribute("href", intentUrl);
      }
    } catch (error) {
      /* ignore */
    }
    window.location.assign(intentUrl);
  }

  function consumeAuthOutcomeQuery() {
    let params;
    try {
      params = new URLSearchParams(window.location.search || "");
    } catch (error) {
      return false;
    }
    const outcome = params.get("oauth_error") || "";
    if (outcome !== "cancelled" && outcome !== "failed") return false;
    try {
      const path = window.location.pathname || "/app";
      if (window.history && typeof window.history.replaceState === "function") {
        window.history.replaceState(null, "", path);
      }
    } catch (error) {
      /* ignore */
    }
    const cancelled = outcome === "cancelled";
    oauthTrace(cancelled ? "google_login_cancelled" : "google_browser_return_failed", {
      pluginCode: sanitizeTraceCode(outcome),
      hasIdentityToken: false,
    });
    showError(
      cancelled ? "Inloggningen avbröts. Försök igen." : "Kunde inte logga in. Försök igen.",
    );
    failAuth(cancelled ? "cancelled" : "form-post-failed");
    return true;
  }

  function consumeGoogleBrowserReturn() {
    const hash = String((window.location && window.location.hash) || "");
    if (hash.indexOf("id_token=") === -1 && hash.indexOf("error=") === -1) return false;
    const raw = hash.charAt(0) === "#" ? hash.slice(1) : hash;
    try {
      const path = window.location.pathname || "/app";
      const search = window.location.search || "";
      if (window.history && typeof window.history.replaceState === "function") {
        window.history.replaceState(null, "", path + search);
      }
    } catch (error) {
      /* ignore */
    }
    let params;
    try {
      params = new URLSearchParams(raw);
    } catch (error) {
      oauthTrace("google_browser_return_failed", { hasIdentityToken: false });
      showError("Kunde inte logga in. Försök igen.");
      failAuth("browser-return-parse");
      return true;
    }
    const idToken = params.get("id_token") || "";
    const oauthError = params.get("error") || "";
    const state = params.get("state") || "";
    if (!idToken) {
      const cancelled = oauthError === "access_denied";
      oauthTrace(cancelled ? "google_login_cancelled" : "google_browser_return_failed", {
        pluginCode: sanitizeTraceCode(oauthError),
        hasIdentityToken: false,
      });
      showError(
        cancelled
          ? "Inloggningen avbröts. Försök igen."
          : "Kunde inte logga in. Försök igen.",
      );
      failAuth(cancelled ? "cancelled" : "browser-return-failed");
      return true;
    }
    const parsed = nonceFromState(state);
    adoptCallbackAttempt(parsed.nonce, parsed.returnTo || "/app");
    markCallbackReceived({ hasIdentityToken: true });
    if (nativeApp()) {
      postProvider("google", {
        identityToken: idToken,
        nonce: parsed.nonce,
        returnTo: parsed.returnTo || window.location.pathname + (window.location.search || ""),
      });
      return true;
    }
    finishBrowserHandoff(idToken, state);
    return true;
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

  function persistAuth(state, store) {
    try {
      storage(store).setItem(AUTH_KEY, JSON.stringify(state));
    } catch (error) {
      /* ignore */
    }
  }

  function readAuth(store) {
    try {
      const raw = storage(store).getItem(AUTH_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.attemptId !== "string") return null;
      if (!sanitizeTraceCode(parsed.attemptId)) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function clearAuth(store) {
    try {
      storage(store).removeItem(AUTH_KEY);
    } catch (error) {
      /* ignore */
    }
  }

  function updateAuthPhase(phase) {
    const current = readAuth() || {
      attemptId: authRuntime.attemptId,
      provider: authRuntime.provider,
      returnTo: "/app",
      startedAt: Date.now(),
    };
    persistAuth({
      attemptId: current.attemptId || authRuntime.attemptId,
      provider: current.provider || authRuntime.provider,
      returnTo: current.returnTo || "/app",
      startedAt: current.startedAt || Date.now(),
      phase: phase,
    });
  }

  function adoptCallbackAttempt(_nonce, returnTo) {
    const existing = readAuth();
    const id = (existing && existing.attemptId) || randomNonce();
    authRuntime.inProgress = true;
    authRuntime.attemptId = id;
    authRuntime.provider = authRuntime.provider || "google";
    persistAuth({
      attemptId: id,
      provider: "google",
      returnTo: returnTo || (existing && existing.returnTo) || "/app",
      startedAt: (existing && existing.startedAt) || Date.now(),
      phase: "callback",
    });
    setLoginBusy(true);
    hideConsentForAuth();
  }

  function resetAuthRuntime() {
    authRuntime.inProgress = false;
    authRuntime.navigating = false;
    authRuntime.completed = false;
    authRuntime.callbackReceived = false;
    authRuntime.nativePickerPresented = false;
    authRuntime.path = "";
    authRuntime.attemptId = null;
    authRuntime.provider = null;
  }

  function failAuth(reason) {
    authRuntime.inProgress = false;
    authRuntime.navigating = false;
    authRuntime.completed = false;
    authRuntime.callbackReceived = false;
    authRuntime.nativePickerPresented = false;
    authRuntime.path = "";
    clearAuth();
    setLoginBusy(false);
    if (reason && reason !== "cancelled") {
      oauthTrace("auth_session_failed", { reason: sanitizeTraceCode(reason) });
    }
    authRuntime.attemptId = null;
    authRuntime.provider = null;
  }

  function googleDeviceHintAlreadyShown() {
    try {
      return window.localStorage && window.localStorage.getItem(GOOGLE_HINT_KEY) === "1";
    } catch (error) {
      return false;
    }
  }

  function markGoogleDeviceHintShown() {
    try {
      if (window.localStorage) window.localStorage.setItem(GOOGLE_HINT_KEY, "1");
    } catch (error) {
      /* ignore */
    }
  }

  function hideGoogleDeviceHint() {
    try {
      const el = document.getElementById && document.getElementById("oauth-google-hint");
      if (el) el.hidden = true;
    } catch (error) {
      /* ignore */
    }
  }

  function hideGoogleReauthHelp() {
    try {
      const el = document.getElementById && document.getElementById("oauth-google-reauth");
      if (el) el.hidden = true;
    } catch (error) {
      /* ignore */
    }
  }

  function fillGoogleReauthHelp(el) {
    if (!el || !document.createElement) return el;
    let how = null;
    try {
      how = el.querySelector && el.querySelector("#oauth-google-reauth-how");
    } catch (error) {
      how = null;
    }
    if (!how) {
      how = document.createElement("p");
      how.id = "oauth-google-reauth-how";
      how.className = "muted";
      if (el.firstChild && el.insertBefore) el.insertBefore(how, el.firstChild);
      else if (el.appendChild) el.appendChild(how);
    }
    if (how) how.textContent = GOOGLE_REAUTH_HOW;
    return el;
  }

  function ensureGoogleReauthHelp() {
    try {
      let el = document.getElementById && document.getElementById("oauth-google-reauth");
      if (!el && document.createElement) {
        el = document.createElement("div");
        el.id = "oauth-google-reauth";
        el.className = "stack";
        const error = document.getElementById && document.getElementById("oauth-error");
        if (error && error.parentNode && error.nextSibling && error.parentNode.insertBefore) {
          error.parentNode.insertBefore(el, error.nextSibling);
        } else if (error && error.parentNode && error.parentNode.appendChild) {
          error.parentNode.appendChild(el);
        } else if (document.body && document.body.appendChild) {
          document.body.appendChild(el);
        }
      }
      return fillGoogleReauthHelp(el);
    } catch (error) {
      return null;
    }
  }

  function showGoogleReauthHelp() {
    try {
      const el = ensureGoogleReauthHelp();
      if (!el) return false;
      el.hidden = false;
      return true;
    } catch (error) {
      return false;
    }
  }

  // One-time, Android-only. Google's device check can look like a second
  // login; say so once, then never again on this install.
  function showGoogleDeviceHintOnce() {
    if (platform() !== "android" || !nativeApp()) return false;
    if (!isLoginSurface()) return false;
    if (oauthErrorVisible()) {
      hideGoogleDeviceHint();
      return false;
    }
    if (googleDeviceHintAlreadyShown()) {
      hideGoogleDeviceHint();
      return false;
    }
    let el = null;
    try {
      el = document.getElementById && document.getElementById("oauth-google-hint");
    } catch (error) {
      el = null;
    }
    if (!el && document.createElement) {
      el = document.createElement("p");
      el.id = "oauth-google-hint";
      el.className = "muted";
      const stack = document.querySelector && document.querySelector(".oauth-continue, .oauth-stack");
      if (stack && stack.insertBefore) stack.insertBefore(el, stack.firstChild);
      else if (document.body && document.body.appendChild) document.body.appendChild(el);
    }
    if (!el) return false;
    el.hidden = false;
    el.textContent = GOOGLE_HINT_TEXT;
    markGoogleDeviceHintShown();
    oauthTrace("google_device_hint_shown", { reason: "once" });
    return true;
  }

  function isLoginSurface() {
    try {
      return Boolean(
        document.querySelector &&
          document.querySelector("[data-oauth-provider], .oauth-continue, .oauth-stack"),
      );
    } catch (error) {
      return false;
    }
  }

  function setLoginBusy(busy) {
    try {
      const buttons =
        (document.querySelectorAll && document.querySelectorAll("[data-oauth-provider]")) || [];
      for (let i = 0; i < buttons.length; i += 1) {
        const button = buttons[i];
        if (!button) continue;
        if (busy) {
          if (!button.getAttribute("data-oauth-label")) {
            button.setAttribute("data-oauth-label", button.textContent || "");
          }
          button.disabled = true;
          button.setAttribute("aria-busy", "true");
          if (button.getAttribute("data-oauth-provider") === "google") {
            button.textContent = "Loggar in…";
          }
        } else {
          button.disabled = false;
          button.removeAttribute("aria-busy");
          const label = button.getAttribute("data-oauth-label");
          if (label) button.textContent = label;
        }
      }
      let status = document.getElementById && document.getElementById("oauth-status");
      if (!status && busy && document.createElement && document.body) {
        status = document.createElement("p");
        status.id = "oauth-status";
        status.className = "muted";
        const stack = document.querySelector(".oauth-continue, .oauth-stack");
        if (stack) stack.insertBefore(status, stack.firstChild);
        else document.body.appendChild(status);
      }
      if (status) {
        status.hidden = !busy;
        status.textContent = "Loggar in…";
      }
    } catch (error) {
      /* ignore */
    }
  }

  function hideConsentForAuth() {
    try {
      const root = document.querySelector && document.querySelector("[data-consent-root]");
      if (!root) return;
      root.hidden = true;
      root.setAttribute("data-auth-hidden", "1");
    } catch (error) {
      /* ignore */
    }
  }

  function safeRedirectPath(value) {
    if (typeof value !== "string") return "/app";
    const path = value.trim().split("?")[0].split("#")[0];
    if (!path.startsWith("/") || path.startsWith("//")) return "/app";
    if (!/^\/[A-Za-z0-9/_-]*$/.test(path) || path.length > 300) return "/app";
    return path;
  }

  function navigateAfterAuth(url, ctx) {
    const attemptId = authRuntime.attemptId || (readAuth(ctx && ctx.storage) || {}).attemptId || "";
    if (authRuntime.navigating || authRuntime.completed) return;
    if (attemptId && completedAttempts[attemptId]) return;
    const dest = safeRedirectPath(url);
    const current = String(currentPathFrom(ctx) || "").split("?")[0];
    const alreadyThere = current === dest && !isLoginSurface();
    if (alreadyThere) {
      if (attemptId) completedAttempts[attemptId] = true;
      authRuntime.completed = true;
      authRuntime.navigating = true;
      clearAuth(ctx && ctx.storage);
      authRuntime.inProgress = false;
      return;
    }
    if (attemptId) completedAttempts[attemptId] = true;
    authRuntime.completed = true;
    authRuntime.navigating = true;
    const mode = current === dest ? "reload" : "assign";
    oauthTrace("auth_navigation_started", { reason: mode });
    hideConsentForAuth();
    clearAuth(ctx && ctx.storage);
    authRuntime.inProgress = false;
    if (mode === "reload") {
      if (ctx && typeof ctx.reload === "function") ctx.reload();
      else window.location.reload();
    } else {
      assignLocation(dest, ctx);
    }
    oauthTrace("auth_navigation_completed", { reason: mode });
  }

  async function fetchSession() {
    const response = await fetch("/api/auth/session", {
      method: "GET",
      headers: { accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });
    const body = await response.json().catch(function () {
      return {};
    });
    return {
      authenticated: body.authenticated === true,
      redirectTo: typeof body.redirectTo === "string" ? body.redirectTo : null,
    };
  }

  function recoverAuth(reason, ctx) {
    if (authRuntime.navigating || authRuntime.completed) {
      return Promise.resolve({ skipped: true, reason: "navigating" });
    }
    if (recoverPromise) return recoverPromise;
    recoverPromise = recoverAuthNow(reason, ctx).finally(function () {
      recoverPromise = null;
    });
    return recoverPromise;
  }

  function traceRecoveryOnce(reason, attemptId) {
    const key = (attemptId || "-") + ":" + (reason || "recover");
    if (recoveryTraces[key]) return false;
    recoveryTraces[key] = true;
    oauthTrace("auth_recovery_started", { reason: sanitizeTraceCode(reason) });
    return true;
  }

  async function recoverAuthNow(reason, ctx) {
    const pending = readAuth(ctx && ctx.storage);
    const login = isLoginSurface();
    if (!pending && !login) return { skipped: true, reason: "idle" };
    const safeReason = sanitizeTraceCode(reason);
    const isReturn =
      safeReason === "resume" ||
      safeReason === "native-resume" ||
      safeReason === "handoff" ||
      safeReason === "appUrlOpen";
    if (pending && !authRuntime.attemptId) {
      authRuntime.attemptId = pending.attemptId;
      authRuntime.provider = pending.provider || "google";
      setLoginBusy(true);
      hideConsentForAuth();
    }
    if (pending || authRuntime.inProgress) {
      traceRecoveryOnce(safeReason, authRuntime.attemptId || (pending && pending.attemptId));
    }
    let session;
    try {
      session = await fetchSession();
    } catch (error) {
      oauthTrace("auth_session_failed", { reason: "transport" });
      return { authenticated: false };
    }
    if (session.authenticated) {
      if (!pending && !authRuntime.inProgress) {
        traceRecoveryOnce(safeReason, "session");
      }
      oauthTrace("auth_session_verified", { reason: safeReason });
      navigateAfterAuth(session.redirectTo || "/app", ctx);
      return { authenticated: true, redirectTo: session.redirectTo };
    }
    if (authRuntime.inProgress) return { authenticated: false, waiting: true, outcome: "pending" };
    if (pending && !isReturn) {
      setLoginBusy(true);
      return { authenticated: false, waiting: true, outcome: "pending" };
    }
    if (pending && isReturn) {
      await delay(AUTH_SETTLE_MS);
      if (authRuntime.navigating || authRuntime.completed) {
        return { skipped: true, reason: "navigating" };
      }
      if (authRuntime.inProgress) {
        return { authenticated: false, waiting: true, outcome: "pending" };
      }
      const livePending = readAuth(ctx && ctx.storage);
      if (!livePending) {
        return { skipped: true, reason: "stale-pending" };
      }
      try {
        session = await fetchSession();
      } catch (error) {
        session = { authenticated: false, redirectTo: null };
      }
      if (session.authenticated) {
        oauthTrace("auth_session_verified", { reason: safeReason });
        navigateAfterAuth(session.redirectTo || "/app", ctx);
        return { authenticated: true, redirectTo: session.redirectTo };
      }
      showError("Kunde inte slutföra inloggningen. Försök igen.");
      failAuth("incomplete-return");
      return { authenticated: false, outcome: "failed" };
    }
    return { authenticated: false, outcome: "idle" };
  }

  function handoffCodeFromUrl(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) return "";
    try {
      const parsed = new URL(rawUrl.trim(), "https://korpasset.se");
      const host = (parsed.hostname || "").toLowerCase();
      const scheme = (parsed.protocol || "").replace(/:$/, "").toLowerCase();
      if (scheme && scheme !== "https" && scheme !== "http") return "";
      if (host && host !== "korpasset.se" && host !== "www.korpasset.se") return "";
      if ((parsed.pathname || "") !== "/app") return "";
      const code = parsed.searchParams.get("oauth_handoff") || "";
      return validHandoffCode(code) ? code : "";
    } catch (error) {
      return "";
    }
  }

  function oauthErrorFromUrl(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) return "";
    try {
      const parsed = new URL(rawUrl.trim(), "https://korpasset.se");
      if ((parsed.pathname || "") !== "/app") return "";
      const outcome = parsed.searchParams.get("oauth_error") || "";
      return outcome === "cancelled" || outcome === "failed" ? outcome : "";
    } catch (error) {
      return "";
    }
  }

  function consumeAuthCallbackUrl(rawUrl, eventType, ctx) {
    const outcome = oauthErrorFromUrl(rawUrl);
    if (outcome) {
      const cancelled = outcome === "cancelled";
      oauthTrace(cancelled ? "google_login_cancelled" : "google_browser_return_failed", {
        pluginCode: sanitizeTraceCode(outcome),
        reason: sanitizeTraceCode(eventType),
        hasIdentityToken: false,
      });
      showError(
        cancelled ? "Inloggningen avbröts. Försök igen." : "Kunde inte logga in. Försök igen.",
      );
      failAuth(cancelled ? "cancelled" : "form-post-failed");
      return true;
    }
    const code = handoffCodeFromUrl(rawUrl);
    if (!code) return false;
    const already = Boolean(consumedHandoffs[code]);
    consumedHandoffs[code] = true;
    if (!already) markCallbackReceived({ reason: sanitizeTraceCode(eventType) });
    const existing = readAuth(ctx && ctx.storage);
    persistAuth({
      attemptId: (existing && existing.attemptId) || authRuntime.attemptId || randomNonce(),
      provider: "google",
      returnTo: "/app",
      startedAt: (existing && existing.startedAt) || Date.now(),
      phase: "callback",
    }, ctx && ctx.storage);
    setLoginBusy(true);
    hideConsentForAuth();
    let current = "";
    try {
      current =
        new URLSearchParams((ctx && ctx.search) || window.location.search || "").get(
          "oauth_handoff",
        ) || "";
    } catch (error) {
      current = "";
    }
    if (current === code || already || authRuntime.navigating || authRuntime.completed) {
      recoverAuth(eventType || "handoff", ctx);
      return true;
    }
    assignLocation("/app?oauth_handoff=" + encodeURIComponent(code), ctx);
    return true;
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

  const INVITE_MISSING_APP =
    "Appen är inte installerad. Välj App Store eller Google Play, installera Körpasset och öppna samma länk igen.";
  let inviteOpenTimer = 0;

  function hideInviteOpenApp() {
    const panel = document.getElementById("invite-open-app");
    if (panel) panel.hidden = true;
  }

  function setInviteOpenStatus(text) {
    const status = document.getElementById("invite-open-status");
    if (status) status.textContent = text;
  }

  function browserPlatform() {
    const nav = window.navigator || {};
    const ua = String(nav.userAgent || "");
    if (/Android/i.test(ua)) return "android";
    if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
    if (nav.platform === "MacIntel" && Number(nav.maxTouchPoints) > 1) return "ios";
    return "other";
  }

  function androidIntentSupported() {
    const ua = String((window.navigator || {}).userAgent || "");
    if (!/Android/i.test(ua)) return false;
    if (/Firefox\//i.test(ua)) return false;
    return true;
  }

  function installRequested() {
    const search = String((window.location && window.location.search) || "");
    return /(?:^|[?&])install=1(?:&|$)/.test(search);
  }

  function inviteAttemptKey(token) {
    return "korpasset.inviteOpenAttempted:" + token;
  }

  function inviteOpenAttempted(token) {
    try {
      return window.sessionStorage.getItem(inviteAttemptKey(token)) === "1";
    } catch (error) {
      return false;
    }
  }

  function rememberInviteOpenAttempt(token) {
    try {
      window.sessionStorage.setItem(inviteAttemptKey(token), "1");
    } catch (error) {
      /* Private mode can block storage. The install=1 fallback still stops a loop. */
    }
  }

  // Android Chrome opens the app via an intent and, when it is missing,
  // returns to this page so the store choice can be shown. iOS Safari shows
  // "adressen är ogiltig" for a custom scheme with no installed app, so that
  // address is never the link href and is only used from the explicit button.
  function inviteOpenUrl(token, plat) {
    if (!TOKEN.test(token)) return "";
    if (plat === "android") {
      const fallback = "https://korpasset.se/invite/" + token + "?install=1";
      return (
        "intent://invite/" +
        token +
        "#Intent;scheme=korpasset;package=se.korpasset.app;S.browser_fallback_url=" +
        encodeURIComponent(fallback) +
        ";end"
      );
    }
    if (plat === "ios") return "korpasset://invite/" + token;
    return "";
  }

  function setButtonTone(el, primary) {
    if (!el || typeof el.setAttribute !== "function") return;
    el.setAttribute("class", primary ? "btn btn-primary" : "btn btn-secondary");
  }

  function applyInviteStoreChoice(plat) {
    setButtonTone(document.getElementById("invite-app-store"), plat !== "android");
    setButtonTone(document.getElementById("invite-play-store"), plat === "android");
  }

  function openInviteFromBrowser(token) {
    const plat = browserPlatform();
    if (plat === "android" && !androidIntentSupported()) {
      setInviteOpenStatus(INVITE_MISSING_APP);
      return "stores";
    }
    const url = inviteOpenUrl(token, plat);
    if (!url) {
      setInviteOpenStatus(INVITE_MISSING_APP);
      return "stores";
    }
    if (plat === "ios") {
      setInviteOpenStatus(
        "Öppnar Körpasset… Om appen inte är installerad väljer du App Store eller Google Play.",
      );
      if (typeof window.clearTimeout === "function") window.clearTimeout(inviteOpenTimer);
      if (typeof window.setTimeout === "function") {
        inviteOpenTimer = window.setTimeout(function () {
          let hidden = false;
          try {
            hidden = document.hidden === true || document.visibilityState === "hidden";
          } catch (error) {
            hidden = false;
          }
          if (!hidden) setInviteOpenStatus(INVITE_MISSING_APP);
        }, 1200);
      }
    }
    window.location.assign(url);
    return plat === "android" ? "android-intent" : "ios-scheme";
  }

  function bindInviteOpenButton() {
    const link = document.getElementById("invite-open-app-link");
    if (!link || link.getAttribute("data-invite-bound") === "1") return;
    if (typeof link.addEventListener !== "function") return;
    link.setAttribute("data-invite-bound", "1");
    link.addEventListener("click", function (event) {
      if (event && event.preventDefault) event.preventDefault();
      const match = (window.location.pathname || "").match(/^\/invite\/([A-Za-z0-9_-]+)$/);
      if (!match) return;
      openInviteFromBrowser(match[1]);
    });
  }

  function prepareInviteHandoff() {
    if (nativeApp()) {
      hideInviteOpenApp();
      return;
    }
    const match = (window.location.pathname || "").match(/^\/invite\/([A-Za-z0-9_-]+)$/);
    if (!match) return;
    const panel = document.getElementById("invite-open-app");
    if (!panel) return;
    panel.hidden = false;
    bindInviteOpenButton();
    applyInviteStoreChoice(browserPlatform());
    if (installRequested()) {
      setInviteOpenStatus(INVITE_MISSING_APP);
      return;
    }
    // Universal Links already tried to open the iOS app before this page
    // loaded. Assigning korpasset:// here is what makes Safari say the
    // address is invalid when the app is not installed.
    if (
      browserPlatform() === "android" &&
      androidIntentSupported() &&
      !inviteOpenAttempted(match[1])
    ) {
      rememberInviteOpenAttempt(match[1]);
      openInviteFromBrowser(match[1]);
    }
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
    const status = document.createElement("p");
    status.id = "oauth-status";
    status.className = "muted";
    status.hidden = true;
    status.textContent = "Loggar in…";
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
    const hint = document.createElement("p");
    hint.id = "oauth-google-hint";
    hint.className = "muted";
    hint.hidden = true;
    hint.textContent = GOOGLE_HINT_TEXT;
    const reauth = document.createElement("div");
    reauth.id = "oauth-google-reauth";
    reauth.className = "stack";
    reauth.hidden = true;
    fillGoogleReauthHelp(reauth);
    wrap.appendChild(intro);
    wrap.appendChild(error);
    wrap.appendChild(reauth);
    wrap.appendChild(status);
    wrap.appendChild(hint);
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
        if (consumeAuthCallbackUrl(event && event.url, "appUrlOpen")) return;
        consumeIncomingUrl(event && event.url, "appUrlOpen");
      });
      App.addListener("appStateChange", function (state) {
        if (state && state.isActive) recoverAuth("resume");
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
      if (consumeAuthCallbackUrl(launchUrl, "cold start")) return;
      consumeIncomingUrl(launchUrl, "cold start");
      return;
    }

    if (!onInvite) consumePendingIfNeeded("pending");
  }

  window.KORPASSET_AUTH = {
    AUTH_KEY: AUTH_KEY,
    recover: recoverAuth,
    isInProgress: function () {
      return Boolean(authRuntime.inProgress || authRuntime.navigating || readAuth());
    },
    continueWith: continueWith,
    consumeAuthCallbackUrl: consumeAuthCallbackUrl,
    readAuth: readAuth,
    clearAuth: clearAuth,
    safeRedirectPath: safeRedirectPath,
  };

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
    browserPlatform: browserPlatform,
    inviteOpenUrl: inviteOpenUrl,
    openInviteFromBrowser: openInviteFromBrowser,
  };

  document.addEventListener("click", function (event) {
    const target = event.target && event.target.closest ? event.target : null;
    if (!target) return;
    const button = target.closest("[data-oauth-provider]");
    if (!button) return;
    event.preventDefault();
    if (button.disabled || button.getAttribute("aria-busy") === "true") return;
    continueWith(button.getAttribute("data-oauth-provider"));
  });

  function bootAuth() {
    if (consumeGoogleBrowserReturn()) return;
    if (consumeAuthOutcomeQuery()) return;
    recoverAuth("boot").then(function (result) {
      if (result && result.authenticated) {
        hideGoogleDeviceHint();
        return;
      }
      showGoogleDeviceHintOnce();
    });
  }

  prepareInviteHandoff();
  prepareNativeInviteLogin();
  bootNativeInviteHandoff();
  bootAuth();
})();
