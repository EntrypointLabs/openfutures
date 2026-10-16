import { CopyChart } from "./CopyChart";
import { AnalyticsDropdown } from "@/components/analytics/controls";
import { PositionCard } from "@/components/trade/PositionCard";
import { CopySettings } from "./CopySettings";
import { CopyPositionDetail } from "./CopyPositionDetail";
import type { CopyDetailModel } from "@/terminal/copy/viewModel";

export function CopyTraderDetail({ detail }: { detail: CopyDetailModel }) {
  return (
    <section className="copy-trader-detail" aria-label={detail.id + " trader"}>
      <header className="copy-trader-header">
        <button
          type="button"
          className="copy-icon"
          aria-label="Back to traders"
          onClick={detail.back}
        >
          ‹
        </button>
        <span className="copy-avatar">
          <img src={detail.avatar} alt="" />
        </span>
        <div>
          <h1>{detail.id}</h1>
          <span>{detail.tag}</span>
        </div>
        <span className="copy-trader-venues">
          {detail.venues.map((venue) => (
            <img className="logo" key={venue.id} src={venue.logo} alt={venue.name} />
          ))}
        </span>
      </header>
      <div className="copy-trader-balance num">
        <span>Equity (USDC)</span>
        <b>{detail.equity}</b>
        <small className={detail.returnCls}>{detail.return} in 30 days</small>
      </div>
      <div className="copy-trader-actions">
        {!detail.followed && (
          <button
            type="button"
            className="copy-secondary"
            aria-pressed={detail.watchOn}
            onClick={detail.toggleWatch}
          >
            {detail.watchOn ? "Watching" : "Watch"}
          </button>
        )}
        <button type="button" className="copy-primary" onClick={detail.openSettings}>
          {detail.followed ? "Edit Copy" : "Copy"}
        </button>
        <div className="copy-tip-wrap">
          <button
            type="button"
            className={`copy-tip-heart ${detail.tip.on ? "is-tipped" : ""}`}
            aria-label={detail.tip.label}
            aria-expanded={detail.tip.open}
            onClick={detail.tip.toggle}
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              stroke="currentColor"
              fill={detail.tip.on ? "currentColor" : "none"}
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
            </svg>
          </button>
          {detail.tip.open && (
            <div className="copy-tip-menu" role="group" aria-label="Tip amount in USDC">
              <small>Tip (USDC)</small>
              {detail.tip.options.map((option) => (
                <button type="button" key={option.label} onClick={option.pick}>
                  {option.label}
                </button>
              ))}
              <button
                type="button"
                className="copy-tip-close"
                aria-label="Close tip"
                onClick={detail.tip.close}
              >
                ×
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="copy-performance-tabs" role="group" aria-label="Trader performance view">
        {detail.views.map((view) => (
          <button
            type="button"
            key={view.label}
            className={view.on ? "is-on" : ""}
            aria-pressed={view.on}
            onClick={view.pick}
          >
            {view.label}
          </button>
        ))}
      </div>
      <div className="copy-performance-bar">
        {detail.view === "perf" ? (
          <>
            <div className="copy-chart-ranges">
              {detail.ranges.map((range) => (
                <button
                  type="button"
                  key={range.label}
                  className={range.on ? "is-on" : ""}
                  aria-pressed={range.on}
                  onClick={range.pick}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <span>{detail.chart.unit}</span>
          </>
        ) : (
          <>
            <div className="copy-month-nav">
              <button
                type="button"
                aria-label="Previous month"
                disabled={detail.calendar.prevDisabled}
                onClick={detail.calendar.prev}
              >
                ‹
              </button>
              <b>{detail.calendar.title}</b>
              <button
                type="button"
                aria-label="Next month"
                disabled={detail.calendar.nextDisabled}
                onClick={detail.calendar.next}
              >
                ›
              </button>
            </div>
            <div className="copy-month-value num">
              <small>{detail.calendar.selectedLabel}</small>
              <b className={detail.calendar.cls}>{detail.calendar.value}</b>
            </div>
          </>
        )}
      </div>
      <div className="copy-performance-slot">
        {detail.view === "perf" ? (
          <CopyChart chart={detail.chart} />
        ) : (
          <div className="copy-calendar">
            <div className="copy-calendar-head">
              {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
                <span key={index}>{day}</span>
              ))}
            </div>
            <div className="copy-calendar-grid">
              {detail.calendar.days.map((day) => (
                <button
                  type="button"
                  key={day.key}
                  className={`${day.cls}${day.today ? " today" : ""}${day.selected ? " is-selected" : ""}`}
                  disabled={day.disabled}
                  aria-pressed={day.selected}
                  aria-label={
                    day.day
                      ? `${detail.calendar.title} ${day.day}, ${day.trades} trades, PnL ${day.pnl} USDC`
                      : undefined
                  }
                  onClick={day.pick}
                >
                  {day.day}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <footer className="copy-chart-footer">
        <button
          type="button"
          aria-pressed={!detail.chart.hidden}
          onClick={detail.chart.toggleLegend}
        >
          <i className="copy-legend-dot" />
          Return
        </button>
        <AnalyticsDropdown control={detail.chart.granularity} />
        <div role="group" aria-label="Chart value">
          {detail.valueModes.map((option) => (
            <button
              type="button"
              className={option.on ? "is-on" : ""}
              aria-pressed={option.on}
              key={option.label}
              onClick={option.pick}
            >
              {option.label}
            </button>
          ))}
        </div>
      </footer>
      {detail.mine && (
        <section className="copy-your-copy" aria-label="Your copy">
          <header>
            <h2>Your copy</h2>
            <b className={`num ${detail.mine.cls}`}>
              {detail.mine.pnl}
              <small>Copy total (USDC)</small>
            </b>
          </header>
          <div className="copy-your-summary num">
            <span>
              {detail.mine.status} · {detail.mine.alloc} USDC allocated
            </span>
            <b>{detail.mine.count}</b>
          </div>
          <div className="hm-list pc-list">
            {detail.mine.positions.map((position) => (
              <PositionCard key={position.key} position={position} className="copy-position" />
            ))}
            {!detail.mine.positions.length && (
              <p className="copy-empty-small">{detail.mine.empty}</p>
            )}
          </div>
        </section>
      )}
      <section className="copy-trader-content">
        <div className="copy-segment" role="group" aria-label="Trader details">
          {detail.segments.map((segment) => (
            <button
              type="button"
              key={segment.label}
              className={segment.on ? "is-on" : ""}
              aria-pressed={segment.on}
              onClick={segment.pick}
            >
              {segment.label}
            </button>
          ))}
        </div>
        {detail.segment === "pos" && (
          <div className="copy-leader-positions">
            <header>
              <h2>Leader positions</h2>
              <span className="num">{detail.positions.length} open</span>
            </header>
            <div className="hm-list pc-list">
              {detail.positions.map((position) => (
                <PositionCard key={position.key} position={position} className="copy-position" />
              ))}
            </div>
          </div>
        )}
        {detail.segment === "stats" && (
          <div className="copy-stats-lists">
            {detail.statsLists.map((list, index) => (
              <div key={index}>
                <h3>{detail.statsTitles[index]}</h3>
                <dl className="copy-key-values num">
                  {list.map((row) => (
                    <div key={row.label}>
                      <dt>{row.label}</dt>
                      <dd className={row.cls}>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}
        {detail.segment === "about" && (
          <div className="copy-about">
            <p>{detail.bio}</p>
            <div>
              {detail.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>
        )}
      </section>
      {detail.form.open && <CopySettings detail={detail} />}
      {detail.positionDetail && <CopyPositionDetail position={detail.positionDetail} />}
    </section>
  );
}
