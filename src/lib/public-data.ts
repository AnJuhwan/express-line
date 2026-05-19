import {
  buildIncheonSpeedUrl,
  buildItsTrafficInfoUrl,
  buildTDataHourlySectionUrl,
  extractItsTrafficInfoXmlItems,
  extractPublicDataItems,
  extractTDataItems,
  normalizeIncheonSpeedItems,
  normalizeItsTrafficInfoItems,
  normalizeTDataHourlySectionItems
} from "./collectors";
import { createTrafficRepository } from "./repository";
import { parseDateRange } from "./traffic";
import { displayRoadDivName } from "./display";
import type { DataCoverageRow, NormalizedTrafficObservation, RoadOption, TrafficObservationRow, TrafficQuery } from "./types";

export const PUBLIC_ROAD_LOOKUP_LIMIT = 50000;

const PUBLIC_DATA_PAGE_SIZE = 1000;
const SEOUL_URBAN_ROAD_RE = /강변북로|올림픽대로|내부순환|북부간선|동부간선|서부간선|강남순환|남부순환/;

const ITS_TRAFFIC_BOXES = [
  {
    region: "서울" as const,
    minX: 126.76,
    maxX: 127.2,
    minY: 37.42,
    maxY: 37.7
  },
  {
    region: "인천" as const,
    minX: 126.35,
    maxX: 126.85,
    minY: 37.3,
    maxY: 37.65
  }
];

interface PublicRoadLookupOptions {
  fetcher?: typeof fetch;
  publicDataServiceKey?: string;
  itsApiKey?: string;
  tdataApiKey?: string;
  tdataRoadDivName?: string;
  limit?: number;
}

interface PublicRoadObservationResult {
  rows: NormalizedTrafficObservation[];
  coverage: DataCoverageRow[];
}

interface PublicRoadQueryResult {
  rows: TrafficObservationRow[];
  coverage: DataCoverageRow[];
  roadOptions: RoadOption[];
}

export function shouldUseFreshPublicRoadLookup(query: TrafficQuery): boolean {
  return query.roadName.trim().length > 0;
}

export function publicRoadLookupQuery(query: TrafficQuery): TrafficQuery {
  return {
    ...query,
    roadName: query.roadName.trim(),
    limit: clampLimit(query.limit)
  };
}

export async function queryFreshPublicRoadTraffic(
  query: TrafficQuery,
  options: PublicRoadLookupOptions = {}
): Promise<PublicRoadQueryResult> {
  const freshQuery = publicRoadLookupQuery({ ...query, limit: options.limit ?? query.limit });
  const collected = await collectPublicRoadObservations(freshQuery, { ...options, limit: freshQuery.limit });
  const repo = createTrafficRepository(":memory:");
  repo.migrate();
  repo.upsertObservations(collected.rows);

  return {
    rows: repo.queryObservations(freshQuery),
    coverage: mergeCoverage(collected.coverage, repo.getCoverage()),
    roadOptions: repo.getRoadOptions()
  };
}

export async function collectPublicRoadObservations(
  query: TrafficQuery,
  options: PublicRoadLookupOptions = {}
): Promise<PublicRoadObservationResult> {
  const freshQuery = publicRoadLookupQuery({ ...query, limit: options.limit ?? query.limit });
  if (!freshQuery.roadName) return { rows: [], coverage: [] };

  const fetcher = resolveFetcher(options.fetcher);
  const rows: NormalizedTrafficObservation[] = [];
  const coverage: DataCoverageRow[] = [];
  let hasHistoricalSeoulRows = false;

  if (shouldCollectIncheon(freshQuery)) {
    const serviceKey = options.publicDataServiceKey ?? process.env.PUBLIC_DATA_SERVICE_KEY;
    if (serviceKey) {
      try {
        const sourceRows = await collectIncheonSpeedRows(freshQuery, serviceKey, fetcher);
        rows.push(...sourceRows.slice(0, freshQuery.limit - rows.length));
        coverage.push(coverageForRows("incheon-speed-api", sourceRows, freshQuery.roadName));
      } catch (error) {
        coverage.push(unavailableCoverage("incheon-speed-api", error));
      }
    } else {
      coverage.push(missingKeyCoverage("incheon-speed-api", "PUBLIC_DATA_SERVICE_KEY"));
    }
  }

  if (shouldCollectTData(freshQuery) && rows.length < freshQuery.limit) {
    const tdataApiKey = options.tdataApiKey ?? process.env.TDATA_API_KEY;
    if (tdataApiKey) {
      try {
        const sourceRows = await collectTDataHourlySectionRows(
          freshQuery,
          tdataApiKey,
          fetcher,
          options.tdataRoadDivName ?? process.env.TDATA_ROAD_DIV_NAME
        );
        rows.push(...sourceRows.slice(0, freshQuery.limit - rows.length));
        coverage.push(coverageForRows("tdata-hourly-section", sourceRows, freshQuery.roadName));
        hasHistoricalSeoulRows = sourceRows.length > 0;
      } catch (error) {
        coverage.push(unavailableCoverage("tdata-hourly-section", error));
      }
    } else {
      coverage.push(missingKeyCoverage("tdata-hourly-section", "TDATA_API_KEY"));
    }
  }

  if (rows.length < freshQuery.limit && !hasHistoricalSeoulRows) {
    const itsApiKey = options.itsApiKey ?? process.env.ITS_API_KEY;
    if (itsApiKey) {
      try {
        const sourceRows = await collectItsRows(freshQuery, itsApiKey, fetcher, freshQuery.limit - rows.length);
        rows.push(...sourceRows.slice(0, freshQuery.limit - rows.length));
        coverage.push(coverageForRows("its-realtime", sourceRows, freshQuery.roadName));
      } catch (error) {
        coverage.push(unavailableCoverage("its-realtime", error));
      }
    } else {
      coverage.push(missingKeyCoverage("its-realtime", "ITS_API_KEY"));
    }
  }

  return {
    rows: rows.slice(0, freshQuery.limit),
    coverage
  };
}

async function collectTDataHourlySectionRows(
  query: TrafficQuery,
  apiKey: string,
  fetcher: typeof fetch,
  roadDivName?: string
): Promise<NormalizedTrafficObservation[]> {
  const rows: NormalizedTrafficObservation[] = [];

  for (const date of parseDateRange(query.startDate, query.endDate)) {
    let startRow = 1;
    while (rows.length < query.limit) {
      const remaining = query.limit - rows.length;
      const rowCnt = Math.min(PUBLIC_DATA_PAGE_SIZE, remaining);
      const url = buildTDataHourlySectionUrl({ apiKey, date, startRow, rowCnt });
      const response = await fetcher(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`T-DATA hourly section request failed: ${response.status}`);
      const items = extractTDataItems(await response.json());
      rows.push(
        ...normalizeTDataHourlySectionItems(items).filter(
          (row) => matchesPublicQuery(row, query) && matchesRoadDivName(row, roadDivName)
        )
      );

      if (items.length < rowCnt) break;
      startRow += rowCnt;
    }
  }

  return rows.slice(0, query.limit);
}

async function collectIncheonSpeedRows(query: TrafficQuery, serviceKey: string, fetcher: typeof fetch): Promise<NormalizedTrafficObservation[]> {
  const rows: NormalizedTrafficObservation[] = [];

  for (const date of parseDateRange(query.startDate, query.endDate)) {
    let pageNo = 1;
    while (rows.length < query.limit) {
      const remaining = query.limit - rows.length;
      const numOfRows = Math.min(PUBLIC_DATA_PAGE_SIZE, remaining);
      const url = buildIncheonSpeedUrl({
        serviceKey,
        date,
        roadName: query.roadName,
        pageNo,
        numOfRows
      });
      const response = await fetcher(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Incheon public data request failed: ${response.status}`);
      const items = extractPublicDataItems(await response.json());
      rows.push(...normalizeIncheonSpeedItems(items, date).filter((row) => matchesPublicQuery(row, query)));

      if (items.length < numOfRows) break;
      pageNo += 1;
    }
  }

  return rows.slice(0, query.limit);
}

async function collectItsRows(
  query: TrafficQuery,
  apiKey: string,
  fetcher: typeof fetch,
  limit: number
): Promise<NormalizedTrafficObservation[]> {
  const rows: NormalizedTrafficObservation[] = [];

  for (const box of ITS_TRAFFIC_BOXES) {
    if (!shouldCollectItsBox(query, box.region)) continue;
    if (rows.length >= limit) break;

    const url = buildItsTrafficInfoUrl({ apiKey, ...box });
    const response = await fetcher(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`ITS public data request failed for ${box.region}: ${response.status}`);
    const text = await response.text();
    const items = text.trim().startsWith("<") ? extractItsTrafficInfoXmlItems(text) : extractPublicDataItems(JSON.parse(text));
    rows.push(...normalizeItsTrafficInfoItems(items, box.region).filter((row) => matchesPublicQuery(row, query)));
  }

  return rows.slice(0, limit);
}

function matchesPublicQuery(row: NormalizedTrafficObservation, query: TrafficQuery): boolean {
  if (!row.roadName.includes(query.roadName)) return false;
  if (query.region !== "all" && row.region !== query.region) return false;
  return row.observedDate >= query.startDate && row.observedDate <= query.endDate;
}

function matchesRoadDivName(row: NormalizedTrafficObservation, roadDivName?: string): boolean {
  const expected = roadDivName?.trim();
  if (!expected) return true;
  return displayRoadDivName(row).includes(expected);
}

function shouldCollectIncheon(query: TrafficQuery): boolean {
  if (query.region === "서울") return false;
  if (query.region === "인천") return true;
  return !SEOUL_URBAN_ROAD_RE.test(query.roadName);
}

function shouldCollectTData(query: TrafficQuery): boolean {
  if (query.region === "인천") return false;
  return SEOUL_URBAN_ROAD_RE.test(query.roadName);
}

function shouldCollectItsBox(query: TrafficQuery, region: "서울" | "인천"): boolean {
  if (query.region !== "all") return query.region === region;
  if (SEOUL_URBAN_ROAD_RE.test(query.roadName)) return region === "서울";
  return true;
}

function coverageForRows(sourceName: string, rows: NormalizedTrafficObservation[], roadName: string): DataCoverageRow {
  if (!rows.length) {
    return {
      sourceName,
      minDate: null,
      maxDate: null,
      status: "empty",
      message: `${roadName} 공공데이터 조회 결과 없음`
    };
  }

  const dates = rows.map((row) => row.observedDate).sort();
  return {
    sourceName,
    minDate: dates[0],
    maxDate: dates[dates.length - 1],
    status: "available",
    message: `${rows.length} observations loaded`
  };
}

function missingKeyCoverage(sourceName: string, envName: string): DataCoverageRow {
  return {
    sourceName,
    minDate: null,
    maxDate: null,
    status: "missing_key",
    message: `${envName}가 없어 공공데이터 재조회를 건너뜁니다.`
  };
}

function unavailableCoverage(sourceName: string, error: unknown): DataCoverageRow {
  return {
    sourceName,
    minDate: null,
    maxDate: null,
    status: "unavailable",
    message: error instanceof Error ? error.message : "공공데이터 요청 실패"
  };
}

function mergeCoverage(primary: DataCoverageRow[], loaded: DataCoverageRow[]): DataCoverageRow[] {
  const bySource = new Map<string, DataCoverageRow>();
  for (const row of primary) bySource.set(row.sourceName, row);
  for (const row of loaded) bySource.set(row.sourceName, row);
  return Array.from(bySource.values()).sort((a, b) => a.sourceName.localeCompare(b.sourceName));
}

function clampLimit(value: number): number {
  return Math.min(Number.isFinite(value) && value > 0 ? value : PUBLIC_ROAD_LOOKUP_LIMIT, PUBLIC_ROAD_LOOKUP_LIMIT);
}

function resolveFetcher(fetcher?: typeof fetch): typeof fetch {
  if (fetcher) return fetcher;
  if (typeof fetch === "function") return fetch;
  throw new Error("fetch is unavailable for public data lookup");
}
