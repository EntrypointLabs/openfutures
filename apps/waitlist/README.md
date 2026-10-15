# OpenFutures waitlist

An independent Vite + React + TypeScript application. Signup, simulated email verification,
and the referral dashboard are React components, with client-side routing and browser storage.
There is no backend, API, real authentication or email delivery.

From the monorepo root:

```sh
pnpm install
pnpm --filter @openfutures/waitlist dev
pnpm --filter @openfutures/waitlist test
pnpm --filter @openfutures/waitlist typecheck
pnpm --filter @openfutures/waitlist build
pnpm --filter @openfutures/waitlist preview
```

Development runs at http://localhost:5175; production preview uses port 4175.
`/` is signup/sign-in and `/dashboard` is the member dashboard. Existing paths
`/waitlist` and `/waitlist/dashboard` redirect to those routes; referral query strings survive.

The app imports the marketing site's existing styles and uses `apps/website/public` as its
Vite public directory. The existing responsive footer has been converted to React markup,
not redesigned. Shared assets are bundled into `apps/waitlist/dist` at build time: the website
does not need to be running in production. This avoids duplicating the brand assets in source.
The package's Turbo configuration includes those shared sources in build-cache inputs.

Set `VITE_WEBSITE_URL` to the marketing site's URL when needed. It defaults to
http://127.0.0.1:5174 in development and https://openfutures.xyz in production. The website's
`VITE_WAITLIST_URL` controls its outgoing Waitlist menu link; set it to this app's deployed URL.

Deploy `apps/waitlist` as its own Vite project with `dist` as the output directory. The included
Vercel rewrite serves the React routes on direct navigation and refresh. Other hosts must
provide the equivalent SPA fallback. No deployment is performed by this migration.

## Try the prototype

Create an account with email and username, then enter **123456** at the simulated verification
step. Accounts, stable referral links and activity use the existing
`openfutures-waitlist-preview-v1` local-storage key. Pending verification uses the existing
session-storage key. This is local UI persistence, not secure authentication.

Use **Preview controls → Simulate a referral** to populate activity and move up the sample
leaderboard. To exercise attribution, copy your link, sign out, open it in this same browser,
and create a second account. The original account receives one referral after verification.
Sign back in with the original email and **123456** to see the result. Repeat sign-ins do not
create memberships or referral credit again.

Changing from the website's port to this app's port changes the browser origin, so the old
website preview's local data is not transferred. Create a preview account in this app. The
same saved-data format is retained for deployments that keep the original origin. Data is
not shared across browsers/devices; clearing site storage resets the prototype.
