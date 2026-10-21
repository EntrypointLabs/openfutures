import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handler } from "../server/api.ts";
import { COOKIE_NAME, signReferral } from "../server/referral.ts";

const origin = "https://waitlist.example.com";
const secret = "a-test-secret-longer-than-thirty-two-characters";
const userId = "00000000-0000-0000-0000-000000000001";
function fixture(
  options: { existing?: boolean; auth?: boolean; authStatus?: number; failure?: string } = {},
) {
  const calls: { url: URL; body: any }[] = [];
  const db = createClient("https://supabase.example.com", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        calls.push({ url, body });
        if (url.pathname.endsWith("/user")) {
          const status = options.authStatus ?? (options.auth === false ? 401 : 200);
          return Response.json(
            status === 200
              ? {
                  id: userId,
                  email_confirmed_at: new Date().toISOString(),
                  email: "private@example.com",
                }
              : { msg: "invalid" },
            { status },
          );
        }
        if (url.pathname.includes("/rpc/"))
          return options.failure
            ? Response.json({ message: options.failure, code: "P0001" }, { status: 400 })
            : Response.json(
                url.pathname.endsWith("waitlist_me")
                  ? { member: null, activity: { items: [], nextOffset: null } }
                  : { items: [], nextOffset: null },
              );
        if (url.searchParams.has("referral_code"))
          return Response.json(
            url.searchParams.get("referral_code") === "eq.ABCD2345"
              ? { username: "inviter" }
              : null,
          );
        return Response.json(options.existing ? { user_id: userId } : null);
      },
    },
  });
  async function request(
    endpoint: Parameters<typeof handler>[0],
    input: {
      method?: string;
      headers?: Record<string, string>;
      body?: unknown;
      query?: Record<string, string>;
    } = {},
  ) {
    const headers: Record<string, string | number | readonly string[]> = {};
    let status = 0;
    let result: any;
    const req = {
      method: endpoint === "me" || endpoint === "leaderboard" ? "GET" : "POST",
      headers: {
        origin,
        "content-type": "application/json",
        authorization: "Bearer test-token",
        ...input.headers,
      },
      body: input.body ?? {},
      query: input.query ?? {},
    } as VercelRequest;
    if (input.method) req.method = input.method;
    const res = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
      status: (value: number) => {
        status = value;
        return res;
      },
      json: (value: unknown) => {
        result = value;
        return res;
      },
    } as unknown as VercelResponse;
    await handler(endpoint, { db, origin, secret, secure: true })(req, res);
    return { status, result, headers };
  }
  return { request, calls };
}
test("API validates method, origin, JSON, pagination and identity before database access", async () => {
  const f = fixture();
  assert.equal((await f.request("membership", { method: "GET" })).status, 405);
  assert.equal(
    (await f.request("capture", { headers: { origin: "https://evil.example" } })).status,
    403,
  );
  assert.equal((await f.request("capture", { body: "{" })).status, 400);
  assert.equal(
    (await f.request("capture", { headers: { "content-type": "text/plain" } })).status,
    415,
  );
  assert.equal((await f.request("me", { headers: { authorization: "" } })).status, 401);
  assert.equal((await f.request("me", { query: { offset: "-1" } })).status, 400);
  assert.equal((await fixture({ auth: false }).request("me")).status, 401);
  // A throttled or failing Auth provider is retryable, never an expired session.
  for (const authStatus of [408, 429, 500, 502]) {
    const response = await fixture({ authStatus }).request("me");
    assert.equal(response.status, 503);
    assert.equal(response.result.error.code, "auth_unavailable");
  }
});
test("first valid referral is preserved; invalid input never overwrites; members cannot acquire attribution", async () => {
  const f = fixture();
  const capture = await f.request("capture", { body: { code: "abcd2345" } });
  assert.equal(capture.result.referrer, "inviter");
  assert.match(String(capture.headers["Set-Cookie"]), /HttpOnly.*Secure/);
  const cookie = `${COOKIE_NAME}=${signReferral("ABCD2345", secret)}`;
  const repeat = await f.request("capture", { headers: { cookie }, body: { code: "OTHER234" } });
  assert.equal(repeat.result.referrer, "inviter");
  assert.equal(repeat.headers["Set-Cookie"], undefined);
  assert.equal(
    (await f.request("capture", { body: { code: "bad" } })).headers["Set-Cookie"],
    undefined,
  );
  assert.equal(
    (await fixture({ existing: true }).request("capture", { body: { code: "ABCD2345" } })).result
      .referrer,
    null,
  );
});
test("membership binds verified token identity and signed attribution, never body-supplied identity or inviter", async () => {
  const f = fixture();
  const result = await f.request("membership", {
    headers: { cookie: `${COOKIE_NAME}=${signReferral("ABCD2345", secret)}` },
    body: { username: " Member ", user_id: "attacker", referred_by: "attacker" },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(
    f.calls.find((c) => c.url.pathname.endsWith("create_waitlist_membership"))?.body,
    { p_user_id: userId, p_username: "Member", p_referral_code: "ABCD2345" },
  );
  assert.match(String(result.headers["Set-Cookie"]), /Max-Age=0/);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.equal((await f.request("membership", { body: { username: "x" } })).status, 400);
  assert.equal(
    (
      await fixture({ failure: "username_taken" }).request("membership", {
        body: { username: "Member" },
      })
    ).status,
    409,
  );
  const unavailable = await fixture({ failure: "secret SQL error" }).request("membership", {
    body: { username: "Member" },
  });
  assert.equal(unavailable.status, 503);
  assert.ok(!JSON.stringify(unavailable.result).includes("secret SQL"));
});
test("authenticated reads use bounded pages and do not expose auth identity", async () => {
  const f = fixture();
  const response = await f.request("leaderboard", { query: { offset: "5" } });
  assert.equal(response.status, 200);
  assert.deepEqual(f.calls.at(-1)?.body, { p_user_id: userId, p_offset: 5, p_limit: 25 });
  await f.request("leaderboard", { query: { top: "true" } });
  assert.equal(f.calls.at(-1)?.body.p_limit, 5);
  assert.ok(!JSON.stringify(response.result).includes("private@example.com"));
  assert.equal(response.headers["Cache-Control"], "no-store");
});
test("SPA fallback excludes every API endpoint while retaining frontend deep links", async () => {
  const { readFile } = await import("node:fs/promises");
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const fallback = new RegExp(`^${config.rewrites[0].source}$`);
  for (const path of [
    "/api",
    "/api/me",
    "/api/membership",
    "/api/leaderboard",
    "/api/referrals/capture",
    "/api/unknown",
  ])
    assert.equal(fallback.test(path), false, path);
  for (const path of ["/", "/dashboard", "/waitlist", "/waitlist/dashboard"])
    assert.equal(fallback.test(path), true, path);
});
