import { sendStuckHelpEmails, type HelpEmailLogger } from "../services/help-email.js";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Check early-onboarding help emails on boot and once an hour.
 * The run is idempotent. The interval is unref'd so it does not keep the process alive.
 */
export function startHelpEmailJob(
  log: HelpEmailLogger,
  intervalMs = HOUR_MS,
): { stop: () => void } {
  const run = async () => {
    try {
      const summary = await sendStuckHelpEmails({ log });
      if (summary.skippedLock) {
        log.info(summary, "help email job skipped, another process holds the lock");
        return;
      }
      const sent = summary.decisions.filter((decision) => decision.action === "sent").length;
      log.info({ sent, checked: summary.decisions.length }, "help email job finished");
    } catch (error) {
      log.error({ err: error }, "help email job failed");
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
