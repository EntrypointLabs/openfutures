export interface PositionCardModel {
  key?: string;
  sym: string;
  logo: string;
  venueLogo: string;
  venueName?: string;
  lev: string;
  side: string;
  sideCls: string;
  pnl: string;
  pnlCls: string;
  roe: string;
  details: () => void;
}

/** The terminal's Trade position row, shared by leader and mirrored copy positions. */
export function PositionCard({
  position,
  className = "",
}: {
  position: PositionCardModel;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`hm-row${className ? " " + className : ""}`}
      aria-haspopup="dialog"
      onClick={position.details}
    >
      <span className="av">
        <img className="logo" src={position.logo} alt="" />
        <img
          className="av-badge"
          src={position.venueLogo}
          data-venue="1"
          alt={position.venueName || ""}
        />
      </span>
      <span className="hm-id">
        <b className="hm-t2">
          <span className="hm-tk">{position.sym}-PERP</span>
          <span className="lev">{position.lev}</span>
        </b>
        <small>
          <span className={`dir ${position.sideCls}`}>{position.side}</span>
        </small>
      </span>
      <span className="hm-px num">
        <b className={position.pnlCls}>{position.pnl}</b>
        <small className={position.pnlCls}>{position.roe}</small>
      </span>
    </button>
  );
}
