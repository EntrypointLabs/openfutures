import { parseStyle } from "@/lib/style";

export interface ChartTooltipRow {
  color?: string;
  name?: string;
  val?: string;
  cls?: string;
}

/** A hover tooltip as produced by the view model for the Market Watch charts. */
export interface ChartTooltipModel {
  show?: boolean;
  left?: string | number;
  vline?: string | number;
  side?: string;
  rows?: ChartTooltipRow[];
}

/** Cursor line plus hover tooltip (`.mwc-vline`, `.mwc-tip`). */
export function ChartTooltip({
  tip,
  head,
  cursor = true,
}: {
  tip?: ChartTooltipModel;
  head: (string | number | undefined)[];
  cursor?: boolean;
}) {
  if (!tip?.show) {
    return null;
  }
  return (
    <>
      {cursor ? (
        <i className="mwc-vline" style={parseStyle(`left: ${tip.vline ?? tip.left ?? ""}%`)} />
      ) : null}
      <div
        className={`${tip.side ?? ""} mwc-tip num`}
        style={parseStyle(`left: ${tip.left ?? ""}%`)}
      >
        <div className="tip-h">
          {head.map((cell, i) => (
            <b key={i}>{cell}</b>
          ))}
        </div>
        {(tip.rows || []).map((row, i) => (
          <div key={i} className="tip-r">
            <span>
              <i style={parseStyle(`background: ${row.color ?? ""}`)} />
              {row.name}
            </span>
            <span className={row.cls}>{row.val}</span>
          </div>
        ))}
      </div>
    </>
  );
}
