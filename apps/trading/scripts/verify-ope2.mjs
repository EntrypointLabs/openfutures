import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { verifyLiquidity } from "./verify-liquidity.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({
  root,
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  appType: "custom",
});
let checks = 0;
const check = (name, run) => {
  run();
  checks++;
  console.log(`PASS ${name}`);
};
try {
  const { routeFromUrl, urlFromState, titleFromState } =
    await server.ssrLoadModule("/src/router/paths.ts");
  const base = {
    screen: "detail",
    sym: "ETH",
    account: "live",
    wview: "markets",
    lqView: "vaults",
    profile: false,
  };
  for (const [path, search] of [
    ["/trade/ETH", ""],
    ["/watch", ""],
    ["/watch/exchanges", ""],
    ["/watch/funding", ""],
    ["/liquidity", ""],
    ["/liquidity/analytics", ""],
    ["/prop", ""],
    ["/profile", ""],
    ["/copy", ""],
    ["/copy/perp.queen", ""],
    ["/points", ""],
  ]) {
    check(`route round trip ${path}`, () => {
      const route = routeFromUrl(path, search);
      assert.ok(route);
      assert.equal(urlFromState({ ...base, ...route }, true), path);
      assert.match(titleFromState({ ...base, ...route }, true), /OpenFutures$/);
    });
  }
  check("existing market and profile query routes", () => {
    const state = { ...base, ...routeFromUrl("/watch/exchanges", "?market=btc&profile") };
    assert.equal(state.watchOpen, "BTC");
    assert.equal(state.profile, true);
    assert.equal(urlFromState(state, false), "/watch/exchanges?market=BTC&profile");
    assert.equal(routeFromUrl("/watch/unknown", ""), null);
  });
  // WATCH CHECK SECTION: the native Watch components and card controls.
  const { buildAnalyticsCard } = await server.ssrLoadModule("/src/terminal/analytics.ts");
  check("analytics aggregation and per-card controls", () => {
    const cardState = {},
      set = (patch) => Object.assign(cardState, patch);
    const spec = {
      id: "verification",
      title: "Volume",
      sub: "Per card",
      series: [
        { name: "One", color: "#00f", data: Array.from({ length: 14 }, (_, i) => i + 1) },
        { name: "Two", color: "#f00", data: new Array(14).fill(2) },
      ],
      dates: Array.from({ length: 14 }, (_, i) => Date.UTC(2026, 8, i + 1)),
      agg: "sum",
    };
    let card = buildAnalyticsCard(spec, cardState, set);
    assert.equal(card.xTicks.length, 9);
    card.gran.opts[1].pick();
    card = buildAnalyticsCard(spec, cardState, set);
    assert.equal(card.gran.cur, "Weekly");
    assert.equal(card.xTicks.length, 2);
    card.move({
      currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 100 }) },
      clientX: 75,
    });
    card = buildAnalyticsCard(spec, cardState, set);
    assert.deepEqual(
      card.tip.rows.map((row) => row.val),
      ["77", "14"],
    );
    assert.equal(card.tip.total, "91");
    card.modes.items[1].pick();
    card = buildAnalyticsCard(spec, cardState, set);
    assert.deepEqual(
      card.yTicks.map((tick) => tick.label),
      ["0%", "25%", "50%", "75%", "100%"],
    );
    card.legend[0].toggle();
    card = buildAnalyticsCard(spec, cardState, set);
    assert.equal(card.paths.length, 1);
    card.legend[1].toggle();
    assert.equal(cardState.acOff.verification.Two, undefined);
    const other = buildAnalyticsCard({ ...spec, id: "independent" }, cardState, set);
    assert.equal(other.paths.length, 2);
    assert.equal(other.gran.cur, "Daily");
  });
  const { Terminal: WatchTerminal } = await server.ssrLoadModule("/src/terminal/Terminal.ts");
  const { WatchPage: NativeWatchPage } = await server.ssrLoadModule(
    "/src/components/watch/WatchPage.tsx",
  );
  const { createElement: watchElement } = await import("react");
  const { renderToStaticMarkup: watchMarkup } = await import("react-dom/server");
  for (const width of [390, 1440])
    for (const theme of ["dark", "light"])
      for (const view of ["markets", "exchanges", "funding"]) {
        check(`native Watch ${view} ${width} ${theme}`, () => {
          const terminal = new WatchTerminal({
            initialScreen: "watch",
            initialTheme: theme,
            initialState: { vw: width, wview: view, now: Date.UTC(2026, 9, 2, 12) },
          });
          const vm = terminal.renderVals();
          assert.equal(vm.mw.kpis.length, 4);
          assert.equal(vm.mw.cards.length, view === "funding" ? 2 : 4);
          const html = watchMarkup(watchElement(NativeWatchPage, { vm }));
          assert.match(html, /class="ac-grid"/);
          assert.doesNotMatch(html, /Venue Insights|Carry Opportunities|League Table/);
          assert.ok(
            vm.mw.cards.every((card) => card.paths.every((path) => !path.d.includes("NaN"))),
          );
          if (view === "markets") {
            assert.ok(
              vm.wrowsP.every(
                (row) =>
                  ![row.volN, row.oiN, row.chgN, row.fundN].some((value) => /[$%]/.test(value)),
              ),
            );
            assert.match(html, /Price \(USD\)/);
            assert.match(html, /24h change \(%\)/);
            assert.ok(
              vm.mw.perf.rows.every((row) => row.cells.every((cell) => !cell.v.includes("%"))),
            );
          }
          if (view === "exchanges") {
            assert.ok(vm.exListP.some((row) => row.name === "Bybit"));
            assert.ok(vm.exListP.some((row) => row.name === "GMX"));
            vm.exListP[0].toggle();
            const expanded = terminal.renderVals();
            assert.equal(expanded.exListP[0].isOpen, true);
            assert.match(
              watchMarkup(watchElement(NativeWatchPage, { vm: expanded })),
              /Turnover \(x\)/,
            );
          }
          if (view === "funding") {
            const numeric = vm.fmRowsP.map((row) => Number(row.spread));
            assert.ok(numeric.every((value, index) => index === 0 || value <= numeric[index - 1]));
            assert.ok(
              vm.fmRowsP.every(
                (row) =>
                  !/[\$%]/.test(row.spread + row.carry + row.cells.map((cell) => cell.v).join("")),
              ),
            );
            const carry = vm.fmRowsP.map((row) => row.carry);
            vm.fmRowsP[0].toggle();
            assert.equal(terminal.renderVals().fmRowsP[0].isOpen, true);
            vm.mw.tdd.rate.items[2].pick();
            assert.deepEqual(
              terminal.renderVals().fmRowsP.map((row) => row.carry),
              carry,
            );
            assert.match(html, /Carry on 10K \(USD\)/);
          }
        });
      }
  check("Funding asset class and search remain independent from Markets", () => {
    const terminal = new WatchTerminal({
      initialScreen: "watch",
      initialState: { vw: 390, wview: "funding", wcat: "Crypto", now: Date.UTC(2026, 9, 14) },
    });
    const initial = terminal.renderVals();
    assert.equal(initial.fmRowsP.length, 10);
    initial.mw.tdd.fcat.opts.find((option) => option.label === "Stocks").pick();
    let vm = terminal.renderVals();
    assert.deepEqual(vm.fmRowsP.map((row) => row.sym).sort(), ["AAPL", "NVDA", "TSLA"]);
    assert.equal(terminal.state.wcat, "Crypto");
    vm.onFq({ target: { value: "NVDA" } });
    vm = terminal.renderVals();
    assert.deepEqual(
      vm.fmRowsP.map((row) => row.sym),
      ["NVDA"],
    );
    assert.equal(terminal.state.wq, "");
    assert.equal(terminal.state.xq, "");
  });
  // END WATCH CHECK SECTION.
  const { buildLiquidityViewModel, cleanAmount } = await server.ssrLoadModule(
    "/src/terminal/liquidity/viewModel.ts",
  );
  check("Liquidity deposit, withdrawal, exit and analytics behavior", () =>
    verifyLiquidity(assert, buildLiquidityViewModel, cleanAmount),
  );
  // COPY AND POINTS CHECKS.
  const { CopyPage } = await server.ssrLoadModule("/src/components/copy/CopyPage.tsx");
  const newTerminal = (screen, width = 390, theme = "dark", state = {}) =>
    new WatchTerminal({
      initialScreen: screen,
      initialTheme: theme,
      initialState: { vw: width, now: Date.UTC(2026, 9, 14, 12), ...state },
    });
  check("Copy calendar keeps mirrored positions and Stats selected", () => {
    const terminal = newTerminal("copy", 390, "dark", { cpOpen: "perp.queen" });
    let cp = terminal.renderVals().cp;
    assert.ok(cp.detail.mine.positions.length > 0);
    const mirrored = cp.detail.mine.positions.map((position) => position.key);
    cp.detail.segments.find((tab) => tab.label === "Stats").pick();
    cp = terminal.renderVals().cp;
    cp.detail.views.find((tab) => tab.label === "Calendar").pick();
    cp = terminal.renderVals().cp;
    assert.equal(cp.detail.segment, "stats");
    assert.equal(cp.detail.view, "cal");
    assert.deepEqual(
      cp.detail.mine.positions.map((position) => position.key),
      mirrored,
    );
    assert.equal(cp.detail.statsLists.length, 2);
    assert.ok(cp.detail.calendar.days.length >= 28 && cp.detail.calendar.days.length <= 42);
    const html = watchMarkup(watchElement(CopyPage, { vm: { cp } }));
    assert.match(html, /Your copy/);
    assert.match(html, /copy-calendar/);
    assert.doesNotMatch(html, /—/);
  });
  check("Copy position detail closes only the mirrored position and opens existing Trade", () => {
    const terminal = newTerminal("copy", 390, "dark", { cpOpen: "perp.queen" });
    let detail = terminal.renderVals().cp.detail;
    const before = detail.mine.positions.length,
      leaderCount = detail.positions.length;
    detail.mine.positions[0].details();
    detail = terminal.renderVals().cp.detail;
    assert.equal(detail.positionDetail.actionLabel, "Close Position");
    detail.positionDetail.action();
    detail = terminal.renderVals().cp.detail;
    assert.equal(detail.mine.positions.length, before - 1);
    assert.equal(detail.positions.length, leaderCount);
    detail.positions[0].details();
    detail = terminal.renderVals().cp.detail;
    assert.equal(detail.positionDetail.actionLabel, "Edit Copy");
    const symbol = detail.positionDetail.title.replace("-PERP", "");
    detail.positionDetail.goMarket();
    assert.equal(terminal.state.screen, "detail");
    assert.equal(terminal.state.sym, symbol);
  });
  check("Copy validates allocation before starting a new copy", () => {
    const terminal = newTerminal("copy");
    let cp = terminal.renderVals().cp;
    cp.discover();
    cp = terminal.renderVals().cp;
    const id = cp.rows[0].id;
    cp.rows[0].mainAction();
    let form = terminal.renderVals().cp.detail.form;
    form.onField("alloc")({ target: { value: "5" } });
    form = terminal.renderVals().cp.detail.form;
    assert.equal(form.disabled, true);
    form.save();
    assert.ok(!terminal.state.cpFollow?.[id]);
    form.onField("alloc")({ target: { value: "100" } });
    form = terminal.renderVals().cp.detail.form;
    assert.equal(form.disabled, false);
    form.save();
    assert.equal(terminal.state.cpFollow[id].alloc, "100");
    assert.equal(terminal.state.cpTab, "following");
  });
  check("Malformed Copy URL does not crash the router", () =>
    assert.equal(routeFromUrl("/copy/%", ""), null),
  );

  const { PointsPage } = await server.ssrLoadModule("/src/components/points/PointsPage.tsx");
  const { LiquidityPage } = await server.ssrLoadModule(
    "/src/components/liquidity/LiquidityPage.tsx",
  );
  for (const width of [390, 1440])
    for (const theme of ["dark", "light"])
      for (const [screen, Page] of [
        ["copy", CopyPage],
        ["points", PointsPage],
        ["liquidity", LiquidityPage],
      ]) {
        check(`native ${screen} ${width} ${theme}`, () => {
          const terminal = newTerminal(
            screen,
            width,
            theme,
            screen === "copy"
              ? { cpOpen: "perp.queen" }
              : screen === "points"
                ? { ptTab: "all" }
                : {},
          );
          const vm = terminal.renderVals();
          const html = watchMarkup(watchElement(Page, { vm }));
          assert.ok(html.length > 1000);
          assert.doesNotMatch(html, /NaN|Infinity|—/);
          assert.equal(vm.theme, theme);
          if (screen === "points") {
            assert.doesNotMatch(html, /Find Me/);
            assert.match(html, /points-week-line/);
            assert.ok(html.includes("Search points traders"), "General board has header search");
          }
        });
      }
  check("Points periods belong to individual boards and search resets its page", () => {
    const terminal = newTerminal("points");
    let pts = terminal.renderVals().pts;
    const untouched = pts.boards[1].period.cur;
    pts.boards[0].period.opts.find((option) => option.label === "All time").pick();
    pts = terminal.renderVals().pts;
    assert.equal(pts.boards[0].period.cur, "All time");
    assert.equal(pts.boards[1].period.cur, untouched);
    pts.gen.pager.nums.at(-1).go();
    assert.ok(terminal.renderVals().pts.gen.pager.nextDis);
    terminal.renderVals().pts.gen.onQuery({ target: { value: "kai.trades" } });
    pts = terminal.renderVals().pts;
    assert.equal(pts.gen.rows.length, 1);
    assert.equal(pts.gen.rows[0].name, "kai.trades");
    assert.equal(pts.gen.pager.prevDis, true);
  });
  check("Points Get Funded selects the existing Prop account mode", () => {
    const terminal = newTerminal("points");
    terminal
      .renderVals()
      .pts.stats.find((stat) => stat.label === "Prop Score")
      .go();
    assert.equal(terminal.state.account, "prop");
    assert.equal(terminal.renderVals().screen, "prop");
    assert.equal(urlFromState(terminal.state, true), "/prop");
  });
  check("Copy chart controls are independent between hero and leader", () => {
    const terminal = newTerminal("copy", 1440, "dark", { cpOpen: "perp.queen" });
    let cp = terminal.renderVals().cp;
    cp.detail.chart.granularity.opts.find((option) => option.label === "Weekly").pick();
    cp = terminal.renderVals().cp;
    assert.equal(cp.detail.chart.granularity.cur, "Weekly");
    assert.equal(cp.hero.chart.granularity.cur, "Daily");
    cp.detail.chart.toggleLegend();
    cp = terminal.renderVals().cp;
    assert.equal(cp.detail.chart.hidden, true);
    assert.equal(cp.hero.chart.hidden, false);
  });
  console.log(`${checks} OPE-2 checks passed.`);
} finally {
  await server.close();
}
