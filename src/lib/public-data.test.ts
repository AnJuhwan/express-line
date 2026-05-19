import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectPublicRoadObservations, queryFreshPublicRoadTraffic } from "./public-data";

describe("public road data lookup", () => {
  it("requests public traffic data with the road name and caps rows at the query limit", async () => {
    const requestedUrls: URL[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      requestedUrls.push(url);
      assert.equal(url.searchParams.get("roadName"), "경인로");
      assert.equal(url.searchParams.get("numOfRows"), "2");

      return Response.json({
        response: {
          body: {
            items: {
              item: [
                { roadName: "경인로", linkId: "L-1", sectionName: "A-B", speed: "41.2" },
                { roadName: "경인로", linkId: "L-2", sectionName: "B-C", speed: "36.8" },
                { roadName: "올림픽대로", linkId: "L-3", sectionName: "C-D", speed: "55" }
              ]
            }
          }
        }
      });
    };

    const result = await collectPublicRoadObservations(
      {
        startDate: "2026-05-19",
        endDate: "2026-05-19",
        region: "all",
        roadName: "경인로",
        granularity: "all",
        limit: 2
      },
      {
        fetcher,
        publicDataServiceKey: "public-key",
        limit: 2
      }
    );

    assert.equal(requestedUrls.length, 1);
    assert.deepEqual(result.rows.map((row) => row.roadName), ["경인로", "경인로"]);
    assert.equal(result.rows.length, 2);
  });

  it("materializes freshly fetched public rows for the traffic query", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({
        response: {
          body: {
            items: {
              item: [{ roadName: "경인로", linkId: "L-1", sectionName: "A-B", speed: "41.2" }]
            }
          }
        }
      });

    const result = await queryFreshPublicRoadTraffic(
      {
        startDate: "2026-05-19",
        endDate: "2026-05-19",
        region: "all",
        roadName: "경인로",
        granularity: "all",
        limit: 50000
      },
      {
        fetcher,
        publicDataServiceKey: "public-key"
      }
    );

    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].roadName, "경인로");
    assert.equal(result.rows[0].sourceName, "incheon-speed-api");
    assert.deepEqual(result.roadOptions, [{ region: "인천", roadName: "경인로" }]);
  });

  it("uses ITS public data directly for Seoul urban road names", async () => {
    const requestedUrls: URL[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      requestedUrls.push(url);
      assert.equal(url.hostname, "openapi.its.go.kr");

      return Response.json({
        response: {
          body: {
            items: {
              item: [{ roadName: "강변북로", linkId: "S-1", startNodeId: "A", endNodeId: "B", speed: "47", createdDate: "20260519143001" }]
            }
          }
        }
      });
    };

    const result = await collectPublicRoadObservations(
      {
        startDate: "2026-05-19",
        endDate: "2026-05-19",
        region: "all",
        roadName: "강변북로",
        granularity: "all",
        limit: 50000
      },
      {
        fetcher,
        itsApiKey: "its-key",
        publicDataServiceKey: "public-key"
      }
    );

    assert.equal(requestedUrls.length, 1);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].region, "서울");
    assert.equal(result.rows[0].sourceName, "its-realtime");
  });

  it("uses T-DATA hourly section rows for Seoul urban road history when a key is available", async () => {
    const requestedUrls: URL[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      requestedUrls.push(url);
      assert.equal(url.hostname, "t-data.seoul.go.kr");
      assert.equal(url.searchParams.get("stndDt"), "20260519");

      return Response.json({
        data: [
          {
            axisName: "강변북로",
            stnd_dt: "20260519",
            time_cd: "0",
            link_id: "S-1",
            st_node_nm: "가양대교북단",
            ed_node_nm: "성산대교북단",
            road_div_nm: "도시고속도로",
            avgSpd: "56"
          }
        ]
      });
    };

    const result = await collectPublicRoadObservations(
      {
        startDate: "2026-05-19",
        endDate: "2026-05-19",
        region: "all",
        roadName: "강변북로",
        granularity: "all",
        limit: 50000
      },
      {
        fetcher,
        tdataApiKey: "tdata-key",
        itsApiKey: "its-key"
      }
    );

    assert.equal(requestedUrls.length, 1);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].observedHour, 0);
    assert.equal(result.rows[0].sourceName, "tdata-hourly-section");
  });

  it("filters T-DATA hourly section rows by configured road division name", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({
        data: [
          {
            axisName: "강변북로",
            stnd_dt: "20260519",
            time_cd: "0",
            link_id: "S-1",
            st_node_nm: "가양대교북단",
            ed_node_nm: "성산대교북단",
            road_div_nm: "도시고속도로",
            avgSpd: "56"
          },
          {
            axisName: "강변북로",
            stnd_dt: "20260519",
            time_cd: "0",
            link_id: "S-2",
            st_node_nm: "가양대교북단",
            ed_node_nm: "성산대교북단",
            road_div_nm: "일반도로",
            avgSpd: "22"
          }
        ]
      });

    const result = await collectPublicRoadObservations(
      {
        startDate: "2026-05-19",
        endDate: "2026-05-19",
        region: "all",
        roadName: "강변북로",
        granularity: "all",
        limit: 50000
      },
      {
        fetcher,
        tdataApiKey: "tdata-key",
        tdataRoadDivName: "도시고속도로"
      }
    );

    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].linkId, "S-1");
    assert.equal(result.rows[0].roadDivName, "도시고속도로");
  });
});
