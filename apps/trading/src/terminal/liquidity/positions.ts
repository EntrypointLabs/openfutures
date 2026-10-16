import { DAY_MS, accruedEarnings, type VaultActivity, type VaultLot } from "@openfutures/core";
import { SEED_EXITS, SEED_LOTS } from "@/data/liquidity";
import { aprOnDay, type VaultSnapshot } from "@/terminal/liquidity/vaults";

/** A depositor's lots and activity log, newest activity first. Kept in terminal state as `lqBook`. */
export interface LiquidityBook {
  lots: VaultLot[];
  log: VaultActivity[];
  /** Net USDC moved into or out of the existing trading balance in this session. */
  cashDelta?: number;
}

/** The signed-in depositor's starting book, built from the seed data relative to `today`. */
export function seedBook(vaults: VaultSnapshot[], today: number): LiquidityBook {
  const lots: VaultLot[] = SEED_LOTS.map((seed) => {
    const at = today - seed.daysAgo * DAY_MS;
    const apr = aprOnDay(vaults, seed.term, seed.daysAgo);
    return {
      id: seed.id,
      term: seed.term,
      amount: seed.amount,
      at,
      unlockAt: at + seed.term * DAY_MS,
      apr,
      status: seed.status,
      earned:
        seed.status === "withdrawn"
          ? accruedEarnings(seed.amount, apr, seed.heldDays || 0, seed.term)
          : undefined,
    };
  });
  const log: VaultActivity[] = lots.map((lot) => ({
    at: lot.at,
    act: "Deposit",
    term: lot.term,
    amount: lot.amount,
    apr: lot.apr,
    penalty: 0,
  }));
  SEED_EXITS.forEach((exit) => {
    const lot = lots.find((l) => l.id === exit.lot)!;
    // An unlock reports the full-term value; withdrawals and exits report what left the vault.
    const gross =
      exit.act === "Unlock"
        ? lot.amount + accruedEarnings(lot.amount, lot.apr, lot.term, lot.term)
        : lot.amount + (lot.earned || 0);
    const penalty = gross * (exit.penaltyRate || 0);
    log.push({
      at: today - exit.daysAgo * DAY_MS,
      act: exit.act,
      term: lot.term,
      amount: gross - penalty,
      apr: lot.apr,
      penalty,
    });
  });
  log.sort((a, b) => b.at - a.at);
  return { lots, log };
}
