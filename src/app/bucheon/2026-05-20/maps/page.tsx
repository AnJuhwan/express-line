import { RequestedTrafficMaps } from "@/components/requested-traffic-maps";
import {
  getRequestedTrafficDataset,
  requestedTrafficRoutesForReport
} from "@/lib/requested-traffic-datasets";
import {
  REQUESTED_TRAFFIC_DAY_END_HOUR,
  REQUESTED_TRAFFIC_DAY_START_HOUR
} from "@/lib/requested-traffic-five-minute";
import {
  BUCHEON_REQUESTED_TRAFFIC_MAP_GROUP_DEFINITIONS,
  loadRequestedTrafficMapGroups
} from "@/lib/requested-traffic-maps";

export const runtime = "nodejs";

export default function BucheonMay20RequestedTrafficMapsPage() {
  const dataset = getRequestedTrafficDataset("20260520");
  const routes = requestedTrafficRoutesForReport(dataset.report);
  const groups = loadRequestedTrafficMapGroups(routes, {
    baseDir: dataset.dataDir,
    startHour: REQUESTED_TRAFFIC_DAY_START_HOUR,
    endHour: REQUESTED_TRAFFIC_DAY_END_HOUR,
    groupDefinitions: BUCHEON_REQUESTED_TRAFFIC_MAP_GROUP_DEFINITIONS
  });

  return (
    <RequestedTrafficMaps
      groups={groups}
      reportHref={dataset.reportHref}
      fiveMinuteHref={dataset.fiveMinuteHref}
      hourlyHref={dataset.hourlyHref}
      periodLabel={dataset.report.period}
      dataLabel={dataset.dataLabel}
      pageTitle="2026년 5월 20일 부천 한일시멘트 기준 구간 지도"
      heroCopy={`${dataset.report.period}, 오전 6시부터 오후 6시까지 부천 한일시멘트에서 올림픽대로, 장수IC, 방화대교, 강변북로로 이어지는 구간을 대한민국 실제 지도 위에 양방향으로 정리했습니다.`}
    />
  );
}
