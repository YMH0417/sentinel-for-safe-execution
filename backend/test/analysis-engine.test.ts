import assert from "node:assert/strict";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeRows } from "../src/analysis/engine.js";
import { validateDefinition } from "../src/analysis/definition.js";
import {
  parseCsv,
  parseJson,
  parseJsonLines,
  readInputFile,
  rowsFromValues,
} from "../src/analysis/sourceParsers.js";
import {
  analyzeSentinelRows,
  getSentinelDefinition,
} from "../src/analysis/sentinel.js";
import { resolveExecutionCorrelationId } from "../src/routes/execute.js";
import {
  classifySwapFailure,
  SwapExecutionError,
} from "../src/services/swapService.js";
import { ChainConfigurationError } from "../src/config/chainConfig.js";
import { deriveWarningFlags } from "../src/services/chainQuoteService.js";
import type { AnalysisDefinition } from "../src/analysis/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const genericDefinition: AnalysisDefinition = {
  name: "generic-orders",
  version: "1.0.0",
  fields: {
    id: "order_id",
    timestamp: "created_at",
    category: "kind",
    outcome: "status",
    score: "risk",
    entityId: "customer",
  },
  dimensions: {
    region: "region",
  },
  metrics: {
    value: "amount",
  },
  allowedOutcomes: ["ok", "failed"],
};

test("JSONL parsing preserves corrupt rows for data-quality reporting", () => {
  const rows = parseJsonLines(
    '{"id":"one"}\nnot-json\n\n{"id":"two"}\n',
    "events.jsonl"
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[0].location.row, 1);
  assert.equal(rows[1].parseIssue?.code, "PARSE_ERROR");
  assert.equal(rows[1].location.row, 2);
  assert.equal(rows[2].location.row, 4);
});

test("JSON parser accepts common collection envelopes", () => {
  const rows = parseJson(
    '{"events":[{"id":"one"},{"id":"two"}]}',
    "events.json"
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.value), [
    { id: "one" },
    { id: "two" },
  ]);
});

test("CSV parser handles quoted commas, escaped quotes, and numeric coercion", () => {
  const rows = parseCsv(
    'order_id,created_at,kind,status,risk,customer,region,amount,note\n' +
      'one,2026-07-30T00:00:00Z,sale,ok,10,c-1,US,12.5,"hello, ""team"""\n',
    "orders.csv"
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].value, {
    order_id: "one",
    created_at: "2026-07-30T00:00:00Z",
    kind: "sale",
    status: "ok",
    risk: 10,
    customer: "c-1",
    region: "US",
    amount: 12.5,
    note: 'hello, "team"',
  });
});

test("CSV parser rejects duplicate headers instead of silently overwriting data", () => {
  const rows = parseCsv("id,id\none,two\n", "duplicate.csv");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].parseIssue?.code, "PARSE_ERROR");
  assert.match(rows[0].parseIssue?.message ?? "", /unique/);
});

test("generic engine validates, deduplicates, aggregates, and calculates metrics", () => {
  const rows = rowsFromValues([
    {
      order_id: "one",
      created_at: "2026-07-29T10:00:00Z",
      kind: "sale",
      status: "ok",
      risk: 10,
      customer: "c-1",
      region: "US",
      amount: 12,
    },
    {
      order_id: "two",
      created_at: 1_785_300_000,
      kind: "sale",
      status: "failed",
      risk: 40,
      customer: "c-2",
      region: "EU",
      amount: 18,
    },
    {
      order_id: "two",
      created_at: "2026-07-30T11:00:00Z",
      kind: "refund",
      status: "ok",
      amount: 99,
    },
    {
      order_id: "four",
      created_at: "bad-date",
      kind: "sale",
      status: "unknown",
      amount: "not-a-number",
    },
  ]);

  const result = analyzeRows(rows, genericDefinition);
  assert.equal(result.report.quality.receivedRows, 4);
  assert.equal(result.report.quality.validRows, 2);
  assert.equal(result.report.quality.invalidRows, 1);
  assert.equal(result.report.quality.duplicateRows, 1);
  assert.deepEqual(result.report.summary.categoryCounts, { sale: 2 });
  assert.deepEqual(result.report.summary.outcomeCounts, {
    ok: 1,
    failed: 1,
  });
  assert.equal(result.report.summary.score?.mean, 25);
  assert.equal(result.report.summary.metrics.value.mean, 15);
  assert.deepEqual(result.report.summary.dimensionCounts.region, {
    US: 1,
    EU: 1,
  });
  assert.equal(result.report.summary.uniqueEntities, 2);
  assert.ok(
    result.report.quality.issues.some(
      (entry) => entry.code === "DUPLICATE_ID" && entry.count === 1
    )
  );
  assert.ok(
    result.report.quality.issues.some(
      (entry) => entry.code === "INVALID_TIMESTAMP"
    )
  );
});

test("Sentinel fixture produces security-specific evidence metrics", async () => {
  const fixture = join(__dirname, "fixtures/sentinel-events.jsonl");
  const rows = await readInputFile(fixture, "jsonl");
  const result = await analyzeSentinelRows(rows);
  const insights = result.report.insights as {
    decisions: { total: number; allow: number };
    execution: { swapsSucceeded: number; usdcInputVolume: number };
    evidence: {
      successfulSwapsWithQuoteAndActual: number;
      assessment: string;
    };
    riskFactors: {
      quoteDeviation: { count: number; mean: number };
    };
    realizedSlippageBps: { count: number };
  };

  assert.equal(result.report.quality.receivedRows, 5);
  assert.equal(result.report.quality.parsedRows, 4);
  assert.equal(result.report.quality.validRows, 2);
  assert.equal(result.report.quality.invalidRows, 2);
  assert.equal(result.report.quality.duplicateRows, 1);
  assert.equal(insights.decisions.total, 1);
  assert.equal(insights.decisions.allow, 1);
  assert.equal(insights.execution.swapsSucceeded, 1);
  assert.equal(insights.execution.usdcInputVolume, 100);
  assert.equal(insights.evidence.successfulSwapsWithQuoteAndActual, 1);
  assert.equal(insights.evidence.assessment, "prototype-evidence-only");
  assert.equal(insights.riskFactors.quoteDeviation.count, 1);
  assert.equal(insights.riskFactors.quoteDeviation.mean, 0.004);
  assert.equal(insights.realizedSlippageBps.count, 1);
});

test("definition validation rejects executable or malformed mappings", () => {
  assert.throws(
    () =>
      validateDefinition({
        name: "bad",
        version: "1",
        fields: { id: "id", timestamp: "time" },
      }),
    /fields\.category/
  );
  assert.throws(
    () =>
      validateDefinition({
        name: "bad",
        version: "1",
        fields: { id: "id", timestamp: "time", category: "kind" },
        metrics: { amount: 42 },
      }),
    /field selector/
  );
  assert.throws(
    () =>
      validateDefinition(
        JSON.parse(
          '{"name":"bad","version":"1","fields":{"id":"id","timestamp":"time","category":"kind"},"dimensions":{"__proto__":"value"}}'
        )
      ),
    /field selector/
  );
  assert.throws(
    () =>
      validateDefinition({
        name: "bad",
        version: "1",
        fields: { id: "id", timestamp: "time", category: "kind" },
        dimensions: { toString: "value" },
      }),
    /field selector/
  );
  assert.throws(
    () =>
      validateDefinition({
        name: "bad",
        version: "1",
        fields: { id: "id", timestamp: "time", category: "kind" },
        required: ["outcome"],
      }),
    /required must include/
  );
});

test("shipped Sentinel definition is loadable", async () => {
  const definition = await getSentinelDefinition();
  assert.equal(definition.name, "sentinel-events");
  assert.equal(definition.fields.category, "eventType");
});

test("dimension arrays are counted once per member", () => {
  const definition: AnalysisDefinition = {
    name: "flagged-events",
    version: "1",
    fields: {
      id: "id",
      timestamp: "timestamp",
      category: "category",
    },
    dimensions: { flags: "flags" },
  };
  const result = analyzeRows(
    rowsFromValues([
      {
        id: "one",
        timestamp: "2026-07-30T00:00:00Z",
        category: "decision",
        flags: ["pool_risk", "high_price_impact"],
      },
    ]),
    definition
  );
  assert.deepEqual(result.report.summary.dimensionCounts.flags, {
    pool_risk: 1,
    high_price_impact: 1,
  });
});

test("large datasets do not overflow the JavaScript argument stack", () => {
  const rows = rowsFromValues(
    Array.from({ length: 120_000 }, (_, index) => ({
      order_id: `order-${index}`,
      created_at: 1_785_300_000 + index,
      kind: "sale",
    }))
  );
  const result = analyzeRows(rows, genericDefinition);
  assert.equal(result.report.quality.validRows, 120_000);
  assert.equal(
    result.report.summary.timeRange?.from,
    "2026-07-29T04:40:00.000Z"
  );
});

function sentinelSwapEvent(
  id: string,
  timestamp: number,
  safetyMode: "safe" | "force",
  account: string,
  chainMode: "demo" | "rpc" = "rpc"
) {
  return {
    id,
    timestamp,
    eventType: "SwapExecuted",
    decision: "ALLOW",
    riskScore: 10,
    routeId: "route-usdc-good-safe",
    message: "executed",
    context: {
      account,
      safetyMode,
      chainMode,
      tokenIn: "USDC",
      tokenOut: "GOOD",
      amountIn: 1,
      quotedOut: 1,
      actualOut: 0.999,
      requestedRouteId: "route-usdc-good-safe",
      executedRouteId: "route-usdc-good-safe",
    },
  };
}

function sentinelDecisionEvent(
  id: string,
  timestamp: number,
  account: string
) {
  return {
    id,
    timestamp,
    eventType: "DecisionMade",
    decision: "ALLOW",
    riskScore: 10,
    routeId: "route-usdc-good-safe",
    message: "allowed",
    context: {
      account,
      safetyMode: "safe",
      chainMode: "rpc",
      quoteDeviation: 0.001,
      historicalFailureRate: 0.02,
      poolRiskScore: 12,
      requestedRouteId: "route-usdc-good-safe",
    },
  };
}

test("forced or demo swaps never satisfy historical-readiness criteria", async () => {
  const base = Date.UTC(2026, 6, 1);
  const records = Array.from({ length: 30 }, (_, index) =>
    sentinelSwapEvent(
      `forced-${index}`,
      base + index * 86_400_000,
      "force",
      `account-${index % 3}`,
      "demo"
    )
  );
  const result = await analyzeSentinelRows(rowsFromValues(records));
  const insights = result.report.insights as {
    execution: {
      protectedSwapsSucceeded: number;
      forcedSwapsSucceeded: number;
    };
    evidence: { sufficientForHistoricalClaims: boolean };
  };
  assert.equal(insights.execution.protectedSwapsSucceeded, 0);
  assert.equal(insights.execution.forcedSwapsSucceeded, 30);
  assert.equal(insights.evidence.sufficientForHistoricalClaims, false);
});

test("historical readiness requires protected RPC swaps and decisions across accounts and days", async () => {
  const base = Date.UTC(2026, 6, 1);
  const records: unknown[] = [];
  for (let index = 0; index < 30; index += 1) {
    const timestamp = base + (index % 7) * 86_400_000 + index * 1_000;
    const account = `account-${index % 3}`;
    records.push(
      sentinelDecisionEvent(`decision-${index}`, timestamp, account),
      sentinelSwapEvent(`swap-${index}`, timestamp + 500, "safe", account)
    );
  }
  const result = await analyzeSentinelRows(rowsFromValues(records));
  const insights = result.report.insights as {
    evidence: {
      sufficientForHistoricalClaims: boolean;
      uniqueAccounts: number;
      activeDays: number;
      readinessCriteria: Record<string, { met: boolean }>;
    };
  };
  assert.equal(insights.evidence.sufficientForHistoricalClaims, true);
  assert.equal(insights.evidence.uniqueAccounts, 3);
  assert.equal(insights.evidence.activeDays, 7);
  assert.ok(
    Object.values(insights.evidence.readinessCriteria).every(
      (criterion) => criterion.met
    )
  );
});

test("execution success rate excludes Agent prevention and other non-execution failures", async () => {
  const timestamp = Date.UTC(2026, 6, 30);
  const records = [
    sentinelSwapEvent("success", timestamp, "safe", "account-1"),
    {
      id: "prevented",
      timestamp: timestamp + 1,
      eventType: "SwapFailed",
      message: "rejected",
      context: {
        safetyMode: "safe",
        chainMode: "rpc",
        failureStage: "evaluation",
        prevented: true,
      },
    },
    {
      id: "failed",
      timestamp: timestamp + 2,
      eventType: "SwapFailed",
      message: "reverted",
      context: {
        safetyMode: "safe",
        chainMode: "rpc",
        failureStage: "execution",
        prevented: false,
      },
    },
  ];
  const result = await analyzeSentinelRows(rowsFromValues(records));
  const insights = result.report.insights as {
    execution: {
      swapSuccessRate: number;
      executionFailures: number;
      preventedByAgent: number;
    };
  };
  assert.equal(insights.execution.swapSuccessRate, 0.5);
  assert.equal(insights.execution.executionFailures, 1);
  assert.equal(insights.execution.preventedByAgent, 1);
});

test("swap failures are classified by lifecycle stage", () => {
  assert.deepEqual(
    classifySwapFailure(
      new SwapExecutionError("SWAP_REJECTED_BY_AGENT", "rejected")
    ),
    { failureStage: "evaluation", prevented: true }
  );
  assert.deepEqual(
    classifySwapFailure(
      new SwapExecutionError("INSUFFICIENT_BALANCE", "insufficient")
    ),
    { failureStage: "precondition", prevented: false }
  );
  assert.deepEqual(
    classifySwapFailure(new SwapExecutionError("SWAP_FAILED", "reverted")),
    { failureStage: "execution", prevented: false }
  );
  assert.deepEqual(
    classifySwapFailure(new ChainConfigurationError("missing RPC")),
    { failureStage: "configuration", prevented: false }
  );
});

test("execute reuses a valid evaluate correlation id", () => {
  const correlationId = "18fe0daf-a760-4d75-a75e-80e907e77d69";
  assert.equal(
    resolveExecutionCorrelationId({ evaluation: { correlationId } }),
    correlationId
  );
  assert.notEqual(
    resolveExecutionCorrelationId({
      evaluation: { correlationId: "not-a-uuid" },
    }),
    "not-a-uuid"
  );
});

test("price-impact warnings use the documented 500 bps threshold", () => {
  assert.deepEqual(deriveWarningFlags("SAFE", 1, 1, 500), []);
  assert.deepEqual(
    deriveWarningFlags("SAFE", 1, 1, 501),
    ["high_price_impact"]
  );
  assert.deepEqual(
    deriveWarningFlags("SHALLOW", 1, 1, 100),
    ["shallow_pool"]
  );
});
