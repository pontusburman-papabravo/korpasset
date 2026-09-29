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
  reason?: string;
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
  page?: { hash?: string; native?: boolean },
) {
  const logins: LoginCall[] = [];
  const inits: InitPayload[] = [];
  const posts: PostedBody[] = [];
  const postUrls: string[] = [];
  const errors: string[] = [];
  const traces: OAuthTrace[] = [];
  const beacons: string[] = [];
  const assignments: string[] = [];
  let n = 0;
  const location = {
    pathname: "/app",
    search: "",
    hash: page?.hash ?? "",
    href: "https://korpasset.se/app",
    origin: "https://korpasset.se",
    assign(url: string) {
      assignments.push(url);
    },
    reload() {
      assignments.push(location.pathname || "/app");
    },
  };
  let click: (event: {
    target: { closest: (selector: string) => { getAttribute: () => string } | null };
    preventDefault: () => void;
  }) => void = () => {};

  const sandbox: Record<string, unknown> = {
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    console: {
      info(label: string, event?: OAuthTrace) {
        if (label === "[korpasset-oauth]" && event) traces.push(event);
      },
    },
    document: {
      body: {},
      getElementById(id: string) {
        if (id === "oauth-status") {
          return { hidden: true, textContent: "", className: "muted" };
        }
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
      querySelectorAll() {
        return [];
      },
      createElement() {
        return {
          id: "",
          className: "",
          hidden: true,
          textContent: "",
          setAttribute() {},
        };
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
        n += 1;
        for (let i = 0; i < bytes.length; i += 1) {
          bytes[i] = (n + i) & 0xff;
        }
        return bytes;
      },
    },
    fetch: async (url: string, init: { body?: string; method?: string }) => {
      if (String(url).startsWith("/api/auth/session")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ authenticated: false, redirectTo: null }),
        };
      }
      const body = JSON.parse(init.body ?? "{}") as PostedBody & { message?: string };
      if (url === "/api/client-error") {
        beacons.push(body.message ?? "");
        return { ok: true, status: 204, json: async () => ({}) };
      }
      postUrls.push(url);
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
      location,
      history: {
        replaceState(_state: null, _title: string, url: string) {
          location.hash = "";
          location.href = url;
        },
      },
      sessionStorage: {
        getItem() {
          return null;
        },
        setItem() {},
        removeItem() {},
      },
      localStorage: {
        getItem() {
          return null;
        },
        setItem() {},
        removeItem() {},
      },
    } as Record<string, unknown>,
  };
  if (page?.native !== false) {
    (sandbox.window as Record<string, unknown>).Capacitor = {
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
    };
  }

  runInContext(script, createContext(sandbox));
  return {
    logins,
    inits,
    posts,
    postUrls,
    errors,
    traces,
    beacons,
    assignments,
    hash: () => location.hash,
    click,
  };
}

function findTrace(traces: OAuthTrace[], step: string) {
  return traces.find((item) => item.step === step);
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
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
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
    assert.equal(cancelled.assignments.length, 0);
    assert.equal(findTrace(cancelled.traces, "google_login_cancelled")?.step, "google_login_cancelled");
    assert.equal(findTrace(cancelled.traces, "google_login_cancelled")?.pluginCode, "USER_CANCELLED");

    const rejected = installClient({ name: "Ada" }, {}, "android", async () => {
      throw new Error("apple.android.redirectUrl is null or empty");
    });
    await clickProvider(rejected.click, "google");
    assert.deepEqual(rejected.errors, ["Kunde inte logga in. Försök igen."]);
    assert.equal(rejected.posts.length, 0);
    assert.equal(rejected.assignments.length, 0);
    assert.equal(findTrace(rejected.traces, "google_native_login_failed")?.step, "google_native_login_failed");
    assert.equal(findTrace(rejected.traces, "google_login_cancelled"), undefined);
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
    assert.equal(client.postUrls[0], "/api/auth/google");
    assert.equal(client.assignments[0], "/app");
    assert.equal(client.posts[0].identityToken, "android-id-token");
    assert.equal(client.posts[0].displayName, "Ada Lovelace");
    assert.equal(client.posts[0].authorizationCode, undefined);
    assert.equal(findTrace(client.traces, "google_login_success")?.step, "google_login_success");
    assert.equal(findTrace(client.traces, "google_login_success")?.platform, "android");
    assert.equal(findTrace(client.traces, "google_login_success")?.hasIdentityToken, true);
    assert.equal(findTrace(client.traces, "google_login_success")?.created, true);
    const beacon = client.beacons.join("\n");
    assert.match(beacon, /step=google_login_success/);
    assert.equal(beacon.includes("android-id-token"), false);
    assert.equal(beacon.includes("ada@example.com"), false);
    assert.equal(beacon.includes("google-sub"), false);
    assert.equal(beacon.includes(client.logins[0].options.nonce), false);
  });

  it("fails the same attempt after Credential Manager 16 or 28444 once the native picker has been shown", async () => {
    const reauth = installClient({ name: "Ada" }, {}, "android", async () => {
      throw new Error(
        "Google Sign-In failed: [16] Account reauth failed. The plugin cleared Credential Manager credential-selection state and retried once.",
      );
    });
    await clickProvider(reauth.click, "google");
    assert.deepEqual(reauth.errors, [
      "Google stoppade inloggningen. Det visades inget att godkänna. Tryck Fortsätt med Google igen.",
    ]);
    assert.equal(reauth.posts.length, 0);
    assert.equal(reauth.logins.length, 1);
    assert.equal(reauth.assignments.length, 0);
    assert.equal(findTrace(reauth.traces, "google_native_login_failed")?.step, "google_native_login_failed");
    assert.equal(findTrace(reauth.traces, "google_native_login_failed")?.pluginCode, "16");
    assert.equal(findTrace(reauth.traces, "google_browser_fallback"), undefined);
    assert.equal(findTrace(reauth.traces, "auth_session_failed")?.reason, "credential-manager-rejected");
    assert.equal(findTrace(reauth.traces, "auth_path_selected")?.reason, "native");

    const consoleSetup = installClient({ name: "Ada" }, {}, "android", async () => {
      throw new Error(
        "Google Sign-In failed: Google Cloud OAuth is not configured for this installed build ([28444] Developer console is not set up correctly).",
      );
    });
    await clickProvider(consoleSetup.click, "google");
    assert.equal(findTrace(consoleSetup.traces, "google_native_login_failed")?.pluginCode, "28444");
    assert.equal(findTrace(consoleSetup.traces, "google_browser_fallback"), undefined);
    assert.equal(consoleSetup.assignments.length, 0);
    assert.deepEqual(consoleSetup.errors, ["Kunde inte logga in. Försök igen."]);
    assert.equal(findTrace(consoleSetup.traces, "auth_session_failed")?.reason, "credential-manager-rejected");

    const ios = installClient({ name: "Ada" }, {}, "ios", async () => {
      throw new Error("Google Sign-In failed: [16] Account reauth failed");
    });
    await clickProvider(ios.click, "google");
    assert.deepEqual(ios.errors, [
      "Google stoppade inloggningen. Det visades inget att godkänna. Tryck Fortsätt med Google igen.",
    ]);
    assert.equal(ios.assignments.length, 0);
    assert.equal(ios.posts.length, 0);
  });

  it("uses one browser fallback only when Credential Manager rejects initialize before the native picker", async () => {
    const beforePicker = installClient(
      { name: "Ada" },
      {},
      "android",
      async () => {
        throw new Error("login() must not run after initialize 28444");
      },
      undefined,
      async () => {
        throw new Error(
          "Google Sign-In failed: Google Cloud OAuth is not configured for this installed build ([28444] Developer console is not set up correctly).",
        );
      },
    );
    await clickProvider(beforePicker.click, "google");
    assert.equal(beforePicker.logins.length, 0);
    assert.equal(beforePicker.posts.length, 0);
    assert.equal(findTrace(beforePicker.traces, "google_initialize_failed")?.pluginCode, "28444");
    assert.equal(findTrace(beforePicker.traces, "auth_path_selected")?.reason, "browser-before-picker");
    assert.equal(findTrace(beforePicker.traces, "google_browser_fallback")?.step, "google_browser_fallback");
    assert.equal(beforePicker.assignments.length, 1);
    const url = new URL(beforePicker.assignments[0] ?? "");
    assert.equal(url.origin, "https://accounts.google.com");
    assert.equal(url.pathname, "/o/oauth2/v2/auth");
    assert.equal(url.searchParams.get("response_mode"), "form_post");
    assert.equal(url.searchParams.get("response_type"), "id_token");
    assert.equal(url.searchParams.get("prompt"), "select_account");
    assert.equal(url.searchParams.get("redirect_uri"), "https://korpasset.se/app");
    assert.equal(beforePicker.beacons.join("").includes("id_token"), false);
    assert.deepEqual(beforePicker.errors, []);

    const reauthInit = installClient(
      { name: "Ada" },
      {},
      "android",
      async () => {
        throw new Error("login() must not run after initialize 16");
      },
      undefined,
      async () => {
        throw new Error("Google Sign-In failed: [16] Account reauth failed");
      },
    );
    await clickProvider(reauthInit.click, "google");
    assert.equal(reauthInit.logins.length, 0);
    assert.equal(findTrace(reauthInit.traces, "auth_path_selected")?.reason, "browser-before-picker");
    assert.match(reauthInit.assignments[0] ?? "", /accounts\.google\.com/);
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
    assert.equal(findTrace(client.traces, "google_no_identity_token")?.step, "google_no_identity_token");
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
    assert.equal(findTrace(rejected.traces, "google_backend_rejected")?.step, "google_backend_rejected");
    assert.equal(findTrace(rejected.traces, "google_backend_rejected")?.httpStatus, 401);
    assert.equal(findTrace(rejected.traces, "google_backend_rejected")?.backendCode, "invalid_identity");
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
    assert.equal(findTrace(account.traces, "google_account_creation_failed")?.step, "google_account_creation_failed");
    assert.equal(findTrace(account.traces, "google_account_creation_failed")?.httpStatus, 409);
    assert.equal(findTrace(account.traces, "google_account_creation_failed")?.backendCode, "identity_on_other_user");
    assert.notEqual(account.errors[0], "Inloggningen avbröts. Försök igen.");
  });

  it("records a transport failure after a native id token exists", async () => {
    const client = installClient({ name: "Ada" }, {}, "android", undefined, async () => {
      throw new Error("network down");
    });
    await clickProvider(client.click, "google");
    assert.deepEqual(client.errors, ["Kunde inte logga in. Försök igen."]);
    assert.equal(findTrace(client.traces, "google_backend_request_failed")?.step, "google_backend_request_failed");
    assert.equal(findTrace(client.traces, "google_backend_request_failed")?.hasIdentityToken, true);
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
    assert.equal(findTrace(client.traces, "google_initialize_failed")?.step, "google_initialize_failed");
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

  it("returns a system-browser Google id token to the installed app without logging it", async () => {
    const token = "browser-id-token-value";
    const nonce = "07070707070707070707070707070707";
    const client = installClient(
      {},
      {},
      "ios",
      undefined,
      async (url) => {
        assert.equal(url, "/api/auth/google/browser-handoff");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            handoff: "handoffcodehandoffcode12",
            created: true,
          }),
        };
      },
      undefined,
      { hash: `#id_token=${token}&state=${nonce}`, native: false },
    );
    for (let i = 0; i < 10; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    assert.equal(client.hash(), "");
    assert.equal(client.posts.length, 1);
    assert.equal(client.postUrls[0], "/api/auth/google/browser-handoff");
    assert.equal(client.posts[0].identityToken, token);
    assert.equal(client.posts[0].nonce, nonce);
    assert.match(
      client.assignments[0] ?? "",
      /^intent:\/\/korpasset\.se\/app\?oauth_handoff=handoffcodehandoffcode12#Intent;scheme=https;package=se\.korpasset\.app;/,
    );
    const beacon = client.beacons.join("\n");
    assert.match(beacon, /step=google_browser_handoff/);
    assert.equal(beacon.includes(token), false);
    assert.equal(beacon.includes(nonce), false);
    assert.equal(client.errors.length, 0);
  });

  it("posts a Google id token that stayed in the app WebView to the normal login route", async () => {
    const client = installClient(
      {},
      {},
      "android",
      undefined,
      undefined,
      undefined,
      { hash: "#id_token=webview-id-token&state=webviewnonce", native: true },
    );
    for (let i = 0; i < 10; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(client.postUrls[0], "/api/auth/google");
    assert.equal(client.posts[0].identityToken, "webview-id-token");
    assert.equal(client.posts[0].nonce, "webviewnonce");
    assert.equal(client.assignments[0], "/app");
    assert.equal(client.hash(), "");
    assert.equal(client.beacons.join("").includes("webview-id-token"), false);
  });

  it("keeps a real Google cancel on the browser return as a cancel message", async () => {
    const client = installClient({}, {}, "ios", undefined, undefined, undefined, {
      hash: "#error=access_denied&state=abc",
      native: false,
    });
    for (let i = 0; i < 10; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(client.errors, ["Inloggningen avbröts. Försök igen."]);
    assert.equal(client.posts.length, 0);
    assert.equal(client.assignments.length, 0);
    assert.equal(findTrace(client.traces, "google_login_cancelled")?.step, "google_login_cancelled");
    assert.equal(client.hash(), "");
  });
});
