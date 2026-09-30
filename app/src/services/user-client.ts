import { getPool } from "../db/pool.js";

const PLATFORMS = new Set(["ios", "android"]);
const TOKEN = /^[0-9A-Za-z._()+-]{1,32}$/;

export interface UserClientReport {
  platform: "ios" | "android" | null;
  appVersion: string | null;
  appBuild: string | null;
}

export function parseUserClientReport(input: {
  platform?: unknown;
  version?: unknown;
  build?: unknown;
}): UserClientReport {
  const platformRaw = typeof input.platform === "string" ? input.platform.trim().toLowerCase() : "";
  const versionRaw = typeof input.version === "string" ? input.version.trim() : "";
  const buildRaw = typeof input.build === "string" ? input.build.trim() : "";
  return {
    platform: PLATFORMS.has(platformRaw) ? (platformRaw as "ios" | "android") : null,
    appVersion: TOKEN.test(versionRaw) ? versionRaw : null,
    appBuild: TOKEN.test(buildRaw) ? buildRaw : null,
  };
}

/** Bumps last_seen_at. Platform and build are kept when this report has none. */
export async function recordUserClient(userId: string, report: UserClientReport): Promise<void> {
  await getPool().query(
    `UPDATE users
     SET last_seen_at = now(),
         client_platform = COALESCE($2, client_platform),
         client_app_version = COALESCE($3, client_app_version),
         client_app_build = COALESCE($4, client_app_build),
         updated_at = now()
     WHERE id = $1 AND account_state <> 'deleted'`,
    [userId, report.platform, report.appVersion, report.appBuild],
  );
}
