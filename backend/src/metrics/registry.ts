/**
 * Centralized, dependency-free application metrics registry.
 *
 * This is the single place where the backend keeps counters and histograms. It
 * deliberately has no external dependencies and no network calls: recording a
 * metric is a few in-memory map operations, so observability adds a negligible
 * per-request cost and can never fail a business operation (all recording
 * methods are no-throw by design).
 *
 * Cardinality is treated as a security boundary:
 * - Every metric is declared up front (name, help, allowed label keys).
 * - Recording strips any label key that was not declared for the metric, so a
 *   typo or future misuse cannot create unbounded label dimensions.
 * - Label values are escaped before being rendered into Prometheus text format
 *   to prevent label-injection through the scrape endpoint.
 *
 * The project deliberately avoids a metric per arbitrary value: request IDs,
 * user IDs, group IDs, emails, tokens, and raw error messages are never labels
 * (see README "Observability" for the rules).
 */

export interface CounterDefinition {
  kind: "counter";
  name: string;
  help: string;
  labelKeys?: readonly string[];
}

export interface HistogramDefinition {
  kind: "histogram";
  name: string;
  help: string;
  labelKeys?: readonly string[];
  buckets?: readonly number[];
}

export type MetricDefinition = CounterDefinition | HistogramDefinition;

/** Counters and their Prometheus names. Source of truth for every emitting site. */
export const METRIC = {
  httpRequestsTotal: "http_requests_total",
  httpErrorsTotal: "http_errors_total",
  httpRequestDurationSeconds: "http_request_duration_seconds",
  usersRegisteredTotal: "users_registered_total",
  groupsCreatedTotal: "groups_created_total",
  expensesCreatedTotal: "expenses_created_total",
  expensesUpdatedTotal: "expenses_updated_total",
  expensesDeletedTotal: "expenses_deleted_total",
  settlementsCreatedTotal: "settlements_created_total",
  activityEventsCreatedTotal: "activity_events_created_total",
  backgroundJobsSucceededTotal: "background_jobs_succeeded_total",
  backgroundJobsFailedTotal: "background_jobs_failed_total",
  backgroundJobsRetriedTotal: "background_jobs_retried_total",
  backgroundJobsDiscardedTotal: "background_jobs_discarded_total",
  redisConnectionErrorsTotal: "redis_connection_errors_total",
  cacheFailuresTotal: "cache_failures_total",
  queueFailuresTotal: "queue_failures_total",
  databaseConnectionErrorsTotal: "database_connection_errors_total",
} as const;

export type MetricName = (typeof METRIC)[keyof typeof METRIC];

/** Canonical label keys. Only these (and metric-specific keys) ever appear. */
export const METRIC_LABEL = {
  method: "method",
  route: "route",
  status: "status",
  jobType: "job_type",
  operation: "operation",
  activityType: "type",
} as const;

const DEFAULT_HISTOGRAM_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;

const METRIC_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const DEFAULT_BUCKETS = [...DEFAULT_HISTOGRAM_BUCKETS];

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function formatValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(6)));
}

interface HistogramSeries {
  /**
   * Non-cumulative per-bucket observation counts, parallel to `buckets`. Each
   * observation lands in exactly its smallest qualifying bucket.
   */
  counts: number[];
  /** Total number of observations (including values above the last bucket). */
  count: number;
  sum: number;
}

/**
 * In-process counter + histogram registry that renders Prometheus text format.
 * All recording methods are safe no-ops when the metric is unknown or the input
 * invalid, so observability never interrupts the business flow.
 */
export class MetricsRegistry {
  private readonly defs = new Map<string, MetricDefinition>();

  private readonly counters = new Map<string, Map<string, number>>();

  private readonly histograms = new Map<string, Map<string, HistogramSeries>>();

  defineCounter(def: CounterDefinition): this {
    if (this.isValidDefinition(def)) {
      this.defs.set(def.name, { ...def, labelKeys: def.labelKeys ?? [] });
    }
    return this;
  }

  defineHistogram(def: HistogramDefinition): this {
    if (this.isValidDefinition(def)) {
      this.defs.set(def.name, {
        ...def,
        labelKeys: def.labelKeys ?? [],
        buckets: def.buckets && def.buckets.length > 0 ? [...def.buckets] : DEFAULT_BUCKETS,
      });
    }
    return this;
  }

  /**
   * Records a counter increment. Unknown metrics, unknown label keys, and
   * non-positive increments are silently ignored.
   */
  increment(name: string, labels: Record<string, string> = {}, by = 1): void {
    const def = this.defs.get(name);
    if (!def || def.kind !== "counter" || !(by > 0)) return;

    const keys = this.seriesKey(labelKeysOf(def), labels);
    const series = this.counters.get(name) ?? new Map<string, number>();
    series.set(keys, (series.get(keys) ?? 0) + by);
    this.counters.set(name, series);
  }

  /**
   * Records a histogram observation. Unknown metrics, invalid label keys, or
   * non-finite negative values are silently ignored.
   */
  observe(name: string, value: number, labels: Record<string, string> = {}): void {
    const def = this.defs.get(name);
    if (!def || def.kind !== "histogram") return;
    if (!Number.isFinite(value) || value < 0) return;

    const buckets = def.buckets ?? DEFAULT_BUCKETS;
    const keys = this.seriesKey(labelKeysOf(def), labels);
    const series = this.histograms.get(name) ?? new Map<string, HistogramSeries>();
    const current = series.get(keys) ?? {
      counts: buckets.map(() => 0),
      count: 0,
      sum: 0,
    };

    for (let i = 0; i < buckets.length; i += 1) {
      const bucket = buckets[i];
      if (bucket !== undefined && value <= bucket) {
        current.counts[i] = (current.counts[i] ?? 0) + 1;
        break;
      }
    }
    current.count += 1;
    current.sum += value;

    series.set(keys, current);
    this.histograms.set(name, series);
  }

  /** Returns the current counter value (0 when the series was never recorded). */
  counterValue(name: string, labels: Record<string, string> = {}): number {
    const def = this.defs.get(name);
    if (!def || def.kind !== "counter") return 0;
    const keys = this.seriesKey(labelKeysOf(def), labels);
    return this.counters.get(name)?.get(keys) ?? 0;
  }

  /** Returns the total number of observations of a histogram series (0 when absent). */
  histogramCount(name: string, labels: Record<string, string> = {}): number {
    const def = this.defs.get(name);
    if (!def || def.kind !== "histogram") return 0;
    const keys = this.seriesKey(labelKeysOf(def), labels);
    return this.histograms.get(name)?.get(keys)?.count ?? 0;
  }

  /** Returns the sum of observed values of a histogram series (0 when absent). */
  histogramSum(name: string, labels: Record<string, string> = {}): number {
    const def = this.defs.get(name);
    if (!def || def.kind !== "histogram") return 0;
    const keys = this.seriesKey(labelKeysOf(def), labels);
    return this.histograms.get(name)?.get(keys)?.sum ?? 0;
  }

  /**
   * Clears all recorded values while keeping the metric catalog, so a running
   * application (or a test suite) can start from a clean slate without losing
   * the definitions on which emissions depend.
   */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
  }

  /** Renders every registered metric in Prometheus text format (0.0.4). */
  renderPrometheus(): string {
    const lines: string[] = [];

    for (const def of this.defs.values()) {
      lines.push(`# HELP ${def.name} ${def.help}`);
      lines.push(
        `# TYPE ${def.name} ${def.kind === "counter" ? "counter" : "histogram"}`,
      );

      if (def.kind === "counter") {
        const series = this.counters.get(def.name);
        if (!series) continue;
        for (const [keys, value] of series) {
          lines.push(`${def.name}${keys} ${formatValue(value)}`);
        }
      } else {
        const buckets = def.buckets ?? DEFAULT_BUCKETS;
        const series = this.histograms.get(def.name);
        if (!series) continue;
for (const [keys, entry] of series) {
          let cumulative = 0;
          for (let i = 0; i < buckets.length; i += 1) {
            const bucket = buckets[i];
            cumulative += entry.counts[i] ?? 0;
            const le = escapeLabelValue(String(bucket ?? 0));
            lines.push(
              `${def.name}_bucket${keys ? keys.slice(0, -1) + `,le="${le}"` : `{le="${le}"}`} ${formatValue(cumulative)}`,
            );
          }
          lines.push(
            `${def.name}_bucket${keys ? keys.slice(0, -1) + `,le="+Inf"}` : `{le="+Inf"}`} ${formatValue(entry.count)}`,
          );
          lines.push(`${def.name}_sum${keys} ${formatValue(entry.sum)}`);
          lines.push(`${def.name}_count${keys} ${formatValue(entry.count)}`);
        }
      }
    }

    return `${lines.join("\n")}\n`;
  }

  private isValidDefinition(def: MetricDefinition): boolean {
    if (!METRIC_NAME_PATTERN.test(def.name)) return false;
    const keys = def.labelKeys ?? [];
    return keys.every((key) => METRIC_NAME_PATTERN.test(key));
  }

  /**
   * Builds the series key `{key="value",...}` in the metric's declared label
   * order, dropping any label passed in that was not declared. Values are
   * escaped to keep the rendered text well-formed and injection-free.
   */
  private seriesKey(labelKeys: readonly string[], labels: Record<string, string>): string {
    const parts: string[] = [];
    for (const key of labelKeys) {
      const raw = labels[key];
      if (raw === undefined || raw === null) continue;
      parts.push(`${key}="${escapeLabelValue(String(raw))}"`);
    }
    if (parts.length === 0) return "";
    return `{${parts.join(",")}}`;
  }
}

interface LabeledMetricDefinition {
  labelKeys?: readonly string[];
}

function labelKeysOf(def: MetricDefinition): readonly string[] {
  return (def as LabeledMetricDefinition).labelKeys ?? [];
}

const DEFAULT_METRICS: MetricDefinition[] = [
  {
    kind: "counter",
    name: METRIC.httpRequestsTotal,
    help: "Total number of HTTP requests handled, by method, normalized route, and status class.",
    labelKeys: [METRIC_LABEL.method, METRIC_LABEL.route, METRIC_LABEL.status],
  },
  {
    kind: "counter",
    name: METRIC.httpErrorsTotal,
    help: "Total number of HTTP error responses (status >= 400), by method, route, and status class.",
    labelKeys: [METRIC_LABEL.method, METRIC_LABEL.route, METRIC_LABEL.status],
  },
  {
    kind: "histogram",
    name: METRIC.httpRequestDurationSeconds,
    help: "HTTP request handling time in seconds, by method and normalized route.",
    labelKeys: [METRIC_LABEL.method, METRIC_LABEL.route],
  },
  {
    kind: "counter",
    name: METRIC.usersRegisteredTotal,
    help: "Total number of successfully registered users.",
  },
  {
    kind: "counter",
    name: METRIC.groupsCreatedTotal,
    help: "Total number of successfully created groups.",
  },
  {
    kind: "counter",
    name: METRIC.expensesCreatedTotal,
    help: "Total number of successfully created expenses.",
  },
  {
    kind: "counter",
    name: METRIC.expensesUpdatedTotal,
    help: "Total number of successfully updated expenses.",
  },
  {
    kind: "counter",
    name: METRIC.expensesDeletedTotal,
    help: "Total number of successfully deleted expenses.",
  },
  {
    kind: "counter",
    name: METRIC.settlementsCreatedTotal,
    help: "Total number of successfully created settlements.",
  },
  {
    kind: "counter",
    name: METRIC.activityEventsCreatedTotal,
    help: "Total number of activity events persisted, by the bounded activity type.",
    labelKeys: [METRIC_LABEL.activityType],
  },
  {
    kind: "counter",
    name: METRIC.backgroundJobsSucceededTotal,
    help: "Total number of background jobs processed successfully, by controlled job type.",
    labelKeys: [METRIC_LABEL.jobType],
  },
  {
    kind: "counter",
    name: METRIC.backgroundJobsFailedTotal,
    help: "Total number of background job processing failures (retryable or terminal), by job type.",
    labelKeys: [METRIC_LABEL.jobType],
  },
  {
    kind: "counter",
    name: METRIC.backgroundJobsRetriedTotal,
    help: "Total number of failed background jobs scheduled for a retry, by job type.",
    labelKeys: [METRIC_LABEL.jobType],
  },
  {
    kind: "counter",
    name: METRIC.backgroundJobsDiscardedTotal,
    help: "Total number of background jobs removed without further processing (permanent failure, retries exhausted, or malformed), by job type.",
    labelKeys: [METRIC_LABEL.jobType],
  },
  {
    kind: "counter",
    name: METRIC.redisConnectionErrorsTotal,
    help: "Total number of Redis connection-level errors observed on the shared client.",
  },
  {
    kind: "counter",
    name: METRIC.cacheFailuresTotal,
    help: "Total number of Redis cache operation failures absorbed by the domain cache, by bounded operation name.",
    labelKeys: [METRIC_LABEL.operation],
  },
  {
    kind: "counter",
    name: METRIC.queueFailuresTotal,
    help: "Total number of background job enqueue failures.",
  },
  {
    kind: "counter",
    name: METRIC.databaseConnectionErrorsTotal,
    help: "Total number of PostgreSQL connection failures at startup.",
  },
];

function registerDefaultMetrics(registry: MetricsRegistry): void {
  for (const definition of DEFAULT_METRICS) {
    if (definition.kind === "counter") {
      registry.defineCounter(definition);
    } else {
      registry.defineHistogram(definition);
    }
  }
}

function createSingleton(): MetricsRegistry {
  const registry = new MetricsRegistry();
  registerDefaultMetrics(registry);
  return registry;
}

/**
 * The process-wide metrics registry. Every emitting site imports this singleton,
 * and the `/metrics` endpoint (plus the worker's optional metrics port) renders
 * it. Definitions are registered once at first import.
 */
export const metrics: MetricsRegistry = createSingleton();

/**
 * Clears recorded values while keeping the metric catalog. Used by tests for a
 * clean slate and by tooling that wants to observe a fresh window.
 */
export function resetMetrics(): void {
  metrics.reset();
}