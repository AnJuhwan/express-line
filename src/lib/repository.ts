import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { DatabaseSync as SQLiteDatabaseSync } from "node:sqlite";
import type { DataCoverageRow, NormalizedTrafficObservation, RoadKind, RoadOption, TrafficObservationRow, TrafficQuery } from "./types";

type SQLiteModule = typeof import("node:sqlite");
type DatabaseSyncConstructor = new (path: string) => SQLiteDatabaseSync;

export interface TrafficRepository {
  migrate(): void;
  upsertObservations(rows: NormalizedTrafficObservation[]): void;
  queryObservations(query: TrafficQuery): TrafficObservationRow[];
  queryObservationsPage(query: TrafficQuery, page: ObservationPage): TrafficObservationRow[];
  countObservations(query: TrafficQuery): number;
  queryObservationsByRoadSections(query: RoadSectionObservationQuery): TrafficObservationRow[];
  getCoverage(): DataCoverageRow[];
  getRoadOptions(): RoadOption[];
}

export interface ObservationPage {
  offset: number;
  limit: number;
}

export interface RoadSectionObservationQuery {
  startDate: string;
  endDate: string;
  sourceName?: string;
  sections: Array<{
    roadName: string;
    sectionName: string;
  }>;
}

let singleton: TrafficRepository | null = null;

export function getTrafficRepository(): TrafficRepository {
  if (!singleton) {
    const dbPath = process.env.TRAFFIC_DB_PATH ?? defaultTrafficDbPath();
    singleton = createTrafficRepository(dbPath);
    singleton.migrate();
  }
  return singleton;
}

export function defaultTrafficDbPath(): string {
  if (process.env.VERCEL) return join(tmpdir(), "traffic.sqlite");
  return join(process.cwd(), "data", "traffic.sqlite");
}

export function createTrafficRepository(dbPath: string): TrafficRepository {
  const DatabaseSync = loadDatabaseSync();
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
  const db = new DatabaseSync(dbPath);

  return {
    migrate() {
      db.exec(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS roads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          region TEXT NOT NULL,
          road_name TEXT NOT NULL,
          section_name TEXT NOT NULL,
          link_id TEXT NOT NULL,
          road_kind TEXT NOT NULL,
          road_div_name TEXT,
          UNIQUE(region, road_name, section_name, link_id)
        );
        CREATE TABLE IF NOT EXISTS traffic_observations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          road_id INTEGER NOT NULL REFERENCES roads(id),
          observed_at TEXT NOT NULL,
          observed_date TEXT NOT NULL,
          observed_hour INTEGER NOT NULL,
          granularity TEXT NOT NULL,
          source_name TEXT NOT NULL,
          speed_kph REAL,
          travel_time_seconds REAL,
          traffic_volume REAL,
          occupancy REAL,
          congestion_level TEXT NOT NULL,
          congestion_label TEXT NOT NULL,
          congestion_method TEXT NOT NULL,
          UNIQUE(road_id, observed_at, granularity, source_name)
        );
        CREATE INDEX IF NOT EXISTS idx_observations_date ON traffic_observations(observed_date, observed_hour);
        CREATE INDEX IF NOT EXISTS idx_observations_source ON traffic_observations(source_name);
        CREATE TABLE IF NOT EXISTS data_coverage (
          source_name TEXT PRIMARY KEY,
          min_date TEXT,
          max_date TEXT,
          status TEXT NOT NULL,
          message TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      ensureRoadDivNameColumn(db);
      backfillRoadDivNames(db);
    },
    upsertObservations(rows) {
      if (rows.length === 0) return;
      db.exec("BEGIN");
      try {
        for (const row of rows) {
          const roadId = getRoadId(db, row);
          db.prepare(`
            INSERT INTO traffic_observations (
              road_id, observed_at, observed_date, observed_hour, granularity, source_name,
              speed_kph, travel_time_seconds, traffic_volume, occupancy,
              congestion_level, congestion_label, congestion_method
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(road_id, observed_at, granularity, source_name) DO UPDATE SET
              speed_kph = excluded.speed_kph,
              travel_time_seconds = excluded.travel_time_seconds,
              traffic_volume = excluded.traffic_volume,
              occupancy = excluded.occupancy,
              congestion_level = excluded.congestion_level,
              congestion_label = excluded.congestion_label,
              congestion_method = excluded.congestion_method
          `).run(
            roadId,
            row.observedAt,
            row.observedDate,
            row.observedHour,
            row.granularity,
            row.sourceName,
            row.speedKph,
            row.travelTimeSeconds,
            row.trafficVolume,
            row.occupancy,
            row.congestionLevel,
            row.congestionLabel,
            row.congestionMethod
          );
        }
        updateCoverage(db, [...new Set(rows.map((row) => row.sourceName))]);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    queryObservations(query) {
      return queryObservationsPage(db, query, { offset: 0, limit: query.limit });
    },
    queryObservationsPage(query, page) {
      return queryObservationsPage(db, query, page);
    },
    countObservations(query) {
      return countObservations(db, query);
    },
    queryObservationsByRoadSections(query) {
      if (!query.sections.length) return [];
      const sectionClauses = query.sections.map(() => "(r.road_name = ? AND r.section_name = ?)");
      const params: (string | number)[] = [query.startDate, query.endDate];
      for (const section of query.sections) {
        params.push(section.roadName, section.sectionName);
      }
      if (query.sourceName) params.push(query.sourceName);

      const rows = db
        .prepare(`
          SELECT
            o.id,
            o.road_id AS roadId,
            r.region,
            r.road_name AS roadName,
            r.section_name AS sectionName,
            r.link_id AS linkId,
            r.road_kind AS roadKind,
            COALESCE(r.road_div_name, '') AS roadDivName,
            o.observed_at AS observedAt,
            o.observed_date AS observedDate,
            o.observed_hour AS observedHour,
            o.granularity,
            o.source_name AS sourceName,
            o.speed_kph AS speedKph,
            o.travel_time_seconds AS travelTimeSeconds,
            o.traffic_volume AS trafficVolume,
            o.occupancy,
            o.congestion_level AS congestionLevel,
            o.congestion_label AS congestionLabel,
            o.congestion_method AS congestionMethod
          FROM traffic_observations o
          JOIN roads r ON r.id = o.road_id
          WHERE o.observed_date BETWEEN ? AND ?
            AND (${sectionClauses.join(" OR ")})
            ${query.sourceName ? "AND o.source_name = ?" : ""}
          ORDER BY o.observed_date ASC, o.observed_hour ASC, r.road_name ASC, r.section_name ASC
        `)
        .all(...params);
      return rows.map((row) => ({ ...(row as unknown as TrafficObservationRow) }));
    },
    getCoverage() {
      return db
        .prepare(
          "SELECT source_name AS sourceName, min_date AS minDate, max_date AS maxDate, status, message FROM data_coverage ORDER BY source_name"
        )
        .all()
        .map((row) => ({ ...(row as unknown as DataCoverageRow) }));
    },
    getRoadOptions() {
      return db
        .prepare("SELECT DISTINCT region, road_name AS roadName FROM roads ORDER BY region, road_name")
        .all()
        .map((row) => ({ ...(row as unknown as RoadOption) }));
    }
  };
}

function loadDatabaseSync(): DatabaseSyncConstructor {
  const getBuiltinModule = (process as typeof process & { getBuiltinModule?: (name: string) => unknown }).getBuiltinModule;
  const sqlite = typeof getBuiltinModule === "function" ? (getBuiltinModule("node:sqlite") as SQLiteModule | undefined) : undefined;
  if (sqlite?.DatabaseSync) return sqlite.DatabaseSync as unknown as DatabaseSyncConstructor;
  throw new Error("node:sqlite is unavailable in this runtime. Use the static corridor report or a Node runtime with SQLite support.");
}

function queryObservationsPage(db: SQLiteDatabaseSync, query: TrafficQuery, page: ObservationPage): TrafficObservationRow[] {
  const safePage = normalizePage(page);
  if (safePage.limit === 0) return [];
  if (query.granularity === "hour" || query.granularity === "day") {
    return queryAggregatedObservations(db, query, query.granularity, safePage);
  }

  const { clauses, params } = observationWhere(query);
  if (query.granularity !== "all") {
    clauses.push("o.granularity = ?");
    params.push(query.granularity);
  }
  params.push(safePage.limit, safePage.offset);

  const rows = db
    .prepare(`
      SELECT
        o.id,
        o.road_id AS roadId,
        r.region,
        r.road_name AS roadName,
        r.section_name AS sectionName,
        r.link_id AS linkId,
        r.road_kind AS roadKind,
        COALESCE(r.road_div_name, '') AS roadDivName,
        o.observed_at AS observedAt,
        o.observed_date AS observedDate,
        o.observed_hour AS observedHour,
        o.granularity,
        o.source_name AS sourceName,
        o.speed_kph AS speedKph,
        o.travel_time_seconds AS travelTimeSeconds,
        o.traffic_volume AS trafficVolume,
        o.occupancy,
        o.congestion_level AS congestionLevel,
        o.congestion_label AS congestionLabel,
        o.congestion_method AS congestionMethod
      FROM traffic_observations o
      JOIN roads r ON r.id = o.road_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY o.observed_at ASC, r.road_name ASC, r.section_name ASC
      LIMIT ? OFFSET ?
    `)
    .all(...params);
  return rows.map((row) => ({ ...(row as unknown as TrafficObservationRow) }));
}

function countObservations(db: SQLiteDatabaseSync, query: TrafficQuery): number {
  if (query.granularity === "hour" || query.granularity === "day") {
    return countAggregatedObservations(db, query, query.granularity);
  }

  const { clauses, params } = observationWhere(query);
  if (query.granularity !== "all") {
    clauses.push("o.granularity = ?");
    params.push(query.granularity);
  }

  const row = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM traffic_observations o
      JOIN roads r ON r.id = o.road_id
      WHERE ${clauses.join(" AND ")}
    `)
    .get(...params) as { count: number };
  return row.count;
}

function queryAggregatedObservations(db: SQLiteDatabaseSync, query: TrafficQuery, bucket: "hour" | "day", page: ObservationPage): TrafficObservationRow[] {
  const { clauses, params } = observationWhere(query);
  if (bucket === "hour") {
    clauses.push("o.granularity <> 'day'");
  }
  params.push(page.limit, page.offset);

  const bucketAt =
    bucket === "day"
      ? "o.observed_date || 'T00:00:00+09:00'"
      : "o.observed_date || 'T' || printf('%02d', o.observed_hour) || ':00:00+09:00'";
  const bucketHour = bucket === "day" ? "0" : "o.observed_hour";
  const groupBy = bucket === "day" ? "o.road_id, o.observed_date" : "o.road_id, o.observed_date, o.observed_hour";

  const rows = db
    .prepare(`
      SELECT
        MIN(o.id) AS id,
        o.road_id AS roadId,
        r.region,
        r.road_name AS roadName,
        r.section_name AS sectionName,
        r.link_id AS linkId,
        r.road_kind AS roadKind,
        COALESCE(r.road_div_name, '') AS roadDivName,
        ${bucketAt} AS observedAt,
        o.observed_date AS observedDate,
        ${bucketHour} AS observedHour,
        '${bucket}' AS granularity,
        CASE WHEN COUNT(DISTINCT o.source_name) = 1 THEN MIN(o.source_name) ELSE 'aggregated' END AS sourceName,
        ROUND(AVG(o.speed_kph), 1) AS speedKph,
        ROUND(AVG(o.travel_time_seconds), 1) AS travelTimeSeconds,
        CASE WHEN COUNT(o.traffic_volume) = 0 THEN NULL ELSE ROUND(SUM(o.traffic_volume), 1) END AS trafficVolume,
        ROUND(AVG(o.occupancy), 1) AS occupancy,
        CASE
          WHEN AVG(o.speed_kph) IS NULL THEN 'unknown'
          WHEN r.road_kind IN ('urban_expressway', 'expressway') AND AVG(o.speed_kph) >= 50 THEN 'smooth'
          WHEN r.road_kind IN ('urban_expressway', 'expressway') AND AVG(o.speed_kph) >= 30 THEN 'slow'
          WHEN r.road_kind NOT IN ('urban_expressway', 'expressway') AND AVG(o.speed_kph) >= 25 THEN 'smooth'
          WHEN r.road_kind NOT IN ('urban_expressway', 'expressway') AND AVG(o.speed_kph) >= 15 THEN 'slow'
          ELSE 'congested'
        END AS congestionLevel,
        CASE
          WHEN AVG(o.speed_kph) IS NULL THEN '정보없음'
          WHEN r.road_kind IN ('urban_expressway', 'expressway') AND AVG(o.speed_kph) >= 50 THEN '원활'
          WHEN r.road_kind IN ('urban_expressway', 'expressway') AND AVG(o.speed_kph) >= 30 THEN '서행'
          WHEN r.road_kind NOT IN ('urban_expressway', 'expressway') AND AVG(o.speed_kph) >= 25 THEN '원활'
          WHEN r.road_kind NOT IN ('urban_expressway', 'expressway') AND AVG(o.speed_kph) >= 15 THEN '서행'
          ELSE '정체'
        END AS congestionLabel,
        'threshold-derived' AS congestionMethod
      FROM traffic_observations o
      JOIN roads r ON r.id = o.road_id
      WHERE ${clauses.join(" AND ")}
      GROUP BY ${groupBy}
      ORDER BY o.observed_date ASC, observedHour ASC, r.road_name ASC, r.section_name ASC
      LIMIT ? OFFSET ?
    `)
    .all(...params);

  return rows.map((row) => ({ ...(row as unknown as TrafficObservationRow) }));
}

function countAggregatedObservations(db: SQLiteDatabaseSync, query: TrafficQuery, bucket: "hour" | "day"): number {
  const { clauses, params } = observationWhere(query);
  if (bucket === "hour") {
    clauses.push("o.granularity <> 'day'");
  }

  const groupBy = bucket === "day" ? "o.road_id, o.observed_date" : "o.road_id, o.observed_date, o.observed_hour";

  const row = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM (
        SELECT 1
        FROM traffic_observations o
        JOIN roads r ON r.id = o.road_id
        WHERE ${clauses.join(" AND ")}
        GROUP BY ${groupBy}
      ) grouped
    `)
    .get(...params) as { count: number };
  return row.count;
}

function normalizePage(page: ObservationPage): ObservationPage {
  return {
    offset: Math.max(0, Math.floor(page.offset)),
    limit: Math.max(0, Math.floor(page.limit))
  };
}

function observationWhere(query: TrafficQuery): { clauses: string[]; params: (string | number)[] } {
  const params: (string | number)[] = [query.startDate, query.endDate];
  const clauses = ["o.observed_date BETWEEN ? AND ?"];
  if (query.region !== "all") {
    clauses.push("r.region = ?");
    params.push(query.region);
  }
  if (query.roadName.trim()) {
    clauses.push("(r.road_name LIKE ? OR r.section_name LIKE ? OR r.link_id LIKE ?)");
    const searchTerm = `%${query.roadName.trim()}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  return { clauses, params };
}

function getRoadId(db: SQLiteDatabaseSync, row: NormalizedTrafficObservation): number {
  const roadDivName = row.roadDivName?.trim() || roadDivNameForKind(row.roadKind);

  db.prepare(`
    INSERT INTO roads (region, road_name, section_name, link_id, road_kind, road_div_name)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(region, road_name, section_name, link_id) DO UPDATE SET
      road_kind = excluded.road_kind,
      road_div_name = COALESCE(excluded.road_div_name, roads.road_div_name)
  `).run(row.region, row.roadName, row.sectionName, row.linkId, row.roadKind, roadDivName);

  const road = db
    .prepare("SELECT id FROM roads WHERE region = ? AND road_name = ? AND section_name = ? AND link_id = ?")
    .get(row.region, row.roadName, row.sectionName, row.linkId) as { id: number } | undefined;

  if (!road) throw new Error(`Unable to find road ${row.roadName}/${row.linkId}`);
  return road.id;
}

function ensureRoadDivNameColumn(db: SQLiteDatabaseSync) {
  const columns = db.prepare("PRAGMA table_info(roads)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "road_div_name")) {
    db.exec("ALTER TABLE roads ADD COLUMN road_div_name TEXT");
  }
}

function backfillRoadDivNames(db: SQLiteDatabaseSync) {
  db.exec(`
    UPDATE roads
    SET road_div_name = CASE
      WHEN road_kind = 'urban_expressway' THEN '도시고속도로'
      WHEN road_kind = 'expressway' THEN '고속도로'
      WHEN road_kind = 'general_road' THEN '일반도로'
      ELSE road_kind
    END
    WHERE road_div_name IS NULL OR trim(road_div_name) = ''
  `);
}

function roadDivNameForKind(roadKind: RoadKind): string {
  if (roadKind === "urban_expressway") return "도시고속도로";
  if (roadKind === "expressway") return "고속도로";
  return "일반도로";
}

function updateCoverage(db: SQLiteDatabaseSync, sourceNames: string[]) {
  for (const sourceName of sourceNames) {
    const summary = db
      .prepare(
        "SELECT MIN(observed_date) AS minDate, MAX(observed_date) AS maxDate, COUNT(*) AS count FROM traffic_observations WHERE source_name = ?"
      )
      .get(sourceName) as { minDate: string | null; maxDate: string | null; count: number };
    db.prepare(`
      INSERT INTO data_coverage (source_name, min_date, max_date, status, message, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(source_name) DO UPDATE SET
        min_date = excluded.min_date,
        max_date = excluded.max_date,
        status = excluded.status,
        message = excluded.message,
        updated_at = excluded.updated_at
    `).run(
      sourceName,
      summary.minDate,
      summary.maxDate,
      summary.count > 0 ? "available" : "empty",
      summary.count > 0 ? `${summary.count} observations loaded` : "데이터 없음"
    );
  }
}
