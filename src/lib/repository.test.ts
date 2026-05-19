import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createTrafficRepository, defaultTrafficDbPath } from "./repository";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("traffic repository", () => {
  it("uses a writable temporary database path on Vercel", () => {
    const originalVercel = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      assert.match(defaultTrafficDbPath(), /traffic\.sqlite$/);
      assert.ok(defaultTrafficDbPath().startsWith(tmpdir()));
    } finally {
      if (originalVercel == null) delete process.env.VERCEL;
      else process.env.VERCEL = originalVercel;
    }
  });

  it("stores observations and filters date ranges inclusively", () => {
    const dir = mkdtempSync(join(tmpdir(), "traffic-db-"));
    tempDirs.push(dir);

    const repo = createTrafficRepository(join(dir, "traffic.sqlite"));
    repo.migrate();
    repo.upsertObservations([
      {
        region: "서울",
        roadName: "강변북로",
        sectionName: "A-B",
        linkId: "L-1",
        roadKind: "urban_expressway",
        roadDivName: "도시고속도로",
        observedAt: "2026-05-01T08:00:00+09:00",
        observedDate: "2026-05-01",
        observedHour: 8,
        granularity: "hour",
        sourceName: "test",
        speedKph: 42,
        travelTimeSeconds: null,
        trafficVolume: null,
        occupancy: null,
        congestionLevel: "slow",
        congestionLabel: "서행",
        congestionMethod: "topis-threshold"
      },
      {
        region: "인천",
        roadName: "경인로",
        sectionName: "일별 평균",
        linkId: "INC-1",
        roadKind: "general_road",
        observedAt: "2026-05-03T00:00:00+09:00",
        observedDate: "2026-05-03",
        observedHour: 0,
        granularity: "day",
        sourceName: "test",
        speedKph: 24,
        travelTimeSeconds: null,
        trafficVolume: 1000,
        occupancy: null,
        congestionLevel: "slow",
        congestionLabel: "서행",
        congestionMethod: "threshold-derived"
      }
    ]);

    const rows = repo.queryObservations({
      startDate: "2026-05-01",
      endDate: "2026-05-03",
      region: "all",
      roadName: "",
      granularity: "all",
      limit: 50
    });

    assert.deepEqual(rows.map((row) => row.roadName), ["강변북로", "경인로"]);
    assert.equal(rows[0].roadDivName, "도시고속도로");
    assert.equal(rows[1].roadDivName, "일반도로");
    assert.deepEqual(repo.getCoverage(), [
      {
      sourceName: "test",
      minDate: "2026-05-01",
      maxDate: "2026-05-03",
      status: "available",
      message: "2 observations loaded"
      }
    ]);
  });

  it("counts observations and returns offset pages for virtualized all-data tables", () => {
    const dir = mkdtempSync(join(tmpdir(), "traffic-db-"));
    tempDirs.push(dir);

    const repo = createTrafficRepository(join(dir, "traffic.sqlite"));
    repo.migrate();
    repo.upsertObservations([
      {
        region: "서울",
        roadName: "강변북로",
        sectionName: "A-B",
        linkId: "L-1",
        roadKind: "urban_expressway",
        observedAt: "2026-05-01T08:00:00+09:00",
        observedDate: "2026-05-01",
        observedHour: 8,
        granularity: "hour",
        sourceName: "test",
        speedKph: 42,
        travelTimeSeconds: null,
        trafficVolume: null,
        occupancy: null,
        congestionLevel: "slow",
        congestionLabel: "서행",
        congestionMethod: "topis-threshold"
      },
      {
        region: "서울",
        roadName: "올림픽대로",
        sectionName: "C-D",
        linkId: "L-2",
        roadKind: "urban_expressway",
        observedAt: "2026-05-01T09:00:00+09:00",
        observedDate: "2026-05-01",
        observedHour: 9,
        granularity: "hour",
        sourceName: "test",
        speedKph: 55,
        travelTimeSeconds: null,
        trafficVolume: null,
        occupancy: null,
        congestionLevel: "smooth",
        congestionLabel: "원활",
        congestionMethod: "topis-threshold"
      },
      {
        region: "인천",
        roadName: "경인로",
        sectionName: "E-F",
        linkId: "L-3",
        roadKind: "general_road",
        observedAt: "2026-05-01T10:00:00+09:00",
        observedDate: "2026-05-01",
        observedHour: 10,
        granularity: "hour",
        sourceName: "test",
        speedKph: 24,
        travelTimeSeconds: null,
        trafficVolume: null,
        occupancy: null,
        congestionLevel: "slow",
        congestionLabel: "서행",
        congestionMethod: "threshold-derived"
      }
    ]);

    const query = {
      startDate: "2026-05-01",
      endDate: "2026-05-01",
      region: "all" as const,
      roadName: "",
      granularity: "all" as const,
      limit: 50
    };

    assert.equal(repo.countObservations(query), 3);

    const page = repo.queryObservationsPage(query, { offset: 1, limit: 1 });
    assert.equal(page.length, 1);
    assert.equal(page[0].roadName, "올림픽대로");
  });

  it("derives hourly rows from finer-grained observations", () => {
    const dir = mkdtempSync(join(tmpdir(), "traffic-db-"));
    tempDirs.push(dir);

    const repo = createTrafficRepository(join(dir, "traffic.sqlite"));
    repo.migrate();
    repo.upsertObservations([
      {
        region: "서울",
        roadName: "강변북로",
        sectionName: "A-B",
        linkId: "L-1",
        roadKind: "urban_expressway",
        observedAt: "2026-05-19T16:05:00+09:00",
        observedDate: "2026-05-19",
        observedHour: 16,
        granularity: "realtime",
        sourceName: "its-realtime",
        speedKph: 40,
        travelTimeSeconds: 100,
        trafficVolume: null,
        occupancy: null,
        congestionLevel: "slow",
        congestionLabel: "서행",
        congestionMethod: "topis-threshold"
      },
      {
        region: "서울",
        roadName: "강변북로",
        sectionName: "A-B",
        linkId: "L-1",
        roadKind: "urban_expressway",
        observedAt: "2026-05-19T16:15:00+09:00",
        observedDate: "2026-05-19",
        observedHour: 16,
        granularity: "realtime",
        sourceName: "its-realtime",
        speedKph: 50,
        travelTimeSeconds: 80,
        trafficVolume: null,
        occupancy: null,
        congestionLevel: "smooth",
        congestionLabel: "원활",
        congestionMethod: "topis-threshold"
      }
    ]);

    const rows = repo.queryObservations({
      startDate: "2026-05-19",
      endDate: "2026-05-19",
      region: "all",
      roadName: "",
      granularity: "hour",
      limit: 50
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].observedHour, 16);
    assert.equal(rows[0].granularity, "hour");
    assert.equal(rows[0].speedKph, 45);
    assert.equal(rows[0].travelTimeSeconds, 90);
    assert.equal(rows[0].sourceName, "its-realtime");
  });

  it("derives daily rows from finer-grained observations", () => {
    const dir = mkdtempSync(join(tmpdir(), "traffic-db-"));
    tempDirs.push(dir);

    const repo = createTrafficRepository(join(dir, "traffic.sqlite"));
    repo.migrate();
    repo.upsertObservations([
      {
        region: "서울",
        roadName: "강변북로",
        sectionName: "A-B",
        linkId: "L-1",
        roadKind: "urban_expressway",
        observedAt: "2026-05-19T08:00:00+09:00",
        observedDate: "2026-05-19",
        observedHour: 8,
        granularity: "hour",
        sourceName: "seoul-urban-file",
        speedKph: 30,
        travelTimeSeconds: null,
        trafficVolume: 100,
        occupancy: null,
        congestionLevel: "slow",
        congestionLabel: "서행",
        congestionMethod: "topis-threshold"
      },
      {
        region: "서울",
        roadName: "강변북로",
        sectionName: "A-B",
        linkId: "L-1",
        roadKind: "urban_expressway",
        observedAt: "2026-05-19T18:00:00+09:00",
        observedDate: "2026-05-19",
        observedHour: 18,
        granularity: "hour",
        sourceName: "seoul-urban-file",
        speedKph: 50,
        travelTimeSeconds: null,
        trafficVolume: 140,
        occupancy: null,
        congestionLevel: "smooth",
        congestionLabel: "원활",
        congestionMethod: "topis-threshold"
      }
    ]);

    const rows = repo.queryObservations({
      startDate: "2026-05-19",
      endDate: "2026-05-19",
      region: "all",
      roadName: "",
      granularity: "day",
      limit: 50
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].observedDate, "2026-05-19");
    assert.equal(rows[0].observedHour, 0);
    assert.equal(rows[0].granularity, "day");
    assert.equal(rows[0].speedKph, 40);
    assert.equal(rows[0].trafficVolume, 240);
  });

  it("matches the search term against section names as well as road names", () => {
    const dir = mkdtempSync(join(tmpdir(), "traffic-db-"));
    tempDirs.push(dir);

    const repo = createTrafficRepository(join(dir, "traffic.sqlite"));
    repo.migrate();
    repo.upsertObservations([
      {
        region: "서울",
        roadName: "남부순환로",
        sectionName: "신월IC→화곡고가사거리",
        linkId: "SINWOL-1",
        roadKind: "urban_expressway",
        roadDivName: "도시고속도로",
        observedAt: "2026-01-02T07:00:00+09:00",
        observedDate: "2026-01-02",
        observedHour: 7,
        granularity: "hour",
        sourceName: "tdata-hourly-section",
        speedKph: 24,
        travelTimeSeconds: null,
        trafficVolume: null,
        occupancy: null,
        congestionLevel: "congested",
        congestionLabel: "정체",
        congestionMethod: "threshold-derived"
      }
    ]);

    const rows = repo.queryObservations({
      startDate: "2026-01-01",
      endDate: "2026-05-31",
      region: "서울",
      roadName: "신월IC",
      granularity: "all",
      limit: 50
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].roadName, "남부순환로");
    assert.equal(rows[0].sectionName, "신월IC→화곡고가사거리");
  });

  it("queries exact road sections for fixed corridor reports", () => {
    const dir = mkdtempSync(join(tmpdir(), "traffic-db-"));
    tempDirs.push(dir);

    const repo = createTrafficRepository(join(dir, "traffic.sqlite"));
    repo.migrate();
    repo.upsertObservations([
      {
        region: "서울",
        roadName: "올림픽대로",
        sectionName: "천호대교남단→올림픽대교남단",
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
      },
      {
        region: "서울",
        roadName: "올림픽대로",
        sectionName: "잠실대교남단→종합운동장JC",
        linkId: "OLY-2",
        roadKind: "urban_expressway",
        roadDivName: "도시고속도로",
        observedAt: "2026-01-01T08:00:00+09:00",
        observedDate: "2026-01-01",
        observedHour: 8,
        granularity: "hour",
        sourceName: "tdata-hourly-section",
        speedKph: 35,
        travelTimeSeconds: null,
        trafficVolume: null,
        occupancy: null,
        congestionLevel: "slow",
        congestionLabel: "서행",
        congestionMethod: "topis-threshold"
      }
    ]);

    const rows = repo.queryObservationsByRoadSections({
      startDate: "2026-01-01",
      endDate: "2026-05-19",
      sourceName: "tdata-hourly-section",
      sections: [{ roadName: "올림픽대로", sectionName: "천호대교남단→올림픽대교남단" }]
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].sectionName, "천호대교남단→올림픽대교남단");
    assert.equal(rows[0].speedKph, 55);
  });
});
