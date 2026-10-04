import {
  sendWeeklySummaryEmails,
  type WeeklyMailLogger,
} from "../services/weekly-summary-mail.js";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

/**
 * Check the Sunday weekly summary on boot and every 15 minutes.
 * Outside Sunday 18:00–24:00 Europe/Stockholm the run does nothing.
 * The send itself is idempotent. The interval is unref'd.
 */
export function startWeeklySummaryJob(
  log: WeeklyMailLogger,
  intervalMs = FIFTEEN_MINUTES_MS,
): { stop: () => void } {
  const run = async () => {
    try {
      const summary = await sendWeeklySummaryEmails({ log });
      if (summary.skippedWindow || summary.skippedLock) return;
      const sent = summary.decisions.filter((decision) => decision.action === "sent").length;
      const failed = summary.decisions.filter((decision) => decision.action === "failed").length;
      const skipped = summary.decisions.filter((decision) => decision.action === "skipped").length;
      log.info(
        { weekKey: summary.weekKey, sent, failed, skipped },
        "weekly summary job finished",
      );
    } catch (error) {
      log.error({ err: error }, "weekly summary job failed");
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
