import { RequestedHourlyExplorer } from "@/components/requested-hourly-explorer";
import requestedTrafficReport from "@/lib/requested-traffic-home-report.json";
import {
  REQUESTED_TRAFFIC_DAY_END_HOUR,
  REQUESTED_TRAFFIC_DAY_START_HOUR
} from "@/lib/requested-traffic-five-minute";
import type { RequestedTrafficFiveMinuteRouteMeta } from "@/lib/requested-traffic-five-minute";
import { loadRequestedHourlyPage } from "@/lib/requested-traffic-hourly";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function HourlyPage() {
  const routes = (requestedTrafficReport.routes as RequestedTrafficFiveMinuteRouteMeta[]).map((route) => ({
    id: route.id,
    requestLabel: route.requestLabel,
    matchedLabel: route.matchedLabel,
    fiveMinuteRows: route.fiveMinuteRows
  }));
  const page = loadRequestedHourlyPage(routes, {
    routeId: "all",
    startHour: REQUESTED_TRAFFIC_DAY_START_HOUR,
    endHour: REQUESTED_TRAFFIC_DAY_END_HOUR
  });

  return (
    <RequestedHourlyExplorer
      routes={routes}
      initialRows={page.rows}
      initialRouteId={page.routeId}
      initialTotalCount={page.totalCount}
      initialDataAvailable={page.dataAvailable}
      initialStartHour={page.timeWindow.startHour}
      initialEndHour={page.timeWindow.endHour}
    />
  );
}
