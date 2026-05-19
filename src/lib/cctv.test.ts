import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCctvVideoReport,
  buildItsCctvInfoUrl,
  classifyCctvCorridor,
  extractItsCctvItems
} from "./cctv";

describe("cctv video helpers", () => {
  it("builds an ITS CCTV API URL for HTTPS MP4 clips", () => {
    const url = buildItsCctvInfoUrl({
      apiKey: "its-key",
      cctvType: "5",
      type: "all",
      minX: 126.8,
      maxX: 127.13,
      minY: 37.49,
      maxY: 37.6
    });

    assert.equal(
      url.toString(),
      "https://openapi.its.go.kr:9443/cctvInfo?apiKey=its-key&type=all&cctvType=5&minX=126.8&maxX=127.13&minY=37.49&maxY=37.6&getType=json"
    );
  });

  it("extracts ITS CCTV rows from the official response envelope", () => {
    assert.deepEqual(
      extractItsCctvItems({
        response: {
          data: [
            {
              cctvname: "[인천국제공항선] 방화대교남단(올림픽대로)",
              cctvformat: "MP4"
            }
          ]
        }
      }),
      [
        {
          cctvname: "[인천국제공항선] 방화대교남단(올림픽대로)",
          cctvformat: "MP4"
        }
      ]
    );
  });

  it("classifies corridor videos from road or camera names", () => {
    assert.equal(classifyCctvCorridor("방화대교남단(올림픽대로)", ""), "olympic");
    assert.equal(classifyCctvCorridor("방화대교북단", "강변북로"), "gangbyeonbuk");
    assert.equal(classifyCctvCorridor("목동교", "국회대로"), null);
  });

  it("reports that requested historical CCTV dates are not available through the APIs", async () => {
    const fetcher = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("cctvInfo")) {
        return jsonResponse({
          response: {
            data: [
              {
                roadsectionid: "airport-1",
                cctvname: "[인천국제공항선] 방화대교남단(올림픽대로)",
                cctvformat: "MP4",
                cctvurl: "https://example.test/current.mp4",
                coordx: "126.82",
                coordy: "37.58"
              }
            ]
          }
        });
      }

      return jsonResponse({ rows: [] });
    };

    const report = await buildCctvVideoReport({
      fetcher: fetcher as typeof fetch,
      itsApiKey: "its-key",
      includeTopis: false,
      now: new Date("2026-05-19T09:00:00+09:00")
    });

    assert.equal(report.request.startDate, "2026-05-16");
    assert.equal(report.request.endDate, "2026-05-19");
    assert.equal(report.historicalAccess.supported, false);
    assert.equal(report.its.status, "ok");
    assert.equal(report.its.matchedCount, 1);
    assert.equal(report.videos[0].sourceName, "ITS CCTV API");
    assert.equal(report.videos[0].historicalDateSupported, false);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
