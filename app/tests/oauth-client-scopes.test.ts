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
  options: { scopes: string[]; nonce: string };
};

type PostedBody = {
  identityToken?: string;
  displayName?: string;
  nonce?: string;
};

function installClient(profile: Record<string, string | null>) {
  const logins: LoginCall[] = [];
  const posts: PostedBody[] = [];
  let click: (event: {
    target: { closest: (selector: string) => { getAttribute: () => string } | null };
    preventDefault: () => void;
  }) => void = () => {};

  const sandbox: Record<string, unknown> = {
    document: {
      getElementById() {
        return null;
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
    fetch: async (_url: string, init: { body: string }) => {
      posts.push(JSON.parse(init.body) as PostedBody);
      return {
        ok: true,
        json: async () => ({ redirectTo: "/app" }),
      };
    },
    window: {
      KORPASSET_OAUTH: {
        appleClientId: "se.korpasset.app",
        googleWebClientId: "web.apps.googleusercontent.com",
        googleIosClientId: "ios.apps.googleusercontent.com",
      },
      Capacitor: {
        getPlatform: () => "ios",
        Plugins: {
          SocialLogin: {
            async initialize() {},
            async login(call: LoginCall) {
              logins.push(call);
              return {
                result: {
                  idToken: "identity-token",
                  profile,
                },
              };
            },
          },
        },
      },
      location: {
        pathname: "/app",
        search: "",
        assign() {},
      },
    },
  };

  runInContext(script, createContext(sandbox));
  return { logins, posts, click };
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
  });
});
