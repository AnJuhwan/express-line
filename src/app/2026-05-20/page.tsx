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
      relatedLinks={[{ href: "/", label: "5/13~5/15", title: "2026년 5월 13일부터 15일 리포트" }]}
    />
  );
}
