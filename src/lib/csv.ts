export function decodeCsvBuffer(buffer: Buffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (!utf8.includes("\uFFFD")) return stripBom(utf8);
  return stripBom(new TextDecoder("euc-kr").decode(buffer));
}

export function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(lines.shift() ?? "").map((header) => header.trim());
  return lines.map((line) => Object.fromEntries(splitCsvLine(line).map((value, index) => [headers[index], value])));
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"" && line[index + 1] === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}
