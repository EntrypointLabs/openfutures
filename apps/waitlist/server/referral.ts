import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "of_waitlist_ref";
export const REFERRAL_TTL = 30 * 86400;
export interface Attribution {
  code: string;
  expires: number;
}
export function signReferral(code: string, secret: string, now = Date.now()) {
  const data = Buffer.from(
    JSON.stringify({ code, expires: Math.floor(now / 1000) + REFERRAL_TTL }),
  ).toString("base64url");
  return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
}
export function readReferral(
  cookie: string | undefined,
  secret: string,
  now = Date.now(),
): Attribution | null {
  const value = cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  if (!value || value.length > 512) return null;
  const [data, signature, extra] = value.split(".");
  if (!data || !signature || extra) return null;
  const expected = createHmac("sha256", secret).update(data).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString());
    return /^[A-Z0-9]{8}$/.test(parsed.code) &&
      Number.isSafeInteger(parsed.expires) &&
      parsed.expires > Math.floor(now / 1000) &&
      parsed.expires <= Math.floor(now / 1000) + REFERRAL_TTL
      ? parsed
      : null;
  } catch {
    return null;
  }
}
export function referralCookie(value: string, secure: boolean, maxAge = REFERRAL_TTL) {
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
