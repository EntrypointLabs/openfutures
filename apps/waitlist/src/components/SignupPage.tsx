import { useEffect, useState } from "react";
import { Link } from "react-router";
import { LogoMark } from "@openfutures/ui";
import type { Member, Pending } from "../contracts";
import { websiteUrl } from "./MarketingShell";

interface Props {
  pending: Pending | null;
  member?: Member;
  referrer: string | null;
  profileRequired: boolean;
  loading: boolean;
  serviceError: string;
  signInInitially: boolean;
  onStart: (email: string, username: string, signIn: boolean) => Promise<string>;
  onVerify: (code: string) => Promise<string>;
  onComplete: (username: string) => Promise<string>;
  onRetry: () => Promise<void>;
  onChangeEmail: () => void;
  onResend: () => Promise<string>;
  onUseAnother: () => Promise<void>;
}

export function SignupPage(props: Props) {
  const [signIn, setSignIn] = useState(props.signInInitially);
  const [email, setEmail] = useState(props.pending?.email || "");
  const [username, setUsername] = useState(props.pending?.username || "");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!props.pending) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [props.pending]);
  const remaining = Math.max(0, Math.ceil(((props.pending?.sentAt ?? 0) + 60000 - now) / 1000));
  async function run(action: () => Promise<string | void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setError((await action()) || "");
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  function switchMode() {
    setSignIn(!signIn);
    setError("");
    props.onChangeEmail();
  }
  return (
    <main id="waitlist-main">
      <section className="wl-hero" aria-labelledby="wl-title">
        <div className="wl-corner" aria-hidden="true" />
        <div className="wl-grid">
          <div>
            <p className="wl-eyebrow">[ OpenFutures ] &nbsp; [ Early access ]</p>
            <h1 className="wl-h1" id="wl-title">
              <span>You're</span>
              <span className="wl-pixel">early.</span>
            </h1>
            <p className="wl-intro">
              The next chapter of trading starts here.
              <br />
              <strong>Join the waitlist. Bring your people.</strong>
              <br />
              Get a first look at OpenFutures.
            </p>
            <div className="wl-step-line">
              <span>
                <b>01</b> Join
              </span>
              <span>→</span>
              <span>
                <b>02</b> Invite
              </span>
              <span>→</span>
              <span>
                <b>03</b> Move up
              </span>
            </div>
          </div>
          <div className="wl-card">
            <div className="wl-card-head">
              <p>Your place starts here</p>
              <LogoMark size={28} />
            </div>
            {props.serviceError && (
              <div className="wl-error" role="alert">
                <p>{props.serviceError}</p>
                <button
                  disabled={busy || props.loading}
                  className="wl-text-btn"
                  type="button"
                  onClick={() => void run(props.onRetry)}
                >
                  Try again
                </button>
              </div>
            )}
            {busy && <p role="status">Please wait…</p>}
            {props.member ? (
              <>
                <h2>You're already on the list.</h2>
                <p className="wl-card-copy">
                  Your referral link and progress are ready. Pick up where you left off.
                </p>
                <Link className="wl-btn wl-btn-full" to="/dashboard">
                  Open your dashboard <span aria-hidden="true">↗</span>
                </Link>
                <p className="wl-switch">
                  <button
                    disabled={busy || props.loading}
                    className="wl-text-btn"
                    type="button"
                    onClick={() => {
                      void run(props.onUseAnother);
                      setError("");
                      setSignIn(false);
                    }}
                  >
                    Use another account
                  </button>
                </p>
              </>
            ) : props.loading ? (
              <p role="status">Loading your waitlist…</p>
            ) : props.profileRequired ? (
              <>
                <h2>Choose your username</h2>
                <p className="wl-card-copy">
                  Your email is verified. Finish joining to receive your referral link.
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(() => props.onComplete(username));
                  }}
                >
                  <label className="wl-field">
                    <span>Username</span>
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      autoComplete="username"
                      minLength={3}
                      maxLength={24}
                      pattern="[A-Za-z0-9_.-]{3,24}"
                      required
                    />
                  </label>
                  {error && (
                    <p className="wl-error" role="alert">
                      {error}
                    </p>
                  )}
                  <button
                    disabled={busy || props.loading}
                    className="wl-btn wl-btn-full"
                    type="submit"
                  >
                    Finish joining ↗
                  </button>
                </form>
                <button
                  disabled={busy || props.loading}
                  className="wl-text-btn"
                  type="button"
                  onClick={() => void run(props.onUseAnother)}
                >
                  Use another account
                </button>
              </>
            ) : props.pending ? (
              <>
                <h2>Check your inbox</h2>
                <p className="wl-card-copy">
                  Enter the six-digit code for <strong>{props.pending.email}</strong> to continue.
                </p>
                <p className="wl-code-help">Your code expires after 10 minutes.</p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(() => props.onVerify(code));
                  }}
                >
                  <label className="wl-field">
                    <span>Verification code</span>
                    <input
                      className="wl-code-input"
                      name="code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      autoFocus
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      minLength={6}
                      maxLength={6}
                      placeholder="000000"
                      required
                      aria-describedby="wl-auth-error"
                    />
                  </label>
                  {error && (
                    <p className="wl-error" id="wl-auth-error" role="alert">
                      {error}
                    </p>
                  )}
                  <button
                    disabled={busy || props.loading}
                    className="wl-btn wl-btn-full"
                    type="submit"
                  >
                    Verify &amp; continue <span aria-hidden="true">↗</span>
                  </button>
                </form>
                <div className="wl-verify-actions">
                  <button
                    disabled={busy || props.loading}
                    className="wl-text-btn"
                    type="button"
                    onClick={() => {
                      props.onChangeEmail();
                      setError("");
                      setCode("");
                    }}
                  >
                    Change email
                  </button>
                  <button
                    className="wl-text-btn"
                    type="button"
                    disabled={busy || props.loading || remaining > 0}
                    onClick={() => {
                      void run(props.onResend);
                    }}
                  >
                    {remaining ? `Resend in ${remaining}s` : "Resend code"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>{signIn ? "Welcome back." : "Join the waitlist"}</h2>
                <p className="wl-card-copy">
                  {signIn
                    ? "Sign in with your email to find your referral link and progress."
                    : "Create your account to get a personal referral link and track your place."}
                </p>
                {!signIn && props.referrer && (
                  <p className="wl-referrer">
                    <i className="wl-dot" />
                    <span>Invited by {props.referrer}</span>
                  </p>
                )}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(() => props.onStart(email, username, signIn));
                  }}
                >
                  {!signIn && (
                    <label className="wl-field">
                      <span>Username</span>
                      <input
                        name="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        placeholder="your.handle"
                        minLength={3}
                        maxLength={24}
                        pattern="[A-Za-z0-9_.-]{3,24}"
                        required
                      />
                      <small>Your name on the referral leaderboard.</small>
                    </label>
                  )}
                  <label className="wl-field">
                    <span>Email address</span>
                    <input
                      name="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      placeholder="you@example.com"
                      required
                      maxLength={254}
                    />
                  </label>
                  {error && (
                    <p className="wl-error" role="alert">
                      {error}
                    </p>
                  )}
                  <button
                    disabled={busy || props.loading}
                    className="wl-btn wl-btn-full"
                    type="submit"
                  >
                    {signIn ? "Send sign-in code" : "Join the waitlist"}{" "}
                    <span aria-hidden="true">↗</span>
                  </button>
                </form>
                <p className="wl-switch">
                  {signIn ? "New to OpenFutures?" : "Already on the list?"}{" "}
                  <button
                    disabled={busy || props.loading}
                    className="wl-text-btn"
                    type="button"
                    onClick={switchMode}
                  >
                    {signIn ? "Join the waitlist" : "Sign in"}
                  </button>
                </p>
                <p className="wl-legal">
                  Read our <a href={websiteUrl + "/terms-and-conditions"}>Terms</a> and{" "}
                  <a href={websiteUrl + "/privacy-policy"}>Privacy Policy</a>.
                </p>
              </>
            )}
          </div>
        </div>
      </section>
      <div className="wl-bottom">
        <section className="wl-how" aria-labelledby="wl-how-title">
          <div className="wl-section-label">
            <span id="wl-how-title">[ A head start, together ]</span>
            <span>How it works — 001</span>
          </div>
          <div className="wl-process">
            <article>
              <span className="wl-number">01 / JOIN</span>
              <h3>Make it yours.</h3>
              <p>
                Create your account with an email and username. Your personal referral code is ready
                after verification.
              </p>
            </article>
            <article>
              <span className="wl-number">02 / INVITE</span>
              <h3>Bring your people.</h3>
              <p>
                Share your link. Every friend who joins and verifies their email adds one referral
                to your total.
              </p>
            </article>
            <article>
              <span className="wl-number">03 / MOVE UP</span>
              <h3>See where you stand.</h3>
              <p>
                Track your rank on the leaderboard. Referrals help prioritize consideration for
                early access.
              </p>
            </article>
          </div>
          <p className="wl-note">
            Pilot invitations depend on eligibility and availability. Joining does not guarantee a
            funded trading account.
          </p>
        </section>
      </div>
    </main>
  );
}
