import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TRAFFIC_QUICK_VIEWS } from "./traffic-quick-views";

describe("traffic quick views", () => {
  it("includes the requested realtime route shortcuts", () => {
    assert.deepEqual(
      TRAFFIC_QUICK_VIEWS.map((view) => view.label),
      [
        "올림픽 방화→잠실",
        "올림픽 잠실→방화",
        "강변북로 방화→천호",
        "강변북로 천호→방화",
        "계양IC→장수IC",
        "장수IC→계양IC",
        "신월IC 정체"
      ]
    );
  });

  it("maps requested shortcuts to queryable road and section terms", () => {
    const gyeyangToJangsu = TRAFFIC_QUICK_VIEWS.find((view) => view.label === "계양IC→장수IC");
    const jangsuToGyeyang = TRAFFIC_QUICK_VIEWS.find((view) => view.label === "장수IC→계양IC");
    const sinwol = TRAFFIC_QUICK_VIEWS.find((view) => view.label === "신월IC 정체");

    assert.equal(gyeyangToJangsu?.query.region, "all");
    assert.equal(gyeyangToJangsu?.query.roadName, "수도권제1순환고속도로");
    assert.equal(jangsuToGyeyang?.query.region, "all");
    assert.equal(jangsuToGyeyang?.query.roadName, "수도권제1순환고속도로");
    assert.equal(sinwol?.query.region, "all");
    assert.equal(sinwol?.query.roadName, "신월");
  });
});
