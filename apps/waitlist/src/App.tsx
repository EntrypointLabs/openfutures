import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { api, message, readPending, RequestError, savePending, supabase } from "./client";
import type { Me, Pending } from "./contracts";
import { MarketingShell } from "./components/MarketingShell";
import { SignupPage } from "./components/SignupPage";
import { Dashboard } from "./components/Dashboard";

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [pending, setPending] = useState<Pending | null>(readPending);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [referrer, setReferrer] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const route = useLocation();
  const navigate = useNavigate();
  const generation = useRef(0);
  const referralQueue = useRef(Promise.resolve());
  const sessionExpired = useCallback(() => {
    generation.current++;
    setAuthenticated(false);
    setMe(null);
    setError("Your session expired. Sign in again to continue.");
    navigate("/?mode=signin", { replace: true });
  }, [navigate]);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      if (!supabase) throw new Error("The waitlist is not configured yet. Please try again later.");
      const {
        data: { session },
        error: authError,
      } = await supabase.auth.getSession();
      if (authError) throw authError;
      const result = session ? await api<Me>("me") : null;
      if (current !== generation.current) return;
      setAuthenticated(!!session);
      setMe(result);
      setError("");
      if (result?.member) {
        setPending(null);
        savePending(null);
      }
    } catch (failure) {
      if (current !== generation.current) return;
      if (failure instanceof RequestError && failure.status === 401) {
        sessionExpired();
        setLoading(false);
      } else setError(message(failure));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [sessionExpired]);
  useEffect(() => {
    void refresh();
    const listener = supabase?.auth.onAuthStateChange(() => {
      // Schedule outside Supabase's auth callback to avoid SDK lock re-entry.
      setTimeout(() => {
        void refresh();
      }, 0);
    });
    return () => {
      generation.current++;
      listener?.data.subscription.unsubscribe();
    };
  }, [refresh]);
  useEffect(() => {
    savePending(pending);
  }, [pending]);
  const capture = useCallback(() => {
    const code = new URLSearchParams(route.search).get("ref");
    // Serialize captures so two route changes cannot overwrite first touch concurrently.
    referralQueue.current = referralQueue.current
      .catch(() => {})
      .then(async () => {
        const result = await api<{ referrer: string | null }>("referrals/capture", { code });
        setReferrer(result.referrer);
      });
    return referralQueue.current;
  }, [route.search]);
  useEffect(() => {
    document.title = `${route.pathname.endsWith("dashboard") ? "Your waitlist" : "Waitlist"} — OpenFutures`;
    window.scrollTo(0, 0);
    void capture().catch((failure) => {
      if (failure instanceof RequestError && failure.status === 401) sessionExpired();
      else setError(message(failure));
    });
  }, [route.pathname, capture, sessionExpired]);
  async function retry() {
    try {
      await capture();
      await refresh();
    } catch (failure) {
      setError(message(failure));
    }
  }
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  async function start(emailInput: string, usernameInput: string, signIn: boolean) {
    if (!supabase) return "The waitlist is not configured yet.";
    const email = emailInput.trim().toLowerCase();
    try {
      await referralQueue.current;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: !signIn },
      });
      if (error) {
        // An unknown email in sign-in mode should not expose account existence.
        if (!(signIn && error.code === "otp_disabled")) throw error;
      }
      setPending({ email, username: usernameInput.trim(), signIn, sentAt: Date.now() });
      return "";
    } catch (failure) {
      return message(failure);
    }
  }
  async function complete(username: string) {
    try {
      await referralQueue.current;
      await api("membership", { username });
      const result = await api<Me>("me");
      generation.current++;
      setAuthenticated(true);
      setMe(result);
      setPending(null);
      savePending(null);
      setError("");
      navigate("/dashboard");
      return "";
    } catch (failure) {
      if (failure instanceof RequestError && failure.status === 401) sessionExpired();
      return message(failure);
    }
  }
  async function verify(code: string) {
    if (!pending || !supabase) return "Request a new code to continue.";
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: pending.email,
        token: code,
        type: "email",
      });
      if (error) throw error;
      setAuthenticated(true);
      const result = await api<Me>("me");
      setMe(result);
      if (result.member) {
        setPending(null);
        savePending(null);
        navigate("/dashboard");
        return "";
      }
      if (pending.username) return await complete(pending.username);
      return "";
    } catch (failure) {
      return message(failure);
    }
  }
  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      setToast(message(error));
      return;
    }
    generation.current++;
    setAuthenticated(false);
    setMe(null);
    setPending(null);
    savePending(null);
    setError("");
    navigate("/?mode=signin");
  }
  const signup = (
    <SignupPage
      key={route.search.includes("mode=signin") ? "signin" : "signup"}
      pending={pending}
      member={me?.member ?? undefined}
      referrer={referrer}
      profileRequired={authenticated && !me?.member}
      loading={loading}
      serviceError={error}
      signInInitially={new URLSearchParams(route.search).get("mode") === "signin"}
      onStart={start}
      onVerify={verify}
      onComplete={complete}
      onRetry={retry}
      onChangeEmail={() => setPending(null)}
      onResend={async () =>
        pending ? start(pending.email, pending.username, pending.signIn) : "Request a new code."
      }
      onUseAnother={signOut}
    />
  );
  return (
    <MarketingShell toast={toast}>
      <Routes>
        <Route path="/" element={signup} />
        <Route
          path="/dashboard"
          element={
            loading || error || (authenticated && !me?.member) ? (
              signup
            ) : me?.member ? (
              <Dashboard
                member={me.member}
                initialActivity={me.activity}
                onSignOut={signOut}
                notify={setToast}
                onSessionExpired={sessionExpired}
              />
            ) : (
              <Navigate to="/?mode=signin" replace />
            )
          }
        />
        <Route path="/waitlist" element={<Navigate to={"/" + route.search} replace />} />
        <Route
          path="/waitlist/dashboard"
          element={<Navigate to={"/dashboard" + route.search} replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MarketingShell>
  );
}
