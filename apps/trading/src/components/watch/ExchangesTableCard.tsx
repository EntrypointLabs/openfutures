import { InfoTip } from "@/components/common/InfoTip";
import { SnapshotButton } from "@/components/common/SnapshotButton";
import { AnalyticsDropdown, TableFooter } from "@/components/analytics/controls";
import { WatchEmpty, WatchSearch } from "./WatchSearch";
import type { ExchangeRow } from "./types";
import type { TerminalViewModel } from "@/terminal/types";

function VenueDetails({ venue }: { venue: ExchangeRow }) {
  return (
    <div className="vx-detail">
      <div className="vx-oi">
        <span className="vx-k">Open Interest (USD)</span>
        <b className="num">{venue.oiN}</b>
        <span className={`num vx-chg ${venue.chgCls}`}>{venue.chg} in 30 days</span>
        <svg
          className="vx-spark"
          viewBox="0 0 100 28"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={venue.area} fill={venue.sparkCol} fillOpacity="0.12" />
          <path
            d={venue.spark}
            fill="none"
            stroke={venue.sparkCol}
            strokeWidth="1.8"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="vx-k">Last 60 days</span>
      </div>
      <dl className="vx-grid num">
        <div>
          <dt>Turnover (x)</dt>
          <dd>{venue.turnN}</dd>
        </div>
        <div>
          <dt>Long / Short</dt>
          <dd className={venue.lsCls}>{venue.ls}</dd>
        </div>
        <div>
          <dt>Funding, APR (%)</dt>
          <dd className={venue.fundCls}>{venue.funding}</dd>
        </div>
        <div>
          <dt>Liquidations, 24h (USD)</dt>
          <dd>{venue.liqN}</dd>
        </div>
        <div>
          <dt>Top by Open Interest</dt>
          <dd className="vx-mk">
            <img className="logo xxs" src={venue.topOiLogo} alt="" />
            {venue.topOi}
          </dd>
        </div>
        <div>
          <dt>Top by Volume</dt>
          <dd className="vx-mk">
            <img className="logo xxs" src={venue.topVolLogo} alt="" />
            {venue.topVol}
          </dd>
        </div>
        <div>
          <dt>Chain</dt>
          <dd>{venue.chain}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{venue.updated}</dd>
        </div>
      </dl>
    </div>
  );
}
export function ExchangesTableCard({ vm }: { vm: TerminalViewModel }) {
  const rows: ExchangeRow[] = vm.exListP || [];
  return (
    <section className="mw-card snap-card mw-tablecard vx-card" data-snap="venues-table">
      <div className="mw-card-h">
        <div>
          <h2 className="h-i">
            Venues
            <InfoTip tip="Every connected venue ranked by open interest. Tap a row for turnover, positioning, funding and top markets." />
          </h2>
          <p>{vm.mwTableSub?.venues}</p>
        </div>
        <div className="mw-card-a">
          <WatchSearch label="Search venues" value={vm.xq} onChange={vm.onXq} />
          <SnapshotButton onClick={vm.mw?.snap} />
        </div>
      </div>
      <div className="wt wt-ex vx num" role="table" aria-label="Venues">
        <div className="wt-row wt-head" role="row">
          {[
            "Venue",
            "Markets",
            "Open Interest (USD)",
            "24h Volume (USD)",
            "30D (%)",
            "Share of OI (%)",
            "Funding Range, APR (%)",
            "Feed",
          ].map((label, index) => (
            <div key={label} role="columnheader">
              {index === 0 ? <span className="rk">#</span> : null}
              {label}
            </div>
          ))}
        </div>
        {rows.map((venue) => (
          <div key={venue.name} className={`wt-group ${venue.groupCls}`} role="rowgroup">
            <div className="wt-row" role="row">
              <div role="cell">
                <span className="rk num">{venue.num}</span>
                <button
                  type="button"
                  className="wasset vx-btn"
                  aria-expanded={venue.isOpen}
                  onClick={venue.toggle}
                >
                  <svg
                    className="wchev"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                  <img className="logo sm" src={venue.logo} data-venue="1" alt="" />
                  <span className="wname">
                    <b>
                      {venue.name}
                      <span className="lev xtype">{venue.type}</span>
                    </b>
                    <small className="mono">{venue.host}</small>
                  </span>
                </button>
              </div>
              <div role="cell">{venue.markets}</div>
              <div role="cell">{venue.oiN}</div>
              <div role="cell">{venue.volN}</div>
              <div role="cell" className={venue.d30Cls}>
                {venue.d30}
              </div>
              <div role="cell">
                <span className="vx-sh">
                  <em>{venue.shareN}</em>
                  <i>
                    <b style={{ width: `${venue.shareW}%`, background: venue.color }} />
                  </i>
                </span>
              </div>
              <div role="cell">
                <span className="down">{venue.fMinN}</span> to {venue.fMaxN}
              </div>
              <div role="cell">
                <span className="feedc r">
                  <span className={venue.dotCls} />
                  {venue.status}, <span className={venue.latCls}>{venue.lat}</span>
                </span>
              </div>
            </div>
            {venue.isOpen ? (
              <div role="row">
                <div role="cell" aria-colspan={8}>
                  <VenueDetails venue={venue} />
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="wlist vx-list">
        {rows.map((venue) => (
          <div key={venue.name} className={`vx-m ${venue.groupCls}`}>
            <button
              type="button"
              className="wrow-m xrow-m"
              aria-expanded={venue.isOpen}
              onClick={venue.toggle}
            >
              <img className="logo" src={venue.logo} data-venue="1" alt="" />
              <span className="wname">
                <b>
                  {venue.name}
                  <span className="lev xtype">{venue.type}</span>
                </b>
                <small className="num">
                  {venue.markets} markets, {venue.shareN}% of OI
                </small>
              </span>
              <span className="mk-price num">
                <span>{venue.oi}</span>
                <small className={venue.chgCls}>{venue.chg}</small>
              </span>
            </button>
            {venue.isOpen ? <VenueDetails venue={venue} /> : null}
          </div>
        ))}
      </div>
      {vm.noEx ? (
        <WatchEmpty title="No venues match">Try Binance, DEX or Arbitrum.</WatchEmpty>
      ) : null}
      <TableFooter pager={vm.exPager} scrollTarget=".mw-card">
        <AnalyticsDropdown control={vm.mw?.tdd?.vtype} />
      </TableFooter>
    </section>
  );
}
