// Period comparisons for the admin dashboard, from the 14-day daily series (oldest first, today last).

export type Daily = { day: string; total: number | string }[];

const sum = (xs: Daily) => xs.reduce((n, d) => n + Number(d.total), 0);

export function compareWindows(daily: Daily) {
  const d = daily ?? [];
  return {
    today: d.length ? Number(d[d.length - 1].total) : 0,
    yesterday: d.length > 1 ? Number(d[d.length - 2].total) : 0,
    last7: sum(d.slice(-7)),
    prev7: sum(d.slice(-14, -7)),
  };
}

/** Whole-percent change, or null when there is nothing to compare with (previous period was 0). */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}
