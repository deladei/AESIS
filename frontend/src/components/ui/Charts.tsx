import {
  Area, AreaChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { LegendDot } from './Badge';
import { EmptyState } from './Feedback';

/**
 * Chart wrappers.
 *
 * Recharts has been a dependency of this app since the beginning and was
 * imported by nothing — every "chart" on every dashboard was a stack of divs
 * with `style={{ height: `${pct}%` }}`, which cannot carry an axis, a tooltip,
 * or a shared scale. These are the three forms the dashboards actually need.
 *
 * Colour comes from the validated chart tokens in globals.css. Hue ORDER there
 * is a colour-blind-safety mechanism, so slots are passed in by meaning and
 * never cycled: dropping a series must not repaint the survivors.
 */

const AXIS = { fontSize: 11, fill: 'var(--ink-muted)' };

/** Shared tooltip shell so every chart's hover layer looks like one system. */
function TipShell({ title, rows }: { title?: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-pop">
      {title && <p className="mb-1 text-xs font-semibold text-ink">{title}</p>}
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-xs">
          {r.color && (
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
          )}
          <span className="text-ink-secondary">{r.label}</span>
          <span className="ml-auto font-semibold text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
  /** A chart token, e.g. `var(--chart-1)`. Bound to meaning, not to rank. */
  color: string;
}

/**
 * Donut with a hero number in the hole and a labelled legend beside it.
 *
 * The legend always shows label AND count. Two of the light-mode chart hues sit
 * below 3:1 against white, so identity may not rest on the swatch alone — the
 * visible label is what makes that legal, not a preference.
 */
export function DonutStat({
  data, centerValue, centerCaption, emptyHint,
}: {
  data: DonutSlice[];
  centerValue: React.ReactNode;
  centerCaption: string;
  emptyHint?: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total <= 0) {
    return <EmptyState title="Nothing to chart yet" hint={emptyHint} className="py-8" />;
  }

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={58}
              outerRadius={84}
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
              stroke="var(--chart-surface)"
              strokeWidth={2}
            >
              {data.map((d) => <Cell key={d.label} fill={d.color} />)}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TipShell
                    rows={[{
                      label: String(payload[0].name),
                      value: `${payload[0].value} (${Math.round((Number(payload[0].value) / total) * 100)}%)`,
                      color: payload[0].payload.color,
                    }]}
                  />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <span className="text-2xl font-bold leading-none text-ink">{centerValue}</span>
          <span className="mt-1 text-[11px] text-ink-muted">{centerCaption}</span>
        </div>
      </div>

      <div className="w-full flex-1 space-y-2.5">
        {data.map((d) => (
          <LegendDot
            key={d.label}
            color={d.color}
            label={d.label}
            value={`${d.value} (${Math.round((d.value / total) * 100)}%)`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Single-series trend with a crosshair tooltip.
 *
 * One series needs no legend — the panel title names it. An HTML chart is
 * interactive by nature, so the hover layer ships by default rather than being
 * an enhancement.
 */
export function LineTrend({
  data, xKey, yKey, yLabel, height = 240, valueSuffix = '',
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  yLabel: string;
  height?: number;
  valueSuffix?: string;
}) {
  if (!data.length) {
    return <EmptyState title="No trend yet" hint="This fills in as weeks are submitted." className="py-8" />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-line)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--chart-line)" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} />

        <Tooltip
          cursor={{ stroke: 'var(--line-strong)', strokeDasharray: '3 3' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TipShell
                title={String(label)}
                rows={[{
                  label: yLabel,
                  value: `${payload[0].value}${valueSuffix}`,
                  color: 'var(--chart-line)',
                }]}
              />
            ) : null
          }
        />

        <Area
          type="monotone"
          dataKey={yKey}
          stroke="var(--chart-line)"
          strokeWidth={2}
          fill="url(#trendFill)"
          // Markers appear on hover at a real hit size rather than peppering
          // every point with a dot.
          dot={false}
          activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--chart-surface)' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
}

/**
 * Two or more series on ONE shared scale.
 *
 * Never a second y-axis: two measures of different magnitude get two charts or
 * an indexed common base, because a dual axis lets the author choose where the
 * lines cross. A legend is always rendered here — with more than one series,
 * identity may not rest on colour alone.
 */
export function MultiLineTrend({
  data, xKey, series, height = 240,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  series: TrendSeries[];
  height?: number;
}) {
  if (!data.length) {
    return <EmptyState title="No trend yet" hint="This fills in as the cohort submits weeks." className="py-8" />;
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-xs">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-ink-secondary">{s.label}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />

          <Tooltip
            cursor={{ stroke: 'var(--line-strong)', strokeDasharray: '3 3' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TipShell
                  title={String(label)}
                  rows={payload.map((p) => ({
                    label: series.find((s) => s.key === p.dataKey)?.label ?? String(p.dataKey),
                    value: String(p.value),
                    color: String(p.color),
                  }))}
                />
              ) : null
            }
          />

          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--chart-surface)' }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Bare trend for a KPI tile — no axes, no grid, no hover. */
export function Sparkline({
  data, yKey, tone = 'var(--chart-line)', height = 36,
}: {
  data: Record<string, unknown>[];
  yKey: string;
  tone?: string;
  height?: number;
}) {
  if (data.length < 2) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <Line type="monotone" dataKey={yKey} stroke={tone} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
