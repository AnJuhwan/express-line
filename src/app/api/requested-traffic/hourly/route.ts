import { NextResponse } from "next/server";
import requestedTrafficReport from "@/lib/requested-traffic-home-report.json";
import {
  REQUESTED_TRAFFIC_DAY_END_HOUR,
  REQUESTED_TRAFFIC_DAY_START_HOUR
} from "@/lib/requested-traffic-five-minute";
import type { RequestedTrafficFiveMinuteRouteMeta } from "@/lib/requested-traffic-five-minute";
import {
  loadRequestedHourlyPage,
  loadRequestedHourlyRows,
  requestedHourlyRowsToCsv
} from "@/lib/requested-traffic-hourly";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const startHour = parseHour(searchParams.get("startHour"), REQUESTED_TRAFFIC_DAY_START_HOUR);
  const endHour = parseHour(searchParams.get("endHour"), REQUESTED_TRAFFIC_DAY_END_HOUR);

  if (format === "csv") {
    const rows = loadRequestedHourlyRows(routes, { routeId, startHour, endHour });
    const csv = requestedHourlyRowsToCsv(rows);
    return new Response(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFileName(routeId, startHour, endHour)}"`
      }
    });
  }

  const page = loadRequestedHourlyPage(routes, {
    routeId,
    startHour,
    endHour
  });

  return NextResponse.json({
    ...page,
    routes
  });
}

function parseHour(value: string | null, fallback: number): number {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(23, Math.max(0, Math.floor(parsed)));
}

function csvFileName(routeId: string, startHour: number, endHour: number): string {
  const safeRouteId = /^[a-z0-9_]+$/.test(routeId) ? routeId : "all";
  return `requested-traffic-hourly-${safeRouteId}-${padHour(startHour)}-${padHour(endHour)}.csv`;
}

function padHour(hour: number): string {
  return String(hour).padStart(2, "0");
}
