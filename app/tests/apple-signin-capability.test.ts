import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("iOS Sign in with Apple capability", () => {
  it("commits the entitlement the system needs before it will show the Apple sheet", () => {
    const entitlements = readFileSync(
      join(root, "native/ios/App/App/App.entitlements"),
      "utf8",
    );
    assert.match(entitlements, /<key>com\.apple\.developer\.applesignin<\/key>/);
    assert.match(entitlements, /<string>Default<\/string>/);
  });

  it("uses a social-login plugin that presents Apple on the key window", () => {
    const lock = readFileSync(join(root, "native/package-lock.json"), "utf8");
    assert.match(
      lock,
      /"node_modules\/@capgo\/capacitor-social-login":\s*\{[^}]*"version": "8\.5\.12"/,
    );
  });
});
