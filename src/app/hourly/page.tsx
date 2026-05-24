import { RequestedHourlyExplorer } from "@/components/requested-hourly-explorer";
import {
  getRequestedTrafficDataset,
  requestedTrafficRoutesForReport
} from "@/lib/requested-traffic-datasets";
import {
  REQUESTED_TRAFFIC_DAY_END_HOUR,
  REQUESTED_TRAFFIC_DAY_START_HOUR
} from "@/lib/requested-traffic-five-minute";
import { loadRequestedHourlyPage } from "@/lib/requested-traffic-hourly";

export const runtime = "nodejs";

export default function HourlyPage() {
  const dataset = getRequestedTrafficDataset();
  const routes = requestedTrafficRoutesForReport(dataset.report);
  const page = loadRequestedHourlyPage(routes, {
    routeId: "all",
    baseDir: dataset.dataDir,
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
      datasetId={dataset.apiDatasetParam}
      reportHref={dataset.reportHref}
      fiveMinuteHref={dataset.fiveMinuteHref}
      periodLabel={dataset.report.period}
    />
  );
}
