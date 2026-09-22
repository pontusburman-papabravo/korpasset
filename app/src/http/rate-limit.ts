const buckets = new Map<string, number[]>();

export function allowRequest(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  const recent = (buckets.get(key) ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
}

export const INTEREST_RATE_LIMIT = { limit: 8, windowMs: 10 * 60 * 1000 };
export const ADMIN_LOGIN_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };
export const ADMIN_RESET_RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };
export const OAUTH_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };
export const APPLE_NOTIFICATION_RATE_LIMIT = { limit: 60, windowMs: 15 * 60 * 1000 };
