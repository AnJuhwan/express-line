import {
  buildItsTrafficInfoUrl,
  buildSeoulTrafficInfoUrl,
  extractItsTrafficInfoXmlItems,
  extractPublicDataItems,
  normalizeItsTrafficInfoItems,
  normalizeSeoulTrafficInfoXml
} from "../src/lib/collectors";
import { loadEnvFiles } from "../src/lib/env";
import {
  DEFAULT_REALTIME_TARGET_ROADS,
  appendRealtimeRecords,
  currentKstHalfHourSlot,
  matchesRealtimeTargets,
  monthlyNdjsonPath,
  parseCsvList,
  toRealtimeNdjsonRecord
} from "../src/lib/realtime-ndjson";
import type { NormalizedTrafficObservation } from "../src/lib/types";

loadEnvFiles();

const boxes = {
  "서울": {
    region: "서울" as const,
    minX: 126.76,
    maxX: 127.2,
    minY: 37.42,
    maxY: 37.7
  },
  "인천": {
    region: "인천" as const,
    minX: 126.35,
    maxX: 126.85,
    minY: 37.3,
    maxY: 37.65
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const collectedAt = getArg("--collected-at") ?? currentKstHalfHourSlot();
  const outputDir = getArg("--output-dir") ?? process.env.TRAFFIC_NDJSON_DIR ?? "data";
  const targetRoads = parseCsvList(process.env.TRAFFIC_TARGET_ROADS).length
    ? parseCsvList(process.env.TRAFFIC_TARGET_ROADS)
    : [...DEFAULT_REALTIME_TARGET_ROADS];
  const targetRegions = parseRegions(process.env.TRAFFIC_TARGET_REGIONS ?? "서울");
  const targetSectionKeywords = parseCsvList(process.env.TRAFFIC_TARGET_SECTION_KEYWORDS);
  const targetLinkIds = parseCsvList(process.env.TRAFFIC_TARGET_LINK_IDS);

  const [itsRows, topisRows] = await Promise.all([
    collectItsRows(targetRegions),
    collectSeoulTopisRows()
  ]);

  const matchedItsRows = itsRows.filter((row) =>
    matchesRealtimeTargets(row, {
      roads: targetRoads,
      sectionKeywords: targetSectionKeywords,
      linkIds: targetLinkIds,
      regions: targetRegions
    })
  );
  const matchedTopisRows = topisRows.filter((row) => !targetLinkIds.length || targetLinkIds.includes(row.linkId));
  const records = [...matchedItsRows, ...matchedTopisRows].map((row) => toRealtimeNdjsonRecord(row, collectedAt));
  const filePath = monthlyNdjsonPath(outputDir, collectedAt);
  const appended = appendRealtimeRecords(filePath, records);

  console.log(
    JSON.stringify(
      {
        collectedAt,
        output: filePath,
        targets: {
          roads: targetRoads,
          regions: targetRegions,
          sectionKeywords: targetSectionKeywords,
          linkIds: targetLinkIds
        },
        rawRows: {
          its: itsRows.length,
          topis: topisRows.length
        },
        matchedRows: records.length,
        appendedRows: appended
      },
      null,
      2
    )
  );
}

async function collectItsRows(regions: Array<"서울" | "인천">): Promise<NormalizedTrafficObservation[]> {
  const apiKey = process.env.ITS_API_KEY;
  if (!apiKey) {
    console.warn("ITS_API_KEY is not set. Skipping ITS realtime collection.");
    return [];
  }

  const rows: NormalizedTrafficObservation[] = [];
  for (const region of regions) {
    const url = buildItsTrafficInfoUrl({ apiKey, ...boxes[region] });
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`ITS request failed for ${region}: ${response.status}`);
    const text = await response.text();
    const items = text.trim().startsWith("<") ? extractItsTrafficInfoXmlItems(text) : extractPublicDataItems(JSON.parse(text));
    rows.push(...normalizeItsTrafficInfoItems(items, region));
  }

  return rows;
}

async function collectSeoulTopisRows(): Promise<NormalizedTrafficObservation[]> {
  const apiKey = process.env.SEOUL_OPENAPI_KEY;
  const linkIds = parseCsvList(process.env.SEOUL_LINK_IDS);
  if (!apiKey || !linkIds.length) {
    console.warn("SEOUL_OPENAPI_KEY or SEOUL_LINK_IDS is not set. Skipping Seoul TOPIS link collection.");
    return [];
  }

  const rows: NormalizedTrafficObservation[] = [];
  for (const linkId of linkIds) {
    const url = buildSeoulTrafficInfoUrl({ apiKey, linkId, startIndex: 1, endIndex: 5 });
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Seoul TOPIS request failed for ${linkId}: ${response.status}`);
    rows.push(...normalizeSeoulTrafficInfoXml(await response.text(), linkId));
  }
  return rows;
}

function parseRegions(value: string): Array<"서울" | "인천"> {
  const regions = parseCsvList(value).filter((region): region is "서울" | "인천" => region === "서울" || region === "인천");
  return regions.length ? regions : ["서울"];
}

function getArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}
