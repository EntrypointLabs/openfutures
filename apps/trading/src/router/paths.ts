import { MARKETS } from "@/data/markets";
import type { TerminalState } from "@/terminal/Terminal";
import type { Screen } from "@/terminal/types";

export const WATCH_VIEWS = ["markets", "exchanges", "funding"] as const;
export const LIQUIDITY_VIEWS = ["vaults", "analytics"] as const;

export const ROUTED_KEYS = [
  "screen",
  "sym",
  "wview",
  "watchOpen",
  "lqView",
  "cpOpen",
  "account",
  "profile",
] as const;
export type RouteState = Partial<Pick<TerminalState, (typeof ROUTED_KEYS)[number]>>;

const SYMBOLS = new Map(MARKETS.map((market) => [market.sym.toLowerCase(), market.sym]));

function marketParam(value: string | null | undefined): string | null {
  return (value && SYMBOLS.get(value.toLowerCase())) || null;
}

export function routeFromUrl(pathname: string, search: string): RouteState | null {
  const route = matchRoute(pathname, search);
  return (
    route && { ...route, profile: !!route.profile || new URLSearchParams(search).has("profile") }
  );
}

function matchRoute(pathname: string, search: string): RouteState | null {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const [section, param, extra] = parts;
  if (extra) {
    return null;
  }
  switch (section) {
    case undefined:
      return { screen: "home" };
    case "trade": {
      const account = new URLSearchParams(search).get("account") === "prop" ? "prop" : "live";
      if (!param) {
        return { screen: "detail", account };
      }
      const sym = marketParam(param);
      return sym ? { screen: "detail", sym, account } : null;
    }
    case "watch": {
      const wview = param || "markets";
      if (!(WATCH_VIEWS as readonly string[]).includes(wview)) {
        return null;
      }
      return {
        screen: "watch",
        wview,
        watchOpen: marketParam(new URLSearchParams(search).get("market")),
      };
    }
    case "liquidity": {
      const lqView = param || "vaults";
      if (!(LIQUIDITY_VIEWS as readonly string[]).includes(lqView)) {
        return null;
      }
      return { screen: "liquidity", lqView };
    }
    case "prop":
      return param ? null : { screen: "prop", account: "prop" };
    case "copy": {
      try {
        return { screen: "copy", cpOpen: param ? decodeURIComponent(param) : null };
      } catch {
        return null;
      }
    }
    case "points":
      return param ? null : { screen: "points" };
    case "profile":
      return param ? null : { screen: "profile", profile: true };
    default:
      return null;
  }
}

export function urlFromState(state: TerminalState, isMobile: boolean): string {
  const url = pageUrl(state, isMobile);
  if (state.profile && !isMobile && url !== "/profile") {
    return url + (url.includes("?") ? "&" : "?") + "profile";
  }
  return url;
}

function pageUrl(state: TerminalState, isMobile: boolean): string {
  const screen: Screen = state.screen;
  const trade = "/trade/" + state.sym + (state.account === "prop" ? "?account=prop" : "");
  switch (screen) {
    case "home":
      return isMobile ? "/" : trade;
    case "watch": {
      const view = state.wview && state.wview !== "markets" ? "/" + state.wview : "";
      const market = state.watchOpen ? "?market=" + state.watchOpen : "";
      return "/watch" + view + market;
    }
    case "liquidity":
      return state.lqView === "analytics" ? "/liquidity/analytics" : "/liquidity";
    case "prop":
      return state.account === "prop" ? "/prop" : isMobile ? "/" : trade;
    case "copy":
      return state.cpOpen ? "/copy/" + encodeURIComponent(state.cpOpen) : "/copy";
    case "points":
      return "/points";
    case "profile":
      return isMobile || state.profile ? "/profile" : trade;
    default:
      return trade;
  }
}

export function titleFromState(state: TerminalState, isMobile: boolean): string {
  if (state.profile && !isMobile) {
    return "Profile · OpenFutures";
  }
  const page: Record<Screen, string> = {
    home: isMobile ? "Markets" : state.sym + "-PERP",
    detail: state.sym + "-PERP",
    watch: "Market Watch",
    liquidity: "Liquidity",
    prop: "Prop",
    copy: "Copy",
    points: "Points",
    profile: "Profile",
  };
  return (page[state.screen as Screen] || "Trade") + " · OpenFutures";
}
