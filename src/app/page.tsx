import { CctvVideoPanel } from "@/components/cctv-video-panel";
import { RiverCorridorPanel } from "@/components/river-corridor-panel";
import { buildCctvVideoReport } from "@/lib/cctv";
import type { RiverCorridorReport } from "@/lib/river-corridors";
import riverCorridorStaticReport from "@/lib/river-corridor-static-report.json";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cctvReport = await buildCctvVideoReport();
  const riverCorridorReport = riverCorridorStaticReport as RiverCorridorReport;

  return (
    <main className="dashboard-shell">
      <CctvVideoPanel report={cctvReport} />
      <RiverCorridorPanel report={riverCorridorReport} />
    </main>
  );
}
