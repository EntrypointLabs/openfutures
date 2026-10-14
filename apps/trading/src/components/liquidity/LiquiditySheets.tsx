import { useRef, type FormEvent, type ReactNode } from "react";
import { useDialogFocus } from "@/components/common/useDialogFocus";
import type { TerminalViewModel } from "@/terminal/types";

/**
 * Bottom sheet on phones, centred dialog on larger screens (`.fd-sheet`).
 * Focus moves into the sheet on open, stays inside it while open, and returns to whatever
 * opened it on close. Escape closes; submitting the form (Enter in the input) runs `onSubmit`.
 */
export function LiquiditySheet({
  title,
  rows,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  rows: { k: string; v: string }[];
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLFormElement>(null);
  useDialogFocus(sheetRef, onClose, "input, .fd-cta");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <>
      <button
        type="button"
        className="fd-scrim"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
      />
      <form
        ref={sheetRef}
        className="fd-sheet cr-sheet lq-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onSubmit={submit}
      >
        <span className="hm-grab" aria-hidden="true" />
        <div className="fd-head">
          <h2>{title}</h2>
          <button type="button" className="fd-hbtn fd-x" aria-label="Close" onClick={onClose}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
              style={{ fill: "none", stroke: "currentColor" }}
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="pp-rows lq-sheet-rows">
          {rows.map((row, i) => (
            <div key={i} className="obs-row">
              <span>{row.k}</span>
              <b className="num">{row.v}</b>
            </div>
          ))}
        </div>
        {children}
      </form>
    </>
  );
}

/** The deposit is reviewed and the lock acknowledged before the existing book is updated. */
export function DepositSheet({ vm }: { vm: TerminalViewModel }) {
  const liq = vm.liq;
  const review = liq.depositStep === "review";
  const done = liq.depositStep === "done";
  return (
    <LiquiditySheet key={liq.depositStep} title={liq.sheetTitle} rows={review ? liq.depositReview : done ? [] : liq.sheetRows}
      onClose={liq.closeSheet} onSubmit={review ? liq.submit : done ? liq.viewDeposits : liq.reviewDeposit}>
      {done ? <div className="lqm-done"><span className="lqm-ok" aria-hidden="true">✓</span><b>Deposit complete</b><p>{liq.depositDone}</p></div> : null}
      {review ? <>
        <div className="lqm-review-amount num"><small>Deposit (USDC)</small><b>{liq.depositAmount}</b></div>
        <label className="lqm-ack"><input type="checkbox" checked={liq.depositAck} onChange={liq.toggleAck} /><span>{liq.lockAck}</span></label>
        <button type="button" className="lq-back" onClick={liq.backDeposit}>Back</button>
      </> : null}
      {!review && !done ? <>
        <label className="fd-lbl" htmlFor="lq-amt">Amount, USDC</label>
        <div className="fd-amt"><input id="lq-amt" className="fd-input num" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00"
          aria-describedby="lq-avail lq-est" value={liq.amt} onChange={liq.onAmt} /></div>
        <div className="cr-chips">{liq.quick.map((chip) => <button key={chip.label} type="button" className="wk-o" onClick={chip.pick}>{chip.label}</button>)}
          <span id="lq-avail" className="cr-max num">{liq.avail}</span></div>
        <p id="lq-est" className="lq-est num" aria-live="polite">{liq.estEarn}</p>
      </> : null}
      <button type="submit" className="cta fd-cta" disabled={done ? false : review ? liq.confirmDis : liq.ctaDis}>
        {done ? "View Deposits" : review ? "Confirm Deposit" : liq.ctaDis ? liq.cta : "Review"}
      </button>
    </LiquiditySheet>
  );
}

/** Confirms leaving a locked vault before unlock, showing the penalty. */
export function EarlyExitSheet({ vm }: { vm: TerminalViewModel }) {
  const liq = vm.liq;
  return (
    <LiquiditySheet
      title={liq.exitTitle}
      rows={liq.exitRows}
      onClose={liq.closeSheet}
      onSubmit={liq.exitConfirm}
    >
      <button type="submit" className="cta fd-cta lq-exit-cta">
        Exit and Pay the Penalty
      </button>
    </LiquiditySheet>
  );
}
