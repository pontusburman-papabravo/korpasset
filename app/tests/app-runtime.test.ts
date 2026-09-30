import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { isNativeProductPath } from "../src/auth/session.js";
import {
  appRuntimeFromCapacitor,
  readCapacitorNative,
  trackingPolicy,
} from "../src/http/runtime.js";

const consentSource = fs.readFileSync(new URL("../public/consent.js", import.meta.url), "utf8");
const infoPlist = fs.readFileSync(
  new URL("../../native/ios/App/App/Info.plist", import.meta.url),
  "utf8",
);

describe("app runtime tracking policy", () => {
  it("keeps website marketing/analytics on, and turns both off in any native app WebView", () => {
    assert.deepEqual(trackingPolicy({ isNativeApp: false, nativePlatform: "" }), {
      isNativeApp: false,
      nativePlatform: "",
      allowMarketingTracking: true,
      allowAnalyticsTracking: true,
      showConsentBanner: true,
      showMarketingConsent: true,
    });
    assert.deepEqual(trackingPolicy({ isNativeApp: true, nativePlatform: "android" }), {
      isNativeApp: true,
      nativePlatform: "android",
      allowMarketingTracking: false,
      allowAnalyticsTracking: false,
      showConsentBanner: false,
      showMarketingConsent: false,
    });
    assert.deepEqual(trackingPolicy({ isNativeApp: true, nativePlatform: "ios" }), {
      isNativeApp: true,
      nativePlatform: "ios",
      allowMarketingTracking: false,
      allowAnalyticsTracking: false,
      showConsentBanner: false,
      showMarketingConsent: false,
    });
    assert.deepEqual(trackingPolicy({ isNativeApp: true, nativePlatform: "unknown" }), {
      isNativeApp: true,
      nativePlatform: "unknown",
      allowMarketingTracking: false,
      allowAnalyticsTracking: false,
      showConsentBanner: false,
      showMarketingConsent: false,
    });
  });

  it("prefers Capacitor isNativePlatform/getPlatform over a missing User-Agent", () => {
    assert.deepEqual(
      readCapacitorNative({
        isNativePlatform: () => true,
        getPlatform: () => "ios",
      }),
      { isNativeApp: true, nativePlatform: "ios" },
    );
    assert.deepEqual(
      readCapacitorNative({
        isNativePlatform: () => false,
        getPlatform: () => "web",
      }),
      { isNativeApp: false, nativePlatform: "" },
    );
    assert.deepEqual(
      appRuntimeFromCapacitor({
        isNativePlatform: () => true,
        getPlatform: () => "android",
      }).nativePlatform,
      "android",
    );
    assert.deepEqual(readCapacitorNative(undefined), {
      isNativeApp: false,
      nativePlatform: "",
    });
  });

  it("treats product and invite paths as native, not the public website", () => {
    assert.equal(isNativeProductPath("/app"), true);
    assert.equal(isNativeProductPath("/konto"), true);
    assert.equal(isNativeProductPath("/onboarding?som=elev"), true);
    assert.equal(isNativeProductPath("/onboarding/handledare"), true);
    assert.equal(isNativeProductPath("/onboarding/elev"), true);
    assert.equal(isNativeProductPath("/guide"), true);
    assert.equal(isNativeProductPath("/guide/car_control_pre_drive_check"), true);
    assert.equal(isNativeProductPath("/invite/abc"), true);
    assert.equal(isNativeProductPath("/journey/00000000-0000-0000-0000-000000000000/nasta"), true);
    assert.equal(isNativeProductPath("/"), false);
    assert.equal(isNativeProductPath("/cookies"), false);
    assert.equal(isNativeProductPath("/integritet"), false);
  });

  it("does not add ATT and keeps the Capacitor gate next to Meta init", () => {
    assert.doesNotMatch(infoPlist, /NSUserTrackingUsageDescription/);
    assert.doesNotMatch(infoPlist, /ATTrackingManager/);
    assert.match(consentSource, /window\.Capacitor/);
    assert.match(consentSource, /isNativePlatform/);
    assert.match(consentSource, /getPlatform/);
    assert.match(consentSource, /allowMarketingTracking/);
    assert.match(consentSource, /window\.KORPASSET_RUNTIME/);
    assert.doesNotMatch(consentSource, /userAgent|navigator\.userAgent/i);
  });
});
