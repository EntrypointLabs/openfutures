import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import { PageFallback, PageErrorBoundary } from "@/components/common/PageFallback";
import { HomePage } from "@/components/home/HomePage";
import { TradeLayout } from "@/components/trade/TradeLayout";
import { usePageScroll } from "@/router/usePageScroll";
import type { TerminalViewModel } from "@/terminal/types";

const WatchRoute = lazy(() => import("@/router/WatchRoute"));
const LiquidityPage = lazy(() =>
  import("@/components/liquidity/LiquidityPage").then((m) => ({ default: m.LiquidityPage })),
);
const PropPage = lazy(() =>
  import("@/components/prop/PropPage").then((m) => ({ default: m.PropPage })),
);
const CopyPage = lazy(() =>
  import("@/components/copy/CopyPage").then((m) => ({ default: m.CopyPage })),
);
const PointsPage = lazy(() =>
  import("@/components/points/PointsPage").then((m) => ({ default: m.PointsPage })),
);

export function AppRoutes({ vm }: { vm: TerminalViewModel }) {
  usePageScroll();
  const trade = <TradeLayout vm={vm} />;
  return (
    <PageErrorBoundary resetKey={vm.screen}>
      <Suspense fallback={<PageFallback screen={vm.screen} />}>
        <Routes>
          <Route path="/" element={vm.screen === "home" ? <HomePage vm={vm} /> : trade} />
          <Route path="/trade/:symbol?" element={trade} />
          <Route path="/watch/:view?" element={<WatchRoute vm={vm} />} />
          <Route path="/liquidity/:view?" element={<LiquidityPage vm={vm} />} />
          <Route path="/prop" element={<PropPage vm={vm} />} />
          <Route path="/copy/:trader?" element={<CopyPage vm={vm} />} />
          <Route path="/points" element={<PointsPage vm={vm} />} />
          <Route path="/profile" element={trade} />
          <Route path="*" element={trade} />
        </Routes>
      </Suspense>
    </PageErrorBoundary>
  );
}
