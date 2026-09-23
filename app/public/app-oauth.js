(function () {
  const oauth = window.KORPASSET_OAUTH || {};

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

  function prepareInviteHandoff() {
    if (nativeApp()) return;
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

  document.addEventListener("click", function (event) {
    const button = event.target.closest("[data-oauth-provider]");
    if (!button) return;
    event.preventDefault();
    continueWith(button.getAttribute("data-oauth-provider"));
  });

  prepareInviteHandoff();
})();
