import { defaultDateRange } from "./traffic";
import type { DataCoverageRow, RegionFilter, TrafficQuery } from "./types";

export const DEFAULT_TRAFFIC_LIMIT = 50000;
export const MAX_TRAFFIC_LIMIT = 100000;

export function queryFromSearchParams(searchParams: URLSearchParams, coverage: DataCoverageRow[] = []): TrafficQuery {
  const defaults = defaultDateRangeFromCoverage(coverage);
  const region = searchParams.get("region");
  const requestedLimit = Number(searchParams.get("limit") || DEFAULT_TRAFFIC_LIMIT);
  return {
    startDate: searchParams.get("startDate") || defaults.startDate,
    endDate: searchParams.get("endDate") || defaults.endDate,
    region: region === "서울" || region === "인천" ? region : "all",
    roadName: searchParams.get("roadName") || "",
    granularity: parseGranularity(searchParams.get("granularity")),
    limit: Math.min(Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : DEFAULT_TRAFFIC_LIMIT, MAX_TRAFFIC_LIMIT)
  };
}

export function queryFromCoverage(query: TrafficQuery, coverage: DataCoverageRow): TrafficQuery {
  if (coverage.status !== "available" || !coverage.minDate || !coverage.maxDate) return query;
  return {
    ...query,
    startDate: coverage.minDate,
    endDate: coverage.maxDate,
    region: regionFromSourceName(coverage.sourceName),
    roadName: "",
    granularity: "all"
  };
}

export function trafficQueryToSearchParams(query: TrafficQuery): URLSearchParams {
  const params = new URLSearchParams();
  params.set("startDate", query.startDate);
  params.set("endDate", query.endDate);
  params.set("region", query.region);
  params.set("roadName", query.roadName);
  params.set("granularity", query.granularity);
  params.set("limit", String(query.limit));
  return params;
}

function parseGranularity(value: string | null): TrafficQuery["granularity"] {
  if (value === "5min" || value === "hour" || value === "day" || value === "realtime") return value;
  return "all";
}

function defaultDateRangeFromCoverage(coverage: DataCoverageRow[]): { startDate: string; endDate: string } {
  const available = coverage.filter((row) => row.status === "available" && row.minDate && row.maxDate);
  if (available.length !== 1) return defaultDateRange();
  return {
    startDate: available[0].minDate!,
    endDate: available[0].maxDate!
  };
}

function regionFromSourceName(sourceName: string): RegionFilter {
  if (sourceName === "seoul-urban-file" || sourceName === "seoul-topis-realtime" || sourceName === "tdata-hourly-section") return "서울";
  if (sourceName === "incheon-speed-api") return "인천";
  return "all";
}
