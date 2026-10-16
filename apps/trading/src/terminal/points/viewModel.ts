import type { ChangeEvent, MouseEvent } from "react";
import { seededRandom } from "@openfutures/core";
import { LOGOS } from "@/assets/logos";
import { leaderAvatar } from "@/lib/leaderAvatar";
import {
  POINT_SOURCES,
  YOUR_WEEK_POINTS,
  pointTraders,
  type PointTrader,
  type PointSource,
} from "@/data/points";
import type { Terminal, TerminalState } from "@/terminal/Terminal";
import type { AnalyticsDropdownControl } from "@/components/analytics/controls";
import type { PagerModel } from "@/components/common/Pager";

const DAY = 86_400_000,
  SEASON = Date.UTC(2026, 8, 21);
const dateLabel = (time: number) =>
  new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const format = (value: number) => Math.round(value).toLocaleString("en-US");
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
export interface PointsContext {
  goTrade?: () => void;
  goLiquidity?: () => void;
  goProp?: () => void;
}

export function buildPointsViewModel(
  terminal: Terminal,
  state: TerminalState,
  isMobile: boolean,
  context: PointsContext = {},
) {
  const set = (patch: TerminalState) => terminal.setState(patch);
  const now = state.now || Date.now(),
    date = new Date(now);
  const weekStart =
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      ((date.getUTCDay() + 6) % 7) * DAY,
    weekEnd = weekStart + 7 * DAY;
  const week = Math.max(1, Math.floor((weekStart - SEASON) / (7 * DAY)) + 1);
  const traders = pointTraders(week),
    you = traders.at(-1)!;
  const validPeriod = (period: string | undefined, fallback: string) =>
    period === "all" || (Number(period) >= 1 && Number(period) <= week) ? period! : fallback;
  const valuesFor = (trader: PointTrader, period: string) =>
    period === "all"
      ? trader.weeks.reduce(
          (totals, values) => totals.map((total, index) => total + values[index]!),
          [0, 0, 0, 0],
        )
      : period === String(week)
        ? trader.scores
        : trader.weeks[Number(period) - 1] || [0, 0, 0, 0];
  const rowFor = (trader: PointTrader, rank: number) => ({
    name: trader.name,
    initials: trader.name.slice(0, 2).toUpperCase(),
    background: trader.background,
    avatar: trader.you ? state.avatar || LOGOS.pfp : leaderAvatar(trader.name),
    you: trader.you,
    rank: String(rank),
    cls: "points-row" + (rank <= 3 ? " is-top" : "") + (trader.you ? " is-you" : ""),
  });
  function paginate<T>(key: string, items: T[]) {
    const size = 10,
      count = Math.max(1, Math.ceil(items.length / size)),
      current = Math.max(0, Math.min(count - 1, state.ptPages?.[key] || 0));
    const page = (index: number) => () => set({ ptPages: { ...state.ptPages, [key]: index } });
    const pager: PagerModel = {
      text: items.length
        ? `${current * size + 1} to ${Math.min(items.length, (current + 1) * size)} of ${items.length}`
        : "0 results",
      prev: page(current - 1),
      next: page(current + 1),
      prevDis: current <= 0,
      nextDis: current >= count - 1,
      nums: Array.from({ length: count }, (_, index) => ({
        label: String(index + 1),
        cls: "pgx-n" + (index === current ? " is-on" : ""),
        cur: index === current ? "page" : "false",
        go: page(index),
      })),
    };
    return { rows: items.slice(current * size, (current + 1) * size), pager };
  }
  const periods = [
    { value: "all", label: "All time" },
    ...Array.from({ length: week }, (_, index) => ({
      value: String(week - index),
      label: "Week " + (week - index) + (index === 0 ? ", live" : ""),
    })),
  ];
  function periodControl(
    key: string,
    period: string,
    change: (value: string) => void,
  ): AnalyticsDropdownControl {
    const open = state.ptDropdown === key;
    return {
      label: "Period",
      cur: periods.find((option) => option.value === period)?.label || "All time",
      ic: "M7 3v4M17 3v4M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
      open,
      btnCls: "dd-btn ac-btn" + (open ? " is-on" : ""),
      toggle: () => set({ ptDropdown: open ? null : key }),
      close: () => set({ ptDropdown: null }),
      opts: periods.map((option) => ({
        label: option.label,
        cls: "dd-opt" + (option.value === period ? " is-on" : ""),
        sel: option.value === period ? "true" : "false",
        pick: () => {
          change(option.value);
          set({ ptDropdown: null, ptPages: { ...state.ptPages, [key]: 0 } });
        },
      })),
    };
  }
  const boards = POINT_SOURCES.map((source, sourceIndex) => {
    const period = validPeriod(state.ptPerB?.[source.id], String(week));
    const list = traders
      .filter((trader) => valuesFor(trader, period)[sourceIndex]! > 0)
      .sort((a, b) => valuesFor(b, period)[sourceIndex]! - valuesFor(a, period)[sourceIndex]!);
    const yourRank = list.findIndex((trader) => trader.you) + 1;
    const fullRows = list.map((trader, index) => ({
        ...rowFor(trader, index + 1),
        score: format(valuesFor(trader, period)[sourceIndex]!),
      })),
      paged = paginate(source.id, fullRows);
    const live = period === String(week),
      title = live
        ? "Weekly " + source.label + " Score"
        : source.label + " Points, " + (period === "all" ? "All Time" : "Week " + period);
    return {
      id: source.id,
      title,
      subtitle: live
        ? "Scores convert on " + dateLabel(weekEnd)
        : "Converted points from " + (period === "all" ? "every completed week" : "week " + period),
      unit: live ? "Score" : "Points",
      who: source.who,
      rows: paged.rows,
      pager: paged.pager,
      period: periodControl(source.id, period, (value) =>
        set({ ptPerB: { ...state.ptPerB, [source.id]: value } }),
      ),
      you: {
        ...rowFor(you, yourRank),
        rank: yourRank ? String(yourRank) : "-",
        score: format(valuesFor(you, period)[sourceIndex]!),
      },
    };
  });
  const generalPeriod = validPeriod(state.ptPer, "all"),
    generalLive = generalPeriod === String(week),
    query = String(state.ptQ || "")
      .trim()
      .toLowerCase();
  const ranked = traders
    .map((trader) => ({
      trader,
      values: valuesFor(trader, generalPeriod),
      total: sum(valuesFor(trader, generalPeriod)),
    }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  const sort: { k: string; d: number } = state.ptSort || { k: "total", d: -1 };
  const sortValue = (entry: (typeof ranked)[number]) =>
    sort.k === "total" ? entry.total : entry.values[Number(sort.k)]!;
  const list = ranked
    .filter((entry) => !query || entry.trader.name.toLowerCase().includes(query))
    .sort((a, b) => (sortValue(a) - sortValue(b)) * sort.d || a.rank - b.rank);
  const generalRows = list.map((entry) => ({
      ...rowFor(entry.trader, entry.rank),
      values: entry.values.map(format),
      total: format(entry.total),
    })),
    generalPage = paginate("general", generalRows);
  const yourGeneral = ranked.find((entry) => entry.trader.you);
  const allTimeRank =
    traders
      .map((trader) => ({ trader, total: sum(valuesFor(trader, "all")) }))
      .filter((entry) => entry.total > 0)
      .sort((a, b) => b.total - a.total)
      .findIndex((entry) => entry.trader.you) + 1;
  const tab: PointSource | "all" =
    POINT_SOURCES.some((source) => source.id === state.ptTab) || state.ptTab === "all"
      ? state.ptTab
      : "trading";

  // Daily estimates and completed weeks use the source design's deterministic weights.
  const random = seededRandom(9917),
    rate: number[] = [],
    estimates: Record<number, boolean> = {},
    weekPoints = YOUR_WEEK_POINTS.map(sum),
    seasonDay = Math.floor(SEASON / DAY),
    today = Math.floor(now / DAY);
  for (let w = 0; w < week; w++) {
    const day = seasonDay + w * 7,
      live = w === week - 1,
      days = live ? Math.max(1, Math.min(7, today - day + 1)) : 7;
    const weights = Array.from(
        { length: 7 },
        (_, index) => (0.5 + random()) * ((day + index + 3) % 7 >= 5 ? 0.72 : 1),
      ),
      weightTotal = sum(weights),
      total = live
        ? weekPoints.at(-1)! * (1.04 + random() * 0.22)
        : weekPoints[w] || weekPoints.at(-1)!;
    for (let index = 0; index < days; index++) {
      rate.push(Math.round((total * weights[index]!) / weightTotal));
      if (live) estimates[rate.length - 1] = true;
    }
  }
  const granularity = state.ptGranularity || "D",
    step = granularity === "M" ? 30 : granularity === "W" ? 7 : 1,
    chartPercent = state.ptRateValue === "%";
  const granularityControl: AnalyticsDropdownControl = {
    label: "Granularity",
    cur: granularity === "M" ? "Monthly" : granularity === "W" ? "Weekly" : "Daily",
    open: state.ptDropdown === "rate-granularity",
    btnCls: "dd-btn ac-btn" + (state.ptDropdown === "rate-granularity" ? " is-on" : ""),
    toggle: () =>
      set({ ptDropdown: state.ptDropdown === "rate-granularity" ? null : "rate-granularity" }),
    close: () => set({ ptDropdown: null }),
    opts: [
      ["D", "Daily"],
      ["W", "Weekly"],
      ["M", "Monthly"],
    ].map(([value, label]) => ({
      label: label!,
      cls: "dd-opt" + (granularity === value ? " is-on" : ""),
      sel: granularity === value ? "true" : "false",
      pick: () => set({ ptGranularity: value, ptDropdown: null, ptHover: null }),
    })),
  };
  const sampled = rate
      .map((_, index) => index)
      .filter((index) => index % step === 0 || index === rate.length - 1),
    chartValues = sampled.map((index) =>
      chartPercent ? (rate[index]! / (rate[0] || 1) - 1) * 100 : rate[index]!,
    );
  const low = Math.min(...chartValues),
    high = Math.max(...chartValues),
    span = high - low || 1,
    chartLine =
      "M" +
      chartValues
        .map(
          (value, index) =>
            ((index / Math.max(1, chartValues.length - 1)) * 1000).toFixed(1) +
            " " +
            (16 + (1 - (value - low) / span) * 168).toFixed(1),
        )
        .join(" L");
  const hover =
    state.ptHover == null ? null : Math.max(0, Math.min(sampled.length - 1, state.ptHover));
  const average = (values: number[]) => (values.length ? sum(values) / values.length : 0),
    currentAverage = average(rate.slice(-7)),
    previousAverage = average(rate.slice(-14, -7)),
    change = previousAverage ? (currentAverage / previousAverage - 1) * 100 : 0;
  return {
    isMobile,
    week: String(week),
    weekLine: `Week ${week}, ${dateLabel(weekStart)} to ${dateLabel(weekEnd - DAY)}. Scores convert on ${dateLabel(weekEnd)}, with 500,000 points accruing this week.`,
    phoneWeekLine: `Week ${week}, converts ${dateLabel(weekEnd)}, 500,000 points.`,
    conversion: dateLabel(weekEnd),
    start: dateLabel(weekStart),
    end: dateLabel(weekEnd - DAY),
    progress: Math.max(0, Math.min(100, ((now - weekStart) / (7 * DAY)) * 100)),
    total: format(sum(valuesFor(you, "all"))),
    stats: [
      { label: "Trading Score", value: format(you.scores[0]!), link: "Trade", go: context.goTrade },
      {
        label: "Liquidity Score",
        value: format(you.scores[1]!),
        link: "Deposit",
        go: context.goLiquidity,
      },
      {
        label: "Prop Score",
        value: format(you.scores[2]!),
        link: "Get Funded",
        go: context.goProp,
      },
      { label: "Referral Score", value: format(you.scores[3]!), link: "", go: undefined },
    ],
    mini: [
      { label: "Overall Rank", value: allTimeRank ? "#" + allTimeRank : "-" },
      { label: "Last Week (Points)", value: week > 1 ? format(sum(you.weeks[week - 2]!)) : "-" },
      { label: "Weeks Converted", value: String(week - 1) },
    ],
    rate: {
      line: chartLine,
      area: chartLine + " L1000 200 L0 200 Z",
      hidden: state.ptRateLegend === false,
      unit: chartPercent ? "Change (%)" : "Points per Day",
      dates: sampled.length
        ? [0, Math.floor((sampled.length - 1) / 2), sampled.length - 1].map((index) => ({
            x: (index / Math.max(1, sampled.length - 1)) * 100,
            label: dateLabel((seasonDay + sampled[index]!) * DAY),
          }))
        : [],
      hover:
        hover !== null
          ? {
              x: (hover / Math.max(1, sampled.length - 1)) * 100,
              date:
                dateLabel((seasonDay + sampled[hover]!) * DAY) +
                (estimates[sampled[hover]!] ? " (est.)" : ""),
              value: chartPercent
                ? chartValues[hover]!.toFixed(1) + "%"
                : format(chartValues[hover]!),
            }
          : null,
      move: (event: MouseEvent<SVGSVGElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (bounds.width)
          set({
            ptHover: Math.max(
              0,
              Math.min(
                sampled.length - 1,
                Math.round(((event.clientX - bounds.left) / bounds.width) * (sampled.length - 1)),
              ),
            ),
          });
      },
      leave: () => set({ ptHover: null }),
      change: (change < 0 ? "-" : "+") + Math.abs(change).toFixed(1) + "% vs prior 7 days",
      cls: change < 0 ? "down" : "up",
      granularity: granularityControl,
      values: ["Value", "%"].map((label) => ({
        label,
        on: (state.ptRateValue || "Value") === label,
        pick: () => set({ ptRateValue: label, ptHover: null }),
      })),
      toggleLegend: () => set({ ptRateLegend: state.ptRateLegend === false }),
    },
    tab,
    tabs: [
      ...POINT_SOURCES.map((source) => ({
        key: source.id,
        label: source.id === "ref" ? "Referrals" : source.label,
      })),
      { key: "all", label: "General" },
    ].map((item) => ({
      ...item,
      on: tab === item.key,
      pick: () => set({ ptTab: item.key, ptDropdown: null }),
    })),
    boards,
    gen: {
      title:
        generalPeriod === "all"
          ? "All Time Points"
          : "Week " + generalPeriod + (generalLive ? " Scores" : " Points"),
      subtitle:
        ranked.length +
        " traders ranked by total " +
        (generalLive ? "score" : "points") +
        ", all sources",
      period: periodControl("general", generalPeriod, (value) => set({ ptPer: value })),
      query: state.ptQ || "",
      onQuery: (event: ChangeEvent<HTMLInputElement>) =>
        set({ ptQ: event.target.value, ptPages: { ...state.ptPages, general: 0 } }),
      heads: [
        ...POINT_SOURCES.map((source, index) => ({ key: String(index), label: source.label })),
        { key: "total", label: "Total" },
      ].map((head) => ({
        label: head.label + " (" + (generalLive ? "Score" : "Points") + ")",
        on: sort.k === head.key,
        arrow: sort.k === head.key ? (sort.d < 0 ? "↓" : "↑") : "",
        pick: () =>
          set({
            ptSort: { k: head.key, d: sort.k === head.key ? -sort.d : -1 },
            ptPages: { ...state.ptPages, general: 0 },
          }),
      })),
      rows: generalPage.rows,
      pager: generalPage.pager,
      you: {
        ...rowFor(you, yourGeneral?.rank || 0),
        rank: yourGeneral ? String(yourGeneral.rank) : "-",
        values: (yourGeneral?.values || [0, 0, 0, 0]).map(format),
        total: format(yourGeneral?.total || 0),
      },
    },
  };
}
export type PointsViewModel = ReturnType<typeof buildPointsViewModel>;
