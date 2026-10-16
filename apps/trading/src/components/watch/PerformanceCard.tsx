import { Fragment } from "react";
import { ChartTooltip } from "@/components/common/ChartTooltip";
import { AnalyticsDropdown } from "@/components/analytics/controls";
import { InfoTip } from "@/components/common/InfoTip";
import { SnapshotButton } from "@/components/common/SnapshotButton";
import { Watermark } from "@/components/common/Watermark";
import type { Perf } from "@/components/watch/types";
import { parseStyle } from "@/lib/style";
import type { TerminalViewModel } from "@/terminal/types";

export function PerformanceCard({ vm }: { vm: TerminalViewModel }) {
  const perf: Perf | undefined = vm.mw?.perf;
  const period = (perf?.ranges || []).find((range) => range.pressed === "true")?.label;
  return (
    <section className="mw-card snap-card pf" data-snap="performance">
      <div className="mw-card-h">
        <div>
          <h2 className="h-i">
            Market Performance (%)
            <InfoTip tip="Price change of each market over the selected period. Tap a row in the table to show or hide its line." />
          </h2>
          <p>Price change over time. Tap a market row to hide or show its line.</p>
        </div>
        <SnapshotButton onClick={vm.mw?.snap} />
      </div>
      <div className="pf-body">
        <div className="pf-chart">
          <div className="pf-y num" aria-hidden="true">
            {(perf?.yTicks || []).map((yTick, i) => (
              <Fragment key={i}>
                <span style={parseStyle(`top: ${yTick?.y ?? ""}%`)}>{yTick?.label}</span>
              </Fragment>
            ))}
          </div>
          <div className="pf-area">
            <p className="sr">
              Line chart of each market's price change over {period ?? "the selected period"},{" "}
              {perf?.asOf}. The returns table lists the values.
            </p>
            <Watermark />
            <div className="mwc-gridy" aria-hidden="true">
              {(perf?.yTicks || []).map((yTick, i) => (
                <Fragment key={i}>
                  <i style={parseStyle(`top: ${yTick?.y ?? ""}%`)} />
                </Fragment>
              ))}
            </div>
            <svg
              className="mwc-svg"
              viewBox="0 0 1000 280"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {(perf?.lines || []).map((line, i) => (
                <Fragment key={i}>
                  <path
                    d={line?.d}
                    strokeWidth={line?.w}
                    strokeOpacity={line?.op}
                    vectorEffect="non-scaling-stroke"
                    style={parseStyle(`fill: none; stroke: ${line?.color ?? ""}`)}
                  />
                </Fragment>
              ))}
            </svg>
            <ChartTooltip tip={perf?.tip} head={[perf?.tip?.date, "vs start"]} />
            <div
              className="mwc-hit"
              onPointerMove={perf?.move}
              onPointerDown={perf?.move}
              onPointerLeave={perf?.leave}
            />
          </div>
          <div className="pf-x num" aria-hidden="true">
            {(perf?.xTicks || []).map((xTick, i) => (
              <Fragment key={i}>
                <span className={xTick?.cls} style={parseStyle(`left: ${xTick?.x ?? ""}%`)}>
                  {xTick?.label}
                </span>
              </Fragment>
            ))}
          </div>
        </div>
        <div className="pf-table num" role="table" aria-label="Returns by market">
          <div className="pf-tr pf-th" role="row">
            <span role="columnheader">
              <span className="rk">#</span>Market
            </span>
            {(perf?.heads || []).map((head, i) => {
              const sorted = /\bis-on\b/.test(head.cls || "");
              return (
                <span
                  key={i}
                  role="columnheader"
                  aria-sort={sorted ? (head.arrow === "▾" ? "descending" : "ascending") : "none"}
                >
                  <button type="button" className={head.cls} onClick={head.pick}>
                    {head.label}
                    <i aria-hidden="true">{head.arrow}</i>
                  </button>
                </span>
              );
            })}
          </div>
          {(perf?.rows || []).map((row, i) => (
            <div
              key={i}
              role="row"
              className={row.cls}
              onPointerEnter={row.enter}
              onPointerLeave={row.leave}
            >
              <span role="cell">
                <button
                  type="button"
                  className="pf-name pf-toggle"
                  aria-pressed={row.pressed}
                  onClick={row.toggle}
                >
                  <span className="rk num">{row.num}</span>
                  <i style={parseStyle(`background: ${row.color ?? ""}`)} />
                  <img className="logo" src={row.logo} alt="" />
                  {row.sym}
                </button>
              </span>
              {(row.cells || []).map((cell, i2) => (
                <span key={i2} role="cell" className={cell.cls}>
                  {cell.v}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="ac-f ac-pf">
        <AnalyticsDropdown control={perf?.per} />
        <span className="ac-asof">{perf?.asOf}</span>
      </div>
    </section>
  );
}
