import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  appendRealtimeRecords,
  currentKstHalfHourSlot,
  formatKstMinute,
  matchesRealtimeTargets,
  monthlyNdjsonPath,
  toRealtimeNdjsonRecord
} from "./realtime-ndjson";
import type { NormalizedTrafficObservation } from "./types";

const baseRow: NormalizedTrafficObservation = {
  region: "서울",
  roadName: "올림픽대로",
  sectionName: "방화대교남단→가양IC",
  linkId: "OLY-1",
  roadKind: "urban_expressway",
  roadDivName: "도시고속도로",
  observedAt: "2026-05-19T00:30:00+09:00",
  observedDate: "2026-05-19",
  observedHour: 0,
  granularity: "realtime",
  sourceName: "its-realtime",
  speedKph: 42.5,
  travelTimeSeconds: 120,
  trafficVolume: null,
  occupancy: null,
  congestionLevel: "slow",
  congestionLabel: "서행",
  congestionMethod: "topis-threshold"
};

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("realtime NDJSON helpers", () => {
  it("formats timestamps in the requested KST minute format", () => {
    assert.equal(formatKstMinute("2026-05-18T15:30:00.000Z"), "2026-05-19 00:30");
    assert.equal(currentKstHalfHourSlot(new Date("2026-05-18T15:44:00.000Z")), "2026-05-19 00:30");
    assert.equal(currentKstHalfHourSlot(new Date("2026-05-18T15:05:00.000Z")), "2026-05-19 00:00");
  });

  it("matches the default requested river roads", () => {
    assert.equal(
      matchesRealtimeTargets(baseRow, {
        roads: ["올림픽대로", "강변북로"],
        sectionKeywords: [],
        linkIds: [],
        regions: ["서울"]
      }),
      true
    );
    assert.equal(
      matchesRealtimeTargets({ ...baseRow, roadName: "남부순환로" }, {
        roads: ["올림픽대로", "강변북로"],
        sectionKeywords: [],
        linkIds: [],
        regions: ["서울"]
      }),
      false
    );
  });

  it("appends monthly NDJSON records without duplicating the same collection slot", () => {
    const dir = mkdtempSync(join(tmpdir(), "traffic-ndjson-"));
    tempDirs.push(dir);
    const collectedAt = "2026-05-19 00:30";
    const filePath = monthlyNdjsonPath(dir, collectedAt);
    const record = toRealtimeNdjsonRecord(baseRow, collectedAt);

    assert.equal(appendRealtimeRecords(filePath, [record]), 1);
    assert.equal(appendRealtimeRecords(filePath, [record]), 0);

    const lines = readFileSync(filePath, "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).observedAt, "2026-05-19 00:30");
  });
});
