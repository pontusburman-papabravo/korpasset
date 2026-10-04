(function (root) {
  var TITLE = "Körpasset";
  var TEXT =
    "Jag använder Körpasset för att hålla koll på min övningskörning. Kanske något för dig också?";

  function detectPlatform() {
    var cap = root.Capacitor;
    if (cap && typeof cap.getPlatform === "function") {
      var name = String(cap.getPlatform() || "");
      if (name === "ios" || name === "android") return name;
    }
    var ua = (root.navigator && root.navigator.userAgent) || "";
    if (/android/i.test(ua)) return "android";
    if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
    return "web";
  }

  function chooseShareChannel(env) {
    var cap = env && env.Capacitor;
    if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) {
      var plugin = cap.Plugins && cap.Plugins.Share;
      if (plugin && typeof plugin.share === "function") return "native";
    }
    if (env && typeof env.webShare === "function") return "web";
    return "copy";
  }

  function isCancel(error) {
    if (!error) return false;
    var name = String(error.name || "");
    var message = String(error.message || "");
    return name === "AbortError" || /cancel|cancell|abort|dismiss/i.test(message);
  }

  function post(eventName, surface, platform) {
    try {
      root.fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify({
          event: eventName,
          surface: surface,
          platform: platform,
        }),
      });
    } catch (ignore) {}
  }

  function showCopied(node) {
    var note = node.querySelector("[data-share-feedback]");
    if (!note) return;
    note.hidden = false;
    note.textContent = "Länken är kopierad";
  }

  async function copyLink(url) {
    var nav = root.navigator || {};
    if (nav.clipboard && typeof nav.clipboard.writeText === "function") {
      try {
        await nav.clipboard.writeText(url);
        return true;
      } catch (ignore) {}
    }
    var doc = root.document;
    if (!doc || typeof doc.createElement !== "function" || !doc.body) return false;
    var input = doc.createElement("textarea");
    input.value = url;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    doc.body.appendChild(input);
    input.select();
    var ok = false;
    try {
      ok = doc.execCommand("copy");
    } catch (ignore) {
      ok = false;
    }
    input.remove();
    return ok;
  }

  async function runShare(node, mode) {
    var surface = node.getAttribute("data-share-surface") || "website";
    var url = node.getAttribute("data-share-url") || "";
    var title = node.getAttribute("data-share-title") || TITLE;
    var text = node.getAttribute("data-share-text") || TEXT;
    var platform = detectPlatform();
    var payload = { title: title, text: text, url: url };
    post("share_started", surface, platform);

    if (mode === "copy") {
      if (await copyLink(url)) {
        post("share_link_copied", surface, platform);
        showCopied(node);
        return "copied";
      }
      return "failed";
    }

    var cap = root.Capacitor;
    var channel = chooseShareChannel({
      Capacitor: cap,
      webShare: root.navigator && root.navigator.share,
    });

    if (channel === "native") {
      try {
        await cap.Plugins.Share.share(payload);
        post("share_completed", surface, platform);
        return "completed";
      } catch (error) {
        if (isCancel(error)) return "cancelled";
      }
    }

    if (root.navigator && typeof root.navigator.share === "function") {
      try {
        await root.navigator.share(payload);
        post("share_completed", surface, platform);
        return "completed";
      } catch (error) {
        if (isCancel(error)) return "cancelled";
      }
    }

    if (await copyLink(url)) {
      post("share_link_copied", surface, platform);
      showCopied(node);
      return "copied";
    }
    return "failed";
  }

  function bind(node) {
    if (!node || node.getAttribute("data-share-bound") === "1") return;
    node.setAttribute("data-share-bound", "1");
    if (node.getAttribute("data-share-silent-view") !== "1") {
      post(
        "share_prompt_viewed",
        node.getAttribute("data-share-surface") || "website",
        detectPlatform(),
      );
    }
    var buttons = node.querySelectorAll ? node.querySelectorAll("[data-share-action]") : [];
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].addEventListener("click", function (event) {
        event.preventDefault();
        var action = this.getAttribute("data-share-action") || "share";
        runShare(node, action === "copy" ? "copy" : "share");
      });
    }
  }

  function start() {
    var doc = root.document;
    if (!doc || typeof doc.querySelectorAll !== "function") return;
    var nodes = doc.querySelectorAll("[data-share]");
    for (var i = 0; i < nodes.length; i += 1) bind(nodes[i]);
  }

  root.KorpassetShare = {
    chooseShareChannel: chooseShareChannel,
    detectPlatform: detectPlatform,
    runShare: runShare,
    bind: bind,
    start: start,
    copyLink: copyLink,
  };

  var doc = root.document;
  if (doc && doc.readyState === "loading" && typeof doc.addEventListener === "function") {
    doc.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(typeof window !== "undefined" ? window : globalThis);
