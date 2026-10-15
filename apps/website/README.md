# OpenFutures website

Static rebuild of the OpenFutures landing page (originally built in Framer).

Part of the OpenFutures monorepo. From the repository root:

```bash
pnpm install
pnpm --filter @openfutures/website dev
```

The dev server runs on http://localhost:5174. `pnpm --filter @openfutures/website build` writes the production site to `apps/website/dist/`.

## Layout

- `index.html`, `contact.html`, `terms-and-conditions.html`, `privacy-policy.html`, `404.html` — page markup, generated (see below)
- `src/styles/framer.css`, `src/styles/fonts.css`, `src/styles/routes/` — the site's stylesheets and font faces, generated
- `src/styles/behaviors.css` — styles owned by this codebase
- `src/behaviors/` — one module per interaction (reveals, sliders, tickers, navbar, accordions, hover states)
- `src/lib/` — shared helpers (frame loop, breakpoints, DOM)
- `public/assets/` — images and fonts

## Where the markup came from

The pages were generated from captures of the original Framer site. Those captures and the
generator scripts live outside this repository, in `open-futures-website-capture` next to the
monorepo folder. The HTML and stylesheets here are the source of truth: edit them directly.

## Routing

Pages use clean URLs (`/contact`, not `/contact.html`). The dev and preview servers handle that through `vite.config.js`; `vercel.json` does the same on Vercel (set the project's root directory to `apps/website`). Other static hosts need their equivalent setting, and should serve `404.html` for unknown paths.

## Contact form

The form does not send anywhere yet. Set `data-endpoint` on the `<form>` in `contact.html` to a URL that accepts a JSON `POST` (`name`, `email`, `Topic`, `message`). Without it, submitting shows the error state.

## Waitlist app

The waitlist is a separate Vite + React workspace at `apps/waitlist`. The website menu links
to port 5175 during development. Set `VITE_WAITLIST_URL` to its actual URL when deploying;
the production fallback is `https://waitlist.openfutures.xyz/`. Account and referral UI live
entirely in that app. See [its README](../waitlist/README.md) for setup and preview instructions.
