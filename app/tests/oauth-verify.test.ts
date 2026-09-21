import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateKeyPair, SignJWT, exportJWK, createLocalJWKSet } from "jose";
import { verifySignedIdentityToken } from "../src/auth/oauth-verify.js";

describe("oauth identity token verification", () => {
  it("accepts a signed Apple token with matching audience and issuer", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test-apple";
    const jwks = createLocalJWKSet({ keys: [jwk] });
    const token = await new SignJWT({ sub: "apple-user-1", email: "hidden@privaterelay.appleid.com" })
      .setProtectedHeader({ alg: "ES256", kid: "test-apple" })
      .setIssuer("https://appleid.apple.com")
      .setAudience("se.korpasset.app")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    const identity = await verifySignedIdentityToken({
      provider: "apple",
      token,
      jwks,
      issuer: "https://appleid.apple.com",
      audience: ["se.korpasset.app"],
    });
    assert.equal(identity.subject, "apple-user-1");
    assert.equal(identity.email, "hidden@privaterelay.appleid.com");
  });

  it("rejects a token for another audience", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test-apple";
    const jwks = createLocalJWKSet({ keys: [jwk] });
    const token = await new SignJWT({ sub: "apple-user-1" })
      .setProtectedHeader({ alg: "ES256", kid: "test-apple" })
      .setIssuer("https://appleid.apple.com")
      .setAudience("other.app")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    await assert.rejects(
      () =>
        verifySignedIdentityToken({
          provider: "apple",
          token,
          jwks,
          issuer: "https://appleid.apple.com",
          audience: ["se.korpasset.app"],
        }),
      /Ogiltig Apple-inloggning|unexpected "aud"|audience/,
    );
  });

  it("rejects a nonce mismatch", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test-google";
    const jwks = createLocalJWKSet({ keys: [jwk] });
    const token = await new SignJWT({ sub: "google-user-1", nonce: "abc" })
      .setProtectedHeader({ alg: "ES256", kid: "test-google" })
      .setIssuer("https://accounts.google.com")
      .setAudience("web.apps.googleusercontent.com")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    await assert.rejects(
      () =>
        verifySignedIdentityToken({
          provider: "google",
          token,
          jwks,
          issuer: ["https://accounts.google.com", "accounts.google.com"],
          audience: ["web.apps.googleusercontent.com"],
          nonce: "other",
        }),
      (error: Error & { code?: string }) => error.code === "invalid_nonce",
    );
  });
});
