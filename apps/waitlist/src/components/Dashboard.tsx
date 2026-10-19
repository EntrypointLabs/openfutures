import { useEffect, useRef, useState } from "react";
import { api, message, RequestError } from "../client";
import type { BoardEntry, Me, Member, Page } from "../contracts";

export function Dashboard({
  member,
  initialActivity,
  onSignOut,
  notify,
  onSessionExpired,
}: {
  member: Member;
  initialActivity: Me["activity"];
  onSignOut: () => Promise<void>;
  notify: (message: string) => void;
  onSessionExpired: () => void;
}) {
  const [board, setBoard] = useState<Page<BoardEntry>>({ items: [], nextOffset: null });
  const [activity, setActivity] = useState(initialActivity);
  const [error, setError] = useState("");
  const [boardLoading, setBoardLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(false);
  const linkInput = useRef<HTMLInputElement>(null);
  function fail(failure: unknown) {
    if (failure instanceof RequestError && failure.status === 401) onSessionExpired();
    else setError(message(failure));
  }
  async function loadBoard(next = false) {
    setBoardLoading(true);
    setError("");
    try {
      const result = await api<Page<BoardEntry>>(
        `leaderboard?${next ? `offset=${board.nextOffset}` : "top=true"}`,
      );
      setBoard((previous) => ({
        ...result,
        items: next ? [...previous.items, ...result.items] : result.items,
      }));
    } catch (failure) {
      fail(failure);
    } finally {
      setBoardLoading(false);
    }
  }
  useEffect(() => {
    void loadBoard();
  }, []);
  const shown = [...board.items];
  if (!shown.some((entry) => entry.isYou))
    shown.push({ username: member.username, count: member.count, rank: member.rank, isYou: true });
  shown.sort((a, b) => a.rank - b.rank);
  const shareLink = new URL(`/?ref=${member.code}`, location.origin).href;
  async function moreActivity() {
    setActivityLoading(true);
    setError("");
    try {
      const result = await api<Me>(`me?offset=${activity.nextOffset}`);
      setActivity((previous) => ({
        ...result.activity,
        items: [...previous.items, ...result.activity.items],
      }));
    } catch (failure) {
      fail(failure);
    } finally {
      setActivityLoading(false);
    }
  }
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
              <button className="wl-text-btn" type="button" onClick={() => void onSignOut()}>
                Sign out
              </button>
            </div>
          </div>
        </header>
        <dl className="wl-stats">
          <div className="wl-stat">
            <dt>Verified referrals</dt>
            <dd>{member.count}</dd>
            <p>Friends who joined through your link</p>
          </div>
          <div className="wl-stat">
            <dt>Referral rank</dt>
            <dd>#{member.rank}</dd>
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
            {activity.items.length ? (
              activity.items.map((referral, index) => (
                <div className="wl-activity-row" key={`${referral.at}-${index}`}>
                  <b>New referral verified</b>
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
            {activity.nextOffset !== null && (
              <button
                className="wl-text-btn"
                type="button"
                disabled={activityLoading}
                onClick={() => void moreActivity()}
              >
                {activityLoading ? "Loading…" : "More activity"}
              </button>
            )}
          </section>
        </div>
        {error && (
          <div className="wl-error" role="alert">
            <p>{error}</p>
            <button
              className="wl-text-btn"
              type="button"
              disabled={boardLoading}
              onClick={() => void loadBoard()}
            >
              Retry leaderboard
            </button>
          </div>
        )}
        {boardLoading && <p role="status">Loading leaderboard…</p>}
        <section className="wl-board" aria-labelledby="wl-board-title">
          <div className="wl-panel-head">
            <h2 id="wl-board-title">Referral leaderboard</h2>
            <span className="wl-tag">Verified members</span>
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
                <tr key={entry.username} className={entry.isYou ? "wl-you" : undefined}>
                  <td>{String(entry.rank).padStart(2, "0")}</td>
                  <td>
                    {entry.username}
                    {entry.isYou && <span className="wl-you-label">YOU</span>}
                  </td>
                  <td>{entry.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="wl-board-foot">
            <span>Ranked by verified referrals. Earlier verification breaks ties.</span>
            {board.nextOffset !== null && (
              <button
                className="wl-text-btn"
                type="button"
                disabled={boardLoading}
                onClick={() => void loadBoard(true)}
              >
                {boardLoading ? "Loading…" : "Show more members"}
              </button>
            )}
            {board.items.length > 5 && (
              <button
                className="wl-text-btn"
                type="button"
                disabled={boardLoading}
                onClick={() => void loadBoard()}
              >
                Show top members
              </button>
            )}
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
