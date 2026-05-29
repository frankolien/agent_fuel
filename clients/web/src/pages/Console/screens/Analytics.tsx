import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useAgentsQuery, useServicesQuery } from "@/lib/api/hooks";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import { HttpError } from "@/lib/http";
import { formatUsdcCompact, shortPubkey } from "@/lib/format";
import type { Agent, ScorePoint, Service } from "@/types/api";
import { useFleetActivity, type FleetActivityRow } from "../useFleetActivity";
import { Card } from "../components/Card";
import { LiveBadge } from "../components/LiveBadge";
import { Skeleton } from "../components/Skeleton";
import { Screen } from "./Screen";

type Range = "7d" | "30d" | "90d" | "all";
const RANGE_OPTIONS: Range[] = ["7d", "30d", "90d", "all"];
const RANGE_DAYS: Record<Range, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function Analytics() {
  const agentsQuery = useAgentsQuery();
  const servicesQuery = useServicesQuery();
  const fleet = useFleetActivity();
  const [range, setRange] = useState<Range>("30d");

  const agents = useMemo<Agent[]>(
    () => (Array.isArray(agentsQuery.data) ? agentsQuery.data : []),
    [agentsQuery.data],
  );
  const services = useMemo<Service[]>(
    () => (Array.isArray(servicesQuery.data) ? servicesQuery.data : []),
    [servicesQuery.data],
  );

  // Fetch each agent's score history once; used for the fleet avg line chart.
  const scoreHistories = useQueries({
    queries: agents.map((a) => ({
      queryKey: queryKeys.agentScoreHistory(a.pubkey),
      queryFn: async (): Promise<ScorePoint[]> => {
        try {
          return await api.agentScoreHistory(a.pubkey);
        } catch (err) {
          if (err instanceof HttpError && err.status === 404) return [];
          throw err;
        }
      },
      staleTime: 30_000,
      retry: (count: number, err: unknown) =>
        err instanceof HttpError && err.status === 404 ? false : count < 2,
    })),
  });

  const allScorePoints = useMemo<ScorePoint[][]>(
    () => scoreHistories.map((q) => (q.data ?? []) as ScorePoint[]),
    [scoreHistories],
  );

  const subtitle = useMemo(() => {
    const label = range === "all" ? "All time" : `Last ${RANGE_DAYS[range]} days`;
    return `${label} · ${agents.length === 0 ? "no agents" : `${agents.length} agent${agents.length === 1 ? "" : "s"}`}`;
  }, [range, agents.length]);

  return (
    <Screen
      eyebrow={subtitle}
      title="Analytics"
      subtitle="Spend, reputation, and policy trends over time."
      actions={
        <div className="flex items-center gap-2">
          <LiveBadge status={fleet.isLoading ? "connecting" : "open"} />
          <RangeSelector range={range} onChange={setRange} />
        </div>
      }
    >
      {agentsQuery.isLoading ? (
        <Skeleton className="h-[640px] w-full" />
      ) : (
        <div className="grid gap-3.5 lg:grid-cols-2">
          <SpendVelocityCard rows={fleet.rows} range={range} />
          <ReputationCard histories={allScorePoints} range={range} />
          <BudgetUtilizationCard rows={fleet.rows} agents={agents} range={range} />
          <CostPerServiceCard rows={fleet.rows} services={services} range={range} />
        </div>
      )}
    </Screen>
  );
}

function RangeSelector({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  return (
    <div className="inline-flex rounded-md border border-[var(--color-line-2)] bg-surface-2 p-0.5 font-mono text-[11px]">
      {RANGE_OPTIONS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={`rounded-[5px] px-2.5 py-1 transition ${
            range === r ? "bg-bg text-fg" : "text-muted hover:text-fg-2"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

// --- Spend velocity (USDC / day) -----------------------------------------

function SpendVelocityCard({ rows, range }: { rows: FleetActivityRow[]; range: Range }) {
  const series = useMemo(() => buildSpendSeries(rows, range), [rows, range]);
  const total = series.reduce((s, p) => s + p.value, 0);
  return (
    <Card title="Spend velocity" meta="USDC / day">
      {total === 0 ? (
        <EmptyState message="No spends in this window." />
      ) : (
        <LineChart series={series} formatValue={(v) => `$${formatUsdcCompact(v)}`} />
      )}
    </Card>
  );
}

// --- Avg reputation over time --------------------------------------------

function ReputationCard({
  histories,
  range,
}: {
  histories: ScorePoint[][];
  range: Range;
}) {
  const series = useMemo(() => buildAvgScoreSeries(histories, range), [histories, range]);
  const allEmpty = series.every((p) => p.value === 0);
  return (
    <Card title="Avg. reputation" meta="0–1000">
      {allEmpty ? (
        <EmptyState message="No scored agents yet." />
      ) : (
        <LineChart series={series} formatValue={(v) => String(Math.round(v))} />
      )}
    </Card>
  );
}

// --- Budget utilization heatmap ------------------------------------------

function BudgetUtilizationCard({
  rows,
  agents,
  range,
}: {
  rows: FleetActivityRow[];
  agents: Agent[];
  range: Range;
}) {
  const matrix = useMemo(
    () => buildHourlyMatrix(rows, agents, range),
    [rows, agents, range],
  );
  const totalSpends = matrix.flat().reduce((s, n) => s + n, 0);
  return (
    <Card
      title="Budget utilization · agents × hour"
      meta={`heatmap, 24×${agents.length}`}
    >
      {totalSpends === 0 || agents.length === 0 ? (
        <EmptyState message="No spend activity to plot." />
      ) : (
        <Heatmap matrix={matrix} rowLabels={agents.map((a) => shortPubkey(a.pubkey))} />
      )}
    </Card>
  );
}

// --- Cost per service -----------------------------------------------------

function CostPerServiceCard({
  rows,
  services,
  range,
}: {
  rows: FleetActivityRow[];
  services: Service[];
  range: Range;
}) {
  const breakdown = useMemo(
    () => buildServiceBreakdown(rows, services, range),
    [rows, services, range],
  );
  return (
    <Card title={`Cost per service · ${range === "all" ? "all" : range}`} meta="">
      {breakdown.length === 0 ? (
        <EmptyState message="No paid services in this window." />
      ) : (
        <div className="grid gap-2.5">
          {breakdown.map((row) => (
            <ServiceRow key={row.key} row={row} max={breakdown[0]!.total} />
          ))}
        </div>
      )}
    </Card>
  );
}

function ServiceRow({
  row,
  max,
}: {
  row: ServiceBreakdownRow;
  max: number;
}) {
  const pct = max === 0 ? 0 : (row.total / max) * 100;
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[12.5px] text-fg">{row.name}</span>
        <span className="font-mono text-[11.5px] tabular-nums text-muted">
          ${formatUsdcCompact(row.total)} · avg ${formatUsdc4(row.avg)}
        </span>
      </div>
      <div className="h-[5px] overflow-hidden rounded-sm bg-surface-2">
        <div
          className="h-full bg-mint/80 [box-shadow:0_0_12px_rgba(166,225,207,0.3)]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// --- Chart primitives -----------------------------------------------------

type Point = { ts: number; value: number; label: string };

function LineChart({
  series,
  formatValue,
}: {
  series: Point[];
  formatValue: (v: number) => string;
}) {
  const width = 720;
  const height = 220;
  const padLeft = 52;
  const padRight = 12;
  const padTop = 14;
  const padBottom = 22;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const values = series.map((p) => p.value);
  const max = Math.max(1, ...values);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const stepX = series.length > 1 ? innerW / (series.length - 1) : 0;

  const points = series.map((p, i) => {
    const x = padLeft + i * stepX;
    const y = padTop + (1 - (p.value - min) / span) * innerH;
    return [x, y] as const;
  });
  const path = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const last = points[points.length - 1]!;
  const first = points[0]!;
  const area = `${path} L ${last[0].toFixed(2)} ${padTop + innerH} L ${first[0].toFixed(2)} ${padTop + innerH} Z`;

  // Five y-axis ticks evenly between min and max.
  const ticks = Array.from({ length: 5 }, (_, i) => {
    const t = i / 4;
    const v = min + (1 - t) * span;
    return { v, y: padTop + t * innerH };
  });

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        className="text-mint"
        aria-label="Line chart"
      >
        <defs>
          <linearGradient id="lc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.18} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={t.y}
              y2={t.y}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={1}
            />
            <text
              x={padLeft - 6}
              y={t.y + 3}
              fontSize={10}
              fill="rgba(255,255,255,0.45)"
              textAnchor="end"
              fontFamily="ui-monospace, monospace"
            >
              {formatValue(t.v)}
            </text>
          </g>
        ))}
        <path d={area} fill="url(#lc-fill)" />
        <path
          d={path}
          stroke="currentColor"
          strokeWidth={1.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={last[0]} cy={last[1]} r={3} fill="currentColor" />
      </svg>
    </div>
  );
}

function Heatmap({
  matrix,
  rowLabels,
}: {
  matrix: number[][];
  rowLabels: string[];
}) {
  const rows = matrix.length;
  const cols = 24;
  const cellSize = 18;
  const gap = 2;
  const labelW = 110;
  const axisH = 18;
  const width = labelW + cols * (cellSize + gap);
  const height = rows * (cellSize + gap) + axisH;
  const max = Math.max(1, ...matrix.flat());

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        width="100%"
        height={height}
        className="text-mint"
        aria-label="Budget utilization heatmap"
      >
        {matrix.map((row, r) =>
          row.map((v, c) => {
            const intensity = v / max;
            const fill = intensity === 0
              ? "rgba(255,255,255,0.04)"
              : `rgba(166,225,207,${(0.12 + intensity * 0.68).toFixed(3)})`;
            return (
              <rect
                key={`${r}-${c}`}
                x={labelW + c * (cellSize + gap)}
                y={r * (cellSize + gap)}
                width={cellSize}
                height={cellSize}
                rx={2}
                fill={fill}
              >
                {v > 0 ? (
                  <title>
                    {rowLabels[r]} @ {String(c).padStart(2, "0")}:00 — {v} spend{v === 1 ? "" : "s"}
                  </title>
                ) : null}
              </rect>
            );
          }),
        )}
        {rowLabels.map((label, r) => (
          <text
            key={r}
            x={labelW - 10}
            y={r * (cellSize + gap) + cellSize / 2 + 3.5}
            fontSize={11}
            fill="rgba(255,255,255,0.7)"
            textAnchor="end"
            fontFamily="ui-monospace, monospace"
          >
            {label}
          </text>
        ))}
        {[0, 4, 8, 12, 16, 20].map((h) => (
          <text
            key={h}
            x={labelW + h * (cellSize + gap) + cellSize / 2}
            y={rows * (cellSize + gap) + 12}
            fontSize={10}
            fill="rgba(255,255,255,0.4)"
            textAnchor="middle"
            fontFamily="ui-monospace, monospace"
          >
            {String(h).padStart(2, "0")}
          </text>
        ))}
      </svg>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-white/[0.09] bg-surface/40 px-4 py-12 text-center text-[12.5px] text-muted">
      {message}
    </div>
  );
}

// --- Data shaping --------------------------------------------------------

type ServiceBreakdownRow = {
  key: string;
  name: string;
  total: number;
  avg: number;
  count: number;
};

function rangeWindow(range: Range): number | null {
  const days = RANGE_DAYS[range];
  return days === null ? null : Date.now() - days * ONE_DAY_MS;
}

function buildSpendSeries(rows: FleetActivityRow[], range: Range): Point[] {
  const days = RANGE_DAYS[range] ?? 30;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const points: Point[] = Array.from({ length: days }, (_, i) => {
    const offset = days - 1 - i;
    const ts = todayStart - offset * ONE_DAY_MS;
    return { ts, value: 0, label: shortDay(ts) };
  });
  const windowStart = points[0]!.ts;
  for (const row of rows) {
    if (row.event_name !== "Spent") continue;
    const ts = parseTs(row.received_at);
    if (ts === null || ts < windowStart) continue;
    const idx = Math.min(days - 1, Math.floor((ts - windowStart) / ONE_DAY_MS));
    const amount = readNumber(row.payload["amount_usdc"]);
    if (amount !== null) points[idx]!.value += amount;
  }
  return points;
}

function buildAvgScoreSeries(histories: ScorePoint[][], range: Range): Point[] {
  // Each history is sorted ascending by recorded_at on the server. Walk a
  // "current score per agent" cursor day by day and average.
  const days = RANGE_DAYS[range] ?? 30;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayBoundary = (i: number) => todayStart - (days - 1 - i) * ONE_DAY_MS + ONE_DAY_MS;
  // For each agent precompute (ts, score) tuples and a cursor.
  const tuples: Array<Array<{ ts: number; score: number }>> = histories.map((h) =>
    h
      .map((p) => ({ ts: parseTs(p.recorded_at) ?? 0, score: p.score }))
      .sort((a, b) => a.ts - b.ts),
  );
  const cursors = tuples.map(() => 0);
  const currentScore = tuples.map(() => 0);

  const points: Point[] = Array.from({ length: days }, (_, i) => {
    const boundary = dayBoundary(i);
    // Advance each cursor to the last score recorded on/before boundary.
    for (let agentIdx = 0; agentIdx < tuples.length; agentIdx++) {
      const t = tuples[agentIdx]!;
      while (cursors[agentIdx]! < t.length && t[cursors[agentIdx]!]!.ts <= boundary) {
        currentScore[agentIdx] = t[cursors[agentIdx]!]!.score;
        cursors[agentIdx]!++;
      }
    }
    const scored = currentScore.filter((s) => s > 0);
    const avg = scored.length > 0 ? scored.reduce((s, n) => s + n, 0) / scored.length : 0;
    const ts = boundary - ONE_DAY_MS;
    return { ts, value: avg, label: shortDay(ts) };
  });

  return points;
}

function buildHourlyMatrix(
  rows: FleetActivityRow[],
  agents: Agent[],
  range: Range,
): number[][] {
  const windowStart = rangeWindow(range);
  const indexByAgent = new Map(agents.map((a, i) => [a.pubkey, i]));
  const matrix: number[][] = agents.map(() => Array(24).fill(0));
  for (const row of rows) {
    if (row.event_name !== "Spent") continue;
    const ts = parseTs(row.received_at);
    if (ts === null) continue;
    if (windowStart !== null && ts < windowStart) continue;
    const idx = indexByAgent.get(row.agent_pubkey);
    if (idx === undefined) continue;
    const hour = new Date(ts).getHours();
    matrix[idx]![hour]!++;
  }
  return matrix;
}

function buildServiceBreakdown(
  rows: FleetActivityRow[],
  services: Service[],
  range: Range,
): ServiceBreakdownRow[] {
  const windowStart = rangeWindow(range);
  const nameByPubkey = new Map(services.map((s) => [s.pubkey, s.name || "unnamed"]));
  const agg = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    if (row.event_name !== "Spent") continue;
    const ts = parseTs(row.received_at);
    if (ts === null) continue;
    if (windowStart !== null && ts < windowStart) continue;
    const service = readString(row.payload["service"]);
    if (!service) continue;
    const amount = readNumber(row.payload["amount_usdc"]);
    if (amount === null) continue;
    const prev = agg.get(service) ?? { total: 0, count: 0 };
    prev.total += amount;
    prev.count += 1;
    agg.set(service, prev);
  }
  const out: ServiceBreakdownRow[] = [];
  for (const [pubkey, v] of agg) {
    out.push({
      key: pubkey,
      name: nameByPubkey.get(pubkey) ?? shortPubkey(pubkey),
      total: v.total,
      count: v.count,
      avg: v.total / v.count,
    });
  }
  return out.sort((a, b) => b.total - a.total);
}

function parseTs(iso: string): number | null {
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : null;
}

function readNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function shortDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 4-decimal USDC for the "avg" column where micropayments dominate.
function formatUsdc4(microUsdc: number): string {
  return (microUsdc / 1_000_000).toFixed(microUsdc < 100_000 ? 4 : 2);
}
