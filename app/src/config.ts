const DEV_SESSION_SECRET = "dev-session-secret-change-in-production";
const DEV_DATABASE_URL =
  "postgresql://bilklar:bilklar@localhost:54329/bilklar_test";
const DEV_APP_BASE_URL = "http://localhost:3000";

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export const config = {
  get port() {
    return Number(env("PORT", "3000"));
  },
  get databaseUrl() {
    return env("DATABASE_URL", DEV_DATABASE_URL);
  },
  get sessionSecret() {
    return env("SESSION_SECRET", DEV_SESSION_SECRET);
  },
  sessionCookieName: "bilklar_session",
  invitationExpiryDays: 7,
  get appBaseUrl() {
    return env("APP_BASE_URL", DEV_APP_BASE_URL);
  },
  get cookieSecure() {
    if (process.env.COOKIE_SECURE === "true") return true;
    if (process.env.COOKIE_SECURE === "false") return false;
    return config.appBaseUrl.startsWith("https://");
  },
  get logLevel() {
    return env("LOG_LEVEL", isProduction() ? "info" : "silent");
  },
  get migrationsDir() {
    return process.env.MIGRATIONS_DIR ?? "";
  },
  get resendApiKey() {
    return process.env.RESEND_API_KEY ?? "";
  },
  get resendWebhookSecret() {
    return process.env.RESEND_WEBHOOK_SECRET ?? "";
  },
  get emailFrom() {
    return process.env.EMAIL_FROM ?? "Körpasset <support@korpasset.se>";
  },
  nativeCookieName: "korpasset_native",
  get appleBundleId() {
    return env("APPLE_BUNDLE_ID", "se.korpasset.app");
  },
  get appleTeamId() {
    return (process.env.APPLE_TEAM_ID ?? "").trim();
  },
  get appleAudiences() {
    return uniqueCsv(process.env.APPLE_CLIENT_ID, process.env.APPLE_CLIENT_IDS);
  },
  get googleAudiences() {
    return uniqueCsv(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_IDS);
  },
  get googleWebClientId() {
    return (process.env.GOOGLE_WEB_CLIENT_ID ?? config.googleAudiences[0] ?? "").trim();
  },
  get googleIosClientId() {
    return (process.env.GOOGLE_IOS_CLIENT_ID ?? "").trim();
  },
  get androidPackageName() {
    return env("ANDROID_PACKAGE_NAME", config.appleBundleId);
  },
  get androidSha256CertFingerprints() {
    return uniqueCsv(process.env.ANDROID_SHA256_CERT_FINGERPRINTS);
  },
  isOAuthConfigured(provider: "apple" | "google"): boolean {
    return provider === "apple"
      ? config.appleAudiences.length > 0
      : config.googleAudiences.length > 0;
  },
};

function uniqueCsv(...values: Array<string | undefined>): string[] {
  const items = values
    .flatMap((value) => (value ?? "").split(","))
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(items)];
}

export function assertProductionConfig(): void {
  if (!isProduction()) return;

  const missing: string[] = [];
  for (const name of ["DATABASE_URL", "SESSION_SECRET", "APP_BASE_URL"] as const) {
    if (!process.env[name]) missing.push(name);
  }
  if (missing.length > 0) {
    throw new Error(
      `Production requires ${missing.join(", ")} to be set (no repo defaults)`,
    );
  }

  if (process.env.SESSION_SECRET === DEV_SESSION_SECRET) {
    throw new Error("SESSION_SECRET must not use the development default");
  }

  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }

  const baseUrl = process.env.APP_BASE_URL ?? "";
  const allowHttp = process.env.ALLOW_HTTP === "true";
  if (!baseUrl.startsWith("https://") && !allowHttp) {
    throw new Error(
      "APP_BASE_URL must be https in production (ALLOW_HTTP=true is only for local prod-like runs)",
    );
  }
}

export const productionDefaults = {
  DEV_SESSION_SECRET,
  DEV_DATABASE_URL,
  DEV_APP_BASE_URL,
};
