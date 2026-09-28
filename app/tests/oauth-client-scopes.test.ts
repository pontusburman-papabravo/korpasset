import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

const script = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../public/app-oauth.js"),
  "utf8",
);

type LoginCall = {
  provider: string;
  options: { scopes?: string[]; nonce: string };
};

type InitPayload = {
  apple?: { clientId: string };
  google?: { mode: string; webClientId?: string; iOSServerClientId?: string; iOSClientId?: string };
};

type PostedBody = {
  identityToken?: string;
  authorizationCode?: string;
  displayName?: string;
  nonce?: string;
};

type OAuthTrace = {
  step?: string;
  platform?: string;
  hasIdentityToken?: boolean;
  pluginCode?: string;
  pluginMessage?: string;
  httpStatus?: number;
  backendCode?: string;
  created?: boolean | null;
};

type FetchResult = {
  ok: boolean;
  status: number;
  json: () => Promise<Record<string, unknown>>;
};

function installClient(
  profile: Record<string, string | null>,
  resultExtra: Record<string, unknown> = {},
  platformName = "ios",
  loginImpl?: (call: LoginCall) => Promise<unknown>,
  fetchImpl?: (url: string, body: PostedBody) => Promise<FetchResult>,
  initializeImpl?: () => Promise<void>,
) {
  const logins: LoginCall[] = [];
  const inits: InitPayload[] = [];
  const posts: PostedBody[] = [];
  const errors: string[] = [];
  const traces: OAuthTrace[] = [];
  const beacons: string[] = [];
  let click: (event: {
    target: { closest: (selector: string) => { getAttribute: () => string } | null };
    preventDefault: () => void;
  }) => void = () => {};

  const sandbox: Record<string, unknown> = {
    URL,
    console: {
      info(label: string, event?: OAuthTrace) {
        if (label === "[korpasset-oauth]" && event) traces.push(event);
      },
    },
    document: {
      getElementById(id: string) {
        if (id !== "oauth-error") return null;
        return {
          hidden: true,
          set textContent(value: string) {
            errors.push(value);
          },
        };
      },
      querySelector() {
        return { getAttribute: () => "/app" };
      },
      addEventListener(
        _type: string,
        handler: (event: {
          target: { closest: (selector: string) => { getAttribute: () => string } | null };
          preventDefault: () => void;
        }) => void,
      ) {
        click = handler;
      },
    },
    crypto: {
      getRandomValues(bytes: Uint8Array) {
        bytes.fill(7);
        return bytes;
      },
    },
    fetch: async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as PostedBody & { message?: string };
      if (url === "/api/client-error") {
        beacons.push(body.message ?? "");
        return { ok: true, status: 204, json: async () => ({}) };
      }
      posts.push(body);
      if (fetchImpl) return fetchImpl(url, body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ redirectTo: "/app", created: true }),
      };
    },
    window: {
      KORPASSET_OAUTH: {
        appleClientId: "se.korpasset.app",
        googleWebClientId: "web.apps.googleusercontent.com",
        googleIosClientId: "ios.apps.googleusercontent.com",
      },
      Capacitor: {
        getPlatform: () => platformName,
        Plugins: {
          SocialLogin: {
            async initialize(payload: InitPayload) {
              inits.push(payload);
              if (initializeImpl) await initializeImpl();
            },
            async login(call: LoginCall) {
              logins.push(call);
              if (loginImpl) return loginImpl(call);
              return {
                result: {
                  idToken: "identity-token",
                  profile,
                  ...resultExtra,
                },
              };
            },
          },
        },
      },
      location: {
        pathname: "/app",
        search: "",
        href: "https://korpasset.se/app",
        assign() {},
      },
      sessionStorage: {
        getItem() {
          return null;
        },
        setItem() {},
        removeItem() {},
      },
    },
  };

  runInContext(script, createContext(sandbox));
  return { logins, inits, posts, errors, traces, beacons, click };
}

async function clickProvider(
  click: ReturnType<typeof installClient>["click"],
  provider: "apple" | "google",
): Promise<void> {
  click({
    target: {
      closest(selector: string) {
        if (selector !== "[data-oauth-provider]") return null;
        return { getAttribute: () => provider };
      },
    },
    preventDefault() {},
  });
  await new Promise((resolve) => setImmediate(resolve));
}

describe("native OAuth login scopes", () => {
  it("asks Apple for email and name, and keeps the nonce", async () => {
    const client = installClient({ givenName: "Ada", familyName: "Lovelace", name: "Ada Lovelace" });
    await clickProvider(client.click, "apple");

    assert.equal(client.logins.length, 1);
    assert.equal(client.logins[0].provider, "apple");
    assert.deepEqual(Array.from(client.logins[0].options.scopes), ["email", "name"]);
    assert.equal(client.posts.length, 1);
    assert.equal(client.posts[0].nonce, client.logins[0].options.nonce);
    assert.equal(client.posts[0].displayName, "Ada Lovelace");
    assert.equal(client.posts[0].authorizationCode, undefined);
  });

  it("sends the Apple authorization code from the legacy accessToken field", async () => {
    const client = installClient(
      { givenName: null, familyName: null },
      { accessToken: { token: "apple-auth-code" } },
    );
    await clickProvider(client.click, "apple");

    assert.equal(client.posts.length, 1);
    assert.equal(client.posts[0].identityToken, "identity-token");
    assert.equal(client.posts[0].authorizationCode, "apple-auth-code");
    assert.equal(client.posts[0].displayName, "");
  });

  it("prefers an explicit Apple authorizationCode over accessToken.token", async () => {
    const client = installClient(
      {},
      {
        authorizationCode: "explicit-code",
        accessToken: { token: "legacy-code" },
      },
    );
    await clickProvider(client.click, "apple");
    assert.equal(client.posts[0].authorizationCode, "explicit-code");
  });

  it("asks Google for email and profile, never name", async () => {
    const client = installClient({
      email: "ada@example.com",
      givenName: "Ada",
      familyName: "Lovelace",
      name: "Ada Lovelace",
      id: "google-user",
      imageUrl: null,
    });
    await clickProvider(client.click, "google");

    assert.equal(client.logins.length, 1);
    assert.equal(client.logins[0].provider, "google");
    const scopes = Array.from(client.logins[0].options.scopes);
    assert.deepEqual(scopes, ["email", "profile"]);
    assert.equal(scopes.includes("name"), false);
    assert.equal(client.posts.length, 1);
    assert.equal(client.posts[0].nonce, client.logins[0].options.nonce);
    assert.equal(client.posts[0].displayName, "Ada Lovelace");
    assert.equal(client.posts[0].authorizationCode, undefined);
  });

  it("does not send a Google access token as an Apple authorization code", async () => {
    const client = installClient(
      { name: "Ada Lovelace" },
      { accessToken: { token: "google-access-token" } },
    );
    await clickProvider(client.click, "google");
    assert.equal(client.posts[0].authorizationCode, undefined);
    assert.equal(JSON.stringify(client.posts[0]).includes("google-access-token"), false);
  });

  it("starts Android Google login without Apple init or custom scopes", async () => {
    const client = installClient({ name: "Ada Lovelace" }, {}, "android");
    await clickProvider(client.click, "google");

    assert.equal(client.inits.length, 1);
    assert.equal(client.inits[0].apple, undefined);
    assert.equal(client.inits[0].google?.mode, "online");
    assert.equal(client.inits[0].google?.webClientId, "web.apps.googleusercontent.com");
    assert.equal(client.logins.length, 1);
    assert.equal(client.logins[0].provider, "google");
    assert.equal(client.logins[0].options.scopes, undefined);
    assert.equal(typeof client.logins[0].options.nonce, "string");
    assert.equal(client.posts.length, 1);
    assert.equal(client.posts[0].identityToken, "identity-token");
    assert.equal(client.posts[0].nonce, client.logins[0].options.nonce);
    assert.equal(client.errors.length, 0);
  });

  it("keeps Apple and Google together when iOS starts Google login", async () => {
    const client = installClient({ name: "Ada Lovelace" });
    await clickProvider(client.click, "google");

    assert.equal(client.inits[0].apple?.clientId, "se.korpasset.app");
    assert.equal(client.inits[0].google?.webClientId, "web.apps.googleusercontent.com");
    assert.deepEqual(Array.from(client.logins[0].options.scopes ?? []), ["email", "profile"]);
  });

  it("shows cancellation only when the native login was actually cancelled", async () => {
    const cancelled = installClient({ name: "Ada" }, {}, "android", async () => {
      const error = new Error("Google Sign-In cancelled by user");
      (error as Error & { code?: string }).code = "USER_CANCELLED";
      throw error;
    });
    await clickProvider(cancelled.click, "google");
    assert.deepEqual(cancelled.errors, ["Inloggningen avbröts. Försök igen."]);
    assert.equal(cancelled.posts.length, 0);
    assert.equal(cancelled.traces[0]?.step, "google_login_cancelled");
    assert.equal(cancelled.traces[0]?.pluginCode, "USER_CANCELLED");

    const rejected = installClient({ name: "Ada" }, {}, "android", async () => {
      throw new Error("apple.android.redirectUrl is null or empty");
    });
    await clickProvider(rejected.click, "google");
    assert.deepEqual(rejected.errors, ["Kunde inte logga in. Försök igen."]);
    assert.equal(rejected.posts.length, 0);
    assert.equal(rejected.traces[0]?.step, "google_native_login_failed");
    assert.notEqual(rejected.traces[0]?.step, "google_login_cancelled");
  });

  it("posts the id token from the Android 8.5.10 result shape", async () => {
    const client = installClient({ name: "Ada" }, {}, "android", async () => ({
      provider: "google",
      result: {
        accessToken: null,
        idToken: "android-id-token",
        profile: {
          email: "ada@example.com",
          familyName: "Lovelace",
          givenName: "Ada",
          id: "google-sub",
          name: "Ada Lovelace",
          imageUrl: null,
        },
        responseType: "online",
      },
    }));
    await clickProvider(client.click, "google");

    assert.equal(client.logins[0].options.scopes, undefined);
    assert.equal(client.inits[0].apple, undefined);
    assert.equal(client.posts.length, 1);
    assert.equal(client.posts[0].identityToken, "android-id-token");
    assert.equal(client.posts[0].displayName, "Ada Lovelace");
    assert.equal(client.posts[0].authorizationCode, undefined);
    assert.equal(client.traces.at(-1)?.step, "google_login_success");
    assert.equal(client.traces.at(-1)?.platform, "android");
    assert.equal(client.traces.at(-1)?.hasIdentityToken, true);
    assert.equal(client.traces.at(-1)?.created, true);
    const beacon = client.beacons.join("\n");
    assert.match(beacon, /step=google_login_success/);
    assert.equal(beacon.includes("android-id-token"), false);
    assert.equal(beacon.includes("ada@example.com"), false);
    assert.equal(beacon.includes("google-sub"), false);
    assert.equal(beacon.includes(client.logins[0].options.nonce), false);
  });

  it("records Credential Manager rejection after the account picker without posting", async () => {
    const reauth = installClient({ name: "Ada" }, {}, "android", async () => {
      throw new Error("Google Sign-In failed: [16] Account reauth failed");
    });
    await clickProvider(reauth.click, "google");
    assert.deepEqual(reauth.errors, ["Kunde inte logga in. Försök igen."]);
    assert.equal(reauth.posts.length, 0);
    assert.equal(reauth.traces[0]?.step, "google_native_login_failed");
    assert.equal(reauth.traces[0]?.pluginCode, "16");
    assert.equal(reauth.traces[0]?.hasIdentityToken, false);
    assert.match(reauth.beacons[0] ?? "", /pluginCode=16/);

    const consoleSetup = installClient({ name: "Ada" }, {}, "android", async () => {
      throw new Error(
        "Google Sign-In failed: Google Cloud OAuth is not configured for this installed build ([28444] Developer console is not set up correctly).",
      );
    });
    await clickProvider(consoleSetup.click, "google");
    assert.equal(consoleSetup.traces[0]?.step, "google_native_login_failed");
    assert.equal(consoleSetup.traces[0]?.pluginCode, "28444");
    assert.equal(consoleSetup.posts.length, 0);
    assert.deepEqual(consoleSetup.errors, ["Kunde inte logga in. Försök igen."]);
  });

  it("records a missing id token instead of posting an access token", async () => {
    const client = installClient({ name: "Ada" }, {}, "android", async () => ({
      provider: "google",
      result: {
        accessToken: { token: "access-only" },
        profile: { name: "Ada Lovelace" },
        responseType: "online",
      },
    }));
    await clickProvider(client.click, "google");
    assert.deepEqual(client.errors, ["Inloggningen gav ingen identitet. Försök igen."]);
    assert.equal(client.posts.length, 0);
    assert.equal(client.traces[0]?.step, "google_no_identity_token");
    assert.equal(client.beacons.join("").includes("access-only"), false);
  });

  it("records backend rejection and account-creation failure separately from cancellation", async () => {
    const rejected = installClient(
      { name: "Ada" },
      {},
      "android",
      undefined,
      async () => ({
        ok: false,
        status: 401,
        json: async () => ({
          error: "Ogiltig Google-inloggning",
          code: "invalid_identity",
          stage: "verify",
        }),
      }),
    );
    await clickProvider(rejected.click, "google");
    assert.deepEqual(rejected.errors, ["Ogiltig Google-inloggning"]);
    assert.equal(rejected.posts[0]?.identityToken, "identity-token");
    assert.equal(rejected.traces.at(-1)?.step, "google_backend_rejected");
    assert.equal(rejected.traces.at(-1)?.httpStatus, 401);
    assert.equal(rejected.traces.at(-1)?.backendCode, "invalid_identity");
    assert.equal(rejected.beacons.join("").includes("identity-token"), false);

    const account = installClient(
      { name: "Ada" },
      {},
      "android",
      undefined,
      async () => ({
        ok: false,
        status: 409,
        json: async () => ({
          error: "Det här Apple- eller Google-kontot hör redan till en annan användare.",
          code: "identity_on_other_user",
          stage: "account",
        }),
      }),
    );
    await clickProvider(account.click, "google");
    assert.equal(account.traces.at(-1)?.step, "google_account_creation_failed");
    assert.equal(account.traces.at(-1)?.httpStatus, 409);
    assert.equal(account.traces.at(-1)?.backendCode, "identity_on_other_user");
    assert.notEqual(account.errors[0], "Inloggningen avbröts. Försök igen.");
  });

  it("records a transport failure after a native id token exists", async () => {
    const client = installClient({ name: "Ada" }, {}, "android", undefined, async () => {
      throw new Error("network down");
    });
    await clickProvider(client.click, "google");
    assert.deepEqual(client.errors, ["Kunde inte logga in. Försök igen."]);
    assert.equal(client.traces.at(-1)?.step, "google_backend_request_failed");
    assert.equal(client.traces.at(-1)?.hasIdentityToken, true);
  });

  it("records Google initialize failure before login", async () => {
    const client = installClient(
      { name: "Ada" },
      {},
      "android",
      undefined,
      undefined,
      async () => {
        throw new Error("google.clientId is null or empty");
      },
    );
    await clickProvider(client.click, "google");
    assert.equal(client.logins.length, 0);
    assert.equal(client.posts.length, 0);
    assert.equal(client.traces[0]?.step, "google_initialize_failed");
    assert.deepEqual(client.errors, ["Kunde inte logga in. Försök igen."]);
  });

  it("still builds a Google display name from the profile name", async () => {
    const client = installClient({
      givenName: null,
      familyName: null,
      name: "Ada Lovelace",
    });
    await clickProvider(client.click, "google");

    assert.deepEqual(Array.from(client.logins[0].options.scopes), ["email", "profile"]);
    assert.equal(client.posts[0].displayName, "Ada Lovelace");
    assert.equal(client.posts[0].authorizationCode, undefined);
  });
});
