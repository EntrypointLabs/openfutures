import { Fragment } from "react";
import { PositionCard } from "@/components/trade/PositionCard";
import type { TerminalViewModel } from "@/terminal/types";

export function ProfilePanel({ vm }: { vm: TerminalViewModel }) {
  return (
    <aside className="profile" aria-label="Profile">
      <div className="profile-head">
        <span className="avatar lg">
          <img src={vm.pfp} alt="" />
        </span>
        <div className="profile-id">
          <b>kai.trades</b>
        </div>
        <button
          type="button"
          className="btn btn-icon sm profile-close"
          aria-label="Close profile"
          onClick={vm.closeAll}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
            style={{ fill: "none", stroke: "currentColor" }}
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="eq-card">
        <span>{vm.acctTitle}</span>
        <b className="num">{vm.acct?.equity}</b>
        <p className={`num ${vm.acct?.upnlCls ?? ""}`}>{vm.acct?.upnl} unrealized</p>
        <dl className="eq-grid num">
          <div>
            <dt>Margin Used</dt>
            <dd>{vm.acct?.used}</dd>
          </div>
          <div>
            <dt>Free</dt>
            <dd>{vm.acct?.free}</dd>
          </div>
          <div>
            <dt>Positions</dt>
            <dd>{vm.acct?.count}</dd>
          </div>
        </dl>
        {vm.isLive ? (
          <>
            <div className="eq-actions">
              <button type="button" className="btn btn-primary" onClick={vm.fund?.openDeposit}>
                Deposit
              </button>
              <button type="button" className="btn" onClick={vm.fund?.openWithdraw}>
                Withdraw
              </button>
            </div>
          </>
        ) : null}
        {vm.isProp ? (
          <>
            <div className="eq-actions">
              <button type="button" className="btn btn-primary" onClick={vm.goProp}>
                Prop account
              </button>
              <button type="button" className="btn" onClick={vm.goTradeProp}>
                Trade
              </button>
            </div>
          </>
        ) : null}
      </div>
      <div className="profile-activity">
        <div className="segmented" role="tablist" aria-label="Your activity">
          {(vm.segTabs || []).map((segTab: any, i: any) => (
            <Fragment key={i}>
              <button
                type="button"
                role="tab"
                className={segTab?.cls}
                aria-selected={segTab?.pressed}
                onClick={segTab?.pick}
              >
                {segTab?.shortLabel}
              </button>
            </Fragment>
          ))}
        </div>
        {vm.tabPos ? (
          <>
            <div className="hm-list m-list-plain pc-list">
              {(vm.mlist?.pos || []).map((item: any, i: any) => (
                <Fragment key={i}>
                  <PositionCard position={{ ...item, roe: item.roeA }} />
                </Fragment>
              ))}
            </div>
            {vm.noPositions ? (
              <>
                <div className="dock-empty">
                  <b>No open positions</b>
                  <span>Pick a market and place an order to open one.</span>
                </div>
              </>
            ) : null}
          </>
        ) : null}
        {vm.tabOrd ? (
          <>
            <div className="hm-list m-list-plain pc-list">
              {(vm.mlist?.ord || []).map((ordItem: any, i: any) => (
                <Fragment key={i}>
                  <button
                    type="button"
                    className="hm-row"
                    aria-haspopup="dialog"
                    onClick={ordItem?.details}
                  >
                    <span className="av">
                      <img className="logo" src={ordItem?.logo} alt="" />
                      <img className="av-badge" src={ordItem?.venueLogo} data-venue="1" alt="" />
                    </span>
                    <span className="hm-id">
                      <b className="hm-t2">
                        <span className="hm-tk">{ordItem?.sym}-PERP</span>
                      </b>
                      <small>
                        <span className={`dir ${ordItem?.sideCls ?? ""}`}>{ordItem?.side}</span>
                        <span className="hm-vn2">Limit</span>
                      </small>
                    </span>
                    <span className="hm-px num">
                      <b>{ordItem?.price}</b>
                      <small className="muted">{ordItem?.filled} filled</small>
                    </span>
                  </button>
                </Fragment>
              ))}
            </div>
            {vm.noOrders ? (
              <>
                <div className="dock-empty">
                  <b>No open orders</b>
                  <span>Limit orders waiting to fill show up here.</span>
                </div>
              </>
            ) : null}
          </>
        ) : null}
        {vm.tabHist ? (
          <>
            <div className="hm-list m-list-plain pc-list">
              {(vm.mlist?.hist || []).map((histItem: any, i: any) => (
                <Fragment key={i}>
                  <button
                    type="button"
                    className="hm-row"
                    aria-haspopup="dialog"
                    onClick={histItem?.details}
                  >
                    <span className="av">
                      <img className="logo" src={histItem?.logo} alt="" />
                      <img className="av-badge" src={histItem?.venueLogo} data-venue="1" alt="" />
                    </span>
                    <span className="hm-id">
                      <b className="hm-t2">
                        <span className="hm-tk">{histItem?.sym}-PERP</span>
                      </b>
                      <small>
                        <span className={`dir ${histItem?.sideCls ?? ""}`}>{histItem?.action}</span>
                        <span className="hm-vn2">{histItem?.time}</span>
                      </small>
                    </span>
                    <span className="hm-px num">
                      <b className={histItem?.pnlCls}>{histItem?.big}</b>
                      <small className="muted">{histItem?.sub}</small>
                    </span>
                  </button>
                </Fragment>
              ))}
            </div>
          </>
        ) : null}
      </div>
      <nav className="settings-list" aria-label="Account settings">
        <button type="button" onClick={vm.goPoints}>
          Points
        </button>
        <button type="button" onClick={vm.st?.openIt}>
          Settings
        </button>
        <button type="button" onClick={vm.notInPreview}>
          Security
        </button>
        <button type="button" onClick={vm.notInPreview}>
          Referrals
        </button>
        <button type="button" onClick={vm.notInPreview}>
          Help and support
        </button>
        <button type="button" className="danger" onClick={vm.notInPreview}>
          Sign out
        </button>
      </nav>
    </aside>
  );
}
