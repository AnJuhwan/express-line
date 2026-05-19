import { classifyCongestion, fromCompactDate, kstTimestamp, normalizeTimeOfDay, toCompactDate } from "./traffic";
import type { NormalizedTrafficObservation, RoadKind } from "./types";

type RawRow = Record<string, unknown>;

const INCHEON_SPEED_URL = "http://apis.data.go.kr/6280000/ICRoadStat_v2/STAT-Speed_DD_Road";
const INCHEON_VOLUME_URL = "http://apis.data.go.kr/6280000/ICRoadVolStat/NodeLink_Trfc_DD";
const TDATA_HOURLY_SECTION_URL =
  "https://t-data.seoul.go.kr/apig/apiman-gateway/tapi/TopisIccStTimesLinkTrfSectionStats/1.0";
const TDATA_AXIS_NAMES: Record<string, string> = {
  "14": "강변북로",
  "26": "경부고속도로",
  "27": "남부순환로",
  "79": "내부순환로",
  "124": "동부간선도로",
  "200": "북부간선도로",
  "204": "동부간선도로",
  "364": "올림픽대로",
  "536": "강남순환로",
  "21001": "신월여의지하도로",
  "21002": "서부간선도로"
};

export interface IncheonUrlInput {
  serviceKey: string;
  date: string;
  roadName?: string;
  pageNo?: number;
  numOfRows?: number;
}

export function buildIncheonSpeedUrl(input: IncheonUrlInput): URL {
  const url = new URL(INCHEON_SPEED_URL);
  url.searchParams.set("serviceKey", input.serviceKey);
  url.searchParams.set("pageNo", String(input.pageNo ?? 1));
  url.searchParams.set("numOfRows", String(input.numOfRows ?? 100));
  url.searchParams.set("YMD", toCompactDate(input.date));
  if (input.roadName) url.searchParams.set("roadName", input.roadName);
  return url;
}

export function buildIncheonVolumeUrl(input: Omit<IncheonUrlInput, "roadName">): URL {
  const url = new URL(INCHEON_VOLUME_URL);
  url.searchParams.set("serviceKey", input.serviceKey);
  url.searchParams.set("pageNo", String(input.pageNo ?? 1));
  url.searchParams.set("numOfRows", String(input.numOfRows ?? 100));
  url.searchParams.set("YMD", toCompactDate(input.date));
  return url;
}

export function buildSeoulTrafficInfoUrl(input: {
  apiKey: string;
  linkId: string;
  startIndex?: number;
  endIndex?: number;
}): URL {
  return new URL(
    `http://openapi.seoul.go.kr:8088/${encodeURIComponent(input.apiKey)}/xml/TrafficInfo/${input.startIndex ?? 1}/${input.endIndex ?? 5}/${encodeURIComponent(input.linkId)}`
  );
}

export function buildItsTrafficInfoUrl(input: {
  apiKey: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  type?: "all" | "its" | "ex";
}): URL {
  const url = new URL("https://openapi.its.go.kr:9443/trafficInfo");
  url.searchParams.set("apiKey", input.apiKey);
  url.searchParams.set("type", input.type ?? "all");
  url.searchParams.set("minX", String(input.minX));
  url.searchParams.set("maxX", String(input.maxX));
  url.searchParams.set("minY", String(input.minY));
  url.searchParams.set("maxY", String(input.maxY));
  url.searchParams.set("getType", "json");
  return url;
}

export function buildTDataHourlySectionUrl(input: {
  apiKey: string;
  date: string;
  startRow?: number;
  rowCnt?: number;
}): URL {
  const url = new URL(TDATA_HOURLY_SECTION_URL);
  url.searchParams.set("apikey", cleanTDataApiKey(input.apiKey));
  url.searchParams.set("stndDt", toCompactDate(input.date));
  url.searchParams.set("startRow", String(input.startRow ?? 1));
  url.searchParams.set("rowCnt", String(input.rowCnt ?? 1000));
  return url;
}

export function normalizeSeoulUrbanSpeedRows(rows: RawRow[]): NormalizedTrafficObservation[] {
  return rows
    .map((row) => {
      const date = read(row, ["날짜", "년월일", "일자", "기간", "YMD"]);
      const observedDate = date.includes("-") ? date : fromCompactDate(date);
      const time = normalizeTimeOfDay(read(row, ["5분단위시간", "5분 코드", "시간", "TIME", "집계시"], "0000"));
      const speedKph = numberOrNull(read(row, ["속도", "평균속도", "SPEED"], ""));
      const congestion = classifyCongestion(speedKph, "urban_expressway");

      return {
        region: "서울",
        roadName: read(row, ["노선이름", "노선명", "ROAD_NAME"], "서울 도시고속도로"),
        sectionName: read(row, ["구간명", "SECTION_NAME"], "구간 정보 없음"),
        linkId: read(row, ["구간ID", "구간 ID", "링크ID", "링크 ID", "LINK_ID"], `${read(row, ["노선ID", "노선 ID", "ROUTE_ID"], "seoul")}-${time.hhmm}`),
        roadKind: "urban_expressway",
        roadDivName: "도시고속도로",
        observedAt: kstTimestamp(observedDate, time.hour, time.minute),
        observedDate,
        observedHour: time.hour,
        granularity: time.minute === 0 ? "hour" : "5min",
        sourceName: "seoul-urban-file",
        speedKph,
        travelTimeSeconds: null,
        trafficVolume: numberOrNull(read(row, ["교통량", "TRAFFIC_VOLUME"], "")),
        occupancy: numberOrNull(read(row, ["점유율", "OCCUPANCY"], "")),
        congestionLevel: congestion.level,
        congestionLabel: congestion.label,
        congestionMethod: congestion.method
      } satisfies NormalizedTrafficObservation;
    })
    .filter((row) => row.speedKph != null);
}

export function normalizeIncheonSpeedItems(items: RawRow[], date: string): NormalizedTrafficObservation[] {
  return items
    .map((item, index) => {
      const roadName = read(item, ["roadName", "ROAD_NM", "roadNm", "도로명"], "인천 주요도로");
      const linkId = read(item, ["linkId", "stdLinkId", "link_id", "표준링크아이디"], `${roadName}-${index}`);
      const sectionName = read(item, ["sectionName", "linkNm", "구간명"], "일별 평균");
      const speedKph = numberOrNull(read(item, ["speed", "avgSpeed", "trvlSpd", "통행속도"], ""));
      const congestion = classifyCongestion(speedKph, "general_road", "derived");

      return {
        region: "인천",
        roadName,
        sectionName,
        linkId,
        roadKind: "general_road",
        roadDivName: "일반도로",
        observedAt: kstTimestamp(date, 0),
        observedDate: date,
        observedHour: 0,
        granularity: "day",
        sourceName: "incheon-speed-api",
        speedKph,
        travelTimeSeconds: null,
        trafficVolume: null,
        occupancy: null,
        congestionLevel: congestion.level,
        congestionLabel: congestion.label,
        congestionMethod: congestion.method
      } satisfies NormalizedTrafficObservation;
    })
    .filter((row) => row.speedKph != null);
}

export function normalizeTDataHourlySectionItems(items: RawRow[]): NormalizedTrafficObservation[] {
  return items
    .map((item, index) => {
      const observedDate = fromCompactDate(read(item, ["stnd_dt", "stndDt", "stndMon", "기준일자"], ""));
      const timeCode = Number(read(item, ["time_cd", "timeCd", "시간코드"], "1"));
      const observedHour = tdataTimeCodeToObservedHour(timeCode);
      const axisCd = read(item, ["axisCd", "axis_cd", "도로코드"], "");
      const roadName = read(item, ["axisName", "axis_name", "도로명"], TDATA_AXIS_NAMES[axisCd] ?? "서울 도로");
      const linkId = read(item, ["link_id", "linkId", "구간ID"], `${roadName}-${observedDate}-${observedHour}-${index}`);
      const startNode = read(item, ["st_node_nm", "stNodeNm", "시점명"], "시점");
      const endNode = read(item, ["ed_node_nm", "edNodeNm", "종점명"], "종점");
      const roadDivName = read(item, ["road_div_nm", "roadDivNm", "도로구분명"], "");
      const roadKind = roadDivName.includes("도시고속") ? "urban_expressway" : inferRoadKind(roadName);
      const speedKph = numberOrNull(read(item, ["avgSpd", "avg_spd", "평균속도"], ""));
      const congestion = classifyCongestion(speedKph, roadKind);

      return {
        region: "서울",
        roadName,
        sectionName: `${startNode}→${endNode}`,
        linkId,
        roadKind,
        roadDivName: roadDivName || roadDivNameForKind(roadKind),
        observedAt: kstTimestamp(observedDate, observedHour),
        observedDate,
        observedHour,
        granularity: "hour",
        sourceName: "tdata-hourly-section",
        speedKph,
        travelTimeSeconds: null,
        trafficVolume: null,
        occupancy: null,
        congestionLevel: congestion.level,
        congestionLabel: congestion.label,
        congestionMethod: congestion.method
      } satisfies NormalizedTrafficObservation;
    })
    .filter((row) => row.speedKph != null && row.observedHour >= 0 && row.observedHour <= 23);
}

function tdataTimeCodeToObservedHour(timeCode: number): number {
  if (!Number.isFinite(timeCode)) return 0;
  return Math.min(23, Math.max(0, Math.trunc(timeCode) - 1));
}

export function normalizeSeoulTrafficInfoXml(xml: string, linkId: string): NormalizedTrafficObservation[] {
  const rows = Array.from(xml.matchAll(/<row>([\s\S]*?)<\/row>/g)).map((match) => match[1]);
  const now = new Date();
  const observedDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  const observedHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false }).format(now)
  );

  return rows.map((row) => {
    const speedKph = numberOrNull(tag(row, "PRCS_SPD"));
    const congestion = classifyCongestion(speedKph, "general_road");
    return {
      region: "서울",
      roadName: `TOPIS 링크 ${linkId}`,
      sectionName: `링크 ${tag(row, "LINK_ID") || linkId}`,
      linkId: tag(row, "LINK_ID") || linkId,
      roadKind: "general_road",
      roadDivName: "일반도로",
      observedAt: kstTimestamp(observedDate, observedHour),
      observedDate,
      observedHour,
      granularity: "realtime",
      sourceName: "seoul-topis-realtime",
      speedKph,
      travelTimeSeconds: numberOrNull(tag(row, "PRCS_TRV_TIME")),
      trafficVolume: null,
      occupancy: null,
      congestionLevel: congestion.level,
      congestionLabel: congestion.label,
      congestionMethod: congestion.method
    };
  });
}

export function normalizeItsTrafficInfoItems(items: RawRow[], region: "서울" | "인천"): NormalizedTrafficObservation[] {
  return items
    .map((item, index) => {
      const roadName = read(item, ["roadName", "ROAD_NAME", "도로명"], "ITS 도로");
      const linkId = read(item, ["linkId", "LINK_ID", "linkNo"], `its-${region}-${index}`);
      const roadKind = inferRoadKind(roadName);
      const speedKph = numberOrNull(read(item, ["speed", "SPEED"], ""));
      const congestion = classifyCongestion(speedKph, roadKind);
      const observedAt = itsCreatedDateToKst(read(item, ["createdDate", "CREATED_DATE"], ""));

      return {
        region,
        roadName,
        sectionName: `${read(item, ["startNodeId", "F_NODE"], "시점")}→${read(item, ["endNodeId", "T_NODE"], "종점")}`,
        linkId,
        roadKind,
        roadDivName: roadDivNameForKind(roadKind),
        observedAt,
        observedDate: observedAt.slice(0, 10),
        observedHour: Number(observedAt.slice(11, 13)),
        granularity: "realtime",
        sourceName: "its-realtime",
        speedKph,
        travelTimeSeconds: numberOrNull(read(item, ["travelTime", "TRAVEL_TIME"], "")),
        trafficVolume: null,
        occupancy: null,
        congestionLevel: congestion.level,
        congestionLabel: congestion.label,
        congestionMethod: congestion.method
      } satisfies NormalizedTrafficObservation;
    })
    .filter((row) => row.speedKph != null);
}

export function extractPublicDataItems(payload: unknown): RawRow[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const body = asRecord(root.response)?.body ?? root.body ?? root;
  const items = asRecord(body)?.items;
  const item = asRecord(items)?.item ?? items;
  if (Array.isArray(item)) return item.filter(isRecord);
  if (isRecord(item)) return [item];
  if (Array.isArray(body)) return body.filter(isRecord);
  return [];
}

export function extractTDataItems(payload: unknown): RawRow[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;

  for (const key of ["data", "result", "list", "rows", "items"]) {
    const value = root[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }

  const nested = asRecord(root.response)?.body ?? asRecord(root.body)?.items ?? root.body;
  if (Array.isArray(nested)) return nested.filter(isRecord);
  if (isRecord(nested)) {
    for (const key of ["data", "result", "list", "rows", "items"]) {
      const value = nested[key];
      if (Array.isArray(value)) return value.filter(isRecord);
    }
  }

  return [];
}

export function extractItsTrafficInfoXmlItems(xml: string): RawRow[] {
  return Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g)).map((match) => ({
    roadName: tag(match[1], "roadName"),
    linkId: tag(match[1], "linkId"),
    startNodeId: tag(match[1], "startNodeId"),
    endNodeId: tag(match[1], "endNodeId"),
    speed: tag(match[1], "speed"),
    travelTime: tag(match[1], "travelTime"),
    createdDate: tag(match[1], "createdDate")
  }));
}

function read(row: RawRow, keys: string[], fallback = ""): string {
  const normalizedRow = Object.entries(row).map(([key, value]) => [normalizeKey(key), value] as const);
  for (const key of keys) {
    const normalizedKey = normalizeKey(key);
    const value = row[key] ?? normalizedRow.find(([candidate]) => candidate === normalizedKey)?.[1];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return fallback;
}

function normalizeKey(key: string): string {
  return key.replace(/\s/g, "").trim().toLowerCase();
}

function numberOrNull(value: string): number | null {
  const normalized = String(value ?? "").replaceAll(",", "").trim();
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function inferRoadKind(roadName: string): "urban_expressway" | "general_road" | "expressway" {
  if (/고속도로|순환|올림픽대로|강변북로|내부순환|북부간선|동부간선|서부간선/.test(roadName)) {
    return "urban_expressway";
  }
  return "general_road";
}

function roadDivNameForKind(roadKind: RoadKind): string {
  if (roadKind === "urban_expressway") return "도시고속도로";
  if (roadKind === "expressway") return "고속도로";
  return "일반도로";
}

function itsCreatedDateToKst(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 14) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}+09:00`;
  }
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(now);
  return `${date}T${time}+09:00`;
}

function tag(xml: string, name: string): string {
  const match = xml.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function isRecord(value: unknown): value is RawRow {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function cleanTDataApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  const withoutQuery = trimmed.split(/[&?]/)[0] ?? trimmed;
  return withoutQuery.includes("=") ? withoutQuery.split("=").at(-1)?.trim() ?? withoutQuery : withoutQuery;
}
