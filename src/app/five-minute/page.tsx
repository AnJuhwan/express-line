import { RequestedFiveMinuteExplorer } from "@/components/requested-five-minute-explorer";
import {
  getRequestedTrafficDataset,
  requestedTrafficRoutesForReport
} from "@/lib/requested-traffic-datasets";
import {
  REQUESTED_TRAFFIC_DAY_END_HOUR,
  REQUESTED_TRAFFIC_DAY_START_HOUR,
  REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE,
  loadRequestedFiveMinutePage
} from "@/lib/requested-traffic-five-minute";

export const runtime = "nodejs";

export default function FiveMinutePage() {
  const dataset = getRequestedTrafficDataset();
  const routes = requestedTrafficRoutesForReport(dataset.report);
  const page = loadRequestedFiveMinutePage(routes, {
    routeId: "all",
    offset: 0,
    windowSize: REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE,
    baseDir: dataset.dataDir,
    startHour: REQUESTED_TRAFFIC_DAY_START_HOUR,
    endHour: REQUESTED_TRAFFIC_DAY_END_HOUR
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
      initialStartHour={page.timeWindow.startHour}
      initialEndHour={page.timeWindow.endHour}
      datasetId={dataset.apiDatasetParam}
      reportHref={dataset.reportHref}
      hourlyHref={dataset.hourlyHref}
      periodLabel={dataset.report.period}
    />
  );
}
