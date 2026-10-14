import { Fragment } from "react";
import type { AriaBoolean, TerminalViewModel } from "@/terminal/types";
import { LogoTile } from "@openfutures/ui";

export function Topbar({ vm }: { vm: TerminalViewModel }) {
  return (
    <header className="topbar">
      <a className="brand" href="#">
        <LogoTile variant="brand" />
        <span>OpenFutures</span>
      </a>
      {vm.screen === "points" ? (
        <button
          type="button"
          className="tb-back"
          aria-label="Back to profile"
          onClick={vm.goProfile}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      ) : null}
      <span className="tb-title">{vm.pageTitle}</span>
      <nav className="nav" aria-label="Main">
        {(vm.navItems || []).map((navItem: any, i: any) => (
          <Fragment key={i}>
            <button
              type="button"
              className={navItem?.cls}
              aria-current={navItem?.current}
              onClick={navItem?.go}
            >
              {navItem?.label}
            </button>
          </Fragment>
        ))}
      </nav>
      <button type="button" className="tb-ai" aria-label="Ask OpenFutures AI" onClick={vm.ai.open}>
        <LogoTile size="md" />
      </button>
      <button
        type="button"
        className="srch-trigger"
        aria-haspopup="dialog"
        aria-expanded={vm.srch?.openStr as AriaBoolean}
        aria-label="Search markets, venues and positions"
        onClick={vm.srch?.open}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
          style={{ fill: "none", stroke: "currentColor" }}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span>Search markets, venues, positions</span>
        <kbd>{vm.srch?.kbd}</kbd>
      </button>
      <div className="top-actions">
        <button
          type="button"
          className="btn btn-icon sm srch-mobile"
          aria-label="Search"
          onClick={vm.srch?.open}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
            style={{ fill: "none", stroke: "currentColor" }}
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </button>
        <button
          type="button"
          className="btn btn-primary btn-deposit"
          onClick={vm.fund?.openDeposit}
        >
          Deposit
        </button>
        <button
          type="button"
          className="profile-btn"
          aria-haspopup="dialog"
          aria-expanded={vm.profileOpen as AriaBoolean}
          onClick={vm.toggleProfile}
        >
          <span className="avatar">
            <img src={vm.pfp} alt="" />
          </span>
          <span className="profile-name">kai.trades</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ fill: "none", stroke: "currentColor" }}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <div className="modesw modesw-top" role="group" aria-label="App mode">
          <button
            type="button"
            className={vm.mode?.proCls}
            aria-pressed={vm.mode?.proPressed as AriaBoolean}
            onClick={vm.mode?.setPro}
          >
            <span className="ms-ic">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ fill: "none", stroke: "currentColor" }}
              >
                <path d="M7 4v16M17 4v16" />
                <rect x="4.5" y="8" width="5" height="7" rx="1" />
                <rect x="14.5" y="6" width="5" height="9" rx="1" />
              </svg>
            </span>
            Pro
          </button>
          <button
            type="button"
            className={vm.mode?.propCls}
            aria-pressed={vm.mode?.propPressed as AriaBoolean}
            onClick={vm.mode?.setProp}
          >
            <span className="ms-ic">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ fill: "none", stroke: "currentColor" }}
              >
                <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
                <path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />
              </svg>
            </span>
            Prop
          </button>
        </div>
      </div>
    </header>
  );
}
