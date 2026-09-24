import { purgeExpiredWaitlistSignups } from "../services/waitlist-retention.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionLogger {
  info: (obj: unknown, msg: string) => void;
  error: (obj: unknown, msg: string) => void;
}

/**
 * Purge expired waitlist rows on boot and once per day.
 * Interval is unref'd so it does not keep the process alive.
 */
export function startWaitlistRetentionJob(
  log: RetentionLogger,
  intervalMs = DAY_MS,
): { stop: () => void } {
  const run = async () => {
    try {
      const summary = await purgeExpiredWaitlistSignups();
      if (summary.skipped) {
        log.info(summary, "waitlist retention skipped, another process holds the lock");
        return;
      }
      log.info(
        { deletedCount: summary.deletedCount },
        "waitlist retention finished",
      );
    } catch (error) {
      log.error({ err: error }, "waitlist retention failed");
    }
  };

  void run();
  const timer = setInterval(() => {
    void run();
  }, intervalMs);
  timer.unref();

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
