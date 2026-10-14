import { Fragment } from "react";
import { AnalyticsDropdown, TableFooter } from "@/components/analytics/controls";
import { InfoTip } from "@/components/common/InfoTip";
import { SnapshotButton } from "@/components/common/SnapshotButton";
import { MarketsTable } from "@/components/watch/MarketsTable";
import { WatchEmpty, WatchSearch } from "@/components/watch/WatchSearch";
import type { MarketRow } from "@/components/watch/types";
import { parseStyle } from "@/lib/style";
import type { TerminalViewModel } from "@/terminal/types";

export function MarketsTableCard({ vm }: { vm: TerminalViewModel }) {
  const rows: MarketRow[] = vm.wrowsP || [];
  return (
    <section className="mw-card snap-card mw-tablecard" data-snap="markets-table">
      <div className="mw-card-h">
        <div>
          <h2 className="h-i">
            Markets
            <InfoTip tip="Every perpetual market across venues. Sort by any column and tap a row for its details." />
          </h2>
          <p>{vm.mwTableSub?.markets}</p>
        </div>
        <div className="mw-card-a">
          <WatchSearch label="Search markets" value={vm.wq} onChange={vm.onWq} />
          <SnapshotButton onClick={vm.mw?.snap} />
        </div>
      </div>
      <MarketsTable vm={vm} />
      <div className="wlist pc-list">
        {rows.map((wrowsPItem, i) => (
          <Fragment key={i}>
            <button type="button" className="wrow-m" onClick={wrowsPItem?.toggle}>
              <span className="av">
                <img className="logo" src={wrowsPItem?.logo} alt="" />
                <span className="av-badges">
                  {(wrowsPItem?.venuesM || []).map((venuesMItem, i2) => (
                    <Fragment key={i2}>
                      <img
                        className="av-badge"
                        src={venuesMItem?.logo}
                        data-venue="1"
                        alt={venuesMItem?.name}
                        title={venuesMItem?.name}
                      />
                    </Fragment>
                  ))}
                </span>
              </span>
              <span className="wname">
                <b className="hm-t2">
                  <span className="hm-tk">{wrowsPItem?.sym}-PERP</span>
                  <span className="lev">{wrowsPItem?.lev}</span>
                </b>
                <small className="num">
                  <span>{wrowsPItem?.vol} Vol</span>
                </small>
              </span>
              <svg
                className="spark"
                viewBox="0 0 100 32"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d={wrowsPItem?.spark}
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  style={parseStyle(`fill: none; stroke: ${wrowsPItem?.sparkColor ?? ""}`)}
                />
              </svg>
              <span className="mk-price num">
                <span>${wrowsPItem?.price}</span>
                <small className={wrowsPItem?.dir}>{wrowsPItem?.chgText}</small>
              </span>
            </button>
          </Fragment>
        ))}
      </div>
      {vm.noW ? (
        <WatchEmpty title="No markets match">Try a ticker like ETH, US500 or Gold.</WatchEmpty>
      ) : null}
      <TableFooter pager={vm.wrowsPager} scrollTarget=".mw-card">
        <AnalyticsDropdown control={vm.mw?.tdd?.mcat} />
      </TableFooter>
    </section>
  );
}
