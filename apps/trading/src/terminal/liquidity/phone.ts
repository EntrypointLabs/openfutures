import { DAY_MS, valueLot, type VaultLot, type VaultTerm } from "@openfutures/core";
import { ICON_PATHS } from "@/lib/icons";
import { linePath, BASELINE } from "@/terminal/liquidity/charts";
import { formatDate, formatUsdc, formatShort } from "@/terminal/liquidity/format";
import type { LiquidityBook } from "@/terminal/liquidity/positions";
import type { VaultSnapshot } from "@/terminal/liquidity/vaults";
import type { TerminalState } from "@/terminal/Terminal";

interface LotRow {
  lot: VaultLot;
  valuation: ReturnType<typeof valueLot>;
  kind: string;
  id: string;
  vault: string;
  on: string;
  unlock: string;
  apr: string;
  deposited: string;
  value: string;
  earned: string;
  status: string;
  statusCls: string;
  withdraw: () => void;
  exit: () => void;
}
interface PhoneContext {
  state: TerminalState;
  set: (patch: TerminalState) => void;
  vaults: VaultSnapshot[];
  lots: LotRow[];
  book: LiquidityBook;
  today: number;
  openDeposit: (term: VaultTerm) => () => void;
  confirmExit: () => void;
  withdrawAll: () => void;
}

/** Phone presentation of the same vaults and depositor book used by the desktop page. */
export function buildLiquidityPhone({ state, set, vaults, lots, book, today, openDeposit, confirmExit, withdrawAll }: PhoneContext) {
  const live = lots.filter((row) => row.kind !== "done");
  const free = live.filter((row) => row.kind === "free");
  const total = live.reduce((sum, row) => sum + row.valuation.value, 0);
  const earned = live.reduce((sum, row) => sum + row.valuation.earned, 0);
  const ready = free.reduce((sum, row) => sum + row.valuation.value, 0);
  const byApr = vaults.slice().sort((a, b) => b.apr - a.apr);
  const tab = state.lqmTab || "vaults";
  const filter = state.lqmPF || "all";
  const shown = live.filter((row) => filter === "all" || (filter === "locked" ? row.kind === "locked" : row.kind === "free"))
    .sort((a, b) => a.lot.unlockAt - b.lot.unlockAt);
  const vaultRow = (vault: VaultSnapshot) => ({
    term: vault.term, name: vault.term + "-Day Vault", tag: vault.term + "d",
    mine: live.some((row) => row.lot.term === vault.term), apr: vault.apr.toFixed(2),
    sub: "Unlocks " + formatDate(vault.unlockAt) + ", " + (vault.utilization * 100).toFixed(0) + "% used",
    open: () => set({ lqmV: vault.term, lqmR: 90 }), deposit: openDeposit(vault.term),
  });
  const lotRow = (row: LotRow) => ({
    ...row, tag: row.lot.term + "d", name: row.vault,
    sub: row.deposited + " at " + row.apr + "%, " + (row.kind === "free" ? "ready" : row.valuation.daysLeft + "d left"),
    open: () => set({ lqmLot: row.id, lqmLs: "view" }),
  });
  const selectedVault = vaults.find((vault) => vault.term === state.lqmV);
  const range = [7, 30, 90].includes(Number(state.lqmR)) ? Number(state.lqmR) : 90;
  const series = selectedVault?.aprHistory.slice(-range) || [];
  const low = Math.min(...series) - 0.15;
  const high = Math.max(...series) + 0.15;
  const toY = (value: number) => BASELINE - ((value - low) / (high - low || 1)) * 240;
  const mine = selectedVault ? live.filter((row) => row.lot.term === selectedVault.term) : [];
  const selectedLot = live.find((row) => row.id === state.lqmLot);
  const lotStage = state.lqmLs || "view";
  const penalty = selectedLot ? selectedLot.valuation.value * selectedLot.valuation.penalty : 0;
  return {
    whole: formatUsdc(total).split(".")[0], cents: formatUsdc(total).split(".")[1],
    earned: "+" + formatUsdc(earned), ready: formatUsdc(ready),
    openPick: () => set({ lqmPick: true }), closePick: () => set({ lqmPick: false }),
    pickOpen: !!state.lqmPick, withdrawDisabled: !free.length,
    openWithdrawAll: () => { if (free.length) set({ lqmWA: true }); },
    withdrawAllOpen: !!state.lqmWA && !!free.length,
    closeWithdrawAll: () => set({ lqmWA: false }), withdrawAll, free: free.map(lotRow),
    tabs: ([["vaults", "Vaults", vaults.length], ["deposits", "Deposits", live.length], ["activity", "Activity", book.log.length]] as const).map(([key, label, count]) => ({
      label, count, ic: ICON_PATHS[key === "deposits" ? "locked" : key === "activity" ? "history" : "vaults"],
      on: tab === key, pick: () => set({ lqmTab: key }),
    })),
    isVaults: tab === "vaults", isDeposits: tab === "deposits", isActivity: tab === "activity",
    filters: ([["all", "All", live.length], ["locked", "Locked", live.length - free.length], ["unlocked", "Unlocked", free.length]] as const).map(([key, label, count]) => ({
      label, count, on: filter === key, pick: () => set({ lqmPF: key }),
    })),
    vaults: byApr.map(vaultRow), lots: shown.map(lotRow),
    log: book.log.map((entry) => ({
      action: entry.act, sub: entry.term + "-Day Vault, " + formatDate(entry.at),
      amount: (entry.act === "Deposit" ? "+" : entry.act === "Unlock" ? "" : "−") + formatUsdc(entry.amount),
      note: entry.penalty ? "Penalty " + formatUsdc(entry.penalty) : entry.apr.toFixed(2) + "% APR",
    })),
    detail: selectedVault ? {
      name: selectedVault.term + "-Day Vault", term: selectedVault.term, apr: selectedVault.apr.toFixed(2),
      change: series[series.length - 1] - series[0],
      close: () => set({ lqmV: null }), deposit: openDeposit(selectedVault.term),
      ranges: ([[7, "1W"], [30, "1M"], [90, "3M"]] as const).map(([days, label]) => ({ label, on: range === days, pick: () => set({ lqmR: days }) })),
      path: series.length ? linePath(series, toY) : "",
      start: formatDate(today - (range - 1) * DAY_MS), end: formatDate(today),
      mine: mine.map(lotRow), mineValue: formatUsdc(mine.reduce((sum, row) => sum + row.valuation.value, 0)),
      rows: [
        { k: "Term (days)", v: String(selectedVault.term) },
        { k: "Unlocks On", v: formatDate(selectedVault.unlockAt) },
        { k: "APR 30d Range (%)", v: selectedVault.aprLow30d.toFixed(2) + " to " + selectedVault.aprHigh30d.toFixed(2) },
        { k: "Deposits (USDC)", v: formatShort(selectedVault.deposits) },
        { k: "Free Liquidity (USDC)", v: formatShort(selectedVault.deposits - selectedVault.allocated) },
        { k: "Utilization (%)", v: (selectedVault.utilization * 100).toFixed(1) },
        { k: "Early Exit (%)", v: "10 to 0" },
      ],
    } : null,
    lot: selectedLot ? {
      ...lotRow(selectedLot), stage: lotStage,
      close: () => set({ lqmLot: null, lqmLs: "view", lqExit: null }),
      daysHeld: Math.min(selectedLot.lot.term, Math.max(0, Math.floor((today - selectedLot.lot.at) / DAY_MS))),
      progress: Math.min(100, Math.max(0, (today - selectedLot.lot.at) / DAY_MS / selectedLot.lot.term * 100)),
      daysLeft: selectedLot.valuation.daysLeft,
      isUnlocked: selectedLot.kind === "free",
      goWithdraw: () => set({ lqmLs: "withdraw" }),
      goExit: () => set({ lqmLs: "exit", lqExit: selectedLot.id }),
      back: () => set({ lqmLs: "view", lqExit: null }),
      withdraw: () => { selectedLot.withdraw(); set({ lqmLot: null }); },
      confirmExit, penalty: formatUsdc(penalty), penaltyPct: (selectedLot.valuation.penalty * 100).toFixed(2),
      receive: formatUsdc(selectedLot.valuation.value - penalty),
      rows: [
        { k: "Deposited (USDC)", v: selectedLot.deposited }, { k: "Entry APR (%)", v: selectedLot.apr },
        { k: "Unlocks On", v: selectedLot.unlock }, { k: "Early Exit Today (%)", v: (selectedLot.valuation.penalty * 100).toFixed(2) },
      ],
    } : null,
  };
}
