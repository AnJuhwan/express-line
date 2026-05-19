import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { NormalizedTrafficObservation } from "./types";

export interface RealtimeTargetFilter {
  roads: string[];
  sectionKeywords: string[];
  linkIds: string[];
  regions: Array<"서울" | "인천">;
}

export interface RealtimeNdjsonRecord {
  collectedAt: string;
  observedAt: string;
  region: "서울" | "인천";
  roadName: string;
  sectionName: string;
  linkId: string;
  roadKind: string;
  roadDivName: string;
  speedKph: number | null;
  travelTimeSeconds: number | null;
  trafficVolume: number | null;
  occupancy: number | null;
  congestionLevel: string;
  congestionLabel: string;
  status: string;
  sourceName: string;
  granularity: string;
}

export const DEFAULT_REALTIME_TARGET_ROADS = ["올림픽대로", "강변북로"] as const;

export function parseCsvList(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  const items = String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

export function currentKstHalfHourSlot(date = new Date()): string {
  const parts = kstParts(date);
  const minute = parts.minute < 30 ? 0 : 30;
  return `${parts.date} ${String(parts.hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatKstMinute(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${String(value)}`);
  const parts = kstParts(date);
  return `${parts.date} ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function observationDisplayTime(row: NormalizedTrafficObservation): string {
  try {
    return formatKstMinute(row.observedAt);
  } catch {
    return `${row.observedDate} ${String(row.observedHour).padStart(2, "0")}:00`;
  }
}

export function monthlyNdjsonPath(baseDir: string, collectedAt: string): string {
  return join(baseDir, `realtime-traffic-${collectedAt.slice(0, 7)}.ndjson`);
}

export function matchesRealtimeTargets(row: NormalizedTrafficObservation, targets: RealtimeTargetFilter): boolean {
  if (targets.regions.length && !targets.regions.includes(row.region)) return false;
  if (targets.linkIds.includes(row.linkId)) return true;

  const roadMatched = targets.roads.length === 0 || targets.roads.some((road) => row.roadName.includes(road));
  if (!roadMatched) return false;

  if (!targets.sectionKeywords.length) return true;
  return targets.sectionKeywords.some((keyword) => row.sectionName.includes(keyword) || row.linkId.includes(keyword));
}

export function toRealtimeNdjsonRecord(
  row: NormalizedTrafficObservation,
  collectedAt: string
): RealtimeNdjsonRecord {
  return {
    collectedAt,
    observedAt: observationDisplayTime(row),
    region: row.region,
    roadName: row.roadName,
    sectionName: row.sectionName,
    linkId: row.linkId,
    roadKind: row.roadKind,
    roadDivName: row.roadDivName ?? "",
    speedKph: row.speedKph,
    travelTimeSeconds: row.travelTimeSeconds,
    trafficVolume: row.trafficVolume,
    occupancy: row.occupancy,
    congestionLevel: row.congestionLevel,
    congestionLabel: row.congestionLabel,
    status: row.congestionLabel,
    sourceName: row.sourceName,
    granularity: row.granularity
  };
}

export function realtimeRecordKey(record: RealtimeNdjsonRecord): string {
  return [record.collectedAt, record.sourceName, record.region, record.linkId, record.roadName, record.sectionName].join("\u0000");
}

export function appendRealtimeRecords(filePath: string, records: RealtimeNdjsonRecord[]): number {
  if (!records.length) return 0;
  const existingKeys = loadExistingRealtimeKeys(filePath);
  const nextRecords = records.filter((record) => !existingKeys.has(realtimeRecordKey(record)));
  if (!nextRecords.length) return 0;

  mkdirSync(dirname(filePath), { recursive: true });
  const payload = `${nextRecords.map((record) => JSON.stringify(record)).join("\n")}\n`;
  appendFileSync(filePath, payload, "utf8");
  return nextRecords.length;
}

function loadExistingRealtimeKeys(filePath: string): Set<string> {
  const keys = new Set<string>();
  if (!existsSync(filePath)) return keys;

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      keys.add(realtimeRecordKey(JSON.parse(trimmed) as RealtimeNdjsonRecord));
    } catch {
      // Keep collecting even if an old line was manually edited.
    }
  }

  return keys;
}

function kstParts(date: Date): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute"))
  };
}
