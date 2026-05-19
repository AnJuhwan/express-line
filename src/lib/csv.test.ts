import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeCsvBuffer, parseCsv } from "./csv";

describe("CSV helpers", () => {
  it("decodes CP949 public-data CSV buffers", () => {
    const text = decodeCsvBuffer(Buffer.from([0xb1, 0xe2, 0xb0, 0xa3]));

    assert.equal(text, "기간");
  });

  it("parses quoted CSV rows into objects", () => {
    const rows = parseCsv('도로명,구간명,속도\n"강변북로","A,B",27.5\n');

    assert.deepEqual(rows, [{ "도로명": "강변북로", "구간명": "A,B", "속도": "27.5" }]);
  });
});
