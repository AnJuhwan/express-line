import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { observationsToCsv, observationsToWorkbookBuffer } from "./exporters";
import type { TrafficObservationRow } from "./types";

const rows: TrafficObservationRow[] = [
  {
    id: 1,
    roadId: 1,
    region: "서울",
    roadName: "올림픽대로",
    sectionName: "한남대교-반포대교",
    linkId: "OLY-1",
    roadKind: "urban_expressway",
    observedAt: "2026-05-01T09:00:00+09:00",
    observedDate: "2026-05-01",
    observedHour: 9,
    granularity: "hour",
    sourceName: "sample",
    speedKph: 21.4,
    travelTimeSeconds: null,
    trafficVolume: 88,
    occupancy: null,
    congestionLevel: "congested",
    congestionLabel: "정체",
    congestionMethod: "topis-threshold"
  }
];

describe("exporters", () => {
  it("exports observations as CSV using the same visible fields as the table", () => {
    const csv = observationsToCsv(rows);

    assert.equal(
      csv.split("\n")[0],
      "날짜,시간,지역,도로명,도로구분,측정 구간(시작→끝),속도(km/h),교통량,혼잡상태,원천,단위"
    );
    assert.match(csv, /2026-05-01,09,서울,올림픽대로,도시고속도로,한남대교-반포대교,21.4,88,정체,샘플 데이터,hour/);
  });

  it("exports observations as a non-empty XLSX workbook buffer", async () => {
    const buffer = await observationsToWorkbookBuffer(rows);

    assert.ok(buffer.byteLength > 1000);
  });
});
