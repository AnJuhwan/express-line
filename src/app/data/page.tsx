import { TrafficDataExplorer } from "@/components/traffic-data-explorer";
import { queryFromAllDataSearchParams } from "@/lib/dashboard";
import { getTrafficRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INITIAL_WINDOW_SIZE = 500;

export default async function DataPage() {
  const repo = getTrafficRepository();
  const coverage = repo.getCoverage();
  const query = queryFromAllDataSearchParams(new URLSearchParams(), coverage);
  const totalCount = repo.countObservations(query);
  const rows = repo.queryObservationsPage(query, { offset: 0, limit: INITIAL_WINDOW_SIZE });
  const roadOptions = repo.getRoadOptions();

  return (
    <TrafficDataExplorer
      initialRows={rows}
      initialCoverage={coverage}
      initialRoadOptions={roadOptions}
      initialQuery={query}
      initialTotalCount={totalCount}
      initialOffset={0}
      initialWindowSize={INITIAL_WINDOW_SIZE}
    />
  );
}
