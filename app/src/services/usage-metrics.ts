/**
 * Central definitions for admin usage status and “fastnat”-signaler.
 * The Statistik table, CSV and dashboard counts all call these functions.
 * Calendar windows are Stockholm midnights supplied by the caller.
 */

export const JOURNEY_USAGE_STATUSES = [
  "new",
  "not_started",
  "one_drive",
  "active",
  "stuck",
  "inactive",
] as const;

export type JourneyUsageStatus = (typeof JOURNEY_USAGE_STATUSES)[number];

export const USAGE_STATUS_LABELS: Record<JourneyUsageStatus, string> = {
  new: "Ny",
  not_started: "Ej startat",
  one_drive: "Ett pass",
  active: "Aktiv",
  stuck: "Fastnat",
  inactive: "Inaktiv",
};

export const STUCK_SIGNALS = [
  "no_journey",
  "no_supervisor",
  "supervisor_no_drive",
  "exactly_one_drive",
  "no_drive_7d",
  "no_drive_14d",
  "no_drive_30d",
  "drives_without_training",
  "drives_without_checkoffs",
  "driving_without_progression",
] as const;

export type StuckSignal = (typeof STUCK_SIGNALS)[number];

export const STUCK_SIGNAL_LABELS: Record<StuckSignal, string> = {
  no_journey: "Konto utan resa",
  no_supervisor: "Resa utan handledare",
  supervisor_no_drive: "Resa med handledare men inget körpass",
  exactly_one_drive: "Exakt ett körpass men inget andra pass",
  no_drive_7d: "Inget körpass senaste 7 dagarna",
  no_drive_14d: "Inget körpass senaste 14 dagarna",
  no_drive_30d: "Inget körpass senaste 30 dagarna",
  drives_without_training: "Flera körpass men inga moment registrerade",
  drives_without_checkoffs: "Flera körpass men inga avbockningar",
  driving_without_progression: "Aktiv körning men ingen progression senaste 30 dagarna",
};

export interface UsageWindows {
  start7: Date;
  start14: Date;
  start30: Date;
}

export interface UsageSnapshot {
  hasJourney: boolean;
  createdAt: Date;
  activeSupervisors: number;
  completedDrives: number;
  lastCompletedAt: Date | null;
  trainedObservations: number;
  checkoffSteps: number;
  progressionPercent: number;
  progressionIncreased30d: boolean;
}

export const DRIVE_COUNT_BUCKETS = ["0", "1", "2", "3-4", "5-9", "10-19", "20+"] as const;
export type DriveCountBucket = (typeof DRIVE_COUNT_BUCKETS)[number];

export const PROGRESS_BUCKETS = ["0", "1-24", "25-49", "50-74", "75-99", "100"] as const;
export type ProgressBucket = (typeof PROGRESS_BUCKETS)[number];

function inWindow(at: Date | null, start: Date): boolean {
  return at !== null && at.getTime() >= start.getTime();
}

/**
 * One status per row. First match wins.
 * “Ny” is the first 7 Stockholm days without a completed drive.
 * Inactivity (no completed drive in 30 days) wins over other stuck causes.
 * Those causes still show up as separate signals.
 */
export function journeyUsageStatus(
  input: UsageSnapshot,
  windows: UsageWindows,
): JourneyUsageStatus {
  const recentAccount = inWindow(input.createdAt, windows.start7);
  if (!input.hasJourney) return recentAccount ? "new" : "not_started";
  if (input.completedDrives <= 0) return recentAccount ? "new" : "not_started";
  if (!inWindow(input.lastCompletedAt, windows.start30)) return "inactive";
  if (input.completedDrives === 1) {
    return inWindow(input.lastCompletedAt, windows.start14) ? "one_drive" : "stuck";
  }
  if (input.trainedObservations <= 0) return "stuck";
  if (!input.progressionIncreased30d && input.progressionPercent < 100) return "stuck";
  if (!inWindow(input.lastCompletedAt, windows.start14)) return "stuck";
  return "active";
}

/**
 * A journey may match several signals. Callers must not add the counts together.
 * Recency signals apply only after at least one completed drive, so a resa that
 * never started is not also “inget körpass senaste 30 dagarna”.
 */
export function stuckSignals(input: UsageSnapshot, windows: UsageWindows): StuckSignal[] {
  if (!input.hasJourney) return ["no_journey"];
  const signals: StuckSignal[] = [];
  if (input.activeSupervisors < 1) signals.push("no_supervisor");
  if (input.activeSupervisors >= 1 && input.completedDrives === 0) {
    signals.push("supervisor_no_drive");
  }
  if (input.completedDrives === 1) signals.push("exactly_one_drive");
  const drove = input.completedDrives >= 1;
  if (drove && !inWindow(input.lastCompletedAt, windows.start7)) signals.push("no_drive_7d");
  if (drove && !inWindow(input.lastCompletedAt, windows.start14)) signals.push("no_drive_14d");
  if (drove && !inWindow(input.lastCompletedAt, windows.start30)) signals.push("no_drive_30d");
  if (input.completedDrives >= 2 && input.trainedObservations === 0) {
    signals.push("drives_without_training");
  }
  if (input.completedDrives >= 2 && input.checkoffSteps === 0) {
    signals.push("drives_without_checkoffs");
  }
  if (
    drove &&
    inWindow(input.lastCompletedAt, windows.start30) &&
    !input.progressionIncreased30d &&
    input.progressionPercent < 100
  ) {
    signals.push("driving_without_progression");
  }
  return signals;
}

export function driveCountBucket(completedDrives: number): DriveCountBucket {
  if (completedDrives <= 0) return "0";
  if (completedDrives === 1) return "1";
  if (completedDrives === 2) return "2";
  if (completedDrives <= 4) return "3-4";
  if (completedDrives <= 9) return "5-9";
  if (completedDrives <= 19) return "10-19";
  return "20+";
}

export function progressBucket(percent: number): ProgressBucket {
  if (percent <= 0) return "0";
  if (percent < 25) return "1-24";
  if (percent < 50) return "25-49";
  if (percent < 75) return "50-74";
  if (percent < 100) return "75-99";
  return "100";
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const left = sorted[mid - 1] ?? 0;
  const right = sorted[mid] ?? 0;
  return (left + right) / 2;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  if (seconds <= 0) return "0 min";
  const total = Math.round(seconds / 60);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours <= 0) return `${mins} min`;
  if (mins === 0) return `${hours} tim`;
  return `${hours} tim ${mins} min`;
}

export function formatLag(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  if (seconds < 0) return "—";
  if (seconds < 48 * 3600) return formatDuration(seconds);
  const days = seconds / 86400;
  return `${days.toFixed(1).replace(".", ",")} dygn`;
}

export function formatCount(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Number(value.toFixed(digits));
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(digits).replace(".", ",");
}

export function formatKm(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return "—";
  const km = meters / 1000;
  return `${km.toFixed(km >= 10 ? 0 : 1).replace(".", ",")} km`;
}

export function formatShare(part: number, whole: number): string {
  if (whole <= 0) return `${part} / 0`;
  const pct = Math.round((part / whole) * 100);
  return `${part} / ${whole} (${pct} %)`;
}
