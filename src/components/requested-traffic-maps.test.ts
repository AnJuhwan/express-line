import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestedTrafficMaps } from "./requested-traffic-maps";
import type { RequestedTrafficMapGroup, RequestedTrafficMapSegment } from "@/lib/requested-traffic-maps";

describe("RequestedTrafficMaps", () => {
  it("allows page-specific hero wording for the Bucheon map page", () => {
    const html = renderToStaticMarkup(
      createElement(RequestedTrafficMaps, {
        groups: [trafficMapGroup()],
        reportHref: "/report",
        fiveMinuteHref: "/five-minute",
        hourlyHref: "/hourly",
        periodLabel: "06:00-18:00",
        dataLabel: "test",
        pageTitle: "부천 한일시멘트 ↔ 방화대교 지도",
        heroCopy: "부천 한일시멘트 기준 구간을 정리했습니다."
      })
    );

    assert.match(html, /부천 한일시멘트 ↔ 방화대교 지도/);
    assert.match(html, /부천 한일시멘트 기준 구간/);
    assert.doesNotMatch(html, /인천 한일시멘트 기준 요청 구간/);
  });

  it("renders a red/yellow/green status summary for every route direction", () => {
    const html = renderToStaticMarkup(
      createElement(RequestedTrafficMaps, {
        groups: [trafficMapGroup()],
        reportHref: "/report",
        fiveMinuteHref: "/five-minute",
        hourlyHref: "/hourly",
        periodLabel: "06:00-18:00",
        dataLabel: "test"
      })
    );

    assert.match(html, /traffic-status-overview/);
    assert.match(html, /traffic-status-tile smooth active/);
    assert.match(html, /traffic-status-tile slow active/);
    assert.match(html, /traffic-status-tile congested active/);
    assert.match(html, /원활/);
    assert.match(html, /서행/);
    assert.match(html, /정체/);
    assert.match(html, /1구간/);
  });

  it("renders colored route lines without cluttering the map with numbers or callouts", () => {
    const html = renderToStaticMarkup(
      createElement(RequestedTrafficMaps, {
        groups: [trafficMapGroup()],
        reportHref: "/report",
        fiveMinuteHref: "/five-minute",
        hourlyHref: "/hourly",
        periodLabel: "06:00-18:00",
        dataLabel: "test"
      })
    );

    assert.match(html, /traffic-route-line smooth/);
    assert.match(html, /traffic-route-line slow/);
    assert.match(html, /traffic-route-line congested/);
    assert.match(html, /traffic-route-terminal start/);
    assert.match(html, /traffic-route-terminal end/);
    assert.match(html, /출발/);
    assert.match(html, /도착/);
    assert.doesNotMatch(html, /중간/);
    assert.doesNotMatch(html, /traffic-map-section-marker/);
    assert.doesNotMatch(html, /traffic-congestion-list/);
    assert.doesNotMatch(html, /traffic-map-section-callout/);
  });

  it("rounds map coordinates so hydration stays stable", () => {
    const html = renderToStaticMarkup(
      createElement(RequestedTrafficMaps, {
        groups: [trafficMapGroup()],
        reportHref: "/report",
        fiveMinuteHref: "/five-minute",
        hourlyHref: "/hourly",
        periodLabel: "06:00-18:00",
        dataLabel: "test"
      })
    );
    const pointAttributes = [...html.matchAll(/points="([^"]+)"/g)].map((match) => match[1]);
    const styleAttributes = [...html.matchAll(/style="([^"]+)"/g)].map((match) => match[1]);

    assert.ok(pointAttributes.length > 0);
    assert.ok(pointAttributes.every((points) => !/\d+\.\d{5,}/.test(points)));
    assert.ok(styleAttributes.length > 0);
    assert.ok(styleAttributes.every((style) => !/\d+\.\d{5,}%/.test(style)));
  });

  it("renders a clean real map image with a prominent traffic route band", () => {
    const html = renderToStaticMarkup(
      createElement(RequestedTrafficMaps, {
        groups: [trafficMapGroup()],
        reportHref: "/report",
        fiveMinuteHref: "/five-minute",
        hourlyHref: "/hourly",
        periodLabel: "06:00-18:00",
        dataLabel: "test"
      })
    );

    assert.match(html, /korea-traffic-map/);
    assert.match(html, /traffic-route-shadow/);
    assert.match(html, /traffic-map-inline-legend/);
    assert.doesNotMatch(html, /traffic-map-chrome/);
    assert.doesNotMatch(html, /traffic-map-searchbar/);
    assert.doesNotMatch(html, /traffic-map-layer-toggle/);
    assert.doesNotMatch(html, /traffic-map-control-stack/);
  });

  it("renders one full-width map per direction instead of distance split maps", () => {
    const html = renderToStaticMarkup(
      createElement(RequestedTrafficMaps, {
        groups: [trafficMapGroup()],
        reportHref: "/report",
        fiveMinuteHref: "/five-minute",
        hourlyHref: "/hourly",
        periodLabel: "06:00-18:00",
        dataLabel: "test"
      })
    );

    assert.match(html, /전체 구간/);
    assert.doesNotMatch(html, /전반 50%/);
    assert.doesNotMatch(html, /후반 50%/);
    assert.match(html, /traffic-map-board/);
    assert.doesNotMatch(html, /map-split-toolbar/);
    assert.equal((html.match(/korea-traffic-map/g) ?? []).length, 1);
  });

  it("groups all route map bundles under each hour so a time slot can be reviewed at once", () => {
    const html = renderToStaticMarkup(
      createElement(RequestedTrafficMaps, {
        groups: [
          trafficMapGroup({
            title: "첫 구간",
            displayLabel: "첫 구간",
            actualLabel: "A ↔ D"
          }),
          trafficMapGroup({
            id: "incheon-junction-jangsu",
            routeId: "geyang_ic_to_jangsu_ic",
            requestLabel: "E → H",
            matchedLabel: "E → H",
            title: "둘째 구간",
            displayLabel: "둘째 구간",
            actualLabel: "E ↔ H"
          })
        ],
        reportHref: "/report",
        fiveMinuteHref: "/five-minute",
        hourlyHref: "/hourly",
        periodLabel: "06:00-18:00",
        dataLabel: "test"
      })
    );

    assert.match(html, /map-hour-section/);
    assert.match(html, /traffic-hour-group-grid/);
    assert.match(html, /06:00 전체 구간/);
    assert.ok(html.indexOf("06:00 전체 구간") < html.indexOf("첫 구간"));
    assert.ok(html.indexOf("06:00 전체 구간") < html.indexOf("둘째 구간"));
  });

  it("uses single-column map grids so paired items render on separate rows", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const stackRule = css.match(/\.requested-map-stack\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const directionListRule = css.match(/\.traffic-direction-map-list\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const boardRule = css.match(/\.traffic-map-board\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const splitMapRule = css.match(/\.traffic-map-display\.split \.korea-traffic-map\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const legendRule = css.match(/\.traffic-map-inline-legend\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

    assert.match(stackRule, /gap:\s*28px/);
    assert.match(css, /\.traffic-hour-group-grid\s*\{/);
    assert.match(directionListRule, /grid-template-columns:\s*1fr/);
    assert.match(boardRule, /grid-template-columns:\s*1fr/);
    assert.match(splitMapRule, /min-height/);
    assert.match(legendRule, /bottom:\s*14px/);
    assert.match(legendRule, /left:\s*14px/);
    assert.match(legendRule, /font-size:\s*12px/);
    assert.match(css, /@media print/);
    assert.match(css, /break-inside:\s*avoid/);
  });

  it("keeps the map route strokes aligned with the generated PDF weight", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const routeLineRule =
      [...css.matchAll(/^\.traffic-route-line\s*\{(?<body>[^}]+)\}/gm)]
        .map((match) => match.groups?.body ?? "")
        .find((body) => body.includes("stroke-width")) ?? "";
    const splitRouteLineRule =
      css.match(/^\.traffic-map-display\.split \.traffic-route-line\s*\{(?<body>[^}]+)\}/m)?.groups?.body ?? "";

    assert.match(routeLineRule, /stroke-width:\s*1\.05/);
    assert.match(splitRouteLineRule, /stroke-width:\s*1\.05/);
  });

  it("stretches the svg traffic overlay to the map box so lines align with markers", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const overlayRule = css.match(/\.traffic-route-overlay\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

    assert.match(overlayRule, /width:\s*100%/);
    assert.match(overlayRule, /height:\s*100%/);
  });

  it("keeps status pills from shrinking or clipping in tight map headings", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const pillRule = css.match(/\.pill\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

    assert.match(pillRule, /flex:\s*0 0 auto/);
    assert.match(pillRule, /line-height:\s*1/);
    assert.match(pillRule, /white-space:\s*nowrap/);
  });
});

function trafficMapGroup(overrides: {
  id?: string;
  routeId?: string;
  requestLabel?: string;
  matchedLabel?: string;
  title?: string;
  displayLabel?: string;
  actualLabel?: string;
} = {}): RequestedTrafficMapGroup {
  const routeId = overrides.routeId ?? "incheon_toll_to_mokdong_underpass";
  const requestLabel = overrides.requestLabel ?? "A → D";
  const matchedLabel = overrides.matchedLabel ?? "A → D";

  return {
    id: overrides.id ?? "incheon-hanil-cement-olympic",
    title: overrides.title ?? "테스트 구간",
    displayLabel: overrides.displayLabel ?? "테스트",
    actualLabel: overrides.actualLabel ?? "A ↔ D",
    directions: [
      {
        routeId,
        mapRouteId: routeId,
        requestLabel,
        matchedLabel,
        linkCount: 3
      }
    ],
    hours: [
      {
        hour: 6,
        label: "06:00",
        directions: [
          {
            routeId,
            mapRouteId: routeId,
            requestLabel,
            matchedLabel,
            linkCount: 3,
            hour: 6,
            label: "06:00",
            date: "2026-05-20",
            status: "정체",
            minSpeedKmh: 12,
            slowSegmentCount: 1,
            congestedSegmentCount: 1,
            blockedSegmentCount: 2,
            observationCount: 3,
            blockedSections: [
              section("b", "B → C", "서행", 28),
              section("c", "C → D", "정체", 12)
            ],
            segments: [
              segment("a", 1, "A → B", "원활", 62),
              segment("b", 2, "B → C", "서행", 28),
              segment("c", 3, "C → D", "정체", 12)
            ]
          }
        ]
      }
    ]
  };
}

function section(linkId: string, sectionName: string, status: RequestedTrafficMapSegment["status"], minSpeedKmh: number) {
  return {
    linkId,
    sectionName,
    roadName: "테스트로",
    status,
    minSpeedKmh
  };
}

function segment(
  linkId: string,
  order: number,
  sectionName: string,
  status: RequestedTrafficMapSegment["status"],
  minSpeedKmh: number
): RequestedTrafficMapSegment {
  return {
    ...section(linkId, sectionName, status, minSpeedKmh),
    order,
    fromName: sectionName.split(" → ")[0] ?? "-",
    toName: sectionName.split(" → ")[1] ?? "-",
    lengthMeters: status === "정체" ? 300 : 10,
    observationCount: 1,
    slowObservationCount: status === "서행" ? 1 : 0,
    congestedObservationCount: status === "정체" ? 1 : 0
  };
}
