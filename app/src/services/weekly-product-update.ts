/**
 * Optional product note for one Sunday mail.
 * A note is shown only when it is active and its weekKey is the mail's week.
 * It is not reused the following week, and it does not affect the statistics.
 */
export interface WeeklyProductUpdate {
  active: boolean;
  weekKey: string;
  title: string;
  body: string;
  link?: string;
  linkLabel?: string;
}

export const WEEKLY_PRODUCT_UPDATES: readonly WeeklyProductUpdate[] = [
  {
    active: true,
    weekKey: "2026-W40",
    title: "Nytt i Körpasset",
    body: "Veckosammanfattningen är ny. Den samlar dina körpass, din körtid och din progression, så att det blir enklare att hålla ihop körkortsresan utifrån hur ni faktiskt övningskör.",
  },
];

export function weeklyProductUpdateForWeek(weekKey: string): {
  title: string;
  body: string;
  link?: string;
  linkLabel?: string;
} | null {
  const match = WEEKLY_PRODUCT_UPDATES.find((item) => item.active && item.weekKey === weekKey);
  if (!match) return null;
  if (match.link && match.linkLabel) {
    return {
      title: match.title,
      body: match.body,
      link: match.link,
      linkLabel: match.linkLabel,
    };
  }
  return { title: match.title, body: match.body };
}
