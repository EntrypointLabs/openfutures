import { formatCompact, hashString, seededRandom, parseCompact } from "@openfutures/core";
import { MARKETS } from "@/data/markets";
import { VENUES, VENUE_COLORS } from "@/data/venues";
import type { Terminal } from "@/terminal/Terminal";
import {
  buildAnalyticsCard,
  buildAnalyticsDropdown,
  buildAnalyticsSegment,
  CALENDAR_ICON,
  FILTER_ICON,
  type AnalyticsCardOptions,
  type AnalyticsSeries,
} from "@/terminal/analytics";

const CLASSES = [
  ["Crypto", "#3b6ff6"],
  ["Stocks", "#e5b75a"],
  ["Indices", "#4fd1b8"],
  ["Commodities", "#f0a35a"],
  ["Forex", "#b49cff"],
];
const RATE_MODES = [
  { v: "apr", txt: "APR", aria: "Annualized" },
  { v: "8h", txt: "8h", aria: "Per 8 hours" },
  { v: "1h", txt: "1h", aria: "Per hour" },
];
const bare = (value: string) => String(value).replace(/\$/g, "").replace(/%/g, "");

function history(
  seed: string,
  current: number,
  growth: number,
  volatility: number,
  spikes = false,
) {
  const random = seededRandom(hashString(seed)),
    levels: number[] = [];
  let level = 0;
  for (let index = 0; index < 365; index++) {
    level += (random() - 0.5) * volatility;
    levels.push(level);
  }
  return levels.map((value, index) => {
    let multiplier = Math.exp(-(364 - index) * growth + value - levels[364]);
    if (spikes && random() < 0.05) multiplier *= 1.6 + random() * 1.8;
    return index === 364 ? current : current * multiplier;
  });
}

interface WatchContext {
  terminal: Terminal;
  state: Record<string, any>;
  marketWatch: any;
  getMarketStats: (market: any) => any;
  venueMeta: Record<string, any>;
  watchRows: any[];
  exchangeRows: any[];
  fundingRows: any[];
}

/** Confirmed Watch changes are derived beside the existing terminal model. */
export function enhanceWatchViewModel({
  terminal,
  state,
  marketWatch,
  getMarketStats,
  venueMeta,
  watchRows,
  exchangeRows,
  fundingRows,
}: WatchContext) {
  if (state.screen !== "watch") return;
  const setState = (patch: Record<string, any>) => terminal.setState(patch);
  const totals: Record<string, { oi: number; vol: number; funding: number; weight: number }> = {};
  const classes: Record<string, { oi: number; vol: number }> = {};
  VENUES.forEach((venue) => {
    totals[venue.id] = { oi: 0, vol: 0, funding: 0, weight: 0 };
  });
  MARKETS.forEach((market) => {
    const stats = getMarketStats(market),
      group = classes[market.cat] || (classes[market.cat] = { oi: 0, vol: 0 });
    group.oi += stats.w0.oi;
    group.vol += stats.w0.vol;
    stats.vm.forEach((quote: any) => {
      const value = totals[quote.v.id],
        oi = stats.w0.oi * quote.sh;
      value.oi += oi;
      value.vol += stats.w0.vol * quote.sh;
      value.funding += quote.fh * oi;
      value.weight += oi;
    });
  });
  const end = Math.floor(state.now / 86400000) * 86400000;
  const dates = Array.from({ length: 365 }, (_, index) => end - (364 - index) * 86400000);
  const classSeries = (metric: "oi" | "vol" | "liq"): AnalyticsSeries[] =>
    CLASSES.map(([name, color]) => {
      const value = classes[name] || { oi: 0, vol: 0 };
      return {
        name,
        color,
        data: history(
          `mc${name}${metric}`,
          metric === "oi" ? value.oi : metric === "vol" ? value.vol : value.vol * 0.012,
          name === "Crypto" ? 0.003 : 0.0068,
          metric === "oi" ? 0.03 : 0.09,
          metric === "liq",
        ),
      };
    });
  const venueSeries = (metric: "oi" | "vol" | "liq"): AnalyticsSeries[] =>
    VENUES.map((venue) => {
      const value = totals[venue.id];
      return {
        name: venue.name,
        color: VENUE_COLORS[venue.id],
        logo: venue.logo,
        data: history(
          `mv${venue.id}${metric}`,
          metric === "oi" ? value.oi : metric === "vol" ? value.vol : value.vol * 0.012,
          venueMeta[venue.id].type === "DEX" ? 0.0062 : 0.0031,
          metric === "oi" ? 0.035 : 0.09,
          metric === "liq",
        ),
      };
    });
  const usd = (value: number) => `$${formatCompact(value)}`;
  let cards: AnalyticsCardOptions[];
  const view = state.wview || "markets";
  if (view === "markets") {
    const oi = classSeries("oi"),
      vol = classSeries("vol");
    cards = [
      {
        id: "mk-oi",
        title: "Open Interest by Asset Class",
        sub: "Value of open perpetual positions over time, by asset class.",
        series: oi,
        dates,
        agg: "last",
        fmt: usd,
      },
      {
        id: "mk-vol",
        title: "Volume by Asset Class",
        sub: "Perpetual trading volume over time, by asset class.",
        series: vol,
        dates,
        agg: "sum",
        defGran: "w",
        fmt: usd,
      },
      {
        id: "mk-liq",
        title: "Liquidations by Asset Class",
        sub: "Positions closed by force over time, by asset class.",
        series: classSeries("liq"),
        dates,
        agg: "sum",
        defGran: "w",
        fmt: usd,
      },
      {
        id: "mk-turn",
        title: "Turnover by Asset Class (x)",
        sub: "Daily volume divided by open interest, by asset class.",
        kind: "lines",
        series: oi.map((series, index) => ({
          name: series.name,
          color: series.color,
          data: series.data.map((value, day) => (value ? vol[index].data[day] / value : 0)),
        })),
        dates,
        agg: "avg",
        zeroBase: false,
        fmt: (value) => `${value.toFixed(2)}x`,
        fmtAxis: (value) => `${value.toFixed(1)}x`,
      },
    ];
  } else if (view === "exchanges") {
    cards = [
      {
        id: "ex-oi",
        title: "Open Interest by Venue",
        sub: "Value of open perpetual positions over time, by venue.",
        series: venueSeries("oi"),
        dates,
        agg: "last",
        fmt: usd,
      },
      {
        id: "ex-vol",
        title: "Volume by Venue",
        sub: "Perpetual trading volume over time, by venue.",
        series: venueSeries("vol"),
        dates,
        agg: "sum",
        defGran: "w",
        fmt: usd,
      },
      {
        id: "ex-liq",
        title: "Liquidations by Venue",
        sub: "Positions closed by force over time, by venue.",
        series: venueSeries("liq"),
        dates,
        agg: "sum",
        defGran: "w",
        fmt: usd,
      },
      {
        id: "ex-lat",
        title: "Feed Latency by Venue (ms)",
        sub: "Median time for a price update to reach OpenFutures, by venue.",
        kind: "lines",
        series: VENUES.map((venue) => ({
          name: venue.name,
          color: VENUE_COLORS[venue.id],
          logo: venue.logo,
          data: history(`lat${venue.id}`, venueMeta[venue.id].lat, 0, 0.05),
        })),
        dates,
        agg: "avg",
        zeroBase: false,
        fmt: (value) => `${Math.round(value)} ms`,
        fmtAxis: (value) => String(Math.round(value)),
      },
    ];
  } else {
    const fundingHistory = (
      seed: string,
      apr: number,
      phase: number,
      cycle: number,
      amplitude: number,
      volatility: number,
    ) =>
      history(seed, 1, 0, volatility).map(
        (value, index) =>
          apr *
          (1 +
            amplitude * Math.sin((364 - index) / cycle + phase) * Math.min(1, (364 - index) / 20)) *
          value,
      );
    const venues = VENUES.map((venue) => {
      const value = totals[venue.id];
      return {
        name: venue.name,
        color: VENUE_COLORS[venue.id],
        logo: venue.logo,
        data: fundingHistory(
          `fv${venue.id}`,
          value.weight ? (value.funding / value.weight) * 8760 : 0,
          venue.name.length,
          14,
          0.18,
          0.035,
        ),
      };
    });
    const categories = CLASSES.map(([name, color]) => {
      const markets = MARKETS.filter((market) => market.cat === name),
        apr =
          (markets.reduce((sum, market) => {
            const stats = getMarketStats(market);
            return (
              sum +
              stats.vm.reduce((subtotal: number, quote: any) => subtotal + quote.fh, 0) /
                stats.vm.length
            );
          }, 0) /
            (markets.length || 1)) *
          8760;
      return { name, color, data: fundingHistory(`fc${name}`, apr, name.length, 16, 0.2, 0.03) };
    });
    const rateOptions = {
      dates,
      kind: "lines" as const,
      agg: "avg" as const,
      modes: RATE_MODES,
      mapMode: (value: number, mode: string) =>
        mode === "8h" ? (value / 8760) * 8 : mode === "1h" ? value / 8760 : value,
      fmtFor: (mode: string) => (value: number) =>
        `${value >= 0 ? "+" : ""}${value.toFixed(mode === "apr" ? 1 : 4)}%`,
    };
    cards = [
      {
        ...rateOptions,
        id: "fu-ven",
        title: "Funding Rate by Venue (%)",
        sub: "Open-interest-weighted funding rate over time, by venue.",
        series: venues,
      },
      {
        ...rateOptions,
        id: "fu-cat",
        title: "Funding Rate by Asset Class (%)",
        sub: "Average funding rate over time, by asset class.",
        series: categories,
      },
    ];
  }
  marketWatch.cards = cards.map((options) => buildAnalyticsCard(options, state, setState));
  marketWatch.kpis = marketWatch.kpis.slice(0, 4);
  const classOptions = [
    { v: "all", label: "All asset classes" },
    ...CLASSES.map(([name]) => ({ v: name, label: name })),
  ];
  marketWatch.tdd = {
    mcat: buildAnalyticsDropdown(
      "t-mcat",
      "Asset class",
      FILTER_ICON,
      classOptions,
      state.wcat || "all",
      state,
      setState,
      (value) => ({ wcat: value, tpg: { ...state.tpg, markets: 0 } }),
    ),
    fcat: buildAnalyticsDropdown(
      "t-fcat",
      "Asset class",
      FILTER_ICON,
      classOptions,
      state.fcat || "all",
      state,
      setState,
      (value) => ({ fcat: value, tpg: { ...state.tpg, funding: 0 } }),
    ),
    vtype: buildAnalyticsDropdown(
      "t-vtype",
      "Venue type",
      FILTER_ICON,
      [
        { v: "all", label: "All venues" },
        { v: "DEX", label: "DEX venues" },
        { v: "CEX", label: "CEX venues" },
      ],
      state.xcat || "all",
      state,
      setState,
      (value) => ({ xcat: value, vxOpen: null, tpg: { ...state.tpg, venues: 0 } }),
    ),
    rate: buildAnalyticsSegment("Rate", RATE_MODES, state.funit || "apr", setState, (value) => ({
      funit: value,
    })),
  };
  marketWatch.perf.per = buildAnalyticsDropdown(
    "pf-per",
    "Period",
    CALENDAR_ICON,
    [
      { v: "1M", label: "Last 30 days" },
      { v: "3M", label: "Last 3 months" },
      { v: "YTD", label: "Year to date" },
      { v: "1Y", label: "Last year" },
    ],
    state.pfRange || "3M",
    state,
    setState,
    (value) => ({ pfRange: value, pfSort: { col: value, dir: -1 }, pfHov: null }),
  );
  marketWatch.perf.rows.forEach((row: any) =>
    row.cells.forEach((cell: any) => {
      cell.v = bare(cell.v);
    }),
  );
  marketWatch.perf.heads.forEach((head: any) => {
    head.label += " (%)";
  });
  watchRows.forEach((row) => {
    row.volN = bare(row.vol);
    row.oiN = bare(row.oi);
    row.chgN = bare(row.chgText);
    row.fundN = bare(row.fund);
    row.topTextN = bare(row.topText);
  });
  const totalOi = Object.values(totals).reduce((sum, value) => sum + value.oi, 0);
  exchangeRows.sort((a, b) => parseCompact(b.oiN) - parseCompact(a.oiN));
  exchangeRows.forEach((row) => {
    const venue = VENUES.find((candidate) => candidate.name === row.name)!;
    const insight = marketWatch.exCards.find((card: any) => card.name === row.name);
    const open = state.vxOpen === venue.id;
    Object.assign(row, insight, {
      oiN: bare(row.oi),
      volN: bare(row.vol),
      d30: bare(insight.chg),
      d30Cls: insight.chgCls,
      shareN: ((totals[venue.id].oi / totalOi) * 100).toFixed(1),
      turnN: insight.turn.replace(/x$/, ""),
      liqN: bare(insight.liq),
      host: row.url.replace(/^https?:\/\//, "").replace(/\/$/, ""),
      isOpen: open,
      groupCls: open ? "is-open" : "",
      toggle: () => setState({ vxOpen: open ? null : venue.id }),
    });
  });
  fundingRows.sort((a, b) => {
    const ma = MARKETS.find((market) => market.sym === a.sym)!,
      mb = MARKETS.find((market) => market.sym === b.sym)!;
    return getMarketStats(mb).fSpread - getMarketStats(ma).fSpread;
  });
  fundingRows.forEach((row) => {
    const stats = getMarketStats(MARKETS.find((market) => market.sym === row.sym)),
      open = state.fmOpen === row.sym;
    row.spread = bare(row.spread);
    row.carry = Math.round(stats.fSpread * 8760 * 100).toLocaleString("en-US");
    row.isOpen = open;
    row.openCls = open ? "is-open" : "";
    row.toggle = () => setState({ fmOpen: open ? null : row.sym });
    row.cells.forEach((cell: any) => {
      cell.v = bare(cell.v);
    });
  });
}
