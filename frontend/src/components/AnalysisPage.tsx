import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type AnalysisReport,
  type NumberStatistics,
} from "../api/client";
import { GlobalLoading } from "./GlobalLoading";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; report: AnalysisReport };

const DECISION_SERIES = [
  { key: "allow", label: "Allow", color: "var(--green)" },
  { key: "fallback", label: "Fallback", color: "var(--yellow)" },
  { key: "reject", label: "Reject", color: "var(--red)" },
] as const;

export function AnalysisPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", report: await api.analysis() });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Analysis request failed",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") return <AnalysisSkeleton />;
  if (state.status === "error") {
    return (
      <section className="analysis-state" role="alert">
        <h1>Analysis unavailable</h1>
        <p>{state.message}</p>
        <button
          type="button"
          className="sentinel-btn sentinel-btn-primary"
          onClick={() => void load()}
        >
          Retry
        </button>
      </section>
    );
  }

  return <AnalysisReportView report={state.report} onRefresh={load} />;
}

function AnalysisReportView({
  report,
  onRefresh,
}: {
  report: AnalysisReport;
  onRefresh: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const decisions = report.insights.decisions;
  const execution = report.insights.execution;
  const evidence = report.insights.evidence;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  if (report.quality.receivedRows === 0) {
    return (
      <section className="analysis-state">
        <h1>No runtime evidence yet</h1>
        <p>
          Sentinel is ready to analyze events as soon as evaluation or swap
          activity is recorded.
        </p>
        <code>npm run analyze -- --input data/events.jsonl</code>
        <button
          type="button"
          className="sentinel-btn sentinel-btn-ghost"
          onClick={() => void handleRefresh()}
        >
          Refresh
        </button>
      </section>
    );
  }

  return (
    <>
      <GlobalLoading active={refreshing} message={refreshing ? "Refreshing analysis..." : undefined} />
      <div className="analysis-page">
      <header className="analysis-header">
        <div>
          <h1>Collected Data Analysis</h1>
          <p>
            Runtime evidence only. Missing fields remain visible as coverage
            gaps.
          </p>
        </div>
        <button
          type="button"
          className="sentinel-btn sentinel-btn-ghost"
          onClick={() => void handleRefresh()}
        >
          Refresh analysis
        </button>
      </header>

      <section className="analysis-kpis" aria-label="Analysis summary">
        <Kpi
          label="Valid events"
          value={formatInteger(report.quality.validRows)}
          detail={`${formatPercent(report.quality.validRate)} of input`}
        />
        <Kpi
          label="Correlated operations"
          value={formatInteger(
            report.insights.workflow?.correlatedOperations ?? 0
          )}
          detail={`${formatInteger(report.insights.workflow?.uncorrelatedEvents ?? 0)} uncorrelated events`}
        />
        <Kpi
          label="Protected swaps"
          value={formatInteger(execution?.protectedSwapsSucceeded ?? 0)}
          detail={`${formatPercent(execution?.swapSuccessRate)} success rate`}
        />
        <Kpi
          label="Protected USDC input"
          value={formatNumber(execution?.usdcInputVolume ?? 0)}
          detail="Successful safe-mode events"
        />
        <Kpi
          label="Evidence status"
          value={
            evidence?.sufficientForHistoricalClaims
              ? "Historical-ready"
              : "Prototype only"
          }
          detail={`${formatInteger(evidence?.uniqueAccounts ?? 0)} unique accounts`}
        />
      </section>

      <section className="analysis-primary-grid">
        <article className="analysis-panel">
          <PanelHeading
            title="Decision distribution"
            detail={`${formatInteger(decisions?.total ?? 0)} decisions`}
          />
          <DecisionBars report={report} />
        </article>

        <article className="analysis-panel analysis-trend-panel">
          <PanelHeading
            title="Event activity"
            detail={formatTimeRange(report)}
          />
          <ActivityLine trends={report.trends} />
        </article>
      </section>

      <section className="analysis-secondary-grid">
        <article className="analysis-panel">
          <PanelHeading title="Data quality" detail="All input rows" />
          <QualityBreakdown report={report} />
        </article>

        <article className="analysis-panel">
          <PanelHeading title="Risk factors" detail="Decision evidence" />
          <RiskFactors report={report} />
        </article>
      </section>

      <section className="analysis-secondary-grid">
        <article className="analysis-panel">
          <PanelHeading
            title="Execution outcomes"
            detail="Lifecycle-aware counts"
          />
          <ExecutionBreakdown report={report} />
        </article>

        <article className="analysis-panel">
          <PanelHeading
            title="Historical readiness"
            detail={evidence?.assessment ?? "No assessment"}
          />
          <ReadinessCriteria report={report} />
        </article>
      </section>

      <section className="analysis-panel">
        <PanelHeading
          title="Field coverage"
          detail={`${formatInteger(report.quality.parsedRows)} parsed rows`}
        />
        <CoverageGrid report={report} />
      </section>

      <section className="analysis-panel">
        <PanelHeading
          title="Route activity"
          detail={`${formatInteger(report.summary.uniqueEntities)} routes`}
        />
        <RouteTable report={report} />
      </section>
    </div>
    </>
  );
}

function Kpi({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="analysis-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function PanelHeading({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <header className="analysis-panel-heading">
      <h2>{title}</h2>
      <span>{detail}</span>
    </header>
  );
}

function DecisionBars({ report }: { report: AnalysisReport }) {
  const decisions = report.insights.decisions;
  const values = DECISION_SERIES.map((series) => ({
    ...series,
    value: decisions?.[series.key] ?? 0,
  }));
  const maximum = Math.max(...values.map((series) => series.value), 1);

  if (!decisions?.total) {
    return <ChartEmpty>No decision events were collected.</ChartEmpty>;
  }

  return (
    <figure className="analysis-decision-chart">
      <div className="analysis-decision-bars">
        {values.map((series) => (
          <div
            className="analysis-decision-column"
            key={series.key}
            aria-label={`${series.label}: ${series.value}`}
          >
            <span>{formatInteger(series.value)}</span>
            <div
              className="analysis-decision-bar"
              style={{
                height: `${Math.max(4, (series.value / maximum) * 100)}%`,
                background: series.color,
              }}
            />
            <small>{series.label}</small>
          </div>
        ))}
      </div>
      <figcaption>
        Intervention rate: {formatPercent(decisions.interventionRate)}
      </figcaption>
    </figure>
  );
}

function ActivityLine({ trends }: { trends: AnalysisReport["trends"] }) {
  const points = useMemo(
    () => buildLinePoints(trends.map((trend) => trend.count)),
    [trends]
  );
  if (trends.length === 0) {
    return <ChartEmpty>No timestamped events were collected.</ChartEmpty>;
  }

  return (
    <figure className="analysis-line-figure">
      <svg
        viewBox="0 0 720 190"
        role="img"
        aria-labelledby="activity-line-title activity-line-description"
      >
        <title id="activity-line-title">Daily event activity</title>
        <desc id="activity-line-description">
          Event counts from {trends[0].date} to {trends[trends.length - 1].date}.
        </desc>
        {[20, 70, 120, 170].map((y) => (
          <line
            key={y}
            x1="16"
            y1={y}
            x2="704"
            y2={y}
            className="analysis-chart-gridline"
          />
        ))}
        <polyline points={points} className="analysis-chart-line" />
        {points.split(" ").map((point, index) => {
          const [cx, cy] = point.split(",");
          return (
            <circle
              key={`${trends[index].date}-${point}`}
              cx={cx}
              cy={cy}
              r="4"
              className="analysis-chart-point"
            />
          );
        })}
      </svg>
      <figcaption>
        <span>{trends[0].date}</span>
        <span>
          Peak {formatInteger(Math.max(...trends.map((trend) => trend.count)))}
        </span>
        <span>{trends[trends.length - 1].date}</span>
      </figcaption>
    </figure>
  );
}

function QualityBreakdown({ report }: { report: AnalysisReport }) {
  const parts = [
    {
      label: "Valid",
      value: report.quality.validRows,
      color: "var(--green)",
    },
    {
      label: "Invalid",
      value: report.quality.invalidRows,
      color: "var(--red)",
    },
    {
      label: "Duplicate",
      value: report.quality.duplicateRows,
      color: "var(--yellow)",
    },
  ];
  const total = Math.max(report.quality.receivedRows, 1);

  return (
    <div>
      <div
        className="analysis-quality-bar"
        role="img"
        aria-label={parts
          .map((part) => `${part.label}: ${part.value}`)
          .join(", ")}
      >
        {parts.map((part) =>
          part.value ? (
            <span
              key={part.label}
              style={{
                width: `${(part.value / total) * 100}%`,
                background: part.color,
              }}
            />
          ) : null
        )}
      </div>
      <div className="analysis-quality-legend">
        {parts.map((part) => (
          <div key={part.label}>
            <span style={{ color: part.color }}>{part.label}</span>
            <strong>{formatInteger(part.value)}</strong>
          </div>
        ))}
      </div>
      {report.quality.issues.length > 0 && (
        <p className="analysis-quality-note">
          Most frequent issue: {report.quality.issues[0].code}
          {report.quality.issues[0].field
            ? ` (${report.quality.issues[0].field})`
            : ""}
        </p>
      )}
    </div>
  );
}

function RiskFactors({ report }: { report: AnalysisReport }) {
  const factors = report.insights.riskFactors;
  const values = [
    {
      label: "Quote deviation",
      value: formatStatistic(factors?.quoteDeviation, 100, "%"),
    },
    {
      label: "Failure rate",
      value: formatStatistic(factors?.historicalFailureRate, 100, "%"),
    },
    {
      label: "Pool risk",
      value: formatStatistic(factors?.poolRiskScore, 1, "/100"),
    },
    {
      label: "Price impact",
      value: formatStatistic(factors?.priceImpactBps, 1, " bps"),
    },
  ];

  return (
    <div className="analysis-factor-grid">
      {values.map((factor) => (
        <div key={factor.label}>
          <span>{factor.label}</span>
          <strong>{factor.value}</strong>
          <small>Mean observed</small>
        </div>
      ))}
    </div>
  );
}

function ExecutionBreakdown({ report }: { report: AnalysisReport }) {
  const execution = report.insights.execution;
  const values = [
    {
      label: "Succeeded",
      value: execution?.swapsSucceeded ?? 0,
      color: "var(--green)",
    },
    {
      label: "Execution failed",
      value: execution?.executionFailures ?? 0,
      color: "var(--red)",
    },
    {
      label: "Agent prevented",
      value: execution?.preventedByAgent ?? 0,
      color: "var(--cyan)",
    },
    {
      label: "Precondition",
      value: execution?.preconditionFailures ?? 0,
      color: "var(--yellow)",
    },
    {
      label: "Configuration",
      value: execution?.configurationFailures ?? 0,
      color: "var(--text-muted)",
    },
  ];
  const maximum = Math.max(...values.map((entry) => entry.value), 1);

  return (
    <div className="analysis-outcome-list">
      {values.map((entry) => (
        <div key={entry.label} className="analysis-outcome-row">
          <span>{entry.label}</span>
          <div>
            <i
              style={{
                width: `${(entry.value / maximum) * 100}%`,
                background: entry.color,
              }}
            />
          </div>
          <strong>{formatInteger(entry.value)}</strong>
        </div>
      ))}
    </div>
  );
}

const READINESS_LABELS: Record<string, string> = {
  protectedRpcSuccessfulSwaps: "Protected RPC swaps",
  richSwapEvidenceRate: "Rich swap evidence",
  operationalRpcDecisions: "Operational RPC decisions",
  decisionEvidenceRate: "Decision evidence",
  uniqueAccounts: "Unique accounts",
  activeDays: "Active UTC days",
};

function ReadinessCriteria({ report }: { report: AnalysisReport }) {
  const criteria = Object.entries(
    report.insights.evidence?.readinessCriteria ?? {}
  );
  if (criteria.length === 0) {
    return <ChartEmpty>No readiness assessment is available.</ChartEmpty>;
  }

  return (
    <div className="analysis-readiness-list">
      {criteria.map(([name, criterion]) => {
        const isRate = name.toLowerCase().includes("rate");
        const actual = isRate
          ? formatPercent(criterion.actual)
          : formatInteger(criterion.actual ?? 0);
        const required = isRate
          ? formatPercent(criterion.required)
          : formatInteger(criterion.required);
        return (
          <div key={name}>
            <span
              className={
                criterion.met
                  ? "analysis-readiness-status is-met"
                  : "analysis-readiness-status"
              }
              aria-label={criterion.met ? "Criterion met" : "Criterion pending"}
            />
            <span>{READINESS_LABELS[name] ?? name}</span>
            <strong>
              {actual} / {required}
            </strong>
          </div>
        );
      })}
    </div>
  );
}

function CoverageGrid({ report }: { report: AnalysisReport }) {
  const coverage = Object.entries(report.quality.coverage).sort(
    ([leftName, left], [rightName, right]) =>
      left.rate - right.rate || leftName.localeCompare(rightName)
  );
  return (
    <div className="analysis-coverage-grid">
      {coverage.map(([field, value]) => (
        <div key={field} className="analysis-coverage-item">
          <span title={field}>{field.replace(/^(dimension|metric)\./, "")}</span>
          <strong>{formatPercent(value.rate)}</strong>
          <small>
            {formatInteger(value.present)} / {formatInteger(value.total)}
          </small>
        </div>
      ))}
    </div>
  );
}

function RouteTable({ report }: { report: AnalysisReport }) {
  const routes = report.entities.slice(0, 10);
  if (routes.length === 0) {
    return <ChartEmpty>No route-linked events were collected.</ChartEmpty>;
  }
  return (
    <div className="analysis-route-table-wrap">
      <table className="analysis-route-table">
        <thead>
          <tr>
            <th>Route</th>
            <th>Events</th>
            <th>Allow</th>
            <th>Fallback</th>
            <th>Reject</th>
            <th>Average risk</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => (
            <tr key={route.entityId}>
              <td>{route.entityId}</td>
              <td>{formatInteger(route.count)}</td>
              <td>{formatInteger(route.outcomeCounts.ALLOW ?? 0)}</td>
              <td>
                {formatInteger(
                  route.outcomeCounts.FALLBACK_TO_SAFE_ROUTE ?? 0
                )}
              </td>
              <td>{formatInteger(route.outcomeCounts.REJECT ?? 0)}</td>
              <td>
                {route.averageScore === undefined
                  ? "Not collected"
                  : formatNumber(route.averageScore)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartEmpty({ children }: { children: string }) {
  return <div className="analysis-chart-empty">{children}</div>;
}

function AnalysisSkeleton() {
  return (
    <section className="analysis-page" aria-label="Loading analysis">
      <div className="analysis-skeleton analysis-skeleton-header" />
      <div className="analysis-kpis">
        {Array.from({ length: 5 }, (_, index) => (
          <div className="analysis-skeleton analysis-skeleton-kpi" key={index} />
        ))}
      </div>
      <div className="analysis-primary-grid">
        <div className="analysis-skeleton analysis-skeleton-panel" />
        <div className="analysis-skeleton analysis-skeleton-panel" />
      </div>
    </section>
  );
}

function buildLinePoints(values: number[]): string {
  const width = 720;
  const height = 190;
  const padding = 16;
  const maximum = Math.max(...values, 1);
  return values
    .map((value, index) => {
      const x =
        values.length === 1
          ? width / 2
          : padding + (index / (values.length - 1)) * (width - padding * 2);
      const y = height - padding - (value / maximum) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function formatStatistic(
  statistic: NumberStatistics | null | undefined,
  multiplier: number,
  suffix: string
): string {
  if (!statistic) return "Not collected";
  return `${formatNumber(statistic.mean * multiplier)}${suffix}`;
}

function formatInteger(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Not available";
  return `${formatNumber(value * 100)}%`;
}

function formatTimeRange(report: AnalysisReport): string {
  if (!report.summary.timeRange) return "No time range";
  return `${report.summary.timeRange.from.slice(0, 10)} to ${report.summary.timeRange.to.slice(0, 10)}`;
}
