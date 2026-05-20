import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const ROOT_DIR = process.cwd();
const TEMPLATE_DIR = join(ROOT_DIR, "data", "csv");
const OUTPUT_DIR = join(ROOT_DIR, "data", "csv-20260513-20260515");
const REPORT_PATH = join(ROOT_DIR, "src", "lib", "requested-traffic-home-report.json");
const DEFAULT_SOURCE_FILES = [
  "/Users/anjuhwan/Downloads/20260513_5Min.csv",
  "/Users/anjuhwan/Downloads/20260514_5Min.csv",
  "/Users/anjuhwan/Downloads/20260515_5Min.csv"
];
const START_HOUR = 6;
const END_HOUR = 18;
const SEOUL_TZ_OFFSET = "+09:00";
const ROUTE_LABEL_OVERRIDES = new Map([["sinwol_ic_congestion_area", "신월 IC"]]);
const TRAFFIC_THRESHOLDS = {
  express: { smooth: 50, slow: 30 },
  local: { smooth: 25, slow: 15 }
};

const sourceFiles = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_SOURCE_FILES;
const sourceDates = sourceFiles.map(dateFromSourcePath).filter(Boolean).sort();

await mkdir(OUTPUT_DIR, { recursive: true });

const reportTemplate = JSON.parse(await readFile(REPORT_PATH, "utf8"));
const routeTemplates = await loadRouteTemplates(reportTemplate);
const linkToRoutes = buildLinkToRoutes(routeTemplates);
const scanStats = [];

for (const csvPath of sourceFiles) {
  const stats = await scanCsv(csvPath, linkToRoutes);
  scanStats.push(stats);
  console.log(`Scanned ${csvPath}: ${stats.scannedRows.toLocaleString("en-US")} rows, ${stats.matchedRows.toLocaleString("en-US")} matched`);
}

for (const route of routeTemplates) {
  writeRouteAggregates(route, sourceDates);
  await writeFile(join(OUTPUT_DIR, `${route.id}.json`), JSON.stringify(route.output), "utf8");
  console.log(`Wrote data/csv-20260513-20260515/${route.id}.json`);
}

const manifest = buildManifest(reportTemplate, routeTemplates, scanStats);
await writeFile(join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log("Wrote data/csv-20260513-20260515/manifest.json");

const homeReport = buildHomeReport(reportTemplate, routeTemplates);
await writeFile(REPORT_PATH, `${JSON.stringify(homeReport, null, 2)}\n`, "utf8");
console.log("Wrote src/lib/requested-traffic-home-report.json");

async function loadRouteTemplates(reportTemplate) {
  const routeOrder = new Map((reportTemplate.routes ?? []).map((route, index) => [route.id, index]));
  const files = (await readdir(TEMPLATE_DIR))
    .filter((file) => file.endsWith(".json") && file !== "manifest.json")
    .sort((a, b) => {
      const aId = basename(a, ".json");
      const bId = basename(b, ".json");
      return (routeOrder.get(aId) ?? 999) - (routeOrder.get(bId) ?? 999) || a.localeCompare(b);
    });

  return Promise.all(
    files.map(async (file) => {
      const id = basename(file, ".json");
      const source = JSON.parse(await readFile(join(TEMPLATE_DIR, file), "utf8"));
      const links = Array.isArray(source["구간목록"]) ? source["구간목록"] : [];
      const requestLabel = ROUTE_LABEL_OVERRIDES.get(id) ?? source["메타"]?.["요청구간"] ?? id;
      const matchedLabel = source["메타"]?.["실제매칭구간"] ?? requestLabel;
      const linkOrder = new Map(links.map((link, index) => [String(link["링크아이디"]), index]));

      return {
        id,
        requestLabel,
        matchedLabel,
        source,
        links,
        linkOrder,
        rows: [],
        output: null
      };
    })
  );
}

function buildLinkToRoutes(routes) {
  const linkToRoutes = new Map();
  for (const route of routes) {
    route.links.forEach((link, order) => {
      const linkId = String(link["링크아이디"]);
      const entries = linkToRoutes.get(linkId) ?? [];
      entries.push({ route, link, order });
      linkToRoutes.set(linkId, entries);
    });
  }
  return linkToRoutes;
}

async function scanCsv(csvPath, linkToRoutes) {
  const stats = {
    file: csvPath,
    header: "",
    scannedRows: 0,
    matchedRows: 0
  };
  let carry = "";
  let isHeader = true;
  const stream = createReadStream(csvPath, { encoding: "utf8", highWaterMark: 16 * 1024 * 1024 });

  for await (const chunk of stream) {
    const lines = `${carry}${chunk}`.split("\n");
    carry = lines.pop() ?? "";
    for (const rawLine of lines) {
      processCsvLine(rawLine, isHeader, stats, linkToRoutes);
      if (isHeader) isHeader = false;
    }
  }

  if (carry) {
    processCsvLine(carry, isHeader, stats, linkToRoutes);
  }

  return stats;
}

function processCsvLine(rawLine, isHeader, stats, linkToRoutes) {
  const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
  if (!line) return;

  if (isHeader) {
    stats.header = line.replace(/^\uFEFF/, "");
    return;
  }

  stats.scannedRows += 1;
  if (line.length < 20 || line[8] !== "," || line[13] !== ",") return;

  const hour = Number(line.slice(9, 11));
  if (!Number.isInteger(hour) || hour < START_HOUR || hour > END_HOUR) return;

  const linkStart = 14;
  const linkEnd = line.indexOf(",", linkStart);
  if (linkEnd === -1) return;
  const linkId = line.slice(linkStart, linkEnd);
  const routeEntries = linkToRoutes.get(linkId);
  if (!routeEntries) return;

  const values = line.slice(linkEnd + 1).split(",");
  const speed = nullableNumber(Number(values[1]));
  const travelTimeSeconds = nullableNumber(Number(values[2]));
  const date = formatDate(line.slice(0, 8));
  const time = formatTime(line.slice(9, 13));
  const minute = Number(line.slice(11, 13));

  for (const entry of routeEntries) {
    const status = trafficStatus(speed, entry.link["도로등급"]);
    entry.route.rows.push({
      "날짜": date,
      "시간": time,
      "시": hour,
      "분": Number.isInteger(minute) ? minute : 0,
      "일시": `${date}T${time}:00${SEOUL_TZ_OFFSET}`,
      "링크아이디": linkId,
      "도로명": text(entry.link["도로명"]),
      "도로등급": text(entry.link["도로등급"]),
      "도로권역": text(entry.link["도로권역"]),
      "시점명": text(entry.link["시점명"]),
      "종점명": text(entry.link["종점명"]),
      "구간명": text(entry.link["구간명"]),
      "연장_m": nullableNumber(entry.link["연장_m"]),
      "통행속도_kmh": speed,
      "통행시간_초": travelTimeSeconds,
      "혼잡상태": status,
      "막힘여부": status === "서행" || status === "정체"
    });
    stats.matchedRows += 1;
  }
}

function writeRouteAggregates(route, dates) {
  route.rows.sort((a, b) => {
    const dateCompare = a["날짜"].localeCompare(b["날짜"]);
    if (dateCompare) return dateCompare;
    const timeCompare = a["시간"].localeCompare(b["시간"]);
    if (timeCompare) return timeCompare;
    return (route.linkOrder.get(a["링크아이디"]) ?? 9999) - (route.linkOrder.get(b["링크아이디"]) ?? 9999);
  });

  const hourlyRows = buildHourlyRows(route, dates);
  const sectionRows = buildSectionRows(route);
  const observedLinkIds = new Set(route.rows.map((row) => row["링크아이디"]));
  const missingLinks = route.links.filter((link) => !observedLinkIds.has(String(link["링크아이디"])));

  route.output = {
    "메타": {
      ...(route.source["메타"] ?? {}),
      "요청구간": route.requestLabel,
      "실제매칭구간": route.matchedLabel,
      "자료기간": reportPeriod(dates),
      "자료주기": "5분",
      "시간범위": "06:00 ~ 18:55",
      "원천": "ITS 교통소통정보 5분 파일 + 표준노드링크 도로구간정보",
      "혼잡도기준": "고속도로/도시고속도로 50/30km/h, 일반도로 25/15km/h 기준"
    },
    "관측요약": {
      "전체링크수": route.links.length,
      "관측링크수": observedLinkIds.size,
      "미관측링크수": missingLinks.length,
      "오분단위자료수": route.rows.length,
      "자료일수": dates.length,
      "시간범위": "06:00 ~ 18:55",
      "링크당예상자료수": dates.length * (END_HOUR - START_HOUR + 1) * 12,
      "전체링크기준예상자료수": route.links.length * dates.length * (END_HOUR - START_HOUR + 1) * 12
    },
    "구간목록": route.links,
    "미관측구간목록": missingLinks,
    "시간별요약": hourlyRows,
    "구간별요약": sectionRows,
    "오분단위자료": route.rows
  };
}

function buildHourlyRows(route, dates) {
  const groups = new Map();
  for (const row of route.rows) {
    const key = `${row["날짜"]}:${row["시"]}`;
    const group = groups.get(key) ?? {
      date: row["날짜"],
      hour: row["시"],
      rows: [],
      observedLinkIds: new Set(),
      slowLinkIds: new Set(),
      congestedLinkIds: new Set()
    };
    group.rows.push(row);
    group.observedLinkIds.add(row["링크아이디"]);
    if (row["혼잡상태"] === "서행") group.slowLinkIds.add(row["링크아이디"]);
    if (row["혼잡상태"] === "정체") group.congestedLinkIds.add(row["링크아이디"]);
    groups.set(key, group);
  }

  const hourlyRows = [];
  for (const date of dates) {
    for (let hour = START_HOUR; hour <= END_HOUR; hour += 1) {
      const group = groups.get(`${date}:${hour}`);
      hourlyRows.push(hourSummary(date, hour, group, route));
    }
  }
  return hourlyRows;
}

function hourSummary(date, hour, group, route) {
  if (!group) {
    return {
      "날짜": date,
      "시": hour,
      "시간대": `${String(hour).padStart(2, "0")}:00`,
      "자료수": 0,
      "관측링크수": 0,
      "평균속도_kmh": null,
      "최저속도_kmh": null,
      "시간대혼잡상태": "데이터없음",
      "막힘여부": false,
      "원활관측수": 0,
      "서행관측수": 0,
      "정체관측수": 0,
      "정체구간수": 0,
      "서행구간수": 0
    };
  }

  const speeds = group.rows.map((row) => row["통행속도_kmh"]).filter((speed) => speed != null);
  const avgSpeed = average(speeds);
  const minSpeed = speeds.length ? Math.min(...speeds) : null;
  const slowObservationCount = group.rows.filter((row) => row["혼잡상태"] === "서행").length;
  const congestedObservationCount = group.rows.filter((row) => row["혼잡상태"] === "정체").length;
  const smoothObservationCount = group.rows.filter((row) => row["혼잡상태"] === "원활").length;

  return {
    "날짜": date,
    "시": hour,
    "시간대": `${String(hour).padStart(2, "0")}:00`,
    "자료수": group.rows.length,
    "관측링크수": group.observedLinkIds.size,
    "평균속도_kmh": roundOne(avgSpeed),
    "최저속도_kmh": roundOne(minSpeed),
    "시간대혼잡상태": trafficStatus(avgSpeed, dominantRoadRank(route)),
    "막힘여부": slowObservationCount > 0 || congestedObservationCount > 0,
    "원활관측수": smoothObservationCount,
    "서행관측수": slowObservationCount,
    "정체관측수": congestedObservationCount,
    "정체구간수": group.congestedLinkIds.size,
    "서행구간수": group.slowLinkIds.size
  };
}

function buildSectionRows(route) {
  const groups = new Map();
  for (const row of route.rows) {
    const group = groups.get(row["링크아이디"]) ?? {
      linkId: row["링크아이디"],
      roadName: row["도로명"],
      roadRank: row["도로등급"],
      roadArea: row["도로권역"],
      fromName: row["시점명"],
      toName: row["종점명"],
      sectionName: row["구간명"],
      speeds: [],
      slowObservationCount: 0,
      congestedObservationCount: 0,
      blockedObservationCount: 0,
      sampleCount: 0
    };
    if (row["통행속도_kmh"] != null) group.speeds.push(row["통행속도_kmh"]);
    if (row["혼잡상태"] === "서행") group.slowObservationCount += 1;
    if (row["혼잡상태"] === "정체") group.congestedObservationCount += 1;
    if (row["막힘여부"]) group.blockedObservationCount += 1;
    group.sampleCount += 1;
    groups.set(row["링크아이디"], group);
  }

  return [...groups.values()]
    .map((group) => ({
      "링크아이디": group.linkId,
      "도로명": group.roadName,
      "도로등급": group.roadRank,
      "도로권역": group.roadArea,
      "시점명": group.fromName,
      "종점명": group.toName,
      "구간명": group.sectionName,
      "자료수": group.sampleCount,
      "평균속도_kmh": roundOne(average(group.speeds)),
      "최저속도_kmh": group.speeds.length ? roundOne(Math.min(...group.speeds)) : null,
      "서행관측수": group.slowObservationCount,
      "정체관측수": group.congestedObservationCount,
      "막힘관측수": group.blockedObservationCount
    }))
    .sort((a, b) => b["막힘관측수"] - a["막힘관측수"] || b["정체관측수"] - a["정체관측수"]);
}

function buildManifest(reportTemplate, routes, scanStats) {
  return {
    "설명": "ITS 교통소통정보 5분 파일에서 요청 구간 LINKID만 추출한 2026-05-13 ~ 2026-05-15, 06~18시 JSON 묶음입니다.",
    "원천파일": sourceFiles,
    "템플릿디렉터리": "data/csv",
    "출력디렉터리": "data/csv-20260513-20260515",
    "스캔통계": scanStats.map((stats) => ({
      "파일": stats.file,
      "헤더": stats.header,
      "스캔행수": stats.scannedRows,
      "매칭행수": stats.matchedRows
    })),
    "혼잡도기준": {
      "고속도로/도시고속도로": "50km/h 이상 원활, 30~50km/h 서행, 30km/h 미만 정체",
      "일반도로": "25km/h 이상 원활, 15~25km/h 서행, 15km/h 미만 정체"
    },
    "주의": reportTemplate.notes ?? [],
    "파일목록": routes.map((route) => ({
      "요청구간": route.requestLabel,
      "실제매칭구간": route.matchedLabel,
      "파일": `data/csv-20260513-20260515/${route.id}.json`,
      "링크수": route.links.length,
      "오분단위자료수": route.rows.length
    }))
  };
}

function buildHomeReport(reportTemplate, routes) {
  const routeReports = routes.map(routeReport);
  return {
    "period": reportPeriod(sourceDates),
    "granularity": "5분 원천 / 06~18시 시간별 요약",
    "source": "ITS 교통소통정보 5분 파일 + 표준노드링크 도로구간정보",
    "totalRoutes": routeReports.length,
    "totalFiveMinuteRows": sum(routeReports.map((route) => route.fiveMinuteRows)),
    "totalLinks": sum(routeReports.map((route) => route.linkCount)),
    "notes": reportTemplate.notes ?? [],
    "thresholds": {
      "고속도로/도시고속도로": "50km/h 이상 원활, 30~50km/h 서행, 30km/h 미만 정체",
      "일반도로": "25km/h 이상 원활, 15~25km/h 서행, 15km/h 미만 정체"
    },
    "routes": routeReports
  };
}

function routeReport(route) {
  const rows = route.rows;
  const hourlyRows = route.output["시간별요약"];
  const sectionRows = route.output["구간별요약"];
  const speeds = rows.map((row) => row["통행속도_kmh"]).filter((speed) => speed != null);
  const blockedHours = hourlyRows.filter((row) => row["막힘여부"]);
  const peakBlockedHour = [...blockedHours].sort(
    (a, b) =>
      b["정체관측수"] - a["정체관측수"] ||
      b["서행관측수"] - a["서행관측수"] ||
      (a["평균속도_kmh"] ?? 9999) - (b["평균속도_kmh"] ?? 9999)
  )[0];

  return {
    "id": route.id,
    "requestLabel": route.requestLabel,
    "matchedLabel": route.matchedLabel,
    "description": route.source["메타"]?.["설명"] ?? "",
    "linkCount": route.links.length,
    "observedLinkCount": route.output["관측요약"]["관측링크수"],
    "missingLinkCount": route.output["관측요약"]["미관측링크수"],
    "fiveMinuteRows": rows.length,
    "avgSpeedKmh": roundOne(average(speeds)),
    "minSpeedKmh": speeds.length ? roundOne(Math.min(...speeds)) : null,
    "blockedHourCount": blockedHours.length,
    "slowHourCount": hourlyRows.filter((row) => row["시간대혼잡상태"] === "서행").length,
    "congestedHourCount": hourlyRows.filter((row) => row["시간대혼잡상태"] === "정체").length,
    "peakBlockedHour": peakBlockedHour
      ? {
          "date": peakBlockedHour["날짜"],
          "hour": peakBlockedHour["시"],
          "avgSpeedKmh": peakBlockedHour["평균속도_kmh"],
          "status": peakBlockedHour["시간대혼잡상태"],
          "slowObservationCount": peakBlockedHour["서행관측수"],
          "congestedObservationCount": peakBlockedHour["정체관측수"]
        }
      : null,
    "topBlockedSections": sectionRows.slice(0, 6).map((section) => ({
      "linkId": section["링크아이디"],
      "roadName": section["도로명"],
      "sectionName": section["구간명"],
      "avgSpeedKmh": section["평균속도_kmh"],
      "minSpeedKmh": section["최저속도_kmh"],
      "slowObservationCount": section["서행관측수"],
      "congestedObservationCount": section["정체관측수"],
      "blockedObservationCount": section["막힘관측수"]
    })),
    "days": sourceDates.map((date) => ({
      "date": date,
      "hours": hourlyRows
        .filter((row) => row["날짜"] === date)
        .map((row) => ({
          "hour": row["시"],
          "label": row["시간대"],
          "avgSpeedKmh": row["평균속도_kmh"],
          "minSpeedKmh": row["최저속도_kmh"],
          "status": row["시간대혼잡상태"],
          "blocked": row["막힘여부"],
          "sampleCount": row["자료수"],
          "observedLinkCount": row["관측링크수"],
          "smoothObservationCount": row["원활관측수"],
          "slowObservationCount": row["서행관측수"],
          "congestedObservationCount": row["정체관측수"],
          "slowLinkCount": row["서행구간수"],
          "congestedLinkCount": row["정체구간수"]
        }))
    }))
  };
}

function dateFromSourcePath(filePath) {
  const match = /(\d{4})(\d{2})(\d{2})_5Min\.csv$/.exec(filePath);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function formatDate(value) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function formatTime(value) {
  return `${value.slice(0, 2)}:${value.slice(2, 4)}`;
}

function reportPeriod(dates) {
  if (!dates.length) return "";
  return `${dates[0]} ~ ${dates[dates.length - 1]}`;
}

function dominantRoadRank(route) {
  const counts = new Map();
  for (const link of route.links) {
    const rank = text(link["도로등급"]);
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function trafficStatus(speed, roadRank) {
  if (speed == null) return "정보없음";
  const thresholds = isExpressRoad(roadRank) ? TRAFFIC_THRESHOLDS.express : TRAFFIC_THRESHOLDS.local;
  if (speed >= thresholds.smooth) return "원활";
  if (speed >= thresholds.slow) return "서행";
  return "정체";
}

function isExpressRoad(roadRank) {
  const rank = text(roadRank);
  return rank.includes("고속도로") || rank.includes("도시고속도로");
}

function average(values) {
  if (!values.length) return null;
  return sum(values) / values.length;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function roundOne(value) {
  return value == null ? null : Math.round(value * 10) / 10;
}

function nullableNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function text(value) {
  return value == null ? "" : String(value);
}
