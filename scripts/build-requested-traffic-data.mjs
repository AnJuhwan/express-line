import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative } from "node:path";

const ROOT_DIR = process.cwd();
const TEMPLATE_DIR = join(ROOT_DIR, "data", "csv");
const DEFAULT_OUTPUT_DIR = join(ROOT_DIR, "data", "csv-20260513-20260515");
const DEFAULT_REPORT_PATH = join(ROOT_DIR, "src", "lib", "requested-traffic-home-report.json");
const DEFAULT_TEMPLATE_REPORT_PATH = DEFAULT_REPORT_PATH;
const DEFAULT_SOURCE_FILES = [
  "/Users/anjuhwan/Downloads/20260513_5Min.csv",
  "/Users/anjuhwan/Downloads/20260514_5Min.csv",
  "/Users/anjuhwan/Downloads/20260515_5Min.csv"
];
const START_HOUR = 6;
const END_HOUR = 18;
const SEOUL_TZ_OFFSET = "+09:00";
const SINWOL_REPLACEMENT_ROUTE_ID = "sinwol_ic_congestion_area";
const ROAD_RANK_LABELS = new Map([
  ["101", "고속도로"],
  ["102", "도시고속화도로"],
  ["104", "특별/광역시도"]
]);
const INCHEON_TOLL_MOKDONG_ROUTES = [
  {
    id: "incheon_toll_to_mokdong_underpass",
    requestLabel: "인천 요금소 → 목동지하차도",
    matchedLabel: "인천TG → 목동지하차도서측",
    description: "표준링크 그래프에서 경인고속도로와 국회대로를 따라 인천TG에서 목동지하차도서측까지 매칭",
    links: [
      link("1660003701", "경인고속도로", "101", "인천광역시", "인천TG", "서운JC서측", 371.9168024),
      link("1660003500", "경인고속도로", "101", "인천광역시", "서운JC서측", "서운JC동측", 795.5368687),
      link("2420062200", "경인고속도로", "101", "경기도", "서운JC동측", "부천IC서측", 1123.293528),
      link("2420085200", "경인고속도로", "101", "경기도", "부천IC서측", "부천IC동측", 505.982493),
      link("2420269300", "경인고속도로", "101", "경기도", "부천IC동측", "부천시-양천구", 4090.534854),
      link("1140278700", "경인고속도로", "101", "서울특별시", "부천시-양천구", "신월IC", 555.1318456),
      link("1140000202", "경인고속도로", "101", "서울특별시", "신월IC", "신월IC", 177.7643904),
      link("1140000203", "국회대로", "104", "서울특별시", "신월IC", "속성변화점", 85.79233417),
      link("1140022201", "국회대로", "104", "서울특별시", "속성변화점", "신월IC", 99.80294878),
      link("1140281001", "경인고속도로", "101", "서울특별시", "신월IC", "신월JC", 173.7078471),
      link("1140281801", "경인고속도로", "101", "서울특별시", "신월JC", "신월IC", 264.9885228),
      link("1140282401", "국회대로", "102", "서울특별시", "신월IC", "경인2지하차도서측", 429.1998161),
      link("1140026201", "국회대로", "104", "서울특별시", "경인2지하차도서측", "목동지하차도서측", 1392.926282)
    ]
  },
  {
    id: "mokdong_underpass_to_incheon_toll",
    requestLabel: "목동지하차도 → 인천 요금소",
    matchedLabel: "목동지하차도서측 → 인천TG",
    description: "표준링크 그래프에서 국회대로와 경인고속도로를 따라 목동지하차도서측에서 인천TG까지 매칭",
    links: [
      link("1140040503", "국회대로", "104", "서울특별시", "목동지하차도서측", "경인2지하차도서측", 1394.132159),
      link("1150437701", "국회대로", "102", "서울특별시", "경인2지하차도서측", "신월IC", 429.0965474),
      link("1140281701", "경인고속도로", "101", "서울특별시", "신월IC", "신월JC", 265.101721),
      link("1140280801", "경인고속도로", "101", "서울특별시", "신월JC", "신월IC", 204.3928316),
      link("1140040501", "국회대로", "104", "서울특별시", "신월IC", "속성변화점", 73.58722143),
      link("1140000103", "국회대로", "104", "서울특별시", "속성변화점", "신월IC", 79.93413519),
      link("1140000102", "경인고속도로", "101", "서울특별시", "신월IC", "신월IC", 181.5156391),
      link("1140278800", "경인고속도로", "101", "서울특별시", "신월IC", "부천시-양천구", 539.9833643),
      link("2420269400", "경인고속도로", "101", "경기도", "부천시-양천구", "부천IC동측", 4086.945664),
      link("2420085300", "경인고속도로", "101", "경기도", "부천IC동측", "부천IC서측", 509.5466629),
      link("2420062100", "경인고속도로", "101", "경기도", "부천IC서측", "서운JC동측", 1123.270609),
      link("1660003600", "경인고속도로", "101", "인천광역시", "서운JC동측", "서운JC서측", 795.2993756),
      link("1660003801", "경인고속도로", "101", "인천광역시", "서운JC서측", "인천TG", 371.3757133)
    ]
  }
];
const TRAFFIC_THRESHOLDS = {
  express: { smooth: 50, slow: 30 },
  local: { smooth: 25, slow: 15 }
};

const options = parseCliArgs(process.argv.slice(2));
const OUTPUT_DIR = absoluteFromRoot(options.outputDir);
const REPORT_PATH = absoluteFromRoot(options.reportPath);
const TEMPLATE_REPORT_PATH = absoluteFromRoot(options.templateReportPath);
const sourceFiles = options.sourceFiles.length ? options.sourceFiles : DEFAULT_SOURCE_FILES;
const sourceDates = sourceFiles.map(dateFromSourcePath).filter(Boolean).sort();

await mkdir(OUTPUT_DIR, { recursive: true });

const reportTemplate = JSON.parse(await readFile(TEMPLATE_REPORT_PATH, "utf8"));
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
  console.log(`Wrote ${relativeFromRoot(join(OUTPUT_DIR, `${route.id}.json`))}`);
}

const manifest = buildManifest(reportTemplate, routeTemplates, scanStats);
await writeFile(join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Wrote ${relativeFromRoot(join(OUTPUT_DIR, "manifest.json"))}`);

const homeReport = buildHomeReport(reportTemplate, routeTemplates);
await writeFile(REPORT_PATH, `${JSON.stringify(homeReport, null, 2)}\n`, "utf8");
console.log(`Wrote ${relativeFromRoot(REPORT_PATH)}`);

function parseCliArgs(args) {
  const parsed = {
    outputDir: DEFAULT_OUTPUT_DIR,
    reportPath: DEFAULT_REPORT_PATH,
    templateReportPath: DEFAULT_TEMPLATE_REPORT_PATH,
    sourceFiles: []
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--output-dir") {
      parsed.outputDir = requiredOptionValue(args, ++index, arg);
    } else if (arg === "--report-path") {
      parsed.reportPath = requiredOptionValue(args, ++index, arg);
    } else if (arg === "--template-report-path") {
      parsed.templateReportPath = requiredOptionValue(args, ++index, arg);
    } else if (arg === "--help") {
      printUsageAndExit();
    } else {
      parsed.sourceFiles.push(arg);
    }
  }

  return parsed;
}

function requiredOptionValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a path value`);
  }
  return value;
}

function printUsageAndExit() {
  console.log(
    [
      "Usage: node scripts/build-requested-traffic-data.mjs [options] [source-csv ...]",
      "",
      "Options:",
      "  --output-dir <path>           JSON data output directory",
      "  --report-path <path>          report JSON output path",
      "  --template-report-path <path> report JSON used for notes and route order"
    ].join("\n")
  );
  process.exit(0);
}

function absoluteFromRoot(filePath) {
  return isAbsolute(filePath) ? filePath : join(ROOT_DIR, filePath);
}

function relativeFromRoot(filePath) {
  const relativePath = relative(ROOT_DIR, filePath);
  return relativePath && !relativePath.startsWith("..") ? relativePath : filePath;
}

function link(linkId, roadName, roadRankCode, roadArea, fromName, toName, lengthMeters) {
  return {
    "링크아이디": linkId,
    "도로명": roadName,
    "도로등급": ROAD_RANK_LABELS.get(roadRankCode) ?? roadRankCode,
    "도로권역": roadArea,
    "시점명": fromName,
    "종점명": toName,
    "구간명": `${fromName} → ${toName}`,
    "연장_m": roundThree(lengthMeters)
  };
}

async function loadRouteTemplates(reportTemplate) {
  const routeOrder = new Map((reportTemplate.routes ?? []).map((route, index) => [route.id, index]));
  const files = (await readdir(TEMPLATE_DIR))
    .filter((file) => file.endsWith(".json") && file !== "manifest.json")
    .sort((a, b) => {
      const aId = basename(a, ".json");
      const bId = basename(b, ".json");
      return routeSortOrder(routeOrder, aId) - routeSortOrder(routeOrder, bId) || a.localeCompare(b);
    });

  const routes = [];
  for (const file of files) {
    const id = basename(file, ".json");
    const source = JSON.parse(await readFile(join(TEMPLATE_DIR, file), "utf8"));
    if (id === SINWOL_REPLACEMENT_ROUTE_ID) {
      routes.push(...INCHEON_TOLL_MOKDONG_ROUTES.map(syntheticRouteTemplate));
      continue;
    }
    routes.push(routeTemplateFromSource(id, source));
  }

  return routes.sort((a, b) => routeSortOrder(routeOrder, a.id) - routeSortOrder(routeOrder, b.id) || a.id.localeCompare(b.id));
}

function syntheticRouteTemplate(definition) {
  const source = {
    "메타": {
      "요청구간": definition.requestLabel,
      "실제매칭구간": definition.matchedLabel,
      "설명": definition.description
    },
    "구간목록": definition.links.map((routeLink, index) => ({
      "순번": index + 1,
      ...routeLink
    }))
  };
  return routeTemplateFromSource(definition.id, source);
}

function routeTemplateFromSource(id, source) {
  const links = Array.isArray(source["구간목록"]) ? source["구간목록"] : [];
  const requestLabel = source["메타"]?.["요청구간"] ?? id;
  const matchedLabel = source["메타"]?.["실제매칭구간"] ?? requestLabel;
  const linkOrder = new Map(links.map((routeLink, index) => [String(routeLink["링크아이디"]), index]));

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
}

function routeSortOrder(routeOrder, id) {
  if (routeOrder.has(id)) return routeOrder.get(id);
  const syntheticIndex = INCHEON_TOLL_MOKDONG_ROUTES.findIndex((route) => route.id === id);
  if (syntheticIndex !== -1) {
    return (routeOrder.get(SINWOL_REPLACEMENT_ROUTE_ID) ?? 999) + syntheticIndex / 10;
  }
  return 999;
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
    "설명": `ITS 교통소통정보 5분 파일에서 요청 구간 LINKID만 추출한 ${reportPeriod(sourceDates)}, 06~18시 JSON 묶음입니다.`,
    "원천파일": sourceFiles,
    "템플릿디렉터리": relativeFromRoot(TEMPLATE_DIR),
    "출력디렉터리": relativeFromRoot(OUTPUT_DIR),
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
      "파일": relativeFromRoot(join(OUTPUT_DIR, `${route.id}.json`)),
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

function roundThree(value) {
  return value == null ? null : Math.round(value * 1000) / 1000;
}

function nullableNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function text(value) {
  return value == null ? "" : String(value);
}
