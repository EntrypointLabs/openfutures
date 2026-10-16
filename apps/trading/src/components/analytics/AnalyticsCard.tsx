import { Watermark } from "@/components/common/Watermark";
import { ChartTooltip } from "@/components/common/ChartTooltip";
import { InfoTip } from "@/components/common/InfoTip";
import { SnapshotButton } from "@/components/common/SnapshotButton";
import { AnalyticsDropdown, AnalyticsSegment } from "./controls";
import type { AnalyticsCardViewModel } from "@/terminal/analytics";

export function AnalyticsCard({
  card,
  onSnapshot,
}: {
  card: AnalyticsCardViewModel;
  onSnapshot?: (event: any) => void;
}) {
  return (
    <section className="mw-card snap-card ac" data-snap={card.snap} aria-label={card.title}>
      <div className="mw-card-h">
        <div>
          <h2 className="h-i">
            {card.title}
            <InfoTip tip={card.help} />
          </h2>
          <p>{card.sub}</p>
        </div>
        <SnapshotButton onClick={onSnapshot} />
      </div>
      <div className="ac-b">
        <div className="ac-plot">
          <div className="ac-y num" aria-hidden="true">
            {card.yTicks.map((tick, index) => (
              <span key={index} style={{ top: `${tick.y}%` }}>
                {tick.label}
              </span>
            ))}
          </div>
          <div className="ac-area">
            <div className="ac-gh" aria-hidden="true">
              {card.yTicks.map((tick, index) => (
                <i key={index} style={{ top: `${tick.y}%` }} />
              ))}
              {card.xTicks.map((tick, index) => (
                <b key={index} className={tick.cls} style={{ left: `${tick.x}%` }} />
              ))}
            </div>
            <p className="sr">
              {card.title}. {card.sub} Use the legend buttons below to choose the series.
            </p>
            <Watermark />
            <svg
              className="ac-svg"
              viewBox="0 0 1000 300"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {card.hasBand ? (
                <rect x={card.bandX} y="0" width={card.bandW} height="300" className="ac-band" />
              ) : null}
              {card.paths.map((path, index) => (
                <path
                  key={index}
                  d={path.d}
                  fill={path.fill}
                  stroke={path.stroke}
                  strokeWidth={path.sw}
                  fillOpacity={path.op}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            <ChartTooltip
              tip={card.tip}
              cursor={card.isLines}
              head={[card.tip.date, card.tip.total]}
            />
            <div
              className="mwc-hit"
              onPointerMove={card.move}
              onPointerDown={card.move}
              onPointerLeave={card.leave}
            />
          </div>
        </div>
        <div className="ac-x num" aria-hidden="true">
          {card.xTicks.map((tick, index) => (
            <span key={index} className={tick.cls} style={{ left: `${tick.x}%` }}>
              {tick.label}
            </span>
          ))}
        </div>
      </div>
      <div className="ac-f">
        {card.hasGran ? <AnalyticsDropdown control={card.gran} /> : null}
        {card.hasModes ? <AnalyticsSegment control={card.modes} /> : null}
        <div className="ac-lg">
          {card.legend.map((item) => (
            <button
              key={item.name}
              type="button"
              className={item.cls}
              aria-pressed={item.pressed === "true"}
              onClick={item.toggle}
            >
              {item.logo ? (
                <img className="logo xxs" src={item.logo} data-venue="1" alt="" />
              ) : null}
              <i style={{ background: item.color }} />
              {item.name}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
