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

  it("accepts a Google token that omits nonce, which iOS GIDSignIn often does", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test-google";
    const jwks = createLocalJWKSet({ keys: [jwk] });
    const token = await new SignJWT({ sub: "google-user-1" })
      .setProtectedHeader({ alg: "ES256", kid: "test-google" })
      .setIssuer("https://accounts.google.com")
      .setAudience("ios.apps.googleusercontent.com")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    const identity = await verifySignedIdentityToken({
      provider: "google",
      token,
      jwks,
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: [
        "web.apps.googleusercontent.com",
        "ios.apps.googleusercontent.com",
      ],
      nonce: "client-nonce",
    });
    assert.equal(identity.subject, "google-user-1");
  });

  it("still requires Apple tokens to echo the nonce when one was sent", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test-apple";
    const jwks = createLocalJWKSet({ keys: [jwk] });
    const token = await new SignJWT({ sub: "apple-user-1" })
      .setProtectedHeader({ alg: "ES256", kid: "test-apple" })
      .setIssuer("https://appleid.apple.com")
      .setAudience("se.korpasset.app")
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
          nonce: "client-nonce",
        }),
      (error: Error & { code?: string }) => error.code === "invalid_nonce",
    );
  });

  it("rejects an expired token, the wrong issuer, a missing sub and a bad signature", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const other = await generateKeyPair("ES256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test-apple";
    const jwks = createLocalJWKSet({ keys: [jwk] });

    const expired = await new SignJWT({ sub: "apple-user-1" })
      .setProtectedHeader({ alg: "ES256", kid: "test-apple" })
      .setIssuer("https://appleid.apple.com")
      .setAudience("se.korpasset.app")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 120)
      .sign(privateKey);
    await assert.rejects(
      () =>
        verifySignedIdentityToken({
          provider: "apple",
          token: expired,
          jwks,
          issuer: "https://appleid.apple.com",
          audience: ["se.korpasset.app"],
        }),
      /exp|expired|Ogiltig/i,
    );

    const wrongIssuer = await new SignJWT({ sub: "apple-user-1" })
      .setProtectedHeader({ alg: "ES256", kid: "test-apple" })
      .setIssuer("https://evil.example")
      .setAudience("se.korpasset.app")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    await assert.rejects(
      () =>
        verifySignedIdentityToken({
          provider: "apple",
          token: wrongIssuer,
          jwks,
          issuer: "https://appleid.apple.com",
          audience: ["se.korpasset.app"],
        }),
      /iss|issuer|Ogiltig/i,
    );

    const missingSub = await new SignJWT({ email: "x@example.com" })
      .setProtectedHeader({ alg: "ES256", kid: "test-apple" })
      .setIssuer("https://appleid.apple.com")
      .setAudience("se.korpasset.app")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    await assert.rejects(
      () =>
        verifySignedIdentityToken({
          provider: "apple",
          token: missingSub,
          jwks,
          issuer: "https://appleid.apple.com",
          audience: ["se.korpasset.app"],
        }),
      (error: Error & { code?: string }) => error.code === "invalid_identity",
    );

    const forged = await new SignJWT({ sub: "apple-user-1" })
      .setProtectedHeader({ alg: "ES256", kid: "test-apple" })
      .setIssuer("https://appleid.apple.com")
      .setAudience("se.korpasset.app")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(other.privateKey);
    await assert.rejects(
      () =>
        verifySignedIdentityToken({
          provider: "apple",
          token: forged,
          jwks,
          issuer: "https://appleid.apple.com",
          audience: ["se.korpasset.app"],
        }),
      /signature|key|Ogiltig/i,
    );
  });
});
