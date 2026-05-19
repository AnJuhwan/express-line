import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  flattenRequestedFiveMinuteRows,
  loadRequestedFiveMinutePage,
  requestedFiveMinuteRowsToCsv,
  selectRequestedFiveMinutePreview
} from "./requested-traffic-five-minute";

const route = {
  id: "geyang_ic_to_jangsu_ic",
  requestLabel: "계양IC → 장수IC",
  matchedLabel: "계양IC남측 → 장수IC남측"
};

const sourceRows = [
  {
    날짜: "2026-05-16",
    시간: "08:05",
    일시: "2026-05-16T08:05:00+09:00",
    링크아이디: "1670002900",
    도로명: "서울외곽순환고속도로",
    도로등급: "고속도로",
    도로권역: "인천광역시",
    시점명: "계양IC남측",
    종점명: "서운JC북측",
    구간명: "계양IC남측 → 서운JC북측",
    통행속도_kmh: 28.5,
    통행시간_초: 120,
    혼잡상태: "정체",
    막힘여부: true
  },
  {
    날짜: "2026-05-16",
    시간: "08:10",
    일시: "2026-05-16T08:10:00+09:00",
    링크아이디: "1670002400",
    도로명: "서울외곽순환고속도로",
    도로등급: "고속도로",
    도로권역: "인천광역시",
    시점명: "서운JC북측",
    종점명: "서운JC남측",
    구간명: "서운JC북측 → 서운JC남측",
    통행속도_kmh: 62.1,
    통행시간_초: 88,
    혼잡상태: "원활",
    막힘여부: false
  }
];

describe("requested traffic five-minute data", () => {
  it("adds route labels to raw 5-minute rows", () => {
    const rows = flattenRequestedFiveMinuteRows(route, sourceRows);

    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
      routeId: "geyang_ic_to_jangsu_ic",
      requestLabel: "계양IC → 장수IC",
      matchedLabel: "계양IC남측 → 장수IC남측",
      date: "2026-05-16",
      time: "08:05",
      timestamp: "2026-05-16T08:05:00+09:00",
      linkId: "1670002900",
      roadName: "서울외곽순환고속도로",
      roadRank: "고속도로",
      roadArea: "인천광역시",
      fromName: "계양IC남측",
      toName: "서운JC북측",
      sectionName: "계양IC남측 → 서운JC북측",
      speedKmh: 28.5,
      travelTimeSeconds: 120,
      congestionLabel: "정체",
      blocked: true
    });
  });

  it("selects a bounded preview per route while preserving 5-minute rows", () => {
    const rows = selectRequestedFiveMinutePreview(
      [
        { route, sourceRows },
        {
          route: { id: "jangsu_ic_to_geyang_ic", requestLabel: "장수IC → 계양IC", matchedLabel: "장수IC남측 → 계양IC남측" },
          sourceRows
        }
      ],
      1
    );

    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((row) => row.routeId),
      ["geyang_ic_to_jangsu_ic", "jangsu_ic_to_geyang_ic"]
    );
    assert.deepEqual(
      rows.map((row) => row.time),
      ["08:05", "08:05"]
    );
  });

  it("exports every 5-minute row as CSV", () => {
    const rows = flattenRequestedFiveMinuteRows(route, sourceRows);
    const csv = requestedFiveMinuteRowsToCsv(rows);

    assert.equal(
      csv.split("\n")[0],
      "요청구간,실제매칭구간,날짜,시간,일시,링크아이디,도로명,도로등급,도로권역,시점명,종점명,구간명,통행속도(km/h),통행시간(초),혼잡상태,막힘여부"
    );
    assert.match(csv, /계양IC → 장수IC,계양IC남측 → 장수IC남측,2026-05-16,08:05/);
    assert.match(csv, /서운JC북측 → 서운JC남측,62.1,88,원활,false/);
    assert.equal(csv.split("\n").length, 3);
  });

  it("returns only the requested server page across route files", () => {
    const dir = mkdtempSync(join(tmpdir(), "requested-5min-"));
    try {
      writeSourceFile(dir, "geyang_ic_to_jangsu_ic", sourceRows);
      writeSourceFile(dir, "jangsu_ic_to_geyang_ic", [
        {
          ...sourceRows[0],
          시간: "09:00",
          링크아이디: "1663185400",
          구간명: "장수IC남측 → 장수IC북측"
        }
      ]);

      const page = loadRequestedFiveMinutePage(
        [
          { ...route, fiveMinuteRows: 2 },
          { id: "jangsu_ic_to_geyang_ic", requestLabel: "장수IC → 계양IC", matchedLabel: "장수IC남측 → 계양IC남측", fiveMinuteRows: 1 }
        ],
        { baseDir: dir, offset: 1, windowSize: 2 }
      );

      assert.equal(page.totalCount, 3);
      assert.equal(page.rows.length, 2);
      assert.deepEqual(
        page.rows.map((row) => `${row.routeId}:${row.time}`),
        ["geyang_ic_to_jangsu_ic:08:10", "jangsu_ic_to_geyang_ic:09:00"]
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function writeSourceFile(dir: string, routeId: string, rows: typeof sourceRows) {
  writeFileSync(join(dir, `${routeId}.json`), JSON.stringify({ 오분단위자료: rows }), "utf8");
}
