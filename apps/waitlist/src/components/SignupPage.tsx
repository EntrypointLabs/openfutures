import { useState } from "react";
import { Link } from "react-router";
import { LogoMark } from "@openfutures/ui";
import { DEMO_CODE, findCode } from "../preview";
import type { Member, Pending, PreviewState } from "../preview";
import { websiteUrl } from "./MarketingShell";

interface Props {
  state: PreviewState;
  pending: Pending | null;
  member?: Member;
  signInInitially: boolean;
  storageAvailable: boolean;
  onStart: (email: string, username: string, signIn: boolean) => string;
  onVerify: (code: string) => string;
  onChangeEmail: () => void;
  onResend: () => void;
  onUseAnother: () => void;
}

export function SignupPage(props: Props) {
  const [signIn, setSignIn] = useState(props.signInInitially);
  const [email, setEmail] = useState(props.pending?.email || "");
  const [username, setUsername] = useState(props.pending?.username || "");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const referrer = findCode(props.state, props.state.attribution?.code);
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
            {!props.storageAvailable && (
              <p className="wl-storage-note">
                Browser storage is unavailable. Your preview will work for this visit, but won't be
                saved.
              </p>
            )}
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
                    className="wl-text-btn"
                    type="button"
                    onClick={() => {
                      props.onUseAnother();
                      setError("");
                      setSignIn(false);
                    }}
                  >
                    Use another account
                  </button>
                </p>
              </>
            ) : props.pending ? (
              <>
                <h2>Check your inbox</h2>
                <p className="wl-card-copy">
                  Enter the six-digit code for <strong>{props.pending.email}</strong> to continue.
                </p>
                <div className="wl-code-help">
                  For this preview, use <b>{DEMO_CODE}</b>. No email is sent.
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    setError(props.onVerify(code));
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
                  <button className="wl-btn wl-btn-full" type="submit">
                    Verify &amp; continue <span aria-hidden="true">↗</span>
                  </button>
                </form>
                <div className="wl-verify-actions">
                  <button
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
                    onClick={() => {
                      props.onResend();
                      setError("");
                    }}
                  >
                    Resend code
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
                {!signIn && referrer && (
                  <p className="wl-referrer">
                    <i className="wl-dot" />
                    <span>Invited by {referrer.username}</span>
                  </p>
                )}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    setError(props.onStart(email, username, signIn));
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
                  <button className="wl-btn wl-btn-full" type="submit">
                    {signIn ? "Send sign-in code" : "Join the waitlist"}{" "}
                    <span aria-hidden="true">↗</span>
                  </button>
                </form>
                <p className="wl-switch">
                  {signIn ? "New to OpenFutures?" : "Already on the list?"}{" "}
                  <button className="wl-text-btn" type="button" onClick={switchMode}>
                    {signIn ? "Join the waitlist" : "Sign in"}
                  </button>
                </p>
                <p className="wl-legal">
                  Read our <a href={websiteUrl + "/terms-and-conditions"}>Terms</a> and{" "}
                  <a href={websiteUrl + "/privacy-policy"}>Privacy Policy</a>. This is a UI preview;
                  no email is sent.
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
