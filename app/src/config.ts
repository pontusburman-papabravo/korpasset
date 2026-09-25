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
  activeJourneyCookieName: "korpasset_active_journey",
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
    return uniqueCsv(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_IDS,
      process.env.GOOGLE_WEB_CLIENT_ID,
      process.env.GOOGLE_IOS_CLIENT_ID,
    )
      .map((item) => sanitizePublicGoogleClientId(item))
      .filter(Boolean);
  },
  get googleWebClientId() {
    return (
      sanitizePublicGoogleClientId(process.env.GOOGLE_WEB_CLIENT_ID) ||
      config.googleAudiences[0] ||
      ""
    );
  },
  get googleIosClientId() {
    return sanitizePublicGoogleClientId(process.env.GOOGLE_IOS_CLIENT_ID);
  },
  get androidPackageName() {
    return env("ANDROID_PACKAGE_NAME", config.appleBundleId);
  },
  get androidSha256CertFingerprints() {
    return sanitizeSha256Fingerprints(process.env.ANDROID_SHA256_CERT_FINGERPRINTS);
  },
  isOAuthConfigured(provider: "apple" | "google"): boolean {
    return provider === "apple"
      ? config.appleAudiences.length > 0
      : config.googleAudiences.length > 0;
  },
  /**
   * GA4 measurement id (G-…). Empty unless the value matches Google's format,
   * so a placeholder never reaches the page.
   */
  get gaMeasurementId() {
    const value = (process.env.GA_MEASUREMENT_ID ?? "").trim();
    return /^G-[A-Z0-9]+$/.test(value) ? value : "";
  },
  /**
   * Meta Pixel id. Empty unless the value is numeric, so a placeholder
   * never reaches the page. The pixel is not loaded until marketing consent.
   */
  get metaPixelId() {
    const value = (process.env.META_PIXEL_ID ?? "").trim();
    return /^\d{8,20}$/.test(value) ? value : "";
  },
  /** Guest-elev via /onboarding. Off in production unless explicitly enabled. */
  get allowGuestStudentOnboarding() {
    if (process.env.ALLOW_GUEST_STUDENT_ONBOARDING === "true") return true;
    if (process.env.ALLOW_GUEST_STUDENT_ONBOARDING === "false") return false;
    return !isProduction();
  },
};

function uniqueCsv(...values: Array<string | undefined>): string[] {
  const items = values
    .flatMap((value) => (value ?? "").split(","))
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(items)];
}

/** Public Google client IDs only. Drops docs placeholders that crash GIDSignIn on iOS. */
export function sanitizePublicGoogleClientId(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.includes("<") || trimmed.includes(">")) return "";
  if (!trimmed.endsWith(".apps.googleusercontent.com")) return "";
  return trimmed;
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

  const oauthMissing: string[] = [];
  if (!config.appleTeamId) oauthMissing.push("APPLE_TEAM_ID");
  if (config.appleAudiences.length === 0) {
    oauthMissing.push("APPLE_CLIENT_ID or APPLE_CLIENT_IDS");
  }
  if (config.googleAudiences.length === 0) {
    oauthMissing.push("GOOGLE_CLIENT_ID, GOOGLE_CLIENT_IDS, or GOOGLE_WEB_CLIENT_ID");
  }
  if (!config.googleIosClientId) oauthMissing.push("GOOGLE_IOS_CLIENT_ID");
  if (oauthMissing.length > 0) {
    throw new Error(
      `Production requires ${oauthMissing.join(", ")} (product login must not 503)`,
    );
  }
}

/** Play App Signing fingerprints only. Drops placeholders and malformed values. */
export function sanitizeSha256Fingerprints(value: string | undefined): string[] {
  return uniqueCsv(value)
    .map((item) => item.toUpperCase())
    .filter((item) => /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(item));
}

export const productionDefaults = {
  DEV_SESSION_SECRET,
  DEV_DATABASE_URL,
  DEV_APP_BASE_URL,
};
