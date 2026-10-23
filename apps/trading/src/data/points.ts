import { seededRandom } from "@openfutures/core";

export const POINT_SOURCES = [
  { id: "trading", label: "Trading", who: "Trader" },
  { id: "lp", label: "Liquidity", who: "Depositor" },
  { id: "prop", label: "Prop", who: "Trader" },
  { id: "ref", label: "Referral", who: "Referrer" },
] as const;
export type PointSource = (typeof POINT_SOURCES)[number]["id"];
export interface PointTrader {
  name: string;
  background: string;
  you: boolean;
  weeks: number[][];
  scores: number[];
}
export const YOUR_WEEK_POINTS = [
  [2300, 1700, 600, 500],
  [3560, 2100, 1100, 620],
];

/** Reproducible sample leaderboard from the confirmed design. */
export function pointTraders(weekNumber: number): PointTrader[] {
  const random = seededRandom(5521),
    used: Record<string, number> = {};
  const handles = [
    "tardfi",
    "crypto",
    "b1gbicep",
    "Kimera",
    "maven",
    "satoshi.sol",
    "perp.queen",
    "deltaneutral",
    "nightowl",
    "hodl4ever",
    "fundingfarmer",
    "basisbob",
    "longgamma",
    "vol.smile",
    "kaito",
    "moonboi",
    "sigma.trades",
    "anon.eth",
    "gigabrain",
    "liqhunter",
  ];
  const topPoints = [22000, 12000, 7000, 3000],
    topScores = [17199059, 7269418, 3100000, 1250000],
    active = [0.97, 0.85, 0.55, 0.45];
  const hex = (count: number) =>
    Array.from({ length: count }, () => "0123456789abcdef".charAt(Math.floor(random() * 16))).join(
      "",
    );
  const traders = Array.from({ length: 120 }, (_, index) => {
    let name: string;
    if (random() < 0.3) {
      const handle = handles[Math.floor(random() * handles.length)]!;
      used[handle] = (used[handle] || 0) + 1;
      name = handle + (used[handle]! > 1 ? used[handle] : "");
    } else name = "0x" + hex(2) + "…" + hex(4);
    const hue = Math.floor(random() * 360),
      hue2 = (hue + 40 + Math.floor(random() * 120)) % 360;
    const background = `linear-gradient(135deg,hsl(${hue} 70% 58%),hsl(${hue2} 75% 48%))`;
    const strength = Math.pow(0.962, index) * (0.8 + random() * 0.4);
    const weeks = Array.from({ length: Math.max(0, weekNumber - 1) }, () => {
      const factor = 0.7 + random() * 0.6;
      return topPoints.map((value, k) =>
        random() < active[k]! ? Math.round(value * strength * factor * (0.4 + random() * 1.2)) : 0,
      );
    });
    const scores = topScores.map((value, k) =>
      random() < active[k]! ? Math.round(value * strength * (0.4 + random() * 1.2)) : 0,
    );
    return { name, background, you: false, weeks, scores };
  });
  traders.push({
    name: "kai.trades",
    background: "linear-gradient(135deg,#3b6ff6,#8aa9ff)",
    you: true,
    weeks: Array.from({ length: Math.max(0, weekNumber - 1) }, (_, index) =>
      (YOUR_WEEK_POINTS[index] || YOUR_WEEK_POINTS.at(-1)!).slice(),
    ),
    scores: [645210, 214800, 64300, 21900],
  });
  return traders;
}
