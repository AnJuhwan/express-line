import { RequestedTrafficHome } from "@/components/requested-traffic-home";
import { getRequestedTrafficDataset } from "@/lib/requested-traffic-datasets";

export default function May20RequestedTrafficPage() {
  const dataset = getRequestedTrafficDataset("20260520");

  return (
    <RequestedTrafficHome
      report={dataset.report}
      fiveMinuteHref={dataset.fiveMinuteHref}
      hourlyHref={dataset.hourlyHref}
      dataLabel={dataset.dataLabel}
      relatedLinks={[
        { href: "/2026-05-20/maps", label: "지도", title: "2026년 5월 20일 막히는 구간 지도" },
        { href: "/bucheon/2026-05-20/maps", label: "부천 지도", title: "2026년 5월 20일 부천 한일시멘트 기준 구간 지도" },
        { href: "/", label: "5/13~5/15", title: "2026년 5월 13일부터 15일 리포트" }
      ]}
    />
  );
}
