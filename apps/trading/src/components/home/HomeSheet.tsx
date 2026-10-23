import { Fragment } from "react";
import { PositionCard } from "@/components/trade/PositionCard";
import type { TerminalViewModel } from "@/terminal/types";

export function HomeSheet({ vm }: { vm: TerminalViewModel }) {
  return (
    <div className="hm-sheet">
      <span className="hm-grab" aria-hidden="true" />
      {vm.home?.vMarkets ? (
        <>
          <section className="hm-markets" aria-label="Markets">
            <div className="pills hm-pills" role="group" aria-label="Filter markets">
              {(vm.home?.filters || []).map((filter: any, i: any) => (
                <Fragment key={i}>
                  <button
                    type="button"
                    className={filter?.cls}
                    aria-pressed={filter?.pressed}
                    onClick={filter?.pick}
                  >
                    {filter?.label}
                    <span className="pill-count">{filter?.count}</span>
                  </button>
                </Fragment>
              ))}
            </div>
            <div className="hm-list pc-list">
              {(vm.home?.rows || []).map((row: any, i: any) => (
                <Fragment key={i}>
                  <button type="button" className="hm-row" onClick={row?.open}>
                    <span className="av">
                      <img className="logo" src={row?.logo} alt="" />
                      <span className="av-badges">
                        {(row?.venues || []).map((venue: any, i2: any) => (
                          <Fragment key={i2}>
                            <img
                              className="av-badge"
                              src={venue?.logo}
                              data-venue="1"
                              alt={venue?.name}
                              title={venue?.name}
                            />
                          </Fragment>
                        ))}
                      </span>
                    </span>
                    <span className="hm-id">
                      <b className="hm-t2">
                        <span className="hm-tk">{row?.sym}-PERP</span>
                        <span className="lev">{row?.lev}</span>
                      </b>
                      <small className="num">
                        <span className="hm-vol">{row?.vol} Vol</span>
                      </small>
                    </span>
                    <span className="hm-px num">
                      <b className={row?.flash}>
                        ${row?.pWhole}
                        <span className="hm-dim">{row?.pCents}</span>
                      </b>
                      <small className={row?.dir}>{row?.chgA}</small>
                    </span>
                  </button>
                </Fragment>
              ))}
              {vm.home?.empty ? (
                <>
                  <div className="dock-empty">
                    <b>{vm.home?.emptyText}</b>
                    <span>{vm.home?.emptySub}</span>
                  </div>
                </>
              ) : null}
            </div>
            {vm.home?.hasMore ? (
              <>
                <button type="button" className="hm-all" onClick={vm.home?.showAll}>
                  {vm.home?.moreText}
                </button>
              </>
            ) : null}
          </section>
        </>
      ) : null}
      {vm.home?.vPositions ? (
        <>
          <section className="hm-markets" aria-label="Positions">
            <div className="hm-list pc-list">
              {(vm.home?.pos || []).map((item: any, i: any) => (
                <Fragment key={i}>
                  <PositionCard position={{ ...item, roe: item.roeA }} />
                </Fragment>
              ))}
              {vm.home?.noPos ? (
                <>
                  <div className="dock-empty">
                    <b>{vm.home?.posEmpty}</b>
                    <span>{vm.home?.posEmptySub}</span>
                  </div>
                </>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
      {vm.home?.vOrders ? (
        <>
          <section className="hm-markets" aria-label="Open orders">
            <div className="hm-list pc-list">
              {(vm.home?.ords || []).map((ord: any, i: any) => (
                <Fragment key={i}>
                  <button
                    type="button"
                    className="hm-row"
                    aria-haspopup="dialog"
                    onClick={ord?.details}
                  >
                    <span className="av">
                      <img className="logo" src={ord?.logo} alt="" />
                      <img className="av-badge" src={ord?.venueLogo} data-venue="1" alt="" />
                    </span>
                    <span className="hm-id">
                      <b className="hm-t2">
                        <span className="hm-tk">{ord?.sym}-PERP</span>
                      </b>
                      <small>
                        <span className={`dir ${ord?.sideCls ?? ""}`}>{ord?.side}</span>
                        <span className="hm-vn2">Limit</span>
                      </small>
                    </span>
                    <span className="hm-px num">
                      <b>{ord?.price}</b>
                      <small className="muted">{ord?.filled} filled</small>
                    </span>
                  </button>
                </Fragment>
              ))}
              {vm.home?.noOrd ? (
                <>
                  <div className="dock-empty">
                    <b>{vm.home?.ordEmpty}</b>
                    <span>{vm.home?.ordEmptySub}</span>
                  </div>
                </>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
