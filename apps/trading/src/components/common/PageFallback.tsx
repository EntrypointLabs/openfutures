import { Component, type ReactNode } from "react";
import { LogoMark, LogoWordmark } from "@openfutures/ui";

const PAGE_NAMES: Record<string, string> = {
  watch: "Market Watch",
  liquidity: "Liquidity",
  prop: "Prop",
  copy: "Copy",
  points: "Points",
};

export function PageFallback({ screen }: { screen: string }) {
  return (
    <section className="page page-loading" aria-busy="true">
      <span className="sr" role="status">
        Loading {PAGE_NAMES[screen] || "page"}
      </span>
      <div className="pl-logo" aria-hidden="true">
        <LogoMark className="pl-mark" />
        <LogoWordmark className="pl-wordmark" />
      </div>
    </section>
  );
}

interface BoundaryProps {
  /** Clears the error when it changes, so navigating away recovers. */
  resetKey: string;
  children: ReactNode;
}

export class PageErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev: BoundaryProps) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }
    return (
      <section className="page page-loading page-error" role="alert">
        <div className="page-inner">
          <div className="pe-box">
            <h1>This page didn't load</h1>
            <p>
              Check your connection and try again. If the app was just updated, a reload fixes it.
            </p>
            <button type="button" className="pe-btn" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </section>
    );
  }
}
