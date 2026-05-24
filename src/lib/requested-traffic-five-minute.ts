import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REQUESTED_TRAFFIC_ACTIVE_DATA_DIR } from "./requested-traffic-data-config";
import {
  REQUESTED_TRAFFIC_DAY_END_HOUR,
  REQUESTED_TRAFFIC_DAY_START_HOUR,
  REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE
} from "./requested-traffic-five-minute-shared";
import type {
  RequestedTrafficFiveMinutePage,
  RequestedTrafficFiveMinuteRouteMeta,
  RequestedTrafficFiveMinuteRow,
  RequestedTrafficTimeWindow
} from "./requested-traffic-five-minute-shared";

export { REQUESTED_TRAFFIC_DAY_END_HOUR, REQUESTED_TRAFFIC_DAY_START_HOUR, REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE };
export type {
  RequestedTrafficFiveMinutePage,
  RequestedTrafficFiveMinuteRouteMeta,
  RequestedTrafficFiveMinuteRow,
  RequestedTrafficTimeWindow
};

export const REQUESTED_TRAFFIC_DATA_DIR = REQUESTED_TRAFFIC_ACTIVE_DATA_DIR;

export interface RequestedFiveMinuteRawRow {
  날짜?: string;
  시간?: string;
  시?: number | string;
  분?: number | string;
  일시?: string;
  링크아이디?: string;
  도로명?: string;
  도로등급?: string;
  도로권역?: string;
  시점명?: string;
  종점명?: string;
  구간명?: string;
  통행속도_kmh?: number | null;
  통행시간_초?: number | null;
  혼잡상태?: string;
  막힘여부?: boolean;
}

interface RequestedFiveMinuteFile {
  "오분단위자료"?: RequestedFiveMinuteRawRow[];
}

interface PreviewInput {
  route: RequestedTrafficFiveMinuteRouteMeta;
  sourceRows: RequestedFiveMinuteRawRow[];
}

type FiveMinuteLoadOptions = {
  routeId?: string;
  offset?: number;
  windowSize?: number;
  baseDir?: string;
  startHour?: number;
  endHour?: number;
};

type FiveMinuteAllRowsOptions = {
  routeId?: string;
  baseDir?: string;
  startHour?: number;
  endHour?: number;
};

const sourceRowsCache = new Map<string, RequestedFiveMinuteRawRow[]>();
const sortedRowsCache = new Map<string, RequestedTrafficFiveMinuteRow[]>();

export function flattenRequestedFiveMinuteRows(
  route: RequestedTrafficFiveMinuteRouteMeta,
  sourceRows: RequestedFiveMinuteRawRow[]
): RequestedTrafficFiveMinuteRow[] {
  return sourceRows.map((row) => {
    const hour = rowHour(row);

    return {
      routeId: route.id,
      requestLabel: route.requestLabel,
      matchedLabel: route.matchedLabel,
      date: text(row.날짜),
      hour: hour ?? 0,
      time: text(row.시간),
      timestamp: text(row.일시),
      linkId: text(row.링크아이디),
      roadName: text(row.도로명),
      roadRank: text(row.도로등급),
      roadArea: text(row.도로권역),
      fromName: text(row.시점명),
      toName: text(row.종점명),
      sectionName: text(row.구간명),
      speedKmh: nullableNumber(row.통행속도_kmh),
      travelTimeSeconds: nullableNumber(row.통행시간_초),
      congestionLabel: text(row.혼잡상태),
      blocked: row.막힘여부 === true
    };
  });
}

export function selectRequestedFiveMinutePreview(inputs: PreviewInput[], rowsPerRoute: number): RequestedTrafficFiveMinuteRow[] {
  const safeRowsPerRoute = Math.max(0, Math.floor(rowsPerRoute));
  if (!safeRowsPerRoute) return [];
  return inputs.flatMap((input) => flattenRequestedFiveMinuteRows(input.route, input.sourceRows.slice(0, safeRowsPerRoute)));
}

export function loadRequestedFiveMinutePage(
  routes: RequestedTrafficFiveMinuteRouteMeta[],
  options: FiveMinuteLoadOptions = {}
): RequestedTrafficFiveMinutePage {
  const routeId = normalizeRouteId(options.routeId);
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const windowSize = Math.max(0, Math.floor(options.windowSize ?? REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE));
  const timeWindow = normalizeTimeWindow(options.startHour, options.endHour);
  const selectedRoutes = selectableRoutes(routes, routeId, options.baseDir);
  const allRows = sortedFiveMinuteRows(selectedRoutes, timeWindow, options.baseDir);

  return {
    routeId,
    rows: allRows.slice(offset, offset + windowSize),
    offset,
    windowSize,
    totalCount: allRows.length,
    dataAvailable: selectedRoutes.length > 0,
    timeWindow
  };
}

export function loadRequestedFiveMinuteRows(
  routes: RequestedTrafficFiveMinuteRouteMeta[],
  options: FiveMinuteAllRowsOptions = {}
): RequestedTrafficFiveMinuteRow[] {
  const selectedRoutes = selectableRoutes(routes, normalizeRouteId(options.routeId), options.baseDir);
  const timeWindow = normalizeTimeWindow(options.startHour, options.endHour);
  return sortedFiveMinuteRows(selectedRoutes, timeWindow, options.baseDir).slice();
}

export function requestedFiveMinuteRowsToCsv(rows: RequestedTrafficFiveMinuteRow[]): string {
  const headers = [
    "요청구간",
    "실제매칭구간",
    "날짜",
    "시간",
    "일시",
    "링크아이디",
    "도로명",
    "도로등급",
    "도로권역",
    "시점명",
    "종점명",
    "구간명",
    "통행속도(km/h)",
    "통행시간(초)",
    "혼잡상태"
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.requestLabel,
        row.matchedLabel,
        row.date,
        row.time,
        row.timestamp,
        row.linkId,
        row.roadName,
        row.roadRank,
        row.roadArea,
        row.fromName,
        row.toName,
        row.sectionName,
        row.speedKmh ?? "",
        row.travelTimeSeconds ?? "",
        row.congestionLabel
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\n");
}

function normalizeRouteId(routeId: string | null | undefined): string {
  return routeId && routeId !== "all" ? routeId : "all";
}

function selectableRoutes(routes: RequestedTrafficFiveMinuteRouteMeta[], routeId: string, baseDir = REQUESTED_TRAFFIC_DATA_DIR) {
  const selected = routeId === "all" ? routes : routes.filter((route) => route.id === routeId);
  return selected.filter((route) => requestedFiveMinuteFileExists(route.id, baseDir));
}

function readRequestedFiveMinuteSourceRows(routeId: string, baseDir = REQUESTED_TRAFFIC_DATA_DIR): RequestedFiveMinuteRawRow[] {
  assertSafeRouteId(routeId);
  const cacheKey = `${baseDir}:${routeId}`;
  const cached = sourceRowsCache.get(cacheKey);
  if (cached) return cached;

  const filePath = join(baseDir, `${routeId}.json`);
  if (!existsSync(filePath)) return [];

  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as RequestedFiveMinuteFile;
  const rows = Array.isArray(parsed["오분단위자료"]) ? parsed["오분단위자료"] : [];
  sourceRowsCache.set(cacheKey, rows);
  return rows;
}

function requestedFiveMinuteFileExists(routeId: string, baseDir: string): boolean {
  assertSafeRouteId(routeId);
  return existsSync(join(baseDir, `${routeId}.json`));
}

function sortedFiveMinuteRows(
  routes: RequestedTrafficFiveMinuteRouteMeta[],
  timeWindow: RequestedTrafficTimeWindow,
  baseDir = REQUESTED_TRAFFIC_DATA_DIR
): RequestedTrafficFiveMinuteRow[] {
  const cacheKey = `${baseDir}:${routes.map((route) => route.id).join(",")}:${timeWindow.startHour}-${timeWindow.endHour}`;
  const cached = sortedRowsCache.get(cacheKey);
  if (cached) return cached;

  const routeOrder = new Map(routes.map((route, index) => [route.id, index]));
  const rows = routes
    .flatMap((route) =>
      flattenRequestedFiveMinuteRows(route, filterSourceRowsByHour(readRequestedFiveMinuteSourceRows(route.id, baseDir), timeWindow))
    )
    .sort((first, second) => compareFiveMinuteRows(first, second, routeOrder));
  sortedRowsCache.set(cacheKey, rows);
  return rows;
}

function compareFiveMinuteRows(
  first: RequestedTrafficFiveMinuteRow,
  second: RequestedTrafficFiveMinuteRow,
  routeOrder: Map<string, number>
): number {
  return (
    first.hour - second.hour ||
    first.date.localeCompare(second.date) ||
    first.time.localeCompare(second.time) ||
    (routeOrder.get(first.routeId) ?? 0) - (routeOrder.get(second.routeId) ?? 0) ||
    first.linkId.localeCompare(second.linkId) ||
    first.sectionName.localeCompare(second.sectionName)
  );
}

function assertSafeRouteId(routeId: string) {
  if (!/^[a-z0-9_]+$/.test(routeId)) {
    throw new Error(`Invalid requested traffic route id: ${routeId}`);
  }
}

function nullableNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeTimeWindow(startHour?: number, endHour?: number): RequestedTrafficTimeWindow {
  const start = normalizeHour(startHour, REQUESTED_TRAFFIC_DAY_START_HOUR);
  const end = normalizeHour(endHour, REQUESTED_TRAFFIC_DAY_END_HOUR);
  return start <= end ? { startHour: start, endHour: end } : { startHour: end, endHour: start };
}

function normalizeHour(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(23, Math.max(0, Math.floor(value))) : fallback;
}

function filterSourceRowsByHour(
  rows: RequestedFiveMinuteRawRow[],
  timeWindow: RequestedTrafficTimeWindow
): RequestedFiveMinuteRawRow[] {
  return rows.filter((row) => {
    const hour = rowHour(row);
    return hour != null && hour >= timeWindow.startHour && hour <= timeWindow.endHour;
  });
}

function rowHour(row: RequestedFiveMinuteRawRow): number | null {
  const explicit = Number(row.시);
  if (Number.isInteger(explicit)) return explicit;
  const match = /^(\d{1,2}):/.exec(text(row.시간));
  return match ? Number(match[1]) : null;
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
