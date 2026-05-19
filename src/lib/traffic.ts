import type { CongestionMethod, CongestionResult, RoadKind } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function classifyCongestion(
  speedKph: number | null | undefined,
  roadKind: RoadKind,
  method: "topis" | "derived" = "topis"
): CongestionResult {
  if (speedKph == null || Number.isNaN(speedKph)) {
    return {
      level: "unknown",
      label: "정보없음",
      method: methodName(method)
    };
  }

  const isFastRoad = roadKind === "urban_expressway" || roadKind === "expressway";
  const smoothThreshold = isFastRoad ? 50 : 25;
  const slowThreshold = isFastRoad ? 30 : 15;

  if (speedKph >= smoothThreshold) {
    return { level: "smooth", label: "원활", method: methodName(method) };
  }

  if (speedKph >= slowThreshold) {
    return { level: "slow", label: "서행", method: methodName(method) };
  }

  return { level: "congested", label: "정체", method: methodName(method) };
}

export function parseDateRange(startDate: string, endDate: string): string[] {
  assertDate(startDate, "startDate");
  assertDate(endDate, "endDate");

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  if (start > end) {
    throw new Error("startDate must be before or equal to endDate");
  }

  const dates: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

export function toCompactDate(date: string): string {
  assertDate(date, "date");
  return date.replaceAll("-", "");
}

export function fromCompactDate(date: string): string {
  const digits = date.replace(/\D/g, "");
  if (digits.length !== 8) {
    throw new Error(`Invalid compact date: ${date}`);
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export function normalizeTimeOfDay(raw: string | number | null | undefined): {
  hour: number;
  minute: number;
  hhmm: string;
} {
  const digits = String(raw ?? "0000").replace(/\D/g, "").padStart(4, "0");
  const hhmm = digits.slice(-4);
  const hour = Number(hhmm.slice(0, 2));
  const minute = Number(hhmm.slice(2, 4));

  if (hour > 23 || minute > 59) {
    throw new Error(`Invalid time: ${raw}`);
  }

  return { hour, minute, hhmm };
}

export function kstTimestamp(date: string, hour: number, minute = 0): string {
  assertDate(date, "date");
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`;
}

export function defaultDateRange(): { startDate: string; endDate: string } {
  const endDate = todayInKorea();
  return {
    startDate: `${endDate.slice(0, 4)}-01-01`,
    endDate
  };
}

function methodName(method: "topis" | "derived"): CongestionMethod {
  return method === "derived" ? "threshold-derived" : "topis-threshold";
}

function assertDate(value: string, name: string) {
  if (!DATE_RE.test(value)) {
    throw new Error(`${name} must be YYYY-MM-DD`);
  }
}

function todayInKorea(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Unable to format current date");
  }
  return `${year}-${month}-${day}`;
}
