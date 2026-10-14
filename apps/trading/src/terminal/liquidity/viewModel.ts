import {
  DAY_MS,
  VAULT_TERMS,
  valueLot,
  type VaultActivity,
  type VaultLot,
  type VaultTerm,
} from "@openfutures/core";
import { LOGOS } from "@/assets/logos";
import { ICON_PATHS } from "@/lib/icons";
import type { Terminal, TerminalState } from "@/terminal/Terminal";
import {
  capitalFunded,
  depositsByVault,
  entryAprByDay,
  liquidityKpis,
  traderReturns,
  unlockSchedule,
  vaultLegend,
  type ChartHover,
  type HoverFactory,
} from "@/terminal/liquidity/analytics";
import { formatDate, formatShort, formatUsdc } from "@/terminal/liquidity/format";
import { liquidityAnalyticsCards } from "@/terminal/liquidity/cards";
import { buildAnalyticsDropdown, FILTER_ICON } from "@/terminal/analytics";
import { buildLiquidityPhone } from "@/terminal/liquidity/phone";
import { seedBook, type LiquidityBook } from "@/terminal/liquidity/positions";
import { fundedTraders, type FundedTrader } from "@/terminal/liquidity/traders";
import { vaultSnapshots, type VaultSnapshot } from "@/terminal/liquidity/vaults";

/** Page of rows plus pager controls, as produced by the main view model's `paginate`. */
type Paginate = <T>(
  tableKey: string,
  items: T[],
  pageSize?: number,
) => { rows: (T & { num: string })[]; pager: Record<string, any> };

export interface LiquidityContext {
  terminal: Terminal;
  state: TerminalState;
  /** USDC the signed-in user can deposit. */
  availableBalance: number;
  paginate: Paginate;
  showToast: (text: string) => void;
  /** The signed-in trader's funded prop account, listed among the funded traders. */
  you: FundedTrader | null;
}

type SortKey = "term" | "dep" | "liq" | "util" | "apr";
type DockTab = "deposits" | "activity";
type LotFilter = "all" | "locked" | "unlocked";
type TraderSort = "size" | "pnl" | "drawdown" | "days";

const SORT_HEADS: [SortKey, string][] = [
  ["term", "Term (days)"],
  ["dep", "Deposits (USDC)"],
  ["liq", "Liquidity (USDC)"],
  ["util", "Utilization (%)"],
  ["apr", "APR Today (%)"],
];

/** Keeps digits and one decimal point with at most two decimals: "1.2.3x" becomes "1.23". */
export function cleanAmount(text: string): string {
  const [whole, ...fraction] = text.replace(/[^0-9.]/g, "").split(".");
  return fraction.length ? whole + "." + fraction.join("").slice(0, 2) : whole;
}

function sortValue(vault: VaultSnapshot, key: SortKey): number {
  switch (key) {
    case "apr":
      return vault.apr;
    case "term":
      return vault.term;
    case "liq":
      return vault.deposits - vault.allocated;
    case "util":
      return vault.utilization;
    default:
      return vault.deposits;
  }
}

/**
 * Display values and handlers for the Liquidity screen (`vm.liq`).
 *
 * State keys, all optional: `lqView` (vaults | analytics), `lqSort`, `lqTermF` (term filter),
 * `lqDD` (open dropdown), `lqSearch`, `lqTab` and `lqDock` (the positions dock), `lqPosF`,
 * `lqSheet` (term being deposited into), `lqAmt`, `lqExit` (lot being exited), `lqHov`
 * (hovered chart point), `lqTraderSort`, and `lqBook`, the depositor's lots and activity.
 * `lqStep`, `lqAck`, and `lqDone` own the reviewed deposit flow. Phone presentation uses
 * `lqmTab`, `lqmPF`, `lqmV`, `lqmR`, `lqmPick`, `lqmLot`, `lqmLs`, and `lqmWA`.
 * Analytics cards use the shared per-card `acGran`, `acMode`, `acOff`, and `acHov` state.
 */
export function buildLiquidityViewModel(ctx: LiquidityContext) {
  const { terminal, state, paginate, showToast } = ctx;
  const set = (patch: TerminalState) => terminal.setState(patch);
  const viewportWidth = state.vw || (typeof window !== "undefined" ? window.innerWidth : 1440);
  const isMobile = viewportWidth < 768;
  const today = Math.floor(state.now / DAY_MS) * DAY_MS;
  const vaults = vaultSnapshots(today);
  const view: "vaults" | "analytics" = state.lqView === "analytics" ? "analytics" : "vaults";

  // Vault table: filter by term, then sort.
  const termFilter: VaultTerm[] = state.lqTermF || [];
  const sort: { k: SortKey; d: 1 | -1 } = state.lqSort || { k: "apr", d: -1 };
  const shownVaults = vaults
    .filter((vault) => !termFilter.length || termFilter.includes(vault.term))
    .sort((a, b) => (sortValue(a, sort.k) - sortValue(b, sort.k)) * sort.d);
  const openDeposit = (term: VaultTerm) => () => set({ lqSheet: term, lqAmt: "", lqStep: "amount", lqAck: false, lqDone: null, lqmPick: false });
  const rows = shownVaults.map((vault, index) => ({
    num: String(index + 1),
    vault: vault.term + "-Day Vault",
    term: String(vault.term),
    deposits: formatShort(vault.deposits),
    liq: formatShort(vault.deposits - vault.allocated),
    util: (vault.utilization * 100).toFixed(1),
    utilW: (vault.utilization * 100).toFixed(0),
    apr: vault.apr.toFixed(2),
    range: vault.aprLow30d.toFixed(2) + " – " + vault.aprHigh30d.toFixed(2),
    unlock: formatDate(vault.unlockAt),
    deposit: openDeposit(vault.term),
  }));
  const openDropdown: string | null = state.lqDD || null;
  const search = (state.lqSearch || "").toLowerCase();
  const termOptions = VAULT_TERMS.map((term) => {
    const isOn = termFilter.includes(term);
    return {
      label: term + "-Day Vault",
      cls: "lq-opt" + (isOn ? " is-on" : ""),
      checked: isOn,
      pick: () => {
        const next = isOn ? termFilter.filter((t) => t !== term) : termFilter.concat(term);
        set({ lqTermF: next });
      },
    };
  }).filter((option) => !search || option.label.toLowerCase().includes(search));

  // The depositor's book lives in state once they act; until then it is seeded.
  const book: LiquidityBook = state.lqBook || seedBook(vaults, today);
  const saveBook = (patch: Partial<LiquidityBook>, extra: TerminalState = {}) =>
    set({ ...extra, lqBook: { ...book, ...patch } });
  const logWith = (entry: VaultActivity): VaultActivity[] => [entry, ...book.log];
  const lots = book.lots.map((lot) => {
    const valuation = valueLot(lot, today);
    const kind = lot.status === "withdrawn" ? "done" : valuation.unlocked ? "free" : "locked";
    return {
      lot,
      valuation,
      kind,
      id: lot.id,
      vault: lot.term + "-Day Vault",
      on: formatDate(lot.at),
      unlock: formatDate(lot.unlockAt),
      apr: lot.apr.toFixed(2),
      daysLeft: kind === "locked" ? String(valuation.daysLeft) : "0",
      deposited: formatUsdc(lot.amount),
      value: formatUsdc(valuation.value),
      earned: "+" + formatUsdc(valuation.earned),
      status: kind === "done" ? "Withdrawn" : kind === "free" ? "Unlocked" : "Locked",
      statusCls: "lq-st " + kind,
      canWithdraw: kind === "free",
      canExit: kind === "locked",
      withdraw: () => {
        saveBook({
          cashDelta: (book.cashDelta || 0) + valuation.value,
          lots: book.lots.map((l) =>
            l.id === lot.id ? { ...l, status: "withdrawn", earned: valuation.earned } : l,
          ),
          log: logWith({
            at: today,
            act: "Withdraw",
            term: lot.term,
            amount: valuation.value,
            apr: lot.apr,
            penalty: 0,
          }),
        });
        showToast("Withdrew " + formatUsdc(valuation.value) + " USDC to your balance.");
      },
      exit: () => set({ lqExit: lot.id }),
    };
  });
  const lotFilter: LotFilter = state.lqPosF || "all";
  const filteredLots = lots.filter(
    (row) =>
      lotFilter === "all" || (lotFilter === "locked" ? row.kind === "locked" : row.kind === "free"),
  );
  const lotsPage = paginate("lq-lots", filteredLots);
  const logPage = paginate(
    "lq-log",
    book.log.map((entry) => ({
      date: formatDate(entry.at),
      act: entry.act,
      actCls: "lq-act-chip " + entry.act.toLowerCase().replace(" ", "-"),
      vault: entry.term + "-Day Vault",
      amt:
        (entry.act === "Deposit" ? "+" : entry.act === "Unlock" ? "" : "−") +
        formatUsdc(entry.amount),
      apr: entry.apr ? entry.apr.toFixed(2) : "-",
      pen: entry.penalty ? formatUsdc(entry.penalty) : "-",
    })),
  );
  const activeLotCount = book.lots.filter((lot) => lot.status !== "withdrawn").length;
  const dockTab: DockTab = state.lqTab === "activity" ? "activity" : "deposits";
  const dockOpen = state.lqDock !== false;

  // Deposit sheet.
  const sheetVault = vaults.find((vault) => vault.term === state.lqSheet) || null;
  const amount = parseFloat(state.lqAmt) || 0;
  const balance = Math.max(0, ctx.availableBalance + (book.cashDelta || 0));
  const depositStep = state.lqStep || "amount";
  const estimatedEarn = sheetVault ? amount * sheetVault.apr / 100 * sheetVault.term / 365 : 0;
  const submitDeposit = () => {
    if (!sheetVault || !amount || amount > balance || !state.lqAck) {
      return;
    }
    const lot: VaultLot = {
      id: "lot" + Date.now(),
      term: sheetVault.term,
      unlockAt: sheetVault.unlockAt,
      apr: sheetVault.apr,
      amount,
      at: today,
      status: "active",
    };
    saveBook(
      {
        cashDelta: (book.cashDelta || 0) - amount,
        lots: [lot].concat(book.lots),
        log: logWith({
          at: today,
          act: "Deposit",
          term: lot.term,
          amount,
          apr: lot.apr,
          penalty: 0,
        }),
      },
      { lqStep: "done", lqDone: { amount, apr: lot.apr, unlockAt: lot.unlockAt }, lqAmt: "", lqTab: "deposits", lqDock: true },
    );
    showToast(
      "Deposited " +
        formatUsdc(amount) +
        " USDC at " +
        lot.apr.toFixed(2) +
        "% APR. Unlocks " +
        formatDate(lot.unlockAt) +
        ".",
    );
  };

  // Early exit sheet.
  const exiting = lots.find((row) => row.id === state.lqExit && row.kind === "locked") || null;
  const exitReceive = exiting ? exiting.valuation.value * (1 - exiting.valuation.penalty) : 0;
  const confirmExit = () => {
    if (!exiting) {
      return;
    }
    saveBook(
      {
        cashDelta: (book.cashDelta || 0) + exitReceive,
        lots: book.lots.map((l) =>
          l.id === exiting.id ? { ...l, status: "withdrawn", earned: exiting.valuation.earned } : l,
        ),
        log: logWith({
          at: today,
          act: "Early Exit",
          term: exiting.lot.term,
          amount: exitReceive,
          apr: exiting.lot.apr,
          penalty: exiting.valuation.value - exitReceive,
        }),
      },
      { lqExit: null, lqmLot: null },
    );
    showToast("Received " + formatUsdc(exitReceive) + " USDC after the early exit penalty.");
  };

  // Charts: hover state and pointer handlers.
  const hover: ChartHover | null = state.lqHov || null;
  const hoverHandlers: HoverFactory = (chart, indexAt) => ({
    move: (event) => {
      const box = event.currentTarget.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(0.9999, (event.clientX - box.left) / box.width));
      const index = indexAt(fraction);
      const current: ChartHover | null = terminal.state.lqHov || null;
      if (!current || current.chart !== chart || current.index !== index) {
        set({ lqHov: { chart, index } });
      }
    },
    leave: (event) => {
      // On touch, the tooltip stays until the next tap so it can be read.
      if (!event || event.pointerType !== "touch") {
        set({ lqHov: null });
      }
    },
  });

  // Funded traders table.
  const traderSort: TraderSort = state.lqTraderSort || "size";
  const traderDirection = state.lqTraderDirection === 1 ? 1 : -1;
  const traderSizes: number[] = state.lqTraderSizes || [];
  const traders = (ctx.you ? [ctx.you] : []).concat(fundedTraders())
    .filter((trader) => !traderSizes.length || traderSizes.includes(trader.size))
    .sort((a, b) => (a[traderSort] - b[traderSort]) * traderDirection);
  const tradersPage = paginate(
    "vault-traders",
    traders.map((trader) => ({
      name: trader.name,
      rowCls: "pv-tr" + (trader.you ? " is-you" : ""),
      size: trader.size.toLocaleString("en-US"),
      pnl: (trader.pnl * 100).toFixed(2),
      pnlCls: trader.pnl >= 0 ? "up" : "down",
      dd: (trader.drawdown * 100).toFixed(0),
      ddW: Math.max(2, trader.drawdown * 100).toFixed(0),
      ddCls: trader.drawdown > 0.75 ? "down" : trader.drawdown > 0.5 ? "warn" : "ok",
      st: trader.status,
      stCls: "pv-st" + (trader.status === "Payout due" ? " due" : ""),
      days: String(trader.days),
    })),
  );

  const isAnalytics = view === "analytics";
  const app = buildLiquidityPhone({ state, set, vaults, lots, book, today, openDeposit, confirmExit,
    withdrawAll: () => {
      const free = lots.filter((row) => row.kind === "free");
      if (!free.length) return;
      const total = free.reduce((sum, row) => sum + row.valuation.value, 0);
      saveBook({
        cashDelta: (book.cashDelta || 0) + total,
        lots: book.lots.map((lot) => {
          const row = free.find((item) => item.id === lot.id);
          return row ? { ...lot, status: "withdrawn", earned: row.valuation.earned } : lot;
        }),
        log: free.map((row): VaultActivity => ({ at: today, act: "Withdraw", term: row.lot.term,
          amount: row.valuation.value, apr: row.lot.apr, penalty: 0 })).concat(book.log),
      }, { lqmWA: false });
      showToast("Withdrew " + formatUsdc(total) + " USDC to your trading balance.");
    },
  });
  return {
    isMobile,
    app,
    goAnalytics: () => set({ lqView: "analytics", lqDD: null }),
    goVaults: () => set({ lqView: "vaults", lqDD: null }),
    views: (
      [
        ["vaults", "Vaults"],
        ["analytics", "Analytics"],
      ] as const
    ).map(([key, label]) => ({
      ic: ICON_PATHS[key],
      label,
      cls: view === key ? "is-active" : "",
      pressed: view === key ? "true" : "false",
      pick: () => set({ lqView: key, lqDD: null }),
    })),
    isVaults: !isAnalytics,
    isAnalytics,
    usdc: LOGOS.usdc,

    // Vault table
    rows,
    empty: rows.length === 0,
    pagerText: rows.length ? "1 to " + rows.length + " of " + rows.length : "0 results",
    heads: SORT_HEADS.map(([key, label]) => {
      const isOn = sort.k === key;
      return {
        label,
        cls: "lq-h" + (isOn ? " is-on" : ""),
        arrow: isOn ? (sort.d < 0 ? "↓" : "↑") : "",
        sortDir: (isOn ? (sort.d < 0 ? "descending" : "ascending") : "none") as
          "descending" | "ascending" | "none",
        pick: () => set({ lqSort: { k: key, d: isOn ? -sort.d : -1 } }),
      };
    }),
    termDD: {
      label: "Term",
      count: termFilter.length ? String(termFilter.length) : "",
      cls: "lq-fbtn" + (openDropdown === "term" || termFilter.length ? " is-on" : ""),
      open: openDropdown === "term",
      toggle: () => set({ lqDD: openDropdown === "term" ? null : "term", lqSearch: "" }),
      opts: termOptions,
      clear: () => set({ lqTermF: [] }),
    },
    closeDD: () => set({ lqDD: null }),
    search: state.lqSearch || "",
    onSearch: (event: React.ChangeEvent<HTMLInputElement>) => set({ lqSearch: event.target.value }),
    hasFilters: termFilter.length > 0,
    clearAll: () => set({ lqTermF: [] }),

    // Positions dock
    tabs: (
      [
        ["deposits", "My Deposits", activeLotCount],
        ["activity", "My Activity", book.log.length],
      ] as const
    ).map(([key, label, count]) => ({
      label,
      count: String(count),
      cls: "tab" + (dockTab === key ? " is-active" : ""),
      pressed: dockTab === key ? "true" : "false",
      pick: () => set({ lqTab: key, lqDock: true }),
    })),
    isDeposits: dockTab === "deposits",
    isActivity: dockTab === "activity",
    dockOpen,
    dockCls: "dock lq-dock snap-card" + (dockOpen ? "" : " is-closed"),
    dockChevron: dockOpen ? "m6 9 6 6 6-6" : "m6 15 6-6 6 6",
    dockLabel: dockOpen ? "Collapse your liquidity panel" : "Expand your liquidity panel",
    toggleDock: () => set({ lqDock: !dockOpen }),
    posF: (
      [
        ["all", "All"],
        ["locked", "Locked"],
        ["unlocked", "Unlocked"],
      ] as const
    ).map(([key, label]) => ({
      ic: ICON_PATHS[key],
      label,
      cls: lotFilter === key ? "is-on" : "",
      pressed: lotFilter === key ? "true" : "false",
      pick: () => set({ lqPosF: key }),
    })),
    myValue: formatUsdc(
      lots.filter((row) => row.kind !== "done").reduce((sum, row) => sum + row.valuation.value, 0),
    ),
    lots: lotsPage.rows,
    lotsPager: lotsPage.pager,
    hasLots: filteredLots.length > 0,
    log: logPage.rows,
    logPager: logPage.pager,
    hasLog: book.log.length > 0,

    // Deposit sheet
    sheetOpen: !!sheetVault,
    sheetTitle: depositStep === "review" ? "Review Deposit" : depositStep === "done" ? "Deposit Complete" : sheetVault ? "Deposit to the " + sheetVault.term + "-Day Vault" : "",
    depositStep,
    depositAck: !!state.lqAck,
    toggleAck: () => set({ lqAck: !state.lqAck }),
    reviewDeposit: () => { if (sheetVault && amount > 0 && amount <= balance) set({ lqStep: "review", lqAck: false }); },
    backDeposit: () => set({ lqStep: "amount" }),
    confirmDis: !state.lqAck || !amount || amount > balance,
    depositAmount: formatUsdc(amount),
    depositReview: sheetVault ? [
      { k: "Vault", v: sheetVault.term + "-Day Vault" },
      { k: "APR Locked (%)", v: sheetVault.apr.toFixed(2) },
      { k: "Unlocks On", v: formatDate(sheetVault.unlockAt) },
      { k: "Earned by Unlock (USDC)", v: formatUsdc(estimatedEarn) },
      { k: "Value at Unlock (USDC)", v: formatUsdc(amount + estimatedEarn) },
      { k: "Early Exit (%)", v: "10 now, 0 at unlock" },
    ] : [],
    lockAck: sheetVault ? "I understand this USDC is locked until " + formatDate(sheetVault.unlockAt) + ", and leaving early costs up to 10%." : "",
    depositDone: state.lqDone ? formatUsdc(state.lqDone.amount) + " USDC locked at " + state.lqDone.apr.toFixed(2) + "% APR until " + formatDate(state.lqDone.unlockAt) + "." : "",
    viewDeposits: () => set({ lqSheet: null, lqmV: null, lqmTab: "deposits", lqmPF: "all" }),
    sheetRows: sheetVault
      ? [
          { k: "APR Locked (%)", v: sheetVault.apr.toFixed(2) },
          {
            k: "Unlocks on",
            v: formatDate(sheetVault.unlockAt) + ", in " + sheetVault.term + " days",
          },
          { k: "Early exit", v: "10% now, falling evenly to 0% by unlock" },
          { k: "After unlock", v: "Free to withdraw, stops earning" },
        ]
      : [],
    amt: state.lqAmt || "",
    onAmt: (event: React.ChangeEvent<HTMLInputElement>) =>
      set({ lqAmt: cleanAmount(event.target.value) }),
    quick: [25, 50, 75, 100].map((pct) => ({
      label: pct === 100 ? "Max" : pct + "%",
      pick: () => set({ lqAmt: ((balance * pct) / 100).toFixed(2) }),
    })),
    avail: "Available " + formatUsdc(balance) + " USDC",
    estEarn:
      sheetVault && amount && amount <= balance
        ? "About " +
          formatUsdc((((amount * sheetVault.apr) / 100) * sheetVault.term) / 365) +
          " USDC earned by unlock"
        : "",
    cta: amount
      ? amount > balance
        ? "More than your balance"
        : "Deposit " + formatUsdc(amount) + " USDC"
      : "Enter an amount",
    ctaDis: !amount || amount > balance,
    submit: submitDeposit,
    closeSheet: () => set({ lqSheet: null, lqExit: null, lqStep: "amount" }),

    // Early exit sheet
    exitOpen: !!exiting,
    exitTitle: exiting ? "Exit the " + exiting.vault + " Early" : "",
    exitRows: exiting
      ? [
          { k: "Value now", v: exiting.value + " USDC" },
          { k: "Penalty today", v: (exiting.valuation.penalty * 100).toFixed(2) + "%" },
          { k: "You receive", v: formatUsdc(exitReceive) + " USDC" },
          { k: "Unlocks on", v: exiting.unlock },
        ]
      : [],
    exitConfirm: confirmExit,

    // Analytics, only built while that view is on screen.
    legend: vaultLegend(),
    kpis: isAnalytics ? liquidityKpis(vaults).filter((_, index) => [0, 1, 3, 5].includes(index)) : [],
    analyticsCards: isAnalytics ? liquidityAnalyticsCards(vaults, today, state, set) : [],
    traderSizeControl: buildAnalyticsDropdown("liq-trader-size", "Account Size", FILTER_ICON,
      [{ v: "all", label: "All account sizes" }, ...[10000, 25000, 50000, 100000].map((size) => ({ v: String(size), label: size.toLocaleString("en-US") + " USD" }))],
      traderSizes.length === 1 ? String(traderSizes[0]) : "all", state, set, (value) => ({ lqTraderSizes: value === "all" ? [] : [Number(value)] })),
    unlocks: isAnalytics ? unlockSchedule(vaults, today, hover, hoverHandlers) : null,
    hist: isAnalytics ? depositsByVault(vaults, today, hover, hoverHandlers) : null,
    curve: isAnalytics ? entryAprByDay(vaults, today, hover, hoverHandlers) : null,
    dist: isAnalytics ? traderReturns(hover, hoverHandlers) : null,
    funded: isAnalytics ? capitalFunded(today, hover, hoverHandlers) : null,
    traders: tradersPage.rows,
    tradersPager: tradersPage.pager,
    traderHeads: ([["size", "Account (USD)"], ["pnl", "PnL (%)"], ["drawdown", "Drawdown Used (%)"], ["days", "Days"]] as const).map(([key, label]) => ({
      label, cls: "pv-sort" + (traderSort === key ? " is-on" : ""),
      arrow: traderSort === key ? (traderDirection === 1 ? "↑" : "↓") : "↕",
      sortDir: (traderSort === key ? traderDirection === 1 ? "ascending" : "descending" : "none") as "ascending" | "descending" | "none",
      pick: () => set({ lqTraderSort: key, lqTraderDirection: traderSort === key ? -traderDirection : -1 }),
    })),
    traderSizes: [10000, 25000, 50000, 100000].map((size) => ({ label: size.toLocaleString("en-US"), checked: traderSizes.includes(size),
      pick: () => set({ lqTraderSizes: traderSizes.includes(size) ? traderSizes.filter((v) => v !== size) : [...traderSizes, size] }) })),
    traderSizeOpen: state.lqDD === "traderSize",
    toggleTraderSize: () => set({ lqDD: state.lqDD === "traderSize" ? null : "traderSize" }),
    traderSorts: (
      [
        ["size", "Account"],
        ["pnl", "PnL"],
        ["days", "Days"],
      ] as const
    ).map(([key, label]) => ({
      label,
      cls: "mwc-opt" + (traderSort === key ? " is-on" : ""),
      pick: () => set({ lqTraderSort: key }),
    })),
  };
}

export type LiquidityViewModel = ReturnType<typeof buildLiquidityViewModel>;
