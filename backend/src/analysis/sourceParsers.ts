import { extname } from "path";
import { readFile } from "fs/promises";
import type {
  AnalysisIssue,
  InputFormat,
  InputRow,
  SourceLocation,
} from "./types.js";

function parseIssue(
  source: string,
  row: number,
  message: string
): AnalysisIssue {
  return {
    code: "PARSE_ERROR",
    severity: "error",
    message,
    location: { source, row },
  };
}

export function inferInputFormat(filePath: string): InputFormat {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".jsonl" || extension === ".ndjson") return "jsonl";
  if (extension === ".csv") return "csv";
  if (extension === ".json") return "json";
  throw new Error(
    `Cannot infer input format from "${extension || filePath}". Use --format json, jsonl, or csv.`
  );
}

export function parseJsonLines(text: string, source: string): InputRow[] {
  const rows: InputRow[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const location: SourceLocation = { source, row: index + 1 };
    try {
      rows.push({
        value: JSON.parse(index === 0 ? line.replace(/^\uFEFF/, "") : line),
        location,
      });
    } catch (error) {
      rows.push({
        location,
        parseIssue: parseIssue(
          source,
          index + 1,
          error instanceof Error ? error.message : "Invalid JSON"
        ),
      });
    }
  });
  return rows;
}

function extractJsonRecords(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [value];

  const candidate = value as Record<string, unknown>;
  for (const key of ["records", "events", "data", "items"]) {
    if (Array.isArray(candidate[key])) return candidate[key];
  }
  return [value];
}

export function parseJson(text: string, source: string): InputRow[] {
  try {
    const records = extractJsonRecords(JSON.parse(text));
    return records.map((value, index) => ({
      value,
      location: { source, row: index + 1 },
    }));
  } catch (error) {
    return [
      {
        location: { source, row: 1 },
        parseIssue: parseIssue(
          source,
          1,
          error instanceof Error ? error.message : "Invalid JSON"
        ),
      },
    ];
  }
}

/**
 * Small RFC 4180-compatible CSV reader. It handles escaped quotes, commas,
 * and newlines inside quoted fields without adding a runtime dependency.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (quoted) throw new Error("Unclosed quoted CSV field");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function coerceCsvValue(value: string): string | number | boolean | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
  }
  return value;
}

export function parseCsv(text: string, source: string): InputRow[] {
  try {
    const csvRows = parseCsvRows(text);
    if (csvRows.length === 0) return [];
    const headers = csvRows[0].map((header) => header.trim());
    if (headers.some((header) => !header)) {
      return [
        {
          location: { source, row: 1 },
          parseIssue: parseIssue(source, 1, "CSV headers must be non-empty"),
        },
      ];
    }
    if (new Set(headers).size !== headers.length) {
      return [
        {
          location: { source, row: 1 },
          parseIssue: parseIssue(
            source,
            1,
            "CSV headers must be unique"
          ),
        },
      ];
    }

    const result: InputRow[] = [];
    csvRows.slice(1).forEach((values, index) => {
      if (values.every((value) => value.trim() === "")) return;
      const rowNumber = index + 2;
      if (values.length !== headers.length) {
        result.push({
          location: { source, row: rowNumber },
          parseIssue: parseIssue(
            source,
            rowNumber,
            `Expected ${headers.length} columns but found ${values.length}`
          ),
        });
        return;
      }
      const value = Object.fromEntries(
        headers.map((header, column) => [
          header,
          coerceCsvValue(values[column]),
        ])
      );
      result.push({ value, location: { source, row: rowNumber } });
    });
    return result;
  } catch (error) {
    return [
      {
        location: { source, row: 1 },
        parseIssue: parseIssue(
          source,
          1,
          error instanceof Error ? error.message : "Invalid CSV"
        ),
      },
    ];
  }
}

export function parseInputText(
  text: string,
  format: InputFormat,
  source = "memory"
): InputRow[] {
  if (format === "jsonl") return parseJsonLines(text, source);
  if (format === "csv") return parseCsv(text, source);
  return parseJson(text, source);
}

export async function readInputFile(
  filePath: string,
  format?: InputFormat
): Promise<InputRow[]> {
  const text = await readFile(filePath, "utf8");
  return parseInputText(text, format ?? inferInputFormat(filePath), filePath);
}

export function rowsFromValues(
  values: unknown[],
  source = "memory"
): InputRow[] {
  return values.map((value, index) => ({
    value,
    location: { source, row: index + 1 },
  }));
}
