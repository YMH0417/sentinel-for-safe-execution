import type {
  AnalysisDefinition,
  AnalysisIssue,
  AnalysisReport,
  AnalysisResult,
  CanonicalField,
  CoverageMetric,
  DimensionPrimitive,
  DimensionValue,
  EntitySummary,
  FieldSelector,
  InputRow,
  IssueSummary,
  NormalizedRecord,
  NumberStatistics,
  SourceLocation,
  TimeBucket,
} from "./types.js";

function selectorPaths(selector: FieldSelector | undefined): string[] {
  if (!selector) return [];
  return Array.isArray(selector) ? selector : [selector];
}

export function valueAtPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function selectValue(value: unknown, selector?: FieldSelector): unknown {
  for (const path of selectorPaths(selector)) {
    const selected = valueAtPath(value, path);
    if (selected !== undefined && selected !== null && selected !== "") {
      return selected;
    }
  }
  return undefined;
}

function toText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim()) {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  return undefined;
}

function toTimestamp(value: unknown): number | undefined {
  const numeric = toFiniteNumber(value);
  if (numeric !== undefined) {
    const milliseconds = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    return Number.isFinite(new Date(milliseconds).getTime())
      ? milliseconds
      : undefined;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function issue(
  code: AnalysisIssue["code"],
  message: string,
  location: SourceLocation,
  field?: string,
  severity: AnalysisIssue["severity"] = "error"
): AnalysisIssue {
  return { code, severity, message, location, field };
}

function canonicalValues(
  value: unknown,
  definition: AnalysisDefinition
): Record<CanonicalField, unknown> {
  return {
    id: selectValue(value, definition.fields.id),
    timestamp: selectValue(value, definition.fields.timestamp),
    category: selectValue(value, definition.fields.category),
    outcome: selectValue(value, definition.fields.outcome),
    score: selectValue(value, definition.fields.score),
    entityId: selectValue(value, definition.fields.entityId),
    actorId: selectValue(value, definition.fields.actorId),
  };
}

function normalizeRow(
  row: InputRow,
  definition: AnalysisDefinition
): { record?: NormalizedRecord; issues: AnalysisIssue[]; coverage: string[] } {
  if (row.parseIssue) return { issues: [row.parseIssue], coverage: [] };
  if (!row.value || typeof row.value !== "object" || Array.isArray(row.value)) {
    return {
      issues: [
        issue(
          "INVALID_RECORD",
          "Record must be an object",
          row.location
        ),
      ],
      coverage: [],
    };
  }

  const values = canonicalValues(row.value, definition);
  const required = new Set<CanonicalField>(
    definition.required ?? ["id", "timestamp", "category"]
  );
  const issues: AnalysisIssue[] = [];
  const id = toText(values.id);
  const timestamp = toTimestamp(values.timestamp);
  const category = toText(values.category);
  const outcome = toText(values.outcome);
  const score = toFiniteNumber(values.score);
  const entityId = toText(values.entityId);
  const actorId = toText(values.actorId);

  for (const field of required) {
    if (values[field] === undefined || values[field] === null || values[field] === "") {
      issues.push(
        issue(
          "MISSING_REQUIRED_FIELD",
          `Required field "${field}" is missing`,
          row.location,
          field
        )
      );
    }
  }
  if (values.timestamp !== undefined && timestamp === undefined) {
    issues.push(
      issue(
        "INVALID_TIMESTAMP",
        "Timestamp is not a Unix timestamp or ISO date",
        row.location,
        "timestamp"
      )
    );
  }
  if (values.score !== undefined && score === undefined) {
    issues.push(
      issue(
        "INVALID_NUMBER",
        "Score must be a finite number",
        row.location,
        "score"
      )
    );
  }
  if (
    category &&
    definition.allowedCategories &&
    !definition.allowedCategories.includes(category)
  ) {
    issues.push(
      issue(
        "INVALID_CATEGORY",
        `Category "${category}" is not allowed`,
        row.location,
        "category"
      )
    );
  }
  if (
    outcome &&
    definition.allowedOutcomes &&
    !definition.allowedOutcomes.includes(outcome)
  ) {
    issues.push(
      issue(
        "INVALID_OUTCOME",
        `Outcome "${outcome}" is not allowed`,
        row.location,
        "outcome"
      )
    );
  }
  if (
    score !== undefined &&
    ((definition.ranges?.score?.min !== undefined &&
      score < definition.ranges.score.min) ||
      (definition.ranges?.score?.max !== undefined &&
        score > definition.ranges.score.max))
  ) {
    issues.push(
      issue(
        "OUT_OF_RANGE",
        `Score ${score} is outside the configured range`,
        row.location,
        "score"
      )
    );
  }

  const dimensions: Record<string, DimensionValue> = {};
  const metrics: Record<string, number> = {};
  const coverage: string[] = [];

  for (const [name, selector] of Object.entries(definition.dimensions ?? {})) {
    const selected = selectValue(row.value, selector);
    if (
      typeof selected === "string" ||
      typeof selected === "number" ||
      typeof selected === "boolean"
    ) {
      dimensions[name] = selected;
      coverage.push(`dimension.${name}`);
    } else if (
      Array.isArray(selected) &&
      selected.length > 0 &&
      selected.every(
        (entry): entry is DimensionPrimitive =>
          typeof entry === "string" ||
          typeof entry === "number" ||
          typeof entry === "boolean"
      )
    ) {
      dimensions[name] = selected;
      coverage.push(`dimension.${name}`);
    }
  }
  for (const [name, selector] of Object.entries(definition.metrics ?? {})) {
    const selected = selectValue(row.value, selector);
    if (selected === undefined) continue;
    const numeric = toFiniteNumber(selected);
    if (numeric === undefined) {
      issues.push(
        issue(
          "INVALID_NUMBER",
          `Metric "${name}" must be a finite number`,
          row.location,
          `metric.${name}`
        )
      );
    } else {
      metrics[name] = numeric;
      coverage.push(`metric.${name}`);
      const range = definition.ranges?.metrics?.[name];
      if (
        (range?.min !== undefined && numeric < range.min) ||
        (range?.max !== undefined && numeric > range.max)
      ) {
        issues.push(
          issue(
            "OUT_OF_RANGE",
            `Metric "${name}" value ${numeric} is outside the configured range`,
            row.location,
            `metric.${name}`
          )
        );
      }
    }
  }

  const presentCanonical: Array<[CanonicalField, unknown]> = [
    ["id", id],
    ["timestamp", timestamp],
    ["category", category],
    ["outcome", outcome],
    ["score", score],
    ["entityId", entityId],
    ["actorId", actorId],
  ];
  for (const [name, selected] of presentCanonical) {
    if (selected !== undefined) coverage.push(name);
  }

  if (
    issues.some((entry) => entry.severity === "error") ||
    !id ||
    timestamp === undefined ||
    !category
  ) {
    return { issues, coverage };
  }

  return {
    record: {
      id,
      timestamp,
      category,
      ...(outcome ? { outcome } : {}),
      ...(score !== undefined ? { score } : {}),
      ...(entityId ? { entityId } : {}),
      ...(actorId ? { actorId } : {}),
      dimensions,
      metrics,
    },
    issues,
    coverage,
  };
}

function increment(target: Record<string, number>, key?: string): void {
  if (!key) return;
  const current = Object.prototype.hasOwnProperty.call(target, key)
    ? target[key]
    : 0;
  Object.defineProperty(target, key, {
    value: current + 1,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

export function numberStatistics(values: number[]): NumberStatistics | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const midpoint = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
      : sorted[midpoint];
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    median,
    p95: sorted[p95Index],
    sum,
  };
}

function summarizeIssues(issues: AnalysisIssue[]): IssueSummary[] {
  const grouped = new Map<string, IssueSummary>();
  for (const entry of issues) {
    const key = `${entry.code}:${entry.severity}:${entry.field ?? ""}`;
    const existing = grouped.get(key) ?? {
      code: entry.code,
      severity: entry.severity,
      ...(entry.field ? { field: entry.field } : {}),
      count: 0,
      sampleLocations: [],
    };
    existing.count += 1;
    if (
      existing.sampleLocations.length < 5 &&
      !existing.sampleLocations.some(
        (location) =>
          location.source === entry.location.source &&
          location.row === entry.location.row
      )
    ) {
      existing.sampleLocations.push(entry.location);
    }
    grouped.set(key, existing);
  }
  return [...grouped.values()].sort(
    (left, right) => right.count - left.count || left.code.localeCompare(right.code)
  );
}

function summarizeEntities(records: NormalizedRecord[]): EntitySummary[] {
  const entities = new Map<
    string,
    { count: number; outcomeCounts: Record<string, number>; scores: number[] }
  >();
  for (const record of records) {
    if (!record.entityId) continue;
    const entry = entities.get(record.entityId) ?? {
      count: 0,
      outcomeCounts: {},
      scores: [],
    };
    entry.count += 1;
    increment(entry.outcomeCounts, record.outcome);
    if (record.score !== undefined) entry.scores.push(record.score);
    entities.set(record.entityId, entry);
  }
  return [...entities.entries()]
    .map(([entityId, entry]) => ({
      entityId,
      count: entry.count,
      outcomeCounts: entry.outcomeCounts,
      ...(entry.scores.length
        ? {
            averageScore:
              entry.scores.reduce((total, value) => total + value, 0) /
              entry.scores.length,
          }
        : {}),
    }))
    .sort(
      (left, right) =>
        right.count - left.count || left.entityId.localeCompare(right.entityId)
    );
}

function summarizeTrends(records: NormalizedRecord[]): TimeBucket[] {
  const buckets = new Map<string, TimeBucket>();
  for (const record of records) {
    const date = new Date(record.timestamp).toISOString().slice(0, 10);
    const bucket = buckets.get(date) ?? {
      date,
      count: 0,
      categoryCounts: {},
      outcomeCounts: {},
    };
    bucket.count += 1;
    increment(bucket.categoryCounts, record.category);
    increment(bucket.outcomeCounts, record.outcome);
    buckets.set(date, bucket);
  }
  return [...buckets.values()].sort((left, right) =>
    left.date.localeCompare(right.date)
  );
}

export function analyzeRows(
  rows: InputRow[],
  definition: AnalysisDefinition
): AnalysisResult {
  const issues: AnalysisIssue[] = [];
  const records: NormalizedRecord[] = [];
  const seenIds = new Map<string, SourceLocation>();
  const coverageCounts = Object.create(null) as Record<string, number>;
  let parsedRows = 0;
  let duplicateRows = 0;
  const coverageFields = new Set<string>([
    "id",
    "timestamp",
    "category",
    ...(definition.fields.outcome ? ["outcome"] : []),
    ...(definition.fields.score ? ["score"] : []),
    ...(definition.fields.entityId ? ["entityId"] : []),
    ...(definition.fields.actorId ? ["actorId"] : []),
    ...Object.keys(definition.dimensions ?? {}).map(
      (name) => `dimension.${name}`
    ),
    ...Object.keys(definition.metrics ?? {}).map((name) => `metric.${name}`),
  ]);

  const sources = [...new Set(rows.map((row) => row.location.source))];

  for (const row of rows) {
    if (!row.parseIssue) parsedRows += 1;
    const normalized = normalizeRow(row, definition);
    issues.push(...normalized.issues);
    for (const field of new Set(normalized.coverage)) {
      coverageCounts[field] = (coverageCounts[field] ?? 0) + 1;
    }
    if (!normalized.record) continue;

    const firstLocation = seenIds.get(normalized.record.id);
    if (firstLocation) {
      duplicateRows += 1;
      issues.push(
        issue(
          "DUPLICATE_ID",
          `Duplicate id "${normalized.record.id}"`,
          row.location,
          "id",
          "warning"
        )
      );
      continue;
    }
    seenIds.set(normalized.record.id, row.location);
    records.push(normalized.record);
  }

  const categoryCounts = Object.create(null) as Record<string, number>;
  const outcomeCounts = Object.create(null) as Record<string, number>;
  const metricValues = Object.create(null) as Record<string, number[]>;
  const dimensionCounts = Object.create(null) as Record<
    string,
    Record<string, number>
  >;
  const scores: number[] = [];
  const entities = new Set<string>();
  const actors = new Set<string>();

  for (const record of records) {
    increment(categoryCounts, record.category);
    increment(outcomeCounts, record.outcome);
    if (record.score !== undefined) scores.push(record.score);
    if (record.entityId) entities.add(record.entityId);
    if (record.actorId) actors.add(record.actorId);
    for (const [name, value] of Object.entries(record.dimensions)) {
      const counts = (dimensionCounts[name] ??= Object.create(
        null
      ) as Record<string, number>);
      if (Array.isArray(value)) {
        for (const item of value) increment(counts, String(item));
      } else {
        increment(counts, String(value));
      }
    }
    for (const [name, value] of Object.entries(record.metrics)) {
      (metricValues[name] ??= []).push(value);
    }
  }

  const metrics = Object.fromEntries(
    Object.entries(metricValues).flatMap(([name, values]) => {
      const statistics = numberStatistics(values);
      return statistics ? [[name, statistics]] : [];
    })
  );
  const coverage: Record<string, CoverageMetric> = Object.fromEntries(
    [...coverageFields]
      .sort((left, right) => left.localeCompare(right))
      .map((field) => {
        const present = coverageCounts[field] ?? 0;
        return [
          field,
          {
            present,
            total: parsedRows,
            rate: parsedRows ? present / parsedRows : 0,
          },
        ];
      })
  );
  let minimumTimestamp: number | undefined;
  let maximumTimestamp: number | undefined;
  for (const record of records) {
    minimumTimestamp =
      minimumTimestamp === undefined
        ? record.timestamp
        : Math.min(minimumTimestamp, record.timestamp);
    maximumTimestamp =
      maximumTimestamp === undefined
        ? record.timestamp
        : Math.max(maximumTimestamp, record.timestamp);
  }
  const invalidRows = rows.length - records.length - duplicateRows;
  const plainCategoryCounts = Object.fromEntries(
    Object.entries(categoryCounts)
  );
  const plainOutcomeCounts = Object.fromEntries(Object.entries(outcomeCounts));
  const plainDimensionCounts = Object.fromEntries(
    Object.entries(dimensionCounts).map(([name, counts]) => [
      name,
      Object.fromEntries(Object.entries(counts)),
    ])
  );

  const report: AnalysisReport = {
    metadata: {
      context: definition.name,
      definitionVersion: definition.version,
      generatedAt: new Date().toISOString(),
      sources,
    },
    quality: {
      receivedRows: rows.length,
      parsedRows,
      validRows: records.length,
      invalidRows,
      duplicateRows,
      validRate: rows.length ? records.length / rows.length : 0,
      issues: summarizeIssues(issues),
      coverage,
    },
    summary: {
      timeRange:
        minimumTimestamp !== undefined && maximumTimestamp !== undefined
        ? {
            from: new Date(minimumTimestamp).toISOString(),
            to: new Date(maximumTimestamp).toISOString(),
          }
        : null,
      categoryCounts: plainCategoryCounts,
      outcomeCounts: plainOutcomeCounts,
      uniqueEntities: entities.size,
      uniqueActors: actors.size,
      ...(scores.length ? { score: numberStatistics(scores) } : {}),
      dimensionCounts: plainDimensionCounts,
      metrics,
    },
    trends: summarizeTrends(records),
    entities: summarizeEntities(records),
    insights: {},
  };

  return { report, records, issues };
}
