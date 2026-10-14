export function verifyLiquidity(assert, buildLiquidityViewModel, cleanAmount) {
  const state = { now: Date.UTC(2026, 9, 14), lqView: "vaults" };
  const terminal = {
    state,
    setState(patch) {
      Object.assign(state, patch);
    },
  };
  const ctx = {
    terminal,
    state,
    availableBalance: 1000,
    paginate(_key, items) {
      return { rows: items.map((item, index) => ({ ...item, num: String(index + 1) })), pager: {} };
    },
    showToast() {},
    you: null,
  };
  const vm = () => buildLiquidityViewModel(ctx);
  assert.equal(cleanAmount("1.2.3x"), "1.23");
  let liq = vm();
  assert.equal(liq.rows.length, 5);
  assert.equal(liq.app.tabs.length, 3);
  assert.ok(liq.app.vaults.every((row, index, rows) => !index || +rows[index - 1].apr >= +row.apr));
  liq.rows[0].deposit();
  liq = vm();
  assert.equal(liq.depositStep, "amount");
  assert.deepEqual(
    liq.quick.map((chip) => chip.label),
    ["25%", "50%", "75%", "Max"],
  );
  liq.onAmt({ target: { value: "1001" } });
  liq = vm();
  assert.equal(liq.ctaDis, true);
  liq.reviewDeposit();
  assert.equal(vm().depositStep, "amount");
  liq.onAmt({ target: { value: "250" } });
  liq = vm();
  const before = liq.app.tabs[1].count;
  liq.submit();
  assert.equal(vm().app.tabs[1].count, before);
  liq.reviewDeposit();
  liq = vm();
  assert.equal(liq.depositStep, "review");
  assert.equal(liq.confirmDis, true);
  liq.submit();
  assert.equal(vm().app.tabs[1].count, before);
  liq.toggleAck();
  liq = vm();
  assert.equal(liq.confirmDis, false);
  liq.submit();
  liq = vm();
  assert.equal(liq.depositStep, "done");
  assert.equal(liq.app.tabs[1].count, before + 1);
  assert.equal(state.lqBook.cashDelta, -250);
  liq.viewDeposits();
  liq = vm();
  assert.equal(liq.app.isDeposits, true);
  assert.equal(liq.sheetOpen, false);
  liq.app.openWithdrawAll();
  liq = vm();
  assert.equal(liq.app.withdrawAllOpen, true);
  const free = liq.app.free.length;
  const ready = Number(liq.app.ready.replaceAll(",", ""));
  liq.app.withdrawAll();
  liq = vm();
  assert.equal(liq.app.free.length, 0);
  assert.equal(liq.app.tabs[1].count, before + 1 - free);
  assert.ok(Math.abs(state.lqBook.cashDelta - (-250 + ready)) < 0.01);
  const locked = liq.app.lots.find((row) => row.kind === "locked");
  locked.open();
  liq = vm();
  liq.app.lot.goExit();
  liq = vm();
  assert.equal(liq.app.lot.stage, "exit");
  assert.ok(+liq.app.lot.penalty.replaceAll(",", "") > 0);
  assert.ok(+liq.app.lot.receive.replaceAll(",", "") < +liq.app.lot.value.replaceAll(",", ""));
  const bookBeforeCancel = state.lqBook;
  liq.app.lot.close();
  liq = vm();
  assert.equal(liq.app.lot, null);
  assert.equal(liq.exitOpen, false);
  assert.equal(state.lqBook, bookBeforeCancel);
  locked.open();
  liq = vm();
  liq.app.lot.goExit();
  liq = vm();
  liq.app.lot.confirmExit();
  liq = vm();
  assert.equal(liq.app.lot, null);
  state.lqView = "analytics";
  liq = vm();
  assert.equal(liq.kpis.length, 4);
  assert.equal(liq.analyticsCards.length, 4);
  let card = liq.analyticsCards[0];
  assert.ok(card.xTicks.length <= 9);
  card.legend[0].toggle();
  liq = vm();
  assert.equal(liq.analyticsCards[0].paths.length, 4);
  assert.equal(liq.analyticsCards[1].paths.length, 5);
  liq.analyticsCards[0].modes.items[1].pick();
  liq = vm();
  assert.ok(liq.analyticsCards[0].yTicks.some((tick) => tick.label === "100%"));
  assert.ok(!liq.analyticsCards[2].modes.items[1].cls);
  liq.analyticsCards[0].gran.opts[1].pick();
  assert.equal(state.acGran["lq-deposits"], "w");
  assert.equal(state.acGran["lq-apr"], undefined);
  liq = vm();
  liq.traderHeads[1].pick();
  liq = vm();
  assert.equal(liq.traderHeads[1].sortDir, "descending");
  liq.traderHeads[1].pick();
  liq = vm();
  assert.equal(liq.traderHeads[1].sortDir, "ascending");
  liq.traderSizeControl.opts[1].pick();
  liq = vm();
  assert.ok(liq.traders.every((row) => row.size === "10,000"));
  return "Liquidity: native amount/review/ack/done, balance, withdraw all, penalty disclosure, APR sort, funded sort/filter and isolated chart controls passed";
}
