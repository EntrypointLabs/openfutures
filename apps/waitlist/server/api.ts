import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { USERNAME_PATTERN } from "../src/contracts.ts";
import { readReferral, referralCookie, signReferral } from "./referral.ts";

type Endpoint = "capture" | "membership" | "me" | "leaderboard";
export interface Services {
  db: SupabaseClient;
  origin: string;
  secret: string;
  secure: boolean;
}
class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
let cached: Services | undefined;
function services(): Services {
  if (cached) return cached;
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WAITLIST_ORIGIN, REFERRAL_COOKIE_SECRET } =
    process.env;
  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !WAITLIST_ORIGIN ||
    !REFERRAL_COOKIE_SECRET ||
    REFERRAL_COOKIE_SECRET.length < 32
  ) {
    throw new ApiError(
      503,
      "configuration_required",
      "The waitlist is not configured yet. Please try again later.",
    );
  }
  const origin = new URL(WAITLIST_ORIGIN).origin;
  cached = {
    db: createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    origin,
    secret: REFERRAL_COOKIE_SECRET,
    secure: origin.startsWith("https:"),
  };
  return cached;
}
function offset(value: string | string[] | undefined) {
  if (value === undefined) return 0;
  if (typeof value !== "string" || !/^\d{1,7}$/.test(value))
    throw new ApiError(400, "invalid_page", "Invalid page.");
  return Number(value);
}
function body(req: VercelRequest): Record<string, unknown> {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new ApiError(415, "invalid_content_type", "Send JSON.");
  let data;
  try {
    data = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    throw new ApiError(400, "invalid_json", "Invalid JSON.");
  }
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    JSON.stringify(data).length > 2048
  )
    throw new ApiError(400, "invalid_body", "Invalid request.");
  return data;
}
const RETRYABLE_AUTH = new Set([408, 429]);
async function identity(req: VercelRequest, db: SupabaseClient, optional = false) {
  const header = req.headers.authorization;
  if (!header && optional) return null;
  if (!header?.startsWith("Bearer "))
    throw new ApiError(401, "unauthorized", "Please sign in again.");
  const { data, error } = await db.auth.getUser(header.slice(7));
  // A missing, throttled or failing Auth response says nothing about the session itself,
  // so it must never be reported as an expired sign-in.
  if (error && (!error.status || error.status >= 500 || RETRYABLE_AUTH.has(error.status)))
    throw new ApiError(
      503,
      "auth_unavailable",
      "Sign-in is temporarily unavailable. Please try again.",
    );
  if (error || !data.user?.email_confirmed_at)
    throw new ApiError(401, "unauthorized", "Please sign in again.");
  return data.user.id;
}
async function rpc(db: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    if (error.message === "username_taken")
      throw new ApiError(
        409,
        "username_taken",
        "That username is taken. Choose another to finish joining.",
      );
    if (error.message === "invalid_username")
      throw new ApiError(
        400,
        "invalid_username",
        "Use 3–24 letters, numbers, underscores, periods, or hyphens.",
      );
    // Never return provider errors, emails, tokens, or SQL details to the client/logs.
    throw new ApiError(
      503,
      "database_unavailable",
      "We couldn't load the waitlist. Please try again.",
    );
  }
  return data;
}
export function handler(endpoint: Endpoint, provided?: Services) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization, Cookie");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const method = endpoint === "me" || endpoint === "leaderboard" ? "GET" : "POST";
      if (req.method !== method) {
        res.setHeader("Allow", method);
        throw new ApiError(405, "method_not_allowed", "Method not allowed.");
      }
      const { db, origin, secret, secure } = provided ?? services();
      if (method === "POST" && req.headers.origin !== origin)
        throw new ApiError(403, "invalid_origin", "Request origin is not allowed.");
      if (endpoint === "capture") {
        const input = body(req);
        const userId = await identity(req, db, true);
        if (userId) {
          const { data, error } = await db
            .from("waitlist_members")
            .select("user_id")
            .eq("user_id", userId)
            .maybeSingle();
          if (error) throw new ApiError(503, "database_unavailable", "Please try again.");
          if (data) return res.status(200).json({ referrer: null });
        }
        const prior = readReferral(req.headers.cookie, secret);
        const code =
          prior?.code ?? (typeof input.code === "string" ? input.code.trim().toUpperCase() : "");
        if (!/^[A-Z0-9]{8}$/.test(code)) return res.status(200).json({ referrer: null });
        const { data, error } = await db
          .from("waitlist_members")
          .select("username")
          .eq("referral_code", code)
          .maybeSingle();
        if (error) throw new ApiError(503, "database_unavailable", "Please try again.");
        if (!data) return res.status(200).json({ referrer: null });
        if (!prior) res.setHeader("Set-Cookie", referralCookie(signReferral(code, secret), secure));
        return res.status(200).json({ referrer: data.username });
      }
      const userId = await identity(req, db);
      if (endpoint === "membership") {
        const input = body(req);
        const username = typeof input.username === "string" ? input.username.trim() : "";
        if (!USERNAME_PATTERN.test(username))
          throw new ApiError(
            400,
            "invalid_username",
            "Use 3–24 letters, numbers, underscores, periods, or hyphens.",
          );
        await rpc(db, "create_waitlist_membership", {
          p_user_id: userId,
          p_username: username,
          p_referral_code: readReferral(req.headers.cookie, secret)?.code ?? null,
        });
        res.setHeader("Set-Cookie", referralCookie("", secure, 0));
        return res.status(200).json({ ok: true });
      }
      const pageOffset = offset(req.query.offset);
      const data = await rpc(db, endpoint === "me" ? "waitlist_me" : "waitlist_leaderboard", {
        p_user_id: userId,
        p_offset: pageOffset,
        p_limit: endpoint === "me" ? 5 : pageOffset === 0 && req.query.top === "true" ? 5 : 25,
      });
      return res.status(200).json(data);
    } catch (error) {
      const failure =
        error instanceof ApiError
          ? error
          : new ApiError(
              503,
              "service_unavailable",
              "The waitlist is temporarily unavailable. Please try again.",
            );
      return res
        .status(failure.status)
        .json({ error: { code: failure.code, message: failure.message } });
    }
  };
}
