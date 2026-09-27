/**
 * Central tracking policy for Körpasset surfaces.
 *
 * Client detection lives in `app/public/consent.js` (`window.KORPASSET_RUNTIME`)
 * and uses Capacitor (`isNativePlatform` / `getPlatform`), not User-Agent.
 * This module is the same decision table so tests and docs stay aligned.
 *
 * Native iOS: no advertising/marketing tracking and no GA4 until we can
 * treat analytics as first-party measurement outside Apple's ATT definition.
 * The public website and native Android keep the existing consent model.
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
  const nativeIos = isNativeApp && nativePlatform === "ios";
  return {
    isNativeApp,
    nativePlatform,
    allowMarketingTracking: !nativeIos,
    allowAnalyticsTracking: !nativeIos,
    showConsentBanner: !nativeIos,
    showMarketingConsent: !nativeIos,
  };
}

export function appRuntimeFromCapacitor(capacitor: unknown): AppRuntime {
  return trackingPolicy(readCapacitorNative(capacitor));
}
