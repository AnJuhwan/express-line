import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { queryFromCoverage, queryFromSearchParams, trafficQueryToSearchParams } from "./dashboard";

describe("dashboard query defaults", () => {
  it("uses a sole loaded coverage range when no date range is requested", () => {
    const query = queryFromSearchParams(new URLSearchParams(), [
      {
        sourceName: "seoul-urban-file",
        minDate: "2022-08-01",
        maxDate: "2022-08-01",
        status: "available",
        message: "real public data"
      }
    ]);

    assert.equal(query.startDate, "2022-08-01");
    assert.equal(query.endDate, "2022-08-01");
  });

  it("keeps explicit date filters ahead of loaded coverage", () => {
    const query = queryFromSearchParams(new URLSearchParams("startDate=2026-05-01&endDate=2026-05-19"), [
      {
        sourceName: "seoul-urban-file",
        minDate: "2022-08-01",
        maxDate: "2022-08-01",
        status: "available",
        message: "real public data"
      }
    ]);

    assert.equal(query.startDate, "2026-05-01");
    assert.equal(query.endDate, "2026-05-19");
  });

  it("keeps the current date default when multiple coverage ranges are available", () => {
    const query = queryFromSearchParams(new URLSearchParams(), [
      {
        sourceName: "its-realtime",
        minDate: "2026-05-19",
        maxDate: "2026-05-19",
        status: "available",
        message: "realtime public data"
      },
      {
        sourceName: "seoul-urban-file",
        minDate: "2022-08-01",
        maxDate: "2022-08-01",
        status: "available",
        message: "real public data"
      }
    ]);

    assert.equal(query.startDate, "2026-01-01");
    assert.equal(query.endDate, "2026-05-19");
  });

  it("builds a filter query from a loaded Seoul urban coverage row", () => {
    const query = queryFromCoverage(
      {
        startDate: "2026-01-01",
        endDate: "2026-05-19",
        region: "인천",
        roadName: "경인로",
        granularity: "hour",
        limit: 50000
      },
      {
        sourceName: "seoul-urban-file",
        minDate: "2022-08-01",
        maxDate: "2022-08-01",
        status: "available",
        message: "56732 observations loaded"
      }
    );

    assert.equal(query.startDate, "2022-08-01");
    assert.equal(query.endDate, "2022-08-01");
    assert.equal(query.region, "서울");
    assert.equal(query.roadName, "");
    assert.equal(query.granularity, "all");
  });

  it("defaults to a large observation window for virtualized browsing", () => {
    const query = queryFromSearchParams(new URLSearchParams());

    assert.equal(query.limit, 50000);
  });

  it("caps the observation window high enough for public traffic snapshots", () => {
    const query = queryFromSearchParams(new URLSearchParams("limit=250000"));

    assert.equal(query.limit, 100000);
  });

  it("serializes traffic query parameters for browser fetches", () => {
    const params = trafficQueryToSearchParams({
      startDate: "2026-01-01",
      endDate: "2026-05-19",
      region: "all",
      roadName: "강변북로",
      granularity: "all",
      limit: 50000
    });

    assert.equal(
      params.toString(),
      "startDate=2026-01-01&endDate=2026-05-19&region=all&roadName=%EA%B0%95%EB%B3%80%EB%B6%81%EB%A1%9C&granularity=all&limit=50000"
    );
  });

});
