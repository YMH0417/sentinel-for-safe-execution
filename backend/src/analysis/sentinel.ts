import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { loadDefinition } from "./definition.js";
import { analyzeRows, numberStatistics } from "./engine.js";
import type {
  AnalysisDefinition,
  AnalysisResult,
  InputRow,
  NormalizedRecord,
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const definitionPath = join(
  __dirname,
  "../config/sentinel-analysis.json"
);

let cachedDefinition: AnalysisDefinition | undefined;

export async function getSentinelDefinition(): Promise<AnalysisDefinition> {
  if (!cachedDefinition) {
    cachedDefinition = await loadDefinition(definitionPath);
  }
  return cachedDefinition;
}

function category(records: NormalizedRecord[], name: string): NormalizedRecord[] {
  return records.filter((record) => record.category === name);
}

function dimension(
  records: NormalizedRecord[],
  name: string,
  value: string
): NormalizedRecord[] {
  return records.filter((record) => {
    const selected = record.dimensions[name];
    return Array.isArray(selected)
      ? selected.some((entry) => String(entry) === value)
      : String(selected) === value;
  });
}

function countOutcomes(
  records: NormalizedRecord[]
): Record<string, number> {
  const counts = Object.create(null) as Record<string, number>;
  for (const record of records) {
    if (record.outcome) {
      const current = Object.prototype.hasOwnProperty.call(
        counts,
        record.outcome
      )
        ? counts[record.outcome]
        : 0;
      Object.defineProperty(counts, record.outcome, {
        value: current + 1,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  return counts;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator ? numerator / denominator : null;
}

function metricStatistics(
  records: NormalizedRecord[],
  name: string
) {
  return (
    numberStatistics(
      records.flatMap((record) =>
        record.metrics[name] === undefined ? [] : [record.metrics[name]]
      )
    ) ?? null
  );
}

function sentinelInsights(records: NormalizedRecord[]): Record<string, unknown> {
  const allDecisions = category(records, "DecisionMade");
  const decisions = dimension(allDecisions, "safetyMode", "safe");
  const previewDecisions = dimension(allDecisions, "safetyMode", "evaluate");
  const classifiedDecisionIds = new Set(
    [...decisions, ...previewDecisions].map((record) => record.id)
  );
  const unclassifiedDecisions = allDecisions.filter(
    (record) => !classifiedDecisionIds.has(record.id)
  );
  const decisionCounts = countOutcomes(decisions);
  const fallbacks = category(records, "FallbackRequired");
  const executionAttempts = category(records, "ExecutionAttempted");
  const vaultSucceeded = category(records, "ExecutionSuccess");
  const vaultRejected = category(records, "ExecutionRejected");
  const swapsSucceeded = category(records, "SwapExecuted");
  const swapsFailed = category(records, "SwapFailed");
  const forced = dimension(records, "safetyMode", "force");
  const protectedSwaps = dimension(swapsSucceeded, "safetyMode", "safe");
  const forcedSwaps = dimension(swapsSucceeded, "safetyMode", "force");
  const protectedRpcSwaps = dimension(protectedSwaps, "chainMode", "rpc");
  const operationalRpcDecisions = dimension(decisions, "chainMode", "rpc");
  const executionFailures = dimension(
    swapsFailed,
    "failureStage",
    "execution"
  );
  const preventedFailures = swapsFailed.filter(
    (record) =>
      dimension([record], "failureStage", "evaluation").length > 0 ||
      dimension([record], "prevented", "true").length > 0
  );
  const preconditionFailures = dimension(
    swapsFailed,
    "failureStage",
    "precondition"
  );
  const configurationFailures = dimension(
    swapsFailed,
    "failureStage",
    "configuration"
  );
  const classifiedFailureIds = new Set(
    [
      ...executionFailures,
      ...preventedFailures,
      ...preconditionFailures,
      ...configurationFailures,
    ].map((record) => record.id)
  );
  const unclassifiedFailures = swapsFailed.filter(
    (record) => !classifiedFailureIds.has(record.id)
  );
  const richSwaps = protectedSwaps.filter(
    (record) =>
      record.metrics.quotedOut !== undefined &&
      record.metrics.actualOut !== undefined
  );
  const productionRichSwaps = protectedRpcSwaps.filter(
    (record) =>
      record.metrics.quotedOut !== undefined &&
      record.metrics.actualOut !== undefined
  );
  const decisionsWithEvidence = operationalRpcDecisions.filter(
    (record) =>
      record.metrics.quoteDeviation !== undefined &&
      record.metrics.historicalFailureRate !== undefined &&
      record.metrics.poolRiskScore !== undefined
  );
  const realizedSlippageBps = richSwaps.flatMap((record) => {
    const quoted = record.metrics.quotedOut;
    const actual = record.metrics.actualOut;
    if (quoted <= 0) return [];
    return [((quoted - actual) / quoted) * 10_000];
  });
  const executionOutcomes = swapsSucceeded.length + executionFailures.length;
  const richEvidenceRate = rate(richSwaps.length, protectedSwaps.length);
  const productionRichEvidenceRate = rate(
    productionRichSwaps.length,
    protectedRpcSwaps.length
  );
  const decisionEvidenceRate = rate(
    decisionsWithEvidence.length,
    operationalRpcDecisions.length
  );
  const usdcInputVolume = protectedSwaps
    .filter((record) => record.dimensions.tokenIn === "USDC")
    .reduce((total, record) => total + (record.metrics.amountIn ?? 0), 0);
  const forcedUsdcInputVolume = forcedSwaps
    .filter((record) => record.dimensions.tokenIn === "USDC")
    .reduce((total, record) => total + (record.metrics.amountIn ?? 0), 0);
  const productionAccounts = new Set(
    protectedRpcSwaps.map((record) => record.actorId).filter(Boolean)
  ).size;
  const productionDays = new Set(
    protectedRpcSwaps.map((record) =>
      new Date(record.timestamp).toISOString().slice(0, 10)
    )
  ).size;
  const readinessCriteria = {
    protectedRpcSuccessfulSwaps: {
      actual: protectedRpcSwaps.length,
      required: 30,
      met: protectedRpcSwaps.length >= 30,
    },
    richSwapEvidenceRate: {
      actual: productionRichEvidenceRate,
      required: 0.8,
      met: (productionRichEvidenceRate ?? 0) >= 0.8,
    },
    operationalRpcDecisions: {
      actual: operationalRpcDecisions.length,
      required: 30,
      met: operationalRpcDecisions.length >= 30,
    },
    decisionEvidenceRate: {
      actual: decisionEvidenceRate,
      required: 0.8,
      met: (decisionEvidenceRate ?? 0) >= 0.8,
    },
    uniqueAccounts: {
      actual: productionAccounts,
      required: 3,
      met: productionAccounts >= 3,
    },
    activeDays: {
      actual: productionDays,
      required: 7,
      met: productionDays >= 7,
    },
  };
  const sufficientForHistoricalClaims = Object.values(readinessCriteria).every(
    (criterion) => criterion.met
  );
  const correlated = new Map<string, NormalizedRecord[]>();
  let uncorrelatedEvents = 0;
  for (const record of records) {
    const correlationId = record.dimensions.correlationId;
    if (typeof correlationId !== "string" || !correlationId) {
      uncorrelatedEvents += 1;
      continue;
    }
    const operation = correlated.get(correlationId) ?? [];
    operation.push(record);
    correlated.set(correlationId, operation);
  }
  const operations = [...correlated.values()];
  const operationHas = (operation: NormalizedRecord[], names: string[]) =>
    operation.some((record) => names.includes(record.category));
  const forcedOperationIds = new Set(
    forced
      .map((record) => record.dimensions.correlationId)
      .filter(
        (correlationId): correlationId is string =>
          typeof correlationId === "string"
      )
  );

  return {
    decisions: {
      total: decisions.length,
      allow: decisionCounts.ALLOW ?? 0,
      reject: decisionCounts.REJECT ?? 0,
      fallback: decisionCounts.FALLBACK_TO_SAFE_ROUTE ?? 0,
      previewEvaluations: previewDecisions.length,
      unclassified: unclassifiedDecisions.length,
      interventionRate: rate(
        (decisionCounts.REJECT ?? 0) +
          (decisionCounts.FALLBACK_TO_SAFE_ROUTE ?? 0),
        decisions.length
      ),
    },
    fallback: {
      events: fallbacks.length,
      completedSwaps: swapsSucceeded.filter(
        (record) =>
          record.dimensions.requestedRouteId !== undefined &&
          record.dimensions.executedRouteId !== undefined &&
          record.dimensions.requestedRouteId !==
            record.dimensions.executedRouteId
      ).length,
    },
    riskFactors: {
      quoteDeviation: metricStatistics(decisions, "quoteDeviation"),
      historicalFailureRate: metricStatistics(
        decisions,
        "historicalFailureRate"
      ),
      poolRiskScore: metricStatistics(decisions, "poolRiskScore"),
      priceImpactBps: metricStatistics(decisions, "priceImpactBps"),
    },
    execution: {
      attemptEvents: executionAttempts.length,
      swapAttempts: executionOutcomes,
      swapsSucceeded: swapsSucceeded.length,
      swapsFailed: swapsFailed.length,
      swapSuccessRate: rate(swapsSucceeded.length, executionOutcomes),
      executionFailures: executionFailures.length,
      preventedByAgent: preventedFailures.length,
      preconditionFailures: preconditionFailures.length,
      configurationFailures: configurationFailures.length,
      unclassifiedFailures: unclassifiedFailures.length,
      protectedSwapsSucceeded: protectedSwaps.length,
      forcedSwapsSucceeded: forcedSwaps.length,
      vaultSucceeded: vaultSucceeded.length,
      vaultRejected: vaultRejected.length,
      usdcInputVolume,
      forcedUsdcInputVolume,
      gasUsed: metricStatistics(swapsSucceeded, "gasUsed"),
      forcedBypassEvents: forced.length,
      forcedBypassOperations: forcedOperationIds.size,
    },
    workflow: {
      correlatedOperations: operations.length,
      completedOperations: operations.filter((operation) =>
        operationHas(operation, ["SwapExecuted", "ExecutionSuccess"])
      ).length,
      failedOrRejectedOperations: operations.filter((operation) =>
        operationHas(operation, [
          "SwapFailed",
          "ExecutionRejected",
        ])
      ).length,
      fallbackOperations: operations.filter((operation) =>
        operationHas(operation, ["FallbackRequired"])
      ).length,
      uncorrelatedEvents,
    },
    realizedSlippageBps: numberStatistics(realizedSlippageBps) ?? null,
    evidence: {
      successfulSwapsWithQuoteAndActual: richSwaps.length,
      richSwapEvidenceRate: richEvidenceRate,
      productionSuccessfulSwapsWithQuoteAndActual:
        productionRichSwaps.length,
      productionRichSwapEvidenceRate: productionRichEvidenceRate,
      decisionEvidenceRate,
      uniqueAccounts: productionAccounts,
      activeDays: productionDays,
      readinessCriteria,
      sufficientForHistoricalClaims,
      assessment: sufficientForHistoricalClaims
        ? "historical-analysis-ready"
        : "prototype-evidence-only",
    },
  };
}

export async function analyzeSentinelRows(
  rows: InputRow[]
): Promise<AnalysisResult> {
  const definition = await getSentinelDefinition();
  const result = analyzeRows(rows, definition);
  result.report.insights = sentinelInsights(result.records);
  return result;
}

export function addSentinelInsights(result: AnalysisResult): AnalysisResult {
  result.report.insights = sentinelInsights(result.records);
  return result;
}
