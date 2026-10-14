import { hashString, seededRandom } from "@openfutures/core";
import { MARKETS } from "@/data/markets";
import type { CopyLeader } from "@/data/copy";

export const COPY_DAYS = 150;
export const DAY = 86_400_000;
export const format = (value: number, decimals = 2) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
export const signed = (value: number, decimals = 2) =>
  (value < 0 ? "-" : "+") + format(Math.abs(value), decimals);
export const direction = (value: number) => (value < 0 ? "down" : "up");
export const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
export const number = (value: unknown, fallback = 0) =>
  Number.isFinite(parseFloat(String(value))) ? parseFloat(String(value)) : fallback;
export const marketFor = (symbol: string) => MARKETS.find((market) => market.sym === symbol)!;

export interface CopySettings {
  mode: "prop" | "mult";
  mult: string;
  alloc: string;
  lev: string;
  dd: string;
  open: boolean;
  base: number;
  since?: number;
  paused?: boolean;
  pausedAt?: number;
}
export interface CopySeries {
  eq: number[];
  pnl: number[];
  trades: number[];
}
export interface CopyPosition {
  sym: string;
  venue: string;
  dir: number;
  lev: number;
  marginRatio: number;
  entry: number;
  openedAt: number;
}

/** Deterministic daily sample data, matching the confirmed artifact's seeded model. */
export function leaderSeries(leader: CopyLeader, today: number): CopySeries {
  const raw = [1],
    trades: number[] = [];
  for (let index = 0; index < COPY_DAYS; index++) {
    const day = today - (COPY_DAYS - 1 - index);
    const random = seededRandom(hashString(leader.id + ":d:" + day));
    const gaussian = (random() + random() + random() + random() - 2) * 1.732;
    const active = leader.wkend ? 1 : (day + 3) % 7 >= 5 ? 0.35 : 1;
    const count = Math.max(0, Math.round(leader.tpd * active * (0.35 + 1.3 * random())));
    const change =
      count === 0
        ? 0
        : (leader.drift + leader.vol * gaussian) * (0.6 + 0.4 * Math.min(1, count / leader.tpd));
    trades.push(count);
    raw.push(raw[index]! * (1 + change / 100));
  }
  const scale = leader.eq / raw[COPY_DAYS]!;
  const eq = raw.map((value) => value * scale);
  return { eq, pnl: eq.slice(1).map((value, index) => value - eq[index]!), trades };
}

export function leaderStats(series: CopySeries, days = 30) {
  const start = COPY_DAYS - days,
    initial = series.eq[start]!,
    end = series.eq[COPY_DAYS]!;
  let peak = initial,
    drawdown = 0,
    wins = 0,
    active = 0,
    gain = 0,
    loss = 0,
    best = -Infinity,
    trades = 0;
  for (let index = start; index < COPY_DAYS; index++) {
    peak = Math.max(peak, series.eq[index + 1]!);
    drawdown = Math.max(drawdown, ((peak - series.eq[index + 1]!) / peak) * 100);
    const pnl = series.pnl[index]!;
    if (series.trades[index]! > 0) {
      active++;
      if (pnl > 0) wins++;
    }
    if (pnl > 0) gain += pnl;
    else loss -= pnl;
    best = Math.max(best, pnl);
    trades += series.trades[index]!;
  }
  return {
    pnl: end - initial,
    ret: (end / initial - 1) * 100,
    drawdown,
    winRate: active ? (wins / active) * 100 : 0,
    profitFactor: loss ? gain / loss : gain ? 99 : 0,
    best,
    trades,
  };
}

export function leaderPositions(leader: CopyLeader, snapshotAt: number): CopyPosition[] {
  const random = seededRandom(hashString(leader.id + ":pos"));
  const combinations = leader.mk.flatMap((sym) => leader.venues.map((venue) => ({ sym, venue })));
  for (let index = combinations.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [combinations[index], combinations[other]] = [combinations[other]!, combinations[index]!];
  }
  const count = Math.min(combinations.length, 3 + Math.floor(random() * 3)),
    positions: CopyPosition[] = [];
  let total = 0;
  for (let index = 0; index < count; index++) {
    const combo = combinations[index]!,
      market = marketFor(combo.sym);
    if (!market) continue;
    const dir = random() < 0.58 ? 1 : -1;
    const lev = Math.max(
      1,
      Math.min(leader.maxLev, Math.round(leader.lev * (0.6 + 0.9 * random()) * 2) / 2),
    );
    const marginRatio = 0.06 + 0.12 * random();
    const offset = ((random() - 0.42) * 0.06) / Math.max(1, lev / 4);
    const minutes = Math.floor(10 + random() * Math.max(120, leader.hold * 60 * 2.2));
    total += marginRatio;
    positions.push({
      ...combo,
      dir,
      lev,
      marginRatio,
      entry: market.price * (1 - dir * offset),
      openedAt: snapshotAt - minutes * 60_000,
    });
  }
  if (total > 0.75) positions.forEach((position) => (position.marginRatio *= 0.75 / total));
  return positions.sort((a, b) => a.openedAt - b.openedAt);
}

export function followerPerformance(
  leader: CopyLeader,
  series: CopySeries,
  settings: CopySettings,
  today: number,
) {
  const alloc = number(settings.alloc),
    cap = Math.min(1, number(settings.lev, 1) / leader.lev);
  const start = clamp(
    COPY_DAYS - (today - Math.floor((settings.since || today * DAY) / DAY)),
    0,
    COPY_DAYS,
  );
  const pausedDay = settings.pausedAt ? Math.floor(settings.pausedAt / DAY) : null;
  let gross = 0,
    peak = alloc,
    stopped = false;
  const net: number[] = [];
  for (let index = start; index < COPY_DAYS; index++) {
    const day = today - (COPY_DAYS - 1 - index);
    if (!stopped && !(pausedDay !== null && day >= pausedDay) && alloc > 0) {
      const scale =
        settings.mode === "prop"
          ? alloc / series.eq[index]!
          : Math.min(number(settings.mult), alloc / (0.45 * series.eq[index]!));
      gross += series.pnl[index]! * scale * cap;
      peak = Math.max(peak, alloc + gross);
      if (peak && ((peak - alloc - gross) / peak) * 100 >= number(settings.dd, 20)) stopped = true;
    }
    net.push(gross - (leader.share ? 0.1 : 0) * Math.max(0, gross));
  }
  const fee = (leader.share ? 0.1 : 0) * Math.max(0, gross);
  return { start, net, gross, fee, pnl: gross - fee, alloc, stopped };
}

export function mirrorPositions(
  leader: CopyLeader,
  series: CopySeries,
  settings: CopySettings,
  positions: CopyPosition[],
  closed: Record<string, boolean>,
  off = "",
) {
  const equity = series.eq[COPY_DAYS]!,
    alloc = number(settings.alloc);
  const ratio = settings.mode === "prop" ? alloc / equity : number(settings.mult);
  let remaining = alloc,
    margin = 0,
    openPnl = 0,
    count = 0;
  const rows = positions.map((position) => {
    const mark = marketFor(position.sym).price,
      leaderMargin = position.marginRatio * equity,
      leaderSize = leaderMargin * position.lev;
    const leaderPnl = ((position.dir * (mark - position.entry)) / position.entry) * leaderSize;
    let yourMargin = 0,
      yourSize = 0,
      status = "Mirrored";
    const key = position.sym + ":" + position.openedAt;
    if (off) status = off;
    else if (closed[key]) status = "Closed by you";
    else if (!settings.open && position.openedAt < (settings.since || 0)) status = "Not copied";
    else {
      yourMargin = leaderMargin * ratio;
      const leverage = Math.min(position.lev, number(settings.lev, 1));
      if (yourMargin > remaining) {
        yourMargin = remaining >= 5 ? remaining : 0;
        status = yourMargin ? "Trimmed to budget" : "Skipped, budget used";
      }
      yourSize = yourMargin * leverage;
      if (yourMargin > 0 && yourSize < 10) {
        yourMargin = 0;
        yourSize = 0;
        status = "Skipped, below minimum";
      }
      if (yourMargin > 0 && status === "Mirrored" && leverage < position.lev)
        status = "Capped at " + leverage + "x";
    }
    const yourPnl = ((position.dir * (mark - position.entry)) / position.entry) * yourSize;
    if (yourMargin > 0) {
      remaining -= yourMargin;
      margin += yourMargin;
      count++;
      openPnl += yourPnl;
    }
    return {
      ...position,
      key,
      mark,
      leaderMargin,
      leaderSize,
      leaderPnl,
      yourMargin,
      yourSize,
      yourPnl,
      status,
    };
  });
  return { rows, margin, openPnl, count, ratio, equity };
}
