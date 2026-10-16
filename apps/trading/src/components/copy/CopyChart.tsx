import type { CopyViewModel } from "@/terminal/copy/viewModel";

export function CopyChart({ chart }: { chart: CopyViewModel["hero"]["chart"] }) {
  return (
    <div className={`copy-chart ${chart.cls}`}>
      <svg
        viewBox="0 0 1000 200"
        preserveAspectRatio="none"
        onMouseMove={chart.move}
        onMouseLeave={chart.leave}
        aria-label={chart.unit}
        role="img"
      >
        {!chart.hidden && (
          <>
            <path className="copy-chart-area" d={chart.area} />
            <path className="copy-chart-line" d={chart.line} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {chart.hover && !chart.hidden && (
        <div className="copy-chart-tip num" style={{ left: Math.min(75, chart.hover.x) + "%" }}>
          <small>{chart.hover.date}</small>
          <b>{chart.hover.value}</b>
        </div>
      )}
      <div className="copy-chart-dates num">
        {chart.dates.map((date) => (
          <span key={date.x} style={{ left: date.x + "%" }}>
            {date.label}
          </span>
        ))}
      </div>
    </div>
  );
}
