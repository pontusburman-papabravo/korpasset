import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("iOS Sign in with Apple capability", () => {
  const entitlements = readFileSync(
    join(root, "native/ios/App/App/App.entitlements"),
    "utf8",
  );
  const project = readFileSync(
    join(root, "native/ios/App/App.xcodeproj/project.pbxproj"),
    "utf8",
  );
  const debugXcconfig = readFileSync(join(root, "native/ios/debug.xcconfig"), "utf8");

  it("commits Default Sign in with Apple on the app entitlements file", () => {
    assert.match(entitlements, /<key>com\.apple\.developer\.applesignin<\/key>/);
    assert.match(
      entitlements,
      /<key>com\.apple\.developer\.applesignin<\/key>\s*<array>\s*<string>Default<\/string>\s*<\/array>/,
    );
  });

  it("wires that file to the only app target for both Debug and Release", () => {
    assert.equal(project.match(/productType = "com\.apple\.product-type\.application"/g)?.length, 1);
    assert.deepEqual(project.match(/CODE_SIGN_ENTITLEMENTS = [^;]+;/g), [
      "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;",
      "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;",
    ]);
    assert.deepEqual(project.match(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g), [
      "PRODUCT_BUNDLE_IDENTIFIER = se.korpasset.app;",
      "PRODUCT_BUNDLE_IDENTIFIER = se.korpasset.app;",
    ]);
    assert.equal(project.match(/DEVELOPMENT_TEAM = PQ7M3B7VW5;/g)?.length, 2);
    assert.equal(project.includes("name = Archive"), false);
    assert.match(project, /defaultConfigurationName = Release;/);
    assert.equal(debugXcconfig.includes("CODE_SIGN_ENTITLEMENTS"), false);
    assert.equal(debugXcconfig.includes("PRODUCT_BUNDLE_IDENTIFIER"), false);
    assert.equal(project.includes("shellScript"), false);
  });

  it("uses social-login 8.5.12 and refuses an Apple sheet without a foreground window", () => {
    const lock = readFileSync(join(root, "native/package-lock.json"), "utf8");
    assert.match(
      lock,
      /"node_modules\/@capgo\/capacitor-social-login":\s*\{[^}]*"version": "8\.5\.12"/,
    );
    const patch = readFileSync(
      join(root, "native/patches/capacitor-social-login-apple-presentation.patch"),
      "utf8",
    );
    const added = patch
      .split("\n")
      .filter((line) => line.startsWith("+") && !line.startsWith("+++") && !line.includes("///"))
      .join("\n");
    assert.match(added, /activationState == \.foregroundActive/);
    assert.equal(added.includes("foregroundInactive"), false);
    assert.match(added, /isKeyWindow && !\$0\.isHidden/);
    assert.match(added, /Apple presentation anchor missing/);
    assert.equal(added.includes("UIApplication.shared.windows"), false);
  });
});
