import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Contract fixtures for browser interaction. Database/authorization run independently
// against real PostgreSQL and the actual API handlers in tests/*.test.ts.
function provider() {
  const users = new Map<string, { id: string; email: string }>();
  const members = new Map<
    string,
    { username: string; code: string; joinedAt: string; inviter: string | null }
  >();
  const pending = new Set<string>();
  let conflict = false;
  function ranked() {
    return [...members]
      .map(([id, member]) => ({
        ...member,
        id,
        count: [...members.values()].filter((m) => m.inviter === member.code).length,
      }))
      .sort((a, b) => b.count - a.count || a.joinedAt.localeCompare(b.joinedAt));
  }
  async function attach(context: BrowserContext) {
    let inviter: string | null = null;
    await context.route("https://waitlist-test.supabase.co/auth/v1/**", async (route) => {
      const request = route.request();
      if (request.method() === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" },
        });
      const body = request.postDataJSON();
      const headers = {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
        "x-supabase-api-version": "2024-01-01",
        "access-control-expose-headers": "X-Supabase-Api-Version",
      };
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/otp")) {
        if (!body.create_user && !users.has(body.email))
          return route.fulfill({
            status: 403,
            headers,
            json: { code: "otp_disabled", msg: "Signups not allowed for otp" },
          });
        pending.add(body.email);
        return route.fulfill({ headers, json: {} });
      }
      if (path.endsWith("/verify")) {
        if (body.token !== "313131" || !pending.has(body.email))
          return route.fulfill({
            status: 403,
            headers,
            json: { code: "otp_expired", msg: "Token has expired or is invalid" },
          });
        pending.delete(body.email);
        if (!users.has(body.email))
          users.set(body.email, { email: body.email, id: crypto.randomUUID() });
        const user = users.get(body.email)!;
        const payload = Buffer.from(
          JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }),
        ).toString("base64url");
        return route.fulfill({
          headers,
          json: {
            access_token: `e30.${payload}.test`,
            refresh_token: user.id,
            token_type: "bearer",
            expires_in: 3600,
            user: { ...user, aud: "authenticated", email_confirmed_at: new Date().toISOString() },
          },
        });
      }
      if (path.endsWith("/logout")) return route.fulfill({ status: 204, headers });
      throw new Error(`Unexpected auth request ${path}`);
    });
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url());
      const token = request.headers().authorization?.slice(7);
      const id = token
        ? JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub
        : null;
      const member = id ? members.get(id) : null;
      if (path.pathname.endsWith("/capture")) {
        const code = request.postDataJSON().code;
        if (!member && !inviter && [...members.values()].some((m) => m.code === code))
          inviter = code;
        return route.fulfill({
          json: {
            referrer: [...members.values()].find((m) => m.code === inviter)?.username ?? null,
          },
        });
      }
      if (!id)
        return route.fulfill({
          status: 401,
          json: { error: { code: "unauthorized", message: "Please sign in again." } },
        });
      if (path.pathname.endsWith("/membership")) {
        const { username } = request.postDataJSON();
        if (conflict) {
          conflict = false;
          return route.fulfill({
            status: 409,
            json: {
              error: {
                code: "username_taken",
                message: "That username is taken. Choose another to finish joining.",
              },
            },
          });
        }
        if (!member)
          members.set(id, {
            username,
            code: String(members.size + 1).padStart(8, "A"),
            joinedAt: new Date().toISOString(),
            inviter,
          });
        return route.fulfill({ json: { ok: true } });
      }
      const board = ranked();
      if (path.pathname.endsWith("/me")) {
        const entry = board.find((m) => m.id === id);
        return route.fulfill({
          json: {
            member: entry
              ? {
                  username: entry.username,
                  code: entry.code,
                  joinedAt: entry.joinedAt,
                  count: entry.count,
                  rank: board.findIndex((m) => m.id === id) + 1,
                }
              : null,
            activity: {
              items: board
                .filter((m) => m.inviter === entry?.code)
                .map((m) => ({ at: m.joinedAt })),
              nextOffset: null,
            },
          },
        });
      }
      if (path.pathname.endsWith("/leaderboard"))
        return route.fulfill({
          json: {
            items: board.map((m, index) => ({
              username: m.username,
              count: m.count,
              rank: index + 1,
              isYou: m.id === id,
            })),
            nextOffset: null,
          },
        });
      throw new Error(`Unexpected API request ${path.pathname}`);
    });
  }
  return {
    attach,
    members,
    collide: () => {
      conflict = true;
    },
  };
}
async function requestCode(page: Page, email: string, username?: string) {
  if (username) await page.getByRole("textbox", { name: /^Username/ }).fill(username);
  await page.getByLabel("Email address").fill(email);
  await page
    .getByRole("button", { name: username ? "Join the waitlist" : "Send sign-in code" })
    .click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
}
async function verify(page: Page, code = "313131") {
  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify & continue" }).click();
}
test("two independent browsers: verified signup, referral, reload and returning sign-in", async ({
  browser,
}) => {
  const service = provider();
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await service.attach(firstContext);
  await service.attach(secondContext);
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await first.goto("/");
  await first.evaluate(() =>
    localStorage.setItem(
      "openfutures-waitlist-preview-v1",
      JSON.stringify({ session: "fake", members: [{ username: "fake" }] }),
    ),
  );
  await first.reload();
  await requestCode(first, "first@example.com", "first");
  await expect(first.getByRole("button", { name: /Resend in/ })).toBeDisabled();
  await verify(first, "000000");
  await expect(first.getByRole("alert")).toContainText("expired or is invalid");
  await verify(first);
  await expect(first.getByRole("heading", { name: "You're on the list." })).toBeVisible();
  const link = await first.getByLabel("Your referral link").inputValue();
  await second.goto(link);
  await expect(second.getByText("Invited by first")).toBeVisible();
  await requestCode(second, "second@example.com", "second");
  await verify(second);
  await expect(second.getByRole("heading", { name: "You're on the list." })).toBeVisible();
  await first.reload();
  await expect(first.locator(".wl-stat").first().locator("dd")).toHaveText("1");
  await expect(first.getByText("New referral verified")).toBeVisible();
  await first.getByRole("button", { name: "Sign out", exact: true }).click();
  await requestCode(first, "first@example.com");
  await verify(first);
  await expect(first.getByLabel("Your referral link")).toHaveValue(link);
  expect(service.members.size).toBe(2);
  await firstContext.close();
  await secondContext.close();
});
test("username conflict recovers in the verified session without another code", async ({
  context,
  page,
}) => {
  const service = provider();
  await service.attach(context);
  service.collide();
  await page.goto("/");
  await requestCode(page, "member@example.com", "taken");
  await verify(page);
  await expect(page.getByRole("heading", { name: "Choose your username" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("username is taken");
  await page.getByRole("textbox", { name: /^Username/ }).fill("available");
  await page.getByRole("button", { name: "Finish joining" }).click();
  await expect(page.getByRole("heading", { name: "You're on the list." })).toBeVisible();
  expect([...service.members.values()][0].username).toBe("available");
});
test("unknown sign-in stays generic and resend has a sixty-second cooldown", async ({
  context,
  page,
}) => {
  const service = provider();
  await service.attach(context);
  await page.clock.install();
  await page.goto("/?mode=signin");
  await requestCode(page, "unknown@example.com");
  await expect(page.getByRole("button", { name: /Resend in/ })).toBeDisabled();
  await page.clock.runFor(61000);
  await page.getByRole("button", { name: "Resend code", exact: true }).click();
  await expect(page.getByRole("button", { name: /Resend in/ })).toBeDisabled();
  expect(service.members.size).toBe(0);
});
test("a revoked session removes the dashboard and returns to sign-in", async ({
  context,
  page,
}) => {
  const service = provider();
  await service.attach(context);
  await page.goto("/");
  await requestCode(page, "member@example.com", "member");
  await verify(page);
  await expect(page.getByRole("heading", { name: "You're on the list." })).toBeVisible();
  await context.route("**/api/me", (route) =>
    route.fulfill({
      status: 401,
      json: { error: { code: "unauthorized", message: "Please sign in again." } },
    }),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("session expired");
  await expect(page.getByLabel("Your referral link")).toHaveCount(0);
});
test("leaderboard pages append and a failed dashboard load can be retried", async ({
  context,
  page,
}) => {
  const service = provider();
  await service.attach(context);
  await page.goto("/");
  await requestCode(page, "member@example.com", "member");
  await verify(page);
  await expect(page.getByRole("heading", { name: "You're on the list." })).toBeVisible();
  let unavailable = true;
  await context.route("**/api/me", async (route) => {
    if (unavailable) {
      return route.fulfill({
        status: 503,
        json: { error: { code: "database_unavailable", message: "Please try again." } },
      });
    }
    return route.fallback();
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Please try again.");
  unavailable = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "You're on the list." })).toBeVisible();
  await context.route("**/api/leaderboard?*", async (route) => {
    const next = new URL(route.request().url()).searchParams.get("offset") === "5";
    return route.fulfill({
      json: {
        items: Array.from({ length: 5 }, (_, i) => ({
          username: `other${i + (next ? 5 : 0)}`,
          count: 10 - i,
          rank: i + 1 + (next ? 5 : 0),
          isYou: false,
        })),
        nextOffset: next ? null : 5,
      },
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "Show more members" }).click();
  await expect(page.getByRole("cell", { name: "other9", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show top members" }).click();
  await expect(page.getByRole("cell", { name: "other9", exact: true })).toHaveCount(0);
});
