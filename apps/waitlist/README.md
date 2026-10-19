# OpenFutures waitlist

Vite + React frontend, same-project Vercel Functions, Supabase Auth/Postgres and Resend SMTP.
The existing marketing styles, assets, and responsive React footer are preserved. No website
server is required in production: its assets are bundled during the waitlist build.

## Configure services

Create separate Supabase projects for development/previews and production. For **each project**:

1. Apply `supabase/migrations/202610160001_waitlist.sql` in the Supabase SQL editor, or use the
   Supabase CLI to link the project and push the migration. Apply it once per project.
2. Enable email signup and email OTP under Authentication → Sign In / Providers → Email.
   Set OTP length to **6**, expiry to **600 seconds**, and the email send cooldown to **60 seconds**.
   Keep Supabase's authentication rate limits enabled; review email/IP limits for expected traffic.
3. Replace the email templates used for **Confirm signup** and **Magic Link** with
   `supabase/templates/otp.html`. The `{{ .Token }}` variable sends the code rather than a link.
4. Verify a sending domain in Resend. Configure Supabase Authentication → SMTP with
   `smtp.resend.com`, port `465`, username `resend`, password set to the Resend API key, and a
   sender address on that verified domain. Supabase's default mail service is not production email.
   Resend credentials belong in Supabase SMTP settings, never in the browser or repository.
5. Set the Supabase Site URL to this environment's waitlist URL. Authentication and membership
   belong exclusively to this waitlist project; trading app login is not connected.

Copy `.env.example` to `.env.local` inside this app and fill it in. The two Supabase URLs must
reference the **same project**. The publishable key is public; the service-role key and cookie
secret must remain server-only. Generate a separate cookie secret per environment with
`openssl rand -hex 32`. Do not use production credentials in local tests or preview deployments.

Configure the same variables in the Vercel project's environment settings. `WAITLIST_ORIGIN`
must exactly match the browser origin (scheme + hostname + port), including for each preview.
Cookies are Secure on HTTPS and host-only; previews do not share attribution with production.

## Run and deploy

From the monorepo root:

```sh
pnpm install
pnpm --filter @openfutures/waitlist dev       # Vite only, port 5175; no local API
pnpm --filter @openfutures/waitlist dev:full  # Vercel frontend + API, port 3000
pnpm --filter @openfutures/waitlist typecheck
pnpm --filter @openfutures/waitlist test
pnpm --filter @openfutures/waitlist exec playwright install chromium
pnpm --filter @openfutures/waitlist test:e2e
pnpm --filter @openfutures/waitlist build
```

`dev:full` requires the Vercel CLI and a linked Vercel project. Run `vercel link` from this app
if needed; select the waitlist project with root directory `apps/waitlist`. Vercel should use
Vite, `pnpm build`, and output directory `dist`. Enable access to files outside the root directory
so the workspace UI package and website assets are available. `vercel.json` keeps API requests
outside the SPA fallback. Use `http://localhost:3000` locally with the example origin; switching
to `127.0.0.1` requires updating `WAITLIST_ORIGIN` to match.

`/` is signup/sign-in, `/dashboard` is the member dashboard. Legacy `/waitlist` and
`/waitlist/dashboard` paths redirect and retain query parameters. `VITE_WEBSITE_URL` controls
marketing links; it defaults to port 5174 locally and `https://openfutures.xyz` in production.
The website's `VITE_WAITLIST_URL` should point to this app.

## API and security

| Endpoint | Authentication | Result |
| --- | --- | --- |
| `POST /api/referrals/capture` | Optional bearer token; exact Origin required | `{referrer: string \| null}`; signed HttpOnly attribution cookie |
| `POST /api/membership` | Verified bearer token; exact Origin required | `{ok: true}`; body `{username}` |
| `GET /api/me?offset=0` | Verified bearer token | `{member: null \| {username, code, joinedAt, count, rank}, activity: {items: [{at}], nextOffset}}` |
| `GET /api/leaderboard?top=true` | Verified bearer token | `{items: [{username, count, rank, isYou}], nextOffset}` |

Send JSON for POST requests. Subsequent leaderboard requests use `?offset=<nextOffset>` and
return at most 25 rows; initial `?top=true` returns five. Activity pages contain five timestamps.
All API responses use `Cache-Control: no-store`. Errors use `{error: {code, message}}`.
A 401 requires sign-in again; username conflicts return 409 and retain the verified session.
Provider failures return a retryable 503 without leaking SQL or credentials.

The browser SDK manages authentication/session refresh; only the public key is exposed.
The API verifies access tokens using Supabase `getUser` and requires confirmed email.
RLS and grants prevent browser roles accessing member tables, ranking views, or RPCs directly.
Only the server service role can call membership/ranking operations. No client-supplied user ID
or inviter ID is trusted. First valid referral attribution lasts 30 days in the current browser;
invalid links do not overwrite it. Membership creation is transactional, serialized per auth user,
and immutable on retries. Every credited referral is one new verified membership. Counts are
derived from inviter relationships; rankings use count, join time, then stable user ID.

The leaderboard exposes usernames and counts only; activity contains dates, not invitee identities.
Membership creation time is when a verified user finishes choosing their username. Referral
priority is consideration only, with no automatic trading entitlement. Email verification does
not prevent one person from registering multiple different email addresses.

Preview accounts, local-storage fixtures, demo codes and simulated referrals are not imported.
Pending real signup form data may be remembered in session storage; it never grants membership.

## Tests and release checks

`test` exercises actual API handlers/cookie signatures and starts an **isolated temporary PostgreSQL
cluster** for migration, concurrent membership/username claims, ranking, privacy and role permissions.
It never connects to an existing database. Install PostgreSQL binaries (`initdb`, `pg_ctl`, `psql`)
on PATH to run database tests; those tests report a skip if the binaries are absent.

Playwright tests use controlled Auth/API contract fixtures to cover browser interactions:
wrong/expired code errors, resend cooldown, username recovery without reverification, ignored
preview storage, reload, logout, returning sign-in and two separate browser referral sessions.
They do not prove live Supabase mail delivery or deployment wiring.

Before launch, apply the migration and configure SMTP/settings above in the development project.
Using two independent browser profiles on a Vercel preview, verify a real emailed code, stable
referral link, one credited referral, repeat sign-in, expired/reused code rejection and direct
`/dashboard` refresh. Verify `/api/me` without a token returns JSON 401 and private data cannot
be fetched with the public Supabase key. Repeat the smoke test in production after configuration.
Use Supabase Auth logs and Vercel function errors to monitor delivery, verification and API failures;
do not log email addresses, codes, access tokens or cookie values.

Use the Supabase dashboard for member inspection and SQL/CSV ranking exports. No custom admin,
trading auth, wallet flow, campaign email, or pilot invitation system is included.
