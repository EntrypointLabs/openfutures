import type { AppProps, TerminalViewModel } from "@/terminal/types";
import { LOGOS } from "@/assets/logos";
import { LIVE_ORDERS, LIVE_POSITIONS } from "@/data/account";
import { MARKETS } from "@/data/markets";
import { PROP_ORDERS, PROP_POSITIONS } from "@/data/prop";
import { ColorType, createChart } from "lightweight-charts";
import { livePrices, setLivePrices, simulatePrices } from "@/lib/prices";
import { Store } from "@/terminal/Store";
import { DEFAULT_PANE_SIZES } from "@/terminal/layout";
import { buildViewModel } from "@/terminal/viewModel";

/** State is still keyed loosely: many keys are only ever created by `setState` calls. */
export type TerminalState = Record<string, any>;

/** Owns the terminal's state, the simulated market feed and the chart instance. */
export class Terminal extends Store<AppProps, TerminalState> {
  // Chart handles, timers and drag bookkeeping are attached as ad-hoc instance fields.
  [field: string]: any;

  constructor(props: AppProps) {
    super(props);
    this.drag = null;
    this.state = {
      sym: "ETH",
      tf: "1H",
      chart: props.initialChart || "candle",
      hover: null,
      hy: 0.5,
      filter: "all",
      query: "",
      obOpen: (() => {
        try {
          if (typeof window === "undefined" || (navigator && navigator.webdriver)) {
            return false;
          } else {
            return !localStorage.getItem("openfutures-onboarded");
          }
        } catch {
          return false;
        }
      })(),
      obStep: 0,
      routing: (() => {
        try {
          return (
            (typeof localStorage !== "undefined" && localStorage.getItem("openfutures-routing")) ||
            "smart"
          );
        } catch {
          return "smart";
        }
      })(),
      prefVenue: (() => {
        try {
          return (
            (typeof localStorage !== "undefined" &&
              localStorage.getItem("openfutures-prefvenue")) ||
            "hyperliquid"
          );
        } catch {
          return "hyperliquid";
        }
      })(),
      termsAt: (() => {
        try {
          return (
            (typeof localStorage !== "undefined" &&
              localStorage.getItem("openfutures-onboarded")) ||
            ""
          );
        } catch {
          return "";
        }
      })(),
      accentKey:
        props.initialAccent ||
        (() => {
          try {
            return (
              (typeof localStorage !== "undefined" && localStorage.getItem("openfutures-accent")) ||
              "green"
            );
          } catch {
            return "green";
          }
        })(),
      avatar: (() => {
        try {
          return (
            (typeof localStorage !== "undefined" && localStorage.getItem("openfutures-avatar")) ||
            ""
          );
        } catch {
          return "";
        }
      })(),
      theme:
        props.initialTheme ||
        (() => {
          try {
            return (
              (typeof localStorage !== "undefined" && localStorage.getItem("openfutures-theme")) ||
              "dark"
            );
          } catch {
            return "dark";
          }
        })(),
      screen:
        props.initialScreen ||
        (typeof window !== "undefined" && window.innerWidth < 768 ? "home" : "detail"),
      account: props.initialAccount || "live",
      profile: props.initialProfile === "open",
      watchOpen: props.initialWatchOpen || null,
      wbook: props.initialWatchBook || null,
      wview: props.initialWview || "markets",
      ppAcct: props.initialPropAccount || "c50",
      wdtab: props.initialWdtab || "venues",
      wq: "",
      xq: "",
      fq: "",
      wcat: "all",
      wsort: "oi",
      wdir: -1,
      propPositions: PROP_POSITIONS,
      propOrders: PROP_ORDERS,
      sheet: props.initialSheet || "closed",
      drawer: props.initialDrawer || "closed",
      vpanel: props.initialVenuePanel === "open",
      venue: {},
      ptab: props.initialTab || "positions",
      positions: LIVE_POSITIONS,
      orders: LIVE_ORDERS,
      dockH:
        typeof window !== "undefined" && window.innerHeight < 760
          ? 160
          : typeof window !== "undefined" && window.innerHeight < 820
            ? 200
            : typeof window !== "undefined" && window.innerHeight < 980
              ? 216
              : DEFAULT_PANE_SIZES.dock,
      dockOpen: true,
      side: "long",
      otype: "market",
      size: "500",
      limit: "",
      lev: 10,
      bookW: DEFAULT_PANE_SIZES.book,
      tradeW: DEFAULT_PANE_SIZES.trade,
      bookOpen: true,
      tradeOpen: true,
      dragging: null,
      fav: {},
      now: Date.now(),
    };
    if (props.initialState) {
      Object.assign(this.state, props.initialState);
    }
  }
  componentDidMount() {
    const self = this;
    this.timer = setInterval(() => {
      const now = Date.now();
      setLivePrices(simulatePrices(now));
      self.setState({ now: now, tick: (self.state.tick || 0) + 1 });
    }, 1000);
    this.onResize = () => {
      self.setState({ vw: window.innerWidth, vh: window.innerHeight });
    };
    window.addEventListener("resize", this.onResize);
    this.onKey = (e: any) => {
      const key = e.key;
      if ((e.metaKey || e.ctrlKey) && key === "/") {
        e.preventDefault();
        self.setState({ aiOpen: !self.state.aiOpen, aiHidden: false, srch: false });
        return;
      }
      if (self.state.chartFs && key === "Escape") {
        self.setState({ chartFs: false });
        return;
      }
      if (self.state.aiOpen && key === "Escape" && !self.state.srch) {
        self.setState({ aiOpen: false });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (key === "k" || key === "K")) {
        e.preventDefault();
        self.setState({ srch: !self.state.srch, sq: "", sIdx: 0, sMore: null });
        return;
      }
      if (!self.state.srch) {
        if (key === "/" && !/input|textarea/i.test((e.target && e.target.tagName) || "")) {
          e.preventDefault();
          self.setState({ srch: true, sq: "", sIdx: 0 });
        }
        return;
      }
      if (key === "Escape") {
        e.preventDefault();
        self.setState({ srch: false });
      }
    };
    window.addEventListener("keydown", this.onKey);
    const symByLogoSrc: any = {};
    MARKETS.forEach((market) => {
      const logo = LOGOS[market.sym.toLowerCase()];
      if (logo) {
        symByLogoSrc[logo] = market.sym;
      }
    });
    function resolveLogo(target: any) {
      const img = target && target.closest ? target.closest("img.logo") : null;
      if (
        !img ||
        img.hasAttribute("data-venue") ||
        img.closest("#share-card") ||
        img.closest(".asd-head") ||
        img.closest(".copy-position[aria-haspopup='dialog']")
      ) {
        return null;
      }
      const sym = symByLogoSrc[img.getAttribute("src")];
      if (sym) {
        return { img: img, sym: sym };
      } else {
        return null;
      }
    }
    this.onLogoClick = (e: any) => {
      const hit = resolveLogo(e.target);
      if (hit) {
        e.preventDefault();
        e.stopPropagation();
        self.setState({
          assetSheet: hit.sym,
          srch: false,
          hmDet: null,
          iab: null,
          drawer: "closed",
          profile: false,
        });
      }
    };
    this.onLogoOver = (e: any) => {
      const hit = resolveLogo(e.target);
      if (hit && !hit.img.dataset.asset) {
        hit.img.dataset.asset = "1";
        hit.img.title = "View " + hit.sym + " details";
      }
    };
    document.addEventListener("click", this.onLogoClick, true);
    this.onFsChange = () => {
      const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
      if (!fullscreenElement && self.state.chartFs) {
        self.setState({ chartFs: false });
      }
    };
    document.addEventListener("fullscreenchange", this.onFsChange);
    document.addEventListener("webkitfullscreenchange", this.onFsChange);
    try {
      if (typeof window !== "undefined" && window.claude && window.claude.use) {
        window.claude
          .use("sample")
          .then((sample: any) => {
            self._sample = sample || null;
          })
          .catch(() => {});
        window.claude
          .use("downloads")
          .then((downloads: any) => {
            self._dl = downloads || null;
          })
          .catch(() => {});
      }
    } catch {}
    document.addEventListener("mouseover", this.onLogoOver);
  }
  componentWillUnmount() {
    try {
      if (this._lw) {
        this._lw.remove();
      }
    } catch {}
    this._lw = null;
    clearInterval(this.timer);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKey);
    document.removeEventListener("click", this.onLogoClick, true);
    document.removeEventListener("mouseover", this.onLogoOver);
  }
  loadScript(src: any) {
    const win: any = window;
    win.__ofScripts = win.__ofScripts || {};
    win.__ofScripts[src] ||= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return win.__ofScripts[src];
  }
  taCalc(bars: any) {
    const closes = bars.map((bar: any) => bar.close);
    const result: any = {};
    function sma(period: any) {
      const points = [];
      let sum = 0;
      for (let i = 0; i < closes.length; i++) {
        sum += closes[i];
        if (i >= period) {
          sum -= closes[i - period];
        }
        if (i >= period - 1) {
          points.push({ time: bars[i].time, value: sum / period });
        }
      }
      return points;
    }
    function ema(values: any, emaPeriod: any) {
      const k = 2 / (emaPeriod + 1);
      const emaValues = [];
      let prevEma = values[0];
      for (let j = 0; j < values.length; j++) {
        prevEma = j ? values[j] * k + prevEma * (1 - k) : values[0];
        emaValues.push(prevEma);
      }
      return emaValues;
    }
    result.ma20 = sma(20);
    result.ma50 = sma(50);
    const ema200 = ema(closes, 200);
    result.ema200 = ema200
      .map((value, idx) => ({ time: bars[idx].time, value: value }))
      .slice(Math.min(30, closes.length - 1));
    const upperBand = [];
    const lowerBand = [];
    const middleBand = [];
    for (let n = 19; n < closes.length; n++) {
      const window20 = closes.slice(n - 19, n + 1);
      var bandMean = window20.reduce((acc: any, v: any) => acc + v, 0) / 20;
      const stdDev = Math.sqrt(
        window20.reduce((acc: any, v: any) => acc + (v - bandMean) * (v - bandMean), 0) / 20,
      );
      middleBand.push({ time: bars[n].time, value: bandMean });
      upperBand.push({ time: bars[n].time, value: bandMean + stdDev * 2 });
      lowerBand.push({ time: bars[n].time, value: bandMean - stdDev * 2 });
    }
    result.bb = [upperBand, middleBand, lowerBand];
    let cumPriceVolume = 0;
    let cumVolume = 0;
    result.vwap = bars.map((bar: any) => {
      const typicalPrice = (bar.high + bar.low + bar.close) / 3;
      cumPriceVolume += typicalPrice * bar.value;
      cumVolume += bar.value;
      return { time: bar.time, value: cumPriceVolume / (cumVolume || 1) };
    });
    let avgGain = 0;
    let avgLoss = 0;
    const rsiPoints = [];
    for (let m = 1; m < closes.length; m++) {
      const change = closes[m] - closes[m - 1];
      const gain = Math.max(change, 0);
      const loss = Math.max(-change, 0);
      if (m <= 14) {
        avgGain += gain / 14;
        avgLoss += loss / 14;
      } else {
        avgGain = (avgGain * 13 + gain) / 14;
        avgLoss = (avgLoss * 13 + loss) / 14;
      }
      if (m >= 14) {
        rsiPoints.push({
          time: bars[m].time,
          value: avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss),
        });
      }
    }
    result.rsi = rsiPoints;
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const macdLine = closes.map((value: any, idx: any) => ema12[idx] - ema26[idx]);
    const signalLine = ema(macdLine, 9);
    result.macd = [
      macdLine.map((value: any, idx: any) => ({ time: bars[idx].time, value: value })).slice(26),
      signalLine.map((value, idx) => ({ time: bars[idx].time, value: value })).slice(26),
      macdLine
        .map((value: any, idx: any) => {
          const histogram = value - signalLine[idx];
          return {
            time: bars[idx].time,
            value: histogram,
            color: histogram >= 0 ? "rgba(59,111,246,0.55)" : "rgba(229,72,77,0.55)",
          };
        })
        .slice(26),
    ];
    return result;
  }
  syncTA(chartData: any, colors: any) {
    const self = this;
    const taState = this._taState || { ind: { vol: true } };
    const chart = this._lw;
    if (!!chart && !!this._lwMain) {
      const indicators = taState.ind;
      const subPaneCount = (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0);
      const subPaneHeight = subPaneCount * 0.18;
      const signature = JSON.stringify(indicators) + "|" + this._lwKey;
      const calc: any = this.taCalc(chartData.bars);
      if (this._taSig !== signature) {
        (this._taSeries || []).forEach((series: any) => {
          try {
            chart.removeSeries(series);
          } catch {}
        });
        this._taSeries = [];
        this._taMap = {};
        function addSeries(key: any, createSeries: any) {
          const created = createSeries();
          self._taSeries.push(created);
          (self._taMap[key] = self._taMap[key] || []).push(created);
          return created;
        }
        function lineOptions(color: any, lineWidth?: any, extra?: any) {
          return {
            color: color,
            lineWidth: lineWidth || 1.5,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
            ...(extra || {}),
          };
        }
        if (indicators.ma20) {
          addSeries("ma20", () => chart.addLineSeries(lineOptions("#e5b75a")));
        }
        if (indicators.ma50) {
          addSeries("ma50", () => chart.addLineSeries(lineOptions("#b49cff")));
        }
        if (indicators.ema200) {
          addSeries("ema200", () => chart.addLineSeries(lineOptions("#4fd1b8")));
        }
        if (indicators.vwap) {
          addSeries("vwap", () =>
            chart.addLineSeries(lineOptions("#f0a35a", 1.5, { lineStyle: 2 })),
          );
        }
        if (indicators.bb) {
          addSeries("bb", () => chart.addLineSeries(lineOptions("rgba(150,150,148,0.8)", 1)));
          addSeries("bb", () =>
            chart.addLineSeries(lineOptions("rgba(150,150,148,0.45)", 1, { lineStyle: 2 })),
          );
          addSeries("bb", () => chart.addLineSeries(lineOptions("rgba(150,150,148,0.8)", 1)));
        }
        if (indicators.rsi) {
          const rsiSeries = addSeries("rsi", () =>
            chart.addLineSeries(
              lineOptions("#b49cff", 1.5, { priceScaleId: "rsi", lastValueVisible: true }),
            ),
          );
          rsiSeries.createPriceLine({
            price: 70,
            color: "rgba(229,72,77,0.5)",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: false,
          });
          rsiSeries.createPriceLine({
            price: 30,
            color: "rgba(59,111,246,0.5)",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: false,
          });
        }
        if (indicators.macd) {
          addSeries("macd", () =>
            chart.addHistogramSeries({
              priceScaleId: "macd",
              priceLineVisible: false,
              lastValueVisible: false,
            }),
          );
          addSeries("macd", () =>
            chart.addLineSeries(lineOptions("#6f97ff", 1.5, { priceScaleId: "macd" })),
          );
          addSeries("macd", () =>
            chart.addLineSeries(lineOptions("#f0a35a", 1.5, { priceScaleId: "macd" })),
          );
        }
        chart
          .priceScale("right")
          .applyOptions({
            scaleMargins: { top: 0.05, bottom: subPaneHeight + (indicators.vol ? 0.14 : 0.04) },
          });
        try {
          chart
            .priceScale("vol")
            .applyOptions({
              scaleMargins: { top: 1 - subPaneHeight - 0.13, bottom: subPaneHeight },
            });
        } catch {}
        if (indicators.rsi) {
          chart
            .priceScale("rsi")
            .applyOptions({
              scaleMargins: { top: 1 - subPaneHeight + 0.02, bottom: indicators.macd ? 0.18 : 0 },
              borderVisible: false,
            });
        }
        if (indicators.macd) {
          chart
            .priceScale("macd")
            .applyOptions({
              scaleMargins: { top: 0.8400000000000001, bottom: 0 },
              borderVisible: false,
            });
        }
        this._lwVol.applyOptions({ visible: !!indicators.vol });
        this._taSig = signature;
      }
      const taMap = this._taMap || {};
      function setSeriesData(seriesKey: any, seriesIndex: any, seriesData: any) {
        const seriesList = taMap[seriesKey];
        if (seriesList && seriesList[seriesIndex]) {
          try {
            seriesList[seriesIndex].setData(seriesData);
          } catch {}
        }
      }
      setSeriesData("ma20", 0, calc.ma20);
      setSeriesData("ma50", 0, calc.ma50);
      setSeriesData("ema200", 0, calc.ema200);
      setSeriesData("vwap", 0, calc.vwap);
      setSeriesData("bb", 0, calc.bb[0]);
      setSeriesData("bb", 1, calc.bb[1]);
      setSeriesData("bb", 2, calc.bb[2]);
      setSeriesData("rsi", 0, calc.rsi);
      setSeriesData("macd", 0, calc.macd[2]);
      setSeriesData("macd", 1, calc.macd[0]);
      setSeriesData("macd", 2, calc.macd[1]);
      function lastValue(points: any) {
        if (points && points.length) {
          return points[points.length - 1].value;
        } else {
          return null;
        }
      }
      function formatValue(value: any) {
        if (value == null) {
          return "";
        } else if (value >= 1000) {
          return value.toFixed(2);
        } else {
          return value.toPrecision(6);
        }
      }
      this._taLegend = [
        { id: "ma20", name: "MA 20", color: "#e5b75a", val: formatValue(lastValue(calc.ma20)) },
        { id: "ma50", name: "MA 50", color: "#b49cff", val: formatValue(lastValue(calc.ma50)) },
        {
          id: "ema200",
          name: "EMA 200",
          color: "#4fd1b8",
          val: formatValue(lastValue(calc.ema200)),
        },
        {
          id: "bb",
          name: "BB",
          color: "#8b8b88",
          val: formatValue(lastValue(calc.bb[0])) + " / " + formatValue(lastValue(calc.bb[2])),
        },
        { id: "vwap", name: "VWAP", color: "#f0a35a", val: formatValue(lastValue(calc.vwap)) },
        { id: "rsi", name: "RSI", color: "#b49cff", val: (lastValue(calc.rsi) || 0).toFixed(1) },
        {
          id: "macd",
          name: "MACD",
          color: "#6f97ff",
          val: (lastValue(calc.macd[0]) || 0).toFixed(3),
        },
      ];
      this.syncDraws(chartData);
    }
  }
  syncDraws(chartData: any) {
    const self = this;
    const chart = this._lw;
    const mainSeries = this._lwMain;
    const p = this._taState || { draws: [] };
    if (!!chart && !!mainSeries) {
      const signature = JSON.stringify(p.draws) + "|" + this._lwKey;
      if (this._drSig !== signature) {
        (this._drSeries || []).forEach((series: any) => {
          try {
            chart.removeSeries(series);
          } catch {}
        });
        (this._drLines || []).forEach((priceLine: any) => {
          try {
            mainSeries.removePriceLine(priceLine);
          } catch {}
        });
        this._drSeries = [];
        this._drLines = [];
        const defaultColor = "#f5c451";
        const lastTime = chartData.bars.length ? chartData.bars[chartData.bars.length - 1].time : 0;
        const barInterval =
          chartData.bars.length > 1 ? chartData.bars[1].time - chartData.bars[0].time : 3600;
        function addLine(linePoints: any, lineColor?: any, lineStyle?: any) {
          const lineSeries = chart.addLineSeries({
            color: lineColor || defaultColor,
            lineWidth: 2,
            lineStyle: lineStyle || 0,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          const seenTimes: any = {};
          const uniquePoints = linePoints
            .filter((point: any) => {
              if (seenTimes[point.time]) {
                return false;
              } else {
                seenTimes[point.time] = 1;
                return true;
              }
            })
            .sort((a: any, b: any) => a.time - b.time);
          try {
            lineSeries.setData(uniquePoints);
          } catch {}
          self._drSeries.push(lineSeries);
        }
        p.draws.forEach((drawing: any) => {
          if (drawing.type === "hline") {
            self._drLines.push(
              mainSeries.createPriceLine({
                price: drawing.p1.price,
                color: defaultColor,
                lineWidth: 1,
                lineStyle: 0,
                axisLabelVisible: true,
                title: "",
              }),
            );
          } else if (drawing.type === "trend") {
            addLine([
              { time: drawing.p1.time, value: drawing.p1.price },
              { time: drawing.p2.time, value: drawing.p2.price },
            ]);
          } else if (drawing.type === "ray") {
            const timeSpan = drawing.p2.time - drawing.p1.time || barInterval;
            const slope = (drawing.p2.price - drawing.p1.price) / timeSpan;
            const endTime = lastTime + barInterval * 20;
            addLine([
              { time: drawing.p1.time, value: drawing.p1.price },
              { time: endTime, value: drawing.p1.price + slope * (endTime - drawing.p1.time) },
            ]);
          } else if (drawing.type === "rect") {
            const p1 = drawing.p1;
            const p2 = drawing.p2;
            addLine(
              [
                { time: p1.time, value: p1.price },
                { time: p2.time, value: p1.price },
              ],
              "rgba(245,196,81,0.9)",
            );
            addLine(
              [
                { time: p1.time, value: p2.price },
                { time: p2.time, value: p2.price },
              ],
              "rgba(245,196,81,0.9)",
            );
          } else if (drawing.type === "fib") {
            const high = Math.max(drawing.p1.price, drawing.p2.price);
            const low = Math.min(drawing.p1.price, drawing.p2.price);
            [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].forEach((ratio) => {
              self._drLines.push(
                mainSeries.createPriceLine({
                  price: high - (high - low) * ratio,
                  color:
                    ratio === 0.618 || ratio === 0.5
                      ? "rgba(245,196,81,0.95)"
                      : "rgba(245,196,81,0.55)",
                  lineWidth: 1,
                  lineStyle: ratio === 0 || ratio === 1 ? 0 : 2,
                  axisLabelVisible: true,
                  title: (ratio * 100).toFixed(1) + "%",
                }),
              );
            });
            addLine(
              [
                { time: drawing.p1.time, value: drawing.p1.price },
                { time: drawing.p2.time, value: drawing.p2.price },
              ],
              "rgba(245,196,81,0.5)",
              2,
            );
          }
        });
        this._drSig = signature;
      }
    }
  }
  taClick(click: any) {
    const taState = this._taState;
    if (!!taState && taState.tool !== "cursor" && !!click && !!click.point && !!this._lwMain) {
      const price = this._lwMain.coordinateToPrice(click.point.y);
      let time = click.time || this._lw.timeScale().coordinateToTime(click.point.x);
      if (time == null) {
        try {
          const logical = this._lw.timeScale().coordinateToLogical(click.point.x);
          const O = this._tvData ? this._tvData.bars : [];
          if (logical != null && O.length) {
            const interval = O.length > 1 ? O[1].time - O[0].time : 3600;
            time = O[O.length - 1].time + Math.round(logical - (O.length - 1)) * interval;
          }
        } catch {}
      }
      if (price != null && time != null) {
        const point = { time: time, price: price };
        const tool = taState.tool;
        const allDraws = { ...(this.state.draws || {}) };
        const symDraws = (allDraws[taState.sym] || []).slice();
        if (tool === "hline") {
          symDraws.push({ type: "hline", p1: point });
          allDraws[taState.sym] = symDraws;
          this.setState({ draws: allDraws });
          return;
        }
        if (!this._taPend) {
          this._taPend = point;
          this.setState({ taPend: true });
          return;
        }
        const pending = this._taPend;
        this._taPend = null;
        if (tool === "measure") {
          const delta = point.price - pending.price;
          const pct = (delta / pending.price) * 100;
          const tvData = this._tvData;
          const barInterval =
            tvData && tvData.bars.length > 1 ? tvData.bars[1].time - tvData.bars[0].time : 3600;
          const barCount = Math.round(Math.abs(point.time - pending.time) / barInterval);
          this.setState({
            taPend: false,
            toast: {
              text:
                (pct >= 0 ? "+" : "") +
                pct.toFixed(2) +
                "% (" +
                (delta >= 0 ? "+" : "-") +
                "$" +
                Math.abs(delta).toFixed(2) +
                ") over " +
                barCount +
                " bars.",
              id: Date.now(),
            },
          });
          const self = this;
          clearTimeout(this._toastT);
          this._toastT = setTimeout(() => {
            self.setState({ toast: null });
          }, 4200);
          return;
        }
        symDraws.push({ type: tool, p1: pending, p2: point });
        allDraws[taState.sym] = symDraws;
        this.setState({ draws: allDraws, taPend: false });
      }
    }
  }
  syncTv() {
    const self = this;
    const host = typeof document !== "undefined" ? document.getElementById("tv-host") : null;
    const data = this._tvData;
    if (!host || !data) {
      if (this._lw && !host) {
        try {
          this._lw.remove();
        } catch {}
        this._lw = null;
        this._lwEl = null;
      }
      this._tvEl = null;
      return;
    }
    const hostStyle = getComputedStyle(host);
    function cssVar(varName: any, fallback: any) {
      return (hostStyle.getPropertyValue(varName) || "").trim() || fallback;
    }
    const colors = {
      up: cssVar("--c-up", "#3b6ff6"),
      dn: cssVar("--c-dn", "#e5484d"),
      upW: cssVar("--c-up-wick", "#6f97ff"),
      dnW: cssVar("--c-dn-wick", "#ff7a7e"),
      text: cssVar("--text-3", "#969694"),
      grid: cssVar("--line-1", "#1f1f1f"),
      line: cssVar("--line-2", "#242424"),
    };
    if (this.props.tvWidget) {
      const widgetKey = data.tvSymbol + "|" + data.interval + "|" + data.candle + "|" + data.theme;
      if (this._tvEl === host && this._tvKey === widgetKey) {
        return;
      }
      this._tvEl = host;
      this._tvKey = widgetKey;
      host.innerHTML = "";
      const widgetEl = document.createElement("div");
      widgetEl.id = "tvw-" + Date.now();
      widgetEl.style.cssText = "width:100%;height:100%";
      host.appendChild(widgetEl);
      this.loadScript("https://s3.tradingview.com/tv.js")
        .then(() => {
          if (!!window.TradingView && self._tvKey === widgetKey) {
            new window.TradingView.widget({
              autosize: true,
              symbol: data.tvSymbol,
              interval: data.interval,
              timezone: "Etc/UTC",
              theme: data.theme === "light" ? "light" : "dark",
              style: data.candle ? "1" : "2",
              locale: "en",
              hide_top_toolbar: false,
              hide_side_toolbar: false,
              allow_symbol_change: false,
              save_image: true,
              withdateranges: true,
              details: false,
              hotlist: false,
              studies: [],
              container_id: widgetEl.id,
              backgroundColor: cssVar("--surface", "#161616"),
              gridColor: colors.grid,
              overrides: {
                "mainSeriesProperties.candleStyle.upColor": colors.up,
                "mainSeriesProperties.candleStyle.downColor": colors.dn,
                "mainSeriesProperties.candleStyle.wickUpColor": colors.upW,
                "mainSeriesProperties.candleStyle.wickDownColor": colors.dnW,
                "mainSeriesProperties.candleStyle.borderUpColor": colors.up,
                "mainSeriesProperties.candleStyle.borderDownColor": colors.dn,
              },
            });
          }
        })
        .catch(() => {
          host.innerHTML = '<p class="tv-err">TradingView chart could not load.</p>';
        });
      return;
    }
    if (this._lwEl !== host) {
      if (this._lw) {
        try {
          this._lw.remove();
        } catch {}
      }
      host.innerHTML = "";
      this._lw = createChart(host, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: colors.text,
          fontFamily: getComputedStyle(document.body).fontFamily,
          fontSize: 10,
        },
        grid: { vertLines: { visible: false }, horzLines: { color: colors.grid } },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.06, bottom: 0.2 },
          entireTextOnly: true,
          minimumWidth: 0,
        },
        timeScale: {
          borderVisible: false,
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 3,
        },
        crosshair: { mode: 0 },
        handleScroll: true,
        handleScale: true,
      });
      this._lwEl = host;
      this._lwKey = null;
      this._lwMain = null;
      this._lwVol = null;
      this._taSig = null;
      this._drSig = null;
      this._taSeries = [];
      this._drSeries = [];
      this._drLines = [];
      const owner = this;
      let pointerStart: any = null;
      host.addEventListener("pointerdown", (e) => {
        pointerStart = { x: e.clientX, y: e.clientY };
      });
      host.addEventListener("pointerup", (e) => {
        if (pointerStart) {
          const dragDistance =
            Math.abs(e.clientX - pointerStart.x) + Math.abs(e.clientY - pointerStart.y);
          pointerStart = null;
          if (!(dragDistance > 6)) {
            const rect = host.getBoundingClientRect();
            owner.taClick({ point: { x: e.clientX - rect.left, y: e.clientY - rect.top } });
          }
        }
      });
      try {
        if (this._lwRO) {
          this._lwRO.disconnect();
        }
        const component = this;
        let lastWidth = 0;
        this._lwRO = new ResizeObserver((entries) => {
          const width = Math.round(entries[0].contentRect.width);
          if (Math.abs(width - lastWidth) > 40 && component._lw) {
            lastWidth = width;
            requestAnimationFrame(() => {
              component.applyVisibleRange();
            });
          }
        });
        this._lwRO.observe(host);
      } catch {}
    }
    const dataKey = data.sym + "|" + data.tf + "|" + data.candle + "|" + data.theme;
    const volumeData = data.bars.map((bar: any) => ({
      time: bar.time,
      value: bar.value,
      color: bar.close >= bar.open ? "rgba(59,111,246,0.38)" : "rgba(229,72,77,0.42)",
    }));
    const mainData = data.candle
      ? data.bars.map((bar: any) => ({
          time: bar.time,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        }))
      : data.bars.map((bar: any) => ({ time: bar.time, value: bar.close }));
    if (this._lwKey !== dataKey) {
      if (this._lwMain) {
        try {
          this._lw.removeSeries(this._lwMain);
        } catch {}
      }
      if (this._lwVol) {
        try {
          this._lw.removeSeries(this._lwVol);
        } catch {}
      }
      this._lw.applyOptions({
        layout: { textColor: colors.text },
        grid: { vertLines: { visible: false }, horzLines: { color: colors.grid } },
      });
      const priceFormat = { type: "price", precision: data.dec, minMove: Math.pow(10, -data.dec) };
      this._lwMain = data.candle
        ? this._lw.addCandlestickSeries({
            upColor: colors.up,
            downColor: colors.dn,
            borderUpColor: colors.up,
            borderDownColor: colors.dn,
            wickUpColor: colors.upW,
            wickDownColor: colors.dnW,
            priceFormat: priceFormat,
          })
        : this._lw.addAreaSeries({
            lineColor: colors.up,
            topColor: "rgba(59,111,246,0.22)",
            bottomColor: "rgba(59,111,246,0)",
            lineWidth: 2,
            priceFormat: priceFormat,
          });
      this._lwVol = this._lw.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
        lastValueVisible: false,
        priceLineVisible: false,
      });
      this._lw.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      this._lwMain.setData(mainData);
      this._lwVol.setData(volumeData);
      this._taSig = null;
      this._drSig = null;
      this._drLines = [];
      this._lw.timeScale().fitContent();
      this._lwKey = dataKey;
    } else {
      try {
        this._lwMain.update(mainData[mainData.length - 1]);
        this._lwVol.update(volumeData[volumeData.length - 1]);
      } catch {}
    }
    if (this._lwMain) {
      try {
        this._lw
          .priceScale("right")
          .applyOptions({
            mode: data.scale === "log" ? 1 : data.scale === "pct" ? 2 : 0,
            autoScale: data.auto !== false,
          });
      } catch {}
      const rangeKey = data.sym + "|" + data.tf + "|" + data.rangeId + "|" + this._lwKey;
      if (this._rangeKey !== rangeKey) {
        this._rangeKey = rangeKey;
        this.applyVisibleRange();
      }
      this.syncTA(data, colors);
    }
  }
  /** Shows the selected range, or the most recent bars when none is selected. */
  applyVisibleRange() {
    const data = this._tvData;
    if (!this._lw || !data) {
      return;
    }
    const barCount = data.bars.length;
    const rangeBars = data.rangeBars;
    const timeScale = this._lw.timeScale();
    try {
      if (rangeBars && rangeBars < barCount) {
        timeScale.setVisibleLogicalRange({ from: barCount - rangeBars, to: barCount + 2 });
      } else if (rangeBars === 0 || data.recentBars >= barCount) {
        timeScale.fitContent();
      } else {
        // Older history stays off-screen until the user scrolls, zooms out or picks "All".
        timeScale.setVisibleLogicalRange({
          from: barCount - data.recentBars - 0.5,
          to: barCount + 2,
        });
      }
    } catch {}
  }
  componentDidUpdate(prevProps: any) {
    const props = this.props;
    if (prevProps.initialScreen !== props.initialScreen && props.initialScreen) {
      this.setState({ screen: props.initialScreen });
    }
    if (prevProps.initialSheet !== props.initialSheet && props.initialSheet) {
      this.setState({ sheet: props.initialSheet });
    }
    if (prevProps.initialChart !== props.initialChart && props.initialChart) {
      this.setState({ chart: props.initialChart });
    }
    if (prevProps.initialDrawer !== props.initialDrawer && props.initialDrawer) {
      this.setState({ drawer: props.initialDrawer });
    }
    if (prevProps.initialVenuePanel !== props.initialVenuePanel) {
      this.setState({ vpanel: props.initialVenuePanel === "open" });
    }
    if (prevProps.initialTab !== props.initialTab && props.initialTab) {
      this.setState({ ptab: props.initialTab });
    }
    if (prevProps.initialAccount !== props.initialAccount && props.initialAccount) {
      this.setState({ account: props.initialAccount });
    }
    if (prevProps.initialProfile !== props.initialProfile) {
      this.setState({ profile: props.initialProfile === "open" });
    }
    if (prevProps.initialWatchOpen !== props.initialWatchOpen) {
      this.setState({ watchOpen: props.initialWatchOpen || null });
    }
  }
  renderVals(): TerminalViewModel {
    return buildViewModel(this);
  }
}
