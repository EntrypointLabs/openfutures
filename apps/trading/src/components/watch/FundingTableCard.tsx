import { InfoTip } from "@/components/common/InfoTip";
import { SnapshotButton } from "@/components/common/SnapshotButton";
import { AnalyticsDropdown, AnalyticsSegment, TableFooter } from "@/components/analytics/controls";
import { WatchEmpty, WatchSearch } from "./WatchSearch";
import { ScrollRegion } from "@/components/common/ScrollRegion";
import type { FundingRow, VenueLogo } from "./types";
import type { TerminalViewModel } from "@/terminal/types";

function CarryLegs({ row }: { row: FundingRow }) {
  return (
    <>
      <span>
        Long on <img className="logo xxs" src={row.longLogo} data-venue="1" alt="" />
        {row.longName}
      </span>
      <span>
        Short on <img className="logo xxs" src={row.shortLogo} data-venue="1" alt="" />
        {row.shortName}
      </span>
    </>
  );
}
export function FundingTableCard({ vm }: { vm: TerminalViewModel }) {
  const rows: FundingRow[] = vm.fmRowsP || [];
  const heads: VenueLogo[] = vm.fmHead || [];
  return (
    <section className="mw-card snap-card mw-tablecard" data-snap="funding-grid">
      <div className="mw-card-h">
        <div>
          <h2 className="h-i">
            Funding by Market and Venue (%)
            <InfoTip tip="Funding ranked by spread. Go long where funding is cheapest and short where it is highest to collect it. Carry is an annual estimate on 10,000 USD, before fees and price risk." />
          </h2>
          <p>{vm.mwTableSub?.funding}</p>
        </div>
        <div className="mw-card-a">
          <WatchSearch label="Search markets" value={vm.fq} onChange={vm.onFq} />
          <SnapshotButton onClick={vm.mw?.snap} />
        </div>
      </div>
      <div className="fm-cards" role="list" aria-label="Funding by market">
        {rows.map((row) => (
          <div key={row.sym} className={`fmc ${row.openCls}`} role="listitem">
            <button
              type="button"
              className="fmc-tap"
              aria-expanded={row.isOpen}
              onClick={row.toggle}
            >
              <span className="fmc-top">
                <span className="rk num">{row.num}</span>
                <img className="logo" src={row.logo} alt="" />
                <b>{row.sym}-PERP</b>
                <span className="fmc-spread num">
                  <small>Spread (%)</small>
                  {row.spread}
                </span>
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
              </span>
              <span className="fmc-carry">
                <CarryLegs row={row} />
                <span className="fmc-c10 num">Carry on 10K (USD): {row.carry}</span>
              </span>
            </button>
            {row.isOpen ? (
              <div className="fmc-rates num">
                {(row.cells || []).map((cell) => (
                  <span key={cell.vn} className={cell.mcls}>
                    <img className="logo" src={cell.logo} data-venue="1" alt={cell.vn} />
                    <span className="fchip" style={{ background: cell.bg, color: cell.fg }}>
                      {cell.v}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <ScrollRegion className="xscroll fm-wrap" label="Funding rates table">
        <div className="fm num" role="table" aria-label="Funding by market and exchange">
          <div className="fm-row fm-head" role="row">
            <div role="columnheader">
              <span className="rk">#</span>Market
            </div>
            {heads.map((venue) => (
              <div key={venue.name} role="columnheader">
                <img className="logo xs" src={venue.logo} alt="" />
                <span>{venue.name} (%)</span>
              </div>
            ))}
            <div role="columnheader">Spread (%)</div>
            <div role="columnheader">Carry on 10K (USD)</div>
            <div role="columnheader">Best Carry</div>
          </div>
          {rows.map((row) => (
            <div key={row.sym} className="fm-row" role="row">
              <div role="cell">
                <span className="xcell">
                  <span className="rk num">{row.num}</span>
                  <img className="logo xs" src={row.logo} alt="" />
                  <b>{row.sym}</b>
                </span>
              </div>
              {(row.cells || []).map((cell) => (
                <div key={cell.vn} role="cell">
                  <span className="fchip" style={{ background: cell.bg, color: cell.fg }}>
                    {cell.v}
                  </span>
                </div>
              ))}
              <div role="cell">
                <b>{row.spread}</b>
              </div>
              <div role="cell">{row.carry}</div>
              <div role="cell">
                <span className="carry2">
                  <CarryLegs row={row} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </ScrollRegion>
      {vm.noF ? (
        <WatchEmpty title="No markets match">Try a ticker like ETH, US500 or Gold.</WatchEmpty>
      ) : null}
      <TableFooter pager={vm.fmPager} scrollTarget=".mw-card">
        <AnalyticsSegment control={vm.mw?.tdd?.rate} />
        <AnalyticsDropdown control={vm.mw?.tdd?.fcat} />
      </TableFooter>
    </section>
  );
}
