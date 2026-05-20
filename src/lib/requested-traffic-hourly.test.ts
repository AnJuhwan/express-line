import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  loadRequestedHourlyPage,
  loadRequestedHourlyRows,
  requestedHourlyRowsToCsv
} from "./requested-traffic-hourly";

const route = {
  id: "geyang_ic_to_jangsu_ic",
  requestLabel: "계양IC → 장수IC",
  matchedLabel: "계양IC남측 → 장수IC남측"
};

describe("requested traffic hourly data", () => {
  it("loads only hourly rows inside the requested hour window", () => {
    const dir = mkdtempSync(join(tmpdir(), "requested-hourly-"));
    try {
      writeHourlySourceFile(dir, route.id);

      const rows = loadRequestedHourlyRows([{ ...route, fiveMinuteRows: 4 }], {
        baseDir: dir,
        startHour: 6,
        endHour: 18
      });

      assert.deepEqual(
        rows.map((row) => row.label),
        ["06:00", "18:00"]
      );
      assert.equal(rows[0].requestLabel, "계양IC → 장수IC");
      assert.equal(rows[0].avgSpeedKmh, 62.5);
      assert.equal(rows[0].smoothObservationCount, 9);
      assert.equal(rows[1].status, "정체");
      assert.equal(rows[1].smoothObservationCount, 5);

      const page = loadRequestedHourlyPage([{ ...route, fiveMinuteRows: 4 }], {
        baseDir: dir,
        startHour: 6,
        endHour: 18
      });
      assert.equal(page.totalCount, 2);
      assert.deepEqual(page.timeWindow, { startHour: 6, endHour: 18 });

      const csv = requestedHourlyRowsToCsv(rows);
      assert.match(csv, /^요청구간,실제매칭구간,날짜,시간대/);
      assert.doesNotMatch(csv.split("\n")[0], /막힘/);
      assert.match(csv.split("\n")[0], /원활관측수/);
      assert.match(csv, /2026-05-13,06:00,62.5/);
      assert.equal(csv.split("\n").length, 3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function writeHourlySourceFile(dir: string, routeId: string) {
  writeFileSync(
    join(dir, `${routeId}.json`),
    JSON.stringify({
      시간별요약: [
        {
          날짜: "2026-05-13",
          시: 5,
          시간대: "05:00",
          평균속도_kmh: 72.1,
          최저속도_kmh: 55.5,
          시간대혼잡상태: "원활",
          막힘여부: false,
          자료수: 12,
          관측링크수: 1,
          서행관측수: 0,
          정체관측수: 0,
          서행구간수: 0,
          정체구간수: 0
        },
        {
          날짜: "2026-05-13",
          시: 6,
          시간대: "06:00",
          평균속도_kmh: 62.5,
          최저속도_kmh: 38.2,
          시간대혼잡상태: "서행",
          막힘여부: true,
          자료수: 12,
          관측링크수: 1,
          서행관측수: 3,
          정체관측수: 0,
          서행구간수: 1,
          정체구간수: 0
        },
        {
          날짜: "2026-05-13",
          시: 18,
          시간대: "18:00",
          평균속도_kmh: 24.1,
          최저속도_kmh: 12.3,
          시간대혼잡상태: "정체",
          막힘여부: true,
          자료수: 12,
          관측링크수: 1,
          서행관측수: 2,
          정체관측수: 5,
          서행구간수: 1,
          정체구간수: 1
        },
        {
          날짜: "2026-05-13",
          시: 19,
          시간대: "19:00",
          평균속도_kmh: 50.1,
          최저속도_kmh: 42.4,
          시간대혼잡상태: "원활",
          막힘여부: false,
          자료수: 12,
          관측링크수: 1,
          서행관측수: 0,
          정체관측수: 0,
          서행구간수: 0,
          정체구간수: 0
        }
      ]
    }),
    "utf8"
  );
}
