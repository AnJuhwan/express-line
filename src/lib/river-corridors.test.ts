import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RIVER_CORRIDORS,
  RIVER_CORRIDOR_REPORT_END_DATE,
  RIVER_CORRIDOR_REPORT_START_DATE,
  buildRiverCorridorReport
} from "./river-corridors";
import type { TrafficObservationRow } from "./types";

const baseRow: TrafficObservationRow = {
  id: 1,
  roadId: 1,
  region: "서울",
  roadName: "올림픽대로",
  sectionName: "방화대교남단(88JC)→가양IC",
  linkId: "OLY-1",
  roadKind: "urban_expressway",
  roadDivName: "도시고속도로",
  observedAt: "2026-01-01T08:00:00+09:00",
  observedDate: "2026-01-01",
  observedHour: 8,
  granularity: "hour",
  sourceName: "tdata-hourly-section",
  speedKph: 55,
  travelTimeSeconds: null,
  trafficVolume: null,
  occupancy: null,
  congestionLevel: "smooth",
  congestionLabel: "원활",
  congestionMethod: "topis-threshold"
};

describe("river corridor report", () => {
  it("builds one date row per requested day and marks missing hours", () => {
    const report = buildRiverCorridorReport([], {
      startDate: "2026-01-01",
      endDate: "2026-01-02"
    });

    assert.equal(report.startDate, "2026-01-01");
    assert.equal(report.endDate, "2026-01-02");
    assert.equal(report.corridors.length, 2);
    assert.equal(report.corridors[0].days.length, 2);
    assert.equal(report.corridors[0].days[0].hours.length, 24);
    assert.equal(report.corridors[0].days[0].hours[8].status, "데이터없음");
    assert.equal(report.corridors[0].days[0].hours[8].observedSectionCount, 0);
  });

  it("summarizes a corridor hour with congested sections taking priority", () => {
    const report = buildRiverCorridorReport(
      [
        baseRow,
        {
          ...baseRow,
          id: 2,
          roadId: 2,
          sectionName: "가양IC→가양대교남단",
          linkId: "OLY-2",
          speedKph: 24,
          congestionLevel: "congested",
          congestionLabel: "정체"
        }
      ],
      {
        startDate: "2026-01-01",
        endDate: "2026-01-01"
      }
    );

    const cell = report.corridors[0].days[0].hours[8];

    assert.equal(cell.status, "정체");
    assert.equal(cell.avgSpeedKph, 39.5);
    assert.equal(cell.observedSectionCount, 2);
    assert.deepEqual(cell.smoothSections, ["방화대교남단(88JC)→가양IC"]);
    assert.deepEqual(cell.congestedSections, ["가양IC→가양대교남단"]);
  });

  it("uses the latest available May 6 to May 8 window by default", () => {
    const report = buildRiverCorridorReport([]);

    assert.equal(report.startDate, RIVER_CORRIDOR_REPORT_START_DATE);
    assert.equal(report.endDate, RIVER_CORRIDOR_REPORT_END_DATE);
    assert.equal(report.corridors[0].days[0].date, "2026-05-06");
    assert.equal(report.corridors[0].days.at(-1)?.date, "2026-05-08");
  });

  it("keeps only the requested river corridors from Banghwa Bridge", () => {
    assert.deepEqual(
      RIVER_CORRIDORS.map((corridor) => [corridor.roadName, corridor.requestLabel]),
      [
        ["올림픽대로", "방화대교→잠실대교"],
        ["강변북로", "방화대교→천호대교"]
      ]
    );
    assert.deepEqual(RIVER_CORRIDORS[0].sections.slice(0, 3), [
      "방화대교남단(88JC)→가양IC",
      "가양IC→가양대교남단",
      "가양대교남단→염창IC"
    ]);
    assert.equal(RIVER_CORRIDORS[0].sections.at(-1), "종합운동장JC→잠실대교남단");
    assert.deepEqual(RIVER_CORRIDORS[1].sections.slice(0, 3), [
      "방화대교북단→가양대교북단",
      "가양대교북단→노을공원",
      "노을공원→월드컵대교북단"
    ]);
    assert.equal(RIVER_CORRIDORS[1].sections.at(-1), "올림픽대교북단→천호대교북단");
  });
});
