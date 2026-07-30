export type InputFormat = "json" | "jsonl" | "csv";
export type CanonicalField =
  | "id"
  | "timestamp"
  | "category"
  | "outcome"
  | "score"
  | "entityId"
  | "actorId";

export type FieldSelector = string | string[];

export interface NumericRange {
  min?: number;
  max?: number;
}

export interface AnalysisDefinition {
  name: string;
  version: string;
  fields: {
    id: FieldSelector;
    timestamp: FieldSelector;
    category: FieldSelector;
    outcome?: FieldSelector;
    score?: FieldSelector;
    entityId?: FieldSelector;
    actorId?: FieldSelector;
  };
  dimensions?: Record<string, FieldSelector>;
  metrics?: Record<string, FieldSelector>;
  required?: CanonicalField[];
  allowedCategories?: string[];
  allowedOutcomes?: string[];
  ranges?: {
    score?: NumericRange;
    metrics?: Record<string, NumericRange>;
  };
}

export interface SourceLocation {
  source: string;
  row: number;
}

export interface InputRow {
  value?: unknown;
  location: SourceLocation;
  parseIssue?: AnalysisIssue;
}

export type DimensionPrimitive = string | number | boolean;
export type DimensionValue = DimensionPrimitive | DimensionPrimitive[];

export type IssueSeverity = "error" | "warning";

export interface AnalysisIssue {
  code:
    | "PARSE_ERROR"
    | "INVALID_RECORD"
    | "MISSING_REQUIRED_FIELD"
    | "INVALID_TIMESTAMP"
    | "INVALID_NUMBER"
    | "INVALID_CATEGORY"
    | "INVALID_OUTCOME"
    | "OUT_OF_RANGE"
    | "DUPLICATE_ID";
  severity: IssueSeverity;
  message: string;
  location: SourceLocation;
  field?: string;
}

export interface NormalizedRecord {
  id: string;
  timestamp: number;
  category: string;
  outcome?: string;
  score?: number;
  entityId?: string;
  actorId?: string;
  dimensions: Record<string, DimensionValue>;
  metrics: Record<string, number>;
}

export interface NumberStatistics {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  sum: number;
}

export interface CoverageMetric {
  present: number;
  total: number;
  rate: number;
}

export interface IssueSummary {
  code: AnalysisIssue["code"];
  severity: IssueSeverity;
  field?: string;
  count: number;
  sampleLocations: SourceLocation[];
}

export interface EntitySummary {
  entityId: string;
  count: number;
  outcomeCounts: Record<string, number>;
  averageScore?: number;
}

export interface TimeBucket {
  date: string;
  count: number;
  categoryCounts: Record<string, number>;
  outcomeCounts: Record<string, number>;
}

export interface AnalysisReport {
  metadata: {
    context: string;
    definitionVersion: string;
    generatedAt: string;
    sources: string[];
  };
  quality: {
    receivedRows: number;
    parsedRows: number;
    validRows: number;
    invalidRows: number;
    duplicateRows: number;
    validRate: number;
    issues: IssueSummary[];
    coverage: Record<string, CoverageMetric>;
  };
  summary: {
    timeRange: { from: string; to: string } | null;
    categoryCounts: Record<string, number>;
    outcomeCounts: Record<string, number>;
    uniqueEntities: number;
    uniqueActors: number;
    score?: NumberStatistics;
    dimensionCounts: Record<string, Record<string, number>>;
    metrics: Record<string, NumberStatistics>;
  };
  trends: TimeBucket[];
  entities: EntitySummary[];
  insights: Record<string, unknown>;
}

export interface AnalysisResult {
  report: AnalysisReport;
  records: NormalizedRecord[];
  issues: AnalysisIssue[];
}
