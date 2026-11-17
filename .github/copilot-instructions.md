# Repository instructions for Copilot

## What this repo is
**SPFx Sample Upgrade Console**: a local-only web app (runs on `localhost`) that lists the SPFx web part
samples of a local clone of a fork of `pnp/sp-dev-fx-webparts`, shows their SPFx version and upgrade
status, and (later) starts upgrades by creating GitHub issues.

**Read `docs/SPEC.md` before any task.** Section 6 is the part this repo implements; section 7 describes
the fork repo and is NOT implemented here.

## Stack and layout
- Node.js 22, TypeScript (strict), ESM, npm workspaces.
- `server/`: Fastify API. The **only** component that reads the file system, holds the GitHub token
  and calls external APIs.
- `web/`: React + Vite + Fluent UI v9. Calls the server through `/api/*` only.
- `shared/`: TypeScript types shared by server and web (types only, no runtime code).
- Tests: Vitest (both packages), React Testing Library (web).
- Test fixtures: `server/test/fixtures/samples/` (fake sample folders). Tests never read the real fork clone.

## Commands
- `npm ci`: install
- `npm run dev`: start server + web
- `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` · `npm run format:check`

All five checks must pass before a PR is ready. CI runs the same commands.

## Hard rules
- **Security**
  - The GitHub token is read from `.env` by the server only. Never send it to the web app, never log it, never commit it.
  - The server binds to `127.0.0.1` only, never `0.0.0.0`.
  - `config.json` and `.env` are git-ignored; only `config.example.json` and `.env.example` are committed.
- **Read-only on the fork clone.** The app never writes, deletes or runs git commands in the fork clone.
- **Scope.** Implement exactly what the issue asks. No extra features, no speculative abstractions, no
  unrelated refactoring. If the spec and the issue conflict, follow the issue and mention the conflict in the PR.
- **Dependencies.** Don't add a runtime dependency unless the issue allows it or it's clearly necessary;
  justify each new one in the PR description.
- **Robustness.** One malformed sample must never break the whole scan: capture the error on that
  sample and continue.
- **Tests.** Every new module with logic gets unit tests. Bug fixes come with a test that reproduces the bug.
- **Code style.** Small pure functions, explicit types at module boundaries, no `any`, no `@ts-ignore`,
  no disabled lint rules.

## Pull requests
- Description: `Closes #<issue>`, what changed, how it was tested, and any deviation from the issue or spec.
- Keep PRs small. If the issue turns out too big, implement a coherent part and explain what's left.
