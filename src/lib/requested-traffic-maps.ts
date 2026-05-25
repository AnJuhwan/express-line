import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REQUESTED_TRAFFIC_ACTIVE_DATA_DIR } from "./requested-traffic-data-config";
import {
  REQUESTED_TRAFFIC_DAY_END_HOUR,
  REQUESTED_TRAFFIC_DAY_START_HOUR
} from "./requested-traffic-five-minute-shared";
import type {
  RequestedTrafficFiveMinuteRouteMeta,
  RequestedTrafficTimeWindow
} from "./requested-traffic-five-minute-shared";

export type RequestedTrafficMapStatus = "원활" | "서행" | "정체" | "정보없음";

export interface RequestedTrafficMapGroupDefinition {
  id: string;
  title: string;
  displayLabel: string;
  actualLabel: string;
  routeIds: string[];
  routeOverrides?: Record<string, RequestedTrafficMapRouteOverride>;
}

export interface RequestedTrafficMapRouteOverride {
  requestLabel?: string;
  matchedLabel?: string;
  mapRouteId?: string;
}

export interface RequestedTrafficMapGroup {
  id: string;
  title: string;
  displayLabel: string;
  actualLabel: string;
  directions: RequestedTrafficMapDirection[];
  hours: RequestedTrafficMapHour[];
}

export interface RequestedTrafficMapDirection {
  routeId: string;
  mapRouteId: string;
  requestLabel: string;
  matchedLabel: string;
  linkCount: number;
}

export interface RequestedTrafficMapHour {
  hour: number;
  label: string;
  directions: RequestedTrafficMapDirectionHour[];
}

export interface RequestedTrafficMapDirectionHour extends RequestedTrafficMapDirection {
  hour: number;
  label: string;
  date: string;
  status: RequestedTrafficMapStatus;
  minSpeedKmh: number | null;
  slowSegmentCount: number;
  congestedSegmentCount: number;
  blockedSegmentCount: number;
  observationCount: number;
  blockedSections: RequestedTrafficMapBlockedSection[];
  segments: RequestedTrafficMapSegment[];
}

export interface RequestedTrafficMapBlockedSection {
  linkId: string;
  sectionName: string;
  roadName: string;
  status: RequestedTrafficMapStatus;
  minSpeedKmh: number | null;
}

export interface RequestedTrafficMapSegment extends RequestedTrafficMapBlockedSection {
  order: number;
  fromName: string;
  toName: string;
  lengthMeters: number;
  observationCount: number;
  slowObservationCount: number;
  congestedObservationCount: number;
}

interface RequestedTrafficMapLoadOptions {
  baseDir?: string;
  startHour?: number;
  endHour?: number;
  groupDefinitions?: RequestedTrafficMapGroupDefinition[];
}

interface RequestedTrafficMapRawFile {
  "구간목록"?: RequestedTrafficMapRawLink[];
  "오분단위자료"?: RequestedTrafficMapRawObservation[];
}

interface RequestedTrafficMapRawLink {
  "순번"?: number | string;
  "링크아이디"?: string | number;
  "도로명"?: string;
  "시점명"?: string;
  "종점명"?: string;
  "구간명"?: string;
  "연장_m"?: number | string | null;
}

interface RequestedTrafficMapRawObservation {
  "날짜"?: string;
  "시간"?: string;
  "시"?: number | string;
  "링크아이디"?: string | number;
  "통행속도_kmh"?: number | null;
  "혼잡상태"?: string;
}

interface RequestedTrafficMapRouteSource {
  route: RequestedTrafficFiveMinuteRouteMeta;
  links: RequestedTrafficMapRawLink[];
  observations: RequestedTrafficMapRawObservation[];
}

interface SegmentObservationSummary {
  rows: RequestedTrafficMapRawObservation[];
  minSpeedKmh: number | null;
  smoothObservationCount: number;
  slowObservationCount: number;
  congestedObservationCount: number;
}

export const REQUESTED_TRAFFIC_MAP_GROUP_DEFINITIONS: RequestedTrafficMapGroupDefinition[] = [
  {
    id: "incheon-hanil-cement-olympic",
    title: "인천 한일시멘트 ~ 올림픽대로",
    displayLabel: "인천 한일시멘트 ↔ 올림픽대로",
    actualLabel: "인천TG ↔ 목동지하차도서측",
    routeIds: ["incheon_toll_to_mokdong_underpass", "mokdong_underpass_to_incheon_toll"]
  },
  {
    id: "incheon-junction-jangsu",
    title: "인천 분기점 ~ 장수IC",
    displayLabel: "인천 분기점 ↔ 장수IC",
    actualLabel: "계양IC남측 ↔ 장수IC남측",
    routeIds: ["geyang_ic_to_jangsu_ic", "jangsu_ic_to_geyang_ic"]
  },
  {
    id: "olympic-gangbyeonbukro-banghwa",
    title: "올림픽대로 강변북로 ~ 방화대교",
    displayLabel: "올림픽대로/강변북로 ↔ 방화대교",
    actualLabel: "잠실대교북측 ↔ 방화대교",
    routeIds: ["gangbyeonbukro_jamsil_to_banghwa", "gangbyeonbukro_banghwa_to_jamsil"]
  },
  {
    id: "incheon-hanil-cement-gangbyeonbukro",
    title: "인천 한일시멘트 ~ 강변북로",
    displayLabel: "인천 한일시멘트 ↔ 강변북로",
    actualLabel: "방화대교 ↔ 천호대교북측",
    routeIds: ["gangbyeonbukro_banghwa_to_cheonho", "gangbyeonbukro_cheonho_to_banghwa"]
  }
];

export const BUCHEON_REQUESTED_TRAFFIC_MAP_GROUP_DEFINITIONS: RequestedTrafficMapGroupDefinition[] = [
  {
    id: "incheon-hanil-cement-olympic",
    title: "부천 한일시멘트 ~ 올림픽대로",
    displayLabel: "부천 한일시멘트 ↔ 올림픽대로",
    actualLabel: "부천 한일시멘트 ↔ 목동지하차도서측",
    routeIds: ["incheon_toll_to_mokdong_underpass", "mokdong_underpass_to_incheon_toll"],
    routeOverrides: {
      incheon_toll_to_mokdong_underpass: {
        requestLabel: "부천 한일시멘트 → 올림픽대로",
        matchedLabel: "부천 한일시멘트 → 목동지하차도서측",
        mapRouteId: "bucheon_hanil_to_olympic"
      },
      mokdong_underpass_to_incheon_toll: {
        requestLabel: "올림픽대로 → 부천 한일시멘트",
        matchedLabel: "목동지하차도서측 → 부천 한일시멘트",
        mapRouteId: "olympic_to_bucheon_hanil"
      }
    }
  },
  {
    id: "incheon-junction-jangsu",
    title: "부천 한일시멘트 ~ 장수IC",
    displayLabel: "부천 한일시멘트 ↔ 장수IC",
    actualLabel: "부천 한일시멘트 ↔ 장수IC남측",
    routeIds: ["geyang_ic_to_jangsu_ic", "jangsu_ic_to_geyang_ic"],
    routeOverrides: {
      geyang_ic_to_jangsu_ic: {
        requestLabel: "부천 한일시멘트 → 장수IC",
        matchedLabel: "부천 한일시멘트 → 장수IC남측",
        mapRouteId: "bucheon_hanil_to_jangsu"
      },
      jangsu_ic_to_geyang_ic: {
        requestLabel: "장수IC → 부천 한일시멘트",
        matchedLabel: "장수IC남측 → 부천 한일시멘트",
        mapRouteId: "jangsu_to_bucheon_hanil"
      }
    }
  },
  {
    id: "olympic-gangbyeonbukro-banghwa",
    title: "부천 한일시멘트 ~ 방화대교",
    displayLabel: "부천 한일시멘트 ↔ 방화대교",
    actualLabel: "부천 한일시멘트 ↔ 방화대교",
    routeIds: ["gangbyeonbukro_jamsil_to_banghwa", "gangbyeonbukro_banghwa_to_jamsil"],
    routeOverrides: {
      gangbyeonbukro_jamsil_to_banghwa: {
        requestLabel: "부천 한일시멘트 → 방화대교",
        matchedLabel: "부천 한일시멘트 → 방화대교",
        mapRouteId: "bucheon_hanil_to_banghwa"
      },
      gangbyeonbukro_banghwa_to_jamsil: {
        requestLabel: "방화대교 → 부천 한일시멘트",
        matchedLabel: "방화대교 → 부천 한일시멘트",
        mapRouteId: "banghwa_to_bucheon_hanil"
      }
    }
  },
  {
    id: "incheon-hanil-cement-gangbyeonbukro",
    title: "부천 한일시멘트 ~ 강변북로",
    displayLabel: "부천 한일시멘트 ↔ 강변북로",
    actualLabel: "부천 한일시멘트 ↔ 천호대교북측",
    routeIds: ["gangbyeonbukro_banghwa_to_cheonho", "gangbyeonbukro_cheonho_to_banghwa"],
    routeOverrides: {
      gangbyeonbukro_banghwa_to_cheonho: {
        requestLabel: "부천 한일시멘트 → 강변북로",
        matchedLabel: "부천 한일시멘트 → 천호대교북측",
        mapRouteId: "bucheon_hanil_to_gangbyeonbukro"
      },
      gangbyeonbukro_cheonho_to_banghwa: {
        requestLabel: "강변북로 → 부천 한일시멘트",
        matchedLabel: "천호대교북측 → 부천 한일시멘트",
        mapRouteId: "gangbyeonbukro_to_bucheon_hanil"
      }
    }
  }
];

const mapFileCache = new Map<string, RequestedTrafficMapRawFile>();

export function loadRequestedTrafficMapGroups(
  routes: RequestedTrafficFiveMinuteRouteMeta[],
  options: RequestedTrafficMapLoadOptions = {}
): RequestedTrafficMapGroup[] {
  const baseDir = options.baseDir ?? REQUESTED_TRAFFIC_ACTIVE_DATA_DIR;
  const timeWindow = normalizeTimeWindow(options.startHour, options.endHour);
  const groupDefinitions = options.groupDefinitions ?? REQUESTED_TRAFFIC_MAP_GROUP_DEFINITIONS;
  const routeById = new Map(routes.map((route) => [route.id, route]));

  return groupDefinitions
    .map((definition) => {
      const sources = definition.routeIds
        .map((routeId) => routeById.get(routeId))
        .filter((route): route is RequestedTrafficFiveMinuteRouteMeta => Boolean(route))
        .map((route) => loadRouteSource(route, baseDir))
        .filter((source) => source.links.length > 0);

      return {
        id: definition.id,
        title: definition.title,
        displayLabel: definition.displayLabel,
        actualLabel: definition.actualLabel,
        directions: sources.map((source) => buildDirection(source, definition)),
        hours: hourRange(timeWindow).map((hour) => ({
          hour,
          label: `${padHour(hour)}:00`,
          directions: sources.map((source) => buildDirectionHour(source, definition, hour))
        }))
      };
    })
    .filter((group) => group.directions.length > 0);
}

function buildDirection(
  source: RequestedTrafficMapRouteSource,
  definition: RequestedTrafficMapGroupDefinition
): RequestedTrafficMapDirection {
  const override = definition.routeOverrides?.[source.route.id];
  return {
    routeId: source.route.id,
    mapRouteId: override?.mapRouteId ?? source.route.id,
    requestLabel: override?.requestLabel ?? source.route.requestLabel,
    matchedLabel: override?.matchedLabel ?? source.route.matchedLabel,
    linkCount: source.links.length
  };
}

function loadRouteSource(route: RequestedTrafficFiveMinuteRouteMeta, baseDir: string): RequestedTrafficMapRouteSource {
  const parsed = readRouteFile(route.id, baseDir);
  return {
    route,
    links: Array.isArray(parsed["구간목록"]) ? parsed["구간목록"] : [],
    observations: Array.isArray(parsed["오분단위자료"]) ? parsed["오분단위자료"] : []
  };
}

function readRouteFile(routeId: string, baseDir: string): RequestedTrafficMapRawFile {
  assertSafeRouteId(routeId);
  const cacheKey = `${baseDir}:${routeId}`;
  const cached = mapFileCache.get(cacheKey);
  if (cached) return cached;

  const filePath = join(baseDir, `${routeId}.json`);
  if (!existsSync(filePath)) return {};

  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as RequestedTrafficMapRawFile;
  mapFileCache.set(cacheKey, parsed);
  return parsed;
}

function buildDirectionHour(
  source: RequestedTrafficMapRouteSource,
  definition: RequestedTrafficMapGroupDefinition,
  hour: number
): RequestedTrafficMapDirectionHour {
  const direction = buildDirection(source, definition);
  const rowsByLink = observationsByLinkForHour(source.observations, hour);
  const segments = source.links.map((link, index) => buildSegment(link, index, rowsByLink.get(text(link["링크아이디"])) ?? []));
  const blockedSections = segments
    .filter((segment) => isBlockedStatus(segment.status))
    .sort(blockedSectionSort)
    .map(({ linkId, sectionName, roadName, status, minSpeedKmh }) => ({
      linkId,
      sectionName,
      roadName,
      status,
      minSpeedKmh
    }));
  const minSpeeds = segments.flatMap((segment) => (segment.minSpeedKmh == null ? [] : [segment.minSpeedKmh]));
  const congestedSegmentCount = segments.filter((segment) => segment.status === "정체").length;
  const slowSegmentCount = segments.filter((segment) => segment.status === "서행").length;

  return {
    ...direction,
    hour,
    label: `${padHour(hour)}:00`,
    date: firstDate(rowsByLink),
    status: directionStatus(congestedSegmentCount, slowSegmentCount, segments),
    minSpeedKmh: minSpeeds.length ? Math.min(...minSpeeds) : null,
    slowSegmentCount,
    congestedSegmentCount,
    blockedSegmentCount: slowSegmentCount + congestedSegmentCount,
    observationCount: segments.reduce((sum, segment) => sum + segment.observationCount, 0),
    blockedSections,
    segments
  };
}

function observationsByLinkForHour(
  observations: RequestedTrafficMapRawObservation[],
  hour: number
): Map<string, RequestedTrafficMapRawObservation[]> {
  const rowsByLink = new Map<string, RequestedTrafficMapRawObservation[]>();
  for (const row of observations) {
    if (rowHour(row) !== hour) continue;
    const linkId = text(row["링크아이디"]);
    if (!linkId) continue;
    const rows = rowsByLink.get(linkId) ?? [];
    rows.push(row);
    rowsByLink.set(linkId, rows);
  }
  return rowsByLink;
}

function buildSegment(
  link: RequestedTrafficMapRawLink,
  index: number,
  observations: RequestedTrafficMapRawObservation[]
): RequestedTrafficMapSegment {
  const summary = summarizeSegmentObservations(observations);
  const linkId = text(link["링크아이디"]);
  return {
    order: integer(link["순번"]) || index + 1,
    linkId,
    roadName: text(link["도로명"]) || "-",
    fromName: text(link["시점명"]) || "-",
    toName: text(link["종점명"]) || "-",
    sectionName: text(link["구간명"]) || `${text(link["시점명"])} → ${text(link["종점명"])}`,
    lengthMeters: Math.max(1, number(link["연장_m"]) ?? 1),
    status: segmentStatus(summary),
    minSpeedKmh: summary.minSpeedKmh,
    observationCount: summary.rows.length,
    slowObservationCount: summary.slowObservationCount,
    congestedObservationCount: summary.congestedObservationCount
  };
}

function summarizeSegmentObservations(observations: RequestedTrafficMapRawObservation[]): SegmentObservationSummary {
  const speeds = observations.flatMap((row) => (typeof row["통행속도_kmh"] === "number" ? [row["통행속도_kmh"]] : []));
  return observations.reduce(
    (summary, row) => {
      const label = text(row["혼잡상태"]);
      if (label === "정체") summary.congestedObservationCount += 1;
      if (label === "서행") summary.slowObservationCount += 1;
      if (label === "원활") summary.smoothObservationCount += 1;
      return summary;
    },
    {
      rows: observations,
      minSpeedKmh: speeds.length ? Math.min(...speeds) : null,
      smoothObservationCount: 0,
      slowObservationCount: 0,
      congestedObservationCount: 0
    }
  );
}

function segmentStatus(summary: SegmentObservationSummary): RequestedTrafficMapStatus {
  if (summary.congestedObservationCount > 0) return "정체";
  if (summary.slowObservationCount > 0) return "서행";
  if (summary.smoothObservationCount > 0) return "원활";
  return "정보없음";
}

function directionStatus(
  congestedSegmentCount: number,
  slowSegmentCount: number,
  segments: RequestedTrafficMapSegment[]
): RequestedTrafficMapStatus {
  if (congestedSegmentCount > 0) return "정체";
  if (slowSegmentCount > 0) return "서행";
  if (segments.some((segment) => segment.status === "원활")) return "원활";
  return "정보없음";
}

function blockedSectionSort(a: RequestedTrafficMapSegment, b: RequestedTrafficMapSegment): number {
  return (
    statusWeight(b.status) - statusWeight(a.status) ||
    b.congestedObservationCount - a.congestedObservationCount ||
    b.slowObservationCount - a.slowObservationCount ||
    nullableSort(a.minSpeedKmh, b.minSpeedKmh) ||
    a.order - b.order
  );
}

function statusWeight(status: RequestedTrafficMapStatus): number {
  if (status === "정체") return 3;
  if (status === "서행") return 2;
  if (status === "원활") return 1;
  return 0;
}

function nullableSort(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function isBlockedStatus(status: RequestedTrafficMapStatus): boolean {
  return status === "서행" || status === "정체";
}

function firstDate(rowsByLink: Map<string, RequestedTrafficMapRawObservation[]>): string {
  for (const rows of rowsByLink.values()) {
    const date = text(rows[0]?.["날짜"]);
    if (date) return date;
  }
  return "";
}

function normalizeTimeWindow(startHour?: number, endHour?: number): RequestedTrafficTimeWindow {
  const start = normalizeHour(startHour, REQUESTED_TRAFFIC_DAY_START_HOUR);
  const end = normalizeHour(endHour, REQUESTED_TRAFFIC_DAY_END_HOUR);
  return start <= end ? { startHour: start, endHour: end } : { startHour: end, endHour: start };
}

function normalizeHour(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(23, Math.max(0, Math.floor(value))) : fallback;
}

function hourRange(timeWindow: RequestedTrafficTimeWindow): number[] {
  return Array.from({ length: timeWindow.endHour - timeWindow.startHour + 1 }, (_, index) => timeWindow.startHour + index);
}

function rowHour(row: RequestedTrafficMapRawObservation): number | null {
  const explicit = Number(row["시"]);
  if (Number.isInteger(explicit)) return explicit;
  const match = /^(\d{1,2}):/.exec(text(row["시간"]));
  return match ? Number(match[1]) : null;
}

function assertSafeRouteId(routeId: string) {
  if (!/^[a-z0-9_]+$/.test(routeId)) {
    throw new Error(`Invalid requested traffic route id: ${routeId}`);
  }
}

function padHour(hour: number): string {
  return String(hour).padStart(2, "0");
}

function integer(value: string | number | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
}

function number(value: string | number | null | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: string | number | null | undefined): string {
  return value == null ? "" : String(value);
}
