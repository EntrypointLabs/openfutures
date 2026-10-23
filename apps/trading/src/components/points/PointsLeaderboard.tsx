import { AnalyticsDropdown, TableFooter } from "@/components/analytics/controls";
import { SnapshotButton } from "@/components/common/SnapshotButton";
import type { PointsViewModel } from "@/terminal/points/viewModel";

type AvatarProps = PointsViewModel["boards"][number]["you"];
function TraderIdentity({ trader }: { trader: AvatarProps }) {
  return (
    <span className="points-trader">
      <span className="points-avatar" style={{ background: trader.background }}>
        {trader.avatar ? <img src={trader.avatar} alt="" /> : trader.initials}
      </span>
      <b>{trader.name}</b>
      {trader.you && <em>You</em>}
    </span>
  );
}

export function PointsSourceBoard({
  board,
  onSnapshot,
}: {
  board: PointsViewModel["boards"][number];
  onSnapshot?: (event: any) => void;
}) {
  return (
    <section
      className={`mw-card snap-card points-card points-source points-source-${board.id}`}
      data-snap={`points-${board.id}`}
      aria-label={board.title}
    >
      <header className="mw-card-h">
        <div>
          <h2>{board.title}</h2>
          <p>{board.subtitle}</p>
        </div>
        <SnapshotButton onClick={onSnapshot} />
      </header>
      <div className="points-table num" role="table" aria-label={board.title}>
        <div className="points-row points-head" role="row">
          <span role="columnheader">#</span>
          <span role="columnheader">{board.who}</span>
          <span role="columnheader">{board.unit}</span>
        </div>
        {board.rows.map((trader) => (
          <div key={trader.name} className={trader.cls} role="row">
            <span role="cell" className="points-rank">
              {trader.rank}
            </span>
            <TraderIdentity trader={trader} />
            <span role="cell" className="points-number">
              {trader.score}
            </span>
          </div>
        ))}
        <div className="points-row points-you" role="row">
          <span role="cell" className="points-rank">
            {board.you.rank}
          </span>
          <TraderIdentity trader={board.you} />
          <span role="cell" className="points-number">
            {board.you.score}
          </span>
        </div>
      </div>
      <TableFooter pager={board.pager}>
        <AnalyticsDropdown control={board.period} />
      </TableFooter>
    </section>
  );
}

export function PointsGeneralBoard({
  general,
  onSnapshot,
}: {
  general: PointsViewModel["gen"];
  onSnapshot?: (event: any) => void;
}) {
  return (
    <section
      className="mw-card snap-card points-card points-general"
      data-snap="points-general"
      aria-label="General leaderboard"
    >
      <header className="mw-card-h">
        <div>
          <h2>{general.title}</h2>
          <p>{general.subtitle}</p>
        </div>
        <div className="points-header-actions">
          <label className="points-search">
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              stroke="currentColor"
              strokeWidth="1.8"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              placeholder="Search traders"
              aria-label="Search points traders"
              value={general.query}
              onChange={general.onQuery}
            />
          </label>
          <SnapshotButton onClick={onSnapshot} />
        </div>
      </header>
      <div className="points-general-scroll">
        <div className="points-table num" role="table" aria-label="General leaderboard">
          <div className="points-row points-head" role="row">
            <span role="columnheader">#</span>
            <span role="columnheader">Trader</span>
            {general.heads.map((head) => (
              <button
                type="button"
                role="columnheader"
                className={head.on ? "is-on" : ""}
                key={head.label}
                onClick={head.pick}
              >
                {head.label} {head.arrow}
              </button>
            ))}
          </div>
          {general.rows.map((trader) => (
            <div className={trader.cls} role="row" key={trader.name}>
              <span role="cell" className="points-rank">
                {trader.rank}
              </span>
              <TraderIdentity trader={{ ...trader, score: trader.total }} />
              {trader.values.map((value, index) => (
                <span role="cell" key={index}>
                  {value}
                </span>
              ))}
              <span role="cell" className="points-number">
                {trader.total}
              </span>
            </div>
          ))}
          {!general.rows.length && <p className="points-empty">No traders found</p>}
          <div className="points-row points-you" role="row">
            <span role="cell" className="points-rank">
              {general.you.rank}
            </span>
            <TraderIdentity trader={{ ...general.you, score: general.you.total }} />
            {general.you.values.map((value, index) => (
              <span role="cell" key={index}>
                {value}
              </span>
            ))}
            <span role="cell" className="points-number">
              {general.you.total}
            </span>
          </div>
        </div>
      </div>
      <TableFooter pager={general.pager}>
        <AnalyticsDropdown control={general.period} />
      </TableFooter>
    </section>
  );
}
