import { Fragment } from "react";
import { scrollBehavior } from "@/components/common/motion";
import { MarketDetail } from "@/components/watch/MarketDetail";
import type { MarketRow } from "@/components/watch/types";
import { parseStyle } from "@/lib/style";
import type { TerminalViewModel } from "@/terminal/types";

const COLUMNS = 10;

interface SortModel {
  cls?: string;
  icon?: string;
  go?: () => void;
}

function SortHeader({ sort, label }: { sort?: SortModel; label: string }) {
  const active = !!sort?.cls && /\bis-active\b/.test(sort.cls);
  const descending = sort?.icon === "m6 9 6 6 6-6";
  return (
    <div
      role="columnheader"
      aria-sort={active ? (descending ? "descending" : "ascending") : "none"}
    >
      <button type="button" className={`sort-btn ${sort?.cls ?? ""}`} onClick={sort?.go}>
        {label}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ fill: "none", stroke: "currentColor" }}
        >
          <path d={sort?.icon} />
        </svg>
      </button>
    </div>
  );
}

function toggleRow(button: HTMLElement, isOpen: boolean | undefined, toggle?: () => void) {
  toggle?.();
  if (isOpen) {
    return;
  }
  const group = button.closest(".wt-group");
  requestAnimationFrame(() => {
    const detail = group?.querySelector<HTMLElement>(".wt-detail");
    detail?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
  });
}

export function MarketsTable({ vm }: { vm: TerminalViewModel }) {
  const rows: MarketRow[] = vm.wrowsP || [];
  return (
    <div className="wt wt2 num" role="table" aria-label="Markets">
      <div className="wt-row wt-head" role="row">
        <div role="columnheader">
          <span className="rk">#</span>Market
        </div>
        <SortHeader sort={vm.ws?.price} label="Price (USD)" />
        <SortHeader sort={vm.ws?.chg} label="24h change (%)" />
        <div role="columnheader">7 Days</div>
        <SortHeader sort={vm.ws?.vol} label="24h Volume (USD)" />
        <SortHeader sort={vm.ws?.oi} label="Open Interest (USD)" />
        <div role="columnheader">Open Interest by Venue (%)</div>
        <SortHeader sort={vm.ws?.fund} label="Funding, 1h (%)" />
        <div role="columnheader">Venues</div>
        <div role="columnheader">
          <span className="sr">Trade</span>
        </div>
      </div>
      {rows.map((row, i) => {
        return (
          <Fragment key={i}>
            <div className={`wt-group ${row?.groupCls ?? ""}`} role="rowgroup">
              <div className="wt-row" role="row">
                <div role="cell">
                  <span className="rk num">{row?.num}</span>
                  <button
                    type="button"
                    className="wasset"
                    aria-expanded={row?.isOpen}
                    onClick={(event) => toggleRow(event.currentTarget, row?.isOpen, row?.toggle)}
                  >
                    <svg
                      className="wchev"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      style={{ fill: "none", stroke: "currentColor" }}
                    >
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                    <img className="logo sm" src={row?.logo} alt="" />
                    <span className="wname">
                      <b>
                        {row?.sym}
                        <span className="lev">{row?.lev}</span>
                      </b>
                      <small>
                        {row?.name}
                        <span className="cat">{row?.cat}</span>
                      </small>
                    </span>
                  </button>
                </div>
                <div role="cell">
                  <span className={row?.flash}>{row?.price}</span>
                </div>
                <div role="cell" className={row?.dir}>
                  {row?.chgN}
                </div>
                <div role="cell">
                  <svg
                    className="spark"
                    viewBox="0 0 100 32"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path
                      d={row?.spark}
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      style={parseStyle(`fill: none; stroke: ${row?.sparkColor ?? ""}`)}
                    />
                  </svg>
                </div>
                <div role="cell">{row?.volN}</div>
                <div role="cell">{row?.oiN}</div>
                <div role="cell">
                  <span className="oibar" aria-hidden="true">
                    {(row?.split || []).map((splitItem, i2) => (
                      <Fragment key={i2}>
                        <i
                          style={parseStyle(
                            `width: ${splitItem?.w ?? ""}%; background: ${splitItem?.c ?? ""}`,
                          )}
                        />
                      </Fragment>
                    ))}
                  </span>
                  <small className="oitop">
                    <img className="logo xxs" src={row?.topLogo} data-venue="1" alt="" />
                    {row?.topTextN}
                  </small>
                </div>
                <div role="cell" className={row?.fundCls}>
                  {row?.fundN}
                </div>
                <div role="cell">
                  <span className="stack">
                    {(row?.venues || []).map((venue, i2) => (
                      <Fragment key={i2}>
                        <img
                          className="logo"
                          src={venue?.logo}
                          data-venue="1"
                          alt={venue?.name}
                          title={venue?.name}
                        />
                      </Fragment>
                    ))}
                  </span>
                </div>
                <div role="cell">
                  <button type="button" className="mini" onClick={row?.trade}>
                    Trade
                  </button>
                </div>
              </div>
              {row?.isOpen ? (
                <div className="wt-detail" role="row">
                  <div role="cell" aria-colspan={COLUMNS}>
                    <MarketDetail vm={vm} actions />
                  </div>
                </div>
              ) : null}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
