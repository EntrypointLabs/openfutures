import type { PointsViewModel } from "@/terminal/points/viewModel";
import { AnalyticsDropdown } from "@/components/analytics/controls";

export function PointsChart({ rate }: { rate: PointsViewModel["rate"] }) {
  return (
    <div className="points-rate">
      <header>
        <span>{rate.unit}</span>
        <small className={rate.cls}>{rate.change}</small>
      </header>
      <div className="points-rate-plot">
        <svg
          viewBox="0 0 1000 200"
          preserveAspectRatio="none"
          role="img"
          aria-label={rate.unit}
          onMouseMove={rate.move}
          onMouseLeave={rate.leave}
        >
          {!rate.hidden && (
            <>
              <path className="points-rate-area" d={rate.area} />
              <path className="points-rate-line" d={rate.line} vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
        {rate.hover && !rate.hidden && (
          <div className="points-rate-tip num" style={{ left: Math.min(75, rate.hover.x) + "%" }}>
            <small>{rate.hover.date}</small>
            <b>{rate.hover.value}</b>
          </div>
        )}
        <div className="points-rate-dates num">
          {rate.dates.map((date) => (
            <span key={date.x} style={{ left: date.x + "%" }}>
              {date.label}
            </span>
          ))}
        </div>
      </div>
      <footer className="points-rate-footer">
        <button type="button" aria-pressed={!rate.hidden} onClick={rate.toggleLegend}>
          <i />
          Points
        </button>
        <AnalyticsDropdown control={rate.granularity} />
        <div role="group" aria-label="Points chart value">
          {rate.values.map((option) => (
            <button
              type="button"
              key={option.label}
              className={option.on ? "is-on" : ""}
              aria-pressed={option.on}
              onClick={option.pick}
            >
              {option.label}
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}
