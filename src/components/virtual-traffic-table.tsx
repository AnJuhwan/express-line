"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TRAFFIC_SECTION_LABEL, displayRoadDivName, displayRoadName, displaySectionName, sourceLabel } from "@/lib/display";
import type { TrafficObservationRow } from "@/lib/types";
import { getVirtualWindow, type VirtualWindow } from "@/lib/virtual-table";

const VIRTUAL_ROW_HEIGHT = 58;
const VIRTUAL_VIEWPORT_HEIGHT = 620;
const VIRTUAL_OVERSCAN = 12;

interface VirtualTrafficTableProps {
  rows?: TrafficObservationRow[];
  rowCount?: number;
  getRow?: (index: number) => TrafficObservationRow | undefined;
  onWindowChange?: (window: VirtualWindow) => void;
  resetKey?: string;
  emptyState?: ReactNode;
}

export function VirtualTrafficTable({
  rows = [],
  rowCount,
  getRow,
  onWindowChange,
  resetKey,
  emptyState
}: VirtualTrafficTableProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const totalRows = rowCount ?? rows.length;
  const resetToken = resetKey ?? rows;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setScrollTop(0);
      if (viewportRef.current) viewportRef.current.scrollTop = 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [resetToken]);

  const virtualRows = useMemo(() => {
    const window = getVirtualWindow({
      rowCount: totalRows,
      scrollTop,
      rowHeight: VIRTUAL_ROW_HEIGHT,
      viewportHeight: VIRTUAL_VIEWPORT_HEIGHT,
      overscan: VIRTUAL_OVERSCAN
    });

    return {
      ...window,
      rowIndexes: Array.from({ length: window.endIndex - window.startIndex }, (_, offset) => window.startIndex + offset)
    };
  }, [scrollTop, totalRows]);

  useEffect(() => {
    onWindowChange?.({
      startIndex: virtualRows.startIndex,
      endIndex: virtualRows.endIndex,
      totalHeight: virtualRows.totalHeight
    });
  }, [onWindowChange, virtualRows.endIndex, virtualRows.startIndex, virtualRows.totalHeight]);

  if (!totalRows) {
    return (
      <div className="table-wrap">
        {emptyState ?? (
          <div className="empty-state">
            <strong>표시할 데이터가 없습니다.</strong>
            <span>날짜 범위나 필터를 바꿔 다시 조회하세요.</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <div className="virtual-table" role="table" aria-rowcount={totalRows + 1}>
        <div className="virtual-table-header" role="row">
          <div role="columnheader">날짜</div>
          <div role="columnheader">시간</div>
          <div role="columnheader">지역</div>
          <div role="columnheader">도로명</div>
          <div role="columnheader">도로구분</div>
          <div role="columnheader">{TRAFFIC_SECTION_LABEL}</div>
          <div role="columnheader">속도</div>
          <div role="columnheader">교통량</div>
          <div role="columnheader">혼잡</div>
          <div role="columnheader">원천</div>
        </div>
        <div
          ref={viewportRef}
          className="virtual-table-body"
          role="rowgroup"
          tabIndex={0}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <div className="virtual-table-spacer" style={{ height: virtualRows.totalHeight }}>
            {virtualRows.rowIndexes.map((rowIndex) => {
              const row = getRow ? getRow(rowIndex) : rows[rowIndex];
              if (!row) {
                return (
                  <div
                    key={`loading-${rowIndex}`}
                    className="virtual-table-row loading"
                    role="row"
                    aria-rowindex={rowIndex + 2}
                    aria-busy="true"
                    style={{ height: VIRTUAL_ROW_HEIGHT, transform: `translateY(${rowIndex * VIRTUAL_ROW_HEIGHT}px)` }}
                  >
                    <div className="virtual-table-cell span-all" role="cell">불러오는 중</div>
                  </div>
                );
              }

              return (
                <div
                  key={row.id}
                  className="virtual-table-row"
                  role="row"
                  aria-rowindex={rowIndex + 2}
                  style={{ height: VIRTUAL_ROW_HEIGHT, transform: `translateY(${rowIndex * VIRTUAL_ROW_HEIGHT}px)` }}
                >
                  <div className="virtual-table-cell mono" role="cell" title={row.observedDate}>{row.observedDate}</div>
                  <div className="virtual-table-cell mono" role="cell">{String(row.observedHour).padStart(2, "0")}</div>
                  <div className="virtual-table-cell" role="cell">{row.region}</div>
                  <div className="virtual-table-cell strong" role="cell" title={displayRoadName(row.roadName)}>
                    {displayRoadName(row.roadName)}
                  </div>
                  <div className="virtual-table-cell" role="cell" title={displayRoadDivName(row)}>
                    {displayRoadDivName(row)}
                  </div>
                  <div className="virtual-table-cell" role="cell" title={displaySectionName(row)}>
                    {displaySectionName(row)}
                  </div>
                  <div className="virtual-table-cell mono" role="cell">{formatSpeed(row.speedKph)}</div>
                  <div className="virtual-table-cell mono" role="cell">{formatOptionalNumber(row.trafficVolume)}</div>
                  <div className="virtual-table-cell" role="cell">
                    <span className={`pill ${row.congestionLevel}`}>{row.congestionLabel}</span>
                  </div>
                  <div className="virtual-table-cell" role="cell" title={sourceLabel(row.sourceName)}>
                    {sourceLabel(row.sourceName)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatSpeed(speedKph: number | null): string {
  return speedKph == null ? "-" : `${Number(speedKph.toFixed(1)).toLocaleString("ko-KR")} km/h`;
}

function formatOptionalNumber(value: number | null): string {
  return value == null ? "-" : Number(value.toFixed(1)).toLocaleString("ko-KR");
}
