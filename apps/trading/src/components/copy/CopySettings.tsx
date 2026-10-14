import { useRef } from "react";
import { useDialogFocus } from "@/components/common/useDialogFocus";
import type { CopyDetailModel } from "@/terminal/copy/viewModel";

export function CopySettings({ detail }: { detail: CopyDetailModel }) {
  const { form } = detail;
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef, form.close, "input");
  return (
    <>
      <button
        type="button"
        className="copy-scrim"
        aria-label="Close copy settings"
        tabIndex={-1}
        onClick={form.close}
      />
      <section
        ref={dialogRef}
        className="copy-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={form.title}
        tabIndex={-1}
      >
        <header>
          <h2>{form.title}</h2>
          <button
            type="button"
            className="copy-icon"
            aria-label="Close copy settings"
            onClick={form.close}
          >
            ×
          </button>
        </header>
        <label className="copy-field-label">Position sizing</label>
        <div className="copy-segment" role="group" aria-label="Position sizing">
          {form.sizing.map((option) => (
            <button
              key={option.label}
              type="button"
              className={option.on ? "is-on" : ""}
              aria-pressed={option.on}
              onClick={option.pick}
            >
              {option.label}
            </button>
          ))}
        </div>
        {form.settings.mode === "mult" && <Field label="Multiplier (x)" field="mult" form={form} />}
        <Field label="Allocation (USDC)" field="alloc" form={form} />
        <div className="copy-amount-options">
          {form.percentages.map((option) => (
            <button type="button" key={option.label} onClick={option.pick}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="copy-form-grid">
          <Field label="Max Leverage (x)" field="lev" form={form} />
          <Field label="Max Drawdown (%)" field="dd" form={form} />
        </div>
        <label className="copy-field-label">Positions to copy</label>
        <div className="copy-segment" role="group" aria-label="Positions to copy">
          {form.openPositions.map((option) => (
            <button
              key={option.label}
              type="button"
              className={option.on ? "is-on" : ""}
              aria-pressed={option.on}
              onClick={option.pick}
            >
              {option.label}
            </button>
          ))}
        </div>
        <dl className="copy-key-values num">
          {form.rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="copy-primary" disabled={form.disabled} onClick={form.save}>
          {detail.followed ? "Save Copy Settings" : "Start Copying"}
        </button>
        {detail.followed && (
          <div className="copy-form-secondary">
            <button type="button" disabled={form.pauseDisabled} onClick={form.pause}>
              {form.pauseLabel}
            </button>
            <button type="button" className="copy-danger" onClick={form.stop}>
              Stop Copying
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function Field({
  label,
  field,
  form,
}: {
  label: string;
  field: "alloc" | "mult" | "lev" | "dd";
  form: CopyDetailModel["form"];
}) {
  const id = "copy-settings-" + field;
  return (
    <div className="copy-field">
      <label className="copy-field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="num"
        type="text"
        inputMode="decimal"
        value={form.settings[field]}
        onChange={form.onField(field)}
        aria-invalid={!!form.errors[field]}
        aria-describedby={form.errors[field] ? id + "-error" : undefined}
      />
      {form.errors[field] && (
        <small className="copy-error" id={id + "-error"}>
          {form.errors[field]}
        </small>
      )}
    </div>
  );
}
