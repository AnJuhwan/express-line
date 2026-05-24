import { RequestedTrafficMaps } from "@/components/requested-traffic-maps";
import {
  getRequestedTrafficDataset,
  requestedTrafficRoutesForReport
} from "@/lib/requested-traffic-datasets";
import {
  REQUESTED_TRAFFIC_DAY_END_HOUR,
  REQUESTED_TRAFFIC_DAY_START_HOUR
} from "@/lib/requested-traffic-five-minute";
import { loadRequestedTrafficMapGroups } from "@/lib/requested-traffic-maps";

export const runtime = "nodejs";

export default function May20RequestedTrafficMapsPage() {
  const dataset = getRequestedTrafficDataset("20260520");
  const routes = requestedTrafficRoutesForReport(dataset.report);
  const groups = loadRequestedTrafficMapGroups(routes, {
    baseDir: dataset.dataDir,
    startHour: REQUESTED_TRAFFIC_DAY_START_HOUR,
    endHour: REQUESTED_TRAFFIC_DAY_END_HOUR
  });

  return (
    <RequestedTrafficMaps
      groups={groups}
      reportHref={dataset.reportHref}
      fiveMinuteHref={dataset.fiveMinuteHref}
      hourlyHref={dataset.hourlyHref}
      periodLabel={dataset.report.period}
      dataLabel={dataset.dataLabel}
    />
  );
}
