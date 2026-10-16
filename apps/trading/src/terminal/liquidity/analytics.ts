import { DAY_MS, VAULT_TERMS, formatCompact } from "@openfutures/core";
import {
  FUNDED_ACCOUNT_SIZES,
  FUNDED_POPULATION,
  PAID_TO_LPS_30D,
  VAULT_COLORS,
  VAULT_HISTORY_DAYS,
} from "@/data/liquidity";
import {
  BASELINE,
  HIDDEN_TIP,
  PLOT_W,
  USABLE_H,
  linePath,
  pointX,
  stackedAreas,
  tooltipAt,
  valueTicks,
  valueY,
  yPercent,
  type ChartTooltip,
  type Tick,
} from "@/terminal/liquidity/charts";
import {
  formatDate,
  formatDay,
  formatMonth,
  formatShort,
  monthTick,
  signed,
} from "@/terminal/liquidity/format";
import { fundedByMonth, fundedPopulation } from "@/terminal/liquidity/traders";
import type { VaultSnapshot } from "@/terminal/liquidity/vaults";

/** Which chart is hovered and at which point index. Kept in terminal state as `lqHov`. */
export interface ChartHover {
  chart: "unlocks" | "deposits" | "apr" | "returns" | "funded";
  index: number;
}

/** Pointer handlers for a chart's hit area; `indexAt` maps 0..1 across the plot to a point. */
export interface HoverHandlers {
  move: (event: React.PointerEvent<HTMLElement>) => void;
  leave: (event?: React.PointerEvent<HTMLElement>) => void;
}
export type HoverFactory = (
  chart: ChartHover["chart"],
  indexAt: (fraction: number) => number,
) => HoverHandlers;

const DAYS = VAULT_HISTORY_DAYS;
const usd = (value: number) => "$" + formatShort(value);

/** Legend shared by the vault charts. */
export function vaultLegend() {
  return VAULT_TERMS.map((term) => ({ name: term + "-Day", color: VAULT_COLORS[term] }));
}

/** Daily x ticks across the 90-day vault history. */
function dayTicks(today: number): Tick[] {
  return [0, 30, 60, DAYS - 1].map((index) => ({
    x: (pointX(index, DAYS) / 10).toFixed(2),
    label: formatDay(today - (DAYS - 1 - index) * DAY_MS),
    cls: index === 0 ? "first" : index === DAYS - 1 ? "last" : "",
  }));
}

function dateOfIndex(today: number, index: number): string {
  return formatDate(today - (DAYS - 1 - index) * DAY_MS);
}

function hoverIndex(hover: ChartHover | null, chart: ChartHover["chart"]): number | null {
  return hover && hover.chart === chart ? hover.index : null;
}

/** Headline tiles above the charts. */
export function liquidityKpis(vaults: VaultSnapshot[]) {
  const deposits = vaults.reduce((sum, v) => sum + v.deposits, 0);
  const allocated = vaults.reduce((sum, v) => sum + v.allocated, 0);
  const weightedApr = vaults.reduce((sum, v) => sum + v.apr * v.deposits, 0) / (deposits || 1);
  // Deposits unlock evenly over each term, so a 30-day window frees 30/term of each vault.
  const unlocking30d = vaults.reduce(
    (sum, v) => sum + (v.deposits * Math.min(30, v.term)) / v.term,
    0,
  );
  const totals: number[] = [];
  for (let day = 0; day < DAYS; day++) {
    totals.push(vaults.reduce((sum, v) => sum + v.depositHistory[day], 0));
  }
  const change30d = (totals[DAYS - 1] / totals[DAYS - 31] - 1) * 100;
  const recent = totals.slice(-60);
  const low = Math.min(...recent);
  const high = Math.max(...recent);
  let spark = "";
  recent.forEach((value, index) => {
    spark +=
      (index ? "L" : "M") +
      ((index / 59) * 100).toFixed(1) +
      " " +
      (22 - ((value - low) / (high - low || 1)) * 18).toFixed(1);
  });
  const pct = (part: number) => ((part / deposits) * 100).toFixed(1) + "%";
  return [
    {
      info: "All USDC deposited across the five vaults",
      k: "Total Deposits",
      v: usd(deposits),
      sub: (change30d >= 0 ? "▲ " : "▼ ") + Math.abs(change30d).toFixed(2) + "% from 30d ago",
      subCls: change30d >= 0 ? "up" : "down",
      spark,
    },
    {
      info: "Deposits not yet allocated to funded traders",
      k: "Available Liquidity",
      v: usd(deposits - allocated),
      sub: usd(allocated) + " funding traders, " + pct(allocated) + " utilization",
    },
    {
      info: "Capital currently allocated to funded accounts",
      k: "Funding Traders",
      v: usd(allocated),
      sub: pct(allocated) + " utilization",
    },
    {
      info: "APR across all vaults, weighted by deposits",
      k: "Average APR",
      v: weightedApr.toFixed(2) + "%",
      sub: "Weighted by deposits",
    },
    {
      info: "Deposits that reach their unlock date in the next 30 days",
      k: "Unlocking in 30 Days",
      v: usd(unlocking30d),
      sub: pct(unlocking30d) + " of deposits",
    },
    {
      info: "Evaluation fees and profit share paid to vault depositors in the last 30 days",
      k: "Paid to LPs, 30d",
      v: usd(PAID_TO_LPS_30D),
      sub: "Fees and profit share",
    },
  ].map((tile) => ({ subCls: "", spark: "", ...tile, hasSpark: !!tile.spark }));
}

/** Monthly stacked bars of deposits reaching their unlock date over the next 24 months. */
export function unlockSchedule(
  vaults: VaultSnapshot[],
  today: number,
  hover: ChartHover | null,
  handlers: HoverFactory,
) {
  const MONTHS_AHEAD = 24;
  const months = [];
  for (let m = 0; m < MONTHS_AHEAD; m++) {
    const start = new Date(today);
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() + m);
    const end = new Date(start.getTime());
    end.setUTCMonth(end.getUTCMonth() + 1);
    const stack: Partial<Record<number, number>> = {};
    vaults.forEach((vault) => {
      // A vault's deposits unlock evenly between today and today + term.
      const from = Math.max(today, start.getTime());
      const to = Math.min(today + vault.term * DAY_MS, end.getTime());
      if (to > from) {
        stack[vault.term] = (vault.deposits * ((to - from) / DAY_MS)) / vault.term;
      }
    });
    months.push({ start: start.getTime(), label: monthTick(start.getTime(), m === 0), stack });
  }
  const totalOf = (stack: Partial<Record<number, number>>) =>
    VAULT_TERMS.reduce((sum, term) => sum + (stack[term] || 0), 0);
  const max = Math.max(...months.map((month) => totalOf(month.stack))) * 1.1;
  const slot = PLOT_W / MONTHS_AHEAD;
  const active = hoverIndex(hover, "unlocks");
  const bars: { x: string; y: string; w: string; h: string; color: string; op: string }[] = [];
  months.forEach((month, index) => {
    let top = BASELINE;
    VAULT_TERMS.forEach((term) => {
      const value = month.stack[term] || 0;
      if (!value) {
        return;
      }
      const height = (value / max) * USABLE_H;
      bars.push({
        x: (index * slot + slot * 0.16).toFixed(1),
        y: (top - height).toFixed(1),
        w: (slot * 0.68).toFixed(1),
        h: height.toFixed(1),
        color: VAULT_COLORS[term],
        op: active == null || active === index ? "1" : "0.3",
      });
      top -= height;
    });
  });
  let tip: ChartTooltip = HIDDEN_TIP;
  if (active != null) {
    const month = months[active];
    const total = totalOf(month.stack);
    tip = tooltipAt(
      ((active + 0.5) * slot) / 10,
      40,
      formatMonth(month.start),
      total ? usd(total) : "Nothing unlocks",
      VAULT_TERMS.filter((term) => month.stack[term]).map((term) => ({
        name: term + "-Day Vault",
        color: VAULT_COLORS[term],
        val: usd(month.stack[term]!),
      })),
    );
  }
  return {
    bars,
    xTicks: months
      .map((month, index) => ({
        x: ((index * slot + slot / 2) / 10).toFixed(2),
        label: month.label,
      }))
      .filter((_, index) => index % 4 === 0),
    tip,
    hasBand: active != null,
    bandX: active == null ? "0" : (active * slot).toFixed(1),
    bandW: slot.toFixed(1),
    ...handlers("unlocks", (fraction) => Math.floor(fraction * MONTHS_AHEAD)),
  };
}

/** Stacked areas of total deposits per vault over the last 90 days. */
export function depositsByVault(
  vaults: VaultSnapshot[],
  today: number,
  hover: ChartHover | null,
  handlers: HoverFactory,
) {
  const totals: number[] = [];
  for (let day = 0; day < DAYS; day++) {
    totals.push(vaults.reduce((sum, v) => sum + v.depositHistory[day], 0));
  }
  const max = Math.max(...totals) * 1.08;
  const active = hoverIndex(hover, "deposits");
  return {
    areas: stackedAreas(
      vaults,
      (v) => v.depositHistory,
      (v) => VAULT_COLORS[v.term],
      max,
    ),
    yTicks: valueTicks(max, [0, 0.33, 0.66, 1], usd),
    xTicks: dayTicks(today),
    tip:
      active == null
        ? HIDDEN_TIP
        : tooltipAt(
            pointX(active, DAYS) / 10,
            45,
            dateOfIndex(today, active),
            usd(totals[active]),
            vaults
              .map((v) => ({
                name: v.term + "-Day Vault",
                color: VAULT_COLORS[v.term],
                raw: v.depositHistory[active],
                val: usd(v.depositHistory[active]),
              }))
              .sort((a, b) => b.raw - a.raw),
          ),
    ...handlers("deposits", (fraction) => Math.round(fraction * (DAYS - 1))),
  };
}

/** One line per vault: the APR a deposit locked in on each of the last 90 days. */
export function entryAprByDay(
  vaults: VaultSnapshot[],
  today: number,
  hover: ChartHover | null,
  handlers: HoverFactory,
) {
  const low = Math.min(...vaults.map((v) => Math.min(...v.aprHistory))) - 0.5;
  const high = Math.max(...vaults.map((v) => Math.max(...v.aprHistory))) + 0.5;
  const toY = (apr: number) => BASELINE - ((apr - low) / (high - low)) * 240;
  const active = hoverIndex(hover, "apr");
  return {
    lines: vaults.map((v) => ({ d: linePath(v.aprHistory, toY), color: VAULT_COLORS[v.term] })),
    yTicks: [0, 0.5, 1].map((fraction) => {
      const apr = low + (high - low) * fraction;
      return { y: yPercent(toY(apr)), label: apr.toFixed(0) + "%" };
    }),
    xTicks: dayTicks(today),
    tip:
      active == null
        ? HIDDEN_TIP
        : tooltipAt(
            pointX(active, DAYS) / 10,
            45,
            dateOfIndex(today, active),
            "Entry APR",
            vaults
              .map((v) => ({
                name: v.term + "-Day Vault",
                color: VAULT_COLORS[v.term],
                raw: v.aprHistory[active],
                val: v.aprHistory[active].toFixed(2) + "%",
              }))
              .sort((a, b) => b.raw - a.raw),
          ),
    ...handlers("apr", (fraction) => Math.round(fraction * (DAYS - 1))),
  };
}

/** Histogram of funded traders by return, with headline stats. */
export function traderReturns(hover: ChartHover | null, handlers: HoverFactory) {
  const population = fundedPopulation();
  const LOW = -10;
  const STEP = 2;
  const BINS = 11;
  const bins = Array.from({ length: BINS }, (_, i) => ({
    lo: LOW + i * STEP,
    hi: LOW + (i + 1) * STEP,
    n: 0,
    capital: 0,
    usd: 0,
  }));
  population.forEach((outcome) => {
    const index = Math.min(BINS - 1, Math.max(0, Math.floor((outcome.ret * 100 - LOW) / STEP)));
    bins[index].n++;
    bins[index].capital += outcome.size;
    bins[index].usd += outcome.usd;
  });
  const max = Math.max(...bins.map((bin) => bin.n)) * 1.12;
  const slot = PLOT_W / BINS;
  const active = hoverIndex(hover, "returns");
  const signedCompact = (value: number) => signed(value, formatCompact(Math.abs(value)));
  const netPnl = population.reduce((sum, o) => sum + o.usd, 0);
  const inProfit = population.filter((o) => o.ret > 0).length;
  const sorted = population.map((o) => o.ret).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const nearMaxLoss = population.filter((o) => o.drawdown >= 0.75).length;
  const xOf = (percent: number) => ((percent - LOW) / STEP) * slot;
  let tip: ChartTooltip = HIDDEN_TIP;
  if (active != null) {
    const bin = bins[active];
    const tone = bin.lo >= 0 ? "var(--c-up)" : "var(--c-dn)";
    const edge = (value: number) => (value > 0 ? "+" : "") + value;
    tip = tooltipAt(
      ((active + 0.5) * slot) / 10,
      50,
      edge(bin.lo) + " to " + edge(bin.hi) + "% return",
      bin.n + " traders",
      [
        {
          name: "Share of traders",
          color: tone,
          val: ((bin.n / FUNDED_POPULATION) * 100).toFixed(1) + "%",
        },
        { name: "Capital funded (USD)", color: "var(--text-3)", val: formatCompact(bin.capital) },
        { name: "PnL (USD)", color: tone, val: signedCompact(bin.usd) },
      ],
    );
  }
  return {
    count: String(FUNDED_POPULATION),
    bars: bins.map((bin, index) => {
      const height = (bin.n / max) * USABLE_H;
      return {
        x: (index * slot + slot * 0.12).toFixed(1),
        y: (BASELINE - height).toFixed(1),
        w: (slot * 0.76).toFixed(1),
        h: Math.max(0.5, height).toFixed(1),
        color: bin.lo >= 0 ? "var(--c-up)" : "var(--c-dn)",
        op: active == null || active === index ? "0.9" : "0.3",
      };
    }),
    zeroX: xOf(0).toFixed(1),
    xTicks: [-8, -4, 0, 4, 8, 12].map((percent, index) => ({
      x: (xOf(percent) / 10).toFixed(2),
      label: (percent > 0 ? "+" : "") + percent + "%",
      cls: (percent === -8 ? "first" : percent === 12 ? "last" : "") + (index === 0 || index === 2 || index === 5 ? " t4" : index === 4 ? " t1" : " t2"),
    })),
    yTicks: [0, 0.5, 1].map((fraction) => ({
      y: yPercent(BASELINE - fraction * USABLE_H),
      label: String(Math.round(max * fraction)),
    })),
    stats: [
      {
        k: "Net PnL (USD)",
        v: signedCompact(netPnl),
        cls: netPnl >= 0 ? "up" : "down",
        info: "Profit minus losses across all funded accounts",
      },
      {
        k: "In Profit (%)",
        v: ((inProfit / FUNDED_POPULATION) * 100).toFixed(1),
        cls: "up",
        info: "Share of funded accounts above their starting balance",
      },
      {
        k: "Median Return (%)",
        v: signed(median, Math.abs(median * 100).toFixed(2)),
        cls: median >= 0 ? "up" : "down",
        info: "The middle return: half of traders are above it, half below",
      },
      {
        k: "Near Max Loss",
        v: String(nearMaxLoss),
        cls: "down",
        info: "Accounts that have used 75% or more of their 10% maximum loss",
      },
    ],
    tip,
    hasBand: active != null,
    bandX: active == null ? "0" : (active * slot).toFixed(1),
    bandW: slot.toFixed(1),
    ...handlers("returns", (fraction) => Math.floor(fraction * BINS)),
  };
}

/** Cumulative capital funded over 12 months, stacked by account size. */
export function capitalFunded(today: number, hover: ChartHover | null, handlers: HoverFactory) {
  const months = fundedByMonth(today);
  const count = months.length;
  const max = months[count - 1].cumulativeTotal * 1.1;
  const active = hoverIndex(hover, "funded");
  let tip: ChartTooltip = HIDDEN_TIP;
  if (active != null) {
    const month = months[active];
    tip = tooltipAt(
      pointX(active, count) / 10,
      50,
      formatMonth(month.start),
      formatCompact(month.cumulativeTotal) + " total",
      FUNDED_ACCOUNT_SIZES.slice()
        .reverse()
        .map(({ size, color }) => ({
          name: formatCompact(size) + " accounts",
          color,
          val: formatCompact(month.cumulative[size]),
        }))
        .concat([
          {
            name: "Funded this month",
            color: "var(--text-3)",
            val: "+" + formatCompact(month.total),
          },
          { name: "Accounts this month", color: "var(--text-3)", val: String(month.count) },
        ]),
    );
  }
  return {
    areas: stackedAreas(
      FUNDED_ACCOUNT_SIZES,
      ({ size }) => months.map((month) => month.cumulative[size]),
      ({ color }) => color,
      max,
    ),
    tip,
    xTicks: months
      .map((month, index) => ({
        x: (pointX(index, count) / 10).toFixed(2),
        label: monthTick(month.start, index === 0),
        cls: index === 0 ? "first" : index === count - 1 ? "last" : "",
      }))
      .filter((_, index) => index % 2 === 0 || index === count - 1),
    yTicks: [0, 0.33, 0.66, 1].map((fraction) => ({
      y: yPercent(valueY(max * fraction, max)),
      label: formatCompact(max * fraction),
    })),
    legend: FUNDED_ACCOUNT_SIZES.map(({ size, color }) => ({
      name: formatCompact(size) + " accounts",
      color,
    })),
    totalYear: formatCompact(months[count - 1].cumulativeTotal),
    countYear: String(months.reduce((sum, month) => sum + month.count, 0)),
    ...handlers("funded", (fraction) => Math.round(fraction * (count - 1))),
  };
}
