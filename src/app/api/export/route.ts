import { observationsToCsv, observationsToWorkbookBuffer } from "@/lib/exporters";
import { queryFromSearchParams } from "@/lib/dashboard";
import { publicRoadLookupQuery, queryFreshPublicRoadTraffic, shouldUseFreshPublicRoadLookup } from "@/lib/public-data";
import { getTrafficRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const repo = getTrafficRepository();
  const query = queryFromSearchParams(url.searchParams, repo.getCoverage());
  const storedRows = repo.queryObservations(query);
  const rows =
    storedRows.length || !shouldUseFreshPublicRoadLookup(query)
      ? storedRows
      : (await queryFreshPublicRoadTraffic(publicRoadLookupQuery(query))).rows;

  if (format === "xlsx") {
    const buffer = await observationsToWorkbookBuffer(rows);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="traffic-observations.xlsx"'
      }
    });
  }

  const csv = observationsToCsv(rows);
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="traffic-observations.csv"'
    }
  });
}
