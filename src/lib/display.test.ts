import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coverageMessage, displayRoadDivName, displayRoadName, displaySectionName, sourceLabel } from "./display";
import type { TrafficObservationRow } from "./types";

const baseRow: TrafficObservationRow = {
  id: 1,
  roadId: 1,
  region: "서울",
  roadName: "-",
  sectionName: "1010036500→1010036400",
  linkId: "1010046900",
  roadKind: "general_road",
  observedAt: "2026-05-19T16:05:00+09:00",
  observedDate: "2026-05-19",
  observedHour: 16,
  granularity: "realtime",
  sourceName: "its-realtime",
  speedKph: 18,
  travelTimeSeconds: 18.52,
  trafficVolume: null,
  occupancy: null,
  congestionLevel: "slow",
  congestionLabel: "서행",
  congestionMethod: "topis-threshold"
};

describe("display labels", () => {
  it("labels known data sources in Korean", () => {
    assert.equal(sourceLabel("its-realtime"), "ITS 국가교통정보센터 실시간");
    assert.equal(sourceLabel("seoul-urban-file"), "서울 열린데이터광장 도시고속도로");
    assert.equal(sourceLabel("incheon-speed-api"), "인천 공공데이터포털 통행속도");
    assert.equal(sourceLabel("tdata-hourly-section"), "서울교통빅데이터 T-DATA 1시간 구간별");
  });

  it("hides placeholder road names", () => {
    assert.equal(displayRoadName("-"), "도로명 미제공");
  });

  it("labels road divisions from explicit source names or road kind fallback", () => {
    assert.equal(displayRoadDivName({ ...baseRow, roadDivName: "도시고속도로" }), "도시고속도로");
    assert.equal(displayRoadDivName({ ...baseRow, roadKind: "general_road" }), "일반도로");
  });

  it("explains numeric ITS sections as unnamed source IDs", () => {
    assert.equal(displaySectionName(baseRow), "위치명 미제공 · ITS 구간 ID 1010046900");
  });

  it("keeps human-readable public data sections", () => {
    assert.equal(
      displaySectionName({
        ...baseRow,
        sourceName: "seoul-urban-file",
        sectionName: "한남대교→반포대교",
        linkId: "LBL2000010"
      }),
      "한남대교→반포대교"
    );
  });

  it("translates imported row count messages", () => {
    assert.equal(coverageMessage("56168 observations loaded"), "56,168건 적재됨");
    assert.equal(coverageMessage("데이터 없음"), "데이터 없음");
  });
});
