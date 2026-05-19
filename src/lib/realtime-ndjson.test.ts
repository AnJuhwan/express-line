import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  DEFAULT_REALTIME_TARGET_REGIONS,
  DEFAULT_REALTIME_TARGET_ROADS,
  appendRealtimeRecords,
  currentKstHalfHourSlot,
  formatKstMinute,
  loadRealtimeNdjsonObservations,
  matchesRealtimeTargets,
  monthlyNdjsonPath,
  realtimeRecordToObservation,
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
  it("defaults realtime collection to the requested Seoul and Incheon roads", () => {
    assert.deepEqual([...DEFAULT_REALTIME_TARGET_REGIONS], ["서울", "인천"]);
    assert.ok(DEFAULT_REALTIME_TARGET_ROADS.includes("올림픽대로"));
    assert.ok(DEFAULT_REALTIME_TARGET_ROADS.includes("강변북로"));
    assert.ok(DEFAULT_REALTIME_TARGET_ROADS.includes("수도권제1순환고속도로"));
    assert.ok(DEFAULT_REALTIME_TARGET_ROADS.includes("남부순환로"));
    assert.ok(DEFAULT_REALTIME_TARGET_ROADS.includes("신월여의지하도로"));
  });

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

  it("converts committed realtime NDJSON records back into normalized observations", () => {
    const record = toRealtimeNdjsonRecord(
      {
        ...baseRow,
        region: "인천",
        roadName: "수도권제1순환고속도로",
        sectionName: "2180134101→2180134201",
        linkId: "2180386601",
        observedAt: "2026-05-19T22:10:00+09:00",
        congestionMethod: "threshold-derived"
      },
      "2026-05-19 22:00"
    );

    const row = realtimeRecordToObservation(record);

    assert.equal(row.region, "인천");
    assert.equal(row.roadName, "수도권제1순환고속도로");
    assert.equal(row.observedAt, "2026-05-19T22:10:00+09:00");
    assert.equal(row.observedDate, "2026-05-19");
    assert.equal(row.observedHour, 22);
    assert.equal(row.congestionMethod, "threshold-derived");
  });

  it("loads monthly realtime NDJSON files while tolerating older records", () => {
    const dir = mkdtempSync(join(tmpdir(), "traffic-ndjson-"));
    tempDirs.push(dir);
    const filePath = monthlyNdjsonPath(dir, "2026-05-19 22:00");
    appendRealtimeRecords(filePath, [
      {
        collectedAt: "2026-05-19 22:00",
        observedAt: "2026-05-19 21:55",
        region: "서울",
        roadName: "남부순환로",
        sectionName: "신월IC→화곡고가사거리",
        linkId: "1140022200",
        roadKind: "urban_expressway",
        roadDivName: "도시고속도로",
        speedKph: 18,
        travelTimeSeconds: null,
        trafficVolume: null,
        occupancy: null,
        congestionLevel: "congested",
        congestionLabel: "정체",
        status: "정체",
        sourceName: "its-realtime",
        granularity: "realtime"
      }
    ]);

    const rows = loadRealtimeNdjsonObservations(dir);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].sectionName, "신월IC→화곡고가사거리");
    assert.equal(rows[0].observedAt, "2026-05-19T21:55:00+09:00");
    assert.equal(rows[0].congestionMethod, "topis-threshold");
  });
});
