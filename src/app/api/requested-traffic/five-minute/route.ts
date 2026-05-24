import { NextResponse } from "next/server";
import {
  getRequestedTrafficDataset,
  requestedTrafficRoutesForReport
} from "@/lib/requested-traffic-datasets";
import {
  REQUESTED_TRAFFIC_DAY_END_HOUR,
  REQUESTED_TRAFFIC_DAY_START_HOUR,
  REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE,
  loadRequestedFiveMinutePage,
  loadRequestedFiveMinuteRows,
  requestedFiveMinuteRowsToCsv
} from "@/lib/requested-traffic-five-minute";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_WINDOW_SIZE = 2000;
const IMMUTABLE_DATA_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable"
};

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const dataset = getRequestedTrafficDataset(searchParams.get("dataset"));
  const routes = requestedTrafficRoutesForReport(dataset.report);
  const routeId = searchParams.get("route") || "all";
  const format = searchParams.get("format");
  const startHour = parseHour(searchParams.get("startHour"), REQUESTED_TRAFFIC_DAY_START_HOUR);
  const endHour = parseHour(searchParams.get("endHour"), REQUESTED_TRAFFIC_DAY_END_HOUR);

  if (format === "csv") {
    const rows = loadRequestedFiveMinuteRows(routes, { routeId, baseDir: dataset.dataDir, startHour, endHour });
    const csv = requestedFiveMinuteRowsToCsv(rows);
    return new Response(`\uFEFF${csv}`, {
      headers: {
        ...IMMUTABLE_DATA_HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFileName(dataset.id, routeId, startHour, endHour)}"`
      }
    });
  }

  const offset = parseNonNegativeInt(searchParams.get("offset"), 0);
  const windowSize = Math.min(
    parseNonNegativeInt(searchParams.get("windowSize"), REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE),
    MAX_WINDOW_SIZE
  );
  const page = loadRequestedFiveMinutePage(routes, {
    routeId,
    offset,
    windowSize,
    baseDir: dataset.dataDir,
    startHour,
    endHour
  });

  return NextResponse.json(
    {
      ...page,
      routes
    },
    { headers: IMMUTABLE_DATA_HEADERS }
  );
}

function parseNonNegativeInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function parseHour(value: string | null, fallback: number): number {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(23, Math.max(0, Math.floor(parsed)));
}

function csvFileName(datasetId: string, routeId: string, startHour: number, endHour: number): string {
  const safeRouteId = /^[a-z0-9_]+$/.test(routeId) ? routeId : "all";
  const safeDatasetId = /^[a-z0-9_]+$/.test(datasetId) ? datasetId : "default";
  return `requested-traffic-5min-${safeDatasetId}-${safeRouteId}-${padHour(startHour)}-${padHour(endHour)}.csv`;
}

function padHour(hour: number): string {
  return String(hour).padStart(2, "0");
}
