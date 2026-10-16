import assert from "node:assert/strict";
import test from "node:test";
import {
  captureReferral,
  completeVerification,
  emptyPreview,
  leaderboard,
  parsePreview,
} from "../src/preview.ts";
import type { Pending } from "../src/preview.ts";

const signup = (email: string, username: string, referrer: string | null = null): Pending => ({
  email,
  username,
  referrer,
  sentAt: 100,
});

test("a referred signup credits its inviter once; signing back in retains the original membership and code", () => {
  const first = completeVerification(
    emptyPreview(),
    signup("first@example.com", "first"),
    "first",
    "FIRST123",
    100,
  );
  const second = completeVerification(
    first,
    signup("second@example.com", "second", "FIRST123"),
    "second",
    "SECOND12",
    200,
  );
  assert.equal(second.members[0].referrals.length, 1);
  assert.equal(second.members[0].referrals[0].id, "second");
  const returning = completeVerification(
    second,
    signup("second@example.com", "changed", "FIRST123"),
    "unused",
    "UNUSED12",
    300,
  );
  assert.equal(returning.members.length, 2);
  assert.equal(returning.session, "second");
  assert.equal(returning.members[1].code, "SECOND12");
  assert.equal(returning.members[1].username, "second");
  assert.equal(returning.members[0].referrals.length, 1);
  const ownLink = completeVerification(
    returning,
    signup("first@example.com", "first", "FIRST123"),
    "ignored",
    "IGNORED1",
    400,
  );
  assert.equal(ownLink.members[0].referrals.length, 1);
});

test("referral attribution keeps the first valid link, ignores invalid links, and expires after thirty days", () => {
  const invalid = captureReferral(emptyPreview(), "NOTACODE", 100);
  assert.equal(invalid.attribution, null);
  const first = captureReferral(invalid, "openperp", 100);
  const later = captureReferral(first, "OPENDELT", 200);
  assert.deepEqual(later.attribution, { code: "OPENPERP", at: 100 });
  const expired = captureReferral(later, "OPENDELT", 100 + 31 * 86400000);
  assert.equal(expired.attribution?.code, "OPENDELT");
});

test("existing signed-in members cannot acquire a new referral attribution", () => {
  const existing = completeVerification(
    emptyPreview(),
    signup("member@example.com", "member"),
    "member",
    "MEMBER12",
  );
  assert.equal(captureReferral(existing, "OPENPERP").attribution, null);
});

test("saved memberships retain sessions, referral codes and referral activity after restoration", () => {
  const original = completeVerification(
    emptyPreview(),
    signup("member@example.com", "member"),
    "member",
    "MEMBER12",
  );
  const restored = parsePreview(JSON.stringify(original));
  assert.deepEqual(restored, original);
  assert.deepEqual(parsePreview("broken JSON"), emptyPreview());
  assert.deepEqual(parsePreview('{"members":[{"email":"invalid"}]}').members, []);
});

test("rank changes with referral credit, and ties favor earlier verification", () => {
  const early = completeVerification(
    emptyPreview(),
    signup("early@example.com", "early"),
    "early",
    "EARLY123",
    100,
  );
  const both = completeVerification(
    early,
    signup("late@example.com", "late"),
    "late",
    "LATE1234",
    200,
  );
  const ranked = leaderboard(both);
  assert.ok(
    ranked.findIndex((entry) => entry.id === "early") <
      ranked.findIndex((entry) => entry.id === "late"),
  );
  const credited = completeVerification(
    both,
    signup("friend@example.com", "friend", "LATE1234"),
    "friend",
    "FRIEND12",
    300,
  );
  assert.ok(
    leaderboard(credited).findIndex((entry) => entry.id === "late") <
      leaderboard(credited).findIndex((entry) => entry.id === "early"),
  );
});
