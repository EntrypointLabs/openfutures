import assert from "node:assert/strict";
import test from "node:test";
import {
  COOKIE_NAME,
  readReferral,
  referralCookie,
  REFERRAL_TTL,
  signReferral,
} from "../server/referral.ts";

const secret = "test-only-secret-which-is-at-least-32-characters";
const now = 1700000000000;
const cookie = (value: string) => `other=x; ${COOKIE_NAME}=${value}`;
test("signed attribution lasts thirty days, expires at the boundary, and cannot be tampered with", () => {
  const signed = signReferral("ABCD2345", secret, now);
  assert.deepEqual(readReferral(cookie(signed), secret, now), {
    code: "ABCD2345",
    expires: now / 1000 + REFERRAL_TTL,
  });
  assert.ok(readReferral(cookie(signed), secret, now + REFERRAL_TTL * 1000 - 1));
  assert.equal(readReferral(cookie(signed), secret, now + REFERRAL_TTL * 1000), null);
  assert.equal(readReferral(cookie(signed), "wrong-secret", now), null);
  assert.equal(readReferral(cookie(signed.replace(/^./, "x")), secret, now), null);
  assert.equal(readReferral(cookie("junk.signature"), secret, now), null);
  assert.equal(readReferral(undefined, secret, now), null);
  assert.equal(readReferral(cookie(signReferral("INVALID", secret, now)), secret, now), null);
});
test("attribution cookies are host-only, HttpOnly and secure on HTTPS, with matching deletion scope", () => {
  assert.equal(
    referralCookie("value", true),
    `${COOKIE_NAME}=value; Path=/; Max-Age=${REFERRAL_TTL}; HttpOnly; SameSite=Lax; Secure`,
  );
  assert.equal(
    referralCookie("", false, 0),
    `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
  );
});
