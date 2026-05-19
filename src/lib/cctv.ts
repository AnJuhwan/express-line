export const CCTV_REPORT_START_DATE = "2026-05-16";
export const CCTV_REPORT_END_DATE = "2026-05-19";
export const CCTV_REQUEST_NOTE = "요청 메시지의 종료 연도 2025는 앞선 대화 맥락에 맞춰 2026으로 보정했습니다.";

const ITS_CCTV_INFO_URL = "https://openapi.its.go.kr:9443/cctvInfo";
const TOPIS_CCTV_INFO_URL = "https://topis.seoul.go.kr/map/selectCctvInfo.do";

const HAN_RIVER_CCTV_BOUNDS = {
  minX: 126.8,
  maxX: 127.13,
  minY: 37.49,
  maxY: 37.6
};

const TOPIS_TARGET_CAMERAS: TopisTargetCamera[] = [
  { code: "60", corridorId: "olympic", order: 10 },
  { code: "721", corridorId: "olympic", order: 11 },
  { code: "5", corridorId: "olympic", order: 12 },
  { code: "13", corridorId: "olympic", order: 13 },
  { code: "12", corridorId: "olympic", order: 20 },
  { code: "23", corridorId: "olympic", order: 21 },
  { code: "11", corridorId: "olympic", order: 30 },
  { code: "22", corridorId: "olympic", order: 31 },
  { code: "112", corridorId: "olympic", order: 40 },
  { code: "377", corridorId: "gangbyeonbuk", order: 110 },
  { code: "352", corridorId: "gangbyeonbuk", order: 120 },
  { code: "17", corridorId: "gangbyeonbuk", order: 130 },
  { code: "54", corridorId: "gangbyeonbuk", order: 140 },
  { code: "42", corridorId: "gangbyeonbuk", order: 150 },
  { code: "63", corridorId: "gangbyeonbuk", order: 160 },
  { code: "66", corridorId: "gangbyeonbuk", order: 170 },
  { code: "19", corridorId: "gangbyeonbuk", order: 180 },
  { code: "72", corridorId: "gangbyeonbuk", order: 190 },
  { code: "128", corridorId: "gangbyeonbuk", order: 200 },
  { code: "91", corridorId: "gangbyeonbuk", order: 210 }
];

type RawRow = Record<string, unknown>;

export type CctvCorridorId = "olympic" | "gangbyeonbuk";
export type CctvSourceStatus = "ok" | "missing-key" | "unavailable" | "disabled";
export type CctvMediaKind = "mp4" | "hls" | "jpeg" | "unknown";

interface TopisTargetCamera {
  code: string;
  corridorId: CctvCorridorId;
  order: number;
}

export interface ItsCctvUrlInput {
  apiKey: string;
  type?: "all" | "its" | "ex";
  cctvType?: "1" | "2" | "3" | "4" | "5";
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
}

export interface CctvVideoItem {
  id: string;
  corridorId: CctvCorridorId;
  corridorName: string;
  sourceName: "ITS CCTV API" | "TOPIS 실시간 CCTV";
  provider: string;
  name: string;
  roadName: string;
  format: string;
  mediaKind: CctvMediaKind;
  url: string;
  longitude: number | null;
  latitude: number | null;
  fileCreatedAt: string | null;
  historicalDateSupported: false;
  requestedDateRange: string;
  order: number;
}

export interface CctvSourceReport {
  status: CctvSourceStatus;
  totalCount: number;
  matchedCount: number;
  message: string;
}

export interface CctvVideoReport {
  generatedAt: string;
  request: {
    startDate: string;
    endDate: string;
    note: string;
  };
  historicalAccess: {
    supported: false;
    message: string;
  };
  its: CctvSourceReport;
  topis: CctvSourceReport;
  videos: CctvVideoItem[];
}

interface BuildCctvVideoReportOptions {
  fetcher?: typeof fetch;
  itsApiKey?: string;
  includeTopis?: boolean;
  now?: Date;
}

export function buildItsCctvInfoUrl(input: ItsCctvUrlInput): URL {
  const url = new URL(ITS_CCTV_INFO_URL);
  url.searchParams.set("apiKey", input.apiKey);
  url.searchParams.set("type", input.type ?? "all");
  url.searchParams.set("cctvType", input.cctvType ?? "5");
  url.searchParams.set("minX", String(input.minX ?? HAN_RIVER_CCTV_BOUNDS.minX));
  url.searchParams.set("maxX", String(input.maxX ?? HAN_RIVER_CCTV_BOUNDS.maxX));
  url.searchParams.set("minY", String(input.minY ?? HAN_RIVER_CCTV_BOUNDS.minY));
  url.searchParams.set("maxY", String(input.maxY ?? HAN_RIVER_CCTV_BOUNDS.maxY));
  url.searchParams.set("getType", "json");
  return url;
}

export function extractItsCctvItems(payload: unknown): RawRow[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  const response = asRecord(payload.response);
  const data = response?.data ?? payload.data;
  if (Array.isArray(data)) return data.filter(isRecord);
  if (isRecord(data)) return [data];
  const body = asRecord(response?.body ?? payload.body);
  const items = asRecord(body?.items)?.item ?? body?.items;
  if (Array.isArray(items)) return items.filter(isRecord);
  if (isRecord(items)) return [items];
  return [];
}

export function classifyCctvCorridor(name: string, roadName: string): CctvCorridorId | null {
  const text = `${name} ${roadName}`;
  if (/올림픽대로/.test(text)) return "olympic";
  if (/강변북로/.test(text)) return "gangbyeonbuk";
  return null;
}

export async function buildCctvVideoReport(options: BuildCctvVideoReportOptions = {}): Promise<CctvVideoReport> {
  const fetcher = options.fetcher ?? fetch;
  const requestedDateRange = `${CCTV_REPORT_START_DATE} ~ ${CCTV_REPORT_END_DATE}`;
  const its = await collectItsCctvVideos(fetcher, options.itsApiKey ?? process.env.ITS_API_KEY, requestedDateRange);
  const topis =
    options.includeTopis === false
      ? disabledSourceReport("TOPIS 보강 수집을 끔")
      : await collectTopisCctvVideos(fetcher, requestedDateRange);

  const videos = dedupeVideos([...its.videos, ...topis.videos]).sort((left, right) => {
    if (left.corridorId !== right.corridorId) return corridorSortOrder(left.corridorId) - corridorSortOrder(right.corridorId);
    return left.order - right.order || left.name.localeCompare(right.name);
  });

  return {
    generatedAt: formatKst(options.now ?? new Date()),
    request: {
      startDate: CCTV_REPORT_START_DATE,
      endDate: CCTV_REPORT_END_DATE,
      note: CCTV_REQUEST_NOTE
    },
    historicalAccess: {
      supported: false,
      message:
        "ITS CCTV API와 TOPIS 공개 CCTV 화면은 날짜/시간 파라미터가 없는 실시간 영상 원천입니다. 과거 2026-05-16~2026-05-19 풀영상은 공개 URL로 받을 수 없습니다."
    },
    its: withoutVideos(its),
    topis: withoutVideos(topis),
    videos
  };
}

async function collectItsCctvVideos(
  fetcher: typeof fetch,
  apiKey: string | undefined,
  requestedDateRange: string
): Promise<CctvSourceReport & { videos: CctvVideoItem[] }> {
  if (!apiKey) {
    return { ...missingKeySourceReport("ITS_API_KEY가 없어 ITS CCTV API를 호출하지 못했습니다."), videos: [] };
  }

  try {
    const url = buildItsCctvInfoUrl({ apiKey, cctvType: "5", type: "all" });
    const response = await fetcher(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const items = extractItsCctvItems(await response.json());
    const videos = items
      .map((item, index) => normalizeItsCctvVideo(item, index, requestedDateRange))
      .filter((item): item is CctvVideoItem => item != null);

    return {
      status: "ok",
      totalCount: items.length,
      matchedCount: videos.length,
      message: `ITS CCTV API cctvType=5(HTTPS MP4) 현재 응답 ${items.length.toLocaleString("ko-KR")}건 중 요청 축 매칭 ${videos.length.toLocaleString("ko-KR")}건`,
      videos
    };
  } catch (error) {
    return { ...unavailableSourceReport(`ITS CCTV API 호출 실패: ${errorMessage(error)}`), videos: [] };
  }
}

async function collectTopisCctvVideos(
  fetcher: typeof fetch,
  requestedDateRange: string
): Promise<CctvSourceReport & { videos: CctvVideoItem[] }> {
  const results = await Promise.all(
    TOPIS_TARGET_CAMERAS.map(async (target) => {
      try {
        const response = await fetcher(TOPIS_CCTV_INFO_URL, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            referer: "https://topis.seoul.go.kr/map/openCctvMap.do",
            "x-requested-with": "XMLHttpRequest"
          },
          body: new URLSearchParams({ camId: target.code, cctvSourceCd: "HP" }),
          cache: "no-store"
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const row = extractTopisRows(payload)[0];
        if (!row) return null;
        return normalizeTopisCctvVideo(row, target, requestedDateRange);
      } catch {
        return null;
      }
    })
  );

  const videos = results.filter((item): item is CctvVideoItem => item != null);
  return {
    status: videos.length > 0 ? "ok" : "unavailable",
    totalCount: TOPIS_TARGET_CAMERAS.length,
    matchedCount: videos.length,
    message:
      videos.length > 0
        ? `TOPIS 실시간 CCTV 후보 ${TOPIS_TARGET_CAMERAS.length.toLocaleString("ko-KR")}개 중 ${videos.length.toLocaleString("ko-KR")}개 HLS URL 확보`
        : "TOPIS 실시간 CCTV URL을 가져오지 못했습니다.",
    videos
  };
}

function normalizeItsCctvVideo(item: RawRow, index: number, requestedDateRange: string): CctvVideoItem | null {
  const name = read(item, ["cctvname", "CCTVNAME", "cctvName"]);
  const roadName = roadNameFromItsName(name);
  const corridorId = classifyCctvCorridor(name, roadName);
  const url = read(item, ["cctvurl", "CCTVURL", "cctvUrl"]);
  if (!corridorId || !url) return null;

  return {
    id: read(item, ["roadsectionid", "roadSectionId", "cctvid"], `its-${index}`),
    corridorId,
    corridorName: corridorName(corridorId),
    sourceName: "ITS CCTV API",
    provider: "국가교통정보센터",
    name,
    roadName,
    format: read(item, ["cctvformat", "cctvFormat"], "MP4"),
    mediaKind: mediaKindFromFormat(read(item, ["cctvformat", "cctvFormat"], "MP4")),
    url,
    longitude: numberOrNull(read(item, ["coordx", "coordX"], "")),
    latitude: numberOrNull(read(item, ["coordy", "coordY"], "")),
    fileCreatedAt: compactTimestamp(read(item, ["filecreatetime", "fileCreateTime"], "")),
    historicalDateSupported: false,
    requestedDateRange,
    order: corridorId === "olympic" ? 1 : 101
  };
}

function normalizeTopisCctvVideo(
  row: RawRow,
  target: TopisTargetCamera,
  requestedDateRange: string
): CctvVideoItem | null {
  const url = read(row, ["hlsUrl", "hlsUrlOri", "remark5"]);
  if (!url) return null;
  const name = read(row, ["cctvName"], `TOPIS ${target.code}`);
  const roadName = read(row, ["roadNm"], corridorName(target.corridorId));
  const corridorId = classifyCctvCorridor(name, roadName) ?? target.corridorId;

  return {
    id: read(row, ["camId", "cctvId", "chnId"], target.code),
    corridorId,
    corridorName: corridorName(corridorId),
    sourceName: "TOPIS 실시간 CCTV",
    provider: read(row, ["gvrNm", "gvrCd"], "서울 TOPIS"),
    name,
    roadName,
    format: "HLS",
    mediaKind: "hls",
    url,
    longitude: numberOrNull(read(row, ["axX"], "")),
    latitude: numberOrNull(read(row, ["axY"], "")),
    fileCreatedAt: null,
    historicalDateSupported: false,
    requestedDateRange,
    order: target.order
  };
}

function extractTopisRows(payload: unknown): RawRow[] {
  if (!isRecord(payload)) return [];
  const rows = payload.rows;
  return Array.isArray(rows) ? rows.filter(isRecord) : [];
}

function read(row: RawRow, keys: string[], fallback = ""): string {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeKey(key), value] as const);
  for (const key of keys) {
    const value = row[key] ?? normalizedEntries.find(([candidate]) => candidate === normalizeKey(key))?.[1];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return fallback;
}

function normalizeKey(key: string): string {
  return key.replace(/\s/g, "").trim().toLowerCase();
}

function roadNameFromItsName(name: string): string {
  if (name.includes("올림픽대로")) return "올림픽대로";
  if (name.includes("강변북로")) return "강변북로";
  return "";
}

function corridorName(corridorId: CctvCorridorId): string {
  return corridorId === "olympic" ? "올림픽대로 방화대교→잠실대교" : "강변북로 방화대교→천호대교";
}

function corridorSortOrder(corridorId: CctvCorridorId): number {
  return corridorId === "olympic" ? 0 : 1;
}

function mediaKindFromFormat(format: string): CctvMediaKind {
  const normalized = format.toLowerCase();
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("hls")) return "hls";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpeg";
  return "unknown";
}

function numberOrNull(value: string): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactTimestamp(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 14) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}+09:00`;
}

function formatKst(date: Date): string {
  const formatted = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
  return `${formatted.replace(" ", "T")}+09:00`;
}

function dedupeVideos(videos: CctvVideoItem[]): CctvVideoItem[] {
  const seen = new Set<string>();
  return videos.filter((video) => {
    const key = `${video.sourceName}\u0000${video.id}\u0000${video.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withoutVideos(source: CctvSourceReport & { videos: CctvVideoItem[] }): CctvSourceReport {
  return {
    status: source.status,
    totalCount: source.totalCount,
    matchedCount: source.matchedCount,
    message: source.message
  };
}

function disabledSourceReport(message: string): CctvSourceReport & { videos: CctvVideoItem[] } {
  return { status: "disabled", totalCount: 0, matchedCount: 0, message, videos: [] };
}

function missingKeySourceReport(message: string): CctvSourceReport {
  return { status: "missing-key", totalCount: 0, matchedCount: 0, message };
}

function unavailableSourceReport(message: string): CctvSourceReport {
  return { status: "unavailable", totalCount: 0, matchedCount: 0, message };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is RawRow {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): RawRow | null {
  return isRecord(value) ? value : null;
}
