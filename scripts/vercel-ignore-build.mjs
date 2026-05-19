import { execFileSync } from "node:child_process";

let changedFiles = [];

try {
  changedFiles = execFileSync("git", ["diff", "--name-only", "HEAD^", "HEAD"], {
    encoding: "utf8"
  })
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean);
} catch {
  process.exit(1);
}

const isRealtimeDataOnly =
  changedFiles.length > 0 &&
  changedFiles.every((file) => /^data\/realtime-traffic-\d{4}-\d{2}\.ndjson$/.test(file));

if (isRealtimeDataOnly) {
  console.log("Building realtime data-only commit so the production data explorer stays current.");
}

process.exit(1);
