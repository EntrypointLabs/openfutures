import { useRef } from "react";
import { useDialogFocus } from "@/components/common/useDialogFocus";
import type { CopyDetailModel } from "@/terminal/copy/viewModel";

export function CopyPositionDetail({
  position,
}: {
  position: NonNullable<CopyDetailModel["positionDetail"]>;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef, position.close, "button");
  return (
    <>
      <button
        type="button"
        className="copy-scrim"
        tabIndex={-1}
        aria-label="Close position details"
        onClick={position.close}
      />
      <section
        ref={dialogRef}
        className="copy-sheet copy-position-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={position.title + " position"}
        tabIndex={-1}
      >
        <header>
          <span className="av">
            <img className="logo" src={position.logo} alt="" />
            <img className="av-badge" src={position.venueLogo} alt="" />
          </span>
          <h2>
            {position.title}
            <small>
              <span className={`dir ${position.sideCls}`}>{position.side}</span> {position.lev} ·{" "}
              {position.venue}
            </small>
          </h2>
          <button
            type="button"
            className="copy-icon"
            aria-label="Close position details"
            onClick={position.close}
          >
            ×
          </button>
        </header>
        <div className="copy-position-pnl num">
          <small>{position.heroLabel} (USDC)</small>
          <b className={position.pnlCls}>{position.pnl}</b>
          <span className={position.pnlCls}>{position.roe}</span>
        </div>
        <dl className="copy-key-values num">
          {position.rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
        <div className="copy-sheet-actions">
          <button type="button" className="copy-secondary" onClick={position.goMarket}>
            Open {position.title}
          </button>
          <button
            type="button"
            className={position.danger ? "copy-danger" : "copy-primary"}
            onClick={position.action}
          >
            {position.actionLabel}
          </button>
        </div>
      </section>
    </>
  );
}
