/**
 * Central tracking policy for Körpasset surfaces.
 *
 * Client detection lives in `app/public/consent.js` (`window.KORPASSET_RUNTIME`).
 * It uses Capacitor (`isNativePlatform` / `getPlatform`) and, if Capacitor is
 * missing, the first-party `korpasset_native` cookie set by `/app` and invites.
 * It does not use User-Agent.
 *
 * Native app WebView (iOS and Android): no advertising/marketing tracking, no
 * GA4, and no cookie-consent UI. Apple Guideline 5.1.2(i) treats a cookie
 * prompt that offers tracking as tracking. The public website in a browser
 * keeps the existing consent model, including optional Meta Pixel and GA4.
 */
export type NativePlatform = "ios" | "android" | "unknown" | "";

export interface AppRuntime {
  isNativeApp: boolean;
  nativePlatform: NativePlatform;
  allowMarketingTracking: boolean;
  allowAnalyticsTracking: boolean;
  showConsentBanner: boolean;
  showMarketingConsent: boolean;
}

export interface CapacitorNativeSignal {
  isNativeApp: boolean;
  nativePlatform: NativePlatform;
}

export function readCapacitorNative(capacitor: unknown): CapacitorNativeSignal {
  const cap = capacitor as {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  } | null;
  if (!cap) {
    return { isNativeApp: false, nativePlatform: "" };
  }

  let platform: NativePlatform = "";
  if (typeof cap.getPlatform === "function") {
    const name = String(cap.getPlatform() || "").toLowerCase();
    if (name === "ios" || name === "android") platform = name;
    else if (name && name !== "web") platform = "unknown";
  }

  let isNativeApp = false;
  if (typeof cap.isNativePlatform === "function") {
    isNativeApp = Boolean(cap.isNativePlatform());
  } else {
    isNativeApp = platform === "ios" || platform === "android";
  }

  if (isNativeApp && !platform) platform = "unknown";
  if (!isNativeApp) platform = "";
  return { isNativeApp, nativePlatform: platform };
}

export function trackingPolicy(detected: CapacitorNativeSignal): AppRuntime {
  const isNativeApp = Boolean(detected.isNativeApp);
  const nativePlatform: NativePlatform = isNativeApp
    ? detected.nativePlatform || "unknown"
    : "";
  return {
    isNativeApp,
    nativePlatform,
    allowMarketingTracking: !isNativeApp,
    allowAnalyticsTracking: !isNativeApp,
    showConsentBanner: !isNativeApp,
    showMarketingConsent: !isNativeApp,
  };
}

export function appRuntimeFromCapacitor(capacitor: unknown): AppRuntime {
  return trackingPolicy(readCapacitorNative(capacitor));
}
