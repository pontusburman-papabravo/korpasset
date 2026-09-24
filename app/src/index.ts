import { buildServer } from "./http/server.js";
import { assertProductionConfig, config, isProduction } from "./config.js";
import { applyMigrations } from "./db/migrate.js";
import { seedTaxonomy } from "./db/seed-taxonomy.js";
import { startWaitlistRetentionJob } from "./jobs/waitlist-retention.js";

function logFatal(error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
}

process.on("uncaughtException", (error) => {
  logFatal(error);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  logFatal(error);
  process.exit(1);
});

async function main(): Promise<void> {
  assertProductionConfig();
  const migrations = await applyMigrations();
  await seedTaxonomy();
  const app = await buildServer();
  await app.listen({ port: config.port, host: "0.0.0.0" });
  if (isProduction()) {
    if (!config.isOAuthConfigured("apple") || !config.isOAuthConfigured("google")) {
      app.log.warn(
        "APPLE_CLIENT_ID / GOOGLE_CLIENT_ID saknas — waitlist fungerar, produktinloggning svarar 503",
      );
    }
    if (!config.googleIosClientId) {
      app.log.warn(
        "GOOGLE_IOS_CLIENT_ID saknas eller är ogiltig — Google-inloggning på iPhone är avstängd",
      );
    }
    if (config.androidSha256CertFingerprints.length === 0) {
      app.log.warn(
        "ANDROID_SHA256_CERT_FINGERPRINTS saknas — assetlinks.json är tom och Android App Links verifieras inte",
      );
    }
  }
  startWaitlistRetentionJob(app.log);
  app.log.info(
    {
      url: config.appBaseUrl,
      appliedMigrations: migrations.applied,
      stampedMigrations: migrations.stamped,
    },
    "Körpasset app listening",
  );
}

main().catch((error) => {
  logFatal(error);
  process.exit(1);
});
