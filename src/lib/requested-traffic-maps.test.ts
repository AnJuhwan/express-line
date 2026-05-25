import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  getRequestedTrafficDataset,
  requestedTrafficRoutesForReport
} from "./requested-traffic-datasets";
import {
  BUCHEON_REQUESTED_TRAFFIC_MAP_GROUP_DEFINITIONS,
  REQUESTED_TRAFFIC_MAP_GROUP_DEFINITIONS,
  loadRequestedTrafficMapGroups
} from "./requested-traffic-maps";

const route = {
  id: "test_route",
  requestLabel: "A → C",
  matchedLabel: "A → C",
  fiveMinuteRows: 4
};

describe("requested traffic map data", () => {
  it("keeps the built-in map groups aligned with the requested May 20 two-way maps", () => {
    const dataset = getRequestedTrafficDataset("20260520");
    const routes = requestedTrafficRoutesForReport(dataset.report);
    const groups = loadRequestedTrafficMapGroups(routes, {
      baseDir: dataset.dataDir,
      startHour: 6,
      endHour: 18
    });

    assert.deepEqual(
      REQUESTED_TRAFFIC_MAP_GROUP_DEFINITIONS.map((group) => group.title),
      [
        "인천 한일시멘트 ~ 올림픽대로",
        "인천 분기점 ~ 장수IC",
        "올림픽대로 강변북로 ~ 방화대교",
        "인천 한일시멘트 ~ 강변북로"
      ]
    );
    assert.equal(groups.length, 4);
    assert.ok(groups.every((group) => group.hours.length === 13));
    assert.ok(groups.every((group) => group.directions.length === 2));
    assert.ok(groups[0].directions.some((direction) => direction.routeId === "incheon_toll_to_mokdong_underpass"));
    assert.ok(groups[1].directions.some((direction) => direction.routeId === "jangsu_ic_to_geyang_ic"));
  });

  it("builds Bucheon Hanil Cement map groups for every May 20 map bundle", () => {
    const dataset = getRequestedTrafficDataset("20260520");
    const routes = requestedTrafficRoutesForReport(dataset.report);
    const groups = loadRequestedTrafficMapGroups(routes, {
      baseDir: dataset.dataDir,
      startHour: 6,
      endHour: 18,
      groupDefinitions: BUCHEON_REQUESTED_TRAFFIC_MAP_GROUP_DEFINITIONS
    });

    assert.deepEqual(
      BUCHEON_REQUESTED_TRAFFIC_MAP_GROUP_DEFINITIONS.map((group) => group.displayLabel),
      [
        "부천 한일시멘트 ↔ 올림픽대로",
        "부천 한일시멘트 ↔ 장수IC",
        "부천 한일시멘트 ↔ 방화대교",
        "부천 한일시멘트 ↔ 강변북로"
      ]
    );
    assert.equal(groups.length, 4);
    assert.ok(groups.every((group) => group.displayLabel.startsWith("부천 한일시멘트 ↔ ")));
    assert.ok(groups.every((group) => group.hours.length === 13));
    assert.ok(groups.every((group) => group.directions.length === 2));
    assert.ok(groups[0].directions.some((direction) => direction.mapRouteId === "bucheon_hanil_to_olympic"));
    assert.ok(groups[1].directions.some((direction) => direction.mapRouteId === "jangsu_to_bucheon_hanil"));
    assert.ok(groups[2].directions.some((direction) => direction.mapRouteId === "bucheon_hanil_to_banghwa"));
    assert.ok(groups[3].directions.some((direction) => direction.mapRouteId === "gangbyeonbukro_to_bucheon_hanil"));
    assert.ok(groups[0].hours[0].directions.some((direction) => direction.requestLabel === "부천 한일시멘트 → 올림픽대로"));
    assert.ok(groups[2].hours[0].directions.some((direction) => direction.requestLabel === "방화대교 → 부천 한일시멘트"));
  });

  it("classifies each map segment by worst observed hourly congestion without exposing average speed", () => {
    const dir = mkdtempSync(join(tmpdir(), "requested-map-"));
    try {
      writeMapSourceFile(dir, route.id);

      const groups = loadRequestedTrafficMapGroups([{ ...route }], {
        baseDir: dir,
        startHour: 6,
        endHour: 7,
        groupDefinitions: [
          {
            id: "test",
            title: "테스트 구간",
            displayLabel: "테스트 구간",
            actualLabel: "A ↔ C",
            routeIds: [route.id]
          }
        ]
      });

      assert.equal(groups[0].hours.length, 2);
      const hourSix = groups[0].hours[0].directions[0];

      assert.equal(hourSix.hour, 6);
      assert.equal(hourSix.minSpeedKmh, 12);
      assert.equal(hourSix.slowSegmentCount, 1);
      assert.equal(hourSix.congestedSegmentCount, 1);
      assert.equal(hourSix.blockedSegmentCount, 2);
      assert.deepEqual(
        hourSix.blockedSections.map((section) => section.sectionName),
        ["B → C", "A → B"]
      );
      assert.deepEqual(
        hourSix.segments.map((segment) => segment.status),
        ["서행", "정체"]
      );
      assert.ok(!("avgSpeedKmh" in hourSix));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function writeMapSourceFile(dir: string, routeId: string) {
  writeFileSync(
    join(dir, `${routeId}.json`),
    JSON.stringify({
      구간목록: [
        {
          순번: 1,
          링크아이디: "a",
          도로명: "테스트로",
          시점명: "A",
          종점명: "B",
          구간명: "A → B",
          연장_m: 100
        },
        {
          순번: 2,
          링크아이디: "b",
          도로명: "테스트로",
          시점명: "B",
          종점명: "C",
          구간명: "B → C",
          연장_m: 100
        }
      ],
      오분단위자료: [
        {
          날짜: "2026-05-20",
          시간: "06:00",
          시: 6,
          링크아이디: "a",
          통행속도_kmh: 35,
          혼잡상태: "서행",
          막힘여부: true
        },
        {
          날짜: "2026-05-20",
          시간: "06:05",
          시: 6,
          링크아이디: "a",
          통행속도_kmh: 55,
          혼잡상태: "원활",
          막힘여부: false
        },
        {
          날짜: "2026-05-20",
          시간: "06:00",
          시: 6,
          링크아이디: "b",
          통행속도_kmh: 12,
          혼잡상태: "정체",
          막힘여부: true
        },
        {
          날짜: "2026-05-20",
          시간: "07:00",
          시: 7,
          링크아이디: "a",
          통행속도_kmh: 60,
          혼잡상태: "원활",
          막힘여부: false
        }
      ]
    }),
    "utf8"
  );
}
