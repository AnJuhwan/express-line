import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REQUESTED_TRAFFIC_MAP_VIEWPORTS,
  REQUESTED_TRAFFIC_ROUTE_GEOMETRIES,
  buildCenteredRouteViewport,
  buildFocusedTrafficViewport,
  buildOsmTiles,
  buildProjectedRouteLandmarks,
  buildProjectedRoutePath,
  buildProjectedTrafficSegmentPaths,
  buildRouteDistanceSplitViewports,
  projectLatLngToPercent
} from "./requested-traffic-map-geometry";
import type { RequestedTrafficMapSegment } from "./requested-traffic-maps";

describe("requested traffic map geometry", () => {
  it("builds real Korea map tiles for the Seoul/Incheon viewport", () => {
    const viewport = REQUESTED_TRAFFIC_MAP_VIEWPORTS["incheon-hanil-cement-olympic"];
    const tiles = buildOsmTiles(viewport);

    assert.ok(tiles.length > 0);
    assert.ok(tiles.every((tile) => tile.url.startsWith("https://tile.openstreetmap.org/")));
    assert.ok(tiles.every((tile) => tile.leftPercent <= 100 && tile.topPercent <= 100));
    assert.ok(tiles.every((tile) => tile.widthPercent > 0 && tile.heightPercent > 0));
  });

  it("projects Korean coordinates into map percentages and slices route paths by traffic segments", () => {
    const viewport = REQUESTED_TRAFFIC_MAP_VIEWPORTS["incheon-hanil-cement-olympic"];
    const projected = projectLatLngToPercent({ lat: 37.529, lng: 126.82 }, viewport);

    assert.ok(projected.xPercent > 0 && projected.xPercent < 100);
    assert.ok(projected.yPercent > 0 && projected.yPercent < 100);

    const paths = buildProjectedTrafficSegmentPaths(
      "incheon_toll_to_mokdong_underpass",
      [
        trafficSegment("a", 500, "원활"),
        trafficSegment("b", 1000, "정체")
      ],
      viewport
    );

    assert.equal(paths.length, 2);
    assert.ok(paths.every((path) => path.points.length >= 2));
    assert.equal(paths[1].segment.status, "정체");
  });

  it("builds a route-specific viewport that centers the colored traffic line", () => {
    const viewport = buildCenteredRouteViewport(
      "gangbyeonbukro_jamsil_to_banghwa",
      REQUESTED_TRAFFIC_MAP_VIEWPORTS["olympic-gangbyeonbukro-banghwa"]
    );
    const paths = buildProjectedTrafficSegmentPaths(
      "gangbyeonbukro_jamsil_to_banghwa",
      [
        trafficSegment("a", 1000, "원활"),
        trafficSegment("b", 1000, "서행"),
        trafficSegment("c", 1000, "정체")
      ],
      viewport
    );
    const points = paths.flatMap((path) => path.points);
    const minX = Math.min(...points.map((point) => point.xPercent));
    const maxX = Math.max(...points.map((point) => point.xPercent));
    const minY = Math.min(...points.map((point) => point.yPercent));
    const maxY = Math.max(...points.map((point) => point.yPercent));

    assert.ok(minX > 4 && maxX < 96);
    assert.ok(minY > 4 && maxY < 96);
    assert.ok((minX + maxX) / 2 > 42 && (minX + maxX) / 2 < 58);
    assert.ok((minY + maxY) / 2 > 42 && (minY + maxY) / 2 < 58);
  });

  it("returns one continuous base path so the map line never looks broken", () => {
    const viewport = buildCenteredRouteViewport(
      "incheon_toll_to_mokdong_underpass",
      REQUESTED_TRAFFIC_MAP_VIEWPORTS["incheon-hanil-cement-olympic"]
    );
    const basePath = buildProjectedRoutePath("incheon_toll_to_mokdong_underpass", viewport);
    const statusPaths = buildProjectedTrafficSegmentPaths(
      "incheon_toll_to_mokdong_underpass",
      [
        trafficSegment("a", 500, "원활"),
        trafficSegment("b", 500, "서행"),
        trafficSegment("c", 500, "정체")
      ],
      viewport
    );

    assert.ok(basePath.length > statusPaths.length);
    assert.ok(statusPaths.every((path) => path.points.length >= 2));
  });

  it("uses actual Gyeongin Expressway and Gukhoe-daero road geometry for the Mokdong/Incheon route", () => {
    const eastbound = REQUESTED_TRAFFIC_ROUTE_GEOMETRIES.incheon_toll_to_mokdong_underpass;
    const westbound = REQUESTED_TRAFFIC_ROUTE_GEOMETRIES.mokdong_underpass_to_incheon_toll;

    assert.ok(eastbound.length >= 60);
    assert.ok(westbound.length >= 60);
    assert.ok(Math.min(...eastbound.map((point) => point.lng)) > 126.74);
    assert.ok(Math.min(...westbound.map((point) => point.lng)) > 126.74);
    assert.ok(Math.abs(eastbound[0].lng - 126.7508) < 0.001);
    assert.ok(Math.abs(westbound.at(-1)!.lng - 126.7508) < 0.001);
    assert.ok(eastbound.some((point) => point.lat < 37.522 && point.lng > 126.8 && point.lng < 126.81));
    assert.ok(westbound.some((point) => point.lat < 37.522 && point.lng > 126.8 && point.lng < 126.81));
  });

  it("uses dense road-following geometries for every real-map route overlay", () => {
    const routeIds = [
      "geyang_ic_to_jangsu_ic",
      "jangsu_ic_to_geyang_ic",
      "gangbyeonbukro_banghwa_to_jamsil",
      "gangbyeonbukro_jamsil_to_banghwa",
      "gangbyeonbukro_banghwa_to_cheonho",
      "gangbyeonbukro_cheonho_to_banghwa"
    ];

    for (const routeId of routeIds) {
      const geometry = REQUESTED_TRAFFIC_ROUTE_GEOMETRIES[routeId];
      const longestEdgeMeters = maxEdgeDistanceMeters(geometry);

      assert.ok(geometry.length >= 25, `${routeId} should have enough points to follow the road`);
      assert.ok(longestEdgeMeters < 1600, `${routeId} has a ${Math.round(longestEdgeMeters)}m straight jump`);
    }
  });

  it("uses detailed Capital Region First Ring Expressway geometry for the Geyang/Jangsu route", () => {
    const southbound = REQUESTED_TRAFFIC_ROUTE_GEOMETRIES.geyang_ic_to_jangsu_ic;
    const northbound = REQUESTED_TRAFFIC_ROUTE_GEOMETRIES.jangsu_ic_to_geyang_ic;

    assert.ok(southbound.length >= 60);
    assert.ok(northbound.length >= 60);
    assert.ok(Math.abs(southbound[0].lat - 37.541) < 0.003);
    assert.ok(Math.abs(southbound[0].lng - 126.75) < 0.003);
    assert.ok(Math.abs(southbound.at(-1)!.lat - 37.464) < 0.003);
    assert.ok(Math.abs(southbound.at(-1)!.lng - 126.753) < 0.003);
    assert.ok(Math.abs(northbound[0].lat - 37.464) < 0.003);
    assert.ok(Math.abs(northbound[0].lng - 126.753) < 0.003);
    assert.ok(Math.abs(northbound.at(-1)!.lat - 37.541) < 0.003);
    assert.ok(Math.abs(northbound.at(-1)!.lng - 126.75) < 0.003);
  });

  it("projects major route landmarks for the callout labels on the map", () => {
    const viewport = buildCenteredRouteViewport(
      "gangbyeonbukro_banghwa_to_jamsil",
      REQUESTED_TRAFFIC_MAP_VIEWPORTS["olympic-gangbyeonbukro-banghwa"]
    );
    const landmarks = buildProjectedRouteLandmarks("gangbyeonbukro_banghwa_to_jamsil", viewport);

    assert.ok(landmarks.length >= 4);
    assert.ok(landmarks.some((landmark) => landmark.label === "가양대교"));
    assert.ok(landmarks.every((landmark) => landmark.xPercent > 0 && landmark.xPercent < 100));
    assert.ok(landmarks.every((landmark) => landmark.yPercent > 0 && landmark.yPercent < 100));
  });

  it("zooms into slow and congested segments for detail maps", () => {
    const routeId = "gangbyeonbukro_banghwa_to_jamsil";
    const overview = buildCenteredRouteViewport(routeId, REQUESTED_TRAFFIC_MAP_VIEWPORTS["olympic-gangbyeonbukro-banghwa"]);
    const segments = [
      trafficSegment("a", 2000, "원활"),
      trafficSegment("b", 2000, "정체"),
      trafficSegment("c", 2000, "서행"),
      trafficSegment("d", 2000, "원활")
    ];
    const focused = buildFocusedTrafficViewport(
      routeId,
      segments,
      overview
    );
    const overviewSpan = (overview.north - overview.south) * (overview.east - overview.west);
    const focusedSpan = (focused.north - focused.south) * (focused.east - focused.west);
    const paths = buildProjectedTrafficSegmentPaths(routeId, segments, focused);
    const points = paths.filter((path) => path.segment.status !== "원활").flatMap((path) => path.points);

    assert.ok(focusedSpan < overviewSpan);
    assert.ok(focused.zoom >= overview.zoom);
    assert.ok(points.every((point) => point.xPercent > -5 && point.xPercent < 105));
    assert.ok(points.every((point) => point.yPercent > -5 && point.yPercent < 105));
  });

  it("splits a full route image into two distance-based detailed map viewports", () => {
    const routeId = "mokdong_underpass_to_incheon_toll";
    const wholeViewport = buildCenteredRouteViewport(
      routeId,
      REQUESTED_TRAFFIC_MAP_VIEWPORTS["incheon-hanil-cement-olympic"]
    );
    const splitViewports = buildRouteDistanceSplitViewports(routeId, wholeViewport);
    const segments = [
      trafficSegment("a", 1000, "원활"),
      trafficSegment("b", 1000, "서행"),
      trafficSegment("c", 1000, "정체"),
      trafficSegment("d", 1000, "원활")
    ];

    assert.equal(splitViewports.length, 2);
    assert.deepEqual(
      splitViewports.map((split) => [split.startRatio, split.endRatio]),
      [
        [0, 0.5],
        [0.5, 1]
      ]
    );
    assert.deepEqual(
      splitViewports.map((split) => split.caption),
      ["전반 50%", "후반 50%"]
    );

    for (const split of splitViewports) {
      const basePath = buildProjectedRoutePath(routeId, split.viewport, split);
      const trafficPaths = buildProjectedTrafficSegmentPaths(routeId, segments, split.viewport, split);
      const splitSpan = viewportArea(split.viewport);
      const wholeSpan = viewportArea(wholeViewport);

      assert.ok(splitSpan < wholeSpan);
      assert.ok(basePath.every((point) => point.xPercent > 0 && point.xPercent < 100));
      assert.ok(basePath.every((point) => point.yPercent > 0 && point.yPercent < 100));
      assert.ok(trafficPaths.length > 0);
      assert.ok(trafficPaths.every((path) => path.points.length >= 2));
    }
  });

  it("keeps north-south split maps wide enough that map tiles are not visibly stretched", () => {
    const routeId = "geyang_ic_to_jangsu_ic";
    const wholeViewport = buildCenteredRouteViewport(
      routeId,
      REQUESTED_TRAFFIC_MAP_VIEWPORTS["incheon-junction-jangsu"]
    );
    const splitViewports = buildRouteDistanceSplitViewports(routeId, wholeViewport);

    assert.equal(splitViewports.length, 2);
    assert.ok(splitViewports.every((split) => split.viewport.east - split.viewport.west > 0.09));
  });

});

function trafficSegment(
  linkId: string,
  lengthMeters: number,
  status: RequestedTrafficMapSegment["status"]
): RequestedTrafficMapSegment {
  return {
    order: 1,
    linkId,
    roadName: "테스트로",
    fromName: "A",
    toName: "B",
    sectionName: "A → B",
    lengthMeters,
    status,
    minSpeedKmh: 20,
    observationCount: 1,
    slowObservationCount: status === "서행" ? 1 : 0,
    congestedObservationCount: status === "정체" ? 1 : 0
  };
}

function viewportArea(viewport: { north: number; south: number; east: number; west: number }): number {
  return (viewport.north - viewport.south) * (viewport.east - viewport.west);
}

function maxEdgeDistanceMeters(points: Array<{ lat: number; lng: number }>): number {
  return Math.max(...points.slice(0, -1).map((point, index) => distanceMeters(point, points[index + 1])));
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
