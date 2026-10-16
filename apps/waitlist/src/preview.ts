// Local UI fixtures only. These types do not define a backend/API contract.
export const STORAGE_KEY = "openfutures-waitlist-preview-v1";
export const PENDING_KEY = "openfutures-waitlist-preview-pending";
export const DEMO_CODE = "123456";

export interface Referral {
  id: string;
  at: number;
  simulated: boolean;
}
export interface Member {
  id: string;
  email: string;
  username: string;
  code: string;
  verifiedAt: number;
  referrals: Referral[];
  referredBy: string | null;
}
export interface PreviewState {
  members: Member[];
  session: string | null;
  attribution: { code: string; at: number } | null;
}
export interface Pending {
  email: string;
  username: string;
  referrer: string | null;
  sentAt: number;
}
export interface BoardEntry {
  id: string;
  username: string;
  code: string;
  count: number;
  verifiedAt: number;
}

export const emptyPreview = (): PreviewState => ({ members: [], session: null, attribution: null });
export const sampleMembers: BoardEntry[] = [
  { id: "sample-1", username: "perp.queen", code: "OPENPERP", count: 18 },
  { id: "sample-2", username: "deltaneutral", code: "OPENDELT", count: 12 },
  { id: "sample-3", username: "satoshi.sol", code: "OPENSATO", count: 8 },
  { id: "sample-4", username: "nightowl", code: "OPENNITE", count: 5 },
  { id: "sample-5", username: "maven", code: "OPENMAVN", count: 3 },
  { id: "sample-6", username: "basisbob", code: "OPENBASE", count: 1 },
  { id: "sample-7", username: "vol.smile", code: "OPENVOLS", count: 0 },
].map((member, index) => ({ ...member, verifiedAt: index + 1 }));

export function parsePreview(raw: string | null): PreviewState {
  try {
    const data = JSON.parse(raw || "null");
    if (!data || !Array.isArray(data.members)) return emptyPreview();
    return {
      members: data.members.filter(
        (m: Member) =>
          m &&
          typeof m.id === "string" &&
          typeof m.email === "string" &&
          typeof m.username === "string" &&
          typeof m.code === "string" &&
          Number.isFinite(m.verifiedAt) &&
          Array.isArray(m.referrals),
      ),
      session: typeof data.session === "string" ? data.session : null,
      attribution:
        data.attribution &&
        typeof data.attribution.code === "string" &&
        Number.isFinite(data.attribution.at)
          ? data.attribution
          : null,
    };
  } catch {
    return emptyPreview();
  }
}

export function findCode(state: PreviewState, code?: string | null) {
  return state.members.find((m) => m.code === code) || sampleMembers.find((m) => m.code === code);
}

export function captureReferral(
  state: PreviewState,
  code: string | null,
  now = Date.now(),
): PreviewState {
  const attribution =
    state.attribution && now - state.attribution.at < 30 * 86400000 ? state.attribution : null;
  const member = state.members.find((m) => m.id === state.session);
  const referrer = code && findCode(state, code.toUpperCase());
  return {
    ...state,
    attribution: attribution || (!member && referrer ? { code: referrer.code, at: now } : null),
  };
}

export function leaderboard(state: PreviewState): BoardEntry[] {
  return [
    ...sampleMembers,
    ...state.members.map((m) => ({ ...m, count: m.referrals.length })),
  ].sort((a, b) => b.count - a.count || a.verifiedAt - b.verifiedAt || a.id.localeCompare(b.id));
}

export function uniqueCode(state: PreviewState) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code: string;
  do {
    code = Array.from(
      crypto.getRandomValues(new Uint8Array(8)),
      (byte) => alphabet[byte % alphabet.length],
    ).join("");
  } while (findCode(state, code));
  return code;
}

export function completeVerification(
  state: PreviewState,
  pending: Pending,
  id: string,
  code: string,
  now = Date.now(),
): PreviewState {
  const existing = state.members.find((m) => m.email === pending.email);
  if (existing) return { ...state, session: existing.id, attribution: null };
  const member: Member = {
    id,
    code,
    email: pending.email,
    username: pending.username,
    verifiedAt: now,
    referrals: [],
    referredBy: pending.referrer,
  };
  const members = state.members.map((referrer) => {
    if (
      referrer.code !== member.referredBy ||
      referrer.id === member.id ||
      referrer.referrals.some((r) => r.id === member.id)
    )
      return referrer;
    return {
      ...referrer,
      referrals: [...referrer.referrals, { id: member.id, at: now, simulated: false }],
    };
  });
  return { members: [...members, member], session: member.id, attribution: null };
}

export function readPending(): Pending | null {
  try {
    const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
    return pending &&
      typeof pending.email === "string" &&
      typeof pending.username === "string" &&
      Number.isFinite(pending.sentAt)
      ? pending
      : null;
  } catch {
    return null;
  }
}
