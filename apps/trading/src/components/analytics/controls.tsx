import type { ReactNode } from "react";
import { Dropdown } from "@/components/common/Dropdown";
import { Pager, type PagerModel } from "@/components/common/Pager";

export interface AnalyticsDropdownControl {
  label: string;
  cur: string;
  ic?: string;
  open: boolean;
  openStr?: "true" | "false";
  btnCls?: string;
  toggle: () => void;
  close: () => void;
  opts: { label: string; cls?: string; sel: "true" | "false"; pick: () => void }[];
}

export interface AnalyticsSegmentControl {
  label: string;
  items: {
    ic?: string;
    txt?: string;
    aria?: string;
    cls: string;
    pressed: "true" | "false";
    pick: () => void;
  }[];
}

export function AnalyticsDropdown({ control }: { control?: AnalyticsDropdownControl }) {
  return control ? <Dropdown dd={control} variant="analytics" icon={control.ic} /> : null;
}

export function AnalyticsSegment({ control }: { control?: AnalyticsSegmentControl }) {
  if (!control) return null;
  return (
    <div className="ac-seg" role="group" aria-label={control.label}>
      {control.items.map((item) => (
        <button
          key={item.aria || item.txt}
          type="button"
          className={item.cls}
          aria-pressed={item.pressed === "true"}
          aria-label={item.aria}
          title={item.aria}
          onClick={item.pick}
        >
          {item.ic ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d={item.ic} />
            </svg>
          ) : null}
          {item.txt ? <span>{item.txt}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function TableFooter({
  pager,
  children,
  scrollTarget,
}: {
  pager?: PagerModel;
  children?: ReactNode;
  scrollTarget?: string;
}) {
  return (
    <Pager pager={pager} compact scrollTarget={scrollTarget}>
      {children}
    </Pager>
  );
}
