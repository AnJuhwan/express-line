import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE } from "./requested-traffic-five-minute-shared";
import type {
  RequestedTrafficFiveMinutePage,
  RequestedTrafficFiveMinuteRouteMeta,
  RequestedTrafficFiveMinuteRow
} from "./requested-traffic-five-minute-shared";

export { REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE };
export type {
  RequestedTrafficFiveMinutePage,
  RequestedTrafficFiveMinuteRouteMeta,
  RequestedTrafficFiveMinuteRow
};

export const REQUESTED_TRAFFIC_DATA_DIR = join(process.cwd(), "data", "csv");

export interface RequestedFiveMinuteRawRow {
  날짜?: string;
  시간?: string;
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

const sourceRowsCache = new Map<string, RequestedFiveMinuteRawRow[]>();

export function flattenRequestedFiveMinuteRows(
  route: RequestedTrafficFiveMinuteRouteMeta,
  sourceRows: RequestedFiveMinuteRawRow[]
): RequestedTrafficFiveMinuteRow[] {
  return sourceRows.map((row) => ({
    routeId: route.id,
    requestLabel: route.requestLabel,
    matchedLabel: route.matchedLabel,
    date: text(row.날짜),
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
  }));
}

export function selectRequestedFiveMinutePreview(inputs: PreviewInput[], rowsPerRoute: number): RequestedTrafficFiveMinuteRow[] {
  const safeRowsPerRoute = Math.max(0, Math.floor(rowsPerRoute));
  if (!safeRowsPerRoute) return [];
  return inputs.flatMap((input) => flattenRequestedFiveMinuteRows(input.route, input.sourceRows.slice(0, safeRowsPerRoute)));
}

export function loadRequestedFiveMinutePage(
  routes: RequestedTrafficFiveMinuteRouteMeta[],
  options: {
    routeId?: string;
    offset?: number;
    windowSize?: number;
    baseDir?: string;
  } = {}
): RequestedTrafficFiveMinutePage {
  const routeId = normalizeRouteId(options.routeId);
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const windowSize = Math.max(0, Math.floor(options.windowSize ?? REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE));
  const selectedRoutes = selectableRoutes(routes, routeId, options.baseDir);
  const totalCount = selectedRoutes.reduce((sum, route) => sum + routeCount(route, options.baseDir), 0);
  const rows: RequestedTrafficFiveMinuteRow[] = [];

  let skipped = offset;
  let remaining = windowSize;
  for (const route of selectedRoutes) {
    if (remaining <= 0) break;
    const count = routeCount(route, options.baseDir);
    if (skipped >= count) {
      skipped -= count;
      continue;
    }

    const sourceRows = readRequestedFiveMinuteSourceRows(route.id, options.baseDir);
    const slice = sourceRows.slice(skipped, skipped + remaining);
    rows.push(...flattenRequestedFiveMinuteRows(route, slice));
    remaining -= slice.length;
    skipped = 0;
  }

  return {
    routeId,
    rows,
    offset,
    windowSize,
    totalCount,
    dataAvailable: selectedRoutes.length > 0
  };
}

export function loadRequestedFiveMinuteRows(
  routes: RequestedTrafficFiveMinuteRouteMeta[],
  options: { routeId?: string; baseDir?: string } = {}
): RequestedTrafficFiveMinuteRow[] {
  const selectedRoutes = selectableRoutes(routes, normalizeRouteId(options.routeId), options.baseDir);
  return selectedRoutes.flatMap((route) => flattenRequestedFiveMinuteRows(route, readRequestedFiveMinuteSourceRows(route.id, options.baseDir)));
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
    "혼잡상태",
    "막힘여부"
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
        row.congestionLabel,
        String(row.blocked)
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

function routeCount(route: RequestedTrafficFiveMinuteRouteMeta, baseDir = REQUESTED_TRAFFIC_DATA_DIR): number {
  return route.fiveMinuteRows ?? readRequestedFiveMinuteSourceRows(route.id, baseDir).length;
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

function assertSafeRouteId(routeId: string) {
  if (!/^[a-z0-9_]+$/.test(routeId)) {
    throw new Error(`Invalid requested traffic route id: ${routeId}`);
  }
}

function nullableNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
