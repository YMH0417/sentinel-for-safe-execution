import * as fs from "fs";

/** Read JSON from disk, stripping a UTF-8 BOM if present (PowerShell Set-Content -Encoding utf8). */
export function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as T;
}
