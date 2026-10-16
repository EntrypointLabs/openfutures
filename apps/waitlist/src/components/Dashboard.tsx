import { useRef, useState } from "react";
import { leaderboard } from "../preview";
import type { Member, PreviewState } from "../preview";

export function Dashboard({
  member,
  state,
  onSignOut,
  onSimulate,
  notify,
}: {
  member: Member;
  state: PreviewState;
  onSignOut: () => void;
  onSimulate: () => void;
  notify: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const linkInput = useRef<HTMLInputElement>(null);
  const board = leaderboard(state);
  const rank = board.findIndex((entry) => entry.id === member.id) + 1;
  const shown = expanded ? board : board.slice(0, 5);
  if (!shown.some((entry) => entry.id === member.id)) shown.push(board[rank - 1]);
  const shareLink = new URL(`/?ref=${member.code}`, location.origin).href;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareLink);
      notify("Referral link copied.");
    } catch {
      linkInput.current?.focus();
      linkInput.current?.select();
      notify("Select and copy your referral link above.");
    }
  }
  return (
    <main id="waitlist-main" className="wl-bottom">
      <section className="wl-dash">
        <header className="wl-dash-head">
          <div>
            <p className="wl-eyebrow">[ OpenFutures ] &nbsp; [ Your waitlist ]</p>
            <h1>You're on the list.</h1>
            <p className="wl-dash-sub">A head start is better with your people.</p>
          </div>
          <div className="wl-member">
            <span className="wl-avatar">{member.username.slice(0, 2).toUpperCase()}</span>
            <div>
              <b>{member.username}</b>
              <button className="wl-text-btn" type="button" onClick={onSignOut}>
                Sign out
              </button>
            </div>
          </div>
        </header>
        <dl className="wl-stats">
          <div className="wl-stat">
            <dt>Verified referrals</dt>
            <dd>{member.referrals.length}</dd>
            <p>Friends who joined through your link</p>
          </div>
          <div className="wl-stat">
            <dt>Referral rank</dt>
            <dd>#{rank}</dd>
            <p>Keep sharing to move up</p>
          </div>
          <div className="wl-stat">
            <dt>Membership</dt>
            <dd className="wl-status">
              <i className="wl-dot" />
              On the waitlist
            </dd>
            <p>Early-access consideration</p>
          </div>
        </dl>
        <div className="wl-dashboard-grid">
          <section className="wl-share" aria-labelledby="wl-share-title">
            <div className="wl-corner" aria-hidden="true" />
            <span className="wl-tag">[ Your personal invitation ]</span>
            <h2 id="wl-share-title">Bring your people.</h2>
            <p>
              Invite friends to OpenFutures. Each verified signup adds a referral and helps you move
              up.
            </p>
            <span className="wl-code-label">Your referral code</span>
            <b className="wl-referral-code">{member.code}</b>
            <div className="wl-link-row">
              <input ref={linkInput} aria-label="Your referral link" value={shareLink} readOnly />
              <button className="wl-btn" type="button" onClick={copyLink}>
                Copy link <span aria-hidden="true">↗</span>
              </button>
            </div>
            <div className="wl-social">
              <a
                className="wl-btn wl-btn-ghost"
                href={`https://x.com/intent/post?text=${encodeURIComponent("I’m on the OpenFutures waitlist. Join me:")}&url=${encodeURIComponent(shareLink)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Share on X ↗
              </a>
              <a
                className="wl-btn wl-btn-ghost"
                href={`https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent("Join me on the OpenFutures waitlist.")}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Telegram ↗
              </a>
            </div>
            <p className="wl-note">
              Referrals count after email verification. Your link stays the same every time you
              return.
            </p>
          </section>
          <section className="wl-activity" aria-labelledby="wl-activity-title">
            <div className="wl-panel-head">
              <h2 id="wl-activity-title">Referral activity</h2>
              <span className="wl-tag">Verified signups</span>
            </div>
            {member.referrals.length ? (
              [...member.referrals]
                .reverse()
                .slice(0, 5)
                .map((referral) => (
                  <div className="wl-activity-row" key={referral.id}>
                    <b>
                      {referral.simulated ? "Preview referral verified" : "New referral verified"}
                    </b>
                    <span>
                      {new Date(referral.at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                ))
            ) : (
              <div className="wl-empty">
                <span className="wl-empty-icon" aria-hidden="true">
                  ↗
                </span>
                <h3>Your first invite starts here.</h3>
                <p>
                  Share your link with a friend. You’ll see a verified signup here when they join.
                </p>
              </div>
            )}
            <details className="wl-demo-controls">
              <summary>Preview controls</summary>
              <p>
                Try a verified referral to see your count, activity, and rank update. These changes
                stay in this browser.
              </p>
              <button className="wl-btn wl-btn-ghost" type="button" onClick={onSimulate}>
                Simulate a referral ↗
              </button>
            </details>
          </section>
        </div>
        <section className="wl-board" aria-labelledby="wl-board-title">
          <div className="wl-panel-head">
            <h2 id="wl-board-title">Referral leaderboard</h2>
            <span className="wl-tag">Preview data</span>
          </div>
          <table>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Member</th>
                <th scope="col">Referrals</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((entry) => (
                <tr key={entry.id} className={entry.id === member.id ? "wl-you" : undefined}>
                  <td>{String(board.findIndex((m) => m.id === entry.id) + 1).padStart(2, "0")}</td>
                  <td>
                    {entry.username}
                    {entry.id === member.id && <span className="wl-you-label">YOU</span>}
                  </td>
                  <td>{entry.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="wl-board-foot">
            <span>Ranked by verified referrals. Earlier verification breaks ties.</span>
            <button className="wl-text-btn" type="button" onClick={() => setExpanded(!expanded)}>
              {expanded ? "Show top members" : "Show all members"}
            </button>
          </div>
        </section>
        <p className="wl-note">
          Referrals help prioritize early-access consideration. Final pilot selection depends on
          eligibility and availability.
        </p>
      </section>
    </main>
  );
}
