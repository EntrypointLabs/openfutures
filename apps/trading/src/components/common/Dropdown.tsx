import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export interface DropdownOption {
  label?: string;
  count?: string;
  logo?: string;
  hasLogo?: boolean;
  cls?: string;
  sel?: string;
  pick?: () => void;
}

/** A dropdown as produced by the view model's `buildDropdown`. */
export interface DropdownModel {
  label?: string;
  cur?: string;
  open?: boolean;
  openStr?: string;
  btnCls?: string;
  toggle?: () => void;
  close?: () => void;
  opts?: DropdownOption[];
}

/** Listbox dropdown (`.dd`) with arrow-key, Home/End and Escape support. */
export function Dropdown({
  dd,
  variant = "standard",
  icon,
}: {
  dd?: DropdownModel;
  variant?: "standard" | "analytics";
  icon?: string;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const opts = dd?.opts || [];
  const selected = Math.max(
    0,
    opts.findIndex((opt) => opt.sel === "true"),
  );
  const [active, setActive] = useState(selected);
  const open = !!dd?.open;
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setActive(selected);
      menuRef.current
        ?.querySelectorAll<HTMLElement>('[role="option"]')
        [selected]?.focus({ preventScroll: true });
    } else if (!open && wasOpen.current) {
      const focused = document.activeElement;
      if (!focused || focused === document.body || menuRef.current?.contains(focused)) {
        btnRef.current?.focus({ preventScroll: true });
      }
    }
    wasOpen.current = open;
  }, [open, selected]);

  const focusOption = (index: number) => {
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
    if (!items || !items.length) {
      return;
    }
    const next = (index + items.length) % items.length;
    setActive(next);
    items[next].focus();
  };

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusOption(active + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusOption(active - 1);
        break;
      case "Home":
        event.preventDefault();
        focusOption(0);
        break;
      case "End":
        event.preventDefault();
        focusOption(opts.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        dd?.close?.();
        btnRef.current?.focus();
        break;
      case "Tab":
        dd?.close?.();
        break;
    }
  };

  const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      dd?.toggle?.();
    } else if (open && event.key === "Escape") {
      event.preventDefault();
      dd?.close?.();
    }
  };

  return (
    <div className={variant === "analytics" ? "dd ac-dd" : "dd"}>
      <button
        ref={btnRef}
        type="button"
        className={dd?.btnCls}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={variant === "analytics" ? dd?.label : undefined}
        onClick={dd?.toggle}
        onKeyDown={onButtonKey}
      >
        {variant === "analytics" ? (
          <>
            {icon ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={icon} />
              </svg>
            ) : null}
            <span>{dd?.cur}</span>
          </>
        ) : (
          <>
            <span className="dd-l">{dd?.label}</span>
            <b>{dd?.cur}</b>
          </>
        )}
        <svg
          className="dd-chev"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ fill: "none", stroke: "currentColor" }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="dd-scrim"
            aria-label={variant === "analytics" ? `Close ${dd?.label || "menu"}` : "Close"}
            tabIndex={-1}
            onClick={dd?.close}
          />
          <div
            ref={menuRef}
            className={variant === "analytics" ? "dd-menu ac-menu" : "dd-menu"}
            role="listbox"
            aria-label={dd?.label}
            onKeyDown={onMenuKey}
          >
            {opts.map((opt, i) => (
              <button
                key={i}
                type="button"
                role="option"
                aria-selected={opt.sel === "true"}
                tabIndex={i === active ? 0 : -1}
                className={opt.cls}
                onClick={opt.pick}
                onFocus={() => setActive(i)}
              >
                {opt.hasLogo ? <img className="logo" src={opt.logo} data-venue="1" alt="" /> : null}
                <span>{opt.label}</span>
                <em className="num">{opt.count}</em>
                <svg
                  className="dd-tick"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{ fill: "none", stroke: "currentColor" }}
                >
                  <path d="m5 12 5 5 9-10" />
                </svg>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
