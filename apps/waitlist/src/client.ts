import { createClient } from "@supabase/supabase-js";
import type { Pending } from "./contracts.ts";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export class RequestError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export async function api<T>(path: string, data?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("The waitlist is not configured yet. Please try again later.");
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  const response = await fetch(`/api/${path}`, {
    method: data ? "POST" : "GET",
    credentials: "same-origin",
    headers: {
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("The waitlist API is unavailable. Please try again later.");
  const result = await response.json();
  if (!response.ok)
    throw new RequestError(
      result.error?.message ?? "Please try again.",
      result.error?.code ?? "unknown",
      response.status,
    );
  return result;
}
export const PENDING_KEY = "openfutures-waitlist-pending-v2";
export function readPending(): Pending | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
    return value &&
      typeof value.email === "string" &&
      typeof value.username === "string" &&
      typeof value.signIn === "boolean" &&
      Number.isFinite(value.sentAt)
      ? value
      : null;
  } catch {
    return null;
  }
}
export function savePending(pending: Pending | null) {
  try {
    if (pending) sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* Auth remains usable without remembering an unfinished form. */
  }
}
export function message(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
