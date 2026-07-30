import { readFile } from "fs/promises";
import type {
  AnalysisDefinition,
  CanonicalField,
  FieldSelector,
  NumericRange,
} from "./types.js";

const canonicalFields = new Set<CanonicalField>([
  "id",
  "timestamp",
  "category",
  "outcome",
  "score",
  "entityId",
  "actorId",
]);
const forbiddenMappingNames = new Set([
  ...Object.getOwnPropertyNames(Object.prototype),
  "prototype",
]);

function isSelector(value: unknown): value is FieldSelector {
  return (
    (typeof value === "string" && value.trim().length > 0) ||
    (Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        (entry) => typeof entry === "string" && entry.trim().length > 0
      ))
  );
}

function assertSelectorMap(
  value: unknown,
  label: string
): asserts value is Record<string, FieldSelector> {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  for (const [name, selector] of Object.entries(value)) {
    if (
      !name.trim() ||
      forbiddenMappingNames.has(name) ||
      !isSelector(selector)
    ) {
      throw new Error(`${label}.${name || "<empty>"} must be a field selector`);
    }
  }
}

function assertStringArray(value: unknown, label: string): void {
  if (
    value !== undefined &&
    (!Array.isArray(value) ||
      !value.every(
        (entry) => typeof entry === "string" && entry.trim().length > 0
      ))
  ) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
}

function assertRange(value: unknown, label: string): asserts value is NumericRange {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const candidate = value as Record<string, unknown>;
  for (const bound of ["min", "max"]) {
    if (
      candidate[bound] !== undefined &&
      (typeof candidate[bound] !== "number" ||
        !Number.isFinite(candidate[bound]))
    ) {
      throw new Error(`${label}.${bound} must be a finite number`);
    }
  }
  if (
    typeof candidate.min === "number" &&
    typeof candidate.max === "number" &&
    candidate.min > candidate.max
  ) {
    throw new Error(`${label}.min cannot exceed max`);
  }
}

export function validateDefinition(value: unknown): AnalysisDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Analysis definition must be an object");
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.name !== "string" || !candidate.name.trim()) {
    throw new Error("Analysis definition name is required");
  }
  if (typeof candidate.version !== "string" || !candidate.version.trim()) {
    throw new Error("Analysis definition version is required");
  }
  if (
    !candidate.fields ||
    typeof candidate.fields !== "object" ||
    Array.isArray(candidate.fields)
  ) {
    throw new Error("Analysis definition fields are required");
  }

  const fields = candidate.fields as Record<string, unknown>;
  for (const required of ["id", "timestamp", "category"]) {
    if (!isSelector(fields[required])) {
      throw new Error(`Analysis definition fields.${required} is required`);
    }
  }
  for (const optional of ["outcome", "score", "entityId", "actorId"]) {
    if (fields[optional] !== undefined && !isSelector(fields[optional])) {
      throw new Error(`Analysis definition fields.${optional} is invalid`);
    }
  }

  assertSelectorMap(candidate.dimensions, "dimensions");
  assertSelectorMap(candidate.metrics, "metrics");

  if (
    candidate.required !== undefined &&
    (!Array.isArray(candidate.required) ||
      !candidate.required.every(
        (field) =>
          typeof field === "string" &&
          canonicalFields.has(field as CanonicalField)
      ))
  ) {
    throw new Error("required must contain canonical field names");
  }
  if (candidate.required !== undefined) {
    for (const baseField of ["id", "timestamp", "category"] as const) {
      if (!candidate.required.includes(baseField)) {
        throw new Error(
          `required must include the canonical field "${baseField}"`
        );
      }
    }
  }
  for (const required of (candidate.required ?? []) as CanonicalField[]) {
    if (fields[required] === undefined) {
      throw new Error(
        `required field "${required}" must have a selector in fields`
      );
    }
  }

  assertStringArray(candidate.allowedCategories, "allowedCategories");
  assertStringArray(candidate.allowedOutcomes, "allowedOutcomes");

  if (candidate.ranges !== undefined) {
    if (
      !candidate.ranges ||
      typeof candidate.ranges !== "object" ||
      Array.isArray(candidate.ranges)
    ) {
      throw new Error("ranges must be an object");
    }
    const ranges = candidate.ranges as Record<string, unknown>;
    if (ranges.score !== undefined) assertRange(ranges.score, "ranges.score");
    if (ranges.metrics !== undefined) {
      if (
        !ranges.metrics ||
        typeof ranges.metrics !== "object" ||
        Array.isArray(ranges.metrics)
      ) {
        throw new Error("ranges.metrics must be an object");
      }
      for (const [name, range] of Object.entries(ranges.metrics)) {
        if (
          !candidate.metrics ||
          typeof candidate.metrics !== "object" ||
          !(name in (candidate.metrics as Record<string, unknown>))
        ) {
          throw new Error(
            `ranges.metrics.${name} must reference a configured metric`
          );
        }
        assertRange(range, `ranges.metrics.${name}`);
      }
    }
  }

  return candidate as unknown as AnalysisDefinition;
}

export async function loadDefinition(
  filePath: string
): Promise<AnalysisDefinition> {
  const value = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  return validateDefinition(value);
}
