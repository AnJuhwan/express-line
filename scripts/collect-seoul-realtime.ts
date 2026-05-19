import { buildSeoulTrafficInfoUrl, normalizeSeoulTrafficInfoXml } from "../src/lib/collectors";
import { loadEnvFiles } from "../src/lib/env";
import { getTrafficRepository } from "../src/lib/repository";

loadEnvFiles();

const apiKey = process.env.SEOUL_OPENAPI_KEY;
if (!apiKey) {
  console.error("SEOUL_OPENAPI_KEY is required for Seoul TOPIS realtime collection.");
  process.exit(1);
}
const seoulOpenApiKey = apiKey;

const linkIds = (process.env.SEOUL_LINK_IDS ?? "1220003800")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const observations = [];
  for (const linkId of linkIds) {
    const url = buildSeoulTrafficInfoUrl({ apiKey: seoulOpenApiKey, linkId, startIndex: 1, endIndex: 5 });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Seoul TOPIS request failed: ${response.status}`);
    const xml = await response.text();
    observations.push(...normalizeSeoulTrafficInfoXml(xml, linkId));
  }

  getTrafficRepository().upsertObservations(observations);
  console.log(`Collected ${observations.length} Seoul realtime observations.`);
}
