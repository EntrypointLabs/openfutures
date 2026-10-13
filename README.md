# OpenFutures

Monorepo for OpenFutures, managed with pnpm workspaces and Turborepo.

```
apps/
  trading/        the trading terminal (Vite, React, TypeScript, Tailwind)
  website/        the marketing site (Vite, static HTML, vanilla JS)
packages/
  core/           platform-agnostic types, constants and functions shared by every app
  ui/             shared interface pieces, starting with the logo (React, a web component, icons)
  tsconfig/       the TypeScript base config every workspace extends
```

## Commands

Run from the repository root:

```sh
pnpm install
pnpm dev          # starts every app that has a `dev` script
pnpm build
pnpm typecheck
pnpm format
```

`pnpm dev` currently starts the trading app on http://localhost:5173 and the website on
http://localhost:5174. Turborepo runs the `dev` script of every workspace, so a new app or
backend joins it by defining its own `dev` script.
To run one workspace only: `pnpm --filter @openfutures/trading dev`.

## Shared code

`@openfutures/core` holds what must mean the same thing on web, backend and mobile: the domain
types (`Market`, `Venue`, `Position`, `Order`, `Trade`), shared constants, number and date
formatting, and the pricing and order-book maths. It has no DOM, React or Node dependencies, and
it should stay that way so any runtime can import it.

It is consumed as TypeScript source (its `exports` point at `src/`), so there is no build step
and edits show up in apps immediately. A consumer that cannot compile TypeScript from
`node_modules` will need a build step added to the package first.

To use it from a new workspace, add `"@openfutures/core": "workspace:*"` to its dependencies.

## Adding a workspace

1. Create `apps/<name>` or `packages/<name>` with a `package.json` named `@openfutures/<name>`.
2. Extend `@openfutures/tsconfig/base.json` in its `tsconfig.json`.
3. Give it `dev`, `build` and `typecheck` scripts as they apply; Turborepo picks them up.
