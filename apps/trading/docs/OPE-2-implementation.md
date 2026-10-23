# OPE-2 implementation

The confirmed artifact is a design reference for the changes in [OPE-2](https://linear.app/entrypoint/issue/OPE-2/openfutures-v123-confirmed-baseline-design-full-build-run-2). Its single-file controller and template are not an application entry point.

The implementation keeps `main.tsx`, `App.tsx`, `useTerminal`, the React Router integration, shared core package, and existing Trade/Prop components. Watch and Liquidity changes extend their existing components and view models. Copy and Points have their own feature components and view-model builders, composed by the existing terminal. Shared analytics cards and footer controls are reusable React components.

Design source: `source/Main.dc.html` and `CHANGELOG.md` in the OpenFutures v123-confirmed ZIP attached to OPE-2. The confirmed design is a reference, not a production runtime dependency.

The work covers the ticket's Market Watch, Liquidity, Copy, Points and phone shell changes. It uses the repository's existing market, venue and vault data and calculation helpers. UI transactions retain the app's simulated account behavior.

## Validation

- `pnpm --filter @openfutures/trading build` passed, including TypeScript compilation.
- `node apps/trading/scripts/verify-ope2.mjs` passed 46 scenarios: route round trips, independent chart controls, funding spread/carry, expandable venues, deposit validation and acknowledgment, withdrawals and exit cancellation, Copy mirroring/position sheets, and Points filters/navigation.
- Browser checks covered Markets, Exchanges, Funding, Liquidity vaults and analytics, Copy trader detail, and Points at 1440px and 390px in dark and light themes. All checked views fit the viewport and loaded their images.
- Browser interactions verified chart dropdowns open 8px below their controls, phone funding expansion and last-page return, Calendar/Stats persistence, position-logo detail clicks, deposit confirmation, early exit disclosure/cancellation, and the existing Profile-to-Points link.
- `git diff --check` passed. `main.tsx`, `App.tsx`, `useTerminal.ts`, the shared core package and existing market/venue datasets have no changes from main. Trade and Profile reuse the extracted position card with their existing view-model data.

The PR is based on the latest main branch and retains its shared keyboard, focus, scroll and tooltip components.

The latest-main integration also passed 28 browser view combinations with no page overflow or broken images. Keyboard checks verified dropdown Arrow/End/Enter behavior, selection/focus restoration and Copy dialog Escape handling.
