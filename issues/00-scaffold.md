**Title:** Scaffold the project: npm workspaces, Fastify server, React web app, tooling

## Context
Empty repo with `docs/SPEC.md`. Read it, especially §6.1. This issue creates the skeleton every later
feature builds on. **No features**: only structure, tooling and one health endpoint.

## Requirements

### Structure
```
package.json            npm workspaces: server, web, shared
.nvmrc                  22
tsconfig.base.json      strict, ESM, shared compiler options
eslint.config.js        flat config, typescript-eslint, react-hooks (web)
.prettierrc
config.example.json     as in SPEC §6.1 (placeholder values)
.env.example            GITHUB_TOKEN=ghp_your_token_here
server/                 Fastify + TypeScript
web/                    Vite + React + TypeScript + Fluent UI v9
shared/                 shared TypeScript types only (no runtime code)
```

### Server (`server/`)
- Fastify, TypeScript, ESM. Dev via `tsx watch`, build via `tsc`.
- Listens on **`127.0.0.1` only**, port from `PORT` env var, default `3001`.
- `GET /api/health` → `200 { "status": "ok" }`.
- `buildApp()` factory exported separately from `listen()`, so tests use `app.inject()` without opening a port.
- Loads `.env` with `dotenv` at startup (no config logic yet).

### Web (`web/`)
- Vite + React + TypeScript + `@fluentui/react-components` (v9), wrapped in `FluentProvider` (webLightTheme).
- Dev server proxies `/api` to `http://127.0.0.1:3001`.
- Single page: title "SPFx Sample Upgrade Console" and the result of `GET /api/health` ("Server: ok" or an error message).

### Shared (`shared/`)
- `shared/src/index.ts` exporting a placeholder `HealthResponse` type, used by both server and web.

### Root scripts
| Script | Does |
|---|---|
| `dev` | starts server and web together (`concurrently`) |
| `build` | builds shared, server, web |
| `lint` | ESLint on all workspaces |
| `typecheck` | `tsc --noEmit` on all workspaces |
| `test` | Vitest on all workspaces (`--run`, no watch) |
| `format` / `format:check` | Prettier write / check |

### Tests
- Server: test `GET /api/health` with `app.inject()`.
- Web: React Testing Library test that the title renders (mock `fetch`).

### Git
- `.gitignore` must include `node_modules`, `dist`, `.env`, `config.json`, `coverage`.
- Commit `package-lock.json`.

## Acceptance criteria
- [ ] `npm ci && npm run dev` starts both apps; http://localhost:5173 shows the title and "Server: ok".
- [ ] `npm run format:check`, `lint`, `typecheck`, `test`, `build` all pass locally and in CI (`.github/workflows/ci.yml`).
- [ ] Server refuses connections on non-loopback interfaces (bound to `127.0.0.1`).
- [ ] No feature code beyond the health endpoint.

## Out of scope
Config loading, sample discovery, GitHub API: later issues.
