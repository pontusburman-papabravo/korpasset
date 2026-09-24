import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createSessionToken } from "../src/auth/session.js";
import { sanitizeSha256Fingerprints } from "../src/config.js";
import { acceptInvitation, createInvitation } from "../src/services/invitations.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import { createTestApp } from "./helpers.js";
import { injectWithSession } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

describe("beta readiness", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  afterEach(() => {
    delete process.env.ANDROID_SHA256_CERT_FINGERPRINTS;
  });

  it("encodes the canonical https invite URL in the QR page", async () => {
    const { journey, userId } = await createJourneyForStudent("Ella");
    const app = await createTestApp();
    const response = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(userId) },
      { method: "POST", url: `/journey/${journey.id}/invitations` },
    );
    assert.equal(response.statusCode, 200);
    const match = response.body.match(/id="invite-url"[^>]*value="([^"]+)"/);
    assert.ok(match);
    const inviteUrl = match[1];
    assert.match(inviteUrl, /^https?:\/\/[^"']+\/invite\/[A-Za-z0-9_-]+$/);
    assert.equal(inviteUrl.includes("korpasset://"), false);
    assert.match(response.body, /data:image\/png;base64,/);
    assert.equal(response.body.includes(`value="korpasset://`), false);
    await app.close();
  });

  it("keeps the invite page usable when the app is not installed", async () => {
    const { journey, userId } = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(journey.id, userId);
    const app = await createTestApp();
    const response = await app.inject({
      method: "GET",
      url: `/invite/${invitation.token}`,
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /id="invite-install-fallback"/);
    assert.match(response.body, /installera Körpasset och öppna samma länk igen/);
    assert.match(response.body, new RegExp(`action="/invite/${invitation.token}/accept"`));
    assert.match(response.body, /korpasset:\/\/invite\//);
    await app.close();
  });

  it("lets a second supervisor open the same journey history", async () => {
    const { journey, userId } = await createJourneyForStudent("Ella");
    const firstInvite = await createInvitation(journey.id, userId);
    const first = await acceptInvitation(firstInvite.token, "Pappa", null);
    const secondInvite = await createInvitation(journey.id, userId);
    const second = await acceptInvitation(secondInvite.token, "Mamma", null);
    assert.notEqual(first.userId, second.userId);

    const app = await createTestApp();
    const page = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(second.userId) },
      { method: "GET", url: `/journey/${journey.id}` },
    );
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Ella/);
    await app.close();
  });

  it("drops malformed Android fingerprints and keeps colon-hex SHA-256 values", () => {
    const real = "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";
    assert.deepEqual(sanitizeSha256Fingerprints(`${real}, <placeholder>, nope`), [real]);
    assert.deepEqual(sanitizeSha256Fingerprints(undefined), []);
  });
});
