import { RequestedFiveMinuteExplorer } from "@/components/requested-five-minute-explorer";
import requestedTrafficReport from "@/lib/requested-traffic-home-report.json";
import {
  REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE,
  loadRequestedFiveMinutePage
} from "@/lib/requested-traffic-five-minute";
import type { RequestedTrafficFiveMinuteRouteMeta } from "@/lib/requested-traffic-five-minute";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function FiveMinutePage() {
  const routes = (requestedTrafficReport.routes as RequestedTrafficFiveMinuteRouteMeta[]).map((route) => ({
    id: route.id,
    requestLabel: route.requestLabel,
    matchedLabel: route.matchedLabel,
    fiveMinuteRows: route.fiveMinuteRows
  }));
  const page = loadRequestedFiveMinutePage(routes, {
    routeId: "all",
    offset: 0,
    windowSize: REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE
  });

  return (
    <RequestedFiveMinuteExplorer
      routes={routes}
      initialRows={page.rows}
      initialRouteId={page.routeId}
      initialOffset={page.offset}
      initialWindowSize={page.windowSize}
      initialTotalCount={page.totalCount}
      initialDataAvailable={page.dataAvailable}
    />
  );
}
