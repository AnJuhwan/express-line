import { NextResponse } from "next/server";
import { queryFromAllDataSearchParams } from "@/lib/dashboard";
import { getTrafficRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_WINDOW_SIZE = 500;
const MAX_WINDOW_SIZE = 2000;

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const repo = getTrafficRepository();
  const coverage = repo.getCoverage();
  const query = queryFromAllDataSearchParams(searchParams, coverage);
  const offset = parseNonNegativeInt(searchParams.get("offset"), 0);
  const windowSize = parseWindowSize(searchParams.get("windowSize"));
  const totalCount = repo.countObservations(query);
  const rows = repo.queryObservationsPage(query, { offset, limit: windowSize });
  const roadOptions = repo.getRoadOptions();

  console.log("[api/traffic/all]", {
    query,
    offset,
    windowSize,
    totalCount,
    rows: rows.length,
    firstRow: rows[0] ?? null,
    coverage
  });

  return NextResponse.json({
    query,
    rows,
    offset,
    windowSize,
    totalCount,
    coverage,
    roadOptions
  });
}

function parseWindowSize(value: string | null): number {
  return Math.min(parseNonNegativeInt(value, DEFAULT_WINDOW_SIZE) || DEFAULT_WINDOW_SIZE, MAX_WINDOW_SIZE);
}

function parseNonNegativeInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}
