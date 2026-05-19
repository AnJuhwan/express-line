import { NextResponse } from "next/server";
import { buildCctvVideoReport } from "@/lib/cctv";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await buildCctvVideoReport();
  return NextResponse.json(report);
}
