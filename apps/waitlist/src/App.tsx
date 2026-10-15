import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import {
  captureReferral,
  completeVerification,
  DEMO_CODE,
  emptyPreview,
  parsePreview,
  PENDING_KEY,
  readPending,
  STORAGE_KEY,
  uniqueCode,
} from "./preview";
import type { Pending, PreviewState } from "./preview";
import { MarketingShell } from "./components/MarketingShell";
import { SignupPage } from "./components/SignupPage";
import { Dashboard } from "./components/Dashboard";

function initialPreview() {
  let state = emptyPreview();
  try {
    state = parsePreview(localStorage.getItem(STORAGE_KEY));
  } catch {
    /* Memory-only preview. */
  }
  return captureReferral(state, new URLSearchParams(location.search).get("ref"));
}

export function App() {
  const [state, setState] = useState<PreviewState>(initialPreview);
  const [pending, setPending] = useState<Pending | null>(readPending);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [toast, setToast] = useState("");
  const route = useLocation();
  const navigate = useNavigate();
  const member = state.members.find((entry) => entry.id === state.session);

  // Synchronize the browser-only preview with browser storage, never a service.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      setStorageAvailable(false);
    }
  }, [state]);
  useEffect(() => {
    try {
      if (pending) sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      else sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* The flow remains usable in memory. */
    }
  }, [pending]);
  useEffect(() => {
    const receive = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setState(parsePreview(event.newValue));
    };
    window.addEventListener("storage", receive);
    return () => window.removeEventListener("storage", receive);
  }, []);
  useEffect(() => {
    document.title = `${route.pathname.endsWith("dashboard") ? "Your waitlist" : "Waitlist"} — OpenFutures`;
    window.scrollTo(0, 0);
    setState((previous) => captureReferral(previous, new URLSearchParams(route.search).get("ref")));
  }, [route.pathname, route.search]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function start(emailInput: string, usernameInput: string, signIn: boolean) {
    const email = emailInput.trim().toLowerCase();
    const username = usernameInput.trim();
    const existing = state.members.find((entry) => entry.email === email);
    if (signIn && !existing)
      return "No preview account with this email yet. Join the waitlist first.";
    if (
      !existing &&
      state.members.some((entry) => entry.username.toLowerCase() === username.toLowerCase())
    )
      return "That username is taken in this preview. Try another.";
    setPending({
      email,
      username: existing?.username || username,
      referrer: state.attribution?.code || null,
      sentAt: Date.now(),
    });
    return "";
  }
  function verify(code: string) {
    if (!pending) return "Request a new preview code to continue.";
    if (Date.now() - pending.sentAt > 10 * 60000)
      return "This preview code expired. Request a new code below.";
    if (code !== DEMO_CODE) return "That code doesn’t match. Use 123456 for this preview.";
    setState(completeVerification(state, pending, crypto.randomUUID(), uniqueCode(state)));
    setPending(null);
    navigate("/dashboard");
    return "";
  }
  function signOut() {
    setState({ ...state, session: null });
    setPending(null);
    navigate("/?mode=signin");
  }
  function simulate() {
    if (!member) return;
    const referral = { id: crypto.randomUUID(), at: Date.now(), simulated: true };
    setState({
      ...state,
      members: state.members.map((entry) =>
        entry.id === member.id ? { ...entry, referrals: [...entry.referrals, referral] } : entry,
      ),
    });
    setToast("Preview referral verified. Your progress is updated.");
  }
  return (
    <MarketingShell toast={toast}>
      <Routes>
        <Route
          path="/"
          element={
            <SignupPage
              key={route.search.includes("mode=signin") ? "signin" : "signup"}
              state={state}
              pending={pending}
              member={member}
              signInInitially={new URLSearchParams(route.search).get("mode") === "signin"}
              storageAvailable={storageAvailable}
              onStart={start}
              onVerify={verify}
              onChangeEmail={() => setPending(null)}
              onResend={() => {
                if (pending) setPending({ ...pending, sentAt: Date.now() });
                setToast("Preview code refreshed. Use 123456.");
              }}
              onUseAnother={() => {
                setState(
                  captureReferral(
                    { ...state, session: null },
                    new URLSearchParams(route.search).get("ref"),
                  ),
                );
                setPending(null);
              }}
            />
          }
        />
        <Route
          path="/dashboard"
          element={
            member ? (
              <Dashboard
                state={state}
                member={member}
                onSignOut={signOut}
                onSimulate={simulate}
                notify={setToast}
              />
            ) : (
              <Navigate to="/?mode=signin" replace />
            )
          }
        />
        <Route path="/waitlist" element={<Navigate to={"/" + route.search} replace />} />
        <Route path="/waitlist/dashboard" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MarketingShell>
  );
}
