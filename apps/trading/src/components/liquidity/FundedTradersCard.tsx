import { InfoTip } from "@/components/common/InfoTip";
import { AnalyticsDropdown, TableFooter } from "@/components/analytics/controls";
import { SnapshotButton } from "@/components/common/SnapshotButton";
import type { TerminalViewModel } from "@/terminal/types";

/** Every account the vaults fund, sortable by size, PnL or days, with drawdown bars. */
export function FundedTradersCard({ vm }: { vm: TerminalViewModel }) {
  const liq = vm.liq;
  return (
    <section className="mw-card snap-card lq-traders" data-snap="liquidity-traders">
      <div className="mw-card-h">
        <div>
          <h2 className="h-i">
            Funded Traders
            <InfoTip tip="Every account the vaults fund" />
          </h2>
          <p>Accounts funded by the vaults, ranked by account size.</p>
        </div>
        <SnapshotButton onClick={vm.mw?.snap} />
      </div>
      <div className="lq-scroll">
        <div className="pv-table num" role="table" aria-label="Funded traders">
          <div className="pv-tr pv-th" role="row">
            <span role="columnheader">
              <span className="rk">#</span>Trader
            </span>
            {liq.traderHeads.map((head) => <span key={head.label} role="columnheader" aria-sort={head.sortDir}><button type="button" className={head.cls} onClick={head.pick}>{head.label}<i aria-hidden="true">{head.arrow}</i></button></span>)}
            <span role="columnheader">Status</span>
          </div>
          {liq.traders.map((trader, i) => (
            <div key={i} className={trader.rowCls} role="row">
              <span className="pv-name" role="cell">
                <span className="rk num">{trader.num}</span>
                <b>{trader.name}</b>
              </span>
              <span role="cell">{trader.size}</span>
              <span role="cell" className={trader.pnlCls}>
                {trader.pnl}
              </span>
              <span role="cell" className="pv-dd">
                <i className={trader.ddCls}>
                  <b style={{ width: trader.ddW + "%" }} />
                </i>
                <em>{trader.dd}</em>
              </span>
              <span role="cell">{trader.days}</span>
              <span role="cell" className={trader.stCls}>
                {trader.st}
              </span>
            </div>
          ))}
        </div>
      </div>
      <TableFooter pager={liq.tradersPager}><AnalyticsDropdown control={liq.traderSizeControl} /></TableFooter>
    </section>
  );
}
