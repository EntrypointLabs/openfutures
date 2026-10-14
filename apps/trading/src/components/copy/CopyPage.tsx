import type { CopyViewModel } from "@/terminal/copy/viewModel";
import { CopyChart } from "./CopyChart";
import { AnalyticsDropdown } from "@/components/analytics/controls";
import { CopyTraderDetail } from "./CopyTraderDetail";

export function CopyPage({ vm }: { vm: { cp: CopyViewModel } }) {
  const cp = vm.cp;
  if (cp.detail && cp.isMobile)
    return (
      <section className="page page-copy">
        <div className="page-inner">
          <CopyTraderDetail detail={cp.detail} />
        </div>
      </section>
    );
  return (
    <section className="page page-copy" aria-label="Copy trading">
      <div className="page-inner">
        <header className="copy-page-head">
          <h1>Copy Trading</h1>
          <label className="copy-search">
            <span>Search traders</span>
            <input
              type="search"
              placeholder="Search traders or style"
              value={cp.query}
              onChange={cp.onQuery}
            />
          </label>
        </header>
        <section className="copy-hero">
          <div className="copy-hero-balance num">
            <small>Your copy balance (USDC)</small>
            <b>{cp.hero.equity}</b>
            <span className={cp.hero.cls}>
              {cp.hero.pnl}
              <small> {cp.hero.sub}</small>
            </span>
            <div className="copy-chart-ranges">
              {cp.hero.ranges.map((range) => (
                <button
                  type="button"
                  key={range.label}
                  aria-pressed={range.on}
                  className={range.on ? "is-on" : ""}
                  onClick={range.pick}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
          <div className="copy-hero-chart">
            <CopyChart chart={cp.hero.chart} />
            <footer className="copy-chart-footer">
              <button
                type="button"
                aria-pressed={!cp.hero.chart.hidden}
                onClick={cp.hero.chart.toggleLegend}
              >
                <i className="copy-legend-dot" />
                PnL
              </button>
              <AnalyticsDropdown control={cp.hero.chart.granularity} />
            </footer>
          </div>
          <dl className="copy-hero-metrics num">
            {cp.hero.metrics.map((metric) => (
              <div key={metric.label}>
                <dt>{metric.label}</dt>
                <dd className={metric.cls}>{metric.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <div className="copy-list-tabs" role="group" aria-label="Trader list">
          {cp.tabs.map((tab) => (
            <button
              type="button"
              key={tab.key}
              aria-pressed={tab.on}
              className={tab.on ? "is-on" : ""}
              onClick={tab.pick}
            >
              {tab.label}
              <span className="num">{tab.count}</span>
            </button>
          ))}
        </div>
        <div className="copy-list-controls">
          <div className="copy-categories" role="group" aria-label="Trader asset class">
            {cp.categories.map((category) => (
              <button
                type="button"
                key={category.label}
                aria-pressed={category.on}
                className={category.on ? "is-on" : ""}
                onClick={category.pick}
              >
                {category.label}
              </button>
            ))}
          </div>
          <label className="copy-phone-search">
            <input
              type="search"
              aria-label="Search traders"
              placeholder="Search traders or style"
              value={cp.query}
              onChange={cp.onQuery}
            />
          </label>
          <label className="copy-sort-phone">
            Sort
            <select
              aria-label="Sort traders"
              value={cp.heads.findIndex((head) => head.on)}
              onChange={(event) => cp.heads[Number(event.target.value)]?.pick()}
            >
              {cp.heads.map((head, index) => (
                <option key={head.label} value={index}>
                  {head.label} {head.arrow}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="copy-leaders">
          <div className="copy-table-head">
            <span>Trader</span>
            {cp.heads.map((head) => (
              <button
                type="button"
                key={head.label}
                onClick={head.pick}
                className={head.on ? "is-on" : ""}
              >
                {head.label} {head.arrow}
              </button>
            ))}
            <span>Actions</span>
          </div>
          {cp.rows.map((row) => (
            <div className="copy-leader-group" key={row.id}>
              <div className="copy-leader-row">
                <button type="button" className="copy-leader-name" onClick={row.toggle}>
                  <span className="copy-avatar">
                    <img src={row.avatar} alt="" />
                  </span>
                  <span>
                    <b>{row.id}</b>
                    <small>{row.tag}</small>
                    <span className="copy-row-venues">
                      {row.venues.map((venue) => (
                        <img className="logo xs" key={venue.id} src={venue.logo} alt={venue.name} />
                      ))}
                      {row.status && <small className="copy-status">{row.status}</small>}
                    </span>
                  </span>
                </button>
                {row.values.map((value, index) => (
                  <span className={`copy-row-number num ${value.cls}`} key={index}>
                    {value.value}
                  </span>
                ))}
                <button type="button" className="copy-row-phone-value num" onClick={row.toggle}>
                  <b>{row.equity}</b>
                  <small className={row.retCls}>{row.ret}</small>
                </button>
                <div className="copy-row-actions">
                  {row.canWatch && (
                    <button
                      type="button"
                      className="copy-icon"
                      aria-label={
                        (row.watchOn ? "Remove " : "Add ") +
                        row.id +
                        (row.watchOn ? " from Watching" : " to Watching")
                      }
                      aria-pressed={row.watchOn}
                      onClick={row.toggleWatch}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="17"
                        height="17"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path d={cp.eyeIcon} />
                      </svg>
                    </button>
                  )}
                  <button type="button" onClick={row.mainAction}>
                    {row.mainLabel}
                  </button>
                </div>
              </div>
              {cp.detail?.id === row.id && (
                <div className="copy-expanded">
                  <CopyTraderDetail detail={cp.detail} />
                </div>
              )}
            </div>
          ))}
          {!cp.rows.length && (
            <div className="copy-empty">
              <h2>{cp.emptyText}</h2>
              <button type="button" onClick={cp.discover}>
                Find Traders
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
