import type { buildViewModel } from "./viewModel";

export type TerminalViewModel = ReturnType<typeof buildViewModel>;

export type Screen = "home" | "detail" | "watch" | "prop" | "liquidity" | "copy" | "points" | "profile";

/** Initial UI state, mainly used to deep-link into a screen or to script the app in tests. */
export interface AppProps {
  initialScreen?: Screen;
  initialTheme?: "dark" | "light";
  initialAccent?: string;
  initialAccount?: "live" | "prop";
  initialPropAccount?: string;
  initialChart?: "candle" | "line";
  initialSheet?: "closed" | "long" | "short";
  initialDrawer?: "closed" | "open";
  initialTab?: string;
  initialProfile?: "open";
  initialVenuePanel?: "open";
  initialWatchOpen?: string | null;
  initialWatchBook?: string | null;
  initialWview?: string;
  initialWdtab?: string;
  /** Merged over the default state; any state key is accepted. */
  initialState?: Record<string, unknown>;
  /** Embed the hosted TradingView widget instead of the built-in lightweight chart. */
  tvWidget?: boolean;
  /** Endpoint the assistant panel posts chat messages to. */
  aiEndpoint?: string;
  /** Proxy used by the in-app browser to load external pages. */
  browseProxy?: string;
}

/** The view model emits ARIA states as strings, exactly as they are written to the DOM. */
export type AriaBoolean = "true" | "false";
