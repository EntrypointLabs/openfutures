import { Fragment } from "react";
import { IconToggle } from "@/components/common/IconToggle";
import { InfoTip } from "@/components/common/InfoTip";
import { ExchangesView } from "@/components/watch/ExchangesView";
import { FundingView } from "@/components/watch/FundingView";
import { MarketsView } from "@/components/watch/MarketsView";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import type { AnalyticsCardViewModel } from "@/terminal/analytics";
import type { Kpi } from "@/components/watch/types";
import { parseStyle } from "@/lib/style";
import type { TerminalViewModel } from "@/terminal/types";

export function WatchPage({ vm }: { vm: TerminalViewModel }) {
  const kpis: Kpi[] = vm.mw?.kpis || [];
  const cards: AnalyticsCardViewModel[] = vm.mw?.cards || [];
  return (
    <section id="main" className="page page-watch" aria-label="Market Watch" tabIndex={-1}>
      <div className="page-inner">
        <header className="page-head wh">
          <div>
            <h1>Market Watch</h1>
            <p className="feed num">
              <span className={vm.feed?.dotCls} />
              {vm.feed?.text}
            </p>
          </div>
          <div className="wh-r">
            <IconToggle items={vm.wviews} label="View" className="seg-sm wviews" />
          </div>
        </header>
        {/* Phone-only full-width copy of the view toggle. */}
        <IconToggle items={vm.wviews} label="View" className="mw-sticky" />
        <div className="mw-kpis">
          {kpis.map((kpi, i) => (
            <Fragment key={i}>
              <div className="mw-kpi">
                <span className="kp-l">
                  {kpi?.label}
                  <InfoTip tip={kpi?.help} />
                </span>
                <b className="num">{kpi?.value}</b>
                {kpi != null && kpi.hasSpark ? (
                  <>
                    <svg
                      className="kp-spark"
                      viewBox="0 0 100 24"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path
                        d={kpi?.spark}
                        strokeWidth="1.6"
                        vectorEffect="non-scaling-stroke"
                        style={parseStyle(`fill: none; stroke: ${kpi?.sparkCol ?? ""}`)}
                      />
                    </svg>
                  </>
                ) : null}
                <small className="num">
                  {kpi != null && kpi.hasChg ? (
                    <>
                      <em className={kpi?.chgCls}>{kpi?.chg}</em>{" "}
                    </>
                  ) : null}
                  {kpi?.sub}
                </small>
              </div>
            </Fragment>
          ))}
        </div>
        <div className="ac-grid">
          {cards.map((card) => (
            <AnalyticsCard key={card.id} card={card} onSnapshot={vm.mw?.snap} />
          ))}
        </div>
        {vm.viewMarkets ? <MarketsView vm={vm} /> : null}
        {vm.viewExchanges ? <ExchangesView vm={vm} /> : null}
        {vm.viewFunding ? <FundingView vm={vm} /> : null}
      </div>
    </section>
  );
}
