import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getVirtualWindow } from "./virtual-table";

describe("virtual table window", () => {
  it("renders the first viewport with overscan", () => {
    const window = getVirtualWindow({
      rowCount: 1000,
      scrollTop: 0,
      rowHeight: 50,
      viewportHeight: 300,
      overscan: 4
    });

    assert.deepEqual(window, {
      startIndex: 0,
      endIndex: 10,
      totalHeight: 50000
    });
  });

  it("clamps the rendered range near the end of the dataset", () => {
    const window = getVirtualWindow({
      rowCount: 100,
      scrollTop: 4800,
      rowHeight: 50,
      viewportHeight: 300,
      overscan: 4
    });

    assert.deepEqual(window, {
      startIndex: 92,
      endIndex: 100,
      totalHeight: 5000
    });
  });

  it("handles empty tables without negative indexes", () => {
    const window = getVirtualWindow({
      rowCount: 0,
      scrollTop: 500,
      rowHeight: 50,
      viewportHeight: 300,
      overscan: 4
    });

    assert.deepEqual(window, {
      startIndex: 0,
      endIndex: 0,
      totalHeight: 0
    });
  });
});
