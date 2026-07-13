'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Two-team categorical palette, validated for the dark panel surface
 * (#131c2e): lightness band, chroma, CVD separation and contrast all pass.
 * Color follows the team, never the filter state.
 */
export const TEAM_COLORS = ['#16a34a', '#d97706'];

/** Stable team → color assignment by first-batting order. */
export function teamColorMap(teamsInOrder: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  teamsInOrder.forEach((t, i) => { map[t] = TEAM_COLORS[i % TEAM_COLORS.length]; });
  return map;
}

/** Track the rendered width of a container so SVG charts stay crisp at any size. */
function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  // Start small: the first frame renders before the observer fires, and a
  // too-wide default would overflow narrow (mobile) viewports.
  const [width, setWidth] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-4 text-[11px] text-mut">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** One filter row above the charts it scopes: All / team A / team B. */
export function TeamFilter({ teams, value, onChange }: {
  teams: string[]; value: string; onChange: (v: string) => void;
}) {
  const opts = ['all', ...teams];
  return (
    <div className="flex flex-wrap items-center gap-1">
      {opts.map((o) => (
        <button key={o} onClick={() => onChange(o)}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
            value === o ? 'border-grass bg-grass/15 text-grass' : 'border-line text-mut hover:text-ink'
          }`}>
          {o === 'all' ? 'Both teams' : o}
        </button>
      ))}
    </div>
  );
}

export interface WormPoint { x: number; y: number; wickets?: number }
export interface WormSeries { name: string; color: string; points: WormPoint[] }

/**
 * Worm (line) chart: cumulative runs or run rate by over. 2px lines,
 * wicket dots with a surface ring, hover crosshair + tooltip per over.
 */
export function WormChart({ series, height = 200, yFmt = (v: number) => String(Math.round(v)) }: {
  series: WormSeries[]; height?: number; yFmt?: (v: number) => string;
}) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>();
  const [hoverX, setHoverX] = useState<number | null>(null);
  const pad = { top: 10, right: 14, bottom: 24, left: 34 };
  const iw = Math.max(width - pad.left - pad.right, 40);
  const ih = height - pad.top - pad.bottom;

  const maxX = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.x)));
  const maxY = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.y)));
  const niceMaxY = Math.ceil(maxY / 5) * 5 || 5;
  const sx = (x: number) => pad.left + (x / maxX) * iw;
  const sy = (y: number) => pad.top + ih - (y / niceMaxY) * ih;

  const yTicks = [0, niceMaxY / 2, niceMaxY];
  const xStep = maxX > 12 ? 5 : 1;
  const xTicks: number[] = [];
  for (let x = 0; x <= maxX; x += xStep) xTicks.push(x);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left - pad.left) / iw) * maxX);
    setHoverX(x >= 1 && x <= maxX ? x : null);
  };

  return (
    // The SVG is absolutely positioned so its fixed pixel width never inflates
    // the card — otherwise the ResizeObserver measures the inflated width and
    // the chart can never shrink back. overflow-hidden clips the pre-measure
    // frame so it can't widen the page on mobile either.
    <div ref={ref} className="relative w-full overflow-hidden" style={{ height }}>
      <svg className="absolute inset-0" width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHoverX(null)}>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={pad.left + iw} y1={sy(t)} y2={sy(t)} stroke="var(--color-line)" strokeWidth="1" />
            <text x={pad.left - 6} y={sy(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--color-mut)" className="score-digits">
              {yFmt(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={sx(t)} y={height - 8} textAnchor="middle" fontSize="10" fill="var(--color-mut)" className="score-digits">
            {t}
          </text>
        ))}
        {hoverX !== null && (
          <line x1={sx(hoverX)} x2={sx(hoverX)} y1={pad.top} y2={pad.top + ih} stroke="var(--color-mut)" strokeWidth="1" opacity="0.5" />
        )}
        {series.map((s) => (
          <g key={s.name}>
            <polyline
              points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')}
              fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
            />
            {s.points.filter((p) => (p.wickets ?? 0) > 0).map((p) => (
              <circle key={`w${p.x}`} cx={sx(p.x)} cy={sy(p.y)} r="4"
                fill="var(--color-cherry)" stroke="var(--color-panel)" strokeWidth="2" />
            ))}
            {s.points.length > 0 && (() => {
              const last = s.points[s.points.length - 1];
              return <circle cx={sx(last.x)} cy={sy(last.y)} r="4" fill={s.color} stroke="var(--color-panel)" strokeWidth="2" />;
            })()}
          </g>
        ))}
      </svg>
      {hoverX !== null && (
        <div className="pointer-events-none absolute rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{
            left: Math.min(sx(hoverX) + 8, Math.max(width - 150, 0)),
            top: 0,
          }}>
          <div className="font-bold text-ink">Over {hoverX}</div>
          {series.map((s) => {
            const p = s.points.find((pt) => pt.x === hoverX);
            if (!p) return null;
            return (
              <div key={s.name} className="flex items-center gap-1.5 text-mut">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.name}: <span className="score-digits font-semibold text-ink">{yFmt(p.y)}</span>
                {(p.wickets ?? 0) > 0 && <span className="text-cherry">{p.wickets} wkt</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface OverComparisonRow { over: number; values: { name: string; color: string; runs: number; wickets: number }[] }

/** Grouped bars: runs per over, one bar per innings, side by side. */
export function OverComparisonChart({ rows, height = 190 }: { rows: OverComparisonRow[]; height?: number }) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { top: 14, right: 8, bottom: 24, left: 26 };
  const iw = Math.max(width - pad.left - pad.right, 40);
  const ih = height - pad.top - pad.bottom;
  const maxRuns = Math.max(6, ...rows.flatMap((r) => r.values.map((v) => v.runs)));
  const nSeries = Math.max(1, ...rows.map((r) => r.values.length));

  const slot = iw / Math.max(rows.length, 1);
  const barW = Math.min(24, Math.max(4, (slot - 6) / nSeries - 2));
  const sy = (v: number) => pad.top + ih - (v / maxRuns) * ih;

  return (
    // Absolute SVG for the same reason as WormChart: fixed pixel width must
    // not feed back into the measured container width; overflow-hidden clips
    // the pre-measure frame.
    <div ref={ref} className="relative w-full overflow-hidden" style={{ height }}>
      <svg className="absolute inset-0" width={width} height={height} onMouseLeave={() => setHover(null)}>
        {[0, Math.ceil(maxRuns / 2), maxRuns].map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={pad.left + iw} y1={sy(t)} y2={sy(t)} stroke="var(--color-line)" strokeWidth="1" />
            <text x={pad.left - 5} y={sy(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--color-mut)" className="score-digits">{t}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const groupW = r.values.length * (barW + 2) - 2;
          const x0 = pad.left + i * slot + (slot - groupW) / 2;
          return (
            <g key={r.over} onMouseEnter={() => setHover(i)}>
              <rect x={pad.left + i * slot} y={pad.top} width={slot} height={ih}
                fill={hover === i ? 'var(--color-panel-2)' : 'transparent'} opacity="0.5" />
              {r.values.map((v, j) => {
                const h = Math.max((v.runs / maxRuns) * ih, v.runs > 0 ? 3 : 1.5);
                const x = x0 + j * (barW + 2);
                return (
                  <g key={v.name}>
                    <path d={roundedTopBar(x, pad.top + ih - h, barW, h, Math.min(4, barW / 2))} fill={v.color} />
                    {v.wickets > 0 && Array.from({ length: Math.min(v.wickets, 3) }).map((_, k) => (
                      <circle key={k} cx={x + barW / 2} cy={pad.top + ih - h - 6 - k * 8} r="3"
                        fill="var(--color-cherry)" stroke="var(--color-panel)" strokeWidth="2" />
                    ))}
                  </g>
                );
              })}
              <text x={pad.left + i * slot + slot / 2} y={height - 8} textAnchor="middle" fontSize="10"
                fill="var(--color-mut)" className="score-digits">{r.over + 1}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && rows[hover] && (
        <div className="pointer-events-none absolute rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{ left: Math.min(pad.left + hover * slot + slot, Math.max(width - 150, 0)), top: 0 }}>
          <div className="font-bold text-ink">Over {rows[hover].over + 1}</div>
          {rows[hover].values.map((v) => (
            <div key={v.name} className="flex items-center gap-1.5 text-mut">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: v.color }} />
              {v.name}: <span className="score-digits font-semibold text-ink">{v.runs}</span>
              {v.wickets > 0 && <span className="text-cherry">{v.wickets} wkt</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bar path: 4px rounded data-end at the top, square at the baseline. */
function roundedTopBar(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

export interface PlayerRunsRow { name: string; team: string; runs: number; balls: number }

/** Horizontal bars of batter runs, colored by team, value at the bar tip. */
export function PlayerRunsChart({ rows, colors }: { rows: PlayerRunsRow[]; colors: Record<string, string> }) {
  const max = Math.max(1, ...rows.map((r) => r.runs));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={`${r.team}-${r.name}`} className="flex items-center gap-2 text-xs">
          <span className="w-28 truncate text-right text-mut sm:w-40" title={r.name}>{r.name}</span>
          <div className="h-4 min-w-0 flex-1">
            <div className="h-4 rounded-r"
              style={{ width: `${Math.max((r.runs / max) * 100, 1)}%`, background: colors[r.team] ?? TEAM_COLORS[0] }}
              title={`${r.name}: ${r.runs} (${r.balls})`} />
          </div>
          <span className="score-digits w-14 shrink-0 font-semibold text-ink">
            {r.runs} <span className="text-mut">({r.balls})</span>
          </span>
        </div>
      ))}
    </div>
  );
}
