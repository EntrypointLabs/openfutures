/** Shapes of the Market Watch view-model values, which the inferred vm types as `any`. */
import type { PointerEvent } from "react";
import type { AnalyticsDropdownControl } from "@/components/analytics/controls";
import type { ChartTooltipModel } from "@/components/common/ChartTooltip";
import type { IconToggleItem } from "@/components/common/IconToggle";
import type { PagerModel } from "@/components/common/Pager";
import type { AriaBoolean } from "@/terminal/types";

type Handler = () => void;
type PointerHandler = (event: PointerEvent<HTMLElement>) => void;

export interface Kpi {
  label?: string;
  help?: string;
  value?: string;
  hasSpark?: boolean;
  spark?: string;
  sparkCol?: string;
  hasChg?: boolean;
  chg?: string;
  chgCls?: string;
  sub?: string;
}

export interface VenueLogo {
  logo?: string;
  name?: string;
}

export interface MarketRow {
  groupCls?: string;
  num?: string;
  isOpen?: boolean;
  toggle?: Handler;
  trade?: Handler;
  logo?: string;
  sym?: string;
  lev?: string;
  name?: string;
  cat?: string;
  flash?: string;
  price?: string;
  dir?: string;
  chgText?: string;
  chgN?: string;
  volN?: string;
  oiN?: string;
  fundN?: string;
  topTextN?: string;
  spark?: string;
  sparkColor?: string;
  vol?: string;
  oi?: string;
  split?: { w?: string | number; c?: string }[];
  topLogo?: string;
  topText?: string;
  fund?: string;
  fundCls?: string;
  venues?: VenueLogo[];
  venuesM?: VenueLogo[];
}

export interface DetailChart {
  title?: string;
  value?: string;
  valCls?: string;
  lines?: { area?: string; fill?: string; d?: string; c?: string }[];
  barsUp?: string;
  barsDown?: string;
  zero?: string;
  hi?: string;
  lo?: string;
  tip?: ChartTooltipModel & { when?: string };
  move?: PointerHandler;
  leave?: PointerHandler;
  x?: { t?: string }[];
  legend?: { c?: string; label?: string; value?: string }[];
}

export interface DetailVenue {
  cls?: string;
  selected?: AriaBoolean | boolean;
  pick?: Handler;
  logo?: string;
  name?: string;
  native?: string;
  price?: string;
  fund?: string;
  fundCls?: string;
  share?: string | number;
  shareText?: string;
}

export interface DetailSelection {
  logo?: string;
  name?: string;
  dotCls?: string;
  lat?: string;
  book?: {
    bd?: string | number;
    bs?: string;
    bp?: string;
    ad?: string | number;
    ap?: string;
    as?: string;
  }[];
  spread?: string;
  basis?: string;
  specs?: { k?: string; v?: string }[];
  trade?: Handler;
}

export interface WatchDetail {
  name?: string;
  sym?: string;
  logo?: string;
  vwap?: string;
  chgText?: string;
  dir?: string;
  stats?: { label?: string; value?: string; cls?: string }[];
  favFill?: string;
  favPressed?: AriaBoolean | boolean;
  toggleFav?: Handler;
  share?: Handler;
  chart?: DetailChart;
  ex?: DetailVenue[];
  sel?: DetailSelection;
  selBook?: boolean;
  selSpecs?: boolean;
}

export interface Tick {
  y?: string | number;
  x?: string | number;
  label?: string;
  cls?: string;
}

export interface Toggle {
  label?: string;
  cls?: string;
  pressed?: AriaBoolean;
  pick?: Handler;
}

export interface WatchChart {
  title?: string;
  types?: IconToggleItem[];
  headline?: string;
  hasType?: boolean;
  hasSeg?: boolean;
  copy?: Handler;
  yTicks?: Tick[];
  xTicks?: Tick[];
  paths?: {
    d?: string;
    sw?: string | number;
    op?: string | number;
    fill?: string;
    stroke?: string;
  }[];
  hasZero?: boolean;
  zeroY?: string;
  tip?: ChartTooltipModel & { date?: string; total?: string };
  move?: PointerHandler;
  leave?: PointerHandler;
  ranges?: Toggle[];
  rangeText?: string;
  bDown?: PointerHandler;
  bMove?: PointerHandler;
  bUp?: PointerHandler;
  mini?: string;
  miniArea?: string;
  winL?: string;
  winW?: string;
  legend?: {
    cls?: string;
    pressed?: AriaBoolean;
    toggle?: Handler;
    color?: string;
    name?: string;
  }[];
}

export interface PerfRow {
  cls?: string;
  pressed?: AriaBoolean;
  toggle?: Handler;
  enter?: Handler;
  leave?: Handler;
  num?: string;
  color?: string;
  logo?: string;
  sym?: string;
  cells?: { cls?: string; v?: string }[];
}

export interface Perf {
  per?: AnalyticsDropdownControl;
  ranges?: Toggle[];
  yTicks?: Tick[];
  xTicks?: Tick[];
  lines?: { d?: string; w?: string | number; op?: string | number; color?: string }[];
  tip?: ChartTooltipModel & { date?: string };
  move?: PointerHandler;
  leave?: PointerHandler;
  heads?: { label?: string; cls?: string; arrow?: string; pick?: Handler }[];
  rows?: PerfRow[];
  asOf?: string;
}

export interface Weekly {
  sub?: string;
  total?: string;
  yTicks?: Tick[];
  xTicks?: Tick[];
  paths?: { d?: string; color?: string }[];
  tip?: ChartTooltipModel & { date?: string; total?: string };
  move?: PointerHandler;
  leave?: PointerHandler;
  legend?: { color?: string; name?: string }[];
  canReset?: boolean;
  reset?: Handler;
}

export interface LeagueRow {
  open?: Handler;
  rank?: string;
  hasLogo?: boolean;
  logo?: string;
  venue?: string;
  hasDot?: boolean;
  dot?: string;
  name?: string;
  count?: string;
  oi?: string;
  vol?: string;
  d30?: string;
  d30Cls?: string;
  share?: string;
  shareW?: string | number;
}

export interface League {
  tabs?: Toggle[];
  heads?: { label?: string; cls?: string; pick?: Handler }[];
  rows?: LeagueRow[];
  pager?: PagerModel;
}

export interface ExchangeCard {
  logo?: string;
  name?: string;
  type?: string;
  markets?: string | number;
  latChip?: string;
  latLabel?: string;
  headline?: string;
  oi?: string;
  chg?: string;
  chgCls?: string;
  area?: string;
  spark?: string;
  sparkCol?: string;
  share?: string;
  rank?: string;
  shareW?: string | number;
  color?: string;
  vol?: string;
  turn?: string;
  ls?: string;
  lsCls?: string;
  funding?: string;
  fundCls?: string;
  liq?: string;
  topLogo?: string;
  top?: string;
}

export interface ExchangeRow extends ExchangeCard {
  oi?: string;
  isOpen?: boolean;
  groupCls?: string;
  toggle?: Handler;
  host?: string;
  d30?: string;
  d30Cls?: string;
  shareN?: string;
  turnN?: string;
  liqN?: string;
  num?: string;
  logo?: string;
  name?: string;
  type?: string;
  url?: string;
  chain?: string;
  markets?: string | number;
  vol?: string;
  volN?: string;
  oiN?: string;
  topVol?: string;
  topVolLogo?: string;
  topOi?: string;
  topOiLogo?: string;
  fMinN?: string;
  fMaxN?: string;
  dotCls?: string;
  status?: string;
  lat?: string;
  latCls?: string;
  updated?: string;
}

export interface CarryItem {
  trade?: Handler;
  logo?: string;
  sym?: string;
  longLogo?: string;
  longName?: string;
  longRate?: string;
  shortLogo?: string;
  shortName?: string;
  shortRate?: string;
  apr?: string;
  est?: string;
}

export interface FundingRow {
  isOpen?: boolean;
  openCls?: string;
  toggle?: Handler;
  carry?: string;
  num?: string;
  logo?: string;
  sym?: string;
  spread?: string;
  longLogo?: string;
  longName?: string;
  shortLogo?: string;
  shortName?: string;
  cells?: { mcls?: string; logo?: string; vn?: string; bg?: string; fg?: string; v?: string }[];
}
