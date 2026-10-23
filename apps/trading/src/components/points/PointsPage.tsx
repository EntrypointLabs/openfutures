import { InfoTip } from "@/components/common/InfoTip";
import { PointsChart } from "./PointsChart";
import { PointsSourceBoard, PointsGeneralBoard } from "./PointsLeaderboard";
import type { PointsViewModel } from "@/terminal/points/viewModel";

export function PointsPage({
  vm,
}: {
  vm: { pts: PointsViewModel; mw?: { snap?: (event: any) => void } };
}) {
  const points = vm.pts;
  return (
    <section className="page page-points" aria-label="Points">
      <div className="page-inner">
        <header className="points-page-head">
          <h1 className="h-i">
            Points
            <InfoTip tip="Earn weekly scores by trading, providing liquidity, running Prop accounts and referring traders. Scores convert to points at the start of each week." />
          </h1>
          <p className="points-week-line num">
            {points.isMobile ? points.phoneWeekLine : points.weekLine}
          </p>
        </header>
        <section className="points-hero" aria-label="Your points">
          <div className="points-week-scores">
            <header className="points-band">
              <h2>Your Week {points.week} Scores</h2>
              <p>Converts to points on {points.conversion}</p>
            </header>
            <div className="points-stats num">
              {points.stats.map((stat) => (
                <div key={stat.label}>
                  <span>{stat.label}</span>
                  <b>{stat.value}</b>
                  {stat.link && (
                    <button type="button" onClick={stat.go}>
                      {stat.link} ↗
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div
              className="points-progress"
              aria-label="Weekly progress"
              role="progressbar"
              aria-valuenow={Math.round(points.progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: points.progress + "%" }} />
            </div>
            <div className="points-progress-labels num">
              <span>{points.start}</span>
              <span>{points.end}</span>
            </div>
          </div>
          <div className="points-total">
            <header className="points-band">
              <h2>Your Total Points</h2>
              <p>Updated at the start of each week, 00:00 UTC</p>
            </header>
            <div className="points-total-value num">
              <b>{points.total}</b>
              <span>Points</span>
            </div>
            <PointsChart rate={points.rate} />
            <dl className="points-mini num">
              {points.mini.map((metric) => (
                <div key={metric.label}>
                  <dt>{metric.label}</dt>
                  <dd>{metric.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
        <div className="points-phone-tabs" role="tablist" aria-label="Leaderboard">
          {points.tabs.map((tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab.on}
              className={tab.on ? "is-on" : ""}
              key={tab.key}
              onClick={tab.pick}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="points-boards" data-tab={points.tab}>
          <h2 className="points-section-title">
            Leaderboards by Source
            <InfoTip tip="Scores add up through the week and reset when they convert into points." />
          </h2>
          {points.boards.map((board) => (
            <PointsSourceBoard key={board.id} board={board} onSnapshot={vm.mw?.snap} />
          ))}
          <h2 className="points-section-title points-general-title">General Leaderboard</h2>
          <PointsGeneralBoard general={points.gen} onSnapshot={vm.mw?.snap} />
        </div>
      </div>
    </section>
  );
}
