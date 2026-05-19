import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCongestedDaysByHourSummary, buildHourlyRoadSummary } from "./hourly-summary";
import type { TrafficObservationRow } from "./types";

const baseRow: TrafficObservationRow = {
  id: 1,
  roadId: 1,
  region: "서울",
  roadName: "강변북로",
  sectionName: "A-B",
  linkId: "L-1",
  roadKind: "urban_expressway",
  observedAt: "2026-05-19T00:05:00+09:00",
  observedDate: "2026-05-19",
  observedHour: 0,
  granularity: "realtime",
  sourceName: "its-realtime",
  speedKph: 40,
  travelTimeSeconds: null,
  trafficVolume: null,
  occupancy: null,
  congestionLevel: "slow",
  congestionLabel: "서행",
  congestionMethod: "topis-threshold"
};

describe("hourly road summary", () => {
  it("combines road sections into one hourly road row", () => {
    const summary = buildHourlyRoadSummary([
      baseRow,
      {
        ...baseRow,
        id: 2,
        roadId: 2,
        sectionName: "B-C",
        linkId: "L-2",
        speedKph: 20
      },
      {
        ...baseRow,
        id: 3,
        observedAt: "2026-05-19T01:00:00+09:00",
        observedHour: 1,
        speedKph: 55,
        congestionLevel: "smooth",
        congestionLabel: "원활"
      }
    ]);

    assert.equal(summary.length, 1);
    assert.equal(summary[0].roadName, "강변북로");
    assert.equal(summary[0].hours[0]?.speedKph, 30);
    assert.equal(summary[0].hours[0]?.congestionLabel, "서행");
    assert.equal(summary[0].hours[0]?.observationCount, 2);
    assert.equal(summary[0].hours[1]?.speedKph, 55);
    assert.equal(summary[0].hours[1]?.congestionLabel, "원활");
  });

  it("keeps dates separate and ignores daily rows or unnamed roads", () => {
    const summary = buildHourlyRoadSummary([
      baseRow,
      {
        ...baseRow,
        id: 4,
        observedDate: "2026-05-20",
        observedAt: "2026-05-20T00:05:00+09:00",
        speedKph: 10
      },
      {
        ...baseRow,
        id: 5,
        roadName: "-",
        speedKph: 5
      },
      {
        ...baseRow,
        id: 6,
        granularity: "day",
        observedHour: 0,
        speedKph: 60
      }
    ]);

    assert.deepEqual(
      summary.map((row) => `${row.observedDate}:${row.roadName}`),
      ["2026-05-19:강변북로", "2026-05-20:강변북로"]
    );
    assert.equal(summary[0].hours[0]?.speedKph, 40);
    assert.equal(summary[1].hours[0]?.congestionLabel, "정체");
  });
});

describe("congested days by hour summary", () => {
  it("counts congested dates by section and hour without double-counting repeated observations", () => {
    const summary = buildCongestedDaysByHourSummary([
      {
        ...baseRow,
        id: 10,
        roadName: "남부순환로",
        sectionName: "신월IC→화곡고가사거리",
        observedDate: "2026-01-02",
        observedAt: "2026-01-02T07:00:00+09:00",
        observedHour: 7,
        speedKph: 24
      },
      {
        ...baseRow,
        id: 11,
        roadName: "남부순환로",
        sectionName: "신월IC→화곡고가사거리",
        observedDate: "2026-01-02",
        observedAt: "2026-01-02T07:30:00+09:00",
        observedHour: 7,
        speedKph: 26
      },
      {
        ...baseRow,
        id: 12,
        roadName: "남부순환로",
        sectionName: "신월IC→화곡고가사거리",
        observedDate: "2026-01-03",
        observedAt: "2026-01-03T07:00:00+09:00",
        observedHour: 7,
        speedKph: 45
      },
      {
        ...baseRow,
        id: 13,
        roadName: "남부순환로",
        sectionName: "신월IC→화곡고가사거리",
        observedDate: "2026-01-03",
        observedAt: "2026-01-03T08:00:00+09:00",
        observedHour: 8,
        speedKph: 20
      }
    ]);

    assert.equal(summary.length, 1);
    assert.equal(summary[0].sectionName, "신월IC→화곡고가사거리");
    assert.equal(summary[0].maxCongestedDays, 1);
    assert.equal(summary[0].hours[7]?.observedDays, 2);
    assert.equal(summary[0].hours[7]?.congestedDays, 1);
    assert.equal(summary[0].hours[7]?.congestedRatio, 50);
    assert.equal(summary[0].hours[7]?.observationCount, 3);
    assert.equal(summary[0].hours[8]?.observedDays, 1);
    assert.equal(summary[0].hours[8]?.congestedDays, 1);
  });

  it("omits sections with no congested hours", () => {
    const summary = buildCongestedDaysByHourSummary([
      {
        ...baseRow,
        id: 14,
        roadName: "남부순환로",
        sectionName: "화곡고가사거리→신월IC",
        speedKph: 60
      }
    ]);

    assert.equal(summary.length, 0);
  });
});
