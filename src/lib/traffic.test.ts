import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildIncheonSpeedUrl,
  buildItsTrafficInfoUrl,
  buildTDataHourlySectionUrl,
  extractItsTrafficInfoXmlItems,
  extractTDataItems,
  normalizeItsTrafficInfoItems,
  normalizeSeoulUrbanSpeedRows,
  normalizeTDataHourlySectionItems
} from "./collectors";
import { classifyCongestion, parseDateRange } from "./traffic";

describe("traffic domain helpers", () => {
  it("classifies Seoul urban expressway speeds with TOPIS thresholds", () => {
    assert.deepEqual(classifyCongestion(55, "urban_expressway"), {
      level: "smooth",
      label: "원활",
      method: "topis-threshold"
    });
    assert.equal(classifyCongestion(40, "urban_expressway").level, "slow");
    assert.equal(classifyCongestion(29.9, "urban_expressway").level, "congested");
  });

  it("classifies ordinary road speeds with derived thresholds", () => {
    assert.deepEqual(classifyCongestion(27, "general_road", "derived"), {
      level: "smooth",
      label: "원활",
      method: "threshold-derived"
    });
    assert.equal(classifyCongestion(20, "general_road", "derived").level, "slow");
    assert.equal(classifyCongestion(14.5, "general_road", "derived").level, "congested");
  });

  it("normalizes Seoul 5-minute urban expressway CSV rows into observations", () => {
    const rows = normalizeSeoulUrbanSpeedRows([
      {
        "날짜": "20250102",
        "노선ID": "100",
        "노선이름": "강변북로",
        "구간명": "가양대교북단-성산대교북단",
        "구간ID": "GBN-001",
        "5분단위시간": "0830",
        "교통량": "123",
        "속도": "28.5",
        "점유율": "15.2"
      }
    ]);

    assert.equal(rows.length, 1);
    assert.deepEqual(
      {
        region: rows[0].region,
        roadName: rows[0].roadName,
        sectionName: rows[0].sectionName,
        linkId: rows[0].linkId,
        observedAt: rows[0].observedAt,
        observedDate: rows[0].observedDate,
        observedHour: rows[0].observedHour,
        granularity: rows[0].granularity,
        speedKph: rows[0].speedKph,
        trafficVolume: rows[0].trafficVolume,
        occupancy: rows[0].occupancy,
        congestionLevel: rows[0].congestionLevel
      },
      {
      region: "서울",
      roadName: "강변북로",
      sectionName: "가양대교북단-성산대교북단",
      linkId: "GBN-001",
      observedAt: "2025-01-02T08:30:00+09:00",
      observedDate: "2025-01-02",
      observedHour: 8,
      granularity: "5min",
      speedKph: 28.5,
      trafficVolume: 123,
      occupancy: 15.2,
      congestionLevel: "congested"
      }
    );
  });

  it("normalizes the real Seoul Open Data Plaza 5-minute CSV headers", () => {
    const rows = normalizeSeoulUrbanSpeedRows([
      {
        "기간\t": "2022-08-01",
        "노선 ID": "LBL3000010",
        "노선명": "북부간선",
        "구간 ID": "LBL2000010",
        "구간명": "구리시계→신내IC",
        "구간 길이": "1813.4",
        "5분 코드": "0835",
        "교통량": "170",
        "속도": "27.42",
        "점유율": "9.83"
      }
    ]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].roadName, "북부간선");
    assert.equal(rows[0].linkId, "LBL2000010");
    assert.equal(rows[0].observedAt, "2022-08-01T08:35:00+09:00");
    assert.equal(rows[0].observedHour, 8);
    assert.equal(rows[0].speedKph, 27.42);
    assert.equal(rows[0].congestionLevel, "congested");
  });

  it("builds an Incheon speed API URL with date, road name, and encoded service key", () => {
    const url = buildIncheonSpeedUrl({
      serviceKey: "abc+/=",
      date: "2026-05-01",
      roadName: "경인로",
      pageNo: 2,
      numOfRows: 100
    });

    assert.equal(
      url.toString(),
      "http://apis.data.go.kr/6280000/ICRoadStat_v2/STAT-Speed_DD_Road?serviceKey=abc%2B%2F%3D&pageNo=2&numOfRows=100&YMD=20260501&roadName=%EA%B2%BD%EC%9D%B8%EB%A1%9C"
    );
  });

  it("builds an ITS trafficInfo URL for a bounding box", () => {
    const url = buildItsTrafficInfoUrl({
      apiKey: "its-key",
      minX: 126.35,
      maxX: 127.2,
      minY: 37.3,
      maxY: 37.7
    });

    assert.equal(
      url.toString(),
      "https://openapi.its.go.kr:9443/trafficInfo?apiKey=its-key&type=all&minX=126.35&maxX=127.2&minY=37.3&maxY=37.7&getType=json"
    );
  });

  it("builds a T-DATA hourly section URL for a 기준일", () => {
    const url = buildTDataHourlySectionUrl({
      apiKey: "td-key",
      date: "2026-05-19",
      startRow: 1,
      rowCnt: 1000
    });

    assert.equal(
      url.toString(),
      "https://t-data.seoul.go.kr/apig/apiman-gateway/tapi/TopisIccStTimesLinkTrfSectionStats/1.0?apikey=td-key&stndDt=20260519&startRow=1&rowCnt=1000"
    );
  });

  it("strips accidentally pasted T-DATA sample query parameters from the key", () => {
    const url = buildTDataHourlySectionUrl({
      apiKey: "td-key&stndDt=20210101",
      date: "2026-05-19"
    });

    assert.equal(url.searchParams.get("apikey"), "td-key");
    assert.equal(url.searchParams.get("stndDt"), "20260519");
  });

  it("normalizes T-DATA hourly section rows into Seoul hourly observations", () => {
    const rows = normalizeTDataHourlySectionItems([
      {
        axisName: "강변북로",
        stnd_dt: "20260519",
        time_cd: "16",
        link_id: "1020024400",
        st_node_nm: "가양대교북단",
        ed_node_nm: "성산대교북단",
        road_div_nm: "도시고속도로",
        avgSpd: "42.5"
      }
    ]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].sourceName, "tdata-hourly-section");
    assert.equal(rows[0].roadName, "강변북로");
    assert.equal(rows[0].sectionName, "가양대교북단→성산대교북단");
    assert.equal(rows[0].observedAt, "2026-05-19T15:00:00+09:00");
    assert.equal(rows[0].observedHour, 15);
    assert.equal(rows[0].granularity, "hour");
    assert.equal(rows[0].roadDivName, "도시고속도로");
    assert.equal(rows[0].speedKph, 42.5);
    assert.equal(rows[0].congestionLevel, "slow");
  });

  it("uses T-DATA axis codes when the road name is omitted", () => {
    const rows = normalizeTDataHourlySectionItems([
      {
        axisName: null,
        axisCd: "14",
        stndDt: "20260101",
        timeCd: "1",
        linkId: "2210000500",
        stNodeNm: "토평삼거리",
        edNodeNm: "강변북로구리시계",
        roadDivNm: "도시고속도로",
        avgSpd: "80"
      }
    ]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].roadName, "강변북로");
    assert.equal(rows[0].observedAt, "2026-01-01T00:00:00+09:00");
  });

  it("maps T-DATA time code 24 to the 23시 bucket", () => {
    const rows = normalizeTDataHourlySectionItems([
      {
        axisName: null,
        axisCd: "14",
        stndDt: "20260101",
        timeCd: "24",
        linkId: "2210000500",
        stNodeNm: "토평삼거리",
        edNodeNm: "강변북로구리시계",
        roadDivNm: "도시고속도로",
        avgSpd: "80"
      }
    ]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].observedHour, 23);
    assert.equal(rows[0].observedAt, "2026-01-01T23:00:00+09:00");
  });

  it("extracts T-DATA rows from common gateway response envelopes", () => {
    assert.deepEqual(
      extractTDataItems({
        data: [
          {
            axisName: "강변북로"
          }
        ]
      }),
      [
        {
          axisName: "강변북로"
        }
      ]
    );
    assert.deepEqual(extractTDataItems([{ axisName: "올림픽대로" }]), [{ axisName: "올림픽대로" }]);
  });

  it("normalizes ITS realtime trafficInfo items", () => {
    const rows = normalizeItsTrafficInfoItems(
      [
        {
          roadName: "경인고속도로",
          linkId: "123",
          startNodeId: "A",
          endNodeId: "B",
          speed: "22",
          travelTime: "12.5",
          createdDate: "20260519143001"
        }
      ],
      "인천"
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].region, "인천");
    assert.equal(rows[0].roadName, "경인고속도로");
    assert.equal(rows[0].observedAt, "2026-05-19T14:30:01+09:00");
    assert.equal(rows[0].travelTimeSeconds, 12.5);
    assert.equal(rows[0].congestionLevel, "congested");
  });

  it("extracts ITS trafficInfo XML items when the endpoint ignores getType=json", () => {
    const items = extractItsTrafficInfoXmlItems(`
      <response><body><items><item>
        <roadName>남문로</roadName>
        <linkId>1750000100</linkId>
        <startNodeId>3340015000</startNodeId>
        <endNodeId>1750000100</endNodeId>
        <speed>73</speed>
        <travelTime>12.01</travelTime>
        <createdDate>20260519144001</createdDate>
      </item></items></body></response>
    `);

    assert.deepEqual(items, [
      {
        roadName: "남문로",
        linkId: "1750000100",
        startNodeId: "3340015000",
        endNodeId: "1750000100",
        speed: "73",
        travelTime: "12.01",
        createdDate: "20260519144001"
      }
    ]);
  });

  it("parses date ranges inclusively in YYYY-MM-DD format", () => {
    assert.deepEqual(parseDateRange("2026-05-01", "2026-05-03"), [
      "2026-05-01",
      "2026-05-02",
      "2026-05-03"
    ]);
  });
});
