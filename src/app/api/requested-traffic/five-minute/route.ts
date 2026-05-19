import { NextResponse } from "next/server";
import requestedTrafficReport from "@/lib/requested-traffic-home-report.json";
import {
  REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE,
  loadRequestedFiveMinutePage,
  loadRequestedFiveMinuteRows,
  requestedFiveMinuteRowsToCsv
} from "@/lib/requested-traffic-five-minute";
import type { RequestedTrafficFiveMinuteRouteMeta } from "@/lib/requested-traffic-five-minute";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_WINDOW_SIZE = 2000;
const routes = (requestedTrafficReport.routes as RequestedTrafficFiveMinuteRouteMeta[]).map((route) => ({
  id: route.id,
  requestLabel: route.requestLabel,
  matchedLabel: route.matchedLabel,
  fiveMinuteRows: route.fiveMinuteRows
}));

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const routeId = searchParams.get("route") || "all";
  const format = searchParams.get("format");

  if (format === "csv") {
    const rows = loadRequestedFiveMinuteRows(routes, { routeId });
    const csv = requestedFiveMinuteRowsToCsv(rows);
    return new Response(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFileName(routeId)}"`
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
    windowSize
  });

  return NextResponse.json({
    ...page,
    routes
  });
}

function parseNonNegativeInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function csvFileName(routeId: string): string {
  const safeRouteId = /^[a-z0-9_]+$/.test(routeId) ? routeId : "all";
  return `requested-traffic-5min-${safeRouteId}.csv`;
}
