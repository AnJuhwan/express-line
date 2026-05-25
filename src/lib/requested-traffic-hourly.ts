import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REQUESTED_TRAFFIC_ACTIVE_DATA_DIR } from "./requested-traffic-data-config";
import {
  REQUESTED_TRAFFIC_DAY_END_HOUR,
  REQUESTED_TRAFFIC_DAY_START_HOUR
} from "./requested-traffic-five-minute-shared";
import type {
  RequestedTrafficFiveMinuteRouteMeta,
  RequestedTrafficHourlyPage,
  RequestedTrafficHourlyRow,
  RequestedTrafficTimeWindow
} from "./requested-traffic-five-minute-shared";

export type {
  RequestedTrafficFiveMinuteRouteMeta,
  RequestedTrafficHourlyPage,
  RequestedTrafficHourlyRow,
  RequestedTrafficTimeWindow
};

export const REQUESTED_TRAFFIC_HOURLY_DATA_DIR = REQUESTED_TRAFFIC_ACTIVE_DATA_DIR;

interface RequestedHourlyRawRow {
  날짜?: string;
  시?: number | string;
  시간대?: string;
  평균속도_kmh?: number | null;
  최저속도_kmh?: number | null;
  시간대혼잡상태?: string;
  막힘여부?: boolean;
  자료수?: number | null;
  관측링크수?: number | null;
  원활관측수?: number | null;
  서행관측수?: number | null;
  정체관측수?: number | null;
  서행구간수?: number | null;
  정체구간수?: number | null;
}

interface RequestedHourlyFile {
  "시간별요약"?: RequestedHourlyRawRow[];
}

type RequestedHourlyOptions = {
  routeId?: string;
  baseDir?: string;
  startHour?: number;
  endHour?: number;
};

const hourlyRowsCache = new Map<string, RequestedHourlyRawRow[]>();
const sortedRowsCache = new Map<string, RequestedTrafficHourlyRow[]>();

export function loadRequestedHourlyRows(
  routes: RequestedTrafficFiveMinuteRouteMeta[],
  options: RequestedHourlyOptions = {}
): RequestedTrafficHourlyRow[] {
  const routeId = normalizeRouteId(options.routeId);
  const timeWindow = normalizeTimeWindow(options.startHour, options.endHour);
  const selectedRoutes = selectableRoutes(routes, routeId, options.baseDir);

  return sortedHourlyRows(selectedRoutes, timeWindow, options.baseDir).slice();
}

export function loadRequestedHourlyPage(
  routes: RequestedTrafficFiveMinuteRouteMeta[],
  options: RequestedHourlyOptions = {}
): RequestedTrafficHourlyPage {
  const routeId = normalizeRouteId(options.routeId);
  const timeWindow = normalizeTimeWindow(options.startHour, options.endHour);
  const selectedRoutes = selectableRoutes(routes, routeId, options.baseDir);
  const rows = sortedHourlyRows(selectedRoutes, timeWindow, options.baseDir).slice();

  return {
    routeId,
    rows,
    totalCount: rows.length,
    dataAvailable: selectedRoutes.length > 0,
    timeWindow
  };
}

export function requestedHourlyRowsToCsv(rows: RequestedTrafficHourlyRow[]): string {
  const headers = [
    "요청구간",
    "실제매칭구간",
    "날짜",
    "시간대",
    "최저속도(km/h)",
    "혼잡상태",
    "자료수",
    "관측링크수",
    "원활관측수",
    "서행관측수",
    "정체관측수",
    "서행구간수",
    "정체구간수"
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.requestLabel,
        row.matchedLabel,
        row.date,
        row.label,
        row.minSpeedKmh ?? "",
        row.status,
        row.sampleCount,
        row.observedLinkCount,
        row.smoothObservationCount,
        row.slowObservationCount,
        row.congestedObservationCount,
        row.slowLinkCount,
        row.congestedLinkCount
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\n");
}

function flattenRequestedHourlyRows(
  route: RequestedTrafficFiveMinuteRouteMeta,
  sourceRows: RequestedHourlyRawRow[]
): RequestedTrafficHourlyRow[] {
  return sourceRows.map((row) => {
    const hour = rowHour(row);
    const sampleCount = integer(row.자료수);
    const slowObservationCount = integer(row.서행관측수);
    const congestedObservationCount = integer(row.정체관측수);
    const explicitSmoothObservationCount = nullableInteger(row.원활관측수);

    return {
      routeId: route.id,
      requestLabel: route.requestLabel,
      matchedLabel: route.matchedLabel,
      date: text(row.날짜),
      hour: hour ?? 0,
      label: text(row.시간대) || `${String(hour ?? 0).padStart(2, "0")}:00`,
      avgSpeedKmh: nullableNumber(row.평균속도_kmh),
      minSpeedKmh: nullableNumber(row.최저속도_kmh),
      status: text(row.시간대혼잡상태),
      blocked: row.막힘여부 === true,
      sampleCount,
      observedLinkCount: integer(row.관측링크수),
      smoothObservationCount: explicitSmoothObservationCount ?? Math.max(0, sampleCount - slowObservationCount - congestedObservationCount),
      slowObservationCount,
      congestedObservationCount,
      slowLinkCount: integer(row.서행구간수),
      congestedLinkCount: integer(row.정체구간수)
    };
  });
}

function normalizeRouteId(routeId: string | null | undefined): string {
  return routeId && routeId !== "all" ? routeId : "all";
}

function selectableRoutes(routes: RequestedTrafficFiveMinuteRouteMeta[], routeId: string, baseDir = REQUESTED_TRAFFIC_HOURLY_DATA_DIR) {
  const selected = routeId === "all" ? routes : routes.filter((route) => route.id === routeId);
  return selected.filter((route) => requestedHourlyFileExists(route.id, baseDir));
}

function readRequestedHourlySourceRows(routeId: string, baseDir = REQUESTED_TRAFFIC_HOURLY_DATA_DIR): RequestedHourlyRawRow[] {
  assertSafeRouteId(routeId);
  const cacheKey = `${baseDir}:${routeId}`;
  const cached = hourlyRowsCache.get(cacheKey);
  if (cached) return cached;

  const filePath = join(baseDir, `${routeId}.json`);
  if (!existsSync(filePath)) return [];

  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as RequestedHourlyFile;
  const rows = Array.isArray(parsed["시간별요약"]) ? parsed["시간별요약"] : [];
  hourlyRowsCache.set(cacheKey, rows);
  return rows;
}

function requestedHourlyFileExists(routeId: string, baseDir: string): boolean {
  assertSafeRouteId(routeId);
  return existsSync(join(baseDir, `${routeId}.json`));
}

function sortedHourlyRows(
  routes: RequestedTrafficFiveMinuteRouteMeta[],
  timeWindow: RequestedTrafficTimeWindow,
  baseDir = REQUESTED_TRAFFIC_HOURLY_DATA_DIR
): RequestedTrafficHourlyRow[] {
  const cacheKey = `${baseDir}:${routes.map((route) => route.id).join(",")}:${timeWindow.startHour}-${timeWindow.endHour}`;
  const cached = sortedRowsCache.get(cacheKey);
  if (cached) return cached;

  const routeOrder = new Map(routes.map((route, index) => [route.id, index]));
  const rows = routes
    .flatMap((route) =>
      flattenRequestedHourlyRows(route, filterHourlyRowsByHour(readRequestedHourlySourceRows(route.id, baseDir), timeWindow))
    )
    .sort((first, second) => compareHourlyRows(first, second, routeOrder));
  sortedRowsCache.set(cacheKey, rows);
  return rows;
}

function compareHourlyRows(
  first: RequestedTrafficHourlyRow,
  second: RequestedTrafficHourlyRow,
  routeOrder: Map<string, number>
): number {
  return (
    first.hour - second.hour ||
    first.date.localeCompare(second.date) ||
    (routeOrder.get(first.routeId) ?? 0) - (routeOrder.get(second.routeId) ?? 0) ||
    first.requestLabel.localeCompare(second.requestLabel)
  );
}

function assertSafeRouteId(routeId: string) {
  if (!/^[a-z0-9_]+$/.test(routeId)) {
    throw new Error(`Invalid requested traffic route id: ${routeId}`);
  }
}

function normalizeTimeWindow(startHour?: number, endHour?: number): RequestedTrafficTimeWindow {
  const start = normalizeHour(startHour, REQUESTED_TRAFFIC_DAY_START_HOUR);
  const end = normalizeHour(endHour, REQUESTED_TRAFFIC_DAY_END_HOUR);
  return start <= end ? { startHour: start, endHour: end } : { startHour: end, endHour: start };
}

function normalizeHour(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(23, Math.max(0, Math.floor(value))) : fallback;
}

function filterHourlyRowsByHour(rows: RequestedHourlyRawRow[], timeWindow: RequestedTrafficTimeWindow): RequestedHourlyRawRow[] {
  return rows.filter((row) => {
    const hour = rowHour(row);
    return hour != null && hour >= timeWindow.startHour && hour <= timeWindow.endHour;
  });
}

function rowHour(row: RequestedHourlyRawRow): number | null {
  const explicit = Number(row.시);
  if (Number.isInteger(explicit)) return explicit;
  const match = /^(\d{1,2}):/.exec(text(row.시간대));
  return match ? Number(match[1]) : null;
}

function nullableNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integer(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 0;
}

function nullableInteger(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : null;
}

function text(value: string | number | null | undefined): string {
  return value == null ? "" : String(value);
}

function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
}
