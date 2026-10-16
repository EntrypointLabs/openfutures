import { IconToggle } from "@/components/common/IconToggle";
import { MobileLiquidity } from "@/components/liquidity/MobileLiquidity";
import { AnalyticsView } from "@/components/liquidity/AnalyticsView";
import { DepositSheet, EarlyExitSheet } from "@/components/liquidity/LiquiditySheets";
import { PositionsDock } from "@/components/liquidity/PositionsDock";
import { VaultsCard } from "@/components/liquidity/VaultsCard";
import type { TerminalViewModel } from "@/terminal/types";

/** Liquidity: deposit into term vaults that fund prop traders, and see how the vaults perform. */
export function LiquidityPage({ vm }: { vm: TerminalViewModel }) {
  const liq = vm.liq;
  return (
    <section className="page page-liq" aria-label="Liquidity">
      <div className="page-inner lq">
        <header className="page-head wh lq-desktop-head">
          <div>
            <h1>Liquidity</h1>
            <p className="lq-lead">Fund prop traders. Earn from fees and profit share.</p>
          </div>
          <div className="wh-r">
            <IconToggle items={liq.views} label="Liquidity view" className="seg-sm wviews" />
          </div>
        </header>
        <IconToggle items={liq.views} label="Liquidity view" className="mw-sticky lq-desktop-toggle" />
        {liq.isAnalytics ? <AnalyticsView vm={vm} /> : null}
        {liq.isVaults && liq.isMobile ? <MobileLiquidity vm={vm} /> : null}
        {liq.isVaults && !liq.isMobile ? (
          <div className="lq-vaults lq-desktop-vaults">
            <VaultsCard vm={vm} />
            <PositionsDock vm={vm} />
          </div>
        ) : null}
        {liq.sheetOpen ? <DepositSheet vm={vm} /> : null}
        {liq.exitOpen && (!liq.isMobile || !liq.app.lot) ? <EarlyExitSheet vm={vm} /> : null}
      </div>
    </section>
  );
}
