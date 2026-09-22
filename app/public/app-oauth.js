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

  async function initialize(SocialLogin) {
    if (!SocialLogin || typeof SocialLogin.initialize !== "function") return;
    await SocialLogin.initialize({
      apple: {
        clientId: oauth.appleClientId || "se.korpasset.app",
      },
      google: {
        webClientId: oauth.googleWebClientId || undefined,
        iOSClientId: oauth.googleIosClientId || undefined,
        mode: "online",
      },
    });
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

    try {
      await initialize(SocialLogin);
      const result = await SocialLogin.login({
        provider,
        options: { scopes: ["email", "name"] },
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

  document.addEventListener("click", function (event) {
    const button = event.target.closest("[data-oauth-provider]");
    if (!button) return;
    event.preventDefault();
    continueWith(button.getAttribute("data-oauth-provider"));
  });
})();
