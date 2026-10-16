import { useRef, type ReactNode } from "react";
import { scrollBehavior } from "@/components/common/motion";

/** Page controls as produced by the view model's `paginate`. */
export interface PagerModel {
  text?: string;
  prev?: () => void;
  next?: () => void;
  prevDis?: boolean;
  nextDis?: boolean;
  multi?: boolean;
  nums?: { label: string; cls: string; cur: string; go: () => void }[];
}

/** Table pager (`.pgx`); with `scrollTarget`, a page change scrolls that ancestor back into view. */
export function Pager({
  pager,
  scrollTarget,
  compact = false,
  children,
}: {
  pager?: PagerModel;
  scrollTarget?: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const turn = (go?: () => void) => () => {
    go?.();
    if (!scrollTarget) {
      return;
    }
    requestAnimationFrame(() => {
      const target = ref.current?.closest<HTMLElement>(scrollTarget);
      if (!target) {
        return;
      }
      const scroller = target.closest<HTMLElement>(".page");
      const top = scroller ? Math.max(0, scroller.getBoundingClientRect().top) : 0;
      if (target.getBoundingClientRect().top < top) {
        target.scrollIntoView({ block: "start", behavior: scrollBehavior() });
      }
    });
  };
  const numbers = pager?.nums || [];
  const current = numbers.findIndex((page) => page.cur === "page");
  const visible = new Set([0, 1, 2, 3, numbers.length - 1, current - 1, current, current + 1]);
  let previous = -1;
  return (
    <div className="pgx num" ref={ref}>
      {children ? <div className="ac-tfl">{children}</div> : null}
      <span className="pgx-t">{pager?.text}</span>
      <span className="pgx-c">
        <button
          type="button"
          className="pgx-a"
          aria-label="Previous page"
          disabled={!!pager?.prevDis}
          onClick={turn(pager?.prev)}
        >
          <Chevron d="m15 18-6-6 6-6" />
        </button>
        {numbers.flatMap((num, index) => {
          if (compact && !visible.has(index)) return [];
          const gap = compact && previous >= 0 && index - previous > 1;
          previous = index;
          return [
            gap ? (
              <span key={`gap-${index}`} className="pgx-gap" aria-hidden="true">
                …
              </span>
            ) : null,
            <button
              key={index}
              type="button"
              className={num.cls}
              aria-current={num.cur === "page" ? "page" : undefined}
              onClick={turn(num.go)}
            >
              {num.label}
            </button>,
          ];
        })}
        <button
          type="button"
          className="pgx-a"
          aria-label="Next page"
          disabled={!!pager?.nextDis}
          onClick={turn(pager?.next)}
        >
          <Chevron d="m9 18 6-6-6-6" />
        </button>
      </span>
    </div>
  );
}

function Chevron({ d }: { d: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      style={{ fill: "none", stroke: "currentColor" }}
    >
      <path d={d} />
    </svg>
  );
}
