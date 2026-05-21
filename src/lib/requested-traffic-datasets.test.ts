import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getRequestedTrafficDataset,
  requestedTrafficRoutesForReport
} from "./requested-traffic-datasets";

describe("requested traffic datasets", () => {
  it("keeps the default requested traffic dataset separate from the May 20 dataset", () => {
    const defaultDataset = getRequestedTrafficDataset();
    const may20Dataset = getRequestedTrafficDataset("20260520");

    assert.equal(defaultDataset.id, "default");
    assert.equal(defaultDataset.report.period, "2026-05-13 ~ 2026-05-15");
    assert.equal(defaultDataset.fiveMinuteHref, "/five-minute");
    assert.equal(defaultDataset.hourlyHref, "/hourly");

    assert.equal(may20Dataset.id, "20260520");
    assert.equal(may20Dataset.report.period, "2026-05-20 ~ 2026-05-20");
    assert.equal(may20Dataset.reportHref, "/2026-05-20");
    assert.equal(may20Dataset.fiveMinuteHref, "/2026-05-20/five-minute");
    assert.equal(may20Dataset.hourlyHref, "/2026-05-20/hourly");
    assert.equal(may20Dataset.apiDatasetParam, "20260520");
  });

  it("maps report routes into explorer route metadata", () => {
    const routes = requestedTrafficRoutesForReport(getRequestedTrafficDataset("20260520").report);

    assert.ok(routes.length > 0);
    assert.deepEqual(Object.keys(routes[0]).sort(), ["fiveMinuteRows", "id", "matchedLabel", "requestLabel"]);
    assert.ok(routes.some((route) => route.id === "incheon_toll_to_mokdong_underpass"));
    assert.ok(routes.some((route) => route.id === "mokdong_underpass_to_incheon_toll"));
  });
});
