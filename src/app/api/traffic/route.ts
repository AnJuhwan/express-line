import { NextResponse } from "next/server";
import { queryFromSearchParams } from "@/lib/dashboard";
import { publicRoadLookupQuery, queryFreshPublicRoadTraffic, shouldUseFreshPublicRoadLookup } from "@/lib/public-data";
import { getTrafficRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const repo = getTrafficRepository();
  const coverage = repo.getCoverage();
  const query = queryFromSearchParams(new URL(request.url).searchParams, coverage);
  const rows = repo.queryObservations(query);
  const roadOptions = repo.getRoadOptions();

  if (!rows.length && shouldUseFreshPublicRoadLookup(query)) {
    const publicQuery = publicRoadLookupQuery(query);
    const payload = await queryFreshPublicRoadTraffic(publicQuery);

    console.log("[api/traffic public-road]", {
      query: publicQuery,
      rows: payload.rows.length,
      firstRow: payload.rows[0] ?? null,
      coverage: payload.coverage
    });

    return NextResponse.json({
      query: publicQuery,
      rows: payload.rows,
      coverage: payload.coverage,
      roadOptions: payload.roadOptions
    });
  }

  console.log("[api/traffic]", {
    query,
    rows: rows.length,
    firstRow: rows[0] ?? null,
    coverage
  });

  return NextResponse.json({
    query,
    rows,
    coverage,
    roadOptions
  });
}
