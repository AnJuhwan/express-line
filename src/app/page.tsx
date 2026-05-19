import { TrafficDashboard } from "@/components/traffic-dashboard";
import { RiverCorridorPanel } from "@/components/river-corridor-panel";
import { queryFromSearchParams } from "@/lib/dashboard";
import { getTrafficRepository } from "@/lib/repository";
import type { RiverCorridorReport } from "@/lib/river-corridors";
import riverCorridorStaticReport from "@/lib/river-corridor-static-report.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Home() {
  const repo = getTrafficRepository();
  const coverage = repo.getCoverage();
  const query = queryFromSearchParams(new URLSearchParams(), coverage);
  const rows = repo.queryObservations(query);
  const roadOptions = repo.getRoadOptions();

  return (
    <TrafficDashboard
      initialRows={rows}
      initialCoverage={coverage}
      initialRoadOptions={roadOptions}
      initialQuery={query}
    >
      <RiverCorridorPanel report={riverCorridorStaticReport as RiverCorridorReport} />
    </TrafficDashboard>
  );
}
