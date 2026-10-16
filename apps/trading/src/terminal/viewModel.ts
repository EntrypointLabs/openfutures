import type { Terminal } from "@/terminal/Terminal";
import { historyCandles } from "@openfutures/core";
import { LOGOS } from "@/assets/logos";
import { LIVE_BALANCE, liveTradeHistory } from "@/data/account";
import { MARKETS } from "@/data/markets";
import { MARKET_CATEGORIES } from "@openfutures/core";
import { PROP_PLANS } from "@/data/prop";
import { TIMEFRAMES } from "@/data/timeframes";
import { VENUES, VENUE_COLORS } from "@/data/venues";
import { MONTHS, WEEKDAYS, pad2 } from "@openfutures/core";
import {
  formatChange,
  formatCompact,
  formatPrice,
  formatQty,
  formatSignedUsd,
  formatUsd,
  parseCompact,
} from "@openfutures/core";
import { ICON_PATHS, type IconName } from "@/lib/icons";
import { identicon } from "@/lib/identicon";
import { buildOrderBook, simulateFill } from "@openfutures/core";
import { livePrices } from "@/lib/prices";
import { hashString, seededRandom } from "@openfutures/core";
import { niceStep, seededPriceSeries, sparklinePath } from "@openfutures/core";
import { renderShareCard, saveNodeSnapshot } from "@/lib/snapshot";
import { DEFAULT_PANE_SIZES } from "@/terminal/layout";
import { buildLiquidityViewModel } from "@/terminal/liquidity/viewModel";
import { buildCopyViewModel } from "@/terminal/copy/viewModel";
import { buildPointsViewModel } from "@/terminal/points/viewModel";
import { enhanceWatchViewModel } from "@/terminal/watch/viewModel";

const seriesCache = new Map<string, number[]>();

/**
 * Derives everything the components render, and the handlers they call, from the terminal's state.
 * Ported from the original bundle: values that flow from `state` are still loosely typed.
 */
export function buildViewModel(terminal: Terminal) {
  var self = terminal;
  var state = terminal.state;
  const viewportWidth = state.vw || (typeof window !== "undefined" ? window.innerWidth : 1440);
  const isMobile = viewportWidth < 768;
  if (!isMobile && state.screen === "home") {
    state = { ...state, screen: "detail" };
  }
  if (state.account !== "prop" && state.screen === "prop") {
    state = { ...state, screen: isMobile ? "home" : "detail" };
  }
  var market: any = MARKETS.filter((m) => m.sym === state.sym)[0];
  const timeframe = TIMEFRAMES.filter((tf) => tf.id === state.tf)[0];
  const effectiveLeverage = Math.min(state.lev, market.max);
  const isLong = state.side === "long";
  var venueById: any = {};
  VENUES.forEach((venue) => {
    venueById[venue.id] = venue;
  });
  const availableVenues = VENUES.filter(
    (venue) => !market.venues || market.venues.indexOf(venue.id) > -1,
  );
  let selectedVenueId =
    state.venue[market.sym] &&
    (!market.venues || market.venues.indexOf(state.venue[market.sym]) > -1)
      ? state.venue[market.sym]
      : availableVenues[0].id;
  let isBestRouting = !state.venue[market.sym] || state.venue[market.sym] === "best";
  if (isBestRouting) {
    selectedVenueId = availableVenues[0].id;
  }
  if (
    state.routing === "off" &&
    !state.venue[market.sym] &&
    state.prefVenue &&
    availableVenues.filter((venue) => venue.id === state.prefVenue).length
  ) {
    selectedVenueId = state.prefVenue;
    isBestRouting = false;
  }
  let activeVenue = venueById[selectedVenueId];
  var isPropAccount = state.account === "prop";
  function findMarket(symbol: any) {
    return MARKETS.filter((m) => m.sym === symbol)[0];
  }
  function getMidPrice(symbol: any, venueId: any) {
    const book = buildOrderBook(findMarket(symbol), venueById[venueId]);
    return (book.asks[0].p + book.bids[0].p) / 2;
  }
  function sumPositions(positions: any) {
    let upnl = 0;
    let margin = 0;
    positions.forEach((position: any) => {
      upnl +=
        (getMidPrice(position.sym, position.venue) - position.entry) *
        position.qty *
        (position.side === "long" ? 1 : -1);
      margin += (position.entry * position.qty) / position.lev;
    });
    return { upnl: upnl, margin: margin };
  }
  const propAccount = {
    status: "none",
    size: 25000,
    realized: 0,
    dayStart: null,
    days: 0,
    ...(state.pa || {}),
  };
  const accountSize = propAccount.size;
  const propBalance = propAccount.size + (propAccount.realized || 0);
  const dayStartEquity = propAccount.dayStart || propAccount.size;
  const liveTotals = sumPositions(state.positions);
  const propTotals = sumPositions(state.propPositions || []);
  const liveEquity = LIVE_BALANCE + liveTotals.upnl;
  const propEquity = propBalance + propTotals.upnl;
  const dailyLossLeft = Math.max(0, accountSize * 0.05 - Math.max(0, dayStartEquity - propEquity));
  const maxLossLeft = Math.max(0, propEquity - accountSize * 0.9);
  const freeBalance = isPropAccount
    ? propEquity - propTotals.margin
    : LIVE_BALANCE - liveTotals.margin;
  const liveFreeBalance = LIVE_BALANCE - liveTotals.margin;
  function makeSelectMarket(symbol: any, venueId?: any) {
    return () => {
      const venueSelection = { ...state.venue };
      if (venueId) {
        venueSelection[symbol] = venueId;
      }
      self.setState({
        sym: symbol,
        venue: venueSelection,
        hover: null,
        screen: "detail",
        drawer: "closed",
        vpanel: false,
        watchOpen: null,
        profile: false,
        limit: "",
      });
    };
  }
  function closeOverlays() {
    self.setState({
      sheet: "closed",
      drawer: "closed",
      vpanel: false,
      profile: false,
      watchOpen: isMobile ? null : state.watchOpen,
    });
  }
  const avgMarketChange = MARKETS.reduce((sum, m) => sum + m.chg, 0) / MARKETS.length;
  var searchQuery = state.query.trim().toLowerCase();
  let filteredMarkets = MARKETS.filter(
    (m) =>
      !searchQuery ||
      m.sym.toLowerCase().indexOf(searchQuery) > -1 ||
      m.name.toLowerCase().indexOf(searchQuery) > -1,
  );
  if (state.filter !== "all") {
    filteredMarkets = filteredMarkets.filter((m) => m.cat === state.filter);
  }
  const marketListRows = filteredMarkets.map((m) => {
    const sparkline = sparklinePath(
      seededPriceSeries(m.sym + "spark", 36, m.price, 0.03, m.chg / 3600),
      100,
      32,
      3,
    );
    return {
      sym: m.sym,
      name: m.name,
      lev: m.max + "x",
      logo: LOGOS[m.sym.toLowerCase()],
      priceText: "$" + formatPrice(m.price),
      chgText: formatChange(m.chg),
      dir: m.chg >= 0 ? "up" : "down",
      spark: sparkline.line,
      sparkColor: m.chg >= 0 ? "var(--c-up)" : "var(--c-dn)",
      activeCls: m.sym === state.sym ? "is-active" : "",
      pick: makeSelectMarket(m.sym),
    };
  });
  function getFlashClass(symbol: any) {
    const livePrice = livePrices[symbol];
    const m = findMarket(symbol);
    if (!livePrice || !m || livePrice === m.price) {
      return "";
    } else {
      return (m.price > livePrice ? "fl-up" : "fl-dn") + ((state.tick || 0) % 2 ? "-a" : "-b");
    }
  }
  const tickerItems = MARKETS.map((m) => ({
    sym: m.sym,
    logo: LOGOS[m.sym.toLowerCase()],
    chgText: (m.chg >= 0 ? "+" : "") + m.chg.toFixed(2) + "%",
    dir: (m.chg >= 0 ? "up" : "down") + " " + getFlashClass(m.sym),
    pick: makeSelectMarket(m.sym),
  }));
  const categoryPills = MARKET_CATEGORIES.map((category) => {
    const isActive = state.filter === category[0];
    return {
      label: category[1],
      cls: isActive ? "pill is-active" : "pill",
      pressed: isActive ? "true" : "false",
      pick: () => {
        self.setState({ filter: category[0] });
      },
    };
  });
  const orderBooks: any = {};
  VENUES.forEach((venue) => {
    orderBooks[venue.id] = buildOrderBook(market, venue);
  });
  const isBuy = state.side === "long";
  const orderNotional = (parseFloat(state.size) || 0) * Math.min(state.lev, market.max);
  const bestVenue: any = availableVenues.slice().sort((venueA, venueB) => {
    const fillA = simulateFill(
      isBuy ? orderBooks[venueA.id].asks : orderBooks[venueA.id].bids,
      orderNotional || 1,
      isBuy,
    );
    const fillB = simulateFill(
      isBuy ? orderBooks[venueB.id].asks : orderBooks[venueB.id].bids,
      orderNotional || 1,
      isBuy,
    );
    const priceA = fillA.partial ? (isBuy ? 1000000000000000000 : -1000000000000000000) : fillA.avg;
    const priceB = fillB.partial ? (isBuy ? 1000000000000000000 : -1000000000000000000) : fillB.avg;
    if (isBuy) {
      return priceA - priceB;
    } else {
      return priceB - priceA;
    }
  })[0];
  if (isBestRouting) {
    activeVenue = bestVenue;
  }
  const activeBook = orderBooks[activeVenue.id];
  function getVenueMid(venue: any) {
    const book = orderBooks[venue.id];
    return (book.asks[0].p + book.bids[0].p) / 2;
  }
  const midPrice = getVenueMid(activeVenue);
  const totalVenueWeight = availableVenues.reduce((sum, venue) => sum + venue.mul, 0);
  const marketVolume = parseCompact(market.vol);
  const marketOpenInterest = parseCompact(market.oi);
  function getEffectivePrice(venue: any) {
    const book = orderBooks[venue.id];
    if (isLong) {
      return book.asks[0].p * (1 + venue.fee / 100);
    } else {
      return book.bids[0].p * (1 - venue.fee / 100);
    }
  }
  const effectivePrices = availableVenues.map(getEffectivePrice);
  availableVenues[
    effectivePrices.indexOf(
      isLong ? Math.min.apply(null, effectivePrices) : Math.max.apply(null, effectivePrices),
    )
  ].id;
  availableVenues.slice().sort((a, b) => a.fee - b.fee)[0].id;
  availableVenues.slice().sort((a, b) => a.fund - b.fund)[0].id;
  availableVenues.slice().sort((a, b) => b.mul - a.mul)[0].id;
  const quoteNotional = orderNotional > 0 ? orderNotional : 1000;
  const venueQuotes = availableVenues.map((venue) => {
    const book = orderBooks[venue.id];
    const mid = getVenueMid(venue);
    const quoteFill = simulateFill(isBuy ? book.asks : book.bids, quoteNotional, isBuy);
    return {
      v: venue,
      md: mid,
      top: isBuy ? book.asks[0].p : book.bids[0].p,
      fill: quoteFill,
      fee: venue.fee,
      fund: venue.fund,
      spr: ((book.asks[0].p - book.bids[0].p) / mid) * 10000,
      vol: (marketVolume * venue.mul) / totalVenueWeight,
    };
  });
  const fullFillQuotes = venueQuotes.filter((quote) => !quote.fill.partial);
  const bestFillAvg = fullFillQuotes.length
    ? isBuy
      ? Math.min.apply(
          null,
          fullFillQuotes.map((quote) => quote.fill.avg),
        )
      : Math.max.apply(
          null,
          fullFillQuotes.map((quote) => quote.fill.avg),
        )
    : 0;
  function makeQualityClassifier(key: any, lowerIsBetter: any) {
    const values = venueQuotes.map((quote: any) => quote[key]);
    const minValue = Math.min.apply(null, values);
    const maxValue = Math.max.apply(null, values);
    return (value: any) => {
      if (maxValue - minValue < 1e-12) {
        return "";
      }
      const best = lowerIsBetter ? minValue : maxValue;
      const worst = lowerIsBetter ? maxValue : minValue;
      if (Math.abs(value - best) < 1e-12) {
        return "good";
      } else if (Math.abs(value - worst) < 1e-12) {
        return "bad";
      } else {
        return "";
      }
    };
  }
  const priceQuality = makeQualityClassifier("top", isBuy);
  const feeQuality = makeQualityClassifier("fee", true);
  const fundingQuality = makeQualityClassifier("fund", isBuy);
  const spreadQuality = makeQualityClassifier("spr", true);
  const volumeQuality = makeQualityClassifier("vol", false);
  const extraCosts = venueQuotes.map((quote) => {
    if (quote.fill.partial) {
      return Infinity;
    } else {
      return Math.abs(quote.fill.avg - bestFillAvg) * quote.fill.qty;
    }
  });
  const finiteExtraCosts = extraCosts.filter((cost) => isFinite(cost));
  const maxExtraCost = finiteExtraCosts.length ? Math.max.apply(null, finiteExtraCosts) : 0;
  const venueRows = venueQuotes
    .map((quote, index) => {
      const venue: any = quote.v;
      const extraCost = extraCosts[index];
      const isCheapest = isFinite(extraCost) && extraCost < 0.005;
      return {
        vid: venue.id,
        name: venue.name,
        logo: venue.logo,
        cost: isFinite(extraCost)
          ? isCheapest
            ? ""
            : "+" + formatUsd(extraCost)
          : "Not enough depth",
        isCheapest: isCheapest,
        costCls: isFinite(extraCost)
          ? isCheapest
            ? "good"
            : maxExtraCost > 0 && extraCost >= maxExtraCost - 1e-9
              ? "bad"
              : ""
          : "bad",
        price: "$" + formatPrice(quote.top),
        priceCls: priceQuality(quote.top),
        fee: venue.fee.toFixed(3) + "%",
        feeCls: feeQuality(quote.fee),
        funding: quote.fund.toFixed(4) + "%",
        fundCls: fundingQuality(quote.fund),
        spread: quote.spr.toFixed(1) + " bps",
        spreadCls: spreadQuality(quote.spr),
        vol: "$" + formatCompact(quote.vol),
        volCls: volumeQuality(quote.vol),
        sortKey: isFinite(extraCost) ? extraCost : 1000000000000000000,
        pick: null,
      };
    })
    .sort((a, b) => a.sortKey - b.sortKey);
  venueRows.forEach((row: any, index) => {
    const isTop = index === 0;
    const isSelected = isBestRouting ? isTop : row.vid === activeVenue.id;
    row.isTop = isTop;
    row.isSel = isSelected;
    row.selected = isSelected ? "true" : "false";
    row.cls = (isTop ? "is-top" : "") + (isSelected ? " is-selected" : "");
    row.radio = "radio" + (isSelected ? " on" : "") + (isSelected && isTop ? " top" : "");
    row.costText = isTop ? "Lowest cost" : row.cost;
    row.costSub = isTop ? "for this order" : row.cost === "Not enough depth" ? "" : "more";
    if (isTop) {
      row.costCls = "";
    }
    row.pick = () => {
      const venueSelection = { ...state.venue };
      venueSelection[market.sym] = isTop ? "best" : row.vid;
      self.setState({ venue: venueSelection, vpanel: false, hover: null, limit: "", qOpen: false });
    };
  });
  const venueBasePrice = market.base * (1 + activeVenue.off / 10000);
  const priceSeries = seededPriceSeries(
    market.sym + timeframe.id,
    timeframe.n,
    venueBasePrice,
    timeframe.vol,
    market.chg0 / 100 / timeframe.n,
  );
  priceSeries[priceSeries.length - 1] = midPrice;
  const visibleBars = isMobile ? Math.round(timeframe.n / 2) : timeframe.n;
  const visiblePrices = priceSeries.slice(priceSeries.length - visibleBars);
  const ohlcRandom = seededRandom(hashString(market.sym + timeframe.id + "ohlc"));
  const candles = visiblePrices.map((price, index) => {
    const openPrice = index
      ? visiblePrices[index - 1]
      : price * (1 + (ohlcRandom() - 0.5) * timeframe.vol);
    let highPrice = Math.max(openPrice, price) * (1 + ohlcRandom() * timeframe.vol * 0.7);
    let lowPrice = Math.min(openPrice, price) * (1 - ohlcRandom() * timeframe.vol * 0.7);
    let volume =
      (0.35 + ohlcRandom()) * (1 + (Math.abs(price - openPrice) / openPrice / timeframe.vol) * 2.5);
    if (index === visiblePrices.length - 1) {
      const barProgress = (state.now % timeframe.ms) / timeframe.ms;
      highPrice = Math.max(highPrice, openPrice, price);
      lowPrice = Math.min(lowPrice, openPrice, price);
      volume = volume * (0.25 + barProgress * 0.75);
    }
    return { o: openPrice, h: highPrice, l: lowPrice, c: price, v: volume };
  });
  const isCandle = state.chart === "candle";
  const tvRandom = seededRandom(hashString(market.sym + timeframe.id + "tv"));
  const currentBarTime = Math.floor(state.now / timeframe.ms) * timeframe.ms;
  const baseBarVolume = (parseCompact(market.vol) || 1000000) / 96;
  const tvBars = priceSeries.map((price, index) => {
    const openPrice = index
      ? priceSeries[index - 1]
      : price * (1 + (tvRandom() - 0.5) * timeframe.vol);
    let highPrice = Math.max(openPrice, price) * (1 + tvRandom() * timeframe.vol * 0.7);
    let lowPrice = Math.min(openPrice, price) * (1 - tvRandom() * timeframe.vol * 0.7);
    let volume =
      (0.35 + tvRandom()) *
      (1 + (Math.abs(price - openPrice) / openPrice / timeframe.vol) * 2.5) *
      baseBarVolume;
    if (index === priceSeries.length - 1) {
      highPrice = Math.max(highPrice, openPrice, price);
      lowPrice = Math.min(lowPrice, openPrice, price);
      volume *= 0.25 + ((state.now % timeframe.ms) / timeframe.ms) * 0.75;
    }
    return {
      time: Math.floor((currentBarTime - (priceSeries.length - 1 - index) * timeframe.ms) / 1000),
      open: openPrice,
      high: highPrice,
      low: lowPrice,
      close: price,
      value: volume,
    };
  });
  const historyCount = Math.max(0, timeframe.history - tvBars.length);
  const firstBarTime = tvBars[0].time;
  const chartBars = historyCandles(
    market.sym + timeframe.id + activeVenue.id + "history",
    historyCount,
    tvBars[0].open,
    timeframe.vol,
    baseBarVolume,
  )
    .map((candle, index) => ({
      time: firstBarTime - ((historyCount - index) * timeframe.ms) / 1000,
      ...candle,
    }))
    .concat(tvBars);
  const tvSymbols: any = {
    BTC: "BINANCE:BTCUSDT.P",
    ETH: "BINANCE:ETHUSDT.P",
    SOL: "BINANCE:SOLUSDT.P",
    SUI: "BINANCE:SUIUSDT.P",
    HYPE: "BYBIT:HYPEUSDT.P",
    PEPE: "BINANCE:1000PEPEUSDT.P",
    XRP: "BINANCE:XRPUSDT.P",
    DOGE: "BINANCE:DOGEUSDT.P",
    NVDA: "NASDAQ:NVDA",
    TSLA: "NASDAQ:TSLA",
    AAPL: "NASDAQ:AAPL",
    US500: "FOREXCOM:SPXUSD",
    US100: "FOREXCOM:NSXUSD",
    US30: "FOREXCOM:DJI",
    XAU: "OANDA:XAUUSD",
    WTI: "TVC:USOIL",
    EURUSD: "FX:EURUSD",
    GBPUSD: "FX:GBPUSD",
    USDJPY: "FX:USDJPY",
  };
  const tvIntervals: any = { "15m": "15", "1h": "60", "4h": "240", "1d": "D", "1w": "W" };
  self._tvData = {
    sym: market.sym,
    tf: timeframe.id,
    bars: chartBars,
    recentBars: tvBars.length,
    candle: isCandle,
    theme: state.theme || "dark",
    tvSymbol: tvSymbols[market.sym] || "BINANCE:" + market.sym + "USDT.P",
    interval: tvIntervals[String(timeframe.id).toLowerCase()] || "60",
    dec: Math.max(2, Math.min(8, (String(formatPrice(market.price)).split(".")[1] || "").length)),
  };
  if (typeof window !== "undefined") {
    clearTimeout(self._tvT);
    self._tvT = setTimeout(() => {
      self.syncTv();
    }, 0);
  }
  const minPrice = isCandle
    ? Math.min.apply(
        null,
        candles.map((candle) => candle.l),
      )
    : Math.min.apply(null, visiblePrices);
  const maxPrice = isCandle
    ? Math.max.apply(
        null,
        candles.map((candle) => candle.h),
      )
    : Math.max.apply(null, visiblePrices);
  const priceRange = maxPrice - minPrice || 1;
  const chartPadding = 22;
  const chartHeight = 300;
  function priceToY(price: any) {
    return chartPadding + (1 - (price - minPrice) / priceRange) * (chartHeight - chartPadding * 2);
  }
  var slotWidth = 1000 / visibleBars;
  function indexToX(index: any) {
    return (index + 0.5) * slotWidth;
  }
  var candleWidth = slotWidth * 0.62;
  let upWickPath = "";
  let downWickPath = "";
  let upBodyPath = "";
  let downBodyPath = "";
  let upVolumePath = "";
  let downVolumePath = "";
  const maxCandleVolume = Math.max.apply(
    null,
    candles.map((candle) => candle.v),
  );
  candles.forEach((candle, index) => {
    const centerX = indexToX(index).toFixed(2);
    const isUp = candle.c >= candle.o;
    const wickPath =
      "M" + centerX + " " + priceToY(candle.h).toFixed(2) + "V" + priceToY(candle.l).toFixed(2);
    const bodyTop = Math.min(priceToY(candle.o), priceToY(candle.c));
    let bodyBottom = Math.max(priceToY(candle.o), priceToY(candle.c));
    if (bodyBottom - bodyTop < 0.8) {
      bodyBottom = bodyTop + 0.8;
    }
    const bodyLeft = (indexToX(index) - candleWidth / 2).toFixed(2);
    const bodyRight = (indexToX(index) + candleWidth / 2).toFixed(2);
    const bodyPath =
      "M" +
      bodyLeft +
      " " +
      bodyTop.toFixed(2) +
      "H" +
      bodyRight +
      "V" +
      bodyBottom.toFixed(2) +
      "H" +
      bodyLeft +
      "Z";
    const volumeHeight = (candle.v * 56) / maxCandleVolume;
    const volumePath =
      "M" +
      bodyLeft +
      " 60H" +
      bodyRight +
      "V" +
      (60 - volumeHeight).toFixed(2) +
      "H" +
      bodyLeft +
      "Z";
    if (isUp) {
      upWickPath += wickPath;
      upBodyPath += bodyPath;
      upVolumePath += volumePath;
    } else {
      downWickPath += wickPath;
      downBodyPath += bodyPath;
      downVolumePath += volumePath;
    }
  });
  const linePath =
    "M" +
    visiblePrices
      .map((price, index) => indexToX(index).toFixed(2) + " " + priceToY(price).toFixed(2))
      .join(" L");
  const areaPath =
    linePath +
    " L" +
    indexToX(visibleBars - 1).toFixed(2) +
    " 300 L" +
    indexToX(0).toFixed(2) +
    " 300 Z";
  for (
    var gridStep = niceStep(priceRange),
      gridLabels = [],
      gridPath = "",
      gridPrice = Math.ceil(minPrice / gridStep) * gridStep;
    gridPrice <= maxPrice;
    gridPrice += gridStep
  ) {
    const gridY = priceToY(gridPrice);
    if (!(gridY < 8) && !(gridY > 292)) {
      gridLabels.push({
        y: (gridY / 3).toFixed(2),
        label:
          gridStep < 1
            ? gridPrice.toFixed(Math.max(2, Math.ceil(-Math.log10(gridStep))))
            : formatPrice(gridPrice),
      });
      gridPath += "M0 " + gridY.toFixed(2) + "H1000";
    }
  }
  const currentBarStart = Math.floor(state.now / timeframe.ms) * timeframe.ms;
  function getBarDate(index: any) {
    return new Date(currentBarStart - (visibleBars - 1 - index) * timeframe.ms);
  }
  function formatAxisTime(date: any) {
    if (timeframe.id === "15m") {
      return pad2(date.getUTCHours()) + ":" + pad2(date.getUTCMinutes());
    } else if (timeframe.id === "1H") {
      return (
        MONTHS[date.getUTCMonth()] +
        " " +
        date.getUTCDate() +
        " " +
        pad2(date.getUTCHours()) +
        ":00"
      );
    } else if (timeframe.id === "1W") {
      return MONTHS[date.getUTCMonth()] + " ’" + String(date.getUTCFullYear()).slice(2);
    } else {
      return MONTHS[date.getUTCMonth()] + " " + date.getUTCDate();
    }
  }
  function formatTooltipTime(date: any) {
    const dayLabel =
      WEEKDAYS[date.getUTCDay()] + " " + MONTHS[date.getUTCMonth()] + " " + date.getUTCDate();
    if (timeframe.intra) {
      return dayLabel + ", " + pad2(date.getUTCHours()) + ":" + pad2(date.getUTCMinutes()) + " UTC";
    } else {
      return dayLabel + ", " + date.getUTCFullYear();
    }
  }
  const axisTicks = [0.06, 0.24, 0.42, 0.6, 0.78, 0.94].map((fraction) => {
    const index = Math.round(fraction * (visibleBars - 1));
    return { x: (indexToX(index) / 10).toFixed(2), t: formatAxisTime(getBarDate(index)) };
  });
  const hoverIndex = state.hover == null ? visibleBars - 1 : Math.min(state.hover, visibleBars - 1);
  const hoveredCandle = candles[hoverIndex];
  const hoveredClose = hoveredCandle.c;
  const firstOpen = candles[0].o;
  const periodChange = hoveredClose - firstOpen;
  const periodChangePct = (periodChange / firstOpen) * 100;
  const absPeriodChange = Math.abs(periodChange);
  const periodChangeText =
    (periodChange >= 0 ? "▲ $" : "▼ $") +
    (absPeriodChange >= 1
      ? absPeriodChange.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : formatPrice(absPeriodChange)) +
    " (" +
    Math.abs(periodChangePct).toFixed(2) +
    "%)";
  const crosshairX = indexToX(hoverIndex) / 10;
  const crosshairLineY = priceToY(hoveredClose) / 3;
  const crosshairYFraction = isCandle ? state.hy : crosshairLineY / 100;
  const crosshairPrice =
    minPrice +
    (1 - (crosshairYFraction * chartHeight - chartPadding) / (chartHeight - chartPadding * 2)) *
      priceRange;
  const hoveredChangePct = ((hoveredCandle.c - hoveredCandle.o) / hoveredCandle.o) * 100;
  const hoveredVolume =
    ((marketVolume * activeVenue.mul) / totalVenueWeight) *
    (timeframe.ms / 86400000) *
    (0.4 + hoveredCandle.v / maxCandleVolume);
  const hoverInfo = {
    o: formatPrice(hoveredCandle.o),
    h: formatPrice(hoveredCandle.h),
    l: formatPrice(hoveredCandle.l),
    c: formatPrice(hoveredCandle.c),
    dir: hoveredCandle.c >= hoveredCandle.o ? "up" : "down",
    chg: (hoveredChangePct >= 0 ? "+" : "") + hoveredChangePct.toFixed(2) + "%",
    vol: "$" + formatCompact(hoveredVolume),
    time: formatTooltipTime(getBarDate(hoverIndex)),
  };
  let highIndex = 0;
  let lowIndex = 0;
  candles.forEach((candle, index) => {
    if (
      (isCandle ? candle.h : candle.c) > (isCandle ? candles[highIndex].h : candles[highIndex].c)
    ) {
      highIndex = index;
    }
    if ((isCandle ? candle.l : candle.c) < (isCandle ? candles[lowIndex].l : candles[lowIndex].c)) {
      lowIndex = index;
    }
  });
  const lastCandle = candles[visibleBars - 1];
  function handleChartPointer(e: any) {
    const point = e.touches && e.touches.length ? e.touches[0] : e;
    const rect = e.currentTarget.getBoundingClientRect();
    const xFraction = Math.max(0, Math.min(0.9999, (point.clientX - rect.left) / rect.width));
    const yFraction = Math.max(0, Math.min(1, (point.clientY - rect.top) / rect.height));
    self.setState({ hover: Math.floor(xFraction * visibleBars), hy: yFraction });
  }
  var secondsToFunding: any = 3600 - (Math.floor(state.now / 1000) % 3600);
  const fundingCountdown =
    pad2(Math.floor(secondsToFunding / 60)) + ":" + pad2(secondsToFunding % 60);
  const statItems = [
    { label: "Mark Price", value: "$" + formatPrice(midPrice * 0.99998) },
    { label: "Index Price", value: "$" + formatPrice(market.price * 0.99991) },
    {
      label: "24h Volume",
      value: "$" + formatCompact((marketVolume * activeVenue.mul) / totalVenueWeight),
    },
    {
      label: "Open Interest",
      value: "$" + formatCompact((marketOpenInterest * activeVenue.mul) / totalVenueWeight),
    },
    { label: "Funding, next in " + fundingCountdown, value: activeVenue.fund.toFixed(4) + "%" },
    { label: "Taker Fee", value: activeVenue.fee.toFixed(3) + "%" },
  ];
  let askCumTotal = 0;
  let bidCumTotal = 0;
  const viewportHeight = state.vh || (typeof window !== "undefined" ? window.innerHeight : 900);
  const bookAvailableHeight =
    viewportHeight - 56 - 36 - 16 - 8 - (state.dockOpen ? state.dockH : 46);
  const bookRowCount = Math.max(3, Math.min(12, Math.floor((bookAvailableHeight - 160) / 2 / 24)));
  const tickMultipliers = [1, 2, 5, 10];
  const tickMultiplier = tickMultipliers[(state.tickIdx || 0) % tickMultipliers.length];
  const tickSize = Math.pow(10, Math.floor(Math.log10(midPrice)) - 4) * tickMultiplier;
  function groupLevels(levels: any, roundUp: any) {
    if (tickMultiplier === 1) {
      return levels;
    }
    const grouped: any[] = [];
    const indexByKey: any = {};
    levels.forEach((level: any) => {
      const bucketPrice =
        (roundUp ? Math.ceil(level.p / tickSize) : Math.floor(level.p / tickSize)) * tickSize;
      const bucketKey = bucketPrice.toFixed(10);
      if (indexByKey[bucketKey] == null) {
        indexByKey[bucketKey] = grouped.length;
        grouped.push({ p: bucketPrice, usd: 0 });
      }
      grouped[indexByKey[bucketKey]].usd += level.usd;
    });
    return grouped;
  }
  const groupedAsks = groupLevels(activeBook.asks, true);
  const groupedBids = groupLevels(activeBook.bids, false);
  const askRows = groupedAsks.slice(0, bookRowCount).map((level: any) => {
    askCumTotal += level.usd;
    return { p: level.p, usd: level.usd, cum: askCumTotal };
  });
  const bidRows = groupedBids.slice(0, bookRowCount).map((level: any) => {
    bidCumTotal += level.usd;
    return { p: level.p, usd: level.usd, cum: bidCumTotal };
  });
  const maxCumulative = Math.max(askCumTotal, bidCumTotal);
  var isBaseUnit = state.bookUnit === "base";
  function formatBookSize(usd: any, price: any) {
    if (!isBaseUnit) {
      return formatCompact(usd);
    }
    const amount = usd / price;
    if (amount >= 1000) {
      return formatCompact(amount);
    } else if (amount >= 10) {
      return amount.toFixed(1);
    } else if (amount >= 1) {
      return amount.toFixed(2);
    } else {
      return amount.toFixed(3);
    }
  }
  function formatBookLevel(level: any) {
    return {
      price: formatPrice(level.p),
      size: formatBookSize(level.usd, level.p),
      total: formatBookSize(level.cum, level.p),
      depth: ((level.cum / maxCumulative) * 100).toFixed(1),
    };
  }
  const bidSharePct = Math.round((bidCumTotal / (askCumTotal + bidCumTotal)) * 100);
  const marginAmount = parseFloat(state.size) || 0;
  const positionNotional = marginAmount * effectiveLeverage;
  const marketFill = simulateFill(
    isLong ? activeBook.asks : activeBook.bids,
    positionNotional,
    isLong,
  );
  const hasFullFill = positionNotional > 0 && marketFill.qty > 0 && !marketFill.partial;
  const entryPrice =
    state.otype === "limit"
      ? parseFloat(state.limit) || midPrice
      : hasFullFill
        ? marketFill.avg
        : midPrice;
  const liquidationPrice = isLong
    ? entryPrice * (1 - 0.9 / effectiveLeverage)
    : entryPrice * (1 + 0.9 / effectiveLeverage);
  let betterVenue: any = null;
  if (hasFullFill && state.otype === "market" && !isBestRouting) {
    availableVenues.forEach((venue) => {
      if (venue.id !== activeVenue.id) {
        const altFill = simulateFill(
          isLong ? orderBooks[venue.id].asks : orderBooks[venue.id].bids,
          positionNotional,
          isLong,
        );
        if (!altFill.partial && !!altFill.qty) {
          const saving =
            (isLong ? marketFill.avg - altFill.avg : altFill.avg - marketFill.avg) * marketFill.qty;
          if (saving > 0.05 && (!betterVenue || saving > betterVenue.save)) {
            betterVenue = { v: venue, save: saving };
          }
        }
      }
    });
  }
  let submitLabel = (isLong ? "Long " : "Short ") + market.sym + " at " + effectiveLeverage + "x";
  let isSubmitDisabled = false;
  if (marginAmount <= 0) {
    submitLabel = "Enter a margin amount";
    isSubmitDisabled = true;
  } else if (isPropAccount && propAccount.status !== "eval" && propAccount.status !== "funded") {
    submitLabel = "Start a Prop evaluation first";
    isSubmitDisabled = true;
  } else if (marginAmount > freeBalance) {
    submitLabel = "Margin is more than your free balance";
    isSubmitDisabled = true;
  } else if (isPropAccount && dailyLossLeft <= 0) {
    submitLabel = "Daily loss limit reached, resets 00:00 UTC";
    isSubmitDisabled = true;
  } else if (isPropAccount && maxLossLeft <= 0) {
    submitLabel = "Max loss reached, start a new evaluation";
    isSubmitDisabled = true;
  } else if (marketFill.partial) {
    submitLabel = "Not enough liquidity on " + activeVenue.name;
    isSubmitDisabled = true;
  }
  const isBookAutoCollapsed = viewportWidth < 960 && !state.bookPinned;
  const isBookOpen = isMobile || (state.bookOpen && !isBookAutoCollapsed);
  const isTradeOpen = isMobile || state.tradeOpen;
  const isNarrowDesktop = viewportWidth < 1200;
  const bookColumnWidth = isBookOpen
    ? isNarrowDesktop && !state.bookSized
      ? Math.min(state.bookW, 252)
      : state.bookW
    : 52;
  const tradeColumnWidth = isTradeOpen
    ? isNarrowDesktop && !state.tradeSized
      ? Math.min(state.tradeW, 312)
      : state.tradeW
    : 52;
  const gridTemplate =
    "minmax(0,1fr) 8px " +
    bookColumnWidth +
    "px 8px " +
    tradeColumnWidth +
    "px; grid-template-rows: minmax(0,1fr) 8px " +
    (state.dockOpen ? state.dockH : 46) +
    "px";
  const clampPanelWidth = (panel: any, width: any) => {
    const otherPanelWidth =
      panel === "book" ? (state.tradeOpen ? state.tradeW : 52) : state.bookOpen ? state.bookW : 52;
    const maxWidth = Math.max(260, viewportWidth - otherPanelWidth - 420 - 18);
    return Math.max(panel === "book" ? 220 : 300, Math.min(maxWidth, width));
  };
  const resizePanel = (panel: any, width: any) => {
    const minWidth = panel === "book" ? 170 : 240;
    if (width < minWidth) {
      const closedState: any = {};
      closedState[panel + "Open"] = false;
      self.setState(closedState);
      return;
    }
    const openState: any = {};
    openState[panel + "W"] = clampPanelWidth(panel, width);
    openState[panel + "Open"] = true;
    openState[panel + "Sized"] = true;
    if (panel === "book") {
      openState.bookPinned = true;
    }
    self.setState(openState);
  };
  const makePanelResizeHandlers = (panel: any) => {
    function getPanelWidth() {
      if (state[panel + "Open"]) {
        return state[panel + "W"];
      } else {
        return 52;
      }
    }
    return {
      down: (e: any) => {
        if (e.currentTarget.setPointerCapture) {
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        self.drag = { which: panel, x: e.clientX, w: getPanelWidth() };
        self.setState({ dragging: panel });
      },
      move: (e: any) => {
        if (!!self.drag && self.drag.which === panel) {
          resizePanel(panel, self.drag.w - (e.clientX - self.drag.x));
        }
      },
      up: () => {
        if (self.drag) {
          self.drag = null;
          self.setState({ dragging: null });
        }
      },
      key: (e: any) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          resizePanel(panel, getPanelWidth() + 24);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          resizePanel(panel, getPanelWidth() - 24);
        } else if (e.key === "Enter") {
          e.preventDefault();
          const toggleState: any = {};
          toggleState[panel + "Open"] = !state[panel + "Open"];
          self.setState(toggleState);
        }
      },
    };
  };
  const isFavorite = !!state.fav[market.sym];
  let totalUpnl = 0;
  let totalMargin = 0;
  const activePositions = isPropAccount ? state.propPositions || [] : state.positions;
  const positionsStateKey = isPropAccount ? "propPositions" : "positions";
  var positionRows = activePositions.map((position: any) => {
    const markPrice = getMidPrice(position.sym, position.venue);
    const sign = position.side === "long" ? 1 : -1;
    const pnl = (markPrice - position.entry) * position.qty * sign;
    const margin = (position.entry * position.qty) / position.lev;
    const liquidationPrice2 =
      position.side === "long"
        ? position.entry * (1 - 0.9 / position.lev)
        : position.entry * (1 + 0.9 / position.lev);
    totalUpnl += pnl;
    totalMargin += margin;
    return {
      id: position.id,
      sym: position.sym,
      venueId: position.venue,
      logo: LOGOS[position.sym.toLowerCase()],
      venueLogo: venueById[position.venue].logo,
      venueName: venueById[position.venue].name,
      sideLabel: position.side === "long" ? "Long" : "Short",
      dirPath: position.side === "long" ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M6 13l6 6 6-6",
      sideCls: position.side,
      levText: position.lev + "x",
      sizeText: formatQty(position.qty) + " " + position.sym,
      valueText: formatUsd(markPrice * position.qty),
      entryText: "$" + formatPrice(position.entry),
      markText: "$" + formatPrice(markPrice),
      liqText: "$" + formatPrice(liquidationPrice2),
      marginText: formatUsd(margin),
      pnlText: formatSignedUsd(pnl),
      roeText: (pnl >= 0 ? "+" : "") + ((pnl / margin) * 100).toFixed(2) + "%",
      pnlCls: pnl >= 0 ? "up" : "down",
      close: () => {
        const update: any = {};
        update[positionsStateKey] = activePositions.filter(
          (other: any) => other.id !== position.id,
        );
        self.setState(update);
      },
    };
  });
  const orders = state.orders;
  const ordersStateKey = "orders";
  const orderRows = orders.map((order: any) => ({
    sym: order.sym,
    logo: LOGOS[order.sym.toLowerCase()],
    venueLogo: venueById[order.venue].logo,
    venueName: venueById[order.venue].name,
    sideLabel: order.side === "long" ? "Long" : "Short",
    dirPath: order.side === "long" ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M6 13l6 6 6-6",
    sideCls: order.side,
    type: order.type,
    priceText: "$" + formatPrice(order.price),
    amountText: formatQty(order.qty) + " " + order.sym,
    valueText: formatUsd(order.price * order.qty),
    filled: order.filled,
    filledText: order.filled + "%",
    placed: order.placed,
    cancel: () => {
      const update: any = {};
      update[ordersStateKey] = orders.filter((other: any) => other.id !== order.id);
      self.setState(update);
    },
  }));
  const tradeHistoryRows = liveTradeHistory.map((trade) => ({
    time: trade.time,
    sym: trade.sym,
    logo: LOGOS[trade.sym.toLowerCase()],
    venueLogo: venueById[trade.venue].logo,
    venueName: venueById[trade.venue].name,
    action: trade.action,
    sideCls: trade.side,
    priceText: "$" + formatPrice(trade.price),
    amountText: formatQty(trade.qty) + " " + trade.sym,
    feeText: formatUsd(trade.fee),
    pnlText: trade.pnl == null ? "-" : formatSignedUsd(trade.pnl),
    pnlCls: trade.pnl == null ? "muted" : trade.pnl >= 0 ? "up" : "down",
    mobileNote:
      trade.pnl == null ? "Fee " + formatUsd(trade.fee) : formatSignedUsd(trade.pnl) + " realized",
  }));
  const currentPositionRow = positionRows.filter(
    (row: any) => row.sym === market.sym && row.venueId === activeVenue.id,
  )[0];
  var equity = LIVE_BALANCE + totalUpnl;
  const freeMargin = equity - totalMargin;
  const accountSummary = {
    equity: formatUsd(equity),
    upnl: formatSignedUsd(totalUpnl),
    upnlCls: totalUpnl >= 0 ? "up" : "down",
    used: formatUsd(totalMargin),
    free: formatUsd(freeMargin),
    count: positionRows.length,
  };
  const panelTabs = [
    ["balances", "Balances", "Balances", 0],
    ["positions", "Positions", "Positions", positionRows.length],
    ["orders", "Open orders", "Orders", orderRows.length],
    ["history", "Trade history", "History", 0],
    ["funding", "Funding history", "Funding", 0],
    ["ohist", "Order history", "Orders", 0],
  ].map((tab) => {
    const id = tab[0];
    const isActive = state.ptab === tab[0];
    return {
      id: id,
      label: tab[1],
      shortLabel: tab[3] ? tab[2] + " " + tab[3] : tab[2],
      count: tab[3] ? String(tab[3]) : "",
      cls: isActive ? "tab is-active" : "tab",
      pressed: isActive ? "true" : "false",
      pick: () => {
        self.setState({ ptab: tab[0] });
      },
    };
  });
  const mobilePanelTabs = panelTabs
    .filter((tab) => ["positions", "orders", "history"].indexOf(tab.id) > -1)
    .map((tab) => ({ ...tab, cls: tab.pressed === "true" ? "is-active" : "" }));
  const bookLevels = [];
  for (let levelIndex = 0; levelIndex < 8; levelIndex++) {
    const bidLevel = groupedBids[levelIndex] || activeBook.bids[levelIndex];
    const askLevel = groupedAsks[levelIndex] || activeBook.asks[levelIndex];
    bookLevels.push({
      bp: formatPrice(bidLevel.p),
      bs: formatBookSize(bidLevel.usd, bidLevel.p),
      bd: ((bidRows[Math.min(levelIndex, bidRows.length - 1)].cum / maxCumulative) * 100).toFixed(
        1,
      ),
      ap: formatPrice(askLevel.p),
      as: formatBookSize(askLevel.usd, askLevel.p),
      ad: ((askRows[Math.min(levelIndex, askRows.length - 1)].cum / maxCumulative) * 100).toFixed(
        1,
      ),
    });
  }
  const dockHeight = state.dockOpen ? state.dockH : 48;
  const handleDockKey = (e: any) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      self.setState({ dockOpen: true, dockH: Math.min(560, state.dockH + 24) });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextHeight = state.dockH - 24;
      if (nextHeight < 120) {
        self.setState({ dockOpen: false });
      } else {
        self.setState({ dockH: nextHeight });
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      self.setState({ dockOpen: !state.dockOpen });
    }
  };
  const dockResizeHandlers = {
    down: (e: any) => {
      if (e.currentTarget.setPointerCapture) {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      self.drag = { which: "dock", y: e.clientY, h: dockHeight };
      self.setState({ dragging: "dock" });
    },
    move: (e: any) => {
      if (!!self.drag && self.drag.which === "dock") {
        const nextHeight = self.drag.h - (e.clientY - self.drag.y);
        if (nextHeight < 110) {
          self.setState({ dockOpen: false });
          return;
        }
        self.setState({
          dockOpen: true,
          dockH: Math.min(
            Math.max(140, nextHeight),
            (typeof window !== "undefined" ? window.innerHeight : 960) - 320,
          ),
        });
      }
    },
    up: () => {
      if (self.drag) {
        self.drag = null;
        self.setState({ dragging: null });
      }
    },
    key: handleDockKey,
  };
  const makeNavigate = (screen2: any) => () => {
    self.setState({
      screen: screen2,
      sheet: "closed",
      vpanel: false,
      drawer: "closed",
      profile: false,
      watchOpen: null,
      cpOpen: null,
    });
  };
  const propTotalPnl = propEquity - accountSize;
  const propTodayPnl = propEquity - dayStartEquity;
  var equityRandom = seededRandom(hashString("prop-equity"));
  let equityCurve = [accountSize];
  let runningEquity = accountSize;
  for (let step = 1; step < 48; step++) {
    runningEquity += (equityRandom() - 0.44) * accountSize * 0.0084;
    equityCurve.push(runningEquity);
  }
  var equityDrift = propEquity - equityCurve[equityCurve.length - 1];
  equityCurve = equityCurve.map(
    (value, index) => value + (equityDrift * index) / (equityCurve.length - 1),
  );
  const equityChartMin = accountSize * 0.884;
  const equityChartMax = accountSize * 1.096;
  function equityToY(value: any) {
    return 240 - ((value - equityChartMin) / (equityChartMax - equityChartMin)) * 240;
  }
  const equityLinePath =
    "M" +
    equityCurve
      .map(
        (value, index) =>
          ((index / (equityCurve.length - 1)) * 1000).toFixed(1) +
          " " +
          equityToY(value).toFixed(1),
      )
      .join(" L");
  const profitTargetPct = Math.max(0, Math.min(100, (propTotalPnl / (accountSize * 0.08)) * 100));
  const dailyLoss = Math.max(0, dayStartEquity - propEquity);
  const totalLoss = Math.max(0, accountSize - propEquity);
  const propDashboard = {
    equity: formatUsd(propEquity),
    totalText: formatSignedUsd(propTotalPnl),
    totalPct:
      (propTotalPnl >= 0 ? "+" : "") + ((propTotalPnl / accountSize) * 100).toFixed(2) + "%",
    totalCls: propTotalPnl >= 0 ? "up" : "down",
    todayText: formatSignedUsd(propTodayPnl),
    todayCls: propTodayPnl >= 0 ? "up" : "down",
    dailyLeft: formatUsd(dailyLossLeft),
    dailyPct: ((dailyLossLeft / (accountSize * 0.05)) * 100).toFixed(1),
    maxLeft: formatUsd(maxLossLeft),
    maxPct: Math.min(100, (maxLossLeft / (accountSize * 0.1)) * 100).toFixed(1),
    line: equityLinePath,
    area: equityLinePath + " L1000 240 L0 240 Z",
    targetLine: "M0 " + equityToY(accountSize * 1.08).toFixed(1) + " H1000",
    floorLine: "M0 " + equityToY(accountSize * 0.9).toFixed(1) + " H1000",
    startLine: "M0 " + equityToY(accountSize).toFixed(1) + " H1000",
    targetY: (equityToY(accountSize * 1.08) / 2.4).toFixed(2),
    floorY: (equityToY(accountSize * 0.9) / 2.4).toFixed(2),
    startY: (equityToY(accountSize) / 2.4).toFixed(2),
    kpis: [
      { label: "Equity", value: formatUsd(propEquity), sub: "Same balance as Pro mode", cls: "" },
      {
        label: "Total PnL",
        value: formatSignedUsd(propTotalPnl),
        sub:
          (propTotalPnl >= 0 ? "+" : "") +
          ((propTotalPnl / accountSize) * 100).toFixed(2) +
          "% of account",
        cls: propTotalPnl >= 0 ? "" : "down",
      },
      {
        label: "Today",
        value: formatSignedUsd(propTodayPnl),
        sub: formatUsd(dailyLossLeft) + " loss left today",
        cls: propTodayPnl >= 0 ? "" : "down",
      },
      { label: "Trading Days", value: "3 of 5", sub: "Minimum for Phase 1", cls: "" },
    ],
    rules: [
      {
        name: "Profit target",
        status: Math.round(profitTargetPct) + "%",
        tagCls: "status pass",
        pct: profitTargetPct.toFixed(1),
        barCls: "",
        value: formatUsd(Math.max(0, propTotalPnl)),
        limit: formatUsd(accountSize * 0.08),
        note: formatUsd(Math.max(0, accountSize * 0.08 - propTotalPnl)) + " to go",
      },
      {
        name: "Daily loss limit",
        status: dailyLoss > accountSize * 0.04 ? "Near limit" : "Safe",
        tagCls: dailyLoss > accountSize * 0.04 ? "status warn" : "status",
        pct: ((dailyLoss / (accountSize * 0.05)) * 100).toFixed(1),
        barCls: "warn",
        value: formatUsd(dailyLoss),
        limit: formatUsd(accountSize * 0.05),
        note: "Resets 00:00 UTC",
      },
      {
        name: "Max loss",
        status: "Safe",
        tagCls: "status",
        pct: ((totalLoss / (accountSize * 0.1)) * 100).toFixed(1),
        barCls: "warn",
        value: formatUsd(totalLoss),
        limit: formatUsd(accountSize * 0.1),
        note: formatUsd(maxLossLeft) + " above floor",
      },
      {
        name: "Trading days",
        status: "3 of 5",
        tagCls: "status",
        pct: "60",
        barCls: "",
        value: "3 days",
        limit: "5",
        note: "2 to go",
      },
    ],
  };
  const propPositionRows = (state.propPositions || []).map((position: any) => {
    const markPrice = getMidPrice(position.sym, position.venue);
    const pnl = (markPrice - position.entry) * position.qty * (position.side === "long" ? 1 : -1);
    const margin = (position.entry * position.qty) / position.lev;
    const liquidationPrice2 =
      position.side === "long"
        ? position.entry * (1 - 0.9 / position.lev)
        : position.entry * (1 + 0.9 / position.lev);
    return {
      venueLogo: venueById[position.venue].logo,
      markText: "$" + formatPrice(markPrice),
      liqText: "$" + formatPrice(liquidationPrice2),
      sym: position.sym,
      logo: LOGOS[position.sym.toLowerCase()],
      venueName: venueById[position.venue].name,
      sideLabel: position.side === "long" ? "Long" : "Short",
      dirPath: position.side === "long" ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M6 13l6 6 6-6",
      sideCls: position.side,
      levText: position.lev + "x",
      sizeText: formatQty(position.qty) + " " + position.sym,
      entryText: "$" + formatPrice(position.entry),
      pnlText: formatSignedUsd(pnl),
      roeText: (pnl >= 0 ? "+" : "") + ((pnl / margin) * 100).toFixed(2) + "%",
      pnlCls: pnl >= 0 ? "up" : "down",
    };
  });
  const selectedPlan = PROP_PLANS.filter((plan) => plan.size === (state.plan || "$50,000"))[0];
  const planOptions = PROP_PLANS.map((plan) => {
    const isActive = plan === selectedPlan;
    return {
      short: plan.size.replace(",000", "K"),
      cls: isActive ? "is-active" : "",
      pressed: isActive ? "true" : "false",
      pick: () => {
        self.setState({ plan: plan.size });
      },
    };
  });
  const planSize = parseCompact(selectedPlan.size);
  const planDetails = {
    size: selectedPlan.size,
    fee: selectedPlan.fee,
    t1: formatUsd(planSize * 0.08).replace(".00", "") + " (8%)",
    t2: formatUsd(planSize * 0.05).replace(".00", "") + " (5%)",
    daily: formatUsd(planSize * 0.05).replace(".00", "") + " (5%)",
    max: formatUsd(planSize * 0.1).replace(".00", "") + " (10%)",
  };
  var marketStatsCache: any = {};
  function marketMatches(market2: any, query: string) {
    const needle = query.trim().toLowerCase();
    return (
      !needle ||
      market2.sym.toLowerCase().indexOf(needle) > -1 ||
      market2.name.toLowerCase().indexOf(needle) > -1
    );
  }
  function firstPage(tableKey: string) {
    const pages = { ...self.state.tpg };
    delete pages[tableKey];
    return pages;
  }
  let watchMarkets = MARKETS.filter(
    (market2) =>
      (state.wcat === "all" || market2.cat === state.wcat) && marketMatches(market2, state.wq),
  );
  function getMarketStats(market2: any) {
    const marketVenues = VENUES.filter(
      (venue) => !market2.venues || market2.venues.indexOf(venue.id) > -1,
    );
    const totalWeight = marketVenues.reduce((sum, venue) => sum + venue.mul, 0);
    const volume = parseCompact(market2.vol);
    const openInterest = parseCompact(market2.oi);
    const funding =
      (marketVenues.reduce((sum, venue) => sum + venue.fund * venue.mul, 0) / totalWeight) *
      (market2.chg >= 0 ? 1 : -0.6);
    return { avs: marketVenues, sm: totalWeight, vol: volume, oi: openInterest, fund: funding };
  }
  function getWatchSortValue(market2: any) {
    const stats = getMarketStats(market2);
    if (state.wsort === "price") {
      return market2.price;
    } else if (state.wsort === "chg") {
      return market2.chg;
    } else if (state.wsort === "vol") {
      return stats.vol;
    } else if (state.wsort === "fund") {
      return getMarketStats2(market2).fAvg;
    } else if (state.wsort === "gap") {
      return getMarketStats2(market2).gap;
    } else {
      return stats.oi;
    }
  }
  watchMarkets = watchMarkets
    .slice()
    .sort((a, b) => (getWatchSortValue(a) - getWatchSortValue(b)) * state.wdir);
  function buildWatchRow(market2: any) {
    const stats = getMarketStats(market2);
    const isOpen = state.watchOpen === market2.sym;
    const shares: any = stats.avs
      .map((venue) => ({ v: venue, sh: venue.mul / stats.sm }))
      .sort((a, b) => b.sh - a.sh);
    const sparkline = sparklinePath(
      seededPriceSeries(market2.sym + "spark", 36, market2.price, 0.03, market2.chg / 3600),
      100,
      32,
      3,
    );
    return {
      flash: getFlashClass(market2.sym),
      sym: market2.sym,
      name: market2.name,
      lev: market2.max + "x",
      cat: market2.cat,
      logo: LOGOS[market2.sym.toLowerCase()],
      price: formatPrice(market2.price),
      chgText: formatChange(market2.chg),
      dir: market2.chg >= 0 ? "up" : "down",
      spark: sparkline.line,
      sparkColor: market2.chg >= 0 ? "var(--c-up)" : "var(--c-dn)",
      vol: "$" + formatCompact(stats.vol),
      oi: "$" + formatCompact(stats.oi),
      split: shares.map((share: any) => ({
        w: (share.sh * 100).toFixed(1),
        c: VENUE_COLORS[share.v.id],
      })),
      topLogo: shares[0].v.logo,
      topText: shares[0].v.name + " " + Math.round(shares[0].sh * 100) + "%",
      venues: stats.avs.map((venue: any) => ({ logo: venue.logo, name: venue.name })),
      venueCount: stats.avs.length,
      venuesM: stats.avs
        .slice()
        .sort((a, b) => b.mul - a.mul)
        .slice(0, 3)
        .map((venue: any) => ({ logo: venue.logo, name: venue.name })),
      vMore: stats.avs.length > 4 ? "+" + (stats.avs.length - 4) : "",
      isOpen: isOpen,
      groupCls: isOpen ? "is-open" : "",
      toggle: () => {
        self.setState({ watchOpen: isOpen ? null : market2.sym });
      },
      trade: makeSelectMarket(market2.sym),
    };
  }
  let watchRows = watchMarkets.map(buildWatchRow);
  const openWatchRow = state.watchOpen ? buildWatchRow(findMarket(state.watchOpen)) : null;
  if (openWatchRow) {
    openWatchRow.trade = makeSelectMarket(openWatchRow.sym);
  }
  const categoryPills2 = MARKET_CATEGORIES.map((category) => {
    const isActive = state.wcat === category[0];
    return {
      label: category[1],
      count: String(
        category[0] === "all"
          ? MARKETS.length
          : MARKETS.filter((market2) => market2.cat === category[0]).length,
      ),
      cls: isActive ? "pill is-active" : "pill",
      pressed: isActive ? "true" : "false",
      pick: () => {
        self.setState({ wcat: category[0], tpg: firstPage("markets") });
      },
    };
  });
  const sortHeaders: any = {};
  ["price", "chg", "vol", "oi", "fund", "gap"].forEach((column) => {
    const isSorted = state.wsort === column;
    sortHeaders[column] = {
      cls: isSorted ? "is-active" : "",
      icon: isSorted
        ? state.wdir < 0
          ? "m6 9 6 6 6-6"
          : "m6 15 6-6 6 6"
        : "m8 10 4-4 4 4M8 14l4 4 4-4",
      go: () => {
        self.setState({ wsort: column, wdir: isSorted ? -state.wdir : -1 });
      },
    };
  });
  const venueMeta: any = {
    binance: {
      type: "CEX",
      chain: "Off-chain",
      quote: "USDT",
      interval: 8,
      url: "binance.com/en/futures/{symbol}",
      lat: 42,
      ok: true,
      maxLev: 100,
      nat: (formatNative: any) => formatNative + "USDT",
      minNotional: 5,
      mult: 1,
      listed: "Nov 2019",
      tiers: 10,
      mmr: 0.4,
    },
    bybit: {
      type: "CEX",
      chain: "Off-chain",
      quote: "USDT",
      interval: 8,
      url: "bybit.com/trade/usdt/{symbol}",
      lat: 58,
      ok: true,
      maxLev: 100,
      nat: (formatNative: any) => formatNative + "USDT",
      minNotional: 1,
      mult: 0.1,
      listed: "Mar 2020",
      tiers: 8,
      mmr: 0.5,
    },
    hyperliquid: {
      type: "DEX",
      chain: "Hyperliquid L1",
      quote: "USDC",
      interval: 1,
      url: "app.hyperliquid.xyz/trade/{symbol}",
      lat: 61,
      ok: true,
      maxLev: 25,
      nat: (formatNative: any) => formatNative,
      minNotional: 10,
      mult: 1,
      listed: "Jun 2023",
      tiers: 3,
      mmr: 2,
    },
    lighter: {
      type: "DEX",
      chain: "Ethereum ZK rollup",
      quote: "USDC",
      interval: 1,
      url: "app.lighter.xyz/trade/{symbol}",
      lat: 74,
      ok: true,
      maxLev: 25,
      nat: (formatNative: any) => formatNative + "-USD",
      minNotional: 1,
      mult: 1,
      listed: "Jan 2025",
      tiers: 4,
      mmr: 1.5,
    },
    variational: {
      type: "DEX",
      chain: "Arbitrum",
      quote: "USDC",
      interval: 1,
      url: "omni.variational.io/perpetual/{symbol}",
      lat: 420,
      ok: false,
      maxLev: 50,
      nat: (formatNative: any) => formatNative + "-PERP",
      minNotional: 1,
      mult: 1,
      listed: "Mar 2025",
      tiers: 5,
      mmr: 1,
    },
    gmx: {
      type: "DEX",
      chain: "Arbitrum",
      quote: "USDC",
      interval: 1,
      url: "app.gmx.io/#/trade/long/{symbol}",
      lat: 55,
      ok: true,
      maxLev: 20,
      nat: (formatNative: any) => formatNative + "-USD",
      minNotional: 1,
      mult: 1,
      listed: "Oct 2023",
      tiers: 4,
      mmr: 3,
    },
  };
  function formatPct(value: any, decimals: any) {
    return (value >= 0 ? "+" : "") + value.toFixed(decimals) + "%";
  }
  function venueHourlyFunding(market2: any, venue: any) {
    const rng = seededRandom(hashString(market2.sym + venue.id + "fund"));
    return venue.fund * (market2.chg >= 0 ? 1 : -0.6) * (0.5 + rng());
  }
  function buildLinePath(values: any, min: any, max: any) {
    const range = max - min || 1;
    return (
      "M" +
      values
        .map(
          (value: any, index: any) =>
            ((index / (values.length - 1)) * 1000).toFixed(1) +
            " " +
            (190 - ((value - min) / range) * 180).toFixed(1),
        )
        .join(" L")
    );
  }
  function valueToFundingY(value: any, min: any, max: any) {
    return 190 - ((value - min) / (max - min || 1)) * 180;
  }
  function buildMarketStats(market2: any) {
    const aggregate = getMarketStats(market2);
    const rng = seededRandom(hashString(market2.sym + "stats"));
    const venueStats = aggregate.avs.map((venue) => {
      const book = buildOrderBook(market2, venue);
      const midPrice2 = (book.asks[0].p + book.bids[0].p) / 2;
      return {
        v: venue,
        bb: book,
        md: midPrice2,
        sh: venue.mul / aggregate.sm,
        fh: venueHourlyFunding(market2, venue),
      };
    });
    const vwap = venueStats.reduce((sum, stat) => sum + stat.md * stat.sh, 0);
    const mids = venueStats.map((stat) => stat.md);
    const gapBps = ((Math.max.apply(null, mids) - Math.min.apply(null, mids)) / vwap) * 10000;
    const fundingRates = venueStats.map((stat) => stat.fh);
    const avgFunding = venueStats.reduce((sum, stat) => sum + stat.fh * stat.sh, 0);
    const openPrice = market2.price / (1 + market2.chg / 100);
    const highPrice = Math.max(openPrice, market2.price) * (1.004 + rng() * 0.01);
    const lowPrice = Math.min(openPrice, market2.price) * (0.996 - rng() * 0.01);
    const buyShare = Math.max(
      0.32,
      Math.min(0.68, 0.5 + (market2.chg / 100) * 2.2 + (rng() - 0.5) * 0.08),
    );
    const liqLong = aggregate.vol * 0.004 * (market2.chg < 0 ? 1.7 : 0.6) * (0.6 + rng());
    const liqShort = aggregate.vol * 0.004 * (market2.chg > 0 ? 1.7 : 0.6) * (0.6 + rng());
    return {
      w0: aggregate,
      vm: venueStats,
      vwap: vwap,
      gap: gapBps,
      fAvg: avgFunding,
      fSpread: Math.max.apply(null, fundingRates) - Math.min.apply(null, fundingRates),
      open: openPrice,
      high: highPrice,
      low: lowPrice,
      buyShare: buyShare,
      liqLong: liqLong,
      liqShort: liqShort,
    };
  }
  function annualizeFunding(hourlyRate: any) {
    return hourlyRate * 24 * 365;
  }
  function getMarketStats2(market2: any) {
    return (marketStatsCache[market2.sym] ||= buildMarketStats(market2));
  }
  watchRows.forEach((row: any) => {
    const market2 = findMarket(row.sym);
    const stats = getMarketStats2(market2);
    row.vwap = formatPrice(stats.vwap);
    row.low = formatPrice(stats.low);
    row.high = formatPrice(stats.high);
    row.rngPos = Math.max(
      2,
      Math.min(98, ((market2.price - stats.low) / (stats.high - stats.low)) * 100),
    ).toFixed(1);
    row.fund = formatPct(stats.fAvg, 4);
    row.apr = formatPct(annualizeFunding(stats.fAvg), 2);
    row.fundCls = stats.fAvg >= 0 ? "" : "down";
    row.fsp = annualizeFunding(stats.fSpread).toFixed(2) + "%";
    row.gap = stats.gap.toFixed(1) + " bps";
    row.buyPct = Math.round(stats.buyShare * 100);
  });
  const watchDetail: any = { venues: [], specs: [] };
  if (state.watchOpen) {
    const openMarket = findMarket(state.watchOpen);
    const openStats = getMarketStats2(openMarket);
    const openAggregate = openStats.w0;
    const rng = seededRandom(hashString(openMarket.sym + "series"));
    let weightedBasisBps = 0;
    watchDetail.venues = openStats.vm
      .slice()
      .sort((a: any, b: any) => b.sh - a.sh)
      .map((venueStat: any) => {
        const venue = venueStat.v;
        const meta = venueMeta[venue.id];
        const book = venueStat.bb;
        const midPrice2 = venueStat.md;
        const indexPrice = openMarket.price * 0.99991;
        const markPrice = midPrice2 * (1 + (rng() - 0.5) * 0.00002);
        const basisBps = ((markPrice - indexPrice) / indexPrice) * 10000;
        weightedBasisBps += basisBps * venueStat.sh;
        let askCumulative = 0;
        let bidCumulative = 0;
        const askDepth = book.asks.slice(0, 8).map((level: any) => {
          askCumulative += level.usd;
          return askCumulative;
        });
        const bidDepth = book.bids.slice(0, 8).map((level: any) => {
          bidCumulative += level.usd;
          return bidCumulative;
        });
        const maxDepth = Math.max(askCumulative, bidCumulative);
        const bookRows = [];
        for (let i = 0; i < 8; i++) {
          bookRows.push({
            bp: formatPrice(book.bids[i].p),
            bs: formatCompact(book.bids[i].usd),
            bd: ((bidDepth[i] / maxDepth) * 100).toFixed(1),
            ap: formatPrice(book.asks[i].p),
            as: formatCompact(book.asks[i].usd),
            ad: ((askDepth[i] / maxDepth) * 100).toFixed(1),
          });
        }
        return {
          name: venue.name,
          logo: venue.logo,
          native: meta.nat(openMarket.sym),
          last: formatPrice(midPrice2 * (1 + (rng() - 0.5) * 0.00003)),
          mark: formatPrice(markPrice),
          index: formatPrice(indexPrice),
          basis: (basisBps >= 0 ? "+" : "") + basisBps.toFixed(1) + " bps",
          basisCls: basisBps >= 0 ? "" : "down",
          bid: formatPrice(book.bids[0].p),
          ask: formatPrice(book.asks[0].p),
          spread: (((book.asks[0].p - book.bids[0].p) / midPrice2) * 10000).toFixed(1) + " bps",
          vol: "$" + formatCompact(openAggregate.vol * venueStat.sh),
          volShare: Math.round(venueStat.sh * 100) + "% share",
          oi: "$" + formatCompact(openAggregate.oi * venueStat.sh),
          oiShare: Math.round(venueStat.sh * 100) + "% share",
          lat: meta.lat + " ms",
          dotCls: "sdot" + (meta.ok ? "" : " warn"),
          book: bookRows,
          mid: formatPrice(midPrice2),
          bidPct: Math.round((bidCumulative / (askCumulative + bidCumulative)) * 100),
          askPct: 100 - Math.round((bidCumulative / (askCumulative + bidCumulative)) * 100),
          trade: makeSelectMarket(openMarket.sym, venue.id),
        };
      });
    const tickSize2 = Math.pow(10, Math.floor(Math.log10(openMarket.price)) - 4);
    watchDetail.specs = openStats.vm.map((venueStat: any) => {
      const meta = venueMeta[venueStat.v.id];
      return {
        name: venueStat.v.name,
        logo: venueStat.v.logo,
        native: meta.nat(openMarket.sym),
        quote: meta.quote + " / " + meta.quote,
        mult: String(meta.mult),
        tick:
          tickSize2 >= 1
            ? String(tickSize2)
            : tickSize2.toFixed(Math.round(-Math.log10(tickSize2))),
        step: openMarket.price > 1000 ? "0.001" : openMarket.price > 1 ? "0.01" : "1",
        minOrder:
          (openMarket.price > 1000 ? "0.001 " : openMarket.price > 1 ? "0.01 " : "1 ") +
          openMarket.sym,
        minNotional: "$" + meta.minNotional,
        maxLev: Math.min(meta.maxLev, openMarket.max) + "x",
        tiers: meta.tiers + " tiers",
        mmr: "From " + meta.mmr.toFixed(2) + "%",
        listed: meta.listed,
        status: "Trading",
      };
    });
    const takerBuyVolume = openAggregate.vol * openStats.buyShare;
    const takerSellVolume = openAggregate.vol - takerBuyVolume;
    const longShortRatio = (openStats.buyShare / (1 - openStats.buyShare)) * (0.9 + rng() * 0.2);
    watchDetail.basis = (weightedBasisBps >= 0 ? "+" : "") + weightedBasisBps.toFixed(1) + " bps";
    watchDetail.basisCls = weightedBasisBps >= 0 ? "" : "down";
    watchDetail.lsr = longShortRatio.toFixed(2);
    watchDetail.tbuy = "$" + formatCompact(takerBuyVolume);
    watchDetail.tsell = "$" + formatCompact(takerSellVolume);
    watchDetail.name = openMarket.name;
    watchDetail.sym = openMarket.sym;
    watchDetail.logo = LOGOS[openMarket.sym.toLowerCase()];
    watchDetail.vwap = formatPrice(openStats.vwap);
    watchDetail.chgText = formatChange(openMarket.chg);
    watchDetail.dir = openMarket.chg >= 0 ? "up" : "down";
  }
  const venueRows2 = VENUES.map((venue: any) => {
    const meta = venueMeta[venue.id];
    const venueMarkets = MARKETS.filter(
      (market2) => !market2.venues || market2.venues.indexOf(venue.id) > -1,
    );
    let totalVolume2 = 0;
    let totalOi = 0;
    let topVolumeMarket: any = null;
    let topOiMarket: any = null;
    let minFunding = 1000000000;
    let maxFunding = -1000000000;
    venueMarkets.forEach((market2) => {
      const stats = getMarketStats2(market2);
      const venueStat = stats.vm.filter((stat: any) => stat.v.id === venue.id)[0];
      const marketVolume2 = stats.w0.vol * venueStat.sh;
      const marketOi = stats.w0.oi * venueStat.sh;
      totalVolume2 += marketVolume2;
      totalOi += marketOi;
      if (!topVolumeMarket || marketVolume2 > topVolumeMarket.v) {
        topVolumeMarket = { x: market2, v: marketVolume2 };
      }
      if (!topOiMarket || marketOi > topOiMarket.v) {
        topOiMarket = { x: market2, v: marketOi };
      }
      minFunding = Math.min(minFunding, annualizeFunding(venueStat.fh));
      maxFunding = Math.max(maxFunding, annualizeFunding(venueStat.fh));
    });
    return {
      name: venue.name,
      logo: venue.logo,
      type: meta.type,
      chain: meta.chain,
      markets: String(venueMarkets.length),
      vol: "$" + formatCompact(totalVolume2),
      oi: "$" + formatCompact(totalOi),
      topVol: topVolumeMarket.x.sym,
      topVolLogo: LOGOS[topVolumeMarket.x.sym.toLowerCase()],
      topOi: topOiMarket.x.sym,
      topOiLogo: LOGOS[topOiMarket.x.sym.toLowerCase()],
      fMin: formatPct(minFunding, 1),
      fMax: formatPct(maxFunding, 1),
      // Unit-free copies for the desktop table, whose headers carry the units.
      volN: formatCompact(totalVolume2),
      oiN: formatCompact(totalOi),
      fMinN: formatPct(minFunding, 1).replace("%", ""),
      fMaxN: formatPct(maxFunding, 1).replace("%", ""),
      status: meta.ok ? "Live" : "Delayed",
      dotCls: "sdot" + (meta.ok ? "" : " warn"),
      lat: meta.lat + " ms",
      latCls: meta.ok ? "" : "down",
      updated: meta.ok ? 1 + ((Math.floor(state.now / 1000) + meta.lat) % 3) + "s ago" : "9s ago",
      url: meta.url,
    };
  });
  const fundingUnit = state.funit || "apr";
  const fundingUnitHours = fundingUnit === "1h" ? 1 : fundingUnit === "8h" ? 8 : 8760;
  const fundingDecimals = fundingUnit === "apr" ? 1 : 4;
  const venueHeaders = VENUES.map((venue: any) => ({ name: venue.name, logo: venue.logo }));
  const fundingMarkets = MARKETS.filter((market2) =>
    marketMatches(market2, state.fq || "") &&
    (!(state.fcat && state.fcat !== "all") || market2.cat === state.fcat),
  )
    .slice()
    .sort((a, b) => getMarketStats2(b).w0.oi - getMarketStats2(a).w0.oi);
  const fundingMatrix = fundingMarkets.map((market2) => {
    const stats = getMarketStats2(market2);
    const statsByVenue: any = {};
    stats.vm.forEach((venueStat: any) => {
      statsByVenue[venueStat.v.id] = venueStat;
    });
    const rates = stats.vm.map((venueStat: any) => venueStat.fh);
    const maxAbsRate = Math.max.apply(null, rates.map(Math.abs)) || 1;
    const lowestFundingStat = stats.vm.slice().sort((a: any, b: any) => a.fh - b.fh)[0];
    const highestFundingStat = stats.vm.slice().sort((a: any, b: any) => b.fh - a.fh)[0];
    return {
      sym: market2.sym,
      logo: LOGOS[market2.sym.toLowerCase()],
      spread: (stats.fSpread * fundingUnitHours).toFixed(fundingDecimals) + "%",
      longLogo: lowestFundingStat.v.logo,
      longName: lowestFundingStat.v.name,
      shortLogo: highestFundingStat.v.logo,
      shortName: highestFundingStat.v.name,
      cells: VENUES.map((venue: any) => {
        const venueStat = statsByVenue[venue.id];
        if (!venueStat) {
          return {
            v: "-",
            bg: "transparent",
            logo: venue.logo,
            vn: venue.name,
            mcls: "fmc-v is-none",
          };
        }
        const intensity = Math.min(0.42, (Math.abs(venueStat.fh) / maxAbsRate) * 0.42 + 0.06);
        return {
          logo: venue.logo,
          vn: venue.name,
          mcls: "fmc-v",
          v: formatPct(venueStat.fh * fundingUnitHours, fundingDecimals),
          bg:
            venueStat.fh >= 0
              ? "color-mix(in srgb, var(--c-up) " + Math.round(intensity * 100) + "%, transparent)"
              : "rgba(229,72,77," + intensity.toFixed(2) + ")",
        };
      }),
    };
  });
  const fundingUnitTabs = [
    ["1h", "1h"],
    ["8h", "8h"],
    ["apr", "APR"],
  ].map((unit) => {
    const isActive = fundingUnit === unit[0];
    return {
      label: unit[1],
      cls: isActive ? "is-active" : "",
      pressed: isActive ? "true" : "false",
      pick: () => {
        self.setState({ funit: unit[0], tpg: firstPage("funding") });
      },
    };
  });
  const watchView = state.wview || "markets";
  const pageByTable = state.tpg || {};
  function paginate(tableKey: any, items: any, pageSize?: any) {
    pageSize = pageSize || 10;
    const total = items.length;
    for (
      var pageCount = Math.max(1, Math.ceil(total / pageSize)),
        page = Math.min(pageByTable[tableKey] || 0, pageCount - 1),
        start = page * pageSize,
        goToPage = (targetPage: any) => () => {
          const pages = { ...self.state.tpg };
          pages[tableKey] = Math.max(0, Math.min(pageCount - 1, targetPage));
          self.setState({ tpg: pages });
        },
        pageButtons = [],
        pageIndex = 0;
      pageIndex < pageCount;
      pageIndex++
    ) {
      pageButtons.push({
        label: String(pageIndex + 1),
        cls: "pgx-n" + (pageIndex === page ? " is-on" : ""),
        cur: pageIndex === page ? "page" : "false",
        go: goToPage(pageIndex),
      });
    }
    return {
      rows: items
        .slice(start, start + pageSize)
        .map((item: any, i: any) => ({ ...item, num: String(start + i + 1) })),
      pager: {
        text: total
          ? start + 1 + " to " + Math.min(total, start + pageSize) + " of " + total
          : "0 results",
        prev: goToPage(page - 1),
        next: goToPage(page + 1),
        prevDis: page === 0,
        nextDis: page >= pageCount - 1,
        nums: pageButtons,
        multi: pageCount > 1,
      },
    };
  }
  const watchViewTabs = [
    ["markets", "Markets"],
    ["exchanges", "Exchanges"],
    ["funding", "Funding"],
  ].map((tab) => {
    const isActive = watchView === tab[0];
    return {
      ic: ICON_PATHS[tab[0] as IconName],
      label: tab[1],
      cls: isActive ? "is-active" : "",
      pressed: isActive ? "true" : "false",
      pick: () => {
        self.setState({ wview: tab[0] });
      },
    };
  });
  const slowestVenue = VENUES.slice().sort((a, b) => venueMeta[b.id].lat - venueMeta[a.id].lat)[0];
  const feedStatus = {
    dotCls: "sdot" + (venueMeta[slowestVenue.id].ok ? "" : " warn"),
    text:
      "Live, updated " +
      (1 + (Math.floor(state.now / 1000) % 3)) +
      "s ago. " +
      VENUES.filter((venue) => venueMeta[venue.id].ok).length +
      " of " +
      VENUES.length +
      " feeds healthy, " +
      slowestVenue.name +
      " delayed at " +
      venueMeta[slowestVenue.id].lat +
      " ms",
  };
  const weekAxis = ["7d ago", "6d", "5d", "4d", "3d", "2d", "1d", "Now"].map((t) => ({ t }));
  const detailMetric = state.wdm || "funding";
  const detailSubview = state.wdsv || "book";
  if (state.watchOpen) {
    const detailMarket = findMarket(state.watchOpen);
    const detailStats = getMarketStats2(detailMarket);
    const detailAggregate = detailStats.w0;
    const seriesRng = seededRandom(hashString(detailMarket.sym + "series2"));
    const venuesByShare = detailStats.vm.slice().sort((a: any, b: any) => b.sh - a.sh);
    const selectedVenueId2 =
      state.wdx && venuesByShare.some((venueStat: any) => venueStat.v.id === state.wdx)
        ? state.wdx
        : venuesByShare[0].v.id;
    watchDetail.ex = venuesByShare.map((venueStat: any) => {
      const isSelected = venueStat.v.id === selectedVenueId2;
      const annualFunding = annualizeFunding(venueStat.fh);
      return {
        name: venueStat.v.name,
        logo: venueStat.v.logo,
        native: venueMeta[venueStat.v.id].nat(detailMarket.sym),
        price: formatPrice(venueStat.md),
        fund: formatPct(annualFunding, 1),
        fundCls: annualFunding >= 0 ? "" : "down",
        share: (venueStat.sh * 100).toFixed(1),
        shareText: Math.round(venueStat.sh * 100) + "%",
        cls: "mx-row" + (isSelected ? " is-on" : ""),
        selected: isSelected ? "true" : "false",
        pick: () => {
          self.setState({ wdx: venueStat.v.id });
        },
      };
    });
    const selectedVenueStat = venuesByShare.filter(
      (venueStat: any) => venueStat.v.id === selectedVenueId2,
    )[0];
    const selectedVenueRow: any = watchDetail.venues.filter(
      (row: any) => row.name === selectedVenueStat.v.name,
    )[0];
    const selectedSpec: any = watchDetail.specs.filter(
      (spec: any) => spec.name === selectedVenueStat.v.name,
    )[0];
    watchDetail.sel = {
      name: selectedVenueStat.v.name,
      logo: selectedVenueStat.v.logo,
      dotCls: selectedVenueRow.dotCls,
      lat: selectedVenueRow.lat,
      book: selectedVenueRow.book.slice(0, 6),
      spread: selectedVenueRow.spread,
      basis: selectedVenueRow.basis,
      trade: selectedVenueRow.trade,
      specs: [
        { k: "Native symbol", v: selectedSpec.native },
        { k: "Quote / settle", v: selectedSpec.quote },
        { k: "Contract multiplier", v: selectedSpec.mult },
        { k: "Tick size", v: selectedSpec.tick },
        { k: "Step size", v: selectedSpec.step },
        { k: "Min order", v: selectedSpec.minOrder },
        { k: "Min notional", v: selectedSpec.minNotional },
        { k: "Max leverage", v: selectedSpec.maxLev },
        { k: "Leverage tiers", v: selectedSpec.tiers },
        { k: "Maintenance margin", v: selectedSpec.mmr },
        { k: "Funding interval", v: venueMeta[selectedVenueId2].interval + "h" },
        { k: "Listed", v: selectedSpec.listed },
      ],
    };
    watchDetail.selBook = detailSubview === "book";
    watchDetail.selSpecs = detailSubview === "specs";
    function buildPath(values: any, min: any, max: any) {
      return buildLinePath(values, min, max);
    }
    const chart: any = {
      lines: [],
      barsUp: "M0 0",
      barsDown: "M0 0",
      zero: "M0 0",
      legend: [],
      x: [],
      valCls: "",
    };
    if (detailMetric === "funding") {
      var detailFundingSeries = venuesByShare.slice(0, 3).map((venueStat: any) => {
        const annualRate = annualizeFunding(venueStat.fh);
        const series = [];
        let value = annualRate * 0.6;
        for (let i = 0; i < 42; i++) {
          value += (annualRate - value) * 0.08 + (seriesRng() - 0.5) * Math.abs(annualRate) * 0.22;
          series.push(value);
        }
        series[41] = annualRate;
        return { o: venueStat, vals: series };
      });
      const allValues = [].concat.apply(
        [0],
        detailFundingSeries.map((entry: any) => entry.vals),
      );
      const valueMin = Math.min.apply(null, allValues);
      var valueMax = Math.max.apply(null, allValues);
      var lineColors = ["var(--text)", "var(--v2)", "var(--v4)"];
      chart.lines = detailFundingSeries.map((entry: any, index: any) => ({
        d: buildPath(entry.vals, valueMin, valueMax),
        area: "M0 0",
        fill: "none",
        c: lineColors[index],
      }));
      chart.legend = detailFundingSeries.map((entry: any, index: any) => ({
        c: lineColors[index],
        label: entry.o.v.name,
        value: formatPct(annualizeFunding(entry.o.fh), 1),
      }));
      chart.zero = "M0 " + valueToFundingY(0, valueMin, valueMax).toFixed(1) + "H1000";
      chart.hi = formatPct(valueMax, 0);
      chart.lo = formatPct(valueMin, 0);
      chart.title = "Funding, annualized";
      chart.value = formatPct(annualizeFunding(detailStats.fAvg), 2);
      chart.valCls = detailStats.fAvg >= 0 ? "" : "down";
      chart.x = weekAxis;
    } else if (detailMetric === "oi") {
      var detailOiHistory = [];
      let oiValue = detailAggregate.oi * (0.88 + seriesRng() * 0.08);
      for (let i = 0; i < 42; i++) {
        oiValue *= 1 + (seriesRng() - 0.47) * 0.02;
        detailOiHistory.push(oiValue);
      }
      detailOiHistory[41] = detailAggregate.oi;
      const oiMin = Math.min.apply(null, detailOiHistory) * 0.995;
      const oiMax = Math.max.apply(null, detailOiHistory) * 1.005;
      const oiPath = buildPath(detailOiHistory, oiMin, oiMax);
      chart.lines = [
        {
          d: oiPath,
          area: oiPath + " L1000 200 L0 200 Z",
          fill: "color-mix(in srgb, var(--text) 7%, transparent)",
          c: "var(--text)",
        },
      ];
      chart.hi = "$" + formatCompact(oiMax);
      chart.lo = "$" + formatCompact(oiMin);
      chart.title = "Open Interest";
      chart.value = "$" + formatCompact(detailAggregate.oi);
      chart.legend = [
        {
          c: "var(--text)",
          label: "Change, 7 Days",
          value: formatPct(
            ((detailAggregate.oi - detailOiHistory[0]) / detailOiHistory[0]) * 100,
            1,
          ),
        },
      ];
      chart.x = weekAxis;
    } else if (detailMetric === "liq") {
      var detailShortBarsPath = "";
      let longBarsPath = "";
      var detailLongSamples: any = [];
      var detailShortSamples: any = [];
      var detailMaxSample = 0;
      for (let i = 0; i < 24; i++) {
        const longSample = seriesRng() * seriesRng();
        const shortSample = seriesRng() * seriesRng();
        detailLongSamples.push(longSample);
        detailShortSamples.push(shortSample);
        detailMaxSample = Math.max(detailMaxSample, longSample, shortSample);
      }
      for (let i = 0; i < 24; i++) {
        var detailBarLeft = ((i * 1000) / 24 + 7).toFixed(1);
        var detailBarRight = (((i + 1) * 1000) / 24 - 7).toFixed(1);
        detailShortBarsPath +=
          "M" +
          detailBarLeft +
          " 100V" +
          (100 - (detailShortSamples[i] / detailMaxSample) * 88).toFixed(1) +
          "H" +
          detailBarRight +
          "V100Z";
        longBarsPath +=
          "M" +
          detailBarLeft +
          " 100V" +
          (100 + (detailLongSamples[i] / detailMaxSample) * 88).toFixed(1) +
          "H" +
          detailBarRight +
          "V100Z";
      }
      chart.barsUp = detailShortBarsPath;
      chart.barsDown = longBarsPath;
      chart.zero = "M0 100H1000";
      chart.hi = "Shorts";
      chart.lo = "Longs";
      chart.title = "Liquidations, 24h";
      chart.value = "$" + formatCompact(detailStats.liqLong + detailStats.liqShort);
      chart.legend = [
        { c: "#d7303a", label: "Longs", value: "$" + formatCompact(detailStats.liqLong) },
        { c: "var(--text)", label: "Shorts", value: "$" + formatCompact(detailStats.liqShort) },
      ];
      chart.x = [{ t: "24h ago" }, { t: "16h" }, { t: "8h" }, { t: "Now" }];
    } else {
      var detailCvdSeries = [];
      let cvd = 0;
      for (let i = 0; i < 48; i++) {
        cvd +=
          ((detailStats.buyShare - 0.5 + (seriesRng() - 0.5) * 0.3) * detailAggregate.vol) / 48;
        detailCvdSeries.push(cvd);
      }
      const cvdMin = Math.min.apply(null, detailCvdSeries.concat([0]));
      const cvdMax = Math.max.apply(null, detailCvdSeries.concat([0]));
      const cvdPath = buildPath(detailCvdSeries, cvdMin, cvdMax);
      chart.lines = [{ d: cvdPath, area: "M0 0", fill: "none", c: "var(--text)" }];
      chart.zero = "M0 " + valueToFundingY(0, cvdMin, cvdMax).toFixed(1) + "H1000";
      chart.hi = (cvdMax >= 0 ? "+$" : "-$") + formatCompact(Math.abs(cvdMax));
      chart.lo = (cvdMin >= 0 ? "+$" : "-$") + formatCompact(Math.abs(cvdMin));
      chart.title = "Cumulative volume delta, 24h";
      chart.value = (cvd >= 0 ? "+$" : "-$") + formatCompact(Math.abs(cvd));
      chart.valCls = cvd >= 0 ? "" : "down";
      chart.legend = [
        { c: "var(--text)", label: "Taker Buys", value: watchDetail.tbuy },
        { c: "#d7303a", label: "Taker Sells", value: watchDetail.tsell },
        { c: "var(--v4)", label: "Long / Short", value: watchDetail.lsr },
      ];
      chart.x = [{ t: "24h ago" }, { t: "16h" }, { t: "8h" }, { t: "Now" }];
    }
    let tooltipSeries = [];
    let totalHours = 168;
    if (detailMetric === "funding") {
      tooltipSeries = detailFundingSeries.map((entry: any, index: any) => ({
        name: entry.o.v.name,
        color: lineColors[index],
        vals: entry.vals,
        fmt: (value: any) => formatPct(value, 2),
      }));
      totalHours = 168;
    } else if (detailMetric === "oi") {
      tooltipSeries = [
        {
          name: "Open interest",
          color: "var(--text)",
          vals: detailOiHistory,
          fmt: (value: any) => "$" + formatCompact(value),
        },
      ];
      totalHours = 168;
    } else if (detailMetric === "liq") {
      tooltipSeries = [
        {
          name: "Longs",
          color: "#d7303a",
          vals: detailLongSamples.map(
            (sample: any) => ((sample / (detailMaxSample || 1)) * detailStats.liqLong) / 6,
          ),
          fmt: (value: any) => "$" + formatCompact(value),
        },
        {
          name: "Shorts",
          color: "var(--text)",
          vals: detailShortSamples.map(
            (sample: any) => ((sample / (detailMaxSample || 1)) * detailStats.liqShort) / 6,
          ),
          fmt: (value: any) => "$" + formatCompact(value),
        },
      ];
      totalHours = 24;
    } else {
      tooltipSeries = [
        {
          name: "Volume delta",
          color: "var(--text)",
          vals: detailCvdSeries,
          fmt: (value: any) => (value >= 0 ? "+$" : "-$") + formatCompact(Math.abs(value)),
        },
      ];
      totalHours = 24;
    }
    const pointCount = tooltipSeries.length ? tooltipSeries[0].vals.length : 1;
    const hoverIndex2 =
      state.mdHov != null && state.mdHovKey === watchDetail.sym + detailMetric ? state.mdHov : null;
    chart.move = (e: any) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const index = Math.round(ratio * (pointCount - 1));
      if (self.state.mdHov !== index || self.state.mdHovKey !== watchDetail.sym + detailMetric) {
        self.setState({ mdHov: index, mdHovKey: watchDetail.sym + detailMetric });
      }
    };
    chart.leave = (e: any) => {
      if (!e || e.pointerType !== "touch") {
        self.setState({ mdHov: null });
      }
    };
    chart.tip = { show: false };
    if (hoverIndex2 != null && hoverIndex2 < pointCount) {
      const hoursAgo = Math.round(((pointCount - 1 - hoverIndex2) / (pointCount - 1)) * totalHours);
      const leftPct = pointCount > 1 ? (hoverIndex2 / (pointCount - 1)) * 100 : 0;
      chart.tip = {
        show: true,
        left: leftPct.toFixed(2),
        side: leftPct > 55 ? "side-l" : "side-r",
        when:
          hoursAgo === 0
            ? "Now"
            : hoursAgo >= 24
              ? Math.round((hoursAgo / 24) * 10) / 10 + " days ago"
              : hoursAgo + "h ago",
        rows: tooltipSeries.map((series: any) => ({
          name: series.name,
          color: series.color,
          val: series.fmt(series.vals[hoverIndex2]),
        })),
      };
    }
    watchDetail.chart = chart;
    watchDetail.stats = [
      { label: "Price, VWAP", value: "$" + formatPrice(detailStats.vwap), cls: "" },
      {
        label: "24h Range",
        value: formatPrice(detailStats.low) + " to " + formatPrice(detailStats.high),
        cls: "",
      },
      { label: "Basis", value: watchDetail.basis, cls: watchDetail.basisCls },
      { label: "Price Gap", value: detailStats.gap.toFixed(1) + " bps", cls: "" },
      {
        label: "Funding Spread",
        value: annualizeFunding(detailStats.fSpread).toFixed(1) + "% APR",
        cls: "",
      },
      { label: "Long / Short", value: watchDetail.lsr, cls: "" },
    ];
  }
  const metricTabs = [
    ["funding", "Funding"],
    ["oi", "Open Interest"],
    ["liq", "Liquidations"],
    ["flow", "Flow"],
  ].map((tab) => {
    const isActive = detailMetric === tab[0];
    return {
      ic: ICON_PATHS[tab[0] as IconName],
      label: tab[1],
      cls: isActive ? "is-active" : "",
      pressed: isActive ? "true" : "false",
      pick: () => {
        self.setState({ wdm: tab[0] });
      },
    };
  });
  const subviewTabs = [
    ["book", "Book"],
    ["specs", "Specs"],
  ].map((tab) => {
    const isActive = detailSubview === tab[0];
    return {
      ic: ICON_PATHS[tab[0] as IconName],
      label: tab[1],
      cls: isActive ? "is-active" : "",
      pressed: isActive ? "true" : "false",
      pick: () => {
        self.setState({ wdsv: tab[0] });
      },
    };
  });
  fundingMatrix.forEach((row) => {
    row.cells.forEach((cell: any) => {
      if (cell.bg === "transparent") {
        cell.fg = "var(--text-4)";
        return;
      }
      const greenMatch = /(\d+)%, transparent\)$/.exec(cell.bg);
      const redMatch = /,([\d.]+)\)$/.exec(cell.bg);
      const intensity = greenMatch
        ? parseInt(greenMatch[1], 10) / 100
        : redMatch
          ? parseFloat(redMatch[1])
          : 0.2;
      const boosted = Math.min(0.75, intensity * 1.6);
      if (greenMatch) {
        cell.bg = "color-mix(in srgb, var(--c-up) " + Math.round(boosted * 100) + "%, transparent)";
        cell.fg = boosted > 0.4 ? "#ffffff" : "var(--text)";
      } else {
        cell.bg = "rgba(229,72,77," + boosted.toFixed(2) + ")";
        cell.fg = boosted > 0.3 ? "#ffffff" : "var(--text)";
      }
    });
  });
  const propAccounts = [
    {
      id: "c50",
      name: "Evaluation",
      sub: "Scored on your Prop mode trades",
      dot: "pa-dot orange",
      size: accountSize,
      closed: LIVE_BALANCE,
      dayStart: dayStartEquity,
      target: accountSize * 1.08,
      floor: accountSize * 0.9,
      start: "Sep 24",
      pos: state.positions,
      days: 6,
    },
  ];
  const getAccountEquity = (account: any) => account.closed + sumPositions(account.pos).upnl;
  const propAccount2 = propAccounts.filter(
    (candidate) => candidate.id === (state.ppAcct || "c50"),
  )[0];
  const equity2 = getAccountEquity(propAccount2);
  const profit = equity2 - propAccount2.size;
  const dayPnl = equity2 - propAccount2.dayStart;
  const dailyLossLimit = propAccount2.size * 0.05;
  const dayLoss = Math.max(0, propAccount2.dayStart - equity2);
  const dailyLossRemaining = Math.max(0, dailyLossLimit - dayLoss);
  const todayFloor = propAccount2.dayStart - dailyLossLimit;
  const equityRange = state.ppRange || "all";
  const rng2 = seededRandom(hashString(propAccount2.id + equityRange + "eq"));
  for (
    var pointCount2 = equityRange === "1d" ? 24 : equityRange === "1w" ? 42 : 56,
      startEquity =
        equityRange === "1d"
          ? propAccount2.dayStart
          : equityRange === "1w"
            ? equity2 - (equity2 - propAccount2.size) * 0.55
            : propAccount2.size,
      equityCurve2 = [startEquity],
      equityValue = startEquity,
      i3 = 1;
    i3 < pointCount2;
    i3++
  ) {
    equityValue +=
      (rng2() - 0.43) * (equityRange === "1d" ? 60 : 260) * (propAccount2.size / 50000);
    equityCurve2.push(equityValue);
  }
  const curveDrift = equity2 - equityCurve2[equityCurve2.length - 1];
  equityCurve2 = equityCurve2.map(
    (value, index) => value + (curveDrift * index) / (equityCurve2.length - 1),
  );
  const chartTop =
    propAccount2.target ||
    Math.max.apply(null, equityCurve2.concat([equity2])) + (equity2 - propAccount2.floor) * 0.15;
  const chartMin = propAccount2.floor - (chartTop - propAccount2.floor) * 0.04;
  const chartMax = chartTop + (chartTop - propAccount2.floor) * 0.04;
  const valueToY = (value: any) => 300 - ((value - chartMin) / (chartMax - chartMin)) * 300;
  const equityPath =
    "M" +
    equityCurve2
      .map(
        (value, index) =>
          ((index / (equityCurve2.length - 1)) * 1000).toFixed(1) +
          " " +
          valueToY(value).toFixed(1),
      )
      .join(" L");
  const valueToYPercent = (value: any) => (valueToY(value) / 3).toFixed(2);
  let gridPath2 = "";
  for (let i = 1; i < 5; i++) {
    gridPath2 += "M0 " + i * 60 + "H1000";
  }
  function formatMoney(value: any) {
    return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const levelLines = [];
  if (propAccount2.target) {
    levelLines.push({
      y: valueToYPercent(propAccount2.target),
      c: "var(--good)",
      v: propAccount2.target.toLocaleString("en-US"),
      label: "Pass",
    });
  } else {
    levelLines.push({
      y: valueToYPercent(chartTop),
      c: "var(--text-3)",
      v: Math.round(chartTop).toLocaleString("en-US"),
      label: "High",
    });
  }
  levelLines.push({
    y: valueToYPercent(todayFloor),
    c: "var(--warn)",
    v: Math.round(todayFloor).toLocaleString("en-US"),
    label: "Today’s floor",
  });
  levelLines.push({
    y: valueToYPercent(propAccount2.floor),
    c: "var(--bad)",
    v: propAccount2.floor.toLocaleString("en-US"),
    label: "Max Loss",
  });
  const targetTop = parseFloat(valueToYPercent(propAccount2.target || chartTop));
  const equityTop = parseFloat(valueToYPercent(equity2));
  const todayFloorTop = parseFloat(valueToYPercent(todayFloor));
  const floorTop = parseFloat(valueToYPercent(propAccount2.floor));
  const zoneBands = [
    {
      top: targetTop,
      h: Math.max(0, equityTop - targetTop),
      c: propAccount2.target
        ? "rgba(62,207,142,0.45)"
        : "color-mix(in srgb, var(--text) 18%, transparent)",
    },
    { top: equityTop, h: Math.max(0, todayFloorTop - equityTop), c: "rgba(233,185,73,0.55)" },
    { top: todayFloorTop, h: Math.max(0, floorTop - todayFloorTop), c: "rgba(244,91,79,0.5)" },
  ];
  let objectives;
  if (propAccount2.target) {
    const profitTargetPct2 = Math.max(
      0,
      Math.min(100, (profit / (propAccount2.target - propAccount2.size)) * 100),
    );
    const lossBufferPct =
      (Math.max(0, propAccount2.size - equity2) / (propAccount2.size - propAccount2.floor)) * 100;
    objectives = [
      {
        name: "Profit target",
        value: profitTargetPct2.toFixed(1) + "%",
        isBar: true,
        isSegs: false,
        pct: profitTargetPct2.toFixed(1),
        c: "var(--c-up)",
        note: formatMoney(Math.max(0, propAccount2.target - equity2)) + " to pass",
        segs: [],
      },
      {
        name: "Max loss",
        value: lossBufferPct.toFixed(0) + "%",
        isBar: true,
        isSegs: false,
        pct: lossBufferPct.toFixed(1),
        c: "var(--bad)",
        note: formatMoney(equity2 - propAccount2.floor) + " above floor",
        segs: [],
      },
      {
        name: "Trading days",
        value: propAccount2.days + " / 5",
        isBar: false,
        isSegs: true,
        pct: "100",
        c: "",
        note: propAccount2.days >= 5 ? "Minimum reached" : 5 - propAccount2.days + " more needed",
        segs: [0, 1, 2, 3, 4].map((dayIndex) => ({
          c: dayIndex < propAccount2.days ? "var(--good)" : "var(--active)",
        })),
      },
    ];
  } else {
    const lossBufferPct =
      (Math.max(0, propAccount2.size - equity2) / (propAccount2.size - propAccount2.floor)) * 100;
    objectives = [
      {
        name: "Profit this cycle",
        value: formatMoney(profit),
        isBar: true,
        isSegs: false,
        pct: Math.min(100, (profit / (propAccount2.size * 0.1)) * 100).toFixed(1),
        c: "var(--good)",
        note: "Paid out at 80%",
        segs: [],
      },
      {
        name: "Max loss",
        value: lossBufferPct.toFixed(0) + "%",
        isBar: true,
        isSegs: false,
        pct: lossBufferPct.toFixed(1),
        c: "var(--bad)",
        note: formatMoney(equity2 - propAccount2.floor) + " above floor",
        segs: [],
      },
      {
        name: "Payout cycle",
        value: "10 / 14 days",
        isBar: false,
        isSegs: true,
        pct: "",
        c: "",
        note: "Payout opens Oct 6",
        segs: [0, 1, 2, 3, 4, 5, 6].map((dayIndex) => ({
          c: dayIndex < 5 ? "var(--good)" : "var(--active)",
        })),
      },
    ];
  }
  const secondsUntilReset = 86400 - (Math.floor(state.now / 1000) % 86400);
  const dailyLimitUsedPct = Math.min(100, (dayLoss / dailyLossLimit) * 100);
  const propPositionRows2 = propAccount2.pos.map((position: any) => {
    const markPrice = getMidPrice(position.sym, position.venue);
    const pnl = (markPrice - position.entry) * position.qty * (position.side === "long" ? 1 : -1);
    const liqPrice =
      position.side === "long"
        ? position.entry * (1 - 0.9 / position.lev)
        : position.entry * (1 + 0.9 / position.lev);
    return {
      sym: position.sym,
      logo: LOGOS[position.sym.toLowerCase()],
      sideLabel: position.side === "long" ? "Long" : "Short",
      sideCls: position.side === "long" ? "good" : "down",
      lev: position.lev + "x",
      size: formatQty(position.qty),
      pnl: (pnl >= 0 ? "+" : "-") + formatMoney(Math.abs(pnl)),
      pnlCls: pnl >= 0 ? "good" : "bad",
      liqAway: ((Math.abs(markPrice - liqPrice) / markPrice) * 100).toFixed(1) + "%",
    };
  });
  const propPositionsPnl = propAccount2.pos.reduce(
    (total: any, position: any) =>
      total +
      (getMidPrice(position.sym, position.venue) - position.entry) *
        position.qty *
        (position.side === "long" ? 1 : -1),
    0,
  );
  const payoutProfit = 0;
  const rewardProgressPct = Math.max(0, Math.min(100, (profit / (propAccount2.size * 0.08)) * 100));
  const equityParts = formatMoney(equity2).split(".");
  const propDashboard2 = {
    accts: propAccounts.map((account) => {
      const isSelected = account.id === propAccount2.id;
      return {
        name: account.name,
        sub: account.sub,
        dotCls: account.dot,
        eq: formatMoney(getAccountEquity(account)),
        cls: "pa" + (isSelected ? " is-on" : ""),
        selected: isSelected ? "true" : "false",
        pick: () => {
          self.setState({ ppAcct: account.id });
        },
      };
    }),
    newOpen: !!state.ppNew,
    newOpenStr: state.ppNew ? "true" : "false",
    toggleNew: () => {
      self.setState({ ppNew: !state.ppNew });
    },
    eqWhole: equityParts[0],
    eqCents: equityParts[1],
    start: propAccount2.start,
    totalText:
      (profit >= 0 ? "+" : "-") +
      formatMoney(Math.abs(profit)) +
      " (" +
      ((profit / propAccount2.size) * 100).toFixed(2) +
      "%)",
    totalCls: profit >= 0 ? "good" : "bad",
    todayText: (dayPnl >= 0 ? "+" : "-") + formatMoney(Math.abs(dayPnl)),
    todayCls: dayPnl >= 0 ? "good" : "bad",
    ranges: [
      ["1d", "1D"],
      ["1w", "1W"],
      ["all", "All"],
    ].map((range) => {
      const isActive = equityRange === range[0];
      return {
        label: range[1],
        cls: isActive ? "is-active" : "",
        pressed: isActive ? "true" : "false",
        pick: () => {
          self.setState({ ppRange: range[0] });
        },
      };
    }),
    grid: gridPath2,
    line: equityPath,
    area: equityPath + " L1000 300 L0 300 Z",
    targetLine: propAccount2.target
      ? "M0 " + valueToY(propAccount2.target).toFixed(1) + "H1000"
      : "M0 0",
    maxLine: "M0 " + valueToY(propAccount2.floor).toFixed(1) + "H1000",
    dayLine: "M820 " + valueToY(todayFloor).toFixed(1) + "H1000",
    curY: valueToYPercent(equity2),
    curShort: Math.round(equity2).toLocaleString("en-US"),
    segs: zoneBands,
    marks: levelLines,
    x:
      equityRange === "1d"
        ? [{ t: "00:00" }, { t: "08:00" }, { t: "16:00" }, { t: "Now" }]
        : equityRange === "1w"
          ? [{ t: "Sep 26" }, { t: "Sep 28" }, { t: "Sep 30" }, { t: "Today" }]
          : [
              { t: propAccount2.start },
              { t: propAccount2.id === "c50" ? "Sep 27" : "Sep 10" },
              { t: propAccount2.id === "c50" ? "Sep 30" : "Sep 21" },
              { t: "Today" },
            ],
    objs: objectives,
    resetIn:
      Math.floor(secondsUntilReset / 3600) +
      "h " +
      pad2(Math.floor((secondsUntilReset % 3600) / 60)) +
      "m",
    gaugeUsed: dailyLimitUsedPct.toFixed(1) + " 100",
    usedOpacity: dailyLimitUsedPct > 0.5 ? "1" : "0",
    gaugeRest: "0 " + (dailyLimitUsedPct + 1.5).toFixed(1) + " 100 0",
    dailyLeft: "$" + formatMoney(dailyLossRemaining),
    dailyLimit: Math.round(dailyLossLimit).toLocaleString("en-US"),
    pos: propPositionRows2,
    noPos: propPositionRows2.length === 0,
    posTotal: (propPositionsPnl >= 0 ? "+" : "-") + formatMoney(Math.abs(propPositionsPnl)),
    posTotalCls: propPositionsPnl >= 0 ? "good" : "bad",
    payout: "$" + formatMoney(payoutProfit * 0.8),
    payProfit: "$" + formatMoney(payoutProfit),
    payDate: "Oct 6",
    payDays: 4,
    rewardStatus: rewardProgressPct >= 100 ? "Unlocked" : "Locked",
    rewardCta:
      rewardProgressPct >= 100
        ? "Claim funded account"
        : "Unlocks at +8%, " + Math.round(rewardProgressPct) + "% there",
  };
  const quoteNotional2 = orderNotional > 0 ? orderNotional : quoteNotional;
  const effectiveLeverage2 = Math.min(state.lev, market.max);
  const venueQuotes2 = venueRows.map((quote: any, index) => {
    const venue = venueById[quote.vid];
    const book = orderBooks[venue.id];
    const topPrice = isBuy ? book.asks[0].p : book.bids[0].p;
    const fill = simulateFill(isBuy ? book.asks : book.bids, quoteNotional2, isBuy);
    const avgFillPrice = fill.qty ? fill.filled / fill.qty : topPrice;
    const liqPrice = isBuy
      ? avgFillPrice * (1 - 0.9 / effectiveLeverage2)
      : avgFillPrice * (1 + 0.9 / effectiveLeverage2);
    const slippageBps = (Math.abs(avgFillPrice - topPrice) / topPrice) * 10000;
    const fundingApr = venue.fund * 24 * 365;
    return {
      rank: index + 1,
      vid: venue.id,
      name: venue.name,
      logo: venue.logo,
      isBest: index === 0,
      fill: "$" + formatPrice(avgFillPrice),
      delta:
        index === 0
          ? "Best price"
          : quote.cost === "Not enough depth"
            ? "Not enough depth"
            : quote.cost + " more",
      deltaCls: index === 0 ? "good" : quote.costCls === "bad" ? "bad" : "muted",
      fee: orderNotional > 0 ? formatUsd(fill.fees) : venue.fee.toFixed(3) + "%",
      funding: (fundingApr >= 0 ? "+" : "") + fundingApr.toFixed(1) + "%",
      liq: "$" + formatPrice(liqPrice),
      slip: slippageBps.toFixed(1) + " bps",
      selected: quote.isSel ? "true" : "false",
      cls: "vopt" + (quote.isSel ? " is-sel" : ""),
      isSel: quote.isSel,
      pick: quote.pick,
    };
  });
  const isQuotesOpen = !!state.qOpen;
  const selectedQuote = venueQuotes2.filter((quote) => quote.isSel)[0] || venueQuotes2[0];
  var quotePanel = {
    selName: selectedQuote.name,
    selLogo: selectedQuote.logo,
    selIsBest: selectedQuote.isBest,
    selList: venueQuotes2.filter((quote) => quote.isSel),
    all: venueQuotes2,
    open: isQuotesOpen,
    cls: "quotes" + (isQuotesOpen ? " is-open" : ""),
    popSub:
      orderNotional > 0
        ? "For your " + formatUsd(orderNotional).replace(".00", "") + (isBuy ? " long" : " short")
        : "For a $1,000 order",
    count: venueQuotes2.length,
    openStr: isQuotesOpen ? "true" : "false",
    toggle: () => {
      self.setState({ qOpen: !state.qOpen });
    },
    headText: orderNotional > 0 ? "Best quote found" : "Quotes for a $1,000 order",
  };
  const priceChange24h = (market.price * market.chg) / (100 + market.chg);
  const marketStats = [
    { label: "Mark", value: formatPrice(midPrice * 0.99998), cls: getFlashClass(market.sym) },
    { label: "Index", value: formatPrice(market.price * 0.99991), cls: "" },
    {
      label: "24h Change",
      value:
        (priceChange24h >= 0 ? "+" : "-") +
        (Math.abs(priceChange24h) >= 1
          ? Math.abs(priceChange24h).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : formatPrice(Math.abs(priceChange24h))) +
        " / " +
        (market.chg >= 0 ? "+" : "") +
        market.chg.toFixed(2) +
        "%",
      cls: market.chg >= 0 ? "" : "down",
    },
    {
      label: "24h Volume",
      value: "$" + formatCompact((marketVolume * activeVenue.mul) / totalVenueWeight),
      cls: "",
    },
    {
      label: "Open Interest",
      value: "$" + formatCompact((marketOpenInterest * activeVenue.mul) / totalVenueWeight),
      cls: "",
    },
    {
      label: "Funding / Next",
      value: activeVenue.fund.toFixed(4) + "% / " + fundingCountdown,
      cls: "",
    },
  ];
  for (
    var recentTrades = [], slotWidth = Math.floor(state.now / 700), tick = slotWidth;
    recentTrades.length < 22 && tick > slotWidth - 400;
    tick--
  ) {
    const tradeRng = seededRandom(hashString(market.sym + activeVenue.id + "t" + tick));
    if (!(tradeRng() < 0.45)) {
      const isBuy2 = tradeRng() < 0.52;
      const levelIndex = Math.floor(tradeRng() * 3);
      var tradePrice =
        (isBuy2 ? activeBook.asks[levelIndex].p : activeBook.bids[levelIndex].p) *
        (1 - (slotWidth - tick) * 0.000004 * (isBuy2 ? 1 : -1));
      const tradeDate = new Date(tick * 700);
      recentTrades.push({
        price: formatPrice(tradePrice),
        size: formatBookSize(200 + tradeRng() * 9000, tradePrice),
        time:
          pad2(tradeDate.getUTCHours()) +
          ":" +
          pad2(tradeDate.getUTCMinutes()) +
          ":" +
          pad2(tradeDate.getUTCSeconds()),
        cls:
          (isBuy2 ? "" : "down") + (tick === slotWidth || tick === slotWidth - 1 ? " tr-new" : ""),
      });
    }
  }
  const spread = activeBook.asks[0].p - activeBook.bids[0].p;
  const fillPct =
    freeBalance > 0
      ? Math.max(0, Math.min(100, Math.round((marginAmount / freeBalance) * 100)))
      : 0;
  const topOfBookPrice = isLong ? activeBook.asks[0].p : activeBook.bids[0].p;
  const slippageBps2 = hasFullFill
    ? (Math.abs(marketFill.filled / marketFill.qty - topOfBookPrice) / topOfBookPrice) * 10000
    : 0;
  const accountSummaries = [
    {
      name: "Pro mode",
      equity: formatUsd(liveEquity),
      free: formatUsd(LIVE_BALANCE - liveTotals.margin),
      used: formatUsd(liveTotals.margin),
      upnl: formatSignedUsd(liveTotals.upnl),
      upnlCls: liveTotals.upnl >= 0 ? "" : "down",
    },
    {
      name: "Prop mode",
      equity: formatUsd(propEquity),
      free: formatUsd(propEquity - propTotals.margin),
      used: formatUsd(propTotals.margin),
      upnl: formatSignedUsd(propTotals.upnl),
      upnlCls: propTotals.upnl >= 0 ? "" : "down",
    },
  ];
  const fundingPayments: any[] = [];
  activePositions.forEach((position: any) => {
    const venue = venueById[position.venue];
    const markPrice = getMidPrice(position.sym, position.venue);
    const sideSign = position.side === "long" ? 1 : -1;
    for (let hoursAgo = 0; hoursAgo < 48; hoursAgo++) {
      const paymentDate = new Date(Date.UTC(2026, 9, 2, 12) - hoursAgo * 3600000);
      const timeLabel =
        ["Sep", "Oct"][paymentDate.getUTCMonth() - 8] +
        " " +
        paymentDate.getUTCDate() +
        ", " +
        pad2(paymentDate.getUTCHours()) +
        ":00";
      const payment =
        ((-sideSign * venue.fund) / 100) *
        markPrice *
        position.qty *
        (0.7 + ((hoursAgo * 37) % 11) / 18);
      fundingPayments.push({
        ts: paymentDate.getTime(),
        time: timeLabel,
        sym: position.sym,
        logo: LOGOS[position.sym.toLowerCase()],
        venueLogo: venue.logo,
        venueName: venue.name,
        sideLabel: position.side === "long" ? "Long" : "Short",
        dirPath: position.side === "long" ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M6 13l6 6 6-6",
        sideCls: position.side,
        size: formatQty(position.qty) + " " + position.sym,
        rate: venue.fund.toFixed(4) + "%",
        pay: formatSignedUsd(payment),
        payCls: payment >= 0 ? "" : "down",
      });
    }
  });
  fundingPayments.sort((a, b) => b.ts - a.ts);
  const orderHistory = liveTradeHistory.map((trade) => ({
    time: trade.time,
    sym: trade.sym,
    logo: LOGOS[trade.sym.toLowerCase()],
    venueLogo: venueById[trade.venue].logo,
    venueName: venueById[trade.venue].name,
    type: "Market",
    sideLabel: trade.side === "long" ? "Buy" : "Sell",
    sideCls: trade.side,
    price: "$" + formatPrice(trade.price),
    amount: formatQty(trade.qty) + " " + trade.sym,
    filled: "100%",
    status: "Filled",
    statusCls: "st-ok",
  }));
  for (let index = orderHistory.length - 4; index > 6; index -= 7) {
    const order = orderHistory[index];
    orderHistory.splice(index, 0, {
      ...order,
      type: "Limit",
      price: "$" + formatPrice(parseFloat(order.price.replace(/[$,]/g, "")) * 0.985),
      filled: "0%",
      status: "Cancelled",
      statusCls: "st-x",
    });
  }
  orderHistory.splice(1, 0, {
    time: "Oct 2, 03:40",
    sym: "ETH",
    logo: LOGOS.eth,
    venueLogo: venueById.lighter.logo,
    venueName: "Lighter",
    type: "Limit",
    sideLabel: "Buy",
    sideCls: "long",
    price: "$1,950.00",
    amount: "2 ETH",
    filled: "0%",
    status: "Cancelled",
    statusCls: "st-x",
  });
  const visibleRowCapacity = Math.floor(((state.dockOpen ? state.dockH : 46) - 44 - 34 - 52) / 44);
  const autoPageSize = Math.max(5, Math.min(25, visibleRowCapacity));
  const pageSize2 = state.pgSize && state.pgSize !== "auto" ? state.pgSize : autoPageSize;
  const isMarketFilterOn = !!state.pgMkt;
  function paginate2(rows: any, tabKey: any) {
    const filteredRows = isMarketFilterOn
      ? rows.filter((row: any) => row.sym === market.sym)
      : rows;
    const totalRows = filteredRows.length;
    const pageCount = Math.max(1, Math.ceil(totalRows / pageSize2));
    const currentPage = Math.min(pageCount, Math.max(1, (state.pg && state.pg[tabKey]) || 1));
    function goToPage(page: any) {
      return () => {
        const nextPages = { ...state.pg };
        nextPages[tabKey] = page;
        self.setState({ pg: nextPages });
      };
    }
    const pageCandidates = [1, pageCount, currentPage - 1, currentPage, currentPage + 1];
    if (currentPage <= 3) {
      pageCandidates.push(2, 3, 4);
    }
    if (currentPage >= pageCount - 2) {
      pageCandidates.push(pageCount - 1, pageCount - 2, pageCount - 3);
    }
    const pageNumbers = pageCandidates
      .filter(
        (page, index) => page >= 1 && page <= pageCount && pageCandidates.indexOf(page) === index,
      )
      .sort((a, b) => a - b);
    const pageItems: any[] = [];
    pageNumbers.forEach((pageNumber, index) => {
      if (index > 0 && pageNumber - pageNumbers[index - 1] > 1) {
        pageItems.push({ isGap: true, isNum: false, label: "", cls: "", cur: "false", pick: null });
      }
      pageItems.push({
        isGap: false,
        isNum: true,
        label: String(pageNumber),
        cls: "pg-num" + (pageNumber === currentPage ? " is-on" : ""),
        cur: pageNumber === currentPage ? "page" : "false",
        pick: goToPage(pageNumber),
      });
    });
    const firstRow = totalRows ? (currentPage - 1) * pageSize2 + 1 : 0;
    const lastRow = Math.min(totalRows, currentPage * pageSize2);
    return {
      rows: filteredRows.slice(firstRow ? firstRow - 1 : 0, lastRow),
      pager: {
        show: true,
        empty: totalRows === 0,
        emptyText: isMarketFilterOn
          ? "Nothing on " + market.sym + "-PERP yet."
          : "Nothing here yet.",
        label: totalRows ? firstRow + " to " + lastRow + " of " + totalRows : "0 results",
        pages: pageItems,
        prev: goToPage(Math.max(1, currentPage - 1)),
        next: goToPage(Math.min(pageCount, currentPage + 1)),
        prevDis: currentPage <= 1,
        nextDis: currentPage >= pageCount,
        mktOn: isMarketFilterOn,
        mktLabel: market.sym + "-PERP only",
        toggleMkt: () => {
          self.setState({ pgMkt: !state.pgMkt, pg: {} });
        },
        sizes: [
          ["auto", "Fit"],
          [25, "25"],
          [50, "50"],
        ].map((option) => {
          const isActive = (state.pgSize || "auto") === option[0];
          return {
            label: option[1],
            cls: isActive ? "is-active" : "",
            pressed: isActive ? "true" : "false",
            pick: () => {
              self.setState({ pgSize: option[0], pg: {} });
            },
          };
        }),
      },
    };
  }
  const recentHistory = tradeHistoryRows.slice(0, 20);
  const historyPage = paginate2(tradeHistoryRows, "history");
  const fundingPage = paginate2(fundingPayments, "funding");
  const orderHistoryPage = paginate2(orderHistory, "ohist");
  const activePager: any =
    state.ptab === "history"
      ? historyPage.pager
      : state.ptab === "funding"
        ? fundingPage.pager
        : state.ptab === "ohist"
          ? orderHistoryPage.pager
          : { show: false, pages: [], sizes: [] };
  const searchOpen = !!state.srch;
  const paletteQuery = (state.sq || "").trim().toLowerCase();
  const searchTabs = [
    ["all", "All"],
    ["markets", "Markets"],
    ["gainers", "Top gainers"],
    ["losers", "Top losers"],
    ["new", "Newly listed"],
    ["venues", "Venues"],
    ["positions", "Positions"],
  ];
  const searchTab = searchTabs.some((tab) => tab[0] === state.stab) ? state.stab : "all";
  const marketSort = state.ssort || "vol";
  function searchState(overrides?: any) {
    return { srch: false, sq: "", sIdx: 0, sMore: null, ...(overrides || {}) };
  }
  function matchesQuery(value: any) {
    return !paletteQuery || String(value).toLowerCase().indexOf(paletteQuery) > -1;
  }
  if (!searchOpen) {
    self._sChg = null;
  } else if (!self._sChg) {
    self._sChg = {};
    MARKETS.forEach((market2) => {
      self._sChg[market2.sym] = market2.chg;
    });
  }
  const frozenChange = (market2: any) =>
    self._sChg && market2.sym in self._sChg ? self._sChg[market2.sym] : market2.chg;
  const venueQuery = paletteQuery.length >= 2 ? paletteQuery : "";
  const matchedVenues = VENUES.filter(
    (venue) => venueQuery && venue.name.toLowerCase().indexOf(venueQuery) > -1,
  );
  function venuesListing(market2: any) {
    return matchedVenues.filter(
      (venue) => !market2.venues || market2.venues.indexOf(venue.id) > -1,
    );
  }
  const marketSortValue: any = {
    vol: (market2: any) => getMarketStats2(market2).w0.vol,
    oi: (market2: any) => getMarketStats2(market2).w0.oi,
    fund: (market2: any) => getMarketStats2(market2).fAvg,
  };
  const matchedMarkets = !searchOpen
    ? []
    : MARKETS.filter(
        (market2) =>
          matchesQuery(market2.sym) ||
          matchesQuery(market2.name) ||
          matchesQuery(market2.cat) ||
          venuesListing(market2).length > 0,
      ).sort(
        (a, b) =>
          (paletteQuery &&
            (a.sym.toLowerCase().indexOf(paletteQuery) === 0 ? -1 : 0) -
              (b.sym.toLowerCase().indexOf(paletteQuery) === 0 ? -1 : 0)) ||
          marketSortValue[marketSort](b) - marketSortValue[marketSort](a),
      );
  const listingDates: any = {
    US30: [2026, 8, 28],
    USDJPY: [2026, 8, 24],
    WTI: [2026, 8, 19],
    GBPUSD: [2026, 8, 12],
    AAPL: [2026, 8, 5],
    TSLA: [2026, 7, 29],
    NVDA: [2026, 7, 22],
    XAU: [2026, 7, 14],
    SUI: [2026, 6, 2],
    HYPE: [2026, 5, 20],
  };
  function getListingTime(sym: any) {
    const listing = listingDates[sym];
    if (listing) {
      return Date.UTC(listing[0], listing[1], listing[2]);
    } else {
      return Date.UTC(2025, 0, 15);
    }
  }
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const marketResults = matchedMarkets.map((market2) => {
    const funding = getMarketStats2(market2).fAvg;
    const directMatch =
      matchesQuery(market2.sym) || matchesQuery(market2.name) || matchesQuery(market2.cat);
    const listedOn = directMatch ? [] : venuesListing(market2);
    return {
      kind: "market",
      logo: LOGOS[market2.sym.toLowerCase()],
      title: market2.sym + "-PERP",
      hasTag: true,
      tag: market2.max + "x",
      sub:
        market2.name +
        ", " +
        market2.cat +
        (listedOn.length ? ", on " + listedOn.map((venue) => venue.name).join(", ") : ""),
      mk: market2,
      c1: "$" + formatPrice(market2.price),
      c1sub: formatChange(market2.chg),
      c1subCls: market2.chg >= 0 ? "up" : "down",
      c2: "$" + formatCompact(getMarketStats2(market2).w0.vol),
      c3: "$" + formatCompact(getMarketStats2(market2).w0.oi),
      c4: formatPct(funding, 4),
      c4Cls: funding >= 0 ? "" : "down",
      open: () => {
        self.setState(searchState());
        makeSelectMarket(market2.sym)();
      },
    };
  });
  const venueResults = !searchOpen
    ? []
    : VENUES.filter((venue) => {
        const venueMeta2 = venueMeta[venue.id];
        return (
          matchesQuery(venue.name) ||
          matchesQuery(venueMeta2.type) ||
          matchesQuery(venueMeta2.chain)
        );
      }).map((venue: any) => {
        const venueMeta2 = venueMeta[venue.id];
        const venueStats = venueRows2.filter((stats) => stats.name === venue.name)[0];
        return {
          kind: "venue",
          logo: venue.logo,
          title: venue.name,
          hasTag: true,
          tag: venueMeta2.type,
          sub: venueMeta2.chain + ", " + venueStats.markets + " markets",
          c1: "$" + venueStats.volN,
          c1sub: "",
          c1subCls: "",
          c2: "$" + venueStats.oiN,
          c3: venueStats.fMin + " to " + venueStats.fMax,
          c4: venueStats.lat,
          c4Cls: venueMeta2.ok ? "" : "down",
          open: () => {
            self.setState(
              searchState({
                screen: "watch",
                wview: "exchanges",
                watchOpen: null,
                xq: venue.name,
                xcat: "all",
                tpg: firstPage("venues"),
              }),
            );
          },
        };
      });
  const positionResults = !searchOpen
    ? []
    : positionRows
        .filter(
          (position: any) =>
            matchesQuery(position.sym) ||
            matchesQuery(position.venueName) ||
            matchesQuery(position.sideLabel),
        )
        .map((position: any) => ({
          kind: "position",
          logo: position.logo,
          title: position.sym + "-PERP",
          hasTag: true,
          tag: position.levText,
          sub:
            position.sideLabel +
            " on " +
            position.venueName +
            (isPropAccount ? ", prop account" : ""),
          c1: position.pnlText,
          c1sub: position.roeText,
          c1subCls: position.pnlCls,
          c2: position.sizeText,
          c3: position.valueText,
          c4: position.liqText,
          c4Cls: "",
          open: () => {
            self.setState(searchState());
            makeSelectMarket(position.sym, position.venueId)();
          },
        }));
  const searchSections: any[] = [];
  function addSection(key: any, title: any, headers: any, items: any, collapsedLimit: any) {
    if (!items.length) {
      return;
    }
    const limit =
      searchTab === "all" && state.sMore !== key && !paletteQuery ? collapsedLimit : items.length;
    const shown = items.slice(0, limit);
    if (items.length > limit) {
      shown.push({
        kind: "more",
        title: "Show all " + items.length,
        open: () => {
          self.setState({ sMore: key });
        },
      });
    }
    searchSections.push({ key: key, title: title, headers: headers, items: shown });
  }
  const gainers = marketResults
    .filter((result) => frozenChange(result.mk) > 0)
    .sort((a, b) => frozenChange(b.mk) - frozenChange(a.mk));
  const losers = marketResults
    .filter((result) => frozenChange(result.mk) < 0)
    .sort((a, b) => frozenChange(a.mk) - frozenChange(b.mk));
  const newListings = marketResults
    .filter((result) => listingDates[result.mk.sym])
    .sort((a, b) => getListingTime(b.mk.sym) - getListingTime(a.mk.sym))
    .map((result) => {
      const listedDate = new Date(getListingTime(result.mk.sym));
      return {
        ...result,
        sub:
          result.mk.name +
          ", listed " +
          monthNames[listedDate.getUTCMonth()] +
          " " +
          listedDate.getUTCDate(),
      };
    });
  const marketHeaders = ["Price", "24h Volume", "Open Interest", "Funding, 1h"];
  if (searchTab === "all" || searchTab === "markets") {
    addSection(
      "markets",
      paletteQuery ? "Markets" : "Most traded markets",
      marketHeaders,
      marketResults,
      5,
    );
  }
  if (searchTab === "gainers") {
    addSection("gainers", "Top gainers, 24h", marketHeaders, gainers, 0);
  }
  if (searchTab === "losers") {
    addSection("losers", "Top losers, 24h", marketHeaders, losers, 0);
  }
  if (searchTab === "new") {
    addSection("new", "Newly listed", marketHeaders, newListings, 0);
  }
  if (searchTab === "all" || searchTab === "venues") {
    addSection(
      "venues",
      "Venues",
      ["24h Volume", "Open Interest", "Funding Range, APR", "Latency"],
      venueResults,
      3,
    );
  }
  if (searchTab === "all" || searchTab === "positions") {
    addSection(
      "positions",
      isPropAccount ? "Your prop positions" : "Your positions",
      ["PnL", "Size", "Value", "Liq. price"],
      positionResults,
      3,
    );
  }
  const flatItems: any[] = [];
  searchSections.forEach((section: any) => {
    section.items.forEach((item: any) => {
      item.index = flatItems.length;
      item.id = "sr-opt-" + flatItems.length;
      flatItems.push(item);
    });
  });
  const activeIndex = Math.max(0, Math.min(state.sIdx || 0, flatItems.length - 1));
  flatItems.forEach((item: any) => {
    const isActive = item.index === activeIndex;
    item.selected = isActive;
    item.cls =
      (item.kind === "more" ? "sr-row ss-more" : "sr-row") + (isActive ? " is-active" : "");
    item.hover = () => {
      if ((self.state.sIdx || 0) !== item.index) {
        self.setState({ sIdx: item.index });
      }
    };
  });
  const resultCount = flatItems.filter((item: any) => item.kind !== "more").length;
  function moveSearchIndex(index: number) {
    self.setState({ sIdx: Math.max(0, Math.min(flatItems.length - 1, index)) });
  }
  const searchView = {
    isOpen: searchOpen,
    openStr: searchOpen ? "true" : "false",
    q: state.sq || "",
    kbd:
      typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "")
        ? "⌘K"
        : "Ctrl K",
    open: () => {
      self.setState({ srch: true, sq: "", sIdx: 0, sMore: null, profile: false, drawer: false });
    },
    close: () => {
      self.setState(searchState());
    },
    onQ: (e: any) => {
      self.setState({ sq: e.target.value, sIdx: 0, sMore: null });
    },
    onKey: (e: any) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSearchIndex(activeIndex + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSearchIndex(activeIndex - 1);
      } else if (e.key === "PageDown") {
        e.preventDefault();
        moveSearchIndex(activeIndex + 8);
      } else if (e.key === "PageUp") {
        e.preventDefault();
        moveSearchIndex(activeIndex - 8);
      } else if (e.key === "Enter" && flatItems[activeIndex]) {
        e.preventDefault();
        flatItems[activeIndex].open();
      }
    },
    listId: "srch-list",
    activeId: flatItems.length ? flatItems[activeIndex].id : undefined,
    status: paletteQuery ? resultCount + (resultCount === 1 ? " result" : " results") : "",
    tabs: searchTabs.map((tab) => {
      const isActive = searchTab === tab[0];
      const count =
        tab[0] === "all"
          ? marketResults.length + venueResults.length + positionResults.length
          : tab[0] === "markets"
            ? marketResults.length
            : tab[0] === "gainers"
              ? gainers.length
              : tab[0] === "losers"
                ? losers.length
                : tab[0] === "new"
                  ? newListings.length
                  : tab[0] === "venues"
                    ? venueResults.length
                    : positionResults.length;
      return {
        id: "st-" + tab[0],
        label: tab[1],
        count: String(count),
        cls: "st-tab" + (isActive ? " is-on" : ""),
        selected: isActive,
        pick: () => {
          self.setState({ stab: tab[0], sIdx: 0, sMore: null });
        },
      };
    }),
    activeTabId: "st-" + searchTab,
    sorts:
      searchTab === "markets"
        ? [
            ["vol", "24h Volume"],
            ["oi", "Open Interest"],
            ["fund", "Funding, 1h"],
          ].map((sort) => ({
            label: sort[1],
            sorted: marketSort === sort[0],
            pick: () => {
              self.setState({ ssort: sort[0], sIdx: 0 });
            },
          }))
        : null,
    sections: searchSections,
    empty: !!paletteQuery && flatItems.length === 0,
  };
  let chartView = state.cv || "price";
  if (chartView === "socials") {
    chartView = "price";
  }
  const chartTabs = [
    ["price", "Chart"],
    ["depth", "Depth"],
    ["funding", "Funding"],
  ].map((tab) => {
    const isActive = chartView === tab[0];
    return {
      label: tab[1],
      cls: "cv-tab" + (isActive ? " is-on" : ""),
      pressed: isActive ? "true" : "false",
      pick: () => {
        self.setState({ cv: tab[0], dzHov: null, fzHov: null });
      },
    };
  });
  function makeHoverHandler(stateKey: any) {
    return (e: any) => {
      const target = e.currentTarget;
      const rect = target.getBoundingClientRect();
      const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
      const patch: any = {};
      patch[stateKey] = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      self.setState(patch);
    };
  }
  function makeLeaveHandler(stateKey: any) {
    return () => {
      const patch: any = {};
      patch[stateKey] = null;
      self.setState(patch);
    };
  }
  const depthRangePct = state.dzPct || 0.2;
  const midPrice3 = (activeBook.asks[0].p + activeBook.bids[0].p) / 2;
  var depthLow = midPrice3 * (1 - depthRangePct / 100);
  var depthHigh = midPrice3 * (1 + depthRangePct / 100);
  function extendDepth(levels: any, direction: any) {
    for (
      var extended = levels.map((level: any) => ({ p: level.p, usd: level.usd })),
        rng = seededRandom(hashString(market.sym + activeVenue.id + "dz" + direction)),
        priceStep =
          Math.abs(extended[extended.length - 1].p - extended[0].p) /
            Math.max(1, extended.length - 1) || midPrice3 * 0.0001;
      direction < 0
        ? extended[extended.length - 1].p > depthLow
        : extended[extended.length - 1].p < depthHigh;
    ) {
      const last = extended[extended.length - 1];
      extended.push({
        p: last.p + direction * priceStep * (0.6 + rng() * 0.9),
        usd: last.usd * (0.7 + rng() * 0.9) + midPrice3 * 0.02 * rng() * activeVenue.mul,
      });
      if (extended.length > 400) {
        break;
      }
    }
    let cumulative = 0;
    return extended.map((level: any) => {
      cumulative += level.usd;
      return { p: level.p, usd: level.usd, cum: cumulative };
    });
  }
  const extendedBids = extendDepth(activeBook.bids, -1);
  const extendedAsks = extendDepth(activeBook.asks, 1);
  const visibleBids = extendedBids.filter((level: any) => level.p >= depthLow);
  const visibleAsks = extendedAsks.filter((level: any) => level.p <= depthHigh);
  var depthMax =
    Math.max(
      visibleBids.length ? visibleBids[visibleBids.length - 1].cum : 1,
      visibleAsks.length ? visibleAsks[visibleAsks.length - 1].cum : 1,
    ) * 1.08;
  function priceToX(price: any) {
    return ((price - depthLow) / (depthHigh - depthLow)) * 1000;
  }
  function depthToY(cumDepth: any) {
    return 300 - (cumDepth / depthMax) * 285;
  }
  function buildDepthPath(levels: any, edgePrice: any) {
    if (!levels.length) {
      return { line: "M0 0", area: "M0 0" };
    }
    let path = "M" + priceToX(levels[0].p).toFixed(1) + " 300";
    levels.forEach((level: any, index: any) => {
      path += "V" + depthToY(level.cum).toFixed(1);
      const endX = index < levels.length - 1 ? priceToX(levels[index + 1].p) : priceToX(edgePrice);
      path += "H" + endX.toFixed(1);
    });
    return { line: path, area: path + "V300Z" };
  }
  let bidPaths = buildDepthPath(visibleBids, depthLow);
  let askPaths = buildDepthPath(visibleAsks, depthHigh);
  const timeframe2 = TIMEFRAMES.filter((tf) => tf.id === state.tf)[0] || TIMEFRAMES[1];
  const avgRng = seededRandom(hashString(market.sym + activeVenue.id + "avg" + timeframe2.id));
  const bidAvgFactor = 0.75 + avgRng() * 0.55;
  const askAvgFactor = 0.75 + avgRng() * 0.55;
  function scaleDepth(levels: any, factor: any) {
    return levels.map((level: any, index: any) => ({
      p: level.p,
      usd: level.usd,
      cum: level.cum * (factor + Math.sin(index * 0.7 + factor * 5) * 0.06),
    }));
  }
  const avgBids = scaleDepth(visibleBids, bidAvgFactor);
  const avgAsks = scaleDepth(visibleAsks, askAvgFactor);
  depthMax = Math.max(
    depthMax,
    (avgBids.length ? avgBids[avgBids.length - 1].cum : 0) * 1.08,
    (avgAsks.length ? avgAsks[avgAsks.length - 1].cum : 0) * 1.08,
  );
  bidPaths = buildDepthPath(visibleBids, depthLow);
  askPaths = buildDepthPath(visibleAsks, depthHigh);
  const avgBidPaths = buildDepthPath(avgBids, depthLow);
  const avgAskPaths = buildDepthPath(avgAsks, depthHigh);
  const timeframeLabel = timeframe2.range.replace("in the ", "");
  const bidVsAvgPct = (1 / bidAvgFactor - 1) * 100;
  const askVsAvgPct = (1 / askAvgFactor - 1) * 100;
  const depthHover = state.dzHov;
  let depthHoverTip: any = { hov: false };
  if (depthHover != null && chartView === "depth") {
    const hoverPrice = depthLow + depthHover * (depthHigh - depthLow);
    const isBidSide = hoverPrice < midPrice3;
    const sideLevels = isBidSide
      ? visibleBids.filter((level: any) => level.p >= hoverPrice)
      : visibleAsks.filter((level: any) => level.p <= hoverPrice);
    const hoverTotal = sideLevels.length ? sideLevels[sideLevels.length - 1].cum : 0;
    const avgSideLevels = isBidSide
      ? avgBids.filter((level: any) => level.p >= hoverPrice)
      : avgAsks.filter((level: any) => level.p <= hoverPrice);
    const hoverAvgTotal = avgSideLevels.length ? avgSideLevels[avgSideLevels.length - 1].cum : 0;
    depthHoverTip = {
      tAvg: "$" + formatCompact(hoverAvgTotal),
      hov: true,
      hx: (depthHover * 100).toFixed(2),
      hy: (depthToY(hoverTotal) / 3).toFixed(2),
      hc: isBidSide ? "var(--text)" : "#d7303a",
      tSide: isBidSide ? "Bids" : "Asks",
      tPrice: formatPrice(hoverPrice),
      tTotal: "$" + formatCompact(hoverTotal),
      tDist: (((hoverPrice - midPrice3) / midPrice3) * 100).toFixed(3) + "%",
      tipY: Math.min(60, Math.max(4, depthToY(hoverTotal) / 3 - 30)).toFixed(1),
      tipCls: "cz-tip" + (depthHover > 0.62 ? " left" : ""),
    };
  }
  const depthChart = {
    mid: formatPrice(midPrice3),
    spread:
      (((activeBook.asks[0].p - activeBook.bids[0].p) / midPrice3) * 10000).toFixed(1) + " bps",
    bidTot: "$" + formatCompact(visibleBids.length ? visibleBids[visibleBids.length - 1].cum : 0),
    askTot: "$" + formatCompact(visibleAsks.length ? visibleAsks[visibleAsks.length - 1].cum : 0),
    tfLabel: timeframeLabel,
    avgBid: avgBidPaths.line,
    avgAsk: avgAskPaths.line,
    avgLabel: "Average over the " + timeframeLabel,
    vsB: (bidVsAvgPct >= 0 ? "+" : "") + bidVsAvgPct.toFixed(0) + "%",
    vsBCls: bidVsAvgPct >= 0 ? "" : "down",
    vsA: (askVsAvgPct >= 0 ? "+" : "") + askVsAvgPct.toFixed(0) + "%",
    vsACls: askVsAvgPct >= 0 ? "" : "down",
    grid: "M0 75H1000M0 150H1000M0 225H1000M250 0V300M750 0V300",
    bidLine: bidPaths.line,
    bidArea: bidPaths.area,
    askLine: askPaths.line,
    askArea: askPaths.area,
    midLine: "M500 0V300",
    yt: [1, 0.66, 0.33].map((factor) => ({
      y: (depthToY(depthMax * factor) / 3).toFixed(1),
      label: "$" + formatCompact(depthMax * factor),
    })),
    xt: [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
      x: (fraction * 100).toFixed(1),
      t: formatPrice(depthLow + fraction * (depthHigh - depthLow)),
    })),
    ranges: [0.1, 0.2, 0.5, 1].map((pct) => {
      const isActive = depthRangePct === pct;
      return {
        label: "±" + pct + "%",
        cls: isActive ? "is-active" : "",
        pressed: isActive ? "true" : "false",
        pick: () => {
          self.setState({ dzPct: pct, dzHov: null });
        },
      };
    }),
    move: makeHoverHandler("dzHov"),
    leave: makeLeaveHandler("dzHov"),
    ...depthHoverTip,
  };
  const fundingTimeframe = TIMEFRAMES.filter((tf) => tf.id === state.tf)[0] || TIMEFRAMES[1];
  const fundingWindow: any = {
    "15m": { n: 24, ms: 3600000, win: "Last 24 hours, hourly" },
    "1H": { n: 96, ms: 3600000, win: "Last 4 days, hourly" },
    "4H": { n: 90, ms: 14400000, win: "Last 15 days, 4h average" },
    "1D": { n: 90, ms: 86400000, win: "Last 3 months, daily average" },
    "1W": { n: 78, ms: 604800000, win: "Last 18 months, weekly average" },
  }[fundingTimeframe.id];
  for (
    var sampleCount = fundingWindow.n,
      fundingRng = seededRandom(
        hashString(market.sym + activeVenue.id + "fz" + fundingTimeframe.id),
      ),
      hoursPerSample = Math.sqrt(fundingWindow.ms / 3600000),
      targetRate = activeVenue.fund * (market.chg >= 0 ? 1 : -0.6),
      fundingRates2 = [],
      currentRate2 = targetRate * 0.5,
      prices: any = [],
      price2 =
        market.price *
        (1 - (market.chg / 100) * Math.min(4, (sampleCount * fundingWindow.ms) / 86400000) * 0.3),
      sampleIdx = 0;
    sampleIdx < sampleCount;
    sampleIdx++
  ) {
    currentRate2 +=
      (targetRate - currentRate2) * 0.06 +
      ((fundingRng() - 0.5) * Math.abs(targetRate) * 0.9) / Math.max(1, hoursPerSample * 0.6);
    if (fundingRng() < 0.014) {
      currentRate2 +=
        ((fundingRng() < 0.5 ? -1 : 1) * Math.abs(targetRate) * (3 + fundingRng() * 5)) /
        Math.max(1, hoursPerSample * 0.5);
    }
    fundingRates2.push(currentRate2);
    price2 *= 1 + (fundingRng() - 0.5) * fundingTimeframe.vol * 1.6;
    prices.push(price2);
  }
  fundingRates2[sampleCount - 1] = targetRate;
  const priceDrift = market.price - prices[sampleCount - 1];
  prices = prices.map((price: any, index: any) => price + (priceDrift * index) / (sampleCount - 1));
  var fundingAxisMax = Math.max(0, Math.max.apply(null, fundingRates2));
  var fundingAxisMin = Math.min(0, Math.min.apply(null, fundingRates2));
  if (fundingAxisMax === 0 && fundingAxisMin === 0) {
    fundingAxisMax = 0.001;
  }
  const rangePadding = (fundingAxisMax - fundingAxisMin) * 0.08;
  const rateMax = fundingAxisMax > 0 ? fundingAxisMax + rangePadding : 0;
  const rateMin = fundingAxisMin < 0 ? fundingAxisMin - rangePadding : 0;
  function rateToY(rate: any) {
    return 10 + ((rateMax - rate) / (rateMax - rateMin)) * 280;
  }
  const zeroY = rateToY(0).toFixed(1);
  const maxAbsRate2 = Math.max(Math.abs(rateMax), Math.abs(rateMin));
  const priceMin = Math.min.apply(null, prices);
  const priceMax = Math.max.apply(null, prices);
  function priceToY2(price: any) {
    return 280 - ((price - priceMin) / (priceMax - priceMin || 1)) * 260;
  }
  var fundingBarWidth = 1000 / sampleCount;
  let positiveBarsPath = "";
  let negativeBarsPath = "";
  fundingRates2.forEach((rate, index) => {
    const barLeft = (index * fundingBarWidth).toFixed(2);
    const barRight = (index * fundingBarWidth + Math.max(0.6, fundingBarWidth * 0.86)).toFixed(2);
    const barY = rateToY(rate).toFixed(1);
    if (rate >= 0) {
      positiveBarsPath +=
        "M" + barLeft + " " + zeroY + "V" + barY + "H" + barRight + "V" + zeroY + "Z";
    } else {
      negativeBarsPath +=
        "M" + barLeft + " " + zeroY + "V" + barY + "H" + barRight + "V" + zeroY + "Z";
    }
  });
  const pricePath =
    "M" +
    prices
      .map(
        (price: any, index: any) =>
          ((index + 0.5) * fundingBarWidth).toFixed(1) + " " + priceToY2(price).toFixed(1),
      )
      .join(" L");
  const monthLabels = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const alignedNow = Math.floor(state.now / fundingWindow.ms) * fundingWindow.ms;
  function formatSampleDate(index: any, withTime: any) {
    const date = new Date(alignedNow - (sampleCount - 1 - index) * fundingWindow.ms);
    return (
      monthLabels[date.getUTCMonth()] +
      " " +
      date.getUTCDate() +
      (withTime ? ", " + pad2(date.getUTCHours()) + ":00" : "")
    );
  }
  function formatPercent(value: any, digits: any) {
    return (value >= 0 ? "+" : "") + value.toFixed(digits) + "%";
  }
  const fundingHover = state.fzHov;
  let fundingHoverTip: any = { hov: false };
  if (fundingHover != null && chartView === "funding") {
    const hoverIndex2 = Math.min(sampleCount - 1, Math.floor(fundingHover * sampleCount));
    const hoverRate = fundingRates2[hoverIndex2];
    fundingHoverTip = {
      hov: true,
      hx: (((hoverIndex2 + 0.5) / sampleCount) * 100).toFixed(2),
      hpy: (priceToY2(prices[hoverIndex2]) / 3).toFixed(2),
      tDate:
        formatSampleDate(hoverIndex2, fundingWindow.ms < 86400000) +
        (fundingWindow.ms < 86400000 ? " UTC" : fundingWindow.ms > 86400000 ? " week" : ""),
      tRateLabel: fundingWindow.ms > 3600000 ? "Avg 1h rate" : "1h rate",
      tDir: hoverRate >= 0 ? "Longs pay shorts" : "Shorts pay longs",
      tDirCls: hoverRate >= 0 ? "" : "down",
      tRate: formatPercent(hoverRate, 4),
      tApr: formatPercent(hoverRate * 24 * 365, 2),
      tPrice: formatPrice(prices[hoverIndex2]),
      tipCls: "cz-tip" + (fundingHover > 0.62 ? " left" : ""),
    };
  }
  let gridRates = [];
  if (rateMax > 0) {
    gridRates.push(fundingAxisMax, fundingAxisMax / 2);
  }
  if (rateMin < 0) {
    gridRates.push(fundingAxisMin / 2, fundingAxisMin);
  }
  if (rateMax > 0 && rateMin === 0) {
    gridRates.splice(1, 1, (fundingAxisMax * 2) / 3, fundingAxisMax / 3);
  }
  if (rateMin < 0 && rateMax === 0) {
    gridRates = [fundingAxisMin / 3, (fundingAxisMin * 2) / 3, fundingAxisMin];
  }
  gridRates = gridRates.filter((rate) => Math.abs(rateToY(rate) - rateToY(0)) >= 26);
  const fundingChart = {
    cur: formatPercent(targetRate, 4),
    curCls: targetRate >= 0 ? "" : "down",
    next: formatPercent(targetRate * (0.9 + fundingRng() * 0.2), 4),
    nextCls: targetRate >= 0 ? "" : "down",
    apr: formatPercent(targetRate * 24 * 365, 2),
    countdown: fundingCountdown,
    grid: gridRates.map((rate) => "M0 " + rateToY(rate).toFixed(1) + "H1000").join(""),
    zero: "M0 " + zeroY + "H1000",
    pos: positiveBarsPath || "M0 0",
    neg: negativeBarsPath || "M0 0",
    price: pricePath,
    pHi: formatPrice(priceMax),
    pLo: formatPrice(priceMin),
    yt: gridRates
      .concat([0])
      .map((rate) => ({
        y: (rateToY(rate) / 3).toFixed(1),
        label: rate === 0 ? "0%" : formatPercent(rate, maxAbsRate2 < 0.01 ? 4 : 3).replace("+", ""),
      })),
    xt: [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
      const sampleIndex = Math.min(sampleCount - 1, Math.round(fraction * (sampleCount - 1)));
      return {
        x: (fraction * 100).toFixed(1),
        t: fraction === 1 ? "Now" : formatSampleDate(sampleIndex, fundingWindow.ms < 14400000),
      };
    }),
    win: fundingWindow.win,
    move: makeHoverHandler("fzHov"),
    leave: makeLeaveHandler("fzHov"),
    ...fundingHoverTip,
  };
  const exchangeQuery = (state.xq || "").trim().toLowerCase();
  const exchangeCategory = state.xcat || "all";
  const filteredExchanges = venueRows2.filter(
    (exchange) =>
      (exchangeCategory === "all" || exchange.type === exchangeCategory) &&
      (!exchangeQuery ||
        (exchange.name + " " + exchange.type + " " + exchange.chain)
          .toLowerCase()
          .indexOf(exchangeQuery) > -1),
  );
  const exchangeCategoryTabs = [
    ["all", "All"],
    ["CEX", "CEX"],
    ["DEX", "DEX"],
  ].map((tab) => {
    const isActive = exchangeCategory === tab[0];
    return {
      label: tab[1],
      count: String(
        tab[0] === "all"
          ? venueRows2.length
          : venueRows2.filter((exchange) => exchange.type === tab[0]).length,
      ),
      cls: isActive ? "pill is-active" : "pill",
      pressed: isActive ? "true" : "false",
      pick: () => {
        self.setState({ xcat: tab[0], tpg: firstPage("venues") });
      },
    };
  });
  const heatmapQuery = (state.hmQ || "").trim().toLowerCase();
  const heatmapFilter = state.hmF || "all";
  const heatmapSortKey = state.hmSort || "vol";
  const favorites = state.fav || {};
  const heatmapFilters = [
    ["all", "All", () => true],
    ["watch", "Watchlist", (market2: any) => !!favorites[market2.sym]],
    ["crypto", "Crypto", (market2: any) => market2.cat === "Crypto"],
    ["stocks", "Stocks", (market2: any) => market2.cat === "Stocks"],
    ["indices", "Indices", (market2: any) => market2.cat === "Indices"],
    [
      "other",
      "FX and commodities",
      (market2: any) => market2.cat === "Forex" || market2.cat === "Commodities",
    ],
  ];
  const heatmapSortDir = state.hmDir || "desc";
  const heatmapPredicate: any = (heatmapFilters.filter(
    (filter) => filter[0] === heatmapFilter,
  )[0] || heatmapFilters[0])[2];
  const heatmapMarkets = MARKETS.filter(
    (market2) =>
      heatmapPredicate(market2) &&
      (!heatmapQuery ||
        market2.sym.toLowerCase().indexOf(heatmapQuery) > -1 ||
        market2.name.toLowerCase().indexOf(heatmapQuery) > -1),
  );
  function getSortValue(market2: any) {
    if (heatmapSortKey === "chg") {
      return market2.chg;
    } else if (heatmapSortKey === "price") {
      return market2.price;
    } else {
      return parseCompact(heatmapSortKey === "oi" ? market2.oi : market2.vol);
    }
  }
  heatmapMarkets.sort((a, b) => {
    if (heatmapSortKey === "name") {
      return (heatmapSortDir === "asc" ? 1 : -1) * (a.sym < b.sym ? -1 : a.sym > b.sym ? 1 : 0);
    } else {
      return (heatmapSortDir === "asc" ? 1 : -1) * (getSortValue(a) - getSortValue(b));
    }
  });
  const visibleHeatmapMarkets =
    state.hmAll || heatmapQuery ? heatmapMarkets : heatmapMarkets.slice(0, 8);
  const isProMode = !isPropAccount;
  const liveEquity2 = LIVE_BALANCE + sumPositions(state.positions).upnl;
  const balanceParts = equity
    .toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .split(".");
  const detailTarget = state.hmDet;
  let detailView: any = { open: false, rows: [] };
  function closeDetail() {
    self.setState({ hmDet: null });
  }
  if (detailTarget && detailTarget.kind === "pos" && positionRows[detailTarget.i]) {
    const position = positionRows[detailTarget.i];
    detailView = {
      hasPrimary: true,
      actCls: "hd-actions hd-4",
      hasTpsl: true,
      tpsl: () => {
        self.setState({ tpslFor: position.id, tsTp: null, tsSl: null, hmDet: null });
      },
      open: true,
      close: closeDetail,
      logo: position.logo,
      title: position.sym + "-PERP",
      hasLev: true,
      lev: position.levText,
      side: position.sideLabel,
      sideCls: position.sideCls,
      venue: position.venueName,
      venueLogo: position.venueLogo,
      heroLabel: "Unrealized PnL",
      hero: position.pnlText,
      heroSub: position.roeText + " on margin",
      heroCls: position.pnlCls,
      rows: [
        { k: "Size", v: position.sizeText },
        { k: "Position value", v: position.valueText },
        { k: "Entry price", v: position.entryText },
        { k: "Mark price", v: position.markText },
        { k: "Liquidation price", v: position.liqText },
        { k: "Margin", v: position.marginText },
        { k: "Take profit", v: position.tpText || "Not set" },
        { k: "Stop loss", v: position.slText || "Not set" },
      ],
      goMarket: () => {
        self.setState({ hmDet: null });
        makeSelectMarket(position.sym, position.venueId)();
      },
      primaryLabel: "Close",
      primary: () => {
        position.close();
        self.setState({ hmDet: null });
      },
    };
  } else if (detailTarget && detailTarget.kind === "hist" && tradeHistoryRows[detailTarget.i]) {
    const historyRow = tradeHistoryRows[detailTarget.i];
    const historyTrade = liveTradeHistory[detailTarget.i];
    const hasRealizedPnl = historyTrade && historyTrade.pnl != null;
    detailView = {
      actCls: "hd-actions hd-2",
      hasTpsl: false,
      hasPrimary: false,
      open: true,
      close: closeDetail,
      logo: historyRow.logo,
      title: historyRow.sym + "-PERP",
      hasLev: false,
      lev: "",
      side: historyTrade.action,
      sideCls: historyTrade.side === "long" ? "long" : "short",
      venue: historyRow.venueName,
      venueLogo: historyRow.venueLogo,
      heroLabel: hasRealizedPnl ? "Realized PnL" : "Fill price",
      hero: hasRealizedPnl ? formatSignedUsd(historyTrade.pnl!) : historyRow.priceText,
      heroSub: hasRealizedPnl ? "Closed at " + historyRow.priceText : historyRow.amountText,
      heroCls: hasRealizedPnl && historyTrade.pnl! < 0 ? "down" : "",
      rows: [
        { k: "Action", v: historyTrade.action },
        { k: "Price", v: historyRow.priceText },
        { k: "Amount", v: historyRow.amountText },
        { k: "Fee", v: historyRow.feeText },
        { k: "Venue", v: historyRow.venueName },
        { k: "Time", v: historyTrade.time },
      ],
      goMarket: () => {
        self.setState({ hmDet: null });
        makeSelectMarket(historyRow.sym)();
      },
      primaryLabel: "",
      primary: null,
    };
  } else if (detailTarget && detailTarget.kind === "ord" && orderRows[detailTarget.i]) {
    const order = orderRows[detailTarget.i];
    detailView = {
      hasPrimary: true,
      actCls: "hd-actions",
      hasTpsl: false,
      open: true,
      close: closeDetail,
      logo: order.logo,
      title: order.sym + "-PERP",
      hasLev: false,
      lev: "",
      side: order.sideLabel,
      sideCls: order.sideCls,
      venue: order.venueName,
      venueLogo: order.venueLogo,
      heroLabel: order.type + " price",
      hero: order.priceText,
      heroSub: order.filledText + " filled",
      heroCls: "",
      rows: [
        { k: "Order type", v: order.type },
        { k: "Amount", v: order.amountText },
        { k: "Order value", v: order.valueText },
        { k: "Filled", v: order.filledText },
        { k: "Placed", v: order.placed },
        { k: "Venue", v: order.venueName },
      ],
      goMarket: () => {
        self.setState({ hmDet: null });
        makeSelectMarket(order.sym)();
      },
      primaryLabel: "Cancel",
      primary: () => {
        order.cancel();
        self.setState({ hmDet: null });
      },
    };
  }
  const fundMode = state.fund;
  const fundStep = state.fundStep;
  const fundNetwork = state.fundNet || "arbitrum";
  const fundNetworks = [
    ["arbitrum", "Arbitrum", "12 confirmations", 0.12],
    ["base", "Base", "10 confirmations", 0.05],
    ["ethereum", "Ethereum", "12 confirmations", 2.4],
    ["solana", "Solana", "32 slots", 0.01],
  ];
  const selectedNetwork: any = fundNetworks.filter((network) => network[0] === fundNetwork)[0];
  const addressRandom = seededRandom(hashString("kai.trades" + fundNetwork));
  const hexDigits = "0123456789abcdef";
  let depositAddress = "";
  if (fundNetwork === "solana") {
    const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    for (var i4 = 0; i4 < 44; i4++) {
      depositAddress += base58Alphabet[Math.floor(addressRandom() * 58)];
    }
  } else {
    depositAddress = "0x";
    for (let i = 0; i < 40; i++) {
      depositAddress += hexDigits[Math.floor(addressRandom() * 16)];
    }
  }
  const availableBalance = Math.max(0, freeMargin);
  const withdrawAmount: any = parseFloat(String(state.wdAmt || "").replace(/,/g, "")) || 0;
  const isWithdrawAddressValid =
    /^0x[0-9a-fA-F]{40}$/.test((state.wdAddr || "").trim()) ||
    (fundNetwork === "solana" && (state.wdAddr || "").trim().length >= 32);
  function closeFundModal() {
    self.setState({
      fund: null,
      fundStep: null,
      fundToast: null,
      wdAmt: "",
      wdAddr: "",
      copied: false,
    });
  }
  const fundModal = {
    open: !!fundMode,
    close: closeFundModal,
    openDeposit: () => {
      self.setState({
        fund: "deposit",
        fundStep: null,
        fundToast: null,
        copied: false,
        profile: false,
      });
    },
    openWithdraw: () => {
      self.setState({
        fund: "withdraw",
        fundStep: null,
        fundToast: null,
        copied: false,
        profile: false,
      });
    },
    title:
      fundStep === "crypto"
        ? fundMode === "deposit"
          ? "Deposit USDC"
          : "Withdraw USDC"
        : fundMode === "deposit"
          ? "Deposit with"
          : "Withdraw to",
    hasBack: fundStep === "crypto",
    back: () => {
      self.setState({ fundStep: null, fundToast: null });
    },
    isDepositList: fundMode === "deposit" && !fundStep,
    isWithdrawList: fundMode === "withdraw" && !fundStep,
    isCrypto: fundStep === "crypto",
    isDep: fundMode === "deposit",
    isWd: fundMode === "withdraw",
    pickCrypto: () => {
      self.setState({ fundStep: "crypto", fundToast: null });
    },
    soon: () => {
      self.setState({ fundToast: "This option is not connected in the preview yet." });
    },
    hasToast: !!state.fundToast,
    toast: state.fundToast || "",
    binanceLogo: LOGOS.binance,
    nets: fundNetworks.map((network) => {
      const isSelected = network[0] === fundNetwork;
      return {
        label: network[1],
        cls: "fd-net" + (isSelected ? " is-on" : ""),
        pressed: isSelected ? "true" : "false",
        pick: () => {
          self.setState({ fundNet: network[0], copied: false });
        },
      };
    }),
    netName: selectedNetwork[1],
    confs: selectedNetwork[2],
    address: depositAddress,
    acctName: "account",
    copy: () => {
      try {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(depositAddress);
        }
      } catch {}
      self.setState({ copied: true });
    },
    copyLabel: state.copied ? "Copied" : "Copy",
    available: formatUsd(availableBalance),
    wdAddr: state.wdAddr || "",
    wdAmt: state.wdAmt || "",
    onWdAddr: (e: any) => {
      self.setState({ wdAddr: e.target.value });
    },
    onWdAmt: (e: any) => {
      self.setState({ wdAmt: e.target.value.replace(/[^0-9.]/g, "") });
    },
    max: () => {
      self.setState({ wdAmt: availableBalance.toFixed(2) });
    },
    fee: formatUsd(selectedNetwork[3]),
    receive: formatUsd(Math.max(0, withdrawAmount - selectedNetwork[3])),
    wdDisabled:
      !isWithdrawAddressValid ||
      !(withdrawAmount > selectedNetwork[3]) ||
      !(withdrawAmount <= availableBalance),
    wdCta: isWithdrawAddressValid
      ? withdrawAmount <= 0
        ? "Enter an amount"
        : withdrawAmount > availableBalance
          ? "More than available"
          : "Withdraw " + formatUsd(withdrawAmount)
      : "Enter a valid address",
    submit: () => {
      self.setState({
        fundToast:
          "Withdrawal of " +
          formatUsd(withdrawAmount) +
          " submitted. It will arrive after " +
          selectedNetwork[2] +
          ".",
        wdAmt: "",
        wdAddr: "",
      });
    },
  };
  function makeShareAssetHandler(sym: any) {
    return () => {
      self.setState({
        share: { kind: "asset", sym: sym },
        shMsg: null,
        shCopied: false,
        hmDet: null,
      });
    };
  }
  function makeShareHandler(kind: any, index: any) {
    return () => {
      self.setState({ share: { kind: kind, i: index }, shMsg: null, hmDet: null, shCopied: false });
    };
  }
  positionRows.forEach((position: any, index: any) => {
    position.share = makeShareHandler("pos", index);
    const storedPosition = state.positions.filter((item: any) => item.id === position.id)[0] || {};
    position.tpsl = () => {
      self.setState({ tpslFor: position.id, tsTp: null, tsSl: null, hmDet: null });
    };
    position.tpslLabel =
      storedPosition.tp || storedPosition.sl
        ? (storedPosition.tp ? "TP " + formatPrice(storedPosition.tp) : "TP -") +
          " / " +
          (storedPosition.sl ? "SL " + formatPrice(storedPosition.sl) : "SL -")
        : "TP / SL";
    position.tpText = storedPosition.tp ? "$" + formatPrice(storedPosition.tp) : "Not set";
    position.slText = storedPosition.sl ? "$" + formatPrice(storedPosition.sl) : "Not set";
  });
  orderRows.forEach((order: any, index: any) => {
    order.share = makeShareHandler("ord", index);
  });
  const tradeHistory = liveTradeHistory;
  tradeHistoryRows.forEach((trade: any, index) => {
    trade.share = makeShareHandler("hist", index);
  });
  if (detailView.open && state.hmDet) {
    detailView.share = makeShareHandler(state.hmDet.kind, state.hmDet.i);
  }
  if (watchDetail && watchDetail.sym) {
    watchDetail.share = makeShareAssetHandler(watchDetail.sym);
    const isFavorite2 = !!(state.fav || {})[watchDetail.sym];
    watchDetail.favFill = isFavorite2 ? "currentColor" : "none";
    watchDetail.favPressed = isFavorite2 ? "true" : "false";
    watchDetail.toggleFav = () => {
      const nextFavorites = { ...state.fav };
      nextFavorites[watchDetail.sym] = !isFavorite2;
      self.setState({ fav: nextFavorites });
      showToast(
        (isFavorite2 ? "Removed " : "Added ") +
          watchDetail.sym +
          "-PERP " +
          (isFavorite2 ? "from" : "to") +
          " your watchlist.",
      );
    };
  }
  var shareState = state.share;
  let shareCard: any = { open: false, themes: [], stats: [] };
  if (shareState) {
    const shareKind = shareState.kind;
    const showUsd = state.shUsd !== false;
    const showChart = state.shChart !== false;
    const shareThemeId = state.shTheme || "midnight";
    const shareAsset: any = shareKind === "asset" ? findMarket(shareState.sym) : null;
    const shareSubject =
      shareKind === "asset"
        ? shareAsset
          ? {
              sym: shareAsset.sym,
              logo: LOGOS[shareAsset.sym.toLowerCase()],
              venueName: "",
              venueLogo: "",
            }
          : null
        : shareKind === "pos"
          ? positionRows[shareState.i]
          : shareKind === "ord"
            ? orderRows[shareState.i]
            : tradeHistoryRows[shareState.i];
    const shareTrade: any = shareKind === "hist" ? tradeHistory[shareState.i] : null;
    if (shareSubject) {
      const shareMarket: any = findMarket(shareSubject.sym);
      const venueName = shareSubject.venueName;
      const venueLogo = shareSubject.venueLogo;
      let priceSeries2 = seededPriceSeries(
        shareSubject.sym + "share" + shareKind + shareState.i,
        64,
        shareMarket.price,
        0.0045,
        shareMarket.chg0 / 100 / 64,
      );
      const levelPrice =
        shareKind === "asset"
          ? shareMarket.price
          : shareKind === "pos"
            ? parseFloat(shareSubject.entryText.replace(/[$,]/g, ""))
            : shareKind === "ord"
              ? parseFloat(shareSubject.priceText.replace(/[$,]/g, ""))
              : shareTrade.price;
      if (shareKind === "hist") {
        var sharePriceScale = shareTrade.price / priceSeries2[40];
        priceSeries2 = priceSeries2.map((price) => price * sharePriceScale);
      }
      const seriesMin = Math.min.apply(null, priceSeries2.concat([levelPrice]));
      const seriesMax = Math.max.apply(null, priceSeries2.concat([levelPrice]));
      const seriesRange = seriesMax - seriesMin || 1;
      function toChartY(price: any) {
        return 8 + (1 - (price - seriesMin) / seriesRange) * 84;
      }
      const linePath2 =
        "M" +
        priceSeries2
          .map(
            (price, index) =>
              ((index / (priceSeries2.length - 1)) * 300).toFixed(1) +
              " " +
              toChartY(price).toFixed(1),
          )
          .join(" L");
      var shareDate = new Date(state.now);
      const monthNames2 = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const username = "kai.trades";
      const referralCode = "KAITRADES";
      let bigText;
      let bigClass;
      let subText;
      let subClass;
      let tagText;
      let tagClass;
      let detailText;
      let kindLabel;
      let summaryText;
      if (shareKind === "asset") {
        const venueCount = (shareAsset.venues || VENUES.map((venue) => venue.id)).length;
        bigText = "$" + formatPrice(shareAsset.price);
        bigClass = "is-plain";
        subText = (shareAsset.chg >= 0 ? "+" : "") + shareAsset.chg.toFixed(2) + "% today";
        subClass = shareAsset.chg >= 0 ? "is-up" : "is-down";
        tagText = "Up to " + shareAsset.max + "x";
        tagClass = "shc-tag t-long";
        detailText = "Best price across " + venueCount + " venues";
        kindLabel = shareAsset.sym + "-PERP";
        summaryText =
          "Trading " +
          shareAsset.sym +
          "-PERP on OpenFutures: $" +
          formatPrice(shareAsset.price) +
          " (" +
          subText +
          "), up to " +
          shareAsset.max +
          "x, best price across " +
          venueCount +
          " venues.";
      } else if (shareKind === "pos") {
        var isShareProfit = shareSubject.pnlCls !== "down";
        bigText = shareSubject.roeText;
        bigClass = isShareProfit ? "is-up" : "is-down";
        subText = showUsd ? shareSubject.pnlText : "";
        subClass = isShareProfit ? "is-up" : "is-down";
        tagText = shareSubject.sideLabel + " " + shareSubject.levText;
        tagClass = "shc-tag " + (shareSubject.sideCls === "long" ? "t-long" : "t-short");
        detailText =
          "Entry " +
          shareSubject.entryText.replace("$", "") +
          "  →  " +
          shareSubject.markText.replace("$", "");
        kindLabel = "position";
        summaryText =
          shareSubject.sideLabel +
          " " +
          shareSubject.sym +
          "-PERP " +
          shareSubject.levText +
          ": " +
          shareSubject.roeText +
          (showUsd ? " (" + shareSubject.pnlText + ")" : "") +
          ".";
      } else if (shareKind === "ord") {
        const markPrice = shareMarket.price;
        const pctFromMark = ((levelPrice - markPrice) / markPrice) * 100;
        bigText = shareSubject.priceText;
        bigClass = "is-plain";
        subText = "";
        subClass = "";
        tagText = shareSubject.type + " " + (shareSubject.sideCls === "long" ? "buy" : "sell");
        tagClass = "shc-tag " + (shareSubject.sideCls === "long" ? "t-long" : "t-short");
        detailText =
          (pctFromMark >= 0 ? "+" : "") +
          pctFromMark.toFixed(2) +
          "% from mark" +
          (showUsd ? ", " + shareSubject.valueText : "");
        kindLabel = "order";
        summaryText =
          shareSubject.type +
          " " +
          (shareSubject.sideCls === "long" ? "buy" : "sell") +
          " " +
          shareSubject.sym +
          "-PERP at " +
          shareSubject.priceText +
          ".";
      } else {
        const isClosed = shareTrade.pnl != null;
        const isProfit = !isClosed || shareTrade.pnl >= 0;
        const notional = shareTrade.price * shareTrade.qty;
        const roePct = isClosed ? (shareTrade.pnl / (notional / 5)) * 100 : 0;
        bigText = isClosed
          ? (roePct >= 0 ? "+" : "") + roePct.toFixed(2) + "%"
          : shareSubject.priceText;
        bigClass = isClosed ? (isProfit ? "is-up" : "is-down") : "is-plain";
        subText = isClosed && showUsd ? formatSignedUsd(shareTrade.pnl) : "";
        subClass = isProfit ? "is-up" : "is-down";
        tagText = shareTrade.action;
        tagClass = "shc-tag " + (/long/i.test(shareTrade.action) ? "t-long" : "t-short");
        detailText =
          (isClosed ? "Closed at " : "Filled at ") + shareSubject.priceText.replace("$", "");
        kindLabel = "trade";
        summaryText =
          shareTrade.action +
          " " +
          shareSubject.sym +
          "-PERP" +
          (isClosed
            ? ": " +
              (roePct >= 0 ? "+" : "") +
              roePct.toFixed(2) +
              "%" +
              (showUsd ? " (" + formatSignedUsd(shareTrade.pnl) + ")" : "")
            : " at " + shareSubject.priceText) +
          ".";
      }
      const note = state.shNote || "";
      const shareText =
        summaryText +
        (note ? ' "' + note + '"' : "") +
        " Trade with code " +
        referralCode +
        " on OpenFutures.";
      const themeOptions = [
        ["midnight", "Midnight"],
        ["paper", "Paper"],
        ["ultra", "Ultra blue"],
      ];
      shareCard = {
        open: true,
        kindLabel: kindLabel,
        close: () => {
          self.setState({ share: null, shMsg: null });
        },
        themeCls: "shc shc-" + shareThemeId,
        user: username,
        initials: "KT",
        avatar: state.avatar || LOGOS.pfp,
        hasPic: true,
        noPic: false,
        hasCustomPic: !!state.avatar,
        code: referralCode,
        date:
          monthNames2[shareDate.getUTCMonth()] +
          " " +
          shareDate.getUTCDate() +
          ", " +
          shareDate.getUTCFullYear(),
        tag: tagText,
        tagCls: tagClass,
        logo: shareSubject.logo,
        title: shareSubject.sym + "-PERP",
        venue: venueName,
        venueLogo: venueLogo,
        showChart: showChart,
        line: linePath2,
        area: linePath2 + " L300 100 L0 100 Z",
        levelPath: "M0 " + toChartY(levelPrice).toFixed(1) + " H300",
        levelY: toChartY(levelPrice).toFixed(1),
        nowY: toChartY(priceSeries2[priceSeries2.length - 1]).toFixed(1),
        lvlCls: "shc-lvl num" + (toChartY(levelPrice) < 30 ? " below" : ""),
        levelLabel:
          (shareKind === "pos" ? "Entry " : shareKind === "ord" ? "Limit " : "Fill ") +
          formatPrice(levelPrice),
        big: bigText,
        bigCls:
          "shc-bignum " +
          bigClass +
          (bigText.length > 10 ? " len-xl" : bigText.length > 7 ? " len-l" : ""),
        showUsdCtl: shareKind !== "asset",
        sub: subText,
        hasSub: !!subText,
        subCls: "shc-sub " + subClass,
        detail: detailText,
        note: note,
        hasNote: !!note.trim(),
        noteCount: note.length + " / 90",
        onNote: (e: any) => {
          self.setState({ shNote: e.target.value.slice(0, 90) });
        },
        themes: themeOptions.map((themeOption) => {
          const isSelected = shareThemeId === themeOption[0];
          return {
            label: themeOption[1],
            sw: "sh-sw sw-" + themeOption[0],
            cls: "sh-theme" + (isSelected ? " is-on" : ""),
            pressed: isSelected ? "true" : "false",
            pick: () => {
              self.setState({ shTheme: themeOption[0] });
            },
          };
        }),
        usdCls: "sh-tog" + (showUsd ? " is-on" : ""),
        usdPressed: showUsd ? "true" : "false",
        toggleUsd: () => {
          self.setState({ shUsd: !showUsd });
        },
        chartCls: "sh-tog" + (showChart ? " is-on" : ""),
        chartPressed: showChart ? "true" : "false",
        toggleChart: () => {
          self.setState({ shChart: !showChart });
        },
        onPhoto: (e: any) => {
          const file = e.target.files && e.target.files[0];
          if (file) {
            const reader: any = new FileReader();
            reader.onload = () => {
              try {
                localStorage.setItem("openfutures-avatar", reader.result);
              } catch {}
              self.setState({ avatar: reader.result });
            };
            reader.readAsDataURL(file);
          }
        },
        removePhoto: () => {
          try {
            localStorage.removeItem("openfutures-avatar");
          } catch {}
          self.setState({ avatar: "" });
        },
        copyLabel: state.shCopied ? "Copied" : "Copy text",
        copy: () => {
          try {
            if (navigator.clipboard) {
              navigator.clipboard.writeText(shareText);
            }
          } catch {}
          self.setState({ shCopied: true });
        },
        postX: () => {
          try {
            window.open(
              "https://x.com/intent/post?text=" + encodeURIComponent(shareText),
              "_blank",
              "noopener",
            );
          } catch {}
        },
        dlLabel: state.shBusy ? "Saving..." : "Save image",
        download: () => {
          self.setState({ shBusy: true });
          renderShareCard((isSaved: any) => {
            self.setState({
              shBusy: false,
              shMsg: isSaved
                ? "Image saved. Check your downloads."
                : "This browser blocked the image export. A screenshot of the card works too.",
            });
          });
        },
        hasMsg: !!state.shMsg,
        msg: state.shMsg || "",
      };
    }
  }
  const assetDescriptions: any = {
    BTC: "The first decentralized cryptocurrency, launched in 2009. Supply is capped at 21 million coins and new coins are issued through proof-of-work mining.",
    ETH: "The native asset of Ethereum, the smart-contract platform behind most DeFi and NFT activity. Secured by proof of stake since 2022.",
    SOL: "The native token of Solana, a proof-of-stake chain known for high throughput, low fees and fast confirmation.",
    SUI: "The native token of Sui, a layer 1 built by Mysten Labs on the Move language with an object-based data model.",
    HYPE: "The token of Hyperliquid, an on-chain order book exchange and layer 1 built mainly for perpetual futures.",
    PEPE: "A meme token on Ethereum launched in 2023. Its price is driven mostly by community sentiment rather than protocol revenue.",
    XRP: "The native asset of the XRP Ledger, built for fast, low-cost cross-border settlement.",
    DOGE: "Dogecoin, a proof-of-work cryptocurrency created in 2013 as a joke that grew into one of the largest meme coins.",
    NVDA: "NVIDIA, the US chipmaker whose GPUs power gaming and most AI training. The perp tracks its Nasdaq-listed share price.",
    TSLA: "Tesla, the US electric-vehicle and energy company. The perp tracks its Nasdaq-listed share price.",
    AAPL: "Apple, maker of the iPhone, Mac and a large services business. The perp tracks its Nasdaq-listed share price.",
    US500: "Tracks the S&P 500, an index of 500 large US companies weighted by market value.",
    US100:
      "Tracks the Nasdaq-100, the 100 largest non-financial companies on the Nasdaq, weighted toward technology.",
    US30: "Tracks the Dow Jones Industrial Average, 30 large US blue-chip companies weighted by share price.",
    XAU: "Spot gold, priced in US dollars per troy ounce.",
    WTI: "West Texas Intermediate crude oil, the main US oil benchmark, priced per barrel.",
    EURUSD: "The euro against the US dollar, the most traded currency pair in the world.",
    GBPUSD: "The British pound against the US dollar.",
    USDJPY: "The US dollar against the Japanese yen.",
  };
  const coingeckoIds: any = {
    BTC: "bitcoin",
    ETH: "ethereum",
    SOL: "solana",
    SUI: "sui",
    HYPE: "hyperliquid",
    PEPE: "pepe",
    XRP: "ripple",
    DOGE: "dogecoin",
  };
  const yahooSymbols: any = {
    NVDA: "NVDA",
    TSLA: "TSLA",
    AAPL: "AAPL",
    US500: "%5EGSPC",
    US100: "%5ENDX",
    US30: "%5EDJI",
    XAU: "GC%3DF",
    WTI: "CL%3DF",
    EURUSD: "EURUSD%3DX",
    GBPUSD: "GBPUSD%3DX",
    USDJPY: "JPY%3DX",
  };
  const tradingViewSymbols: any = {
    BTC: "BTCUSD",
    ETH: "ETHUSD",
    SOL: "SOLUSD",
    SUI: "SUIUSD",
    HYPE: "HYPEUSD",
    PEPE: "PEPEUSD",
    XRP: "XRPUSD",
    DOGE: "DOGEUSD",
    NVDA: "NASDAQ-NVDA",
    TSLA: "NASDAQ-TSLA",
    AAPL: "NASDAQ-AAPL",
    US500: "SPX",
    US100: "NDX",
    US30: "DJI",
    XAU: "XAUUSD",
    WTI: "USOIL",
    EURUSD: "EURUSD",
    GBPUSD: "GBPUSD",
    USDJPY: "USDJPY",
  };
  const marketTab = state.mTab || "book";
  const marketTabs = [
    ["book", "Order book"],
    ["stats", "Stats"],
    ["info", "Info"],
    ["socials", "Socials"],
  ].map((tab) => {
    const isActive = marketTab === tab[0];
    return {
      label: tab[1],
      cls: "m-tab" + (isActive ? " is-on" : ""),
      pressed: isActive ? "true" : "false",
      pick: () => {
        self.setState({ mTab: tab[0] });
      },
    };
  });
  function buildMarketInfo(market2: any) {
    const venueIds = market2.venues || VENUES.map((venue) => venue.id);
    const venues = VENUES.filter((venue) => venueIds.indexOf(venue.id) > -1);
    const intervalLabels = venues
      .map((venue) => (venueMeta[venue.id] && venueMeta[venue.id].interval) || 1)
      .filter((interval, i, intervals) => intervals.indexOf(interval) === i)
      .sort((a, b) => a - b)
      .map((interval) => interval + "h");
    const researchLink = coingeckoIds[market2.sym]
      ? {
          label: "Research on CoinGecko",
          sub: "Supply, holders, project links",
          href: "https://www.coingecko.com/en/coins/" + coingeckoIds[market2.sym],
        }
      : {
          label: "Research on Yahoo Finance",
          sub: market2.cat === "Forex" ? "Rates, history and news" : "Financials, history and news",
          href: "https://finance.yahoo.com/quote/" + yahooSymbols[market2.sym],
        };
    const links = [
      researchLink,
      {
        label: "Chart on TradingView",
        sub: "Full charting and indicators",
        href:
          "https://www.tradingview.com/symbols/" +
          (tradingViewSymbols[market2.sym] || market2.sym + "USD") +
          "/",
      },
    ];
    links.forEach((link: any) => {
      link.open = (e: any) => {
        if (e && e.preventDefault) {
          e.preventDefault();
        }
        self.setState({
          iab: {
            kind: "web",
            url: link.href,
            name: link.label.replace(/^(Research on|Chart on) /, ""),
          },
          iabStack: [],
          iabFwd: [],
        });
      };
    });
    return {
      name: market2.name,
      cat: market2.cat,
      about: assetDescriptions[market2.sym] || "",
      rows: [
        { k: "Max Leverage", v: market2.max + "x" },
        { k: "Funding", v: "Every " + intervalLabels.join(" or ") },
        { k: "24h Volume", v: market2.vol },
        { k: "Open Interest", v: market2.oi },
        { k: "Venues", v: String(venues.length) },
        { k: "Quoted in", v: "USD" },
      ],
      venues: venues.map((venue: any) => ({ logo: venue.logo, name: venue.name })),
      links: links,
    };
  }
  const venueIds2 = market.venues || VENUES.map((venue) => venue.id);
  const venues2 = VENUES.filter((venue) => venueIds2.indexOf(venue.id) > -1);
  const fundingIntervals = venues2
    .map((venue) => (venueMeta[venue.id] && venueMeta[venue.id].interval) || 1)
    .filter((interval, i, intervals) => intervals.indexOf(interval) === i)
    .sort((a, b) => a - b)
    .map((interval) => interval + "h");
  const researchLink2 = coingeckoIds[market.sym]
    ? {
        label: "Research on CoinGecko",
        sub: "Supply, holders, project links",
        href: "https://www.coingecko.com/en/coins/" + coingeckoIds[market.sym],
      }
    : {
        label: "Research on Yahoo Finance",
        sub: market.cat === "Forex" ? "Rates, history and news" : "Financials, history and news",
        href: "https://finance.yahoo.com/quote/" + yahooSymbols[market.sym],
      };
  const marketInfo = {
    name: market.name,
    cat: market.cat,
    about: assetDescriptions[market.sym] || "",
    rows: [
      { k: "Max Leverage", v: market.max + "x" },
      { k: "Funding", v: "Every " + fundingIntervals.join(" or ") },
      { k: "24h Volume", v: market.vol },
      { k: "Open Interest", v: market.oi },
      { k: "Venues", v: String(venues2.length) },
      { k: "Quoted in", v: "USD" },
    ],
    venues: venues2.map((venue: any) => ({ logo: venue.logo, name: venue.name })),
    links: [
      researchLink2,
      {
        label: "Chart on TradingView",
        sub: "Full charting and indicators",
        href:
          "https://www.tradingview.com/symbols/" +
          (tradingViewSymbols[market.sym] || market.sym + "USD") +
          "/",
      },
    ],
  };
  function showToast(text: any) {
    self.setState({ toast: { text: text, id: Date.now() } });
    clearTimeout(self._toastT);
    self._toastT = setTimeout(() => {
      self.setState({ toast: null });
    }, 3600);
  }
  function showNotConnectedToast() {
    showToast("This is not connected in the preview yet.");
  }
  const positionsKey = isPropAccount ? "propPositions" : "positions";
  const ordersKey = "orders";
  function placeOrder() {
    if (!isSubmitDisabled) {
      const now = new Date();
      const monthNames2 = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const placedLabel =
        monthNames2[now.getUTCMonth()] +
        " " +
        now.getUTCDate() +
        ", " +
        pad2(now.getUTCHours()) +
        ":" +
        pad2(now.getUTCMinutes());
      const side = isLong ? "long" : "short";
      if (state.otype === "limit") {
        const limitPrice = parseFloat(state.limit) || midPrice;
        const limitQty = positionNotional / limitPrice;
        const limitOrder = {
          id: "o" + Date.now(),
          sym: market.sym,
          venue: activeVenue.id,
          side: side,
          type: "Limit",
          price: limitPrice,
          qty: limitQty,
          filled: 0,
          placed: placedLabel,
        };
        const orderUpdate: any = {};
        orderUpdate[ordersKey] = [limitOrder].concat(state[ordersKey]);
        orderUpdate.sheet = "closed";
        self.setState(orderUpdate);
        showToast(
          "Limit " +
            (isLong ? "buy" : "sell") +
            " placed: " +
            formatQty(limitQty) +
            " " +
            market.sym +
            " at $" +
            formatPrice(limitPrice) +
            " on " +
            activeVenue.name +
            ".",
        );
        return;
      }
      let positions = (state[positionsKey] || []).slice();
      let remainingQty = marketFill.qty;
      const fillPrice = marketFill.avg;
      let message;
      const sameSidePosition = positions.filter(
        (position: any) =>
          position.sym === market.sym &&
          position.venue === activeVenue.id &&
          position.side === side,
      )[0];
      const oppositePosition = positions.filter(
        (position: any) =>
          position.sym === market.sym &&
          position.venue === activeVenue.id &&
          position.side !== side,
      )[0];
      if (oppositePosition) {
        if (remainingQty < oppositePosition.qty - 1e-9) {
          positions = positions.map((position: any) => {
            if (position === oppositePosition) {
              return { ...position, qty: position.qty - remainingQty };
            } else {
              return position;
            }
          });
          message =
            "Reduced " +
            market.sym +
            " " +
            oppositePosition.side +
            " by " +
            formatQty(remainingQty) +
            " " +
            market.sym +
            " on " +
            activeVenue.name +
            ".";
          remainingQty = 0;
        } else {
          positions = positions.filter((position: any) => position !== oppositePosition);
          remainingQty = remainingQty - oppositePosition.qty;
          message =
            "Closed " + market.sym + " " + oppositePosition.side + " on " + activeVenue.name + ".";
        }
      }
      if (remainingQty > 1e-9 && !state.reduceOnly) {
        if (sameSidePosition) {
          positions = positions.map((position: any) => {
            if (position === sameSidePosition) {
              return {
                ...position,
                entry:
                  (position.entry * position.qty + fillPrice * remainingQty) /
                  (position.qty + remainingQty),
                qty: position.qty + remainingQty,
                lev: effectiveLeverage,
              };
            } else {
              return position;
            }
          });
        } else {
          positions = [
            {
              id: "p" + Date.now(),
              sym: market.sym,
              venue: activeVenue.id,
              side: side,
              lev: effectiveLeverage,
              qty: remainingQty,
              entry: fillPrice,
            },
          ].concat(positions);
        }
        message =
          (message ? message + " " : "") +
          (isLong ? "Bought " : "Sold ") +
          formatQty(remainingQty) +
          " " +
          market.sym +
          " at $" +
          formatPrice(fillPrice) +
          " on " +
          activeVenue.name +
          ".";
      } else {
        message ||= "Nothing to reduce on " + activeVenue.name + ".";
      }
      liveTradeHistory.unshift({
        time: placedLabel,
        sym: market.sym,
        venue: activeVenue.id,
        action: oppositePosition ? "Close " + oppositePosition.side : "Open " + side,
        side: side,
        price: fillPrice,
        qty: marketFill.qty,
        fee: (positionNotional * activeVenue.fee) / 100,
        pnl: oppositePosition
          ? (oppositePosition.side === "long"
              ? fillPrice - oppositePosition.entry
              : oppositePosition.entry - fillPrice) * Math.min(marketFill.qty, oppositePosition.qty)
          : null,
      });
      const positionUpdate: any = {};
      positionUpdate[positionsKey] = positions;
      positionUpdate.sheet = "closed";
      self.setState(positionUpdate);
      showToast(message);
    }
  }
  const tpslId = state.tpslFor;
  const tpslRow = tpslId ? positionRows.filter((row: any) => row.id === tpslId)[0] : null;
  var tpslSheet: any = { open: false };
  const tpslPosition = tpslId
    ? state[positionsKey].filter((position: any) => position.id === tpslId)[0]
    : null;
  if (tpslRow && tpslPosition) {
    const direction = tpslPosition.side === "long" ? 1 : -1;
    const markPrice = parseFloat(tpslRow.markText.replace(/[$,]/g, ""));
    const tpPrice = parseFloat(String(state.tsTp ?? (tpslPosition.tp || "")).replace(/,/g, ""));
    const slPrice = parseFloat(String(state.tsSl ?? (tpslPosition.sl || "")).replace(/,/g, ""));
    function estimatePnl(price: any) {
      if (isFinite(price) && price > 0) {
        return (price - tpslPosition.entry) * tpslPosition.qty * direction;
      } else {
        return null;
      }
    }
    const tpPnl = estimatePnl(tpPrice);
    const slPnl = estimatePnl(slPrice);
    let errorMessage = "";
    if (isFinite(tpPrice) && tpPrice > 0 && (tpPrice - markPrice) * direction <= 0) {
      errorMessage =
        "Take profit must be " + (direction > 0 ? "above" : "below") + " the mark price.";
    } else if (isFinite(slPrice) && slPrice > 0 && (slPrice - markPrice) * direction >= 0) {
      errorMessage =
        "Stop loss must be " + (direction > 0 ? "below" : "above") + " the mark price.";
    }
    tpslSheet = {
      open: true,
      logo: tpslRow.logo,
      title: tpslRow.sym + "-PERP " + tpslRow.levText,
      side: tpslRow.sideLabel,
      sideCls: tpslRow.sideCls,
      entry: tpslRow.entryText,
      mark: tpslRow.markText,
      tp: state.tsTp ?? (tpslPosition.tp ? String(tpslPosition.tp) : ""),
      sl: state.tsSl ?? (tpslPosition.sl ? String(tpslPosition.sl) : ""),
      tpHint: formatPrice(markPrice * (1 + direction * 0.05)).replace(/,/g, ""),
      slHint: formatPrice(markPrice * (1 - direction * 0.03)).replace(/,/g, ""),
      tpEst: tpPnl == null ? "" : formatSignedUsd(tpPnl),
      tpCls: tpPnl != null && tpPnl < 0 ? "down" : "",
      slEst: slPnl == null ? "" : formatSignedUsd(slPnl),
      slCls: slPnl != null && slPnl < 0 ? "down" : "",
      onTp: (e: any) => {
        self.setState({ tsTp: e.target.value.replace(/[^0-9.]/g, "") });
      },
      onSl: (e: any) => {
        self.setState({ tsSl: e.target.value.replace(/[^0-9.]/g, "") });
      },
      hasErr: !!errorMessage,
      err: errorMessage,
      saveDisabled: !!errorMessage,
      close: () => {
        self.setState({ tpslFor: null, tsTp: null, tsSl: null });
      },
      clear: () => {
        const update: any = {};
        update[positionsKey] = state[positionsKey].map((position: any) => {
          if (position.id === tpslId) {
            return { ...position, tp: null, sl: null };
          } else {
            return position;
          }
        });
        update.tpslFor = null;
        update.tsTp = null;
        update.tsSl = null;
        self.setState(update);
        showToast("TP / SL removed from " + tpslRow.sym + "-PERP.");
      },
      save: () => {
        if (!errorMessage) {
          const update: any = {};
          update[positionsKey] = state[positionsKey].map((position: any) => {
            if (position.id === tpslId) {
              return {
                ...position,
                tp: isFinite(tpPrice) && tpPrice > 0 ? tpPrice : null,
                sl: isFinite(slPrice) && slPrice > 0 ? slPrice : null,
              };
            } else {
              return position;
            }
          });
          update.tpslFor = null;
          update.tsTp = null;
          update.tsSl = null;
          self.setState(update);
          showToast("TP / SL saved on " + tpslRow.sym + "-PERP.");
        }
      },
    };
  }
  const toastView = { show: !!state.toast, text: state.toast ? state.toast.text : "" };
  const random = seededRandom(hashString(market.sym + "soc" + Math.floor(state.now / 3600000)));
  const fearGreedScore = Math.max(
    4,
    Math.min(
      96,
      Math.round(50 + market.chg * 6 + (random() - 0.5) * 18 + (activeVenue.fund > 0 ? 6 : -6)),
    ),
  );
  function getFearGreedLabel(score: any) {
    if (score < 25) {
      return ["Extreme fear", "fg-xf"];
    } else if (score < 45) {
      return ["Fear", "fg-f"];
    } else if (score <= 55) {
      return ["Neutral", "fg-n"];
    } else if (score <= 75) {
      return ["Greed", "fg-g"];
    } else {
      return ["Extreme greed", "fg-xg"];
    }
  }
  function clampScore(value: any) {
    return Math.max(1, Math.min(99, Math.round(value)));
  }
  const fearGreedLabel = getFearGreedLabel(fearGreedScore);
  const socialUsers = [
    ["Mira", "@0xmira"],
    ["Delta Neutral", "@deltaneutral"],
    ["Perp Wizard", "@perpwizard"],
    ["Chart Brew", "@chartbrew"],
    ["Ola", "@ola_trades"],
    ["Funding Fiend", "@fundingfiend"],
    ["Basis Ben", "@basisben"],
    ["Lin", "@lin_onchain"],
    ["Tape Reader", "@tapereader"],
    ["Nadia", "@nadia_macro"],
  ];
  const socialPlatforms = ["X", "Farcaster", "Reddit", "Telegram"];
  const avatarColors = ["#2a56d6", "#5b3fd6", "#16736a", "#9a5410", "#9c2f5e", "#475566"];
  const marketName = market.name;
  const symbol2 = market.sym;
  const isCrypto = market.cat === "Crypto";
  const postTemplates = [
    [
      "bull",
      symbol2 +
        " reclaimed the range high on real volume. Funding is still reasonable, so this is not a crowded long yet.",
    ],
    [
      "bear",
      "Open interest on " +
        symbol2 +
        " keeps climbing while price stalls. That is how you get a flush. Watching " +
        formatPrice(market.price * 0.97) +
        ".",
    ],
    [
      "bull",
      "Best fill on " +
        symbol2 +
        " today came from " +
        activeVenue.name +
        " by a few bps. Aggregation actually matters on size.",
    ],
    [
      "neut",
      symbol2 +
        " chopping between " +
        formatPrice(market.price * 0.985) +
        " and " +
        formatPrice(market.price * 1.015) +
        ". No edge until one side breaks.",
    ],
    [
      "bull",
      "Shorts paying longs on two venues for " +
        symbol2 +
        ". Carry trade is open if you can stomach the vol.",
    ],
    [
      "bear",
      "Took profit on my " + symbol2 + " long. Momentum fading on the 4h, will re-enter lower.",
    ],
    [
      "bull",
      (isCrypto
        ? "Whales added size on-chain overnight. "
        : "Flows into " + marketName + " look steady into the open. ") + "I like dips here.",
    ],
    [
      "neut",
      "Anyone else seeing the basis on " +
        symbol2 +
        " widen between CEX and DEX? Feels like an arb window.",
    ],
  ];
  const newsSources = isCrypto
    ? ["CoinDesk", "The Block", "Decrypt", "Invezz", "Benzinga", "Cointelegraph"]
    : ["Reuters", "Bloomberg", "Benzinga", "MarketWatch", "Invezz", "CNBC"];
  const sourceDomains: any = {
    CoinDesk: "coindesk.com",
    "The Block": "theblock.co",
    Decrypt: "decrypt.co",
    Invezz: "invezz.com",
    Benzinga: "benzinga.com",
    Cointelegraph: "cointelegraph.com",
    Reuters: "reuters.com",
    Bloomberg: "bloomberg.com",
    MarketWatch: "marketwatch.com",
    CNBC: "cnbc.com",
  };
  const headlines = [
    [
      marketName +
        " jumps " +
        (Math.abs(market.chg) * 3 + 4).toFixed(0) +
        "% as a short squeeze fuels the rally",
      ["BTC"],
    ],
    [
      symbol2 +
        " holds key support, but weak momentum could trigger another " +
        (6 + Math.round(random() * 8)) +
        "% slide",
      [],
    ],
    [
      "Funding flips positive on " + symbol2 + " perps as open interest climbs to a monthly high",
      [],
    ],
    [
      isCrypto
        ? "Large holders add " +
          (20 + Math.round(random() * 80)) +
          "M " +
          symbol2 +
          " in 24 hours, on-chain data shows"
        : marketName + " options traders pay up for upside into earnings season",
      isCrypto ? ["ETH"] : [],
    ],
    [
      "Analysts eye $" +
        formatPrice(market.price * 1.12) +
        " as " +
        marketName +
        " breaks out of a three-week range",
      [],
    ],
    [
      isCrypto
        ? "Forget the majors: " + symbol2 + " is outrunning Bitcoin and XRP this week"
        : "Why " + marketName + " is outperforming the broader market this quarter",
      isCrypto ? ["BTC", "XRP"] : ["US500"],
    ],
    [symbol2 + " volatility compresses to a 30-day low ahead of the next macro print", []],
    [
      "Perp traders split on " +
        symbol2 +
        " as long/short ratio hits " +
        (0.8 + random() * 0.6).toFixed(2),
      [],
    ],
  ];
  const dayMs = 86400000;
  const monthNames3 = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  function buildAssetChip(sym: any) {
    const assetMarket = findMarket(sym);
    return {
      sym: sym,
      logo: LOGOS[sym.toLowerCase()],
      price: formatPrice(assetMarket.price),
      chg: (assetMarket.chg >= 0 ? "+" : "") + assetMarket.chg.toFixed(2) + "%",
      dir: assetMarket.chg >= 0 ? "up" : "down",
      trade: () => {
        self.setState({ iab: null });
        makeSelectMarket(sym)();
      },
    };
  }
  const newsItems = headlines.map((headline: any, index) => {
    const source = newsSources[index % newsSources.length];
    const date = new Date(state.now - (index * 2.6 + random() * 2) * dayMs);
    const syms = [symbol2].concat(
      headline[1].filter((sym: any) => sym !== symbol2 && findMarket(sym)),
    );
    return {
      title: headline[0],
      source: source,
      date: monthNames3[date.getUTCMonth()] + " " + date.getUTCDate(),
      logos: syms.map((sym) => LOGOS[sym.toLowerCase()]),
      syms: syms,
      open: () => {
        self.setState({ iab: { kind: "news", i: index }, iabStack: [], iabFwd: [] });
      },
    };
  });
  const posts = postTemplates.map((template, index) => {
    const user = socialUsers[(hashString(symbol2) + index * 3) % socialUsers.length];
    const minutesAgo = Math.round(4 + index * 37 + random() * 30);
    return {
      avatar: identicon(user[1]),
      name: user[0],
      handle: user[1],
      ini: user[0]
        .split(" ")
        .map((word) => word[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
      color: avatarColors[(index + hashString(symbol2)) % avatarColors.length],
      platform: socialPlatforms[(index + hashString(symbol2)) % socialPlatforms.length],
      ago: minutesAgo < 60 ? minutesAgo + "m" : Math.round(minutesAgo / 60) + "h",
      text: template[1],
      tag: template[0] === "bull" ? "Bullish" : template[0] === "bear" ? "Bearish" : "Neutral",
      tagCls: "post-tag t-" + template[0],
      likes: formatCompact(40 + random() * 2400),
      replies: String(Math.round(3 + random() * 140)),
      open: () => {
        self.setState({ iab: { kind: "post", i: index }, iabStack: [], iabFwd: [] });
      },
    };
  });
  const bullishCount = postTemplates.filter((template) => template[0] === "bull").length;
  const socialView = state.socView || "posts";
  const mentionCount = Math.round(
    (isCrypto ? 4000 : 1500) *
      (1 + random()) *
      (market.sym === "BTC" || market.sym === "ETH" ? 4 : 1),
  );
  const mentionChangePct = (random() - 0.35) * 60;
  var socialPanel = {
    updated: pad2(new Date(state.now).getUTCHours()) + ":00 UTC",
    fg: {
      score: String(fearGreedScore),
      label: fearGreedLabel[0],
      cls: "fg-label " + fearGreedLabel[1],
      pos: fearGreedScore,
      yday: String(clampScore(fearGreedScore - 6 + random() * 12)),
      week: String(clampScore(fearGreedScore - 15 + random() * 30)),
      month: String(clampScore(fearGreedScore - 25 + random() * 50)),
      comps: [
        ["Social sentiment", (bullishCount / postTemplates.length) * 100 + (random() - 0.5) * 10],
        ["Price momentum", 50 + market.chg * 9],
        ["Funding and positioning", 50 + activeVenue.fund * 900],
        ["Volatility", 30 + random() * 50],
      ].map((comp) => ({ k: comp[0], v: String(clampScore(comp[1])) })),
    },
    mentions: formatCompact(mentionCount),
    mentionsChg:
      (mentionChangePct >= 0 ? "+" : "") + mentionChangePct.toFixed(0) + "% vs yesterday",
    mentionsCls: mentionChangePct >= 0 ? "up" : "down",
    bull: String(Math.round((bullishCount / postTemplates.length) * 100 + (random() - 0.5) * 8)),
    tabs: [
      ["posts", "Posts", posts.length],
      ["news", "News", newsItems.length],
    ].map((tab) => {
      const isActive = socialView === tab[0];
      return {
        label: tab[1],
        count: String(tab[2]),
        cls: "soc-tab" + (isActive ? " is-on" : ""),
        pressed: isActive ? "true" : "false",
        pick: () => {
          self.setState({ socView: tab[0] });
        },
      };
    }),
    vPosts: socialView === "posts",
    vNews: socialView === "news",
    posts: posts,
    news: newsItems,
  };
  const browserState = state.iab;
  let browserView: any = { open: false, paras: [], assets: [], thread: [] };
  function closeBrowser() {
    self.setState({ iab: null });
  }
  if (browserState && browserState.kind === "news" && newsItems[browserState.i]) {
    const article = newsItems[browserState.i];
    const articleDomain = sourceDomains[article.source] || "news.example";
    const isUp = market.chg >= 0;
    browserView = {
      open: true,
      isReader: true,
      isPost: false,
      isWeb: false,
      close: closeBrowser,
      siteName: article.source,
      domain: articleDomain,
      title: article.title,
      date: article.date,
      readTime: 3 + (browserState.i % 4) + " min read",
      srcIni: article.source
        .split(" ")
        .map((word) => word[0])
        .join("")
        .slice(0, 2),
      lede:
        marketName +
        " " +
        (isUp ? "extended gains" : "came under pressure") +
        " as traders repositioned across major venues, with perpetual futures volume running ahead of spot.",
      paras: [
        "Open interest in " +
          symbol2 +
          " perpetuals rose over the session while funding rates stayed " +
          (activeVenue.fund >= 0
            ? "modestly positive, a sign that longs are paying to hold positions but not at extreme levels."
            : "slightly negative, suggesting shorts are crowded."),
        "Analysts pointed to " +
          formatPrice(market.price * 0.97) +
          " as near-term support and " +
          formatPrice(market.price * 1.05) +
          " as the next level to watch. A clean break above it could pull in sidelined buyers, while a loss of support would likely trigger liquidations on leveraged longs.",
        "Liquidity remains fragmented across exchanges, and spreads between venues widened briefly during the move. Traders routing orders through aggregators saw tighter fills than those executing on a single book.",
      ],
      assets: article.syms.map(buildAssetChip),
      copy: () => {
        try {
          navigator.clipboard.writeText("https://" + articleDomain + "/");
        } catch {}
        showToast("Link copied.");
      },
    };
  } else if (browserState && browserState.kind === "post" && posts[browserState.i]) {
    const post = posts[browserState.i];
    browserView = {
      open: true,
      isReader: false,
      isPost: true,
      isWeb: false,
      close: closeBrowser,
      siteName: post.platform,
      domain:
        post.platform === "X"
          ? "x.com"
          : post.platform === "Farcaster"
            ? "warpcast.com"
            : post.platform === "Reddit"
              ? "reddit.com"
              : "t.me",
      title: post.name,
      name: post.name,
      handle: post.handle,
      avatar: post.avatar,
      ini: post.ini,
      color: post.color,
      platform: post.platform,
      date: post.ago + " ago",
      text: post.text,
      tag: post.tag,
      tagCls: post.tagCls,
      likes: post.likes,
      replies: post.replies,
      thread: [0, 1, 2].map((i) => {
        const user = socialUsers[(hashString(post.handle) + i * 2) % socialUsers.length];
        return {
          handle: user[1],
          avatar: identicon(user[1]),
          ini: user[0].slice(0, 2).toUpperCase(),
          color: avatarColors[(i + 2) % avatarColors.length],
          ago: (i + 1) * 7 + "m",
          text: [
            "Agree, the bid looks real this time.",
            "Careful, funding can flip fast on this one.",
            "Where are you getting the best fills? " + activeVenue.name + " for me today.",
          ][i],
        };
      }),
      assets: [buildAssetChip(symbol2)],
      copy: () => {
        showToast("Link copied.");
      },
    };
  } else if (browserState && browserState.kind === "doc") {
    const docs: any = {
      terms: [
        "Terms of Use",
        [
          "OpenFutures routes your orders to third-party venues. Each venue has its own rules, fees and risks, and your orders are subject to them.",
          "Perpetual futures are leveraged products. You can lose more than your margin on a position, and positions can be liquidated without notice when the mark price reaches your liquidation price.",
          "Prop mode evaluates trades on your own balance. Passing an evaluation can unlock a funded account under separate terms. Nothing in OpenFutures is investment advice.",
          "You are responsible for complying with the laws where you live. Access may be restricted in some regions.",
        ],
      ],
      privacy: [
        "Privacy Policy",
        [
          "We collect the information needed to run your account: your wallet or login identifiers, the venues you connect, your orders and positions, and basic device data.",
          "We use it to route orders, show your portfolio, keep the service secure and improve OpenFutures. We do not sell your personal data.",
          "You can ask for a copy of your data or ask us to delete it, subject to records we must keep by law.",
        ],
      ],
      cookies: [
        "Cookie Policy",
        [
          "OpenFutures uses essential cookies and local storage to keep you signed in, remember your settings such as theme and routing, and protect the service.",
          "We do not use advertising cookies. Optional analytics, if added, will ask for your consent separately.",
        ],
      ],
    };
    const doc = docs[browserState.doc] || docs.terms;
    browserView = {
      open: true,
      isReader: true,
      isPost: false,
      isWeb: false,
      close: closeBrowser,
      siteName: "OpenFutures",
      domain: "openfutures.app",
      title: doc[0],
      date: "Draft",
      readTime: "Summary",
      srcIni: "OF",
      lede: "A plain-language summary. The full legal text will replace this before launch.",
      paras: doc[1],
      assets: [],
      copy: () => {
        showToast("Link copied.");
      },
    };
  } else if (browserState && browserState.kind === "web") {
    browserView = {
      open: true,
      isReader: false,
      isPost: false,
      isWeb: true,
      close: closeBrowser,
      siteName: browserState.name,
      domain: browserState.url.replace(/^https?:\/\//, "").split("/")[0],
      url: browserState.url,
      title: browserState.name,
      copy: () => {
        try {
          navigator.clipboard.writeText(browserState.url);
        } catch {}
        showToast("Link copied.");
      },
    };
  }
  if (browserView.open) {
    const pageUrl =
      browserState.kind === "web"
        ? browserState.url
        : "https://" + (browserView.domain || "") + "/";
    const browseProxy = self.props.browseProxy;
    const backStack = state.iabStack || [];
    const forwardStack = state.iabFwd || [];
    browserView.url = pageUrl;
    browserView.frameSrc = browseProxy
      ? browseProxy +
        "?url=" +
        encodeURIComponent(pageUrl) +
        (state.iabNonce ? "&r=" + state.iabNonce : "")
      : pageUrl;
    browserView.canLoad = !!browseProxy;
    browserView.noLoad = !browseProxy;
    browserView.backDis = false;
    browserView.fwdDis = forwardStack.length === 0;
    browserView.back = () => {
      if (backStack.length) {
        self.setState({
          iab: backStack[backStack.length - 1],
          iabStack: backStack.slice(0, -1),
          iabFwd: forwardStack.concat([browserState]),
        });
      } else {
        self.setState({ iab: null, iabStack: [], iabFwd: [] });
      }
    };
    browserView.fwd = () => {
      if (forwardStack.length) {
        self.setState({
          iab: forwardStack[forwardStack.length - 1],
          iabFwd: forwardStack.slice(0, -1),
          iabStack: backStack.concat([browserState]),
        });
      }
    };
    browserView.close = () => {
      self.setState({ iab: null, iabStack: [], iabFwd: [] });
    };
    browserView.visit = () => {
      self.setState({
        iab: { kind: "web", url: pageUrl, name: browserView.siteName },
        iabStack: backStack.concat([browserState]),
        iabFwd: [],
      });
    };
    browserView.reload = () => {
      self.setState({ iabNonce: Date.now() });
    };
    browserView.cycleText = () => {
      self.setState({ iabText: ((state.iabText || 0) + 1) % 3 });
    };
    browserView.rdCls =
      "rd rd-t" + (state.iabText || 0) + (browserState.kind === "doc" ? " rd-doc" : "");
    browserView.progCls = "sf-prog " + ((state.iabNonce || 0) % 2 ? "pa" : "pb");
    browserView.share = () => {
      try {
        if (navigator.share) {
          navigator.share({ title: browserView.title || browserView.siteName, url: pageUrl });
          return;
        }
      } catch {}
      try {
        navigator.clipboard.writeText(pageUrl);
      } catch {}
      showToast("Link copied.");
    };
    browserView.copy = () => {
      try {
        navigator.clipboard.writeText(pageUrl);
      } catch {}
      showToast("Link copied.");
    };
  }
  marketInfo.links.forEach((link: any) => {
    link.open = (e: any) => {
      if (e && e.preventDefault) {
        e.preventDefault();
      }
      self.setState({
        iab: {
          kind: "web",
          url: link.href,
          name: link.label.replace(/^(Research on|Chart on) /, ""),
        },
        iabStack: [],
        iabFwd: [],
      });
    };
  });
  const assetSheetSym = state.assetSheet;
  const assetSheetMarket = assetSheetSym ? findMarket(assetSheetSym) : null;
  let assetSheetView: any = { open: false, rows: [], venues: [], links: [] };
  if (assetSheetMarket) {
    const assetSheetExtras = buildMarketInfo(assetSheetMarket);
    const isAssetFav = !!(state.fav || {})[assetSheetSym];
    assetSheetView = {
      open: true,
      sym: assetSheetSym,
      logo: LOGOS[assetSheetSym.toLowerCase()],
      price: formatPrice(assetSheetMarket.price),
      chg: (assetSheetMarket.chg >= 0 ? "+" : "") + assetSheetMarket.chg.toFixed(2) + "%",
      dir: assetSheetMarket.chg >= 0 ? "up" : "down",
      favFill: isAssetFav ? "currentColor" : "none",
      favPressed: isAssetFav ? "true" : "false",
      toggleFav: () => {
        const nextFav = { ...state.fav };
        nextFav[assetSheetSym] = !isAssetFav;
        self.setState({ fav: nextFav });
        showToast(
          (isAssetFav ? "Removed " : "Added ") +
            assetSheetSym +
            "-PERP " +
            (isAssetFav ? "from" : "to") +
            " your watchlist.",
        );
      },
      share: () => {
        self.setState({
          assetSheet: null,
          share: { kind: "asset", sym: assetSheetSym },
          shMsg: null,
          shCopied: false,
        });
      },
      close: () => {
        self.setState({ assetSheet: null });
      },
      trade: () => {
        self.setState({ assetSheet: null });
        makeSelectMarket(assetSheetSym)();
      },
      ...assetSheetExtras,
    };
  }
  const socialsTab = {
    cls: "tab tab-soc" + (state.ptab === "socials" ? " is-active" : ""),
    pressed: state.ptab === "socials" ? "true" : "false",
    fg: socialPanel.fg.score + " " + socialPanel.fg.label,
    fgCls: "st-fg " + socialPanel.fg.cls.replace("fg-label ", ""),
    pick: () => {
      const viewportHeight2 =
        state.vh || (typeof window !== "undefined" ? window.innerHeight : 900);
      self.setState({
        ptab: "socials",
        dockOpen: true,
        dockH: Math.max(state.dockH || 0, Math.min(480, Math.round(viewportHeight2 * 0.5))),
      });
    },
  };
  const accountModeSwitch = {
    proCls: "ms-opt" + (isPropAccount ? "" : " is-on"),
    propCls: "ms-opt" + (isPropAccount ? " is-on" : ""),
    proPressed: isPropAccount ? "false" : "true",
    propPressed: isPropAccount ? "true" : "false",
    setPro: () => {
      if (isPropAccount) {
        self.setState({ account: "live" });
        showToast("Pro mode on. Same balance, nothing is scored.");
      }
    },
    setProp: () => {
      if (!isPropAccount) {
        self.setState({ account: "prop" });
        showToast("Prop mode on. You are trading your Prop account.");
      }
    },
  };
  function buildPositionRow(position: any, index: any) {
    return {
      size: position.sizeText,
      roeA:
        (position.pnlCls === "down" ? "▼ " : "▲ ") + String(position.roeText).replace(/^[+-]/, ""),
      details: () => {
        self.setState({ hmDet: { kind: "pos", i: index } });
      },
      sym: position.sym,
      lev: position.levText,
      logo: position.logo,
      side: position.sideLabel,
      sideCls: position.sideCls,
      venue: position.venueName,
      venueLogo: position.venueLogo,
      pnl: position.pnlText,
      roe: position.roeText,
      pnlCls: position.pnlCls,
    };
  }
  const holdings = {
    pos: positionRows.map(buildPositionRow),
    here: positionRows
      .map((position: any, index: any) => ({ p: position, pi: index }))
      .sort((a: any, b: any) => Number(b.p.sym === market.sym) - Number(a.p.sym === market.sym))
      .map((entry: any) => buildPositionRow(entry.p, entry.pi)),
    hasHere: false,
    hereCount: "",
    ord: orderRows.map((order: any, index: any) => ({
      amount: order.amountText,
      details: () => {
        self.setState({ hmDet: { kind: "ord", i: index } });
      },
      sym: order.sym,
      logo: order.logo,
      side: order.sideLabel,
      sideCls: order.sideCls,
      venue: order.venueName,
      venueLogo: order.venueLogo,
      price: order.priceText,
      type: order.type,
      filled: order.filledText,
    })),
    hist: tradeHistoryRows.slice(0, 30).map((trade, index) => {
      const liveTrade = liveTradeHistory[index] || {};
      const hasPnl = liveTrade.pnl != null;
      return {
        venueLogo: trade.venueLogo,
        details: () => {
          self.setState({ hmDet: { kind: "hist", i: index } });
        },
        sym: trade.sym,
        logo: trade.logo,
        action: liveTrade.action || "",
        sideCls: liveTrade.side === "long" ? "long" : "short",
        time: trade.time,
        big: hasPnl ? formatSignedUsd(liveTrade.pnl!) : trade.priceText,
        sub: hasPnl ? "Realized" : trade.amountText,
        pnlCls: hasPnl ? (liveTrade.pnl! >= 0 ? "up" : "down") : "",
      };
    }),
  };
  holdings.hasHere = holdings.here.length > 0;
  holdings.hereCount = String(holdings.here.length);
  var aiChats =
    state.aiChats && state.aiChats.length
      ? state.aiChats
      : [{ id: "c0", title: "New chat", msgs: [] }];
  const currentChatId = state.aiCur || aiChats[0].id;
  var currentChat = aiChats.filter((chat: any) => chat.id === currentChatId)[0] || aiChats[0];
  var aiQuestionsLeft = state.aiLeft == null ? 25 : state.aiLeft;
  const isAiBusy = !!state.aiBusy;
  function findMarketInText(text: any) {
    const lowerText = text.toLowerCase();
    let foundMarket: any = null;
    MARKETS.forEach((market2) => {
      const symbolRegex = new RegExp("(^|[^a-z])" + market2.sym.toLowerCase() + "([^a-z]|$)");
      if (
        !foundMarket &&
        (symbolRegex.test(lowerText) || lowerText.indexOf(market2.name.toLowerCase()) > -1)
      ) {
        foundMarket = market2;
      }
    });
    return foundMarket;
  }
  function buildLiveContext() {
    const marketsSummary = MARKETS.map(
      (market2) =>
        market2.sym +
        " " +
        formatPrice(market2.price) +
        " " +
        (market2.chg >= 0 ? "+" : "") +
        market2.chg.toFixed(2) +
        "% vol " +
        market2.vol +
        " oi " +
        market2.oi,
    ).join("; ");
    const positionsSummary =
      positionRows
        .map(
          (position: any) =>
            position.sym +
            " " +
            position.sideLabel +
            " " +
            position.levText +
            " size " +
            position.sizeText +
            " entry " +
            position.entryText +
            " mark " +
            position.markText +
            " liq " +
            position.liqText +
            " pnl " +
            position.pnlText +
            " (" +
            position.roeText +
            ") on " +
            position.venueName,
        )
        .join("; ") || "none";
    const venueQuotesSummary = quotePanel.all
      .map((quote: any) => quote.name + " " + quote.fill + " " + quote.delta)
      .join("; ");
    return `${"Mode: " + (isPropAccount ? "Prop (trades count toward the evaluation)" : "Pro") + ". Viewing " + market.sym + "-PERP. Equity " + formatUsd(equity)}.
Markets: ${marketsSummary}
Positions: ${positionsSummary}
Venue quotes for ${market.sym} (best first): ${venueQuotesSummary}
Fear and greed for ${market.sym}: ${socialPanel.fg.score} ${socialPanel.fg.label}.`;
  }
  function answerLocally(question: any) {
    const lowerQuestion = question.toLowerCase();
    const targetMarket = findMarketInText(question) || market;
    const marketStats2 = getMarketStats2(targetMarket);
    const lines = [];
    function formatPct2(value: any) {
      return (value >= 0 ? "+" : "") + value.toFixed(2) + "%";
    }
    if (/position|risk|liquid|exposure|my (trades|book|pnl)|portfolio/.test(lowerQuestion)) {
      if (!positionRows.length) {
        return "You have no open positions right now.";
      }
      const totalPnl = positionRows.reduce(
        (sum: any, position: any) =>
          sum + (parseFloat(position.pnlText.replace(/[$,+]/g, "")) || 0),
        0,
      );
      lines.push(
        "You have " +
          positionRows.length +
          " open positions, unrealized " +
          formatSignedUsd(totalPnl) +
          ".",
      );
      let closestToLiq: any = null;
      positionRows.forEach((position: any) => {
        const markPrice = parseFloat(position.markText.replace(/[$,]/g, ""));
        const liqPrice = parseFloat(position.liqText.replace(/[$,]/g, ""));
        const liqDistancePct = (Math.abs(markPrice - liqPrice) / markPrice) * 100;
        lines.push(
          "- " +
            position.sym +
            "-PERP " +
            position.sideLabel.toLowerCase() +
            " " +
            position.levText +
            " on " +
            position.venueName +
            ": " +
            position.pnlText +
            " (" +
            position.roeText +
            "), liquidation " +
            liqDistancePct.toFixed(1) +
            "% away",
        );
        if (!closestToLiq || liqDistancePct < closestToLiq.d) {
          closestToLiq = { p: position, d: liqDistancePct };
        }
      });
      if (closestToLiq) {
        lines.push(
          "Closest to liquidation: " +
            closestToLiq.p.sym +
            "-PERP at " +
            closestToLiq.d.toFixed(1) +
            "% away. " +
            (closestToLiq.d < 10
              ? "Consider adding margin, reducing size or setting a stop loss."
              : "Nothing is close to liquidation."),
        );
      }
      if (isPropAccount) {
        lines.push("Prop mode is on, so losses here also count against today’s loss limit.");
      }
      return lines.join(`
`);
    }
    if (/gain|pump|top perform|up the most|winners/.test(lowerQuestion)) {
      const topGainers = MARKETS.slice()
        .sort((a, b) => b.chg - a.chg)
        .slice(0, 5);
      return `Top gainers in the last 24 hours:
${topGainers.map(
  (market2) =>
    "- " + market2.sym + "-PERP " + formatPct2(market2.chg) + " at $" + formatPrice(market2.price),
).join(`
`)}`;
    }
    if (/los|dump|worst|down the most|red/.test(lowerQuestion)) {
      const topLosers = MARKETS.slice()
        .sort((a, b) => a.chg - b.chg)
        .slice(0, 5);
      return `Biggest losers in the last 24 hours:
${topLosers.map(
  (market2) =>
    "- " + market2.sym + "-PERP " + formatPct2(market2.chg) + " at $" + formatPrice(market2.price),
).join(`
`)}`;
    }
    if (/explain|what is|what are|how does/.test(lowerQuestion) && /funding/.test(lowerQuestion)) {
      return `Funding is a payment between longs and shorts that keeps a perp’s price close to the spot price.
- When funding is positive, longs pay shorts. That usually means more traders are long.
- When it is negative, shorts pay longs.
- Rates differ by venue, so you can sometimes go long where funding is cheap and short where it is expensive. That is the "best carry" in Market Watch, Funding.`;
    }
    if (/funding|carry|rate/.test(lowerQuestion)) {
      if (findMarketInText(question)) {
        const venuesByFunding = marketStats2.vm.slice().sort((a: any, b: any) => a.fh - b.fh);
        return `${targetMarket.sym}-PERP funding per hour by venue:
${venuesByFunding.map((venueRate: any) => "- " + venueRate.v.name + " " + formatPct2(venueRate.fh))
  .join(`
`)}
Best carry: long on ${venuesByFunding[0].v.name}, short on ${venuesByFunding[venuesByFunding.length - 1].v.name}, spread ${(marketStats2.fSpread * 24 * 365).toFixed(1)}% a year.`;
      }
      const widestSpreads = MARKETS.map((market2) => ({ y: market2, st: getMarketStats2(market2) }))
        .sort((a, b) => b.st.fSpread - a.st.fSpread)
        .slice(0, 4);
      return `Widest funding spreads across venues right now (annualized):
${widestSpreads.map((entry) => {
  const entryVenuesByFunding = entry.st.vm.slice().sort((a: any, b: any) => a.fh - b.fh);
  return (
    "- " +
    entry.y.sym +
    "-PERP " +
    (entry.st.fSpread * 24 * 365).toFixed(1) +
    "%: long on " +
    entryVenuesByFunding[0].v.name +
    ", short on " +
    entryVenuesByFunding[entryVenuesByFunding.length - 1].v.name
  );
}).join(`
`)}
Carry trades still carry price and venue risk, and rates change every hour.`;
    }
    if (/venue|fill|cheap|route|where should|best price|execute/.test(lowerQuestion)) {
      return `${"For " + market.sym}-PERP at your current size, venues ranked by all-in cost:
${quotePanel.all.map(
  (venueQuote: any, index: any) =>
    "- " +
    (index + 1) +
    ". " +
    venueQuote.name +
    " " +
    venueQuote.fill +
    (index === 0 ? " (best)" : " " + venueQuote.delta),
).join(`
`)}
Ranking includes price, fee and depth for your size, and updates as the books move.`;
    }
    if (/fear|greed|sentiment|mood|people saying|social/.test(lowerQuestion)) {
      return `${"Fear and greed for " + market.sym + " is " + socialPanel.fg.score + ", " + socialPanel.fg.label.toLowerCase() + ". Yesterday it was " + socialPanel.fg.yday + ", last week " + socialPanel.fg.week}.
${socialPanel.fg.comps.map((component) => "- " + component.k + ": " + component.v).join(`
`)}
${socialPanel.bull}% of recent posts are bullish. The Socials tab has the posts and news behind this.`;
    }
    if (/prop|evaluation|challenge|funded|credit|overdraft|guard/.test(lowerQuestion)) {
      return (
        "Prop is a prop-trading protocol. You pick an account size ($10K to $100K) and pay a one-time evaluation fee to the vault. Reach +8% while staying inside a 5% daily loss limit and a 10% max loss, over at least five trading days, and you get a funded account that trades the OpenFutures Vault capital. You keep 80% of profits, paid every 14 days. The vault is permissionless: anyone can deposit USDC and earn from evaluation fees and the 20% profit share. " +
        (isPropAccount
          ? "You are in Prop mode now; the Prop page shows your account."
          : "Switch to Prop in the top bar to start.")
      );
    }
    const targetVenuesByFunding = getMarketStats2(targetMarket)
      .vm.slice()
      .sort((a: any, b: any) => a.fh - b.fh);
    lines.push(
      targetMarket.name +
        " (" +
        targetMarket.sym +
        "-PERP) is at $" +
        formatPrice(targetMarket.price) +
        ", " +
        formatPct2(targetMarket.chg) +
        " in the last 24 hours.",
    );
    lines.push(
      "- 24h volume " +
        targetMarket.vol +
        ", open interest " +
        targetMarket.oi +
        ", up to " +
        targetMarket.max +
        "x leverage",
    );
    lines.push(
      "- Funding per hour ranges from " +
        formatPct2(targetVenuesByFunding[0].fh) +
        " on " +
        targetVenuesByFunding[0].v.name +
        " to " +
        formatPct2(targetVenuesByFunding[targetVenuesByFunding.length - 1].fh) +
        " on " +
        targetVenuesByFunding[targetVenuesByFunding.length - 1].v.name,
    );
    if (targetMarket.sym === market.sym) {
      lines.push(
        "- Fear and greed " +
          socialPanel.fg.score +
          " (" +
          socialPanel.fg.label.toLowerCase() +
          "), best venue right now " +
          quotePanel.all[0].name,
      );
    }
    if (!findMarketInText(question)) {
      lines.push(
        "I can also check your positions, rank venues for a fill, find funding carry, or list top movers.",
      );
    }
    return lines.join(`
`);
  }
  function updateAiMessage(chatId: any, msgIndex: any, text: any, isDone: any) {
    const updatedChats = (
      self.state.aiChats && self.state.aiChats.length ? self.state.aiChats : aiChats
    ).map((chat: any) => {
      if (chat.id !== chatId) {
        return chat;
      }
      const msgs = chat.msgs.slice();
      msgs[msgIndex] = { ...msgs[msgIndex], text: text, pending: !isDone };
      return { ...chat, msgs: msgs };
    });
    const statePatch: any = { aiChats: updatedChats };
    if (isDone) {
      statePatch.aiBusy = false;
    }
    self.setState(statePatch);
  }
  function askAssistant(input: any) {
    const prompt = String(input || "").trim();
    if (!!prompt && !self.state.aiBusy && !(aiQuestionsLeft <= 0)) {
      const chatId = currentChat.id;
      const history = currentChat.msgs.filter((msg: any) => !msg.pending);
      const chatTitle = currentChat.msgs.length
        ? currentChat.title
        : prompt.length > 34
          ? prompt.slice(0, 32) + "…"
          : prompt;
      const nextMsgs = history.concat([
        { role: "user", text: prompt },
        { role: "ai", text: "", pending: true },
      ]);
      const pendingIndex = nextMsgs.length - 1;
      let nextChats = aiChats.map((chat: any) => {
        if (chat.id === chatId) {
          return { ...chat, msgs: nextMsgs, title: chatTitle };
        } else {
          return chat;
        }
      });
      if (!aiChats.filter((chat: any) => chat.id === chatId).length) {
        nextChats = [{ id: chatId, title: chatTitle, msgs: nextMsgs }].concat(nextChats);
      }
      self.setState({
        aiChats: nextChats,
        aiCur: chatId,
        aiInput: "",
        aiBusy: true,
        aiLeft: aiQuestionsLeft - 1,
        aiMenu: false,
      });
      setTimeout(() => {
        const body = document.getElementById("ai-body");
        if (body) {
          body.scrollTop = body.scrollHeight;
        }
      }, 30);
      const liveContext = buildLiveContext();
      const recentHistory2 = history
        .slice(-8)
        .map((msg: any) => ({ role: msg.role === "ai" ? "assistant" : "user", content: msg.text }));
      const systemPrompt = `You are OpenFutures AI, the assistant inside OpenFutures, a perpetual futures aggregator that routes orders to the cheapest of six venues. Answer in plain, short sentences, using the live data below. Use short "- " bullet lines for lists. Never use em dashes. Do not give personalized financial advice or tell the user to buy or sell; explain the data and the trade-offs instead.

Live data:
${liveContext}`;
      function finishAnswer(answer: any) {
        updateAiMessage(chatId, pendingIndex, answer, true);
        setTimeout(() => {
          const body = document.getElementById("ai-body");
          if (body) {
            body.scrollTop = body.scrollHeight;
          }
        }, 30);
      }
      function useLocalFallback() {
        finishAnswer(answerLocally(prompt));
      }
      self._aiAbort = typeof AbortController !== "undefined" ? new AbortController() : null;
      if (self.props.aiEndpoint) {
        fetch(self.props.aiEndpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            system: systemPrompt,
            messages: recentHistory2.concat([{ role: "user", content: prompt }]),
          }),
          signal: self._aiAbort ? self._aiAbort.signal : undefined,
        })
          .then((response) => {
            if (response.ok) {
              return response.json();
            } else {
              return Promise.reject(response.status);
            }
          })
          .then((data) => {
            finishAnswer(data && data.text ? data.text : answerLocally(prompt));
          })
          .catch((error) => {
            if (!error || error.name !== "AbortError") {
              useLocalFallback();
            }
          });
        return;
      }
      if (self._sample) {
        const sampleMessages = [
          {
            role: "user",
            content: `${systemPrompt}

The user asks: ${
              recentHistory2.length
                ? `${recentHistory2.map((turn: any) => turn.role + ": " + turn.content).join(`
`)}
user: `
                : ""
            }${prompt}`,
          },
        ];
        self
          ._sample(sampleMessages, {
            onText: (partial: any) => {
              updateAiMessage(chatId, pendingIndex, partial.text, false);
            },
            signal: self._aiAbort ? self._aiAbort.signal : undefined,
            cache: false,
            modelTier: "quick",
          })
          .then((result: any) => {
            finishAnswer(result.text || answerLocally(prompt));
          })
          .catch((error: any) => {
            if (error && error.code === "cancelled") {
              finishAnswer((error.text || "") + (error.text ? "" : "Stopped."));
              return;
            }
            if (error && error.text) {
              finishAnswer(error.text);
              return;
            }
            self._sample = error && error.code === "not_granted" ? null : self._sample;
            useLocalFallback();
          });
        return;
      }
      setTimeout(useLocalFallback, 450);
    }
  }
  const suggestionPrompts = [
    ["▲", market.sym + " market overview"],
    ["%", "Best funding carry right now"],
    ["↑", "Top gainers today"],
    ["↓", "Biggest losers today"],
    ["⊕", "Where is the best fill for " + market.sym + "?"],
    ["!", "Risk check on my positions"],
    ["◎", "Fear and greed for " + market.sym],
    ["?", "Explain funding rates"],
    ["★", "How is BTC doing?"],
    ["≡", "Funding for SOL by venue"],
    ["⚖", "How does Prop mode work?"],
    ["→", "What is moving the market?"],
  ];
  function buildSuggestionTrack(items: any, isReversed: any) {
    const doubledItems = items.concat(items);
    return {
      cls: "ai-track " + (isReversed ? "rev" : ""),
      items: doubledItems.map((item: any, index: any) => {
        const isOriginal = index < items.length;
        return {
          ic: item[0],
          label: item[1],
          tab: isOriginal ? 0 : -1,
          hidden: isOriginal ? "false" : "true",
          ask: () => {
            askAssistant(item[1]);
          },
        };
      }),
    };
  }
  function parseAiLines(text: any) {
    return String(text || "")
      .replace(/\*\*/g, "")
      .replace(/\u2014/g, ", ")
      .split(
        `
`,
      )
      .filter((line) => line.trim().length)
      .map((line) => {
        const isBullet = /^\s*[-*\u2022]\s+/.test(line);
        return {
          text: isBullet ? line.replace(/^\s*[-*\u2022]\s+/, "") : line,
          cls: isBullet ? "ai-li" : "",
        };
      });
  }
  var assistantPanel = {
    showLauncher: !state.aiOpen && !state.aiHidden,
    isOpen: !!state.aiOpen,
    launchCls: "ai-launch scr-" + (state.screen || "detail"),
    kbd:
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "")
        ? "⌘ /"
        : "Ctrl /",
    open: () => {
      self.setState({ aiOpen: true, srch: false });
    },
    hide: () => {
      self.setState({ aiHidden: true });
      showToast(
        "Assistant hidden. Press " +
          (typeof navigator !== "undefined" && /Mac/.test(navigator.platform || "")
            ? "⌘"
            : "Ctrl") +
          " / to open it any time.",
      );
    },
    close: () => {
      self.setState({ aiOpen: false, aiMenu: false });
    },
    panelCls: "ai-panel" + (state.aiExpanded ? " is-expanded" : ""),
    expandLabel: state.aiExpanded ? "Shrink" : "Expand",
    toggleExpand: () => {
      self.setState({ aiExpanded: !state.aiExpanded });
    },
    title: currentChat.msgs.length ? currentChat.title : "New chat",
    menuOpen: !!state.aiMenu,
    menuOpenStr: state.aiMenu ? "true" : "false",
    toggleMenu: () => {
      self.setState({ aiMenu: !state.aiMenu });
    },
    chats: aiChats
      .filter((chat: any) => chat.msgs.length)
      .map((chat: any) => ({
        title: chat.title,
        meta: Math.ceil(chat.msgs.length / 2) + " questions",
        cls: "ai-mi" + (chat.id === currentChat.id ? " is-on" : ""),
        pick: () => {
          self.setState({ aiCur: chat.id, aiMenu: false });
        },
      }))
      .concat(
        aiChats.filter((chat: any) => chat.msgs.length).length
          ? []
          : [
              {
                title: "No chats yet",
                meta: "Ask something to start",
                cls: "ai-mi muted",
                pick: () => {
                  self.setState({ aiMenu: false });
                },
              },
            ],
      ),
    newChat: () => {
      if (!currentChat.msgs.length) {
        self.setState({ aiMenu: false });
        return;
      }
      const newChatId = "c" + Date.now();
      self.setState({
        aiChats: [{ id: newChatId, title: "New chat", msgs: [] }].concat(aiChats),
        aiCur: newChatId,
        aiMenu: false,
        aiInput: "",
      });
    },
    empty: !currentChat.msgs.length,
    msgs: currentChat.msgs.map((msg: any) => {
      const isAi = msg.role === "ai";
      return {
        isAi: isAi,
        cls: "ai-msg " + (isAi ? "ai-a" : "ai-u") + (msg.pending ? " pending" : ""),
        lines:
          msg.pending && !msg.text
            ? [{ text: "Thinking…", cls: "ai-think" }]
            : parseAiLines(msg.text),
        canCopy: isAi && !msg.pending && !!msg.text,
        copy: () => {
          try {
            navigator.clipboard.writeText(msg.text);
          } catch {}
          showToast("Answer copied.");
        },
      };
    }),
    rows: [
      buildSuggestionTrack(suggestionPrompts.slice(0, 6), 0),
      buildSuggestionTrack(suggestionPrompts.slice(6), 1),
    ],
    input: state.aiInput || "",
    onInput: (e: any) => {
      self.setState({ aiInput: e.target.value });
    },
    submit: (e: any) => {
      if (e && e.preventDefault) {
        e.preventDefault();
      }
      askAssistant(self.state.aiInput);
    },
    busy: isAiBusy,
    idle: !isAiBusy,
    sendDisabled: !(state.aiInput || "").trim() || aiQuestionsLeft <= 0,
    stop: () => {
      try {
        if (self._aiAbort) {
          self._aiAbort.abort();
        }
      } catch {}
      self.setState({ aiBusy: false });
    },
    left: String(aiQuestionsLeft),
  };
  const totalObSteps = 5;
  const obStep = state.obStep || 0;
  const obStepIndex = Math.max(0, Math.min(totalObSteps - 1, obStep - 1));
  function setRouting(mode: any) {
    try {
      localStorage.setItem("openfutures-routing", mode);
    } catch {}
    self.setState({ routing: mode });
  }
  function setPreferredVenue(venueId: any) {
    try {
      localStorage.setItem("openfutures-prefvenue", venueId);
    } catch {}
    const venueOverrides = { ...state.venue };
    Object.keys(venueOverrides).forEach((key) => {
      if (venueOverrides[key] === "best") {
        delete venueOverrides[key];
      }
    });
    self.setState({ prefVenue: venueId });
  }
  function openDocHandler(doc: any) {
    return (e: any) => {
      if (e && e.preventDefault) {
        e.preventDefault();
      }
      if (e && e.stopPropagation) {
        e.stopPropagation();
      }
      self.setState({ iab: { kind: "doc", doc: doc }, iabStack: [], iabFwd: [] });
    };
  }
  function goToObStep(step: any) {
    self.setState({ obStep: Math.max(1, Math.min(totalObSteps, step)) });
    const obTrack = typeof document !== "undefined" && document.getElementById("ob-track");
    if (obTrack) {
      obTrack.style.setProperty("--drag", "0px");
    }
  }
  const obWatchSymbols = ["BTC", "ETH", "SOL", "HYPE", "NVDA", "US500", "XAU", "EURUSD"];
  const bestQuote = quotePanel.all[0] || {};
  function finishOnboarding() {
    const now = new Date();
    const acceptedAt = now.toISOString();
    try {
      localStorage.setItem("openfutures-onboarded", acceptedAt);
    } catch {}
    const celebrationId = Date.now();
    self.setState({ obOpen: false, obStep: 0, termsAt: acceptedAt, celebrate: celebrationId });
    clearTimeout(self._celT);
    self._celT = setTimeout(() => {
      if (self.state.celebrate === celebrationId) {
        self.setState({ celebrate: null });
      }
    }, 6500);
  }
  const onboarding = {
    open: !!state.obOpen,
    isTerms: obStep === 0,
    isTour: obStep > 0,
    t1Cls: "ob-check" + (state.obT1 ? " is-on" : ""),
    t1Str: state.obT1 ? "true" : "false",
    toggleT1: (e: any) => {
      if (!e || !e.target || e.target.tagName !== "A") {
        self.setState({ obT1: !state.obT1, obDeclined: false });
      }
    },
    t2Cls: "ob-check" + (state.obT2 ? " is-on" : ""),
    t2Str: state.obT2 ? "true" : "false",
    toggleT2: (e: any) => {
      if (!e || !e.target || e.target.tagName !== "A") {
        self.setState({ obT2: !state.obT2, obDeclined: false });
      }
    },
    openTerms: openDocHandler("terms"),
    openPrivacy: openDocHandler("privacy"),
    openCookies: openDocHandler("cookies"),
    declined: !!state.obDeclined,
    decline: () => {
      self.setState({ obDeclined: true });
    },
    acceptDis: !state.obT1 || !state.obT2,
    accept: () => {
      if (state.obT1 && state.obT2) {
        self.setState({ obStep: 1, termsAt: new Date().toISOString() });
      }
    },
    stepText: "Step " + (obStepIndex + 1) + " of " + totalObSteps,
    idx: String(obStepIndex),
    h1: obStepIndex === 0 ? "false" : "true",
    h2: obStepIndex === 1 ? "false" : "true",
    h3: obStepIndex === 2 ? "false" : "true",
    h4: obStepIndex === 3 ? "false" : "true",
    h5: obStepIndex === 4 ? "false" : "true",
    skip: finishOnboarding,
    finish: finishOnboarding,
    prev: () => {
      goToObStep(obStep - 1);
    },
    next: () => {
      goToObStep(obStep + 1);
    },
    prevDis: obStepIndex === 0,
    notLast: obStepIndex < totalObSteps - 1,
    isLast: obStepIndex === totalObSteps - 1,
    dots: [0, 1, 2, 3, 4].map((i) => ({
      cls: "ob-dot" + (i === obStepIndex ? " is-on" : ""),
      on: i === obStepIndex ? "true" : "false",
      label: "Step " + (i + 1),
      go: () => {
        goToObStep(i + 1);
      },
    })),
    down: (e: any) => {
      if (!e.target || !e.target.closest || !e.target.closest("button")) {
        self._obX = e.clientX;
        self._obW = e.currentTarget.offsetWidth || 1;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
      }
    },
    move: (e: any) => {
      if (self._obX != null) {
        const deltaX = e.clientX - self._obX;
        const track = document.getElementById("ob-track");
        if (track) {
          track.classList.add("is-drag");
          track.style.setProperty(
            "--drag",
            ((obStepIndex === 0 && deltaX > 0) || (obStepIndex === totalObSteps - 1 && deltaX < 0)
              ? deltaX * 0.3
              : deltaX) + "px",
          );
        }
      }
    },
    up: (e: any) => {
      if (self._obX != null) {
        const deltaX = e.clientX - self._obX;
        const trackWidth = self._obW || 1;
        self._obX = null;
        const track = document.getElementById("ob-track");
        if (track) {
          track.classList.remove("is-drag");
          track.style.setProperty("--drag", "0px");
        }
        if (Math.abs(deltaX) > Math.min(80, trackWidth * 0.18)) {
          goToObStep(obStep + (deltaX < 0 ? 1 : -1));
        }
      }
    },
    venues: VENUES.map((venue: any, index) => {
      const quote = quotePanel.all.filter((q: any) => q.name === venue.name)[0];
      return { logo: venue.logo, px: quote ? quote.fill : "" };
    }),
    bestName: bestQuote.name ? bestQuote.name + " " + bestQuote.fill : "",
    routeCls: "ob-switch" + (state.routing === "off" ? "" : " is-on"),
    routeStr: state.routing === "off" ? "false" : "true",
    routeOff: state.routing === "off",
    routeSub: state.routing === "off" ? "Off" : "On, cheapest venue",
    toggleRoute: () => {
      setRouting(state.routing === "off" ? "smart" : "off");
    },
    venuePick: VENUES.map((venue: any) => {
      const isSelected = (state.prefVenue || "hyperliquid") === venue.id;
      return {
        logo: venue.logo,
        name: venue.name,
        cls: "ob-venue" + (isSelected ? " is-on" : ""),
        pressed: isSelected ? "true" : "false",
        pick: () => {
          setPreferredVenue(venue.id);
        },
      };
    }),
    proCls: "ob-mode" + (isPropAccount ? "" : " is-on"),
    proStr: isPropAccount ? "false" : "true",
    pickPro: () => {
      self.setState({ account: "live" });
    },
    propCls: "ob-mode" + (isPropAccount ? " is-on" : ""),
    propStr: isPropAccount ? "true" : "false",
    pickProp: () => {
      self.setState({ account: "prop" });
    },
    themes: [
      ["dark", "Dark"],
      ["light", "Light"],
    ].map((theme) => {
      const isActive = (state.theme || "dark") === theme[0];
      return {
        label: theme[1],
        sw: "ob-tsw sw-" + theme[0],
        cls: "ob-theme" + (isActive ? " is-on" : ""),
        pressed: isActive ? "true" : "false",
        pick: () => {
          try {
            localStorage.setItem("openfutures-theme", theme[0]);
          } catch {}
          self.setState({ theme: theme[0] });
        },
      };
    }),
    watch: obWatchSymbols.map((symbol) => {
      const isFav = !!(state.fav || {})[symbol];
      return {
        sym: symbol,
        logo: LOGOS[symbol.toLowerCase()],
        cls: "ob-wchip" + (isFav ? " is-on" : ""),
        pressed: isFav ? "true" : "false",
        pick: () => {
          const nextFav = { ...state.fav };
          nextFav[symbol] = !isFav;
          self.setState({ fav: nextFav });
        },
      };
    }),
    summary: [
      {
        k: "Order routing",
        v:
          state.routing === "off"
            ? (VENUES.filter((venue) => venue.id === (state.prefVenue || "hyperliquid"))[0] || {})
                .name + " only"
            : "Smart routing",
      },
      { k: "App mode", v: isPropAccount ? "Prop" : "Pro" },
      { k: "Theme", v: (state.theme || "dark") === "light" ? "Light" : "Dark" },
      {
        k: "Watchlist",
        v: Object.keys(state.fav || {}).filter((symbol) => state.fav[symbol]).length + " markets",
      },
    ],
  };
  const termsDate = state.termsAt ? new Date(state.termsAt) : null;
  const monthNames4 = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const settings = {
    open: !!state.stOpen,
    openIt: () => {
      self.setState({ stOpen: true, profile: false });
    },
    close: () => {
      self.setState({ stOpen: false });
    },
    termsLine: termsDate
      ? "Terms, privacy and cookies accepted " +
        monthNames4[termsDate.getUTCMonth()] +
        " " +
        termsDate.getUTCDate() +
        ", " +
        termsDate.getUTCFullYear()
      : "Terms not yet accepted",
    replay: () => {
      self.setState({ stOpen: false, obOpen: true, obStep: 1 });
    },
  };
  function enterChartFullscreen() {
    self.setState({ chartFs: true, aiOpen: false });
    try {
      const rootEl: any = document.documentElement;
      const requestFullscreen = rootEl.requestFullscreen || rootEl.webkitRequestFullscreen;
      if (requestFullscreen) {
        const fullscreenResult = requestFullscreen.call(rootEl);
        function lockLandscape() {
          try {
            if (isMobile && screen.orientation && screen.orientation.lock) {
              screen.orientation.lock("landscape").catch(() => {});
            }
          } catch {}
        }
        if (fullscreenResult && fullscreenResult.then) {
          fullscreenResult.then(lockLandscape).catch(() => {});
        } else {
          lockLandscape();
        }
      }
    } catch {}
  }
  function exitChartFullscreen() {
    self.setState({ chartFs: false });
    try {
      if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      }
    } catch {}
    try {
      const fullscreenEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (fullscreenEl) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      }
    } catch {}
  }
  const celebration: any = { show: !!state.celebrate, bits: [] };
  if (state.celebrate) {
    const random2 = seededRandom(hashString("cel" + state.celebrate));
    const confettiColors = [
      "#2d63f5",
      "#d7303a",
      "var(--text)",
      "#6f97ff",
      "var(--text-3)",
      "#ff6166",
    ];
    for (var walkIndex = 0; walkIndex < 90; walkIndex++) {
      const bitWidth = 5 + Math.round(random2() * 7);
      const bitHeight = random2() < 0.5 ? bitWidth : Math.round(bitWidth * (0.4 + random2() * 0.5));
      celebration.bits.push({
        cls: "cel-bit" + (random2() < 0.3 ? " sway" : ""),
        st:
          "left: " +
          (random2() * 100).toFixed(1) +
          "%; width: " +
          bitWidth +
          "px; height: " +
          bitHeight +
          "px; background: " +
          confettiColors[walkIndex % confettiColors.length] +
          "; animation-delay: " +
          (random2() * 1.1).toFixed(2) +
          "s; animation-duration: " +
          (2.4 + random2() * 2).toFixed(2) +
          "s; --r: " +
          Math.round(360 + random2() * 900) +
          "deg; --x: " +
          Math.round((random2() - 0.5) * 160) +
          "px",
      });
    }
    celebration.sub =
      "You're all set" +
      (state.user ? ", " + state.user : ", kai.trades") +
      ". " +
      (isPropAccount ? "Prop mode" : "Pro mode") +
      ", " +
      (state.routing === "off"
        ? ((VENUES.filter((venue) => venue.id === state.prefVenue)[0] || {}).name || "one venue") +
          " only"
        : "smart routing on") +
      ".";
    celebration.close = () => {
      self.setState({ celebrate: null, celText: null });
    };
    celebration.title = state.celText ? "You're funded" : "Welcome to OpenFutures";
    if (state.celText) {
      celebration.sub = state.celText;
    }
  }
  const indicators = [
    { id: "ma20", name: "MA 20", desc: "Simple moving average", color: "#e5b75a", g: "o" },
    { id: "ma50", name: "MA 50", desc: "Simple moving average", color: "#b49cff", g: "o" },
    { id: "ema200", name: "EMA 200", desc: "Exponential moving average", color: "#4fd1b8", g: "o" },
    {
      id: "bb",
      name: "Bollinger Bands",
      desc: "20, 2 standard deviations",
      color: "#8b8b88",
      g: "o",
    },
    { id: "vwap", name: "VWAP", desc: "Volume weighted average price", color: "#f0a35a", g: "o" },
    { id: "vol", name: "Volume", desc: "Bars under the price", color: "#3b6ff6", g: "o" },
    {
      id: "rsi",
      name: "RSI 14",
      desc: "Relative strength, 70 and 30 lines",
      color: "#b49cff",
      g: "p",
    },
    { id: "macd", name: "MACD", desc: "12, 26, 9 with histogram", color: "#6f97ff", g: "p" },
  ];
  const activeIndicators = state.ind || { vol: true };
  const activeTool = state.taTool || "cursor";
  const drawingsBySymbol = state.draws || {};
  const symbolDrawings = drawingsBySymbol[market.sym] || [];
  const toolOptions = [
    ["cursor", "Pointer"],
    ["trend", "Trend line"],
    ["ray", "Ray"],
    ["hline", "Horizontal line"],
    ["fib", "Fibonacci retracement"],
    ["rect", "Rectangle"],
    ["measure", "Measure"],
  ];
  const toolIcons: any = {
    cursor: "↖",
    trend: "╱",
    ray: "↗",
    hline: "―",
    fib: "≡",
    rect: "▭",
    measure: "⇔",
  };
  const multiPointTools: any = { trend: 1, ray: 1, fib: 1, rect: 1, measure: 1 };
  var technicalAnalysis: any = {
    show: chartView === "price" && !self.props.tvWidget,
    menu: !!state.taMenu,
    menuStr: state.taMenu ? "true" : "false",
    toggleMenu: () => {
      self.setState({ taMenu: !state.taMenu });
    },
    indCls: "ta-ind" + (state.taMenu ? " is-open" : ""),
    count: String(indicators.filter((indicator) => activeIndicators[indicator.id]).length),
    groups: [
      ["o", "On the price"],
      ["p", "Below the price"],
    ].map((group) => ({
      title: group[1],
      items: indicators
        .filter((indicator) => indicator.g === group[0])
        .map((indicator) => {
          const isOn = !!activeIndicators[indicator.id];
          return {
            name: indicator.name,
            desc: indicator.desc,
            color: indicator.color,
            on: isOn ? "true" : "false",
            cls: "ta-mi" + (isOn ? " is-on" : ""),
            toggle: () => {
              const nextIndicators = { ...activeIndicators };
              nextIndicators[indicator.id] = !isOn;
              self.setState({ ind: nextIndicators });
            },
          };
        }),
    })),
    tools: toolOptions.map((tool) => {
      const isActive = activeTool === tool[0];
      return {
        label: tool[1],
        icon: toolIcons[tool[0]],
        cls: "ta-tool" + (isActive ? " is-on" : ""),
        pressed: isActive ? "true" : "false",
        pick: () => {
          self._taPend = null;
          self.setState({ taTool: tool[0], taMenu: false, taPend: false });
        },
      };
    }),
    noDraw: symbolDrawings.length === 0,
    clear: () => {
      const nextDrawings = { ...drawingsBySymbol };
      nextDrawings[market.sym] = [];
      self.setState({ draws: nextDrawings });
      showToast("Drawings removed from " + market.sym + "-PERP.");
    },
    hint:
      activeTool === "cursor"
        ? symbolDrawings.length
          ? symbolDrawings.length + " drawing" + (symbolDrawings.length > 1 ? "s" : "")
          : ""
        : state.taPend
          ? "Click the second point"
          : multiPointTools[activeTool]
            ? "Click the first point"
            : "Click a price level",
    hasHint: activeTool !== "cursor",
    legend: (self._taLegend || []).filter((entry: any) => activeIndicators[entry.id]),
  };
  self._taState = {
    ind: activeIndicators,
    tool: activeTool,
    draws: symbolDrawings,
    sym: market.sym,
    IND: indicators,
  };
  const rangeOptions = [
    ["1d", "15m", 96],
    ["5d", "4H", 30],
    ["1m", "1D", 30],
    ["3m", "1D", 90],
    ["6m", "1W", 26],
    ["1y", "1W", 52],
    ["All", "1W", 0],
  ];
  const rangeButtons = rangeOptions.map((range) => {
    const isActive = state.chRange === range[0];
    return {
      label: range[0],
      cls: "chf-b" + (isActive ? " is-on" : ""),
      pressed: isActive ? "true" : "false",
      pick: () => {
        self._rangeKey = null;
        self.setState({ tf: range[1], chRange: range[0] });
      },
    };
  });
  const priceScale = state.chScale || "normal";
  const isAutoScale = state.chAuto !== false;
  const scaleOptions = [
    ["pct", "%", "Percentage scale"],
    ["log", "log", "Logarithmic scale"],
    ["auto", "auto", "Fit the price scale automatically"],
  ].map((option) => {
    const isActive = option[0] === "auto" ? isAutoScale : priceScale === option[0];
    return {
      label: option[1],
      title: option[2],
      cls: "chf-b" + (isActive ? " is-on" : ""),
      pressed: isActive ? "true" : "false",
      pick: () => {
        if (option[0] === "auto") {
          self.setState({ chAuto: !isAutoScale });
        } else {
          self.setState({ chScale: priceScale === option[0] ? "normal" : option[0] });
        }
      },
    };
  });
  const nowDate = new Date(state.now);
  const clockText =
    pad2(nowDate.getUTCHours()) +
    ":" +
    pad2(nowDate.getUTCMinutes()) +
    ":" +
    pad2(nowDate.getUTCSeconds()) +
    " UTC";
  const activeRange = rangeOptions.filter((range) => range[0] === state.chRange)[0];
  if (self._tvData) {
    self._tvData.scale = priceScale;
    self._tvData.auto = isAutoScale;
    self._tvData.rangeBars = activeRange && activeRange[1] === state.tf ? activeRange[2] : null;
    self._tvData.rangeId = state.chRange || "";
  }
  var seriesLength = 180;
  const msPerDay = 86400000;
  const todayStartMs = Math.floor(state.now / msPerDay) * msPerDay;
  const shortMonthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  function formatDateNumeric(index: any) {
    const date = new Date(todayStartMs - (seriesLength - 1 - index) * msPerDay);
    return (
      date.getUTCMonth() +
      1 +
      "/" +
      date.getUTCDate() +
      "/" +
      String(date.getUTCFullYear()).slice(2)
    );
  }
  function formatDateShort(index: any) {
    const date = new Date(todayStartMs - (seriesLength - 1 - index) * msPerDay);
    return shortMonthNames[date.getUTCMonth()] + " " + date.getUTCDate();
  }
  function generateSeries(seed: any, endValue: any, drift: any, volatility: any, hasSpikes?: any) {
    const cacheKey = [seed, endValue, drift, volatility, !!hasSpikes, seriesLength].join("|");
    const cached = seriesCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    if (seriesCache.size > 2000) {
      seriesCache.clear();
    }
    const series = buildSeries(seed, endValue, drift, volatility, hasSpikes);
    seriesCache.set(cacheKey, series);
    return series;
  }
  function buildSeries(seed: any, endValue: any, drift: any, volatility: any, hasSpikes?: any) {
    const random2 = seededRandom(hashString(seed));
    const series = new Array(seriesLength);
    let walk = 0;
    const walkPoints = [];
    for (let step = 0; step < seriesLength; step++) {
      walk += (random2() - 0.5) * volatility;
      walkPoints.push(walk);
    }
    for (let pointIndex = 0; pointIndex < seriesLength; pointIndex++) {
      const daysAgo = seriesLength - 1 - pointIndex;
      let factor = Math.exp(
        -daysAgo * drift + walkPoints[pointIndex] - walkPoints[seriesLength - 1],
      );
      if (hasSpikes && random2() < 0.05) {
        factor *= 1.6 + random2() * 1.8;
      }
      series[pointIndex] = endValue * factor;
    }
    series[seriesLength - 1] = endValue;
    return series;
  }
  const categoryColors = [
    ["Crypto", "#3b6ff6"],
    ["Stocks", "#e5b75a"],
    ["Indices", "#4fd1b8"],
    ["Commodities", "#f0a35a"],
    ["Forex", "#b49cff"],
  ];
  const categoryTotals: any = {};
  const venueTotals: any = {};
  categoryColors.forEach((category) => {
    categoryTotals[category[0]] = { oi: 0, vol: 0 };
  });
  VENUES.forEach((venue) => {
    venueTotals[venue.id] = { oi: 0, vol: 0, liq: 0, fsum: 0, fw: 0, longs: 0, top: null, mk: 0 };
  });
  MARKETS.forEach((market2) => {
    const marketStats2 = getMarketStats2(market2);
    const marketOi = marketStats2.w0.oi;
    const marketVol = marketStats2.w0.vol;
    const categoryTotal = (categoryTotals[market2.cat] ||= { oi: 0, vol: 0 });
    categoryTotal.oi += marketOi;
    categoryTotal.vol += marketVol;
    marketStats2.vm.forEach((venueShare: any) => {
      const venueTotal = venueTotals[venueShare.v.id];
      if (venueTotal) {
        const venueOi = marketOi * venueShare.sh;
        venueTotal.oi += venueOi;
        venueTotal.vol += marketVol * venueShare.sh;
        venueTotal.fsum += venueShare.fh * venueOi;
        venueTotal.fw += venueOi;
        venueTotal.mk += 1;
        if (!venueTotal.top || venueOi > venueTotal.top.oi) {
          venueTotal.top = { x: market2, oi: venueOi };
        }
      }
    });
  });
  const activeTab = watchView;
  const metric2 = (state.mwMetric || {})[activeTab] || (activeTab === "funding" ? "venue" : "oi");
  const segment = (state.mwSeg || {})[activeTab] || (activeTab === "markets" ? "cat" : "venue");
  const chartType = state.mwType || "area";
  const hiddenSeries = (state.mwOff || {})[activeTab + segment + metric2] || {};
  let rows2: any[] = [];
  if (activeTab === "funding") {
    if (metric2 === "venue") {
      VENUES.forEach((venue: any) => {
        const venueStats = venueTotals[venue.id];
        const annualFunding = venueStats.fw ? (venueStats.fsum / venueStats.fw) * 24 * 365 : 0;
        const fundingNoise = generateSeries("fv" + venue.id, 1, 0, 0.035);
        rows2.push({
          name: venue.name,
          color: VENUE_COLORS[venue.id],
          logo: venue.logo,
          data: fundingNoise.map((noise, dayIdx) => {
            const daysAgo = seriesLength - 1 - dayIdx;
            return (
              annualFunding *
              (1 + Math.sin(daysAgo / 14 + venue.name.length) * 0.18 * Math.min(1, daysAgo / 20)) *
              noise
            );
          }),
        });
      });
    } else {
      categoryColors.forEach((category) => {
        const categoryMarkets = MARKETS.filter((market2) => market2.cat === category[0]);
        const avgFunding =
          (categoryMarkets.reduce((total, marketItem) => {
            const marketData = getMarketStats2(marketItem);
            return (
              total +
              marketData.vm.reduce((sum: any, quote: any) => sum + quote.fh, 0) /
                marketData.vm.length
            );
          }, 0) /
            (categoryMarkets.length || 1)) *
          24 *
          365;
        rows2.push({
          name: category[0],
          color: category[1],
          data: generateSeries("fc" + category[0], 1, 0, 0.03).map((noise, dayIdx) => {
            const daysAgo = seriesLength - 1 - dayIdx;
            return (
              avgFunding *
              (1 + Math.sin(daysAgo / 16 + category[0].length) * 0.2 * Math.min(1, daysAgo / 20)) *
              noise
            );
          }),
        });
      });
    }
  } else if (activeTab === "exchanges" || segment === "venue") {
    VENUES.forEach((venue: any) => {
      const venueStats = venueTotals[venue.id];
      const metricValue =
        metric2 === "vol"
          ? venueStats.vol
          : metric2 === "liq"
            ? venueStats.vol * 0.012
            : venueStats.oi;
      rows2.push({
        name: venue.name,
        color: VENUE_COLORS[venue.id],
        logo: venue.logo,
        data: generateSeries(
          "mv" + venue.id + metric2,
          metricValue,
          venueMeta[venue.id].type === "DEX" ? 0.0062 : 0.0031,
          metric2 === "oi" ? 0.035 : 0.09,
          metric2 === "liq",
        ),
      });
    });
  } else {
    categoryColors.forEach((category) => {
      const categoryStats = categoryTotals[category[0]] || { oi: 0, vol: 0 };
      const metricValue =
        metric2 === "vol"
          ? categoryStats.vol
          : metric2 === "liq"
            ? categoryStats.vol * 0.012
            : categoryStats.oi;
      rows2.push({
        name: category[0],
        color: category[1],
        data: generateSeries(
          "mc" + category[0] + metric2,
          metricValue,
          category[0] === "Crypto" ? 0.003 : 0.0068,
          metric2 === "oi" ? 0.03 : 0.09,
          metric2 === "liq",
        ),
      });
    });
  }
  if (activeTab === "exchanges" && metric2 === "share") {
    const totalsByDay: any[] = [];
    for (var dayIndex2 = 0; dayIndex2 < seriesLength; dayIndex2++) {
      totalsByDay.push(rows2.reduce((sum, series) => sum + series.data[dayIndex2], 0) || 1);
    }
    rows2 = rows2.map((series) => ({
      ...series,
      data: series.data.map((value: any, dayIdx: any) => (value / totalsByDay[dayIdx]) * 100),
    }));
  }
  const isFunding = activeTab === "funding";
  const isShare = activeTab === "exchanges" && metric2 === "share";
  function formatValue(value: any) {
    if (isFunding) {
      return (value >= 0 ? "+" : "") + value.toFixed(2) + "%";
    } else if (isShare) {
      return value.toFixed(1) + "%";
    } else {
      return "$" + formatCompact(value);
    }
  }
  const windowRange = (state.mwWin || {})[activeTab] || [0.5, 1];
  const startIndex = Math.round(windowRange[0] * (seriesLength - 1));
  const endIndex = Math.max(startIndex + 6, Math.round(windowRange[1] * (seriesLength - 1)));
  const visibleSeries = rows2.filter((series) => !hiddenSeries[series.name]);
  const visibleDays = endIndex - startIndex + 1;
  function toX(index: any) {
    return ((index - startIndex) / (visibleDays - 1)) * 1000;
  }
  let minValue2 = 0;
  let maxValue2 = 0;
  if (isFunding) {
    visibleSeries.forEach((series) => {
      for (let dayIdx = startIndex; dayIdx <= endIndex; dayIdx++) {
        minValue2 = Math.min(minValue2, series.data[dayIdx]);
        maxValue2 = Math.max(maxValue2, series.data[dayIdx]);
      }
    });
  } else {
    for (var dayCursor = startIndex; dayCursor <= endIndex; dayCursor++) {
      maxValue2 = Math.max(
        maxValue2,
        visibleSeries.reduce((sum, series) => sum + series.data[dayCursor], 0),
      );
    }
  }
  function niceStep2(range: any) {
    const magnitude = Math.pow(10, Math.floor(Math.log10(range / 4 || 1)));
    const normalized = range / 4 / magnitude;
    return (normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10) * magnitude;
  }
  let tickStep = niceStep2(maxValue2 - minValue2 || 1);
  let axisMin = isFunding ? Math.floor(minValue2 / tickStep) * tickStep : 0;
  let axisMax = Math.ceil((maxValue2 * 1.04) / tickStep) * tickStep || tickStep;
  if (isShare) {
    axisMin = 0;
    axisMax = 100;
    tickStep = 25;
  }
  function toY(value: any) {
    return 8 + ((axisMax - value) / (axisMax - axisMin)) * 272;
  }
  const chartPaths: any[] = [];
  const stackBase = new Array(seriesLength).fill(0);
  if (isFunding) {
    visibleSeries.forEach((series) => {
      let pathData = "";
      for (let dayIdx = startIndex; dayIdx <= endIndex; dayIdx++) {
        pathData +=
          (dayIdx === startIndex ? "M" : "L") +
          toX(dayIdx).toFixed(1) +
          " " +
          toY(series.data[dayIdx]).toFixed(1);
      }
      chartPaths.push({ d: pathData, fill: "none", stroke: series.color, sw: "2" });
    });
  } else if (chartType === "bar") {
    const barStride = Math.max(1, Math.ceil(visibleDays / 36));
    var perfBarWidth = 1000 / Math.ceil(visibleDays / barStride);
    visibleSeries.forEach((series) => {
      let pathData = "";
      for (let barIdx = 0, dayIdx = startIndex; dayIdx <= endIndex; dayIdx += barStride, barIdx++) {
        const yBottom = toY(stackBase[dayIdx]);
        const yTop = toY(stackBase[dayIdx] + series.data[dayIdx]);
        pathData +=
          "M" +
          (barIdx * perfBarWidth + perfBarWidth * 0.12).toFixed(1) +
          " " +
          yBottom.toFixed(1) +
          "V" +
          yTop.toFixed(1) +
          "H" +
          (barIdx * perfBarWidth + perfBarWidth * 0.88).toFixed(1) +
          "V" +
          yBottom.toFixed(1) +
          "Z";
        stackBase[dayIdx] += series.data[dayIdx];
      }
      chartPaths.push({ d: pathData, fill: series.color, stroke: "none", sw: "0", op: "0.9" });
    });
  } else {
    visibleSeries.forEach((series) => {
      let topPath = "";
      let returnPath = "";
      for (let forwardIdx = startIndex; forwardIdx <= endIndex; forwardIdx++) {
        topPath +=
          (forwardIdx === startIndex ? "M" : "L") +
          toX(forwardIdx).toFixed(1) +
          " " +
          toY(stackBase[forwardIdx] + series.data[forwardIdx]).toFixed(1);
      }
      for (let backIdx = endIndex; backIdx >= startIndex; backIdx--) {
        returnPath += "L" + toX(backIdx).toFixed(1) + " " + toY(stackBase[backIdx]).toFixed(1);
      }
      const strokePath = topPath;
      for (let stackIdx = startIndex; stackIdx <= endIndex; stackIdx++) {
        stackBase[stackIdx] += series.data[stackIdx];
      }
      chartPaths.push({
        d: topPath + returnPath + "Z",
        fill: series.color,
        stroke: "none",
        sw: "0",
        op: "0.55",
      });
      chartPaths.push({ d: strokePath, fill: "none", stroke: series.color, sw: "1.5", op: "1" });
    });
  }
  chartPaths.forEach((path) => {
    if (path.op == null) {
      path.op = "1";
    }
  });
  const yTicks = [];
  for (let tickValue = axisMin; tickValue <= axisMax + 1e-9; tickValue += tickStep) {
    yTicks.push({
      y: (toY(tickValue) / 2.88).toFixed(2),
      label: isFunding
        ? (tickValue >= 0 ? "+" : "") +
          (Math.abs(tickValue) < 1e-9 ? "0" : tickValue.toFixed(tickStep < 1 ? 1 : 0)) +
          "%"
        : isShare
          ? tickValue + "%"
          : "$" + formatCompact(tickValue),
    });
  }
  const xTicks = [];
  for (let tickSlot = 0; tickSlot < 5; tickSlot++) {
    const tickIndex = Math.round(startIndex + ((visibleDays - 1) * tickSlot) / 4);
    xTicks.push({
      x: (toX(tickIndex) / 10).toFixed(2),
      label: formatDateShort(tickIndex),
      cls: tickSlot === 0 ? "first" : tickSlot === 4 ? "last" : "",
    });
  }
  const hoverIndex3 =
    state.mwHover != null &&
    state.mwHover >= startIndex &&
    state.mwHover <= endIndex &&
    state.mwHoverView === activeTab
      ? state.mwHover
      : null;
  let tooltip: any = { show: hoverIndex3 != null };
  if (hoverIndex3 != null) {
    const tipRows = visibleSeries
      .map((series) => ({
        name: series.name,
        color: series.color,
        raw: series.data[hoverIndex3],
        val: formatValue(series.data[hoverIndex3]),
      }))
      .sort((a, b) => b.raw - a.raw);
    const tipTotal = tipRows.reduce((sum, row) => sum + row.raw, 0);
    const tipLeftPct = toX(hoverIndex3) / 10;
    tooltip = {
      show: true,
      date: formatDateNumeric(hoverIndex3),
      total: isFunding
        ? "Avg " + formatValue(tipTotal / (tipRows.length || 1))
        : isShare
          ? "100%"
          : formatValue(tipTotal),
      rows: tipRows,
      left: tipLeftPct.toFixed(2),
      side: tipLeftPct > 55 ? "side-l" : "side-r",
      vline: (toX(hoverIndex3) / 10).toFixed(2),
    };
  }
  const dailyTotals = [];
  for (var seriesIndex = 0; seriesIndex < seriesLength; seriesIndex++) {
    dailyTotals.push(
      rows2.reduce(
        (sum, series: any) =>
          sum + (isFunding ? series.data[seriesIndex] / rows2.length : series.data[seriesIndex]),
        0,
      ),
    );
  }
  const totalsMin = Math.min.apply(null, dailyTotals);
  const totalsMax = Math.max.apply(null, dailyTotals);
  let miniLine = "";
  dailyTotals.forEach((value, dayIdx) => {
    miniLine +=
      (dayIdx ? "L" : "M") +
      ((dayIdx / (seriesLength - 1)) * 1000).toFixed(1) +
      " " +
      (36 - ((value - totalsMin) / (totalsMax - totalsMin || 1)) * 30).toFixed(1);
  });
  const miniArea = miniLine + "L1000 40L0 40Z";
  function setWindow(start: any, end: any) {
    const nextWindows = { ...state.mwWin };
    nextWindows[activeTab] = [
      Math.max(0, Math.min(start, end - 0.04)),
      Math.min(1, Math.max(end, start + 0.04)),
    ];
    self.setState({ mwWin: nextWindows });
  }
  function makeSelectHandler(stateKey: any, selection: any) {
    return () => {
      const nextMap = { ...state[stateKey] };
      nextMap[activeTab] = selection;
      const patch: any = {};
      patch[stateKey] = nextMap;
      patch.mwHover = null;
      self.setState(patch);
    };
  }
  const metricOptions =
    activeTab === "funding"
      ? [
          ["venue", "Venue"],
          ["cat", "Asset Class"],
        ]
      : activeTab === "exchanges"
        ? [
            ["oi", "Open Interest"],
            ["vol", "24h Volume"],
            ["share", "Share of OI"],
            ["liq", "Liquidations"],
          ]
        : [
            ["oi", "Open Interest"],
            ["vol", "24h Volume"],
            ["liq", "Liquidations"],
          ];
  const latestTotal = visibleSeries.reduce((sum, series) => sum + series.data[seriesLength - 1], 0);
  const chart2 = {
    title:
      activeTab === "funding"
        ? "Annualized Funding Rates"
        : activeTab === "exchanges"
          ? metric2 === "share"
            ? "Share of Open Interest by Venue"
            : (metric2 === "vol"
                ? "24h Volume"
                : metric2 === "liq"
                  ? "Liquidations"
                  : "Open Interest") + " by Venue"
          : metric2 === "vol"
            ? "Total 24h Volume"
            : metric2 === "liq"
              ? "Total Liquidations"
              : "Total Open Interest",
    headline: isFunding || isShare ? "" : formatValue(latestTotal),
    metricLbl: activeTab === "funding" ? "Group by" : "Metric",
    metrics: metricOptions.map((option) => {
      const isOn = metric2 === option[0];
      return {
        label: option[1],
        cls: "mwc-opt" + (isOn ? " is-on" : ""),
        pressed: isOn ? "true" : "false",
        pick: makeSelectHandler("mwMetric", option[0]),
      };
    }),
    hasSeg: activeTab === "markets",
    segs: [
      ["cat", "Asset Class"],
      ["venue", "Venue"],
    ].map((option) => {
      const isOn = segment === option[0];
      return {
        label: option[1],
        cls: "mwc-opt" + (isOn ? " is-on" : ""),
        pressed: isOn ? "true" : "false",
        pick: makeSelectHandler("mwSeg", option[0]),
      };
    }),
    hasType: !isFunding,
    types: [
      ["area", "Area"],
      ["bar", "Bar"],
    ].map((option) => {
      const isOn = chartType === option[0];
      return {
        // The chart-type icons are drawn on a baseline, unlike the shared area/bar icons.
        ic:
          option[0] === "area" ? "M3 20h18M3 16l5-6 4 3 4-6 5 5v8H3z" : "M6 20V12M12 20V6M18 20v-9",
        label: option[1],
        cls: "mwc-type" + (isOn ? " is-on" : ""),
        pressed: isOn ? "true" : "false",
        pick: () => {
          self.setState({ mwType: option[0] });
        },
      };
    }),
    legend: rows2.map((series) => {
      const isHidden = !!hiddenSeries[series.name];
      return {
        name: series.name,
        color: series.color,
        cls: "mwc-lg" + (isHidden ? " is-off" : ""),
        pressed: isHidden ? "false" : "true",
        toggle: () => {
          const offMap = { ...state.mwOff };
          const seriesOff = { ...offMap[activeTab + segment + metric2] };
          seriesOff[series.name] = !isHidden;
          if (!rows2.every((seriesItem) => seriesOff[seriesItem.name])) {
            offMap[activeTab + segment + metric2] = seriesOff;
            self.setState({ mwOff: offMap });
          }
        },
      };
    }),
    paths: chartPaths,
    yTicks: yTicks,
    xTicks: xTicks,
    zeroY: isFunding ? (toY(0) / 2.88).toFixed(2) : "",
    hasZero: isFunding,
    tip: tooltip,
    move: (e: any) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const hoverIdx = Math.round(startIndex + ratio * (visibleDays - 1));
      if (self._mwH !== hoverIdx || state.mwHoverView !== activeTab) {
        self._mwH = hoverIdx;
        self.setState({ mwHover: hoverIdx, mwHoverView: activeTab });
      }
    },
    leave: (e: any) => {
      if (!e || e.pointerType !== "touch") {
        self._mwH = null;
        self.setState({ mwHover: null });
      }
    },
    mini: miniLine,
    miniArea: miniArea,
    winL: (windowRange[0] * 100).toFixed(2),
    winW: ((windowRange[1] - windowRange[0]) * 100).toFixed(2),
    bDown: (e: any) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      let winStart = windowRange[0];
      let winEnd = windowRange[1];
      let dragMode =
        Math.abs(ratio - winStart) < 0.025
          ? "l"
          : Math.abs(ratio - winEnd) < 0.025
            ? "r"
            : ratio > winStart && ratio < winEnd
              ? "m"
              : "n";
      if (dragMode === "n") {
        const span = winEnd - winStart;
        winStart = Math.max(0, Math.min(1 - span, ratio - span / 2));
        setWindow(winStart, winStart + span);
        dragMode = "m";
        winEnd = winStart + span;
      }
      self._brush = {
        mode: dragMode,
        f0: ratio,
        a: winStart,
        b: winEnd,
        w: rect.width,
        l: rect.left,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    },
    bMove: (e: any) => {
      const brush = self._brush;
      if (brush) {
        const ratio = (e.clientX - brush.l) / brush.w;
        const delta = ratio - brush.f0;
        if (brush.mode === "l") {
          setWindow(Math.max(0, brush.a + delta), brush.b);
        } else if (brush.mode === "r") {
          setWindow(brush.a, Math.min(1, brush.b + delta));
        } else {
          const span = brush.b - brush.a;
          const newStart = Math.max(0, Math.min(1 - span, brush.a + delta));
          setWindow(newStart, newStart + span);
        }
      }
    },
    bUp: () => {
      self._brush = null;
    },
    ranges: [
      ["1M", 30],
      ["3M", 90],
      ["6M", 180],
    ].map((range: any) => {
      const isActive =
        Math.abs((windowRange[1] - windowRange[0]) * (seriesLength - 1) - (range[1] - 1)) < 2 &&
        windowRange[1] > 0.995;
      return {
        label: range[0],
        cls: "mwc-r" + (isActive ? " is-on" : ""),
        pick: () => {
          setWindow(1 - (range[1] - 1) / (seriesLength - 1), 1);
        },
      };
    }),
    rangeText: formatDateShort(startIndex) + " to " + formatDateShort(endIndex),
    copy: () => {
      const headerRow = ["Date"].concat(visibleSeries.map((series) => series.name)).join(",");
      const csvLines = [headerRow];
      for (var dayIdx = startIndex; dayIdx <= endIndex; dayIdx++) {
        csvLines.push(
          [formatDateNumeric(dayIdx)]
            .concat(
              visibleSeries.map((series) => {
                if (isFunding || isShare) {
                  return series.data[dayIdx].toFixed(4);
                } else {
                  return Math.round(series.data[dayIdx]);
                }
              }),
            )
            .join(","),
        );
      }
      const copied = navigator.clipboard
        ? navigator.clipboard.writeText(csvLines.join("\n"))
        : Promise.reject(new Error("Clipboard unavailable"));
      copied.then(
        () => showToast("CSV for " + visibleDays + " days copied to the clipboard."),
        () => showToast("Couldn't copy the CSV. Check clipboard permissions and try again."),
      );
    },
  };
  function pctChange30d(values: any) {
    const past = values[seriesLength - 31];
    const latest = values[seriesLength - 1];
    if (past) {
      return ((latest - past) / Math.abs(past)) * 100;
    } else {
      return 0;
    }
  }
  function sumSeries(seriesList: any) {
    const totals = new Array(seriesLength).fill(0);
    seriesList.forEach((series: any) => {
      series.data.forEach((value: any, dayIdx: any) => {
        totals[dayIdx] += value;
      });
    });
    return totals;
  }
  function sparkPath(values: any) {
    if (!values) {
      return "";
    }
    const recent = values.slice(-60);
    const minValue = Math.min.apply(null, recent);
    const maxValue = Math.max.apply(null, recent);
    let pathData = "";
    recent.forEach((value: any, idx: any) => {
      pathData +=
        (idx ? "L" : "M") +
        ((idx / (recent.length - 1)) * 100).toFixed(1) +
        " " +
        (22 - ((value - minValue) / (maxValue - minValue || 1)) * 18).toFixed(1);
    });
    return pathData;
  }
  function buildKpi(
    label: any,
    help: any,
    value: any,
    changePct: any,
    subText?: any,
    sparkData?: any,
  ) {
    const isUp = changePct >= 0;
    return {
      spark: sparkPath(sparkData),
      hasSpark: !!sparkData,
      sparkCol:
        sparkData && sparkData[sparkData.length - 1] < sparkData[sparkData.length - 31]
          ? "var(--c-dn)"
          : "var(--c-up)",
      label: label,
      help: help,
      value: value,
      hasChg: changePct != null,
      chg: changePct == null ? "" : (isUp ? "▲ " : "▼ ") + Math.abs(changePct).toFixed(2) + "%",
      chgCls: isUp ? "up" : "down",
      sub: subText || "from 30d ago",
    };
  }
  const oiTotals = sumSeries(
    categoryColors.map((category) => ({
      data: generateSeries(
        "mc" + category[0] + "oi",
        (categoryTotals[category[0]] || { oi: 0 }).oi,
        category[0] === "Crypto" ? 0.003 : 0.0068,
        0.03,
      ),
    })),
  );
  const volumeTotals = sumSeries(
    categoryColors.map((category) => ({
      data: generateSeries(
        "mc" + category[0] + "vol",
        (categoryTotals[category[0]] || { vol: 0 }).vol,
        category[0] === "Crypto" ? 0.003 : 0.0068,
        0.09,
      ),
    })),
  );
  const liquidationSeries = generateSeries("liqk", 1, 0.001, 0.12, true);
  const totalOi2 = VENUES.reduce((sum, venue) => sum + venueTotals[venue.id].oi, 0);
  const totalVolume3 = VENUES.reduce((sum, venue) => sum + venueTotals[venue.id].vol, 0);
  const dexOi = VENUES.filter((venue) => venueMeta[venue.id].type === "DEX").reduce(
    (sum, venue) => sum + venueTotals[venue.id].oi,
    0,
  );
  const topVenue = VENUES.slice().sort((a, b) => venueTotals[b.id].oi - venueTotals[a.id].oi)[0];
  const weightedFundingApr2 =
    (VENUES.reduce((sum, venue) => sum + venueTotals[venue.id].fsum, 0) / (totalOi2 || 1)) *
    24 *
    365;
  const longsPayingCount = MARKETS.filter((market2) => {
    const marketData = getMarketStats2(market2);
    return marketData.vm.reduce((sum: any, quote: any) => sum + quote.fh, 0) > 0;
  }).length;
  const spreadRows = MARKETS.map((market2) => {
    const marketData = getMarketStats2(market2);
    const quotesByFunding = marketData.vm.slice().sort((a: any, b: any) => a.fh - b.fh);
    return {
      x: market2,
      lo: quotesByFunding[0],
      hi: quotesByFunding[quotesByFunding.length - 1],
      apr: marketData.fSpread * 24 * 365,
    };
  }).sort((a, b) => b.apr - a.apr);
  const sortedLatencies = VENUES.map((venue) => venueMeta[venue.id].lat).sort((a, b) => a - b);
  const kpis =
    activeTab === "markets"
      ? [
          buildKpi(
            "Open Interest",
            "Value of all open perpetual positions across every venue OpenFutures routes to.",
            "$" + formatCompact(totalOi2),
            pctChange30d(oiTotals),
            null,
            oiTotals,
          ),
          buildKpi(
            "24h Volume",
            "Notional traded in the last 24 hours across all venues.",
            "$" + formatCompact(totalVolume3),
            pctChange30d(volumeTotals),
            null,
            volumeTotals,
          ),
          buildKpi(
            "Liquidations, 24h",
            "Positions force-closed in the last 24 hours.",
            "$" + formatCompact(totalVolume3 * 0.012),
            pctChange30d(liquidationSeries),
            null,
            liquidationSeries,
          ),
          buildKpi(
            "Funding APR",
            "Open-interest-weighted average funding rate, annualized. Positive means longs pay shorts.",
            (weightedFundingApr2 >= 0 ? "+" : "") + weightedFundingApr2.toFixed(2) + "%",
            null,
            "Weighted by open interest",
          ),
          buildKpi(
            "Markets Live",
            "Perpetual markets currently quoting on at least one venue.",
            String(MARKETS.length),
            null,
            VENUES.length + " venues connected",
          ),
        ]
      : activeTab === "exchanges"
        ? [
            buildKpi(
              "DEX Share of OI",
              "Share of open interest held on on-chain venues.",
              ((dexOi / (totalOi2 || 1)) * 100).toFixed(1) + "%",
              4.2,
              "points from 30d ago",
            ),
            buildKpi(
              "Leading Venue",
              "The venue with the most open interest right now.",
              topVenue.name,
              null,
              ((venueTotals[topVenue.id].oi / (totalOi2 || 1)) * 100).toFixed(1) + "% of all OI",
            ),
            buildKpi(
              "Volume to OI",
              "Daily turnover: 24h volume divided by open interest. Higher means more active trading.",
              (totalVolume3 / (totalOi2 || 1)).toFixed(2) + "x",
              ((1 + pctChange30d(volumeTotals) / 100) / (1 + pctChange30d(oiTotals) / 100) - 1) *
                100,
            ),
            buildKpi(
              "Median Feed Latency",
              "Median time for a price update to reach OpenFutures.",
              sortedLatencies[Math.floor(sortedLatencies.length / 2)] + " ms",
              null,
              "Fastest " + sortedLatencies[0] + " ms",
            ),
            buildKpi(
              "Markets Listed",
              "Unique market listings across all venues.",
              String(VENUES.reduce((sum, venue) => sum + venueTotals[venue.id].mk, 0)),
              null,
              "Across " + VENUES.length + " venues",
            ),
          ]
        : [
            buildKpi(
              "Funding APR",
              "Open-interest-weighted average funding rate, annualized.",
              (weightedFundingApr2 >= 0 ? "+" : "") + weightedFundingApr2.toFixed(2) + "%",
              null,
              "Positive: longs pay shorts",
            ),
            buildKpi(
              "Longs Paying",
              "Markets where the average rate across venues is positive.",
              longsPayingCount + " of " + MARKETS.length,
              null,
              "markets right now",
            ),
            buildKpi(
              "Widest Spread",
              "Largest gap between the cheapest and most expensive venue for the same market.",
              spreadRows[0].apr.toFixed(1) + "%",
              null,
              spreadRows[0].x.sym + "-PERP, annualized",
            ),
            buildKpi(
              "Best Carry on $10K",
              "Estimated yearly funding collected on $10,000 by going long on the cheapest venue and short on the priciest.",
              "$" + Math.round(spreadRows[0].apr * 100).toLocaleString("en-US"),
              null,
              "Before fees and price risk",
            ),
            buildKpi(
              "Venues Quoting",
              "Venues with live funding data.",
              VENUES.filter((venue) => venueMeta[venue.id].ok).length + " of " + VENUES.length,
              null,
              "feeds live",
            ),
          ];
  const exchangeCards = VENUES.slice()
    .sort((a, b) => venueTotals[b.id].oi - venueTotals[a.id].oi)
    .map((venue: any, rankIdx: number) => {
      const stats = venueTotals[venue.id];
      const random2 = seededRandom(hashString("exc" + venue.id));
      const oiSeries = generateSeries(
        "mv" + venue.id + "oi",
        stats.oi,
        venueMeta[venue.id].type === "DEX" ? 0.0062 : 0.0031,
        0.035,
      );
      const oiChange = pctChange30d(oiSeries);
      const oiShare = (stats.oi / (totalOi2 || 1)) * 100;
      const longShortRatio = 0.85 + random2() * 0.5;
      const fundingApr = stats.fw ? (stats.fsum / stats.fw) * 24 * 365 : 0;
      let sparkPath2 = "";
      const seriesMin = Math.min.apply(null, oiSeries.slice(seriesLength - 60));
      const seriesMax = Math.max.apply(null, oiSeries.slice(seriesLength - 60));
      for (let dayIdx = seriesLength - 60; dayIdx < seriesLength; dayIdx++) {
        sparkPath2 +=
          (dayIdx === seriesLength - 60 ? "M" : "L") +
          (((dayIdx - (seriesLength - 60)) / 59) * 100).toFixed(1) +
          " " +
          (26 - ((oiSeries[dayIdx] - seriesMin) / (seriesMax - seriesMin || 1)) * 22).toFixed(1);
      }
      return {
        name: venue.name,
        logo: venue.logo,
        type: venueMeta[venue.id].type,
        oi: "$" + formatCompact(stats.oi),
        chg: (oiChange >= 0 ? "▲ " : "▼ ") + Math.abs(oiChange).toFixed(1) + "%",
        chgCls: oiChange >= 0 ? "up" : "down",
        vol: "$" + formatCompact(stats.vol),
        share: oiShare.toFixed(1) + "%",
        shareW: Math.max(2, oiShare).toFixed(1),
        color: VENUE_COLORS[venue.id],
        ls: longShortRatio.toFixed(2),
        lsCls: longShortRatio >= 1 ? "up" : "down",
        // The label carries the unit ("Funding, APR (%)"), so the value has no % sign.
        funding: (fundingApr >= 0 ? "+" : "") + fundingApr.toFixed(1),
        fundCls: fundingApr >= 0 ? "up" : "down",
        liq: "$" + formatCompact(stats.vol * (0.008 + random2() * 0.01)),
        turn: (stats.vol / (stats.oi || 1)).toFixed(2) + "x",
        top: stats.top ? stats.top.x.sym : "",
        topLogo: stats.top ? LOGOS[stats.top.x.sym.toLowerCase()] : "",
        spark: sparkPath2,
        sparkCol: oiChange >= 0 ? "var(--c-up)" : "var(--c-dn)",
        markets: stats.mk,
        // Filled area under the open-interest sparkline.
        area: sparkPath2 + "L100 28L0 28Z",
        rank: "#" + (rankIdx + 1) + " of " + VENUES.length,
        // One plain-language sentence summing up the venue.
        headline:
          (rankIdx === 0 ? "The largest venue. " : "") +
          "Open interest is " +
          (oiChange >= 0 ? "up " : "down ") +
          Math.abs(oiChange).toFixed(1) +
          "% in 30 days, " +
          (longShortRatio > 1.05
            ? "more traders are long"
            : longShortRatio < 0.95
              ? "more traders are short"
              : "longs and shorts are balanced") +
          ", and " +
          (fundingApr >= 0 ? "longs pay shorts " : "shorts pay longs ") +
          Math.abs(fundingApr).toFixed(1) +
          "% a year.",
        latLabel:
          (venueMeta[venue.id].ok ? "Live, " : "Delayed, ") + venueMeta[venue.id].lat + " ms",
        latChip: "exc-live" + (venueMeta[venue.id].ok ? "" : " slow"),
      };
    });
  const carryRows = spreadRows
    .filter((row) => !state.cyCat || row.x.cat === state.cyCat)
    .slice(0, 6)
    .map((row) => ({
      sym: row.x.sym,
      logo: LOGOS[row.x.sym.toLowerCase()],
      longName: row.lo.v.name,
      longLogo: row.lo.v.logo,
      shortName: row.hi.v.name,
      shortLogo: row.hi.v.logo,
      apr: row.apr.toFixed(1) + "%",
      est: "$" + Math.round(row.apr * 100).toLocaleString("en-US"),
      longRate: (row.lo.fh * 24 * 365 >= 0 ? "+" : "") + (row.lo.fh * 24 * 365).toFixed(1) + "%",
      shortRate: (row.hi.fh * 24 * 365 >= 0 ? "+" : "") + (row.hi.fh * 24 * 365).toFixed(1) + "%",
      trade: () => {
        self.setState({ screen: "detail" });
        makeSelectMarket(row.x.sym)();
      },
    }));
  const marketWatch: any = { kpis: kpis, chart: chart2, exCards: exchangeCards, carry: carryRows };
  const dayCount = 365;
  const todayStartMs2 = Math.floor(state.now / 86400000) * 86400000;
  function formatDayLabel(dayIdx: any) {
    const date = new Date(todayStartMs2 - (dayCount - 1 - dayIdx) * 86400000);
    return (
      date.getUTCMonth() +
      1 +
      "/" +
      date.getUTCDate() +
      "/" +
      String(date.getUTCFullYear()).slice(2)
    );
  }
  const perfSymbols = [
    "BTC",
    "ETH",
    "SOL",
    "HYPE",
    "NVDA",
    "TSLA",
    "US500",
    "XAU",
    "WTI",
    "EURUSD",
  ];
  const perfColors = [
    "#e5b75a",
    "#7ea0ff",
    "#4fd1b8",
    "#2bb3a3",
    "#9ccc65",
    "#e5484d",
    "#c9c9c7",
    "#f0a35a",
    "#b49cff",
    "#6f97ff",
  ];
  const dailyVolByCategory: any = {
    Crypto: 0.035,
    Stocks: 0.02,
    Indices: 0.009,
    Commodities: 0.014,
    Forex: 0.004,
  };
  const perfSeries = perfSymbols
    .filter((sym) => {
      const market2 = findMarket(sym);
      return market2 && (!state.pfCat || market2.cat === state.pfCat);
    })
    .map((sym, index) => {
      const colorIdx = perfSymbols.indexOf(sym);
      const market2 = findMarket(sym);
      if (!market2) {
        return null;
      }
      const random2 = seededRandom(hashString("pf" + sym));
      let walkLevel = 0;
      const walkLevels: any[] = [];
      for (let dayIdx = 0; dayIdx < dayCount; dayIdx++) {
        walkLevel += (random2() - 0.48) * (dailyVolByCategory[market2.cat] || 0.02);
        walkLevels.push(walkLevel);
      }
      const prices2 = walkLevels.map(
        (level) => market2.price * Math.exp(level - walkLevels[dayCount - 1]),
      );
      return {
        sym: sym,
        name: market2.name,
        logo: LOGOS[sym.toLowerCase()],
        color: perfColors[colorIdx],
        data: prices2,
      };
    })
    .filter(Boolean);
  const ytdStartIndex = Math.max(
    0,
    dayCount -
      1 -
      Math.round(
        (todayStartMs2 - Date.UTC(new Date(todayStartMs2).getUTCFullYear(), 0, 1)) / 86400000,
      ),
  );
  const rangeStartIndex: any = {
    "1M": dayCount - 31,
    "3M": dayCount - 91,
    YTD: ytdStartIndex,
    "1Y": 0,
  };
  const perfRange = state.pfRange || "3M";
  const perfHidden = state.pfOff || {};
  const perfHighlight = state.pfHi || null;
  const perfSort = state.pfSort || { col: perfRange, dir: -1 };
  function rangeReturn(series: any, rangeKey: any) {
    const startPrice = series.data[rangeStartIndex[rangeKey]];
    const endPrice = series.data[dayCount - 1];
    return (endPrice / startPrice - 1) * 100;
  }
  const perfStart = rangeStartIndex[perfRange];
  const perfDays = dayCount - perfStart;
  const activePerfSeries = perfSeries.filter((series: any) => !perfHidden[series.sym]);
  let perfMin = 0;
  let perfMax = 0;
  activePerfSeries.forEach((series: any) => {
    const basePrice = series.data[perfStart];
    for (let dayIdx = perfStart; dayIdx < dayCount; dayIdx++) {
      const pct = (series.data[dayIdx] / basePrice - 1) * 100;
      if (pct < perfMin) {
        perfMin = pct;
      }
      if (pct > perfMax) {
        perfMax = pct;
      }
    }
  });
  for (
    var perfStep = ((range) => {
        const magnitude = Math.pow(10, Math.floor(Math.log10(range / 4 || 1)));
        const normalized = range / 4 / magnitude;
        return (normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10) * magnitude;
      })(perfMax - perfMin || 1),
      perfAxisMin = Math.floor(perfMin / perfStep) * perfStep,
      perfAxisMax = Math.ceil(perfMax / perfStep) * perfStep || perfStep,
      perfToY = (value: any) =>
        8 + ((perfAxisMax - value) / (perfAxisMax - perfAxisMin || 1)) * 264,
      perfToX = (dayIdx: any) => ((dayIdx - perfStart) / (perfDays - 1)) * 1000,
      perfLines = perfSeries
        .map((series: any) => {
          if (perfHidden[series.sym]) {
            return null;
          }
          const basePrice = series.data[perfStart];
          let pathData = "";
          for (let dayIdx = perfStart; dayIdx < dayCount; dayIdx++) {
            pathData +=
              (dayIdx === perfStart ? "M" : "L") +
              perfToX(dayIdx).toFixed(1) +
              " " +
              perfToY((series.data[dayIdx] / basePrice - 1) * 100).toFixed(1);
          }
          return {
            d: pathData,
            color: series.color,
            w: perfHighlight === series.sym ? "3" : "1.6",
            op: perfHighlight && perfHighlight !== series.sym ? "0.18" : "1",
          };
        })
        .filter(Boolean),
      perfYTicks = [],
      perfTickValue = perfAxisMin;
    perfTickValue <= perfAxisMax + 1e-9;
    perfTickValue += perfStep
  ) {
    perfYTicks.push({
      y: (perfToY(perfTickValue) / 2.8).toFixed(2),
      label: (perfTickValue > 0 ? "+" : "") + perfTickValue.toFixed(perfStep < 1 ? 1 : 0) + "%",
      zero: Math.abs(perfTickValue) < 1e-9,
    });
  }
  const perfXTicks = [];
  for (let tickSlot = 0; tickSlot < 5; tickSlot++) {
    const tickIndex = Math.round(perfStart + ((perfDays - 1) * tickSlot) / 4);
    perfXTicks.push({
      x: (perfToX(tickIndex) / 10).toFixed(2),
      label: formatDayLabel(tickIndex),
      cls: tickSlot === 0 ? "first" : tickSlot === 4 ? "last" : "",
    });
  }
  function fmtPctKo(value: any) {
    return (value >= 0 ? "▲ " : "▼ ") + Math.abs(value).toFixed(2) + "%";
  }
  const perfRows = perfSeries
    .map((series: any) => {
      const row: any = {
        sym: series.sym,
        name: series.name,
        logo: series.logo,
        color: series.color,
        raw: {},
      };
      ["1M", "3M", "YTD", "1Y"].forEach((rangeKey) => {
        row.raw[rangeKey] = rangeReturn(series, rangeKey);
      });
      return row;
    })
    .sort((a: any, b: any) => (a.raw[perfSort.col] - b.raw[perfSort.col]) * perfSort.dir)
    .map((row: any, idx) => {
      const isHidden = !!perfHidden[row.sym];
      return {
        num: String(idx + 1),
        sym: row.sym,
        logo: row.logo,
        color: row.color,
        cls:
          "pf-tr pf-row" +
          (isHidden ? " is-off" : "") +
          (perfHighlight === row.sym ? " is-hi" : ""),
        pressed: isHidden ? "false" : "true",
        cells: ["1M", "3M", "YTD", "1Y"].map((rangeKey) => ({
          v: fmtPctKo(row.raw[rangeKey]),
          cls: row.raw[rangeKey] >= 0 ? "up" : "down",
        })),
        toggle: () => {
          const nextHidden = { ...perfHidden };
          nextHidden[row.sym] = !isHidden;
          if (!perfSeries.every((seriesItem: any) => nextHidden[seriesItem.sym])) {
            self.setState({ pfOff: nextHidden });
          }
        },
        enter: () => {
          if (self.state.pfHi !== row.sym) {
            self.setState({ pfHi: row.sym });
          }
        },
        leave: () => {
          if (self.state.pfHi) {
            self.setState({ pfHi: null });
          }
        },
      };
    });
  const perf = {
    ranges: ["1M", "3M", "YTD", "1Y"].map((rangeKey) => {
      const isOn = perfRange === rangeKey;
      return {
        label: rangeKey,
        cls: "mwc-opt" + (isOn ? " is-on" : ""),
        pressed: isOn ? "true" : "false",
        pick: () => {
          self.setState({ pfRange: rangeKey, pfSort: { col: rangeKey, dir: -1 } });
        },
      };
    }),
    heads: ["1M", "3M", "YTD", "1Y"].map((rangeKey) => {
      const isSorted = perfSort.col === rangeKey;
      return {
        label: rangeKey,
        cls: "pf-sort" + (isSorted ? " is-on" : ""),
        arrow: isSorted ? (perfSort.dir < 0 ? "▾" : "▴") : "↕",
        pick: () => {
          self.setState({ pfSort: { col: rangeKey, dir: isSorted ? -perfSort.dir : -1 } });
        },
      };
    }),
    lines: perfLines,
    yTicks: perfYTicks,
    xTicks: perfXTicks,
    rows: perfRows,
    asOf: "as of " + formatDayLabel(dayCount - 1),
    move: (e: any) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const hoverIdx = Math.round(perfStart + ratio * (perfDays - 1));
      if (self.state.pfHov !== hoverIdx) {
        self.setState({ pfHov: hoverIdx });
      }
    },
    leave: (e: any) => {
      if (!e || e.pointerType !== "touch") {
        self.setState({ pfHov: null });
      }
    },
    tip:
      state.pfHov != null && state.pfHov >= perfStart
        ? (() => {
            const hoverIdx = state.pfHov;
            const leftPct = perfToX(hoverIdx) / 10;
            return {
              show: true,
              left: leftPct.toFixed(2),
              side: leftPct > 55 ? "side-l" : "side-r",
              date: formatDayLabel(hoverIdx),
              rows: activePerfSeries
                .map((series: any) => {
                  const pct = (series.data[hoverIdx] / series.data[perfStart] - 1) * 100;
                  return {
                    name: series.sym,
                    color: series.color,
                    raw: pct,
                    val: (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%",
                    cls: pct >= 0 ? "up" : "down",
                  };
                })
                .sort((a, b) => b.raw - a.raw),
            };
          })()
        : { show: false },
  };
  const leagueTab = state.lgTab || "venues";
  const leagueSort = state.lgSort || "oi";
  const leagueRows: any[] = [];
  function growth30d(seedKey: any, baseValue: any, drift: any) {
    const series = generateSeries(seedKey, baseValue, drift, 0.035);
    return (series[seriesLength - 1] / series[seriesLength - 31] - 1) * 100;
  }
  if (leagueTab === "venues") {
    VENUES.forEach((venue: any) => {
      const stats = venueTotals[venue.id];
      leagueRows.push({
        name: venue.name,
        logo: venue.logo,
        venue: true,
        count: stats.mk,
        countLbl: "markets",
        oi: stats.oi,
        vol: stats.vol,
        d30: growth30d(
          "mv" + venue.id + "oi",
          stats.oi,
          venueMeta[venue.id].type === "DEX" ? 0.0062 : 0.0031,
        ),
        open: () => {
          self.setState({ wview: "exchanges" });
        },
      });
    });
  } else if (leagueTab === "markets") {
    MARKETS.forEach((market2) => {
      const marketData = getMarketStats2(market2);
      leagueRows.push({
        name: market2.sym + "-PERP",
        logo: LOGOS[market2.sym.toLowerCase()],
        count: marketData.vm.length,
        countLbl: "venues",
        oi: marketData.w0.oi,
        vol: marketData.w0.vol,
        d30: growth30d(
          "lgm" + market2.sym,
          marketData.w0.oi,
          market2.cat === "Crypto" ? 0.003 : 0.0068,
        ),
        open: () => {
          self.setState({ screen: "detail" });
          makeSelectMarket(market2.sym)();
        },
      });
    });
  } else {
    categoryColors.forEach((category) => {
      const categoryMarkets = MARKETS.filter((market2) => market2.cat === category[0]);
      const categoryStats = categoryTotals[category[0]] || { oi: 0, vol: 0 };
      leagueRows.push({
        name: category[0],
        dot: category[1],
        count: categoryMarkets.length,
        countLbl: "markets",
        oi: categoryStats.oi,
        vol: categoryStats.vol,
        d30: growth30d(
          "mc" + category[0] + "oi",
          categoryStats.oi,
          category[0] === "Crypto" ? 0.003 : 0.0068,
        ),
        open: () => {
          self.setState({ wcat: category[0], wview: "markets", tpg: firstPage("markets") });
        },
      });
    });
  }
  const leagueTotalOi = leagueRows.reduce((sum, row) => sum + row.oi, 0) || 1;
  leagueRows.sort((a, b) => {
    if (leagueSort === "vol") {
      return b.vol - a.vol;
    } else if (leagueSort === "d30") {
      return b.d30 - a.d30;
    } else if (leagueSort === "count") {
      return b.count - a.count;
    } else {
      return b.oi - a.oi;
    }
  });
  const league: any = {
    tabs: [
      ["venues", "Venues"],
      ["markets", "Markets"],
      ["classes", "Asset Classes"],
    ].map((tab) => {
      const isOn = leagueTab === tab[0];
      return {
        label: tab[1],
        cls: "lg-tab" + (isOn ? " is-on" : ""),
        pressed: isOn ? "true" : "false",
        pick: () => {
          self.setState({ lgTab: tab[0] });
        },
      };
    }),
    heads: [
      ["count", leagueTab === "markets" ? "Venues" : "Markets"],
      ["oi", "Open Interest"],
      ["vol", "24h Volume"],
      ["d30", "30D"],
      ["share", "Share"],
    ].map((column) => {
      if (leagueSort !== column[0]) {
        column[0];
      }
      return {
        label: column[1],
        cls:
          "lg-h" +
          (leagueSort === column[0] ? " is-on" : "") +
          (column[0] === "share" ? " no-sort" : ""),
        pick: () => {
          if (column[0] !== "share") {
            self.setState({ lgSort: column[0] });
          }
        },
      };
    }),
    rows: leagueRows.map((row, idx) => {
      const sharePct = (row.oi / leagueTotalOi) * 100;
      return {
        rank: String(idx + 1),
        name: row.name,
        logo: row.logo || "",
        hasLogo: !!row.logo,
        dot: row.dot || "",
        hasDot: !!row.dot,
        venue: row.venue ? "1" : "",
        count: String(row.count),
        oi: "$" + formatCompact(row.oi),
        vol: "$" + formatCompact(row.vol),
        d30: fmtPctKo(row.d30),
        d30Cls: row.d30 >= 0 ? "up" : "down",
        share: sharePct.toFixed(1) + "%",
        shareW: Math.max(1.5, sharePct).toFixed(1),
        open: row.open,
      };
    }),
  };
  const totalWeeks = 52;
  const weeklyPeriod = state.wkPeriod || "1Y";
  const weeklyVenue = state.wkVenue || "all";
  const weeklyCategory = state.wkCat || "all";
  const weekCount = weeklyPeriod === "3M" ? 13 : weeklyPeriod === "6M" ? 26 : 52;
  const venueCategoryShare: any = {};
  VENUES.forEach((venue) => {
    venueCategoryShare[venue.id] = {};
    let venueTotal = 0;
    MARKETS.forEach((market2) => {
      const marketData = getMarketStats2(market2);
      const venueQuote = marketData.vm.filter((quote: any) => quote.v.id === venue.id)[0];
      if (venueQuote) {
        const volume = marketData.w0.vol * venueQuote.sh;
        venueCategoryShare[venue.id][market2.cat] =
          (venueCategoryShare[venue.id][market2.cat] || 0) + volume;
        venueTotal += volume;
      }
    });
    Object.keys(venueCategoryShare[venue.id]).forEach((categoryKey) => {
      venueCategoryShare[venue.id][categoryKey] /= venueTotal || 1;
    });
  });
  const weeklyVenues = VENUES.filter(
    (venue) => weeklyVenue === "all" || weeklyVenue === venue.id,
  ).map((venue: any) => {
    const volSeries = generateSeries(
      "wk" + venue.id,
      venueTotals[venue.id].vol,
      venueMeta[venue.id].type === "DEX" ? 0.0045 : 0.0018,
      0.08,
      true,
    );
    const random2 = seededRandom(hashString("wkx" + venue.id));
    const weeklyTotals = [];
    for (let weekIdx = 0; weekIdx < totalWeeks; weekIdx++) {
      let weekSum = 0;
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const dayIdx = seriesLength - 1 - (totalWeeks - 1 - weekIdx) * 7 + dayOffset - 6;
        const dailyVolume =
          dayIdx >= 0
            ? volSeries[dayIdx]
            : volSeries[0] *
              Math.exp(dayIdx * (venueMeta[venue.id].type === "DEX" ? 0.0045 : 0.0018)) *
              (0.8 + random2() * 0.4);
        weekSum += dailyVolume;
      }
      weeklyTotals.push(
        weekSum *
          (weeklyCategory === "all" ? 1 : venueCategoryShare[venue.id][weeklyCategory] || 0),
      );
    }
    return {
      id: venue.id,
      name: venue.name,
      logo: venue.logo,
      color: VENUE_COLORS[venue.id],
      weeks: weeklyTotals.slice(totalWeeks - weekCount),
    };
  });
  const formatTotal = (value: any) => {
    if (value >= 1000000000000) {
      return "$" + (value / 1000000000000).toFixed(2) + "T";
    } else {
      return "$" + formatCompact(value);
    }
  };
  let maxWeekTotal = 0;
  for (var weekIdx2 = 0; weekIdx2 < weekCount; weekIdx2++) {
    maxWeekTotal = Math.max(
      maxWeekTotal,
      weeklyVenues.reduce((sum, venue) => sum + venue.weeks[weekIdx2], 0),
    );
  }
  const weeklyStep = ((range) => {
    const magnitude = Math.pow(10, Math.floor(Math.log10(range / 4 || 1)));
    const normalized = range / 4 / magnitude;
    return (normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10) * magnitude;
  })(maxWeekTotal || 1);
  const weeklyAxisMax = Math.ceil((maxWeekTotal * 1.04) / weeklyStep) * weeklyStep || weeklyStep;
  function weeklyToY(value: any) {
    return 280 - (value / weeklyAxisMax) * 272;
  }
  const weekWidth = 1000 / weekCount;
  const weekTotals = new Array(weekCount).fill(0);
  const weeklyPaths = weeklyVenues.map((venue) => {
    let pathData = "";
    for (let weekIdx = 0; weekIdx < weekCount; weekIdx++) {
      const yBottom = weeklyToY(weekTotals[weekIdx]);
      const yTop = weeklyToY(weekTotals[weekIdx] + venue.weeks[weekIdx]);
      pathData +=
        "M" +
        (weekIdx * weekWidth + weekWidth * 0.1).toFixed(1) +
        " " +
        yBottom.toFixed(1) +
        "V" +
        yTop.toFixed(1) +
        "H" +
        (weekIdx * weekWidth + weekWidth * 0.9).toFixed(1) +
        "V" +
        yBottom.toFixed(1) +
        "Z";
      weekTotals[weekIdx] += venue.weeks[weekIdx];
    }
    return { d: pathData, color: venue.color };
  });
  function formatWeekLabel(weekIdx: any) {
    const date = new Date(todayStartMs2 - (weekCount - 1 - weekIdx) * 7 * 86400000);
    return monthNames5[date.getUTCMonth()] + " " + String(date.getUTCFullYear());
  }
  var monthNames5 = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const weeklyHoverIndex =
    state.wkHover != null && state.wkHover < weekCount ? state.wkHover : null;
  const weeklyGrandTotal = weekTotals.reduce((sum, weekTotal) => sum + weekTotal, 0);
  const weekly = {
    sub:
      "Showing " +
      (weeklyPeriod === "1Y"
        ? "the last year"
        : weeklyPeriod === "6M"
          ? "the last 6 months"
          : "the last 3 months") +
      " across " +
      (weeklyVenue === "all"
        ? "all venues"
        : (VENUES.filter((venue) => venue.id === weeklyVenue)[0] || {}).name) +
      " in " +
      (weeklyCategory === "all" ? "all categories" : weeklyCategory.toLowerCase()),
    total: formatTotal(weeklyGrandTotal),
    paths: weeklyPaths,
    yTicks: [0, 1, 2, 3, 4].map((tick2) => {
      const value = (weeklyAxisMax * tick2) / 4;
      return { y: (weeklyToY(value) / 2.8).toFixed(2), label: formatTotal(value) };
    }),
    xTicks: [0, 1, 2, 3, 4].map((tick2) => {
      const weekIdx = Math.round(((weekCount - 1) * tick2) / 4);
      return {
        x: (((weekIdx + 0.5) * weekWidth) / 10).toFixed(2),
        label: formatWeekLabel(weekIdx),
        cls: tick2 === 0 ? "first" : tick2 === 4 ? "last" : "",
      };
    }),
    legend: weeklyVenues.map((venue) => ({ name: venue.name, color: venue.color })),
    periods: [
      ["3M", "3M"],
      ["6M", "6M"],
      ["1Y", "1Y"],
    ].map((period) => {
      const isOn = weeklyPeriod === period[0];
      return {
        label: period[1],
        cls: "wk-o" + (isOn ? " is-on" : ""),
        pick: () => {
          self.setState({ wkPeriod: period[0], wkHover: null });
        },
      };
    }),
    venues: [{ id: "all", name: "All" }]
      .concat(VENUES.map((venue: any) => ({ id: venue.id, name: venue.name, logo: venue.logo })))
      .map((option: any) => {
        const isOn = weeklyVenue === option.id;
        return {
          label: option.name,
          logo: option.logo || "",
          hasLogo: !!option.logo,
          cls: "wk-o" + (isOn ? " is-on" : ""),
          pick: () => {
            self.setState({ wkVenue: option.id, wkHover: null });
          },
        };
      }),
    cats: [["all", "All"]]
      .concat(categoryColors.map((category) => [category[0], category[0]]))
      .map((option) => {
        const isOn = weeklyCategory === option[0];
        return {
          label: option[1],
          cls: "wk-o" + (isOn ? " is-on" : ""),
          pick: () => {
            self.setState({ wkCat: option[0], wkHover: null });
          },
        };
      }),
    canReset: weeklyPeriod !== "1Y" || weeklyVenue !== "all" || weeklyCategory !== "all",
    reset: () => {
      self.setState({ wkPeriod: "1Y", wkVenue: "all", wkCat: "all", wkHover: null });
    },
    move: (e: any) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const weekIdx = Math.max(
        0,
        Math.min(weekCount - 1, Math.floor(((e.clientX - rect.left) / rect.width) * weekCount)),
      );
      if (self.state.wkHover !== weekIdx) {
        self.setState({ wkHover: weekIdx });
      }
    },
    leave: (e: any) => {
      if (!e || e.pointerType !== "touch") {
        self.setState({ wkHover: null });
      }
    },
    tip:
      weeklyHoverIndex == null
        ? { show: false }
        : {
            show: true,
            left: (((weeklyHoverIndex + 0.5) * weekWidth) / 10).toFixed(2),
            side: (weeklyHoverIndex + 0.5) / weekCount > 0.55 ? "side-l" : "side-r",
            date:
              "Week of " +
              (() => {
                const weekStart = new Date(
                  todayStartMs2 - (weekCount - 1 - weeklyHoverIndex) * 7 * 86400000 - 518400000,
                );
                return monthNames5[weekStart.getUTCMonth()] + " " + weekStart.getUTCDate();
              })(),
            total:
              "$" +
              formatCompact(
                weeklyVenues.reduce((sum, venue) => sum + venue.weeks[weeklyHoverIndex], 0),
              ),
            rows: weeklyVenues
              .map((venue) => ({
                name: venue.name,
                color: venue.color,
                raw: venue.weeks[weeklyHoverIndex],
                val: "$" + formatCompact(venue.weeks[weeklyHoverIndex]),
              }))
              .sort((a, b) => b.raw - a.raw),
          },
  };
  const pagedLeague = paginate("league-" + leagueTab, league.rows);
  league.rows = pagedLeague.rows;
  league.pager = pagedLeague.pager;
  marketWatch.perf = perf;
  marketWatch.league = league;
  marketWatch.weekly = weekly;
  function buildDropdown(key: any, label: any, options: any) {
    const isOpen = state.ddOpen === key;
    const current = options.filter((option: any) => option.on)[0] || options[0] || { label: "" };
    return {
      label: label,
      cur: current.label,
      open: isOpen,
      openStr: isOpen ? "true" : "false",
      btnCls: "dd-btn" + (isOpen ? " is-open" : ""),
      toggle: () => {
        self.setState({ ddOpen: isOpen ? null : key });
      },
      close: () => {
        self.setState({ ddOpen: null });
      },
      opts: options.map((option: any) => ({
        label: option.label,
        count: option.count == null ? "" : String(option.count),
        logo: option.logo || "",
        hasLogo: !!option.logo,
        cls: "dd-opt" + (option.on ? " is-on" : ""),
        sel: option.on ? "true" : "false",
        pick: () => {
          option.pick();
          self.setState({ ddOpen: null });
        },
      })),
    };
  }
  function isOptionOn(option: any) {
    return option.pressed === "true" || / is-on| is-active/.test(" " + (option.cls || ""));
  }
  function assetClassOptions(currentValue: any, stateKey: any) {
    return [
      {
        label: "All asset classes",
        on: !currentValue,
        pick: () => {
          const clearPatch: any = {};
          clearPatch[stateKey] = null;
          self.setState(clearPatch);
        },
      },
    ].concat(
      categoryColors.map((category) => ({
        label: category[0],
        on: currentValue === category[0],
        pick: () => {
          const selectPatch: any = {};
          selectPatch[stateKey] = category[0];
          self.setState(selectPatch);
        },
      })),
    );
  }
  marketWatch.dd = {
    seg: buildDropdown(
      "seg",
      "Group by",
      chart2.segs.map((option) => ({
        label: option.label,
        on: isOptionOn(option),
        pick: option.pick,
      })),
    ),
    metric: buildDropdown(
      "metric",
      chart2.metricLbl,
      chart2.metrics.map((option) => ({
        label: option.label,
        on: isOptionOn(option),
        pick: option.pick,
      })),
    ),
    pfCat: buildDropdown("pfCat", "Show", assetClassOptions(state.pfCat, "pfCat")),
    cyCat: buildDropdown("cyCat", "Show", assetClassOptions(state.cyCat, "cyCat")),
    wkPeriod: buildDropdown(
      "wkPeriod",
      "Period",
      weekly.periods.map((option) => ({
        label: option.label,
        on: isOptionOn(option),
        pick: option.pick,
      })),
    ),
    wkVenue: buildDropdown(
      "wkVenue",
      "Venue",
      weekly.venues.map((option) => ({
        label: option.label,
        logo: option.logo,
        on: isOptionOn(option),
        pick: option.pick,
      })),
    ),
    wkCat: buildDropdown(
      "wkCat",
      "Category",
      weekly.cats.map((option) => ({
        label: option.label,
        on: isOptionOn(option),
        pick: option.pick,
      })),
    ),
    mcat: buildDropdown(
      "mcat",
      "Category",
      categoryPills2.map((option) => ({
        label: option.label,
        count: option.count,
        on: isOptionOn(option),
        pick: option.pick,
      })),
    ),
    xtype: buildDropdown(
      "xtype",
      "Type",
      exchangeCategoryTabs.map((option) => ({
        label: option.label,
        count: option.count,
        on: isOptionOn(option),
        pick: option.pick,
      })),
    ),
    funit: buildDropdown(
      "funit",
      "Rate",
      fundingUnitTabs.map((option) => ({
        label: option.label === "APR" ? "Annualized" : "Per " + option.label,
        on: isOptionOn(option),
        pick: option.pick,
      })),
    ),
  };
  marketWatch.snap = (e: any) => {
    const button = e.currentTarget;
    const card = button.closest(".snap-card");
    if (card) {
      button.disabled = true;
      showToast("Rendering a 4K snapshot…");
      saveNodeSnapshot(
        card,
        "openfutures-" + (card.getAttribute("data-snap") || "chart") + ".png",
        self._dl || null,
        (isSaved: any, errorMessage: any) => {
          button.disabled = false;
          showToast(
            isSaved ? "Snapshot saved." : errorMessage || "This browser blocked the snapshot.",
          );
        },
      );
    }
  };
  const propPlans = [
    [10000, 79],
    [25000, 149],
    [50000, 249],
    [100000, 449],
  ];
  const propRules = { target: 0.08, daily: 0.05, max: 0.1, days: 5, split: 0.8, payoutDays: 14 };
  const nowDate2 = new Date(state.now);
  const nowLabel =
    MONTHS[nowDate2.getUTCMonth()] +
    " " +
    nowDate2.getUTCDate() +
    ", " +
    pad2(nowDate2.getUTCHours()) +
    ":" +
    pad2(nowDate2.getUTCMinutes());
  const selectedPlanSize = state.ppPlan || 25000;
  const propProfit = propEquity - propAccount.size;
  const profitTargetAmount = propAccount.size * propRules.target;
  const hasReachedTarget = propProfit >= profitTargetAmount;
  const hasMinTradingDays = (propAccount.days || 0) >= propRules.days;
  const isRuleBroken =
    (propAccount.status === "eval" || propAccount.status === "funded") &&
    (dailyLossLeft <= 0 || maxLossLeft <= 0);
  // The signed-in trader appears among the vault's funded traders once their account is funded.
  const fundedYou =
    propAccount.status === "funded"
      ? {
          name: "You",
          size: propAccount.size,
          pnl: propProfit / propAccount.size,
          drawdown: Math.max(
            0,
            (propAccount.size - propEquity) / (propAccount.size * propRules.max),
          ),
          status: "Funded" as const,
          days: propAccount.days || 1,
          you: true,
        }
      : null;
  const liquidityViewModel = buildLiquidityViewModel({
    terminal: self,
    state,
    availableBalance: liveFreeBalance,
    paginate,
    showToast,
    you: fundedYou,
  });
  const propViewModel = {
    none: propAccount.status === "none",
    hasAcct: propAccount.status === "eval" || propAccount.status === "funded",
    isEval: propAccount.status === "eval",
    isFunded: propAccount.status === "funded",
    broken: isRuleBroken,
    plans: propPlans.map((plan) => {
      const isSelected = selectedPlanSize === plan[0];
      return {
        size: "$" + formatCompact(plan[0]).replace(".00", ""),
        fee: "$" + plan[1],
        cls: "pp-plan" + (isSelected ? " is-on" : ""),
        pressed: isSelected ? "true" : "false",
        pick: () => {
          self.setState({ ppPlan: plan[0] });
        },
      };
    }),
    rules: [
      ["Profit target", propRules.target * 100 + "%"],
      ["Daily loss limit", propRules.daily * 100 + "%"],
      ["Max loss", propRules.max * 100 + "%"],
      ["Minimum trading days", String(propRules.days)],
      ["Profit split", propRules.split * 100 + "% to you"],
      ["Payouts", "Every " + propRules.payoutDays + " days"],
    ].map((rule) => ({ k: rule[0], v: rule[1] })),
    planFee: "$" + (propPlans.filter((plan) => plan[0] === selectedPlanSize)[0] || propPlans[1])[1],
    start: () => {
      const selectedPlan2 =
        propPlans.filter((plan) => plan[0] === selectedPlanSize)[0] || propPlans[1];
      self.setState({
        pa: {
          status: "eval",
          size: selectedPlan2[0],
          fee: selectedPlan2[1],
          realized: 0,
          dayStart: selectedPlan2[0],
          days: 1,
          startedAt: nowLabel,
        },
        propPositions: [],
        account: "prop",
      });
      showToast(
        "Evaluation started on a $" +
          selectedPlan2[0].toLocaleString("en-US") +
          " account. Fee of $" +
          selectedPlan2[1] +
          " paid to the vault.",
      );
    },
    reset: () => {
      self.setState({ pa: { status: "none" }, propPositions: [] });
    },
    size: "$" + propAccount.size.toLocaleString("en-US"),
    phase: propAccount.status === "funded" ? "Funded" : "Evaluation",
    phaseCls: "pp-phase" + (propAccount.status === "funded" ? " funded" : ""),
    equity: formatUsd(propEquity),
    pnl: formatSignedUsd(propProfit),
    pnlCls: propProfit >= 0 ? "up" : "down",
    pnlPct: (propProfit >= 0 ? "+" : "") + ((propProfit / propAccount.size) * 100).toFixed(2) + "%",
    checks: [
      {
        k: "Profit target",
        v: formatSignedUsd(propProfit) + " of " + formatUsd(profitTargetAmount),
        w: Math.max(0, Math.min(100, (propProfit / profitTargetAmount) * 100)).toFixed(0),
        cls: "pp-ck" + (hasReachedTarget ? " ok" : ""),
        bar: "up",
      },
      {
        k: "Daily loss left",
        v: formatUsd(dailyLossLeft),
        w: Math.max(0, (dailyLossLeft / (propAccount.size * propRules.daily)) * 100).toFixed(0),
        cls: "pp-ck" + (dailyLossLeft > 0 ? " ok" : " bad"),
        bar: dailyLossLeft / (propAccount.size * propRules.daily) < 0.35 ? "down" : "flat",
      },
      {
        k: "Max loss left",
        v: formatUsd(maxLossLeft),
        w: Math.max(
          0,
          Math.min(100, (maxLossLeft / (propAccount.size * propRules.max)) * 100),
        ).toFixed(0),
        cls: "pp-ck" + (maxLossLeft > 0 ? " ok" : " bad"),
        bar: maxLossLeft / (propAccount.size * propRules.max) < 0.35 ? "down" : "flat",
      },
      {
        k: "Trading days",
        v: hasMinTradingDays
          ? String(propAccount.days || 0)
          : (propAccount.days || 0) + " of " + propRules.days,
        w: Math.min(100, ((propAccount.days || 0) / propRules.days) * 100).toFixed(0),
        cls: "pp-ck" + (hasMinTradingDays ? " ok" : ""),
        bar: "up",
      },
    ],
    canFund:
      propAccount.status === "eval" && hasReachedTarget && hasMinTradingDays && !isRuleBroken,
    cantFund:
      propAccount.status !== "eval" || !hasReachedTarget || !hasMinTradingDays || !!isRuleBroken,
    fundNote: isRuleBroken
      ? "A rule was broken. Start a new evaluation."
      : propAccount.status === "eval"
        ? hasReachedTarget
          ? hasMinTradingDays
            ? "Target reached. Request your funded account."
            : "Target reached. Trade " + (propRules.days - (propAccount.days || 0)) + " more days."
          : formatUsd(Math.max(0, profitTargetAmount - propProfit)) + " to the target"
        : "",
    requestFunded: () => {
      const celebrateStamp = Date.now();
      self.setState({
        pa: {
          ...propAccount,
          status: "funded",
          realized: propProfit + (propAccount.realized || 0) - propProfit,
          dayStart: propEquity,
        },
        celebrate: celebrateStamp,
        celText:
          "Your $" + propAccount.size.toLocaleString("en-US") + " account is funded by the vault.",
      });
      clearTimeout(self._celT);
      self._celT = setTimeout(() => {
        if (self.state.celebrate === celebrateStamp) {
          self.setState({ celebrate: null });
        }
      }, 6500);
    },
    share: formatUsd(Math.max(0, propProfit) * propRules.split),
    vaultShare: formatUsd(Math.max(0, propProfit) * (1 - propRules.split)),
    nextPayout:
      "Next payout window in " +
      (propRules.payoutDays - ((propAccount.days || 0) % propRules.payoutDays)) +
      " days",
    noPayout: propProfit <= 0,
    requestPayout: () => {
      if (!(propProfit <= 0)) {
        const traderShare = propProfit * propRules.split;
        self.setState({
          pa: {
            ...propAccount,
            realized: (propAccount.realized || 0) - propProfit,
            dayStart: propAccount.size,
          },
        });
        showToast(
          "Payout of " +
            formatUsd(traderShare) +
            " requested. " +
            formatUsd(propProfit - traderShare) +
            " goes to the vault.",
        );
      }
    },
    goTrade: () => {
      self.setState({ screen: "detail", account: "prop" });
    },
    positionsN: String((state.propPositions || []).length),
    goProp: () => {
      self.setState({ screen: "prop" });
    },
    stripText:
      propAccount.status === "none"
        ? "Start an evaluation to trade vault capital"
        : (propAccount.status === "funded" ? "Funded " : "Evaluation ") +
          "$" +
          formatCompact(propAccount.size).replace(".00", "") +
          " · daily loss left " +
          formatUsd(dailyLossLeft) +
          " · max loss left " +
          formatUsd(maxLossLeft),
  };
  const homeViewModel = {
    balLabel: "Equity",
    eqWhole: balanceParts[0],
    eqCents: balanceParts[1],
    upnl: formatSignedUsd(totalUpnl),
    upnlCls: totalUpnl >= 0 ? "" : "down",
    posCount: String(positionRows.length),
    posLogos: positionRows
      .slice(0, 4)
      .map((position: any) => ({ logo: position.logo, sym: position.sym })),
    inPos: totalMargin.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    free: Math.max(0, freeMargin).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    otherName: isProMode ? "Prop mode" : "Pro mode",
    otherDot: "mode-dot" + (isProMode ? " prop" : ""),
    otherEq: liveEquity2.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    switchAcct: () => {
      self.setState({ account: isProMode ? "prop" : "live" });
    },
    q: state.hmQ || "",
    onQ: (e: any) => {
      self.setState({ hmQ: e.target.value });
    },
    sortOpen: !!state.hmSortOpen,
    sortOpenStr: state.hmSortOpen ? "true" : "false",
    toggleSort: () => {
      self.setState({ hmSortOpen: !state.hmSortOpen });
    },
    sortLabel: (
      { vol: "Volume", price: "Price", chg: "Change", oi: "OI", name: "Name" } as Record<
        string,
        string
      >
    )[heatmapSortKey],
    sortIcon: heatmapSortDir === "desc" ? "M12 5v14M6 13l6 6 6-6" : "M12 19V5M6 11l6-6 6 6",
    sortAria:
      (
        {
          vol: "24h volume",
          price: "price",
          chg: "24h Change",
          oi: "open interest",
          name: "name",
        } as Record<string, string>
      )[heatmapSortKey] + (heatmapSortDir === "desc" ? ", descending" : ", ascending"),
    sortGroups: [
      ["vol", "24h volume", "Highest first", "Lowest first"],
      ["chg", "24h Change", "Biggest gainers", "Biggest losers"],
      ["price", "Price", "Highest first", "Lowest first"],
      ["oi", "Open interest", "Highest first", "Lowest first"],
      ["name", "Name", "Z to A", "A to Z"],
    ].map((group) => ({
      title: group[1],
      opts: [
        ["desc", group[2]],
        ["asc", group[3]],
      ].map((option) => {
        const isSelected = heatmapSortKey === group[0] && heatmapSortDir === option[0];
        return {
          label: option[1],
          isOn: isSelected,
          selected: isSelected ? "true" : "false",
          cls: "hm-opt" + (isSelected ? " is-on" : ""),
          icon: option[0] === "desc" ? "M12 5v14M6 13l6 6 6-6" : "M12 19V5M6 11l6-6 6 6",
          pick: () => {
            self.setState({ hmSort: group[0], hmDir: option[0], hmSortOpen: false });
          },
        };
      }),
    })),
    views: [
      ["markets", "Markets", MARKETS.length, "M4 17l5-5 4 4 7-7M14 9h6v6"],
      ["positions", "Positions", positionRows.length, "m12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5"],
      ["orders", "Orders", orderRows.length, "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2"],
    ].map((view) => {
      const isActive = (state.hmView || "markets") === view[0];
      return {
        icon: view[3],
        label: view[1],
        count: String(view[2]),
        cls: "hb-pill" + (isActive ? " is-on" : ""),
        pressed: isActive ? "true" : "false",
        pick: () => {
          self.setState({ hmView: view[0], hmSortOpen: false, hmQ: "" });
        },
      };
    }),
    vMarkets: (state.hmView || "markets") === "markets",
    vPositions: state.hmView === "positions",
    vOrders: state.hmView === "orders",
    det: detailView,
    searchPh:
      (state.hmView || "markets") === "positions"
        ? "Search positions by market, venue or side"
        : state.hmView === "orders"
          ? "Search orders by market, venue or type"
          : "Search markets",
    pos: positionRows
      .map((position: any, positionIndex: any) => ({ p: position, pi: positionIndex }))
      .filter((entry: any) => {
        const position = entry.p;
        return (
          !heatmapQuery ||
          (position.sym + " " + position.venueName + " " + position.sideLabel)
            .toLowerCase()
            .indexOf(heatmapQuery) > -1
        );
      })
      .map((entry: any) => {
        const position = entry.p;
        const positionIndex = entry.pi;
        return {
          roeA:
            (position.pnlCls === "down" ? "▼ " : "▲ ") +
            String(position.roeText).replace(/^[+-]/, ""),
          details: () => {
            self.setState({ hmDet: { kind: "pos", i: positionIndex } });
          },
          sym: position.sym,
          logo: position.logo,
          lev: position.levText,
          side: position.sideLabel,
          sideCls: position.sideCls,
          size: position.sizeText,
          venue: position.venueName,
          venueLogo: position.venueLogo,
          pnl: position.pnlText,
          roe: position.roeText,
          pnlCls: position.pnlCls,
          entry: position.entryText,
          mark: position.markText,
          liq: position.liqText,
          close: position.close,
          open: makeSelectMarket(position.sym, position.venueId),
        };
      }),
    noPos:
      positionRows.filter(
        (position: any) =>
          !heatmapQuery ||
          (position.sym + " " + position.venueName + " " + position.sideLabel)
            .toLowerCase()
            .indexOf(heatmapQuery) > -1,
      ).length === 0,
    posEmpty:
      positionRows.length && heatmapQuery
        ? 'No positions match "' + (state.hmQ || "") + '"'
        : "No open positions",
    posEmptySub:
      positionRows.length && heatmapQuery
        ? "Try a ticker, a venue like Binance, or Long / Short."
        : "Pick a market to open your first trade.",
    ords: orderRows
      .map((order: any, orderIndex: any) => ({ o: order, oi: orderIndex }))
      .filter((entry: any) => {
        const order = entry.o;
        return (
          !heatmapQuery ||
          (order.sym + " " + order.venueName + " " + order.sideLabel + " " + order.type)
            .toLowerCase()
            .indexOf(heatmapQuery) > -1
        );
      })
      .map((entry: any) => {
        const order = entry.o;
        const orderIndex = entry.oi;
        return {
          details: () => {
            self.setState({ hmDet: { kind: "ord", i: orderIndex } });
          },
          sym: order.sym,
          logo: order.logo,
          side: order.sideLabel,
          sideCls: order.sideCls,
          type: order.type,
          venue: order.venueName,
          venueLogo: order.venueLogo,
          price: order.priceText,
          amount: order.amountText,
          value: order.valueText,
          filled: order.filledText,
          placed: order.placed,
          cancel: order.cancel,
          open: makeSelectMarket(order.sym),
        };
      }),
    noOrd:
      orderRows.filter(
        (order: any) =>
          !heatmapQuery ||
          (order.sym + " " + order.venueName + " " + order.sideLabel + " " + order.type)
            .toLowerCase()
            .indexOf(heatmapQuery) > -1,
      ).length === 0,
    ordEmpty:
      orderRows.length && heatmapQuery
        ? 'No orders match "' + (state.hmQ || "") + '"'
        : "No open orders",
    ordEmptySub:
      orderRows.length && heatmapQuery
        ? "Try a ticker, a venue, or Limit."
        : "Limit orders you place will wait here until they fill.",
    filters: heatmapFilters.map((filter: any) => {
      const isActive = heatmapFilter === filter[0];
      return {
        label: filter[1],
        count: String(MARKETS.filter(filter[2]).length),
        cls: isActive ? "pill is-active" : "pill",
        pressed: isActive ? "true" : "false",
        pick: () => {
          self.setState({ hmF: filter[0] });
        },
      };
    }),
    rows: visibleHeatmapMarkets.map((market2) => {
      const priceChange = (market2.price * market2.chg) / (100 + market2.chg);
      const priceText = formatPrice(market2.price);
      const dotIndex = priceText.indexOf(".");
      const bestVenue2: any =
        (getMarketStats(market2).avs || []).slice().sort((a, b) => b.mul - a.mul)[0] || VENUES[0];
      const sortedVenues = (getMarketStats(market2).avs || [])
        .slice()
        .sort((a, b) => b.mul - a.mul);
      return {
        venues: sortedVenues
          .slice(0, 3)
          .map((venue: any) => ({ logo: venue.logo, name: venue.name })),
        vMore: sortedVenues.length > 4 ? "+" + (sortedVenues.length - 4) : "",
        venueLogo: bestVenue2.logo,
        chgA: (market2.chg >= 0 ? "▲ " : "▼ ") + Math.abs(market2.chg).toFixed(2) + "%",
        flash: getFlashClass(market2.sym),
        pWhole: dotIndex > -1 ? priceText.slice(0, dotIndex) : priceText,
        pCents: dotIndex > -1 ? priceText.slice(dotIndex) : "",
        sym: market2.sym,
        lev: market2.max + "x",
        name: market2.name,
        logo: LOGOS[market2.sym.toLowerCase()],
        vol: "$" + market2.vol.replace("$", ""),
        price: priceText,
        chgAbs:
          market2.price < 0.01
            ? ""
            : (priceChange >= 0 ? "+$" : "-$") +
              (Math.abs(priceChange) >= 1
                ? Math.abs(priceChange).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : Math.abs(priceChange).toFixed(Math.abs(priceChange) >= 0.01 ? 2 : 4)) +
              " ",
        chgPct: (market2.chg >= 0 ? "+" : "") + market2.chg.toFixed(2) + "%",
        dir: market2.chg >= 0 ? "up" : "down",
        open: makeSelectMarket(market2.sym),
      };
    }),
    empty: heatmapMarkets.length === 0,
    emptyText:
      heatmapFilter === "watch" && !heatmapQuery ? "Your watchlist is empty" : "No markets match",
    emptySub:
      heatmapFilter === "watch" && !heatmapQuery
        ? "Tap the star on any market to add it here."
        : "Try a ticker like ETH or US500.",
    hasMore: !state.hmAll && !heatmapQuery && heatmapMarkets.length > 8,
    moreText: "View all " + heatmapMarkets.length + " markets",
    showAll: () => {
      self.setState({ hmAll: true });
    },
  };
  enhanceWatchViewModel({ terminal: self, state, marketWatch, getMarketStats: getMarketStats2,
    venueMeta, watchRows, exchangeRows: filteredExchanges, fundingRows: fundingMatrix });
  const copyViewModel = buildCopyViewModel(self, state, isMobile, {
    availableBalance,
    goTrade: (symbol: string) => makeSelectMarket(symbol)(),
    showToast,
  });
  const pointsViewModel = buildPointsViewModel(self, state, isMobile, {
    goTrade: makeNavigate(isMobile ? "home" : "detail"),
    goLiquidity: makeNavigate("liquidity"),
    goProp: () => {
      self.setState({ account: "prop" });
      makeNavigate("prop")();
    },
  });
  const marketsPaged = paginate("markets", watchRows);
  const venuesPaged = paginate("venues", filteredExchanges);
  const fundingPaged = paginate("funding", fundingMatrix);
  return {
    appCls:
      "app" + (state.dragging === "dock" ? " is-dragging-v" : state.dragging ? " is-dragging" : ""),
    screen: state.screen,
    pageTitle: ({ watch: "Market Watch", liquidity: "Liquidity", copy: "Copy", points: "Points" } as Record<string, string>)[state.screen] || "",
    sheet: state.sheet,
    drawer: state.drawer,
    drawerOpen: state.drawer === "open" ? "true" : "false",
    vpanelOpen: state.vpanel,
    vpanelState: state.vpanel ? "open" : "closed",
    toggleVpanel: () => {
      self.setState({ vpanel: !state.vpanel, drawer: "closed" });
    },
    tickers: tickerItems,
    filters: categoryPills,
    rows: marketListRows,
    noRows: marketListRows.length === 0,
    query: state.query,
    onQuery: (e: any) => {
      self.setState({ query: e.target.value });
    },
    moodTitle: avgMarketChange >= 0 ? "Market is up" : "Market is down",
    moodText: formatChange(avgMarketChange),
    moodDir: avgMarketChange >= 0 ? "up" : "down",
    m: { ...market, logo: LOGOS[market.sym.toLowerCase()] },
    V: activeVenue,
    vrows: venueRows,
    isBest: isBestRouting,
    notBest: !isBestRouting,
    bestNow: { logo: bestVenue.logo, name: bestVenue.name },
    bestOptCls: "vp-best" + (isBestRouting ? " is-selected" : ""),
    bestPressed: isBestRouting ? "true" : "false",
    pickBest: () => {
      const venueSelection = { ...state.venue };
      venueSelection[market.sym] = "best";
      self.setState({ venue: venueSelection, vpanel: false, hover: null, limit: "" });
    },
    bookVia: "",
    bestRadio: "radio" + (isBestRouting ? " on" : ""),
    vpPriceLabel: isBuy ? "Ask" : "Bid",
    vpTitle:
      market.sym +
      "-PERP, " +
      formatUsd(quoteNotional).replace(".00", "") +
      " " +
      (isBuy ? "long" : "short") +
      (orderNotional > 0 ? "" : " (example size)") +
      ", sorted by cost",
    vpContext:
      formatUsd(quoteNotional).replace(".00", "") +
      " " +
      (isBuy ? "long" : "short") +
      (orderNotional > 0 ? "" : " (example size)"),
    marketFillText: "Fills at the market price on " + activeVenue.name,
    favFill: isFavorite ? "currentColor" : "none",
    favPressed: isFavorite ? "true" : "false",
    toggleFav: () => {
      const favorites2 = { ...state.fav };
      favorites2[market.sym] = !isFavorite;
      self.setState({ fav: favorites2 });
      showToast(
        (isFavorite ? "Removed " : "Added ") +
          market.sym +
          "-PERP " +
          (isFavorite ? "from" : "to") +
          " your watchlist.",
      );
    },
    openDrawer: () => {
      if (isMobile) {
        self.setState({ screen: "watch" });
        return;
      }
      self.setState({ drawer: "open", vpanel: false });
    },
    heroFlash: getFlashClass(market.sym),
    heroPrice: formatPrice(hoveredClose),
    heroDelta: periodChangeText,
    heroDir: periodChange >= 0 ? "up" : "down",
    heroLabel: state.hover == null ? timeframe.range : "at " + hoverInfo.time,
    stats: statItems,
    chartLabel:
      market.sym +
      " " +
      (isCandle ? "candlestick" : "line") +
      " chart on " +
      activeVenue.name +
      ", " +
      timeframe.aria,
    isCandle: isCandle,
    isLine: !isCandle,
    o: hoverInfo,
    lineCls: isCandle ? "" : "is-active",
    candleCls: isCandle ? "is-active" : "",
    isLineStr: isCandle ? "false" : "true",
    isCandleStr: isCandle ? "true" : "false",
    setLine: () => {
      self.setState({ chart: "line" });
    },
    setCandle: () => {
      self.setState({ chart: "candle" });
    },
    tfs: TIMEFRAMES.map((timeframe3) => {
      const isActive = timeframe3.id === state.tf;
      return {
        label: timeframe3.label,
        aria: timeframe3.aria,
        cls: isActive ? "is-active" : "",
        pressed: isActive ? "true" : "false",
        pick: () => {
          self._rangeKey = null;
          self.setState({ chRange: null, tf: timeframe3.id, hover: null });
        },
      };
    }),
    gridPath: gridPath || "M0 0",
    linePath: linePath,
    areaPath: areaPath,
    wickUp: upWickPath || "M0 0",
    wickDown: downWickPath || "M0 0",
    bodyUp: upBodyPath || "M0 0",
    bodyDown: downBodyPath || "M0 0",
    volUp: upVolumePath || "M0 0",
    volDown: downVolumePath || "M0 0",
    yTicks: gridLabels,
    lastY: (priceToY(lastCandle.c) / 3).toFixed(2),
    lastText: formatPrice(lastCandle.c),
    lastDir: lastCandle.c >= lastCandle.o ? "up" : "down",
    hiX: (indexToX(highIndex) / 10).toFixed(2),
    hiY: (priceToY(isCandle ? candles[highIndex].h : candles[highIndex].c) / 3).toFixed(2),
    hiText: formatPrice(isCandle ? candles[highIndex].h : candles[highIndex].c),
    hiCls: indexToX(highIndex) > 700 ? "hl left" : "hl right",
    loX: (indexToX(lowIndex) / 10).toFixed(2),
    loY: (priceToY(isCandle ? candles[lowIndex].l : candles[lowIndex].c) / 3).toFixed(2),
    loText: formatPrice(isCandle ? candles[lowIndex].l : candles[lowIndex].c),
    loCls: indexToX(lowIndex) > 700 ? "hl left" : "hl right",
    hovering: state.hover != null,
    showDot: !isCandle,
    cursorX: crosshairX.toFixed(2),
    cursorY: crosshairLineY.toFixed(2),
    crossY: (crosshairYFraction * 100).toFixed(2),
    crossPrice: formatPrice(crosshairPrice),
    onMove: handleChartPointer,
    onLeave: () => {
      self.setState({ hover: null });
    },
    xLabels: axisTicks,
    ptabs: panelTabs,
    segTabs: mobilePanelTabs,
    positions: positionRows,
    orders: orderRows,
    history: historyPage.rows,
    historyMobile: recentHistory,
    pager: activePager,
    hasPositions: positionRows.length > 0,
    noPositions: positionRows.length === 0,
    hasOrders: orderRows.length > 0,
    noOrders: orderRows.length === 0,
    tabPos: state.ptab === "positions",
    tabOrd: state.ptab === "orders",
    tabHist: state.ptab === "history",
    tabBal: state.ptab === "balances",
    tabFund: state.ptab === "funding",
    tabOhist: state.ptab === "ohist",
    modeLabel: isPropAccount ? "Prop" : "Pro",
    modeDotCls: "mode-dot" + (isPropAccount ? " prop" : ""),
    balances: accountSummaries,
    fundHist: fundingPage.rows,
    orderHist: orderHistoryPage.rows,
    hstats: marketStats,
    recentTrades: recentTrades,
    btabs: [
      ["book", "Order book"],
      ["trades", "Trades"],
    ].map((tab) => {
      const isActive = (state.btab || "book") === tab[0];
      return {
        label: tab[1],
        cls: isActive ? "tab is-active" : "tab",
        pressed: isActive ? "true" : "false",
        pick: () => {
          self.setState({ btab: tab[0] });
        },
      };
    }),
    showBookTab: (state.btab || "book") === "book",
    showTradesTab: state.btab === "trades",
    tickText: (() => {
      const tickSize2 = tickSize;
      if (tickSize2 >= 1) {
        return String(Math.round(tickSize2 * 100) / 100);
      } else {
        return tickSize2.toFixed(Math.min(10, Math.round(-Math.log10(tickSize2))));
      }
    })(),
    spreadAbs: formatPrice(spread),
    spreadPct: ((spread / midPrice) * 100).toFixed(3) + "%",
    marginMode: state.marginMode === "isolated" ? "Isolated" : "Cross",
    toggleMode: () => {
      self.setState({ marginMode: state.marginMode === "isolated" ? "cross" : "isolated" });
    },
    levOpen: !!state.levOpen,
    levOpenStr: state.levOpen ? "true" : "false",
    toggleLev: () => {
      self.setState({ levOpen: !state.levOpen });
    },
    otabs: [
      ["market", "Market"],
      ["limit", "Limit"],
    ].map((tab) => {
      const isActive = state.otype === tab[0];
      return {
        label: tab[1],
        cls: isActive ? "tab is-active" : "tab",
        pressed: isActive ? "true" : "false",
        pick: () => {
          self.setState({ otype: tab[0] });
        },
      };
    }),
    posLine: currentPositionRow
      ? currentPositionRow.sizeText + " " + currentPositionRow.sideLabel.toLowerCase()
      : "0 " + market.sym,
    sizePct: fillPct,
    onPct: (e: any) => {
      const pct = parseInt(e.target.value, 10) || 0;
      self.setState({ size: ((freeBalance * pct) / 100).toFixed(2) });
    },
    reduceOnly: !!state.reduceOnly,
    toggleReduce: () => {
      self.setState({ reduceOnly: !state.reduceOnly });
    },
    marginReq: marginAmount > 0 ? formatUsd(marginAmount) : "-",
    slipText: hasFullFill ? "Est. " + slippageBps2.toFixed(1) + " bps" : "-",
    hasPosHere: !!currentPositionRow,
    posHere: currentPositionRow || positionRows[0] || {},
    acct: accountSummary,
    freeText: freeMargin.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    tbCount: "",
    mbook: bookLevels,
    hv: dockResizeHandlers,
    hvCls: "handle-h" + (state.dragging === "dock" ? " is-active" : ""),
    toggleDock: () => {
      self.setState({ dockOpen: !state.dockOpen });
    },
    dockToggleLabel: state.dockOpen ? "Collapse activity" : "Expand activity",
    dockChevron: state.dockOpen ? "m6 9 6 6 6-6" : "m6 15 6-6 6 6",
    tb: {
      liquidity: state.screen === "liquidity" ? "is-active" : "",
      watch: state.screen === "watch" ? "is-active" : "",
      trade: state.screen === "detail" || state.screen === "home" ? "is-active" : "",
      prop: state.screen === "prop" ? "is-active" : "",
      profile: state.screen === "profile" ? "is-active" : "",
      copy: state.screen === "copy" ? "is-active" : "",
    },
    navItems: [
      ["detail", "Trade"],
      ["prop", "Prop"],
      ["copy", "Copy"],
      ["watch", "Market Watch"],
      ["liquidity", "Liquidity"],
      ["points", "Points"],
    ]
      .filter((item) => item[0] !== "prop" || isPropAccount)
      .map((item) => {
        const isActive =
          state.screen === item[0] || (item[0] === "detail" && state.screen === "profile");
        return {
          label: item[1],
          cls: isActive ? "is-active" : "",
          current: isActive ? "page" : "false",
          go: makeNavigate(item[0]),
        };
      }),
    goWatch: makeNavigate("watch"),
    goLiquidity: makeNavigate("liquidity"),
    goCopy: makeNavigate("copy"),
    goPoints: makeNavigate("points"),
    goTrade: makeNavigate(isMobile ? "home" : "detail"),
    goHome: makeNavigate("home"),
    goProp: makeNavigate("prop"),
    goProfile: makeNavigate("profile"),
    goTradeProp: () => {
      self.setState({
        screen: "detail",
        account: "prop",
        profile: false,
        sheet: "closed",
        vpanel: false,
      });
    },
    toggleProfile: () => {
      self.setState({ profile: !state.profile, drawer: "closed", vpanel: false });
    },
    profileOpen: state.profile ? "true" : "false",
    profileState: state.profile ? "open" : "closed",
    account: state.account,
    isProp: isPropAccount,
    isLive: !isPropAccount,
    useLive: () => {
      self.setState({ account: "live" });
    },
    useProp: () => {
      self.setState({ account: "prop" });
    },
    acctLiveCls: isPropAccount ? "" : "is-active",
    acctPropCls: isPropAccount ? "is-active" : "",
    acctLivePressed: isPropAccount ? "false" : "true",
    acctPropPressed: isPropAccount ? "true" : "false",
    acctLiveRow: "acct-row" + (isPropAccount ? "" : " is-active"),
    acctPropRow: "acct-row" + (isPropAccount ? " is-active" : ""),
    liveEq: formatUsd(liveEquity),
    liveEqShort: "$" + formatCompact(liveEquity),
    acctTitle: "Equity",
    prop: propDashboard,
    propPositions: propPositionRows,
    propPosCount: String(propPositionRows.length),
    plans: planOptions,
    plan: planDetails,
    pp: propDashboard2,
    allVenues: VENUES.map((venue: any) => ({ logo: venue.logo, name: venue.name })),
    venueCount: VENUES.length,
    wq: state.wq,
    onWq: (e: any) => {
      self.setState({ wq: e.target.value, tpg: firstPage("markets") });
    },
    xq: state.xq || "",
    onXq: (e: any) => {
      self.setState({ xq: e.target.value, tpg: firstPage("venues") });
    },
    fq: state.fq || "",
    onFq: (e: any) => {
      self.setState({ fq: e.target.value, tpg: firstPage("funding") });
    },
    noW: watchRows.length === 0,
    ws: sortHeaders,
    noEx: filteredExchanges.length === 0,
    prop2: propViewModel,
    liq: liquidityViewModel,
    cp: copyViewModel,
    pts: pointsViewModel,
    wrowsP: marketsPaged.rows,
    wrowsPager: marketsPaged.pager,
    exListP: venuesPaged.rows,
    exPager: venuesPaged.pager,
    noF: fundingMatrix.length === 0,
    fmRowsP: fundingPaged.rows,
    fmPager: fundingPaged.pager,
    mw: marketWatch,
    mwTableSub: {
      markets:
        watchMarkets.length +
        " markets, " +
        (state.wcat && state.wcat !== "all" ? state.wcat.toLowerCase() : "all categories"),
      venues: VENUES.length + " venues, live feeds",
      funding:
        "Rates shown " + ((state.funit || "apr") === "apr" ? "annualized" : "per " + state.funit),
    },
    chRanges: rangeButtons,
    chScales: scaleOptions,
    chClock: clockText,
    tfLabel: (TIMEFRAMES.filter((timeframe3) => timeframe3.id === state.tf)[0] || {}).label || "",
    typeLabel: state.chart === "candle" ? "Switch to line chart" : "Switch to candles",
    toggleType: () => {
      self.setState({ chart: state.chart === "candle" ? "line" : "candle" });
    },
    chLegendCls: "ch-legend num" + (self.props.tvWidget ? " is-hidden" : ""),
    // Preserved from the original bundle: the chart-tools object built above is overwritten by a
    // loop counter that shared its variable, so the drawing rail and indicator menu never render.
    // Return `technicalAnalysis` here to switch them on.
    ta: seriesIndex as any,
    cel: celebration,
    chartFsState: state.chartFs ? "on" : "off",
    toggleFs: () => {
      if (state.chartFs) {
        exitChartFullscreen();
      } else {
        enterChartFullscreen();
      }
    },
    exitFs: exitChartFullscreen,
    fsLabel: state.chartFs ? "Exit full screen" : "Full screen chart",
    ob: onboarding,
    st: settings,
    ohlcCls: "ohlc num" + (self.props.tvWidget ? " is-hidden" : ""),
    ai: assistantPanel,
    aiLaunchState: !state.aiOpen && !state.aiHidden ? "shown" : "hidden",
    mlist: holdings,
    mode: accountModeSwitch,
    isPropMode: isPropAccount,
    tabbarCls: "tabbar",
    asd: assetSheetView,
    soc: socialPanel,
    socTab: socialsTab,
    tabSoc: state.ptab === "socials",
    iab: browserView,
    cvSocials: chartView === "socials",
    cvNotSocials: chartView !== "socials",
    mtSocials: marketTab === "socials",
    placeOrder: placeOrder,
    ts: tpslSheet,
    toast: toastView,
    notInPreview: showNotConnectedToast,
    cycleTick: () => {
      self.setState({ tickIdx: ((state.tickIdx || 0) + 1) % 4 });
    },
    toggleUnit: () => {
      self.setState({ bookUnit: state.bookUnit === "base" ? "usd" : "base" });
    },
    unitLabel: state.bookUnit === "base" ? market.sym : "USD",
    mtabs: marketTabs,
    mtBook: marketTab === "book",
    mtStats: marketTab === "stats",
    mtInfo: marketTab === "info",
    info: marketInfo,
    shareAsset: makeShareAssetHandler(market.sym),
    accentKey: "mono",
    pfp: state.avatar || LOGOS.pfp,
    levFill: String(Math.round(((state.lev - 1) / Math.max(1, market.max - 1)) * 100)),
    sh: shareCard,
    fund: fundModal,
    theme: state.theme || "dark",
    themeLabel: state.theme === "light" ? "Switch to dark mode" : "Switch to light mode",
    toggleTheme: () => {
      const nextTheme = state.theme === "light" ? "dark" : "light";
      try {
        localStorage.setItem("openfutures-theme", nextTheme);
      } catch {}
      self.setState({ theme: nextTheme });
    },
    home: homeViewModel,
    openMarkets: () => {
      self.setState({ srch: true, sq: "", stab: "markets", sIdx: 0, sMore: null });
    },
    srch: searchView,
    dz: depthChart,
    fz: fundingChart,
    cvTabs: chartTabs,
    cvPrice: chartView === "price",
    cvDepth: chartView === "depth",
    cvFunding: chartView === "funding",
    q: quotePanel,
    wd: watchDetail,
    wdmetrics: metricTabs,
    wdsel: subviewTabs,
    fmHead: venueHeaders,
    wviews: watchViewTabs,
    feed: feedStatus,
    viewMarkets: (state.wview || "markets") === "markets",
    viewExchanges: state.wview === "exchanges",
    viewFunding: state.wview === "funding",
    wsheetState: isMobile && openWatchRow ? "open" : "closed",
    asks: askRows.map(formatBookLevel).reverse(),
    bids: bidRows.map(formatBookLevel),
    midText: formatPrice(midPrice),
    spreadText:
      (((activeBook.asks[0].p - activeBook.bids[0].p) / midPrice) * 10000).toFixed(1) + " bps",
    bidPct: bidSharePct,
    askPct: 100 - bidSharePct,
    cols: gridTemplate,
    h1Cls: "handle" + (state.dragging === "book" ? " is-active" : ""),
    h2Cls: "handle" + (state.dragging === "trade" ? " is-active" : ""),
    h1: makePanelResizeHandlers("book"),
    h2: makePanelResizeHandlers("trade"),
    resetPanes: () => {
      self.setState({
        bookW: DEFAULT_PANE_SIZES.book,
        tradeW: DEFAULT_PANE_SIZES.trade,
        dockH: DEFAULT_PANE_SIZES.dock,
        bookOpen: true,
        tradeOpen: true,
        dockOpen: true,
      });
    },
    bookShow: isBookOpen,
    bookRail: !isBookOpen,
    tradeShow: isTradeOpen,
    tradeRail: !isTradeOpen,
    bookPaneCls: "pane col-book" + (isBookOpen ? "" : " is-rail"),
    tradePaneCls: "pane col-trade" + (isTradeOpen ? "" : " is-rail"),
    collapseBook: () => {
      self.setState({ bookOpen: false });
    },
    expandBook: () => {
      self.setState({ bookOpen: true, bookPinned: true });
    },
    collapseTrade: () => {
      self.setState({ tradeOpen: false });
    },
    expandTrade: () => {
      self.setState({ tradeOpen: true });
    },
    longCls: isLong ? "is-long" : "",
    shortCls: isLong ? "" : "is-short",
    isLongStr: isLong ? "true" : "false",
    isShortStr: isLong ? "false" : "true",
    pickLong: () => {
      self.setState({ side: "long" });
    },
    pickShort: () => {
      self.setState({ side: "short" });
    },
    otypes: [
      ["market", "Market"],
      ["limit", "Limit"],
    ].map((type) => {
      const isActive = state.otype === type[0];
      return {
        label: type[1],
        cls: isActive ? "pill is-active" : "pill",
        pressed: isActive ? "true" : "false",
        pick: () => {
          self.setState({ otype: type[0] });
        },
      };
    }),
    isLimit: state.otype === "limit",
    isMarket: state.otype === "market",
    limit: state.limit === "" ? formatPrice(midPrice).replace(/,/g, "") : state.limit,
    onLimit: (e: any) => {
      self.setState({ limit: e.target.value });
    },
    size: state.size,
    onSize: (e: any) => {
      self.setState({ size: e.target.value });
    },
    chips: [
      [0.25, "25%"],
      [0.5, "50%"],
      [0.75, "75%"],
      [1, "Max"],
    ].map((chip: any) => ({
      label: chip[1],
      pick: () => {
        self.setState({ size: (LIVE_BALANCE * chip[0]).toFixed(2) });
      },
    })),
    lev: effectiveLeverage,
    onLev: (e: any) => {
      self.setState({ lev: parseInt(e.target.value, 10) || 1 });
    },
    posText: formatUsd(positionNotional),
    entryText: hasFullFill || state.otype === "limit" ? "$" + formatPrice(entryPrice) : "-",
    liqText: marginAmount > 0 ? "$" + formatPrice(liquidationPrice) : "-",
    feeText: hasFullFill ? formatUsd(marketFill.fees) : "-",
    hasNudge: !!betterVenue,
    nudge: betterVenue
      ? {
          logo: betterVenue.v.logo,
          name: betterVenue.v.name,
          saveText: formatUsd(betterVenue.save),
          pick: () => {
            const i = { ...state.venue };
            i[market.sym] = betterVenue.v.id;
            self.setState({ venue: i });
          },
        }
      : { logo: "", name: "", saveText: "", pick: null },
    side: state.side,
    ctaText: submitLabel,
    ctaDisabled: isSubmitDisabled,
    sheetLong: () => {
      self.setState({ side: "long", sheet: "open" });
    },
    sheetShort: () => {
      self.setState({ side: "short", sheet: "open" });
    },
    closeAll: closeOverlays,
  };
}
