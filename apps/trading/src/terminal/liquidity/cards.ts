import { DAY_MS, VAULT_TERMS, formatCompact } from "@openfutures/core";
import { FUNDED_ACCOUNT_SIZES, VAULT_COLORS, VAULT_HISTORY_DAYS } from "@/data/liquidity";
import { buildAnalyticsCard } from "@/terminal/analytics";
import { fundedByMonth } from "@/terminal/liquidity/traders";
import { formatShort } from "@/terminal/liquidity/format";
import type { VaultSnapshot } from "@/terminal/liquidity/vaults";
import type { TerminalState } from "@/terminal/Terminal";

/** Confirmed card layout uses the existing vault history and funded capital series. */
export function liquidityAnalyticsCards(vaults: VaultSnapshot[], today: number, state: TerminalState, set: (patch: TerminalState) => void) {
  const dates = Array.from({ length: VAULT_HISTORY_DAYS }, (_, index) => today - (VAULT_HISTORY_DAYS - 1 - index) * DAY_MS);
  const months = Array.from({ length: 24 }, (_, index) => {
    const start = new Date(today); start.setUTCDate(1); start.setUTCMonth(start.getUTCMonth() + index);
    const end = new Date(start.getTime()); end.setUTCMonth(end.getUTCMonth() + 1);
    return { start: start.getTime(), end: end.getTime() };
  });
  const funded = fundedByMonth(today);
  const money = (value: number) => "$" + formatShort(value);
  return [
    buildAnalyticsCard({ id: "lq-deposits", snap: "liquidity-deposits", title: "Deposits by Vault (USDC)", sub: "USDC held in each vault over the last 90 days.",
      series: vaults.map((vault) => ({ name: vault.term + "-Day Vault", color: VAULT_COLORS[vault.term], data: vault.depositHistory })),
      dates, grans: ["d", "w"], agg: "last", fmt: money }, state, set),
    buildAnalyticsCard({ id: "lq-apr", snap: "liquidity-apr-curve", title: "Entry APR by Day (%)", sub: "The APR a deposit locks in, by its entry date.",
      series: vaults.map((vault) => ({ name: vault.term + "-Day Vault", color: VAULT_COLORS[vault.term], data: vault.aprHistory })),
      dates, kind: "lines", grans: ["d", "w"], agg: "avg", zeroBase: false, fmt: (value) => value.toFixed(2) + "%", fmtAxis: (value) => value.toFixed(1) + "%" }, state, set),
    buildAnalyticsCard({ id: "lq-unlocks", snap: "liquidity-unlocks", title: "Unlock Schedule (USDC)", sub: "Deposits reaching their unlock date each month, next 24 months.",
      series: VAULT_TERMS.map((term) => ({ name: term + "-Day Vault", color: VAULT_COLORS[term], data: months.map((month) => {
        const vault = vaults.find((item) => item.term === term)!;
        const from = Math.max(today, month.start), to = Math.min(today + term * DAY_MS, month.end);
        return to > from ? vault.deposits * ((to - from) / DAY_MS) / term : 0;
      }) })), dates: months.map((month) => month.start), grans: ["m"], agg: "sum", fmt: money }, state, set),
    buildAnalyticsCard({ id: "lq-funded", snap: "liquidity-funded-over-time", title: "Capital Funded (USD)", sub: "Cumulative capital given to funded traders, by account size.",
      series: FUNDED_ACCOUNT_SIZES.map(({ size, color }) => ({ name: formatCompact(size) + " accounts", color, data: funded.map((month) => month.cumulative[size]) })),
      dates: funded.map((month) => month.start), grans: ["m"], agg: "last", fmt: money }, state, set),
  ];
}
