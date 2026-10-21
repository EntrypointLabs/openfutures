import assert from "node:assert/strict";
import test from "node:test";
import { parseAllowedOrigins } from "../server/origins.ts";

test("origin configuration keeps the primary and normalizes explicit deployment aliases", () => {
  const primary = "https://waitlist.openfutures.xyz";
  assert.deepEqual(parseAllowedOrigins(primary), [primary]);
  assert.deepEqual(
    parseAllowedOrigins(primary, ` https://waitlist-zeta-lemon.vercel.app/, ${primary}/, `),
    [primary, "https://waitlist-zeta-lemon.vercel.app"],
  );
  assert.deepEqual(parseAllowedOrigins("http://localhost:3000"), ["http://localhost:3000"]);
});
test("origin configuration rejects wildcards, non-HTTP URLs, paths and credential-bearing URLs", () => {
  for (const origin of [
    "*",
    "https://*.vercel.app",
    "data:text/plain,hi",
    "https://user:password@example.com",
    "https://example.com/dashboard",
    "https://example.com?origin=other",
    "https://example.com#other",
  ]) {
    assert.throws(() => parseAllowedOrigins("https://example.com", origin));
  }
});
