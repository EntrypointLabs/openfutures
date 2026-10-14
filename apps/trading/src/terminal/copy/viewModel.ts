import type { ChangeEvent, MouseEvent } from "react";
import { COPY_LEADERS, type CopyLeader } from "@/data/copy";
import { LOGOS } from "@/assets/logos";
import { VENUES } from "@/data/venues";
import { leaderAvatar } from "@/lib/leaderAvatar";
import { hashString } from "@openfutures/core";
import type { Terminal, TerminalState } from "@/terminal/Terminal";
import type { AnalyticsDropdownControl } from "@/components/analytics/controls";
import {
  COPY_DAYS,
  DAY,
  clamp,
  direction,
  format,
  signed,
  number,
  marketFor,
  leaderSeries,
  leaderStats,
  leaderPositions,
  followerPerformance,
  mirrorPositions,
  type CopySettings,
  type CopySeries,
} from "./model";

export interface CopyContext {
  availableBalance?: number;
  goTrade?: (symbol: string) => void;
  showToast?: (message: string) => void;
}
export interface CopyMetric {
  label: string;
  value: string;
  cls?: string;
}
export interface CopyPositionCardModel {
  key: string;
  sym: string;
  logo: string;
  venueLogo: string;
  venueName: string;
  lev: string;
  side: string;
  sideCls: string;
  pnl: string;
  pnlCls: string;
  roe: string;
  details: () => void;
}
const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const dateLabel = (time: number) => {
  const date = new Date(time);
  return monthNames[date.getUTCMonth()]!.slice(0, 3) + " " + date.getUTCDate();
};
const agoLabel = (time: number, now: number) => {
  const mins = Math.max(1, Math.round((now - time) / 60_000));
  return mins < 60
    ? mins + "m ago"
    : mins < 1440
      ? Math.floor(mins / 60) + "h ago"
      : Math.floor(mins / 1440) + "d ago";
};
const holdLabel = (hours: number) =>
  hours < 1
    ? Math.max(1, Math.round(hours * 60)) + "m"
    : hours < 24
      ? Math.floor(hours) + "h " + Math.round((hours % 1) * 60) + "m"
      : Math.floor(hours / 24) + "d " + Math.round(hours % 24) + "h";

const eyeIcon =
  "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z";

/** Copy's state and behavior are isolated from the terminal's trading account model. */
export function buildCopyViewModel(
  terminal: Terminal,
  state: TerminalState,
  isMobile: boolean,
  context: CopyContext = {},
) {
  const set = (patch: TerminalState) => terminal.setState(patch);
  const now = state.now || Date.now(),
    today = Math.floor(now / DAY);
  const snapshotAt = terminal._copySnapshotAt || (terminal._copySnapshotAt = now);
  const toast = context.showToast || ((message: string) => set({ toast: message }));
  const goTrade = context.goTrade || ((symbol: string) => set({ sym: symbol, screen: "detail" }));
  const seededFollow: Record<string, CopySettings> = {
    "perp.queen": {
      since: (today - 58) * DAY,
      mode: "prop",
      mult: "0.05",
      alloc: "300",
      lev: "5",
      dd: "15",
      open: true,
      base: 300,
    },
    kaito: {
      since: (today - 34) * DAY,
      mode: "mult",
      mult: "0.02",
      alloc: "250",
      lev: "8",
      dd: "25",
      open: false,
      base: 250,
    },
    nightowl: {
      since: (today - 17) * DAY,
      mode: "prop",
      mult: "0.05",
      alloc: "160",
      lev: "10",
      dd: "20",
      open: false,
      base: 160,
    },
  };
  const follow: Record<string, CopySettings> = state.cpFollow || seededFollow;
  const watching: Record<string, number> = state.cpWatch || {
    maven: (today - 21) * DAY,
    basisbob: (today - 44) * DAY,
    deltaneutral: (today - 9) * DAY,
    "vol.smile": (today - 3) * DAY,
  };
  const draft: Record<string, CopySettings> = state.cpDraft || {},
    tips: Record<string, number> = state.cpTips || { "perp.queen": 12, nightowl: 5 };
  const free = Math.max(0, context.availableBalance ?? 1_250);
  const used = Object.values(follow).reduce(
      (sum, settings) => sum + number(settings.alloc) - settings.base,
      0,
    ),
    available = Math.max(0, free - used);
  const maxAlloc = (id: string) =>
    Math.max(0, free - used + (follow[id] ? number(follow[id]!.alloc) - follow[id]!.base : 0)) +
    (follow[id]?.base || 0);
  const settingsFor = (id: string): CopySettings =>
    follow[id] ||
    draft[id] || {
      mode: "prop",
      mult: "0.05",
      alloc: String(Math.floor(Math.min(250, available))),
      lev: "10",
      dd: "20",
      open: false,
      base: 0,
    };
  const edit = (id: string, patch: Partial<CopySettings>) => {
    if (follow[id]) set({ cpFollow: { ...follow, [id]: { ...follow[id], ...patch } } });
    else set({ cpDraft: { ...draft, [id]: { ...settingsFor(id), ...patch } } });
  };
  const clean = (id: string, settings: CopySettings): CopySettings => ({
    ...settings,
    alloc: String(clamp(number(settings.alloc), 0, maxAlloc(id))),
    mult: String(clamp(number(settings.mult), 0, 100)),
    lev: String(clamp(number(settings.lev, 1), 1, 50)),
    dd: String(clamp(number(settings.dd, 20), 1, 90)),
  });
  const data = COPY_LEADERS.map((leader) => {
    const series = leaderSeries(leader, today),
      settings = follow[leader.id],
      positions = leaderPositions(leader, snapshotAt);
    const performance = settings
      ? followerPerformance(leader, series, clean(leader.id, settings), today)
      : null;
    const calc = mirrorPositions(
      leader,
      series,
      clean(leader.id, settings || { ...settingsFor(leader.id), since: now }),
      positions,
      state.cpClosed?.[leader.id] || {},
      performance?.stopped ? "Stopped" : settings?.paused ? "Paused" : "",
    );
    return { leader, series, settings, positions, performance, calc, stats: leaderStats(series) };
  });
  const followed = data.filter((entry) => entry.settings),
    watched = data.filter((entry) => watching[entry.leader.id] !== undefined && !entry.settings),
    discover = data.filter((entry) => !entry.settings);
  const total = followed.reduce(
    (sum, entry) => ({
      equity: sum.equity + entry.performance!.alloc + entry.performance!.pnl,
      alloc: sum.alloc + entry.performance!.alloc,
      pnl: sum.pnl + entry.performance!.pnl,
      open: sum.open + entry.calc.openPnl,
      paid: sum.paid + entry.performance!.fee,
    }),
    { equity: 0, alloc: 0, pnl: 0, open: 0, paid: Object.values(tips).reduce((a, b) => a + b, 0) },
  );
  const tab: "following" | "watching" | "discover" =
    state.cpTab === "watching" ? "watching" : state.cpTab === "discover" ? "discover" : "following";
  const headers = {
    following: ["Allocated (USDC)", "Your PnL (USDC)", "Your Return (%)", "Open Positions"],
    watching: ["Since Added (%)", "30D Return (%)", "30D PnL (USDC)", "Max Drawdown (%)"],
    discover: ["30D Return (%)", "Win Rate (%)", "Max Drawdown (%)", "Copiers"],
  };
  const sort =
    state.cpSort?.tab === tab ? state.cpSort : { tab, k: tab === "following" ? 1 : 0, d: -1 };
  const selectedId: string | null = state.cpOpen || null;
  const toggleTrader = (id: string) => () =>
    set({
      cpOpen: selectedId === id ? null : id,
      cpMonth: 0,
      cpHov: null,
      cpTip: null,
      cpSheet: null,
      cpMV: "perf",
      cpMS: "pos",
      cpCD: null,
      cpPD: null,
    });
  const toggleWatch = (id: string) => () => {
    const next = { ...watching };
    if (next[id] !== undefined) delete next[id];
    else next[id] = now;
    set({ cpWatch: next });
    toast(next[id] !== undefined ? "Watching " + id : "Removed " + id + " from Watching");
  };
  const pauseCopy = (id: string) => () => {
    const current = follow[id]!;
    const paused = !current.paused;
    set({
      cpFollow: { ...follow, [id]: { ...current, paused, pausedAt: paused ? now : undefined } },
    });
    toast((paused ? "Paused copying " : "Resumed copying ") + id);
  };
  const ranges = (key: string, current: string) =>
    [
      ["7", "1W"],
      ["30", "1M"],
      ["90", "3M"],
    ].map(([value, label]) => ({
      value: value!,
      label: label!,
      on: current === value,
      pick: () => set({ [key]: value, cpHov: null }),
    }));

  function chartModel(id: string, values: number[], startDay: number, unit: string) {
    const granularity = state.cpChartGranularity?.[id] || "D";
    const sample = granularity === "M" ? 30 : granularity === "W" ? 7 : 1;
    const indices = values
      .map((_, index) => index)
      .filter((index) => index % sample === 0 || index === values.length - 1);
    const sampled = indices.map((index) => values[index]!);
    const min = Math.min(0, ...sampled),
      max = Math.max(0, ...sampled),
      span = max - min || 1;
    const points = sampled.map(
      (value, index) =>
        ((index / Math.max(1, sampled.length - 1)) * 1000).toFixed(1) +
        " " +
        (16 + (1 - (value - min) / span) * 168).toFixed(1),
    );
    const line = "M" + points.join(" L"),
      zero = 16 + (1 - (0 - min) / span) * 168;
    const hoverIndex = state.cpHov?.id === id ? clamp(state.cpHov.i, 0, sampled.length - 1) : -1;
    const dropdownKey = "copy-granularity:" + id;
    const granularityControl: AnalyticsDropdownControl = {
      label: "Granularity",
      cur: granularity === "M" ? "Monthly" : granularity === "W" ? "Weekly" : "Daily",
      open: state.cpChartDropdown === dropdownKey,
      btnCls: "dd-btn ac-btn" + (state.cpChartDropdown === dropdownKey ? " is-on" : ""),
      toggle: () =>
        set({ cpChartDropdown: state.cpChartDropdown === dropdownKey ? null : dropdownKey }),
      close: () => set({ cpChartDropdown: null }),
      opts: [
        ["D", "Daily"],
        ["W", "Weekly"],
        ["M", "Monthly"],
      ].map(([value, label]) => ({
        label: label!,
        cls: "dd-opt" + (granularity === value ? " is-on" : ""),
        sel: granularity === value ? "true" : "false",
        pick: () =>
          set({
            cpChartGranularity: { ...state.cpChartGranularity, [id]: value },
            cpChartDropdown: null,
            cpHov: null,
          }),
      })),
    };
    return {
      line,
      area: line + ` L1000 ${zero} L0 ${zero} Z`,
      unit,
      cls: direction(sampled.at(-1)! - sampled[0]!),
      hidden: state.cpChartLegend?.[id] === false,
      dates: [0, Math.floor((indices.length - 1) / 2), indices.length - 1].map((index) => ({
        x: (index / Math.max(1, indices.length - 1)) * 100,
        label: dateLabel((startDay + indices[index]!) * DAY),
      })),
      hover:
        hoverIndex >= 0
          ? {
              x: (hoverIndex / Math.max(1, sampled.length - 1)) * 100,
              date: dateLabel((startDay + indices[hoverIndex]!) * DAY),
              value: signed(sampled[hoverIndex]!),
            }
          : null,
      move: (event: MouseEvent<SVGSVGElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (bounds.width)
          set({
            cpHov: {
              id,
              i: clamp(
                Math.round(((event.clientX - bounds.left) / bounds.width) * (sampled.length - 1)),
                0,
                sampled.length - 1,
              ),
            },
          });
      },
      leave: () => set({ cpHov: null }),
      granularity: granularityControl,
      toggleLegend: () =>
        set({
          cpChartLegend: { ...state.cpChartLegend, [id]: state.cpChartLegend?.[id] === false },
        }),
    };
  }

  function detailFor(entry: (typeof data)[number]) {
    const { leader, series, settings, stats, calc, performance } = entry;
    const formSettings = settingsFor(leader.id),
      followed = !!settings,
      paused = !!settings?.paused,
      stopped = !!performance?.stopped;
    const cleanSettings = clean(leader.id, formSettings),
      max = maxAlloc(leader.id);
    const range = clamp(parseInt(state.cpR || "30", 10), 7, 90);
    const chartPercent = state.cpValue !== "value";
    const values = series.eq
      .slice(COPY_DAYS - range)
      .map((equity) =>
        chartPercent
          ? (equity / series.eq[COPY_DAYS - range]! - 1) * 100
          : equity - series.eq[COPY_DAYS - range]!,
      );
    const metric = (label: string, value: number, decimals = 2, sign = false): CopyMetric => ({
      label,
      value: sign ? signed(value, decimals) : format(value, decimals),
      cls: sign ? direction(value) : "",
    });
    const monthOffset = Math.min(0, state.cpMonth || 0),
      current = new Date(now);
    const monthStart = Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + monthOffset, 1),
      monthEnd = Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + monthOffset + 1, 1);
    const firstDay = Math.floor(monthStart / DAY),
      length = Math.round((monthEnd - monthStart) / DAY),
      lead = (firstDay + 3) % 7;
    const monthMaximum = Math.max(
      1,
      ...Array.from({ length }, (_, index) => {
        const absolute = firstDay + index,
          seriesIndex = absolute - (today - COPY_DAYS + 1);
        return absolute <= today && seriesIndex >= 0 && series.trades[seriesIndex]! > 0
          ? Math.abs(series.pnl[seriesIndex]!)
          : 0;
      }),
    );
    let monthPnl = 0,
      monthTrades = 0,
      monthGain = 0,
      monthLoss = 0,
      monthBest: number | null = null;
    const days = Array.from({ length: Math.ceil((lead + length) / 7) * 7 }, (_, index) => {
      const day = index - lead + 1,
        absolute = firstDay + day - 1,
        seriesIndex = absolute - (today - COPY_DAYS + 1);
      const valid = day >= 1 && day <= length,
        available = valid && absolute <= today && seriesIndex >= 0;
      const pnl = available ? series.pnl[seriesIndex]! : 0,
        trades = available ? series.trades[seriesIndex]! : 0;
      if (trades) {
        monthPnl += pnl;
        monthTrades += trades;
        if (pnl > 0) monthGain += pnl;
        else monthLoss -= pnl;
        monthBest = monthBest === null ? pnl : Math.max(monthBest, pnl);
      }
      return {
        key: index,
        day: valid ? String(day) : "",
        cls: !valid
          ? "off"
          : !available
            ? "none"
            : trades
              ? (pnl >= 0 ? "win" : "loss") +
                " i" +
                Math.min(4, 1 + Math.floor((Math.abs(pnl) / monthMaximum) * 3.999))
              : "idle",
        today: absolute === today,
        selected: state.cpCD === String(day),
        disabled: !available,
        pnl: signed(pnl),
        trades,
        pick: () => set({ cpCD: String(day) }),
      };
    });
    const chosenDay = days.find((day) => day.selected && !day.disabled);
    const monthTitle =
      monthNames[new Date(monthStart).getUTCMonth()] + " " + new Date(monthStart).getUTCFullYear();
    const monthHold = leader.hold * (0.88 + (hashString(leader.id + monthOffset) % 25) / 100);
    const statsLists: CopyMetric[][] = [
      [
        metric("30D Return (%)", stats.ret, 2, true),
        metric("30D PnL (USDC)", stats.pnl, 2, true),
        metric("Win Rate (%)", stats.winRate, 1),
        metric("Max Drawdown (%)", stats.drawdown, 1),
        metric("Avg Leverage (x)", leader.lev, 1),
        metric("Equity (USDC)", calc.equity, 0),
      ],
      [
        metric("Monthly PnL (USDC)", monthPnl, 2, true),
        metric("Trades", monthTrades, 0),
        { label: "Avg Hold Time", value: monthTrades ? holdLabel(monthHold) : "-" },
        metric("Profit Factor", monthLoss ? monthGain / monthLoss : monthGain ? 99 : 0),
        {
          label: "Best Day (USDC)",
          value: monthBest === null ? "-" : signed(monthBest),
          cls: monthBest === null ? "" : direction(monthBest),
        },
      ],
    ];
    const card = (row: (typeof calc.rows)[number], mine: boolean): CopyPositionCardModel => {
      const pnl = mine ? row.yourPnl : row.leaderPnl,
        margin = mine ? row.yourMargin : row.leaderMargin;
      const venue = VENUES.find((item) => item.id === row.venue)!;
      return {
        key: row.key,
        sym: row.sym,
        logo: LOGOS[row.sym.toLowerCase()]!,
        venueLogo: venue.logo,
        venueName: venue.name,
        lev: format(mine ? row.yourSize / row.yourMargin : row.lev, 1).replace(/\.0$/, "") + "x",
        side: row.dir > 0 ? "Long" : "Short",
        sideCls: row.dir > 0 ? "long" : "short",
        pnl: (pnl < 0 ? "-$" : "+$") + format(Math.abs(pnl)),
        pnlCls: direction(pnl),
        roe: (pnl >= 0 ? "▲ " : "▼ ") + format(Math.abs((pnl / margin) * 100)) + "%",
        details: () => set({ cpPD: { lid: leader.id, kind: mine ? "mine" : "lead", k: row.key } }),
      };
    };
    const ownPositions = calc.rows
      .filter((row) => row.yourMargin > 0)
      .map((row) => card(row, true));
    const pdState = state.cpPD?.lid === leader.id ? state.cpPD : null,
      pdRow = pdState ? calc.rows.find((row) => row.key === pdState.k) : null;
    const positionDetail = pdRow
      ? (() => {
          const mine = pdState.kind === "mine" && pdRow.yourMargin > 0,
            pnl = mine ? pdRow.yourPnl : pdRow.leaderPnl,
            margin = mine ? pdRow.yourMargin : pdRow.leaderMargin;
          const venue = VENUES.find((item) => item.id === pdRow.venue)!;
          const rows: CopyMetric[] = [
            {
              label: mine ? "Your Size (USD)" : "Leader Size (USD)",
              value: format(mine ? pdRow.yourSize : pdRow.leaderSize),
            },
            { label: "Margin (USDC)", value: format(margin) },
            { label: "Entry (USD)", value: format(pdRow.entry) },
            { label: "Mark (USD)", value: format(pdRow.mark) },
            { label: "Scale (x)", value: format(pdRow.yourSize / pdRow.leaderSize, 3) },
            { label: "Copy Status", value: pdRow.status },
            { label: "Opened", value: agoLabel(pdRow.openedAt, now) },
          ];
          return {
            title: pdRow.sym + "-PERP",
            logo: LOGOS[pdRow.sym.toLowerCase()]!,
            venueLogo: venue.logo,
            venue: venue.name,
            side: pdRow.dir > 0 ? "Long" : "Short",
            sideCls: pdRow.dir > 0 ? "long" : "short",
            lev: card(pdRow, mine).lev,
            heroLabel: mine ? "Your PnL" : "Leader PnL",
            pnl: signed(pnl),
            pnlCls: direction(pnl),
            roe: signed((pnl / margin) * 100) + "% on margin",
            rows,
            close: () => set({ cpPD: null }),
            goMarket: () => {
              set({ cpPD: null, cpSheet: null });
              goTrade(pdRow.sym);
            },
            actionLabel: mine ? "Close Position" : followed ? "Edit Copy" : "Copy " + leader.id,
            danger: mine,
            action: () => {
              if (mine) {
                set({
                  cpClosed: {
                    ...state.cpClosed,
                    [leader.id]: { ...state.cpClosed?.[leader.id], [pdRow.key]: true },
                  },
                  cpPD: null,
                });
                toast("Closed your " + pdRow.sym + "-PERP copy");
              } else set({ cpPD: null, cpSheet: leader.id });
            },
          };
        })()
      : null;
    const errors: Record<"alloc" | "mult" | "lev" | "dd", string> = {
      alloc: !(number(formSettings.alloc, NaN) >= 10)
        ? "Enter at least 10"
        : number(formSettings.alloc) > max
          ? "Above your available balance of " + format(max)
          : "",
      mult:
        formSettings.mode === "mult" &&
        !(number(formSettings.mult) > 0 && number(formSettings.mult) <= 100)
          ? "Enter a value from 0.01 to 100"
          : "",
      lev: !(number(formSettings.lev) >= 1 && number(formSettings.lev) <= 50)
        ? "Enter a value from 1 to 50"
        : "",
      dd: !(number(formSettings.dd) >= 1 && number(formSettings.dd) <= 90)
        ? "Enter a value from 1 to 90"
        : "",
    };
    return {
      id: leader.id,
      tag: leader.tag,
      avatar: leaderAvatar(leader.id),
      bio: leader.bio,
      tags: [
        leader.tag,
        leader.venues.map((id) => VENUES.find((venue) => venue.id === id)!.name).join(", "),
        leader.share ? "Profit share 10%" : "No profit share",
        format(leader.copiers, 0) + " copiers",
        leader.age + " days on OpenFutures",
      ],
      venues: leader.venues.map((id) => VENUES.find((venue) => venue.id === id)!),
      followed,
      watchOn: watching[leader.id] !== undefined,
      toggleWatch: toggleWatch(leader.id),
      back: () => set({ cpOpen: null, cpPD: null, cpSheet: null }),
      openSettings: () => set({ cpSheet: leader.id }),
      equity: format(calc.equity),
      return: signed(stats.ret) + "%",
      returnCls: direction(stats.ret),
      range: String(range),
      ranges: ranges("cpR", String(range)),
      chart: chartModel(
        "leader:" + leader.id,
        values,
        today - range,
        chartPercent ? "Return (%)" : "PnL (USDC)",
      ),
      valueModes: ["value", "percent"].map((value) => ({
        label: value === "value" ? "Value" : "%",
        on: (state.cpValue || "percent") === value,
        pick: () => set({ cpValue: value, cpHov: null }),
      })),
      view: state.cpMV === "cal" ? "cal" : "perf",
      views: [
        ["perf", "Performance"],
        ["cal", "Calendar"],
      ].map(([key, label]) => ({
        label: label!,
        on: (state.cpMV || "perf") === key,
        pick: () => set({ cpMV: key, cpHov: null, cpCD: null }),
      })),
      segment: state.cpMS || "pos",
      segments: [
        ["pos", "Positions"],
        ["stats", "Stats"],
        ["about", "About"],
      ].map(([key, label]) => ({
        label: label!,
        on: (state.cpMS || "pos") === key,
        pick: () => set({ cpMS: key, cpTip: null }),
      })),
      calendar: {
        title: monthTitle,
        days,
        prevDisabled: monthStart - DAY < (today - COPY_DAYS + 1) * DAY,
        nextDisabled: monthOffset >= 0,
        prev: () => set({ cpMonth: monthOffset - 1, cpCD: null }),
        next: () => set({ cpMonth: Math.min(0, monthOffset + 1), cpCD: null }),
        selectedLabel: chosenDay
          ? monthNames[new Date(monthStart).getUTCMonth()]!.slice(0, 3) + " " + chosenDay.day
          : "Monthly PnL (USDC)",
        value: chosenDay ? chosenDay.pnl : signed(monthPnl),
        cls: direction(chosenDay ? number(chosenDay.pnl.replaceAll(",", "")) : monthPnl),
        trades: chosenDay ? chosenDay.trades : monthTrades,
      },
      statsLists,
      statsTitles: ["Last 30 days", monthTitle],
      positions: calc.rows.map((row) => card(row, false)),
      positionDetail,
      mine: performance
        ? {
            pnl: signed(performance.pnl),
            cls: direction(performance.pnl),
            alloc: format(performance.alloc, 0),
            status: stopped ? "Stopped" : paused ? "Paused" : "Active",
            count: ownPositions.length + " of " + calc.rows.length + " mirrored",
            openPnl: signed(calc.openPnl),
            openCls: direction(calc.openPnl),
            positions: ownPositions,
            empty: stopped
              ? "Copying stopped, so nothing is mirrored."
              : paused
                ? "Copying is paused, so nothing is mirrored."
                : "Nothing mirrored right now.",
          }
        : null,
      tip: {
        on: (tips[leader.id] || 0) > 0,
        label:
          "Tip " +
          leader.id +
          ((tips[leader.id] || 0) > 0 ? ", you have tipped " + tips[leader.id] + " USDC" : ""),
        open: state.cpTip === leader.id,
        toggle: () => set({ cpTip: state.cpTip === leader.id ? null : leader.id }),
        close: () => set({ cpTip: null }),
        options: [5, 10, 25].map((amount) => ({
          label: String(amount),
          pick: () => {
            set({ cpTips: { ...tips, [leader.id]: (tips[leader.id] || 0) + amount }, cpTip: null });
            toast("Tipped " + amount + " USDC to " + leader.id);
          },
        })),
      },
      form: {
        open: state.cpSheet === leader.id,
        close: () => set({ cpSheet: null }),
        title: (followed ? "Edit copy of " : "Copy ") + leader.id,
        settings: formSettings,
        errors,
        disabled: Object.values(errors).some(Boolean),
        onField: (key: "alloc" | "mult" | "lev" | "dd") => (event: ChangeEvent<HTMLInputElement>) =>
          edit(leader.id, { [key]: event.target.value.replace(/[^0-9.]/g, "") }),
        sizing: [
          ["prop", "Proportional"],
          ["mult", "Multiplier"],
        ].map(([value, label]) => ({
          label: label!,
          on: formSettings.mode === value,
          pick: () => edit(leader.id, { mode: value as "prop" | "mult" }),
        })),
        openPositions: [
          [false, "New Only"],
          [true, "Include Open"],
        ].map(([value, label]) => ({
          label: String(label),
          on: formSettings.open === value,
          pick: () => edit(leader.id, { open: value as boolean }),
        })),
        percentages: [25, 50, 75, 100].map((value) => ({
          label: value === 100 ? "Max" : value + "%",
          pick: () => edit(leader.id, { alloc: String(Math.floor(max * value) / 100) }),
        })),
        rows: [
          { label: "Scale (x)", value: format(calc.ratio, 3) },
          { label: "Margin in Use (USDC)", value: format(calc.margin) },
          { label: "Positions Mirrored", value: calc.count + " of " + calc.rows.length },
          { label: "Available (USDC)", value: format(available) },
          { label: "Profit Share (%)", value: leader.share ? "10" : "0" },
        ],
        save: () => {
          if (Object.values(errors).some(Boolean)) return;
          const newWatch = { ...watching };
          delete newWatch[leader.id];
          const newDraft = { ...draft };
          delete newDraft[leader.id];
          set({
            cpFollow: {
              ...follow,
              [leader.id]: {
                ...cleanSettings,
                since: settings?.since || now,
                base: settings?.base || 0,
                paused: false,
                pausedAt: undefined,
              },
            },
            cpWatch: newWatch,
            cpDraft: newDraft,
            cpTab: "following",
            cpOpen: leader.id,
            cpQ: "",
            cpSheet: null,
          });
          toast((followed ? "Updated copy of " : "Now copying ") + leader.id);
        },
        pause: pauseCopy(leader.id),
        pauseLabel: paused ? "Resume Copying" : "Pause Copying",
        pauseDisabled: stopped,
        stop: () => {
          const next = { ...follow };
          delete next[leader.id];
          set({
            cpFollow: next,
            cpWatch: { ...watching, [leader.id]: now },
            cpTab: "watching",
            cpOpen: leader.id,
            cpSheet: null,
          });
          toast("Stopped copying " + leader.id + ". Moved to Watching");
        },
      },
    };
  }

  const base = tab === "following" ? followed : tab === "watching" ? watched : discover,
    query = (state.cpQ || "").trim().toLowerCase(),
    category = state.cpCat || "all";
  const categoryFor = (leader: CopyLeader) => {
    const counts: Record<string, number> = {};
    leader.mk.forEach((symbol) => {
      const cat = marketFor(symbol)?.cat;
      const key = cat === "Crypto" || !cat ? "Crypto" : cat === "Stocks" ? "Stocks" : "Macro";
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.keys(counts).sort((a, b) => counts[b]! - counts[a]!)[0];
  };
  const rows = base
    .filter(
      (entry) =>
        (!query || (entry.leader.id + " " + entry.leader.tag).toLowerCase().includes(query)) &&
        (category === "all" || categoryFor(entry.leader) === category),
    )
    .map((entry) => {
      const { leader, series, performance, calc, stats } = entry;
      const sinceDays = clamp(
          Math.floor((now - (watching[leader.id] || now)) / DAY),
          1,
          COPY_DAYS - 1,
        ),
        sinceReturn = (series.eq[COPY_DAYS]! / series.eq[COPY_DAYS - sinceDays]! - 1) * 100;
      const nums =
        tab === "following"
          ? [
              performance!.alloc,
              performance!.pnl,
              performance!.alloc ? (performance!.pnl / performance!.alloc) * 100 : 0,
              calc.count,
            ]
          : tab === "watching"
            ? [sinceReturn, stats.ret, stats.pnl, stats.drawdown]
            : [stats.ret, stats.winRate, stats.drawdown, leader.copiers];
      const values = nums.map((value, index) => ({
        value:
          tab === "following" && index === 3
            ? calc.count + " of " + calc.rows.length
            : (tab === "following" && (index === 1 || index === 2)) ||
                (tab === "watching" && index < 3) ||
                (tab === "discover" && index === 0)
              ? signed(value)
              : format(value, tab === "discover" && index === 3 ? 0 : 2),
        cls:
          (tab === "following" && (index === 1 || index === 2)) ||
          (tab === "watching" && index < 3) ||
          (tab === "discover" && index === 0)
            ? direction(value)
            : "",
      }));
      const ret = tab === "following" ? nums[2]! : tab === "watching" ? sinceReturn : stats.ret;
      return {
        id: leader.id,
        tag: leader.tag,
        avatar: leaderAvatar(leader.id),
        nums,
        values,
        equity: format(tab === "following" ? performance!.alloc + performance!.pnl : calc.equity),
        ret: signed(ret) + "%",
        retCls: direction(ret),
        status: entry.settings
          ? performance!.stopped
            ? "Auto-stopped"
            : entry.settings.paused
              ? "Paused"
              : "Active"
          : watching[leader.id] !== undefined
            ? "Watching"
            : "",
        venues: leader.venues.map((id) => VENUES.find((venue) => venue.id === id)!),
        toggle: toggleTrader(leader.id),
        watchOn: watching[leader.id] !== undefined,
        toggleWatch: toggleWatch(leader.id),
        canWatch: !entry.settings,
        mainLabel: entry.settings ? (entry.settings.paused ? "Resume" : "Pause") : "Copy",
        mainAction: entry.settings
          ? pauseCopy(leader.id)
          : () => set({ cpOpen: leader.id, cpSheet: leader.id }),
      };
    })
    .sort((a, b) => (a.nums[sort.k]! - b.nums[sort.k]!) * sort.d);
  const selected = data.find((entry) => entry.leader.id === selectedId);
  const heroRange = clamp(parseInt(state.cpHR || "30", 10), 7, 90),
    heroValues = Array.from({ length: heroRange + 1 }, (_, index) =>
      followed.reduce((sum, entry) => {
        const i = COPY_DAYS - heroRange + index - 1 - entry.performance!.start;
        return sum + (i >= 0 ? entry.performance!.net[i] || 0 : 0);
      }, 0),
    );
  return {
    isMobile,
    eyeIcon,
    tab,
    query: state.cpQ || "",
    onQuery: (event: ChangeEvent<HTMLInputElement>) => set({ cpQ: event.target.value }),
    rows,
    detail: selected ? detailFor(selected) : null,
    tabs: [
      ["following", "Following", followed.length],
      ["watching", "Watching", watched.length],
      ["discover", "Discover", discover.length],
    ].map(([key, label, count]) => ({
      key: String(key),
      label: String(label),
      count: String(count),
      on: tab === key,
      pick: () => set({ cpTab: key, cpOpen: null, cpTip: null, cpCat: "all" }),
    })),
    categories: ["all", "Crypto", "Stocks", "Macro"].map((key) => ({
      label: key === "all" ? "All" : key,
      on: category === key,
      pick: () => set({ cpCat: key }),
    })),
    heads: headers[tab].map((label, index) => ({
      label,
      on: sort.k === index,
      arrow: sort.k === index ? (sort.d < 0 ? "↓" : "↑") : "",
      pick: () => set({ cpSort: { tab, k: index, d: sort.k === index ? -sort.d : -1 } }),
    })),
    hero: {
      equity: format(total.equity),
      pnl: signed(total.pnl),
      cls: direction(total.pnl),
      sub: "Total PnL across " + followed.length + (followed.length === 1 ? " trader" : " traders"),
      chart: chartModel("copy-total", heroValues, today - heroRange, "PnL (USDC)"),
      ranges: ranges("cpHR", String(heroRange)),
      metrics: [
        { label: "Total PnL (USDC)", value: signed(total.pnl), cls: direction(total.pnl) },
        { label: "Allocated (USDC)", value: format(total.alloc) },
        { label: "Available (USDC)", value: format(available) },
        { label: "Open PnL (USDC)", value: signed(total.open), cls: direction(total.open) },
        {
          label: "Realized PnL (USDC)",
          value: signed(total.pnl - total.open),
          cls: direction(total.pnl - total.open),
        },
        { label: "Profit Share and Tips Paid (USDC)", value: format(total.paid) },
      ],
    },
    emptyText: query
      ? "No traders found"
      : tab === "following"
        ? "You are not copying anyone yet"
        : tab === "watching"
          ? "Your watchlist is empty"
          : "No more traders to show",
    discover: () => set({ cpTab: "discover", cpQ: "" }),
  };
}
export type CopyViewModel = ReturnType<typeof buildCopyViewModel>;
export type CopyDetailModel = NonNullable<CopyViewModel["detail"]>;
