import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { loadEnvFiles } from "./env";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  delete process.env.ITS_API_KEY;
});

describe("env loader", () => {
  it("loads .env.local without printing secrets", () => {
    const dir = mkdtempSync(join(tmpdir(), "traffic-env-"));
    dirs.push(dir);
    writeFileSync(join(dir, ".env.local"), "ITS_API_KEY=secret-value\n");

    loadEnvFiles(dir);

    assert.equal(process.env.ITS_API_KEY, "secret-value");
  });
});
