import type { TerminalViewModel } from "@/terminal/types";

export function TabBar({ vm }: { vm: TerminalViewModel }) {
  return (
    <nav className={vm.tabbarCls} aria-label="App">
      <button type="button" className={vm.tb?.trade} onClick={vm.goTrade}>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ fill: "none", stroke: "currentColor" }}
        >
          <path d="M3 17l6-6 4 4 8-8" />
          <path d="M15 7h6v6" />
        </svg>
        Trade
      </button>
      <button type="button" className={vm.tb.copy} onClick={vm.goCopy}>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
        </svg>
        Copy
      </button>
      {vm.isPropMode ? (
        <>
          <button type="button" className={vm.tb?.prop} onClick={vm.goProp}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ fill: "none", stroke: "currentColor" }}
            >
              <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
              <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
            </svg>
            Prop
          </button>
        </>
      ) : null}
      <button type="button" className={vm.tb?.watch} onClick={vm.goWatch}>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ fill: "none", stroke: "currentColor" }}
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        Watch
      </button>
      <button type="button" className={vm.tb?.liquidity} onClick={vm.goLiquidity}>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ fill: "none", stroke: "currentColor" }}
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 8.5V7M12 17v-1.5M8.5 12H7M17 12h-1.5" />
        </svg>
        Liquidity
      </button>
      <button type="button" className={vm.tb?.profile} onClick={vm.goProfile}>
        <span className="avatar xs">
          <img src={vm.pfp} alt="" />
        </span>
        Profile<span className="tb-count">{vm.tbCount}</span>
      </button>
    </nav>
  );
}
