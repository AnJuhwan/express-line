interface VirtualWindowInput {
  rowCount: number;
  scrollTop: number;
  rowHeight: number;
  viewportHeight: number;
  overscan: number;
}

export interface VirtualWindow {
  startIndex: number;
  endIndex: number;
  totalHeight: number;
}

export function getVirtualWindow({
  rowCount,
  scrollTop,
  rowHeight,
  viewportHeight,
  overscan
}: VirtualWindowInput): VirtualWindow {
  if (rowCount <= 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      totalHeight: 0
    };
  }

  const safeScrollTop = Math.max(0, scrollTop);
  const safeOverscan = Math.max(0, overscan);
  const totalHeight = rowCount * rowHeight;
  const startIndex = Math.max(0, Math.floor(safeScrollTop / rowHeight) - safeOverscan);
  const endIndex = Math.min(rowCount, Math.ceil((safeScrollTop + viewportHeight) / rowHeight) + safeOverscan);

  return {
    startIndex,
    endIndex,
    totalHeight
  };
}
