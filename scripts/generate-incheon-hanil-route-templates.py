#!/usr/bin/env python3
"""Generate requested-route JSON templates from the 2023 ITS node-link CSV."""

from __future__ import annotations

import argparse
import csv
import heapq
import json
from dataclasses import dataclass
from pathlib import Path


ROAD_RANK_LABELS = {
    "101": "고속도로",
    "102": "도시고속화도로",
    "103": "일반국도",
    "104": "특별/광역시도",
    "105": "국가지원지방도",
    "106": "지방도",
    "107": "시군도",
    "108": "기타",
}

RANK_MULTIPLIERS = {
    "101": 0.72,
    "102": 0.78,
    "103": 0.9,
    "104": 1.0,
    "105": 1.05,
    "106": 1.1,
    "107": 1.18,
    "108": 1.4,
}


@dataclass(frozen=True)
class Edge:
    link_id: str
    from_node: str
    from_name: str
    to_node: str
    to_name: str
    road_rank: str
    road_name: str
    length_m: float
    area: str


@dataclass(frozen=True)
class RouteSpec:
    route_id: str
    request_label: str
    matched_label: str
    start_node: str
    end_node: str


ROUTES = [
    RouteSpec(
        "incheon_hanil_to_mokdong_underpass",
        "인천 한일시멘트 → 올림픽대로",
        "인천 한일시멘트 → 목동지하차도서측",
        "1610139501",
        "1140030400",
    ),
    RouteSpec(
        "mokdong_underpass_to_incheon_hanil",
        "올림픽대로 → 인천 한일시멘트",
        "목동지하차도서측 → 인천 한일시멘트",
        "1140030400",
        "1610139501",
    ),
    RouteSpec(
        "incheon_hanil_to_jangsu",
        "인천 한일시멘트 → 장수IC",
        "인천 한일시멘트 → 장수IC남측",
        "1610139501",
        "1650003800",
    ),
    RouteSpec(
        "jangsu_to_incheon_hanil",
        "장수IC → 인천 한일시멘트",
        "장수IC남측 → 인천 한일시멘트",
        "1650003800",
        "1610139501",
    ),
    RouteSpec(
        "incheon_hanil_to_songdo_yonsei",
        "인천 한일시멘트 → 송도해안도로",
        "인천 한일시멘트 → 송도해안도로(송도3교앞)",
        "1610139501",
        "1640024200",
    ),
    RouteSpec(
        "songdo_yonsei_to_incheon_hanil",
        "송도해안도로 → 인천 한일시멘트",
        "송도해안도로(송도3교앞) → 인천 한일시멘트",
        "1640024200",
        "1610139501",
    ),
    RouteSpec(
        "incheon_hanil_to_andongpo_sageori",
        "인천 한일시멘트 → 안동포사거리",
        "인천 한일시멘트 → 안동포사거리",
        "1610139501",
        "1680028700",
    ),
    RouteSpec(
        "andongpo_sageori_to_incheon_hanil",
        "안동포사거리 → 인천 한일시멘트",
        "안동포사거리 → 인천 한일시멘트",
        "1680028700",
        "1610139501",
    ),
    RouteSpec(
        "incheon_hanil_to_mokdong_stadium",
        "인천 한일시멘트 → 목동 운동장",
        "인천 한일시멘트 → 목동야구장앞",
        "1610139501",
        "1140029800",
    ),
    RouteSpec(
        "mokdong_stadium_to_incheon_hanil",
        "목동 운동장 → 인천 한일시멘트",
        "목동야구장앞 → 인천 한일시멘트",
        "1140029800",
        "1610139501",
    ),
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("node_link_csv", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path("data/csv"))
    args = parser.parse_args()

    edges = read_edges(args.node_link_csv)
    graph = build_graph(edges)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    for spec in ROUTES:
        path = shortest_path(graph, spec.start_node, spec.end_node)
        if not path:
            raise SystemExit(f"No path found for {spec.route_id}")
        output_path = args.output_dir / f"{spec.route_id}.json"
        output_path.write_text(
            json.dumps(route_template(spec, path, args.node_link_csv), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        distance = sum(edge.length_m for edge in path)
        print(f"{spec.route_id}: {len(path)} links, {distance:,.0f}m")


def read_edges(path: Path) -> list[Edge]:
    edges: list[Edge] = []
    with path.open(encoding="cp949", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            link_id = clean(row.get("링크아이디"))
            if not link_id or link_id.startswith("("):
                continue
            length_m = float(clean(row.get("연장(M)")) or 0)
            if length_m <= 0:
                continue
            edges.append(
                Edge(
                    link_id=link_id,
                    from_node=clean(row.get("시점노드")),
                    from_name=clean(row.get("시점노드명")),
                    to_node=clean(row.get("종점노드")),
                    to_name=clean(row.get("종점노드명")),
                    road_rank=clean(row.get("도로등급")),
                    road_name=clean(row.get("도로명")) or "-",
                    length_m=length_m,
                    area=clean(row.get("링크권역")),
                )
            )
    return edges


def build_graph(edges: list[Edge]) -> dict[str, list[Edge]]:
    graph: dict[str, list[Edge]] = {}
    for edge in edges:
        graph.setdefault(edge.from_node, []).append(edge)
    return graph


def shortest_path(graph: dict[str, list[Edge]], start: str, end: str) -> list[Edge]:
    queue: list[tuple[float, str, list[Edge]]] = [(0, start, [])]
    best: dict[str, float] = {start: 0}

    while queue:
        cost, node, path = heapq.heappop(queue)
        if node == end:
            return path
        if cost > best.get(node, float("inf")):
            continue
        for edge in graph.get(node, []):
            next_cost = cost + edge_weight(edge)
            if next_cost >= best.get(edge.to_node, float("inf")):
                continue
            best[edge.to_node] = next_cost
            heapq.heappush(queue, (next_cost, edge.to_node, [*path, edge]))
    return []


def edge_weight(edge: Edge) -> float:
    multiplier = RANK_MULTIPLIERS.get(edge.road_rank, 1.2)
    unnamed_penalty = 120 if edge.road_name == "-" else 0
    return edge.length_m * multiplier + unnamed_penalty


def route_template(spec: RouteSpec, path: list[Edge], node_link_csv: Path) -> dict[str, object]:
    return {
        "메타": {
            "요청구간": spec.request_label,
            "실제매칭구간": spec.matched_label,
            "설명": f"{node_link_csv.name}의 표준노드링크에서 도로등급 가중 최단 경로로 매칭",
        },
        "구간목록": [link_row(edge, index) for index, edge in enumerate(path, start=1)],
    }


def link_row(edge: Edge, index: int) -> dict[str, object]:
    return {
        "순번": index,
        "링크아이디": edge.link_id,
        "도로명": edge.road_name,
        "도로등급": ROAD_RANK_LABELS.get(edge.road_rank, edge.road_rank),
        "도로권역": edge.area,
        "시점명": edge.from_name,
        "종점명": edge.to_name,
        "구간명": f"{edge.from_name} → {edge.to_name}",
        "연장_m": round(edge.length_m, 3),
    }


def clean(value: object) -> str:
    return str(value or "").strip()


if __name__ == "__main__":
    main()
