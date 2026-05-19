import { RequestedTrafficHome } from "@/components/requested-traffic-home";
import type { RequestedTrafficReport } from "@/components/requested-traffic-home";
import requestedTrafficReport from "@/lib/requested-traffic-home-report.json";

export default function Home() {
  return <RequestedTrafficHome report={requestedTrafficReport as RequestedTrafficReport} />;
}
