import type { ChangeEventHandler, ReactNode } from "react";

export function WatchSearch({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <label className="search wsearch">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
        style={{ fill: "none", stroke: "currentColor" }}
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        placeholder={label}
        aria-label={label}
        enterKeyHint="search"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value ?? ""}
        onChange={onChange}
      />
    </label>
  );
}

export function WatchEmpty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="dock-empty" role="status">
      <b>{title}</b>
      <span>{children}</span>
    </div>
  );
}
