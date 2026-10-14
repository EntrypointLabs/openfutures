import { LogoTile } from "@openfutures/ui";
import type { TerminalViewModel } from "@/terminal/types";
import { IconPath } from "@/components/common/IconPath";
import { InfoTip } from "@/components/common/InfoTip";
import { Watermark } from "@/components/common/Watermark";
import { LiquiditySheet } from "@/components/liquidity/LiquiditySheets";

type Phone = TerminalViewModel["liq"]["app"];
type Vault = Phone["vaults"][number];
type Lot = Phone["lots"][number];

function VaultRow({ row, usdc, picking = false }: { row: Vault; usdc: string; picking?: boolean }) {
  return <button type="button" className="hm-row" onClick={picking ? row.deposit : row.open} aria-haspopup="dialog">
    <span className="av"><img className="logo" src={usdc} alt="" /><span className="lqm-tb num">{row.tag}</span></span>
    <span className="hm-id"><b className="hm-t2"><span className="hm-tk">{row.name}</span>{row.mine ? <span className="lev">Yours</span> : null}</b><small className="num">{row.sub}</small></span>
    <span className="hm-px num"><b>{row.apr}</b><small className="muted">APR (%)</small></span>
  </button>;
}
function LotRow({ row, usdc, interactive = true }: { row: Lot; usdc: string; interactive?: boolean }) {
  const content = <><span className="av"><img className="logo" src={usdc} alt="" /><span className="lqm-tb num">{row.tag}</span></span>
    <span className="hm-id"><b className="hm-t2"><span className="hm-tk">{row.name}</span><span className={row.statusCls}>{row.status}</span></b><small className="num">{row.sub}</small></span>
    <span className="hm-px num"><b>{row.value}</b><small className="up">{row.earned}</small></span></>;
  return interactive ? <button type="button" className="hm-row" aria-haspopup="dialog" onClick={row.open}>{content}</button> : <div className="hm-row">{content}</div>;
}
function Rows({ rows }: { rows: { k: string; v: string }[] }) {
  return <dl className="lqm-kv num">{rows.map((row) => <div key={row.k}><dt>{row.k}</dt><dd>{row.v}</dd></div>)}</dl>;
}

/** Phone cards and details share the vault book, deposit flow and valuation with desktop. */
export function MobileLiquidity({ vm }: { vm: TerminalViewModel }) {
  const liq = vm.liq;
  const app = liq.app;
  const detail = app.detail;
  const lot = app.lot;
  return <div className="lqm hm">
    <div className="hm-top"><header className="hm-head"><span className="hm-brand"><LogoTile variant="brand" /><b>OpenFutures</b></span><span className="hm-head-r">
      <button type="button" className="hm-ibtn" aria-label="Liquidity analytics" onClick={liq.goAnalytics}><IconPath d="M5 20V11M12 20V4M19 20v-7" /></button>
      <button type="button" className="hm-ibtn" aria-label="Open AI assistant" onClick={vm.ai.open}><LogoTile size="sm" /></button>
      <button type="button" className="hm-ibtn hm-av" aria-label="Profile" onClick={vm.goProfile}><img src={vm.pfp} alt="" /></button>
    </span></header>
    <div className="hm-bal"><span className="h-i">Liquidity Balance (USDC)<InfoTip tip="Your active vault deposits, including earnings. Withdrawn deposits are not counted." /></span>
      <p className="hm-eq num">{app.whole}<span className="hm-cents">.{app.cents}</span></p>
      <p className="hm-sub num"><b className="up">{app.earned}</b> earned, {app.ready} USDC ready</p>
      <div className="hm-money"><button type="button" className="hm-mbtn primary" onClick={app.openPick}>↓ Deposit</button><button type="button" className="hm-mbtn" disabled={app.withdrawDisabled} onClick={app.openWithdrawAll}>↑ Withdraw</button></div>
    </div></div>
    <div className="hm-band" role="tablist" aria-label="Liquidity">{app.tabs.map((tab) => <button type="button" key={tab.label} role="tab" className={"hb-pill" + (tab.on ? " is-on" : "")} aria-selected={tab.on} onClick={tab.pick}>
      <span className="hb-ic"><IconPath d={tab.ic} /></span>{tab.label}<span className="num hb-n">{tab.count}</span></button>)}</div>
    <div className="hm-sheet"><span className="hm-grab" aria-hidden="true" /><section className="lqm-list" aria-label={app.isVaults ? "Vaults" : app.isDeposits ? "Your deposits" : "Your activity"}>
      {app.isDeposits ? <div className="pills hm-pills" role="group" aria-label="Filter deposits">{app.filters.map((filter) => <button type="button" key={filter.label} className={"pill" + (filter.on ? " is-active" : "")} aria-pressed={filter.on} onClick={filter.pick}>{filter.label}<span className="pill-count">{filter.count}</span></button>)}</div> : null}
      {app.isVaults ? <p className="lqm-cap h-i">Vaults<InfoTip tip="Each vault locks USDC for its term and earns the APR on the day you deposit. An early exit costs up to 10%, falling to 0% at unlock." /></p> : null}
      <div className="hm-list pc-list">
        {app.isVaults ? app.vaults.map((row) => <VaultRow key={row.term} row={row} usdc={liq.usdc} />) : null}
        {app.isDeposits ? app.lots.map((row) => <LotRow key={row.id} row={row} usdc={liq.usdc} />) : null}
        {app.isActivity ? app.log.map((row, i) => <div className="hm-row lqm-ar" key={i}><span className="av lqm-aic"><IconPath d={row.action === "Deposit" ? "M12 5v14M6 13l6 6 6-6" : "M12 19V5M6 11l6-6 6 6"} /></span><span className="hm-id"><b>{row.action}</b><small>{row.sub}</small></span><span className="hm-px num"><b>{row.amount}</b><small>{row.note}</small></span></div>) : null}
        {app.isDeposits && !app.lots.length || app.isActivity && !app.log.length ? <p className="lq-empty">Nothing here yet.</p> : null}
      </div>
    </section></div>
    {detail ? <section className="lqm-detail" aria-label={detail.name}>
      <div className="lqm-detail-nav"><button type="button" aria-label="Back to vaults" onClick={detail.close}>‹</button></div>
      <div className="lqm-detail-body"><div className="lqm-detail-title"><img src={liq.usdc} alt="" /><h2>{detail.name}</h2><small>{detail.term} days</small></div>
        <p className="lqm-detail-apr num">{detail.apr}<span>%</span></p><p className={"lqm-detail-change num " + (detail.change >= 0 ? "up" : "down")}>{detail.change >= 0 ? "▲" : "▼"} {Math.abs(detail.change).toFixed(2)} in the selected period</p>
        <div className="lqm-ranges" role="tablist" aria-label="APR range">{detail.ranges.map((range) => <button type="button" key={range.label} role="tab" aria-selected={range.on} className={range.on ? "is-on" : ""} onClick={range.pick}>{range.label}</button>)}<span>APR (%)</span></div>
        <div className="lqm-apr-chart"><Watermark /><svg viewBox="0 0 1000 280" preserveAspectRatio="none" aria-label="Vault APR history" role="img"><path d={detail.path} stroke="var(--c-up)" fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg></div>
        <div className="lqm-chart-dates"><span>{detail.start}</span><span>{detail.end}</span></div>
        {detail.mine.length ? <section className="lqm-mine"><h3>Your Deposits <span className="num">{detail.mineValue} USDC</span></h3>{detail.mine.map((row) => <LotRow key={row.id} row={row} usdc={liq.usdc} />)}</section> : null}
        <Rows rows={detail.rows} />
      </div><div className="lqm-fixed"><button type="button" className="cta" onClick={detail.deposit}>Deposit to {detail.name}</button></div>
    </section> : null}
    {app.pickOpen ? <LiquiditySheet title="Choose a Vault" rows={[]} onClose={app.closePick} onSubmit={() => {}}><div className="lqm-picker">{app.vaults.map((row) => <VaultRow key={row.term} row={row} usdc={liq.usdc} picking />)}</div></LiquiditySheet> : null}
    {lot ? <LiquiditySheet title={lot.name} rows={[]} onClose={lot.close} onSubmit={lot.stage === "withdraw" ? lot.withdraw : lot.stage === "exit" ? lot.confirmExit : () => {}}>
      {lot.stage === "view" ? <><div className="lqm-review-amount num"><small>Value (USDC)</small><b>{lot.value}</b><small className="up">{lot.earned} earned</small></div>
        <div className="lqm-prog num"><div><span>Day {lot.daysHeld} of {lot.lot.term}</span><span>{lot.isUnlocked ? "Unlocked" : lot.daysLeft + " days left"}</span></div><i><b style={{width:lot.progress + "%"}} /></i></div><Rows rows={lot.rows} />
        <div className="lqm-actions">{lot.isUnlocked ? <button type="button" className="cta" onClick={lot.goWithdraw}>Withdraw {lot.value} USDC</button> : <><button type="button" className="lq-back" disabled>Unlocks in {lot.daysLeft}d</button><button type="button" className="lq-back lqm-danger" onClick={lot.goExit}>Exit Early</button></>}</div>
      </> : <><div className="lqm-review-amount num"><small>You Receive (USDC)</small><b>{lot.stage === "withdraw" ? lot.value : lot.receive}</b>{lot.stage === "exit" ? <small className="down">−{lot.penalty} penalty</small> : <small>To your trading balance</small>}</div>
        {lot.stage === "exit" ? <><Rows rows={[{k:"Value Now (USDC)",v:lot.value},{k:"Penalty Today (%)",v:lot.penaltyPct},{k:"Penalty (USDC)",v:lot.penalty},{k:"Unlocks On",v:lot.unlock}]} /><p className="lqm-note">Wait {lot.daysLeft} days to receive the full value with no penalty.</p></> : <Rows rows={lot.rows.slice(0,3)} />}
        <div className="lqm-actions"><button type="button" className="lq-back" onClick={lot.back}>Back</button><button type="submit" className={"cta" + (lot.stage === "exit" ? " lqm-danger" : "")}>{lot.stage === "withdraw" ? "Confirm Withdraw" : "Exit and Receive"}</button></div>
      </>}
    </LiquiditySheet> : null}
    {app.withdrawAllOpen ? <LiquiditySheet title="Withdraw Unlocked" rows={[]} onClose={app.closeWithdrawAll} onSubmit={app.withdrawAll}>
      <div className="lqm-review-amount num"><small>You Receive (USDC)</small><b>{app.ready}</b><small>To your trading balance</small></div>
      <div className="lqm-picker">{app.free.map((row) => <LotRow key={row.id} row={row} usdc={liq.usdc} interactive={false} />)}</div><button type="submit" className="cta fd-cta">Withdraw All</button>
    </LiquiditySheet> : null}
  </div>;
}
