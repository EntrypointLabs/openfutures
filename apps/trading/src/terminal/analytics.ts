import type { PointerEvent } from "react";
import type {
  AnalyticsDropdownControl,
  AnalyticsSegmentControl,
} from "@/components/analytics/controls";

export const CALENDAR_ICON =
  "M7 3v4M17 3v4M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z";
export const FILTER_ICON = "M4 6h16M7 12h10M10 18h4";
export type Granularity = "d" | "w" | "m";
export interface AnalyticsSeries {
  name: string;
  color: string;
  logo?: string;
  data: number[];
}
export interface AnalyticsMode {
  v: string;
  txt?: string;
  ic?: string;
  aria?: string;
}
export interface AnalyticsCardOptions {
  id: string;
  snap?: string;
  title: string;
  sub: string;
  help?: string;
  series: AnalyticsSeries[];
  dates: number[];
  kind?: "lines" | "bars";
  grans?: Granularity[];
  defGran?: Granularity;
  modes?: AnalyticsMode[];
  agg?: "last" | "sum" | "avg";
  zeroBase?: boolean;
  fmt?: (value: number) => string;
  fmtAxis?: (value: number) => string;
  fmtFor?: (mode: string) => (value: number) => string;
  mapMode?: (value: number, mode: string) => number;
}
export interface AnalyticsCardViewModel {
  id: string;
  snap: string;
  title: string;
  sub: string;
  help: string;
  isLines: boolean;
  paths: { d: string; fill: string; stroke: string; sw: number; op: number }[];
  yTicks: { y: number; label: string }[];
  xTicks: { x: number; label: string; cls: string }[];
  tip: {
    show: boolean;
    left?: number;
    side?: string;
    date?: string;
    total?: string;
    rows?: { name: string; color: string; val: string }[];
  };
  hasBand: boolean;
  bandX: number;
  bandW: number;
  hasGran: boolean;
  gran: AnalyticsDropdownControl;
  hasModes: boolean;
  modes: AnalyticsSegmentControl;
  legend: {
    name: string;
    color: string;
    logo?: string;
    cls: string;
    pressed: "true" | "false";
    toggle: () => void;
  }[];
  move: (event: PointerEvent<HTMLDivElement>) => void;
  leave: (event: PointerEvent<HTMLDivElement>) => void;
}
type State = Record<string, any>;
type SetState = (patch: State) => void;

export function buildAnalyticsDropdown(
  id: string,
  label: string,
  icon: string,
  options: { v: string; label: string }[],
  value: string,
  state: State,
  setState: SetState,
  patch: (value: string) => State,
): AnalyticsDropdownControl {
  const open = state.ddOpen === id;
  const selected = options.find((option) => option.v === value) || options[0];
  return {
    label,
    ic: icon,
    cur: selected?.label || "",
    open,
    openStr: open ? "true" : "false",
    btnCls: `dd-btn ac-btn${open ? " is-open" : ""}`,
    toggle: () => setState({ ddOpen: open ? null : id }),
    close: () => setState({ ddOpen: null }),
    opts: options.map((option) => ({
      label: option.label,
      cls: `dd-opt${option.v === value ? " is-on" : ""}`,
      sel: option.v === value ? "true" : "false",
      pick: () => setState({ ...patch(option.v), ddOpen: null }),
    })),
  };
}
export function buildAnalyticsSegment(
  label: string,
  modes: AnalyticsMode[],
  value: string,
  setState: SetState,
  patch: (value: string) => State,
): AnalyticsSegmentControl {
  return {
    label,
    items: modes.map((mode) => ({
      ic: mode.ic,
      txt: mode.txt,
      aria: mode.aria || mode.txt,
      cls: mode.v === value ? "is-on" : "",
      pressed: mode.v === value ? "true" : "false",
      pick: () => setState(patch(mode.v)),
    })),
  };
}

function dateGroups(dates: number[], granularity: Granularity) {
  const groups: { i0: number; i1: number; ms: number; key?: number }[] = [];
  if (granularity === "w") {
    for (let end = dates.length - 1; end >= 0; end -= 7)
      groups.unshift({ i0: Math.max(0, end - 6), i1: end, ms: dates[Math.max(0, end - 6)] });
    if (groups.length > 1 && groups[0].i1 - groups[0].i0 < 6) groups.shift();
  } else if (granularity === "m") {
    dates.forEach((ms, index) => {
      const date = new Date(ms),
        key = date.getUTCFullYear() * 12 + date.getUTCMonth();
      const group = groups.at(-1);
      if (!group || group.key !== key)
        groups.push({
          key,
          i0: index,
          i1: index,
          ms: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
        });
      else group.i1 = index;
    });
    if (groups.length > 1 && new Date(dates[groups[0].i0]).getUTCDate() > 1) groups.shift();
  } else dates.forEach((ms, index) => groups.push({ i0: index, i1: index, ms }));
  return groups;
}
function formatDate(ms: number, granularity: Granularity) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    ...(granularity === "m" ? {} : { day: "numeric" }),
    year: "numeric",
    timeZone: "UTC",
  }).format(ms);
}
function niceStep(span: number) {
  const power = 10 ** Math.floor(Math.log10(span / 4 || 1));
  const ratio = span / 4 / power;
  return (ratio < 1.5 ? 1 : ratio < 3 ? 2 : ratio < 7 ? 5 : 10) * power;
}

/** Each analytics card owns its aggregation, display mode, hidden series and hover state. */
export function buildAnalyticsCard(
  options: AnalyticsCardOptions,
  state: State,
  setState: SetState,
): AnalyticsCardViewModel {
  const { id } = options,
    isLines = options.kind === "lines";
  const granularities = options.grans || ["d", "w", "m"];
  const requested = state.acGran?.[id] || options.defGran || granularities[0];
  const granularity = granularities.includes(requested) ? requested : granularities[0];
  const modes =
    options.modes ||
    (isLines
      ? []
      : [
          { v: "abs", ic: "M6 20V13M12 20V5M18 20v-9", aria: "Values" },
          { v: "pct", txt: "%", aria: "Share of total" },
        ]);
  const mode = state.acMode?.[id] || modes[0]?.v || "",
    percent = mode === "pct";
  const hidden = state.acOff?.[id] || {},
    visible = options.series.filter((series) => !hidden[series.name]);
  const groups = dateGroups(options.dates, granularity),
    count = groups.length;
  const format = options.fmtFor?.(mode) || options.fmt || String,
    axisFormat = options.fmtAxis || format;
  const aggregate = (values: number[]) =>
    options.agg === "sum"
      ? values.reduce((sum, value) => sum + value, 0)
      : options.agg === "avg"
        ? values.reduce((sum, value) => sum + value, 0) / (values.length || 1)
        : values.at(-1) || 0;
  const values = visible.map((series) =>
    groups.map((group) => {
      const value = aggregate(series.data.slice(group.i0, group.i1 + 1));
      return options.mapMode ? options.mapMode(value, mode) : value;
    }),
  );
  if (percent)
    groups.forEach((_, index) => {
      const total = values.reduce((sum, row) => sum + row[index], 0) || 1;
      values.forEach((row) => {
        row[index] = (row[index] / total) * 100;
      });
    });
  let low = 0,
    high = 0;
  if (isLines) {
    low = Math.min(...values.flat());
    high = Math.max(...values.flat());
    if (!Number.isFinite(low)) {
      low = 0;
      high = 1;
    }
    if (options.zeroBase === false) {
      const pad = (high - low) * 0.12 || Math.abs(high) * 0.1 || 1;
      low -= pad;
      high += pad;
    } else low = Math.min(low, 0);
  } else
    groups.forEach((_, index) => {
      high = Math.max(
        high,
        values.reduce((sum, row) => sum + row[index], 0),
      );
    });
  const step = percent ? 25 : niceStep(high - low || 1),
    yLow = percent ? 0 : Math.floor(low / step) * step,
    yHigh = percent ? 100 : Math.ceil((high * (isLines ? 1 : 1.04)) / step) * step || step;
  const y = (value: number) => 6 + ((yHigh - value) / (yHigh - yLow || 1)) * 288,
    barWidth = 1000 / (count || 1);
  const x = (index: number) =>
    isLines ? (count > 1 ? (index / (count - 1)) * 1000 : 500) : (index + 0.5) * barWidth;
  const cumulative = new Array(count).fill(0),
    gap = count > 120 ? 0.18 : count > 40 ? 0.22 : 0.3;
  const paths = values.map((row, seriesIndex) => {
    let d = "";
    row.forEach((value, index) => {
      if (isLines) d += `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`;
      else if (value > 0) {
        const y0 = y(cumulative[index]),
          y1 = y(cumulative[index] + value);
        d += `M${(index * barWidth + (barWidth * gap) / 2).toFixed(2)} ${y0.toFixed(2)}V${y1.toFixed(2)}H${((index + 1) * barWidth - (barWidth * gap) / 2).toFixed(2)}V${y0.toFixed(2)}Z`;
        cumulative[index] += value;
      }
    });
    return {
      d: d || "M0 0",
      fill: isLines ? "none" : visible[seriesIndex].color,
      stroke: isLines ? visible[seriesIndex].color : "none",
      sw: isLines ? 1.8 : 0,
      op: isLines ? 1 : 0.92,
    };
  });
  const yTicks = [];
  for (let value = yLow; value <= yHigh + step * 1e-6; value += step)
    yTicks.push({
      y: y(value) / 3,
      label: percent
        ? `${Math.round(value)}%`
        : Math.abs(value) < step * 1e-6 && !isLines
          ? "0"
          : axisFormat(value)
              .replace(/\.00(?=[KMBT])/, "")
              .replace(/(\.\d)0(?=[KMBT])/, "$1"),
    });
  const ticks = count >= 9 ? 9 : count >= 5 ? 5 : count;
  const xTicks = Array.from({ length: ticks }, (_, slot) => {
    const index = ticks > 1 ? Math.round(((count - 1) * slot) / (ticks - 1)) : 0;
    return {
      x: x(index) / 10,
      label: formatDate(groups[index].ms, granularity),
      cls: `${slot === 0 ? "first" : slot === ticks - 1 ? "last" : ""}${ticks === 9 ? (slot % 4 === 0 ? " t4" : slot % 2 === 0 ? " t2" : " t1") : ticks === 5 ? (slot % 2 === 0 ? " t4" : " t2") : " t4"}`,
    };
  });
  const hover = state.acHov?.id === id && state.acHov.i < count ? (state.acHov.i as number) : null;
  const rows =
    hover === null
      ? []
      : visible
          .map((series, index) => ({
            name: series.name,
            color: series.color,
            raw: values[index][hover],
            val: percent ? `${values[index][hover].toFixed(1)}%` : format(values[index][hover]),
          }))
          .sort((a, b) => b.raw - a.raw);
  const patch = (key: string, value: any) => ({
    [key]: { ...state[key], [id]: value },
    acHov: null,
  });
  return {
    id,
    snap: options.snap || id,
    title: options.title,
    sub: options.sub,
    help: options.help || options.sub,
    isLines,
    paths,
    yTicks,
    xTicks,
    tip:
      hover === null
        ? { show: false }
        : {
            show: true,
            left: x(hover) / 10,
            side: x(hover) > 550 ? "tip-l" : "tip-r",
            date: `${granularity === "w" ? "Week of " : ""}${formatDate(groups[hover].ms, granularity)}`,
            total: isLines
              ? ""
              : percent
                ? "100%"
                : format(rows.reduce((sum, row) => sum + row.raw, 0)),
            rows,
          },
    hasBand: hover !== null && !isLines,
    bandX: hover === null ? 0 : hover * barWidth,
    bandW: barWidth,
    hasGran: granularities.length > 1,
    gran: buildAnalyticsDropdown(
      `acg-${id}`,
      "Granularity",
      CALENDAR_ICON,
      granularities.map((value) => ({
        v: value,
        label: { d: "Daily", w: "Weekly", m: "Monthly" }[value],
      })),
      granularity,
      state,
      setState,
      (value) => patch("acGran", value),
    ),
    hasModes: modes.length > 1,
    modes: buildAnalyticsSegment("Display", modes, mode, setState, (value) =>
      patch("acMode", value),
    ),
    legend: options.series.map((series) => ({
      name: series.name,
      color: series.color,
      logo: series.logo,
      cls: `ac-lgi${hidden[series.name] ? " is-off" : ""}`,
      pressed: hidden[series.name] ? "false" : "true",
      toggle: () => {
        const next = { ...hidden, [series.name]: !hidden[series.name] };
        if (!options.series.every((candidate) => next[candidate.name]))
          setState(patch("acOff", next));
      },
    })),
    move: (event) => {
      const rect = event.currentTarget.getBoundingClientRect(),
        ratio = Math.max(0, Math.min(0.9999, (event.clientX - rect.left) / rect.width)),
        index = isLines ? Math.round(ratio * (count - 1)) : Math.floor(ratio * count);
      if (state.acHov?.id !== id || state.acHov?.i !== index) setState({ acHov: { id, i: index } });
    },
    leave: (event) => {
      if (event.pointerType !== "touch" && state.acHov) setState({ acHov: null });
    },
  };
}
