import { InfoTip } from "@/components/common/InfoTip";
import { ChartCard } from "@/components/liquidity/ChartCard";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { ChartPlot, HoverBand } from "@/components/liquidity/ChartPlot";
import { FundedTradersCard } from "@/components/liquidity/FundedTradersCard";
import type { TerminalViewModel } from "@/terminal/types";

/** Liquidity analytics: headline tiles, vault charts, funded trader charts and table. */
export function AnalyticsView({ vm }: { vm: TerminalViewModel }) {
  const liq = vm.liq;
  const { unlocks, hist, curve, dist, funded } = liq;
  if (!unlocks || !hist || !curve || !dist || !funded) {
    return null;
  }
  return (
    <>
      <div className="lq-kpis">
        {liq.kpis.map((kpi, i) => (
          <div key={i} className="lq-kpi">
            <span className="kp-l h-i">
              {kpi.k}
              <InfoTip tip={kpi.info} />
            </span>
            <b className="num">{kpi.v}</b>
            {kpi.hasSpark ? (
              <svg
                className="kp-spark"
                viewBox="0 0 100 24"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d={kpi.spark}
                  strokeWidth="1.6"
                  vectorEffect="non-scaling-stroke"
                  style={{ fill: "none", stroke: "var(--c-up)" }}
                />
              </svg>
            ) : null}
            <small className={"num " + kpi.subCls}>{kpi.sub}</small>
          </div>
        ))}
      </div>

      <div className="lq-confirmed-charts">{liq.analyticsCards.map((card) => <AnalyticsCard key={card.id} card={card} onSnapshot={vm.mw?.snap} />)}</div>
      <div className="lqx-one">
        <ChartCard vm={vm} title="Trader Returns" info="Funded traders by return range. Accounts fail at a 10% loss." sub={dist.count + " funded accounts"} snap="liquidity-trader-returns" className="lq-full">
          <div className="lqx-rb">
            <div className="lq-stats num">{dist.stats.map((stat) => <div key={stat.k}><span className="h-i">{stat.k}<InfoTip tip={stat.info} /></span><b className={stat.cls}>{stat.v}</b></div>)}</div>
            <ChartPlot chart={dist} yTicks={dist.yTicks}>
              <HoverBand show={dist.hasBand} x={dist.bandX} width={dist.bandW} />
              {dist.bars.map((bar, i) => <rect key={i} x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx="2" fillOpacity={bar.op} style={{fill:bar.color}} />)}
              <line x1={dist.zeroX} x2={dist.zeroX} y1="0" y2="262" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" style={{stroke:"var(--text-3)"}} />
            </ChartPlot>
          </div>
        </ChartCard>
      </div>

      <FundedTradersCard vm={vm} />
    </>
  );
}
