# SPFx Sample Upgrade Console — Specification (v0.2 draft)

## 1. Purpose

A local web app (runs on `localhost`) that lists every web part sample in my fork of
`pnp/sp-dev-fx-webparts`, shows each sample's current SPFx version and upgrade status,
and starts an upgrade by **GitHub Copilot coding agent** with one click.

The goal is to **minimize manual actions per upgrade**. The only manual steps I keep are:
1. Click **Launch upgrade**.
2. Review the PR.
3. Approve deployment.
4. Test the web part on my dev tenant.
5. Mark it as tested.

Expected pace: about one upgrade per day. Throughput is not a goal.

## 2. Decisions

| Topic | Decision |
|---|---|
| Agent | GitHub Copilot coding agent (could change later, so keep agent-specific parts isolated) |
| App stack | Node.js + TypeScript |
| Target SPFx version | Latest by default, overridable in config |
| PR lifecycle | PRs stay **open** after testing (not merged into fork `main`); contributed upstream later, manually |
| Graph-dependent samples (delegated permissions) | In scope |
| Samples calling third-party APIs | Out of scope (skip list) |

## 3. Non-goals (v1)

- No hosting: the app runs only on my machine.
- No automated functional testing (I test manually after deployment).
- No upstream contribution from the app.
- No tenant credentials anywhere in the app.
- No API permission approval automation (approved manually in the SharePoint admin center).

## 4. The two repositories

| | **App repo** (this repo) | **Fork repo** (`<me>/sp-dev-fx-webparts`) |
|---|---|---|
| Role | UI + orchestration | Where upgrades happen |
| Contains | Local web app + local backend | Samples, Copilot instructions, skills, setup steps, issue template, CI/CD workflows |
| Talks to | Local clone of the fork (read-only), GitHub API, npm registry (version lookup) | Copilot coding agent, GitHub Actions, SharePoint dev tenant |
| Secrets | GitHub token (local `.env`, never committed) | Tenant app registration certificate (GitHub environment secrets) |

**Rule:** the app *triggers* and *observes*. All upgrade, build and deploy logic lives in the
fork, so creating an issue by hand gives exactly the same result.

## 5. End-to-end flow

```
[App] click "Launch upgrade" on sample X
  → [GitHub] issue created in fork + assigned to Copilot coding agent (same API call)
  → [Copilot] reads instructions + skills, upgrades samples/X, opens PR (Closes #issue)
  → [Actions] build-sample.yml: build + package samples/X → .sppkg artifact, status check
  → [Me] review PR, add label `deploy`
  → [Actions] deploy-sample.yml (environment `dev-tenant`, requires my approval)
       → PnP PowerShell deploys .sppkg to the test site collection app catalog
       → PR comment: test page URL + any Graph permission requests to approve
  → [Me] approve Graph permissions if needed, test the web part
  → [Me] add label `tested`. PR stays open.
```

## 6. App repo — what to implement

### 6.1 Architecture
- **Frontend:** React (Vite) single-page app.
- **Backend:** Node.js + TypeScript (Express or Fastify). It's the only component holding the GitHub token; the frontend calls the backend only.
- **GitHub client:** Octokit (REST + GraphQL).
- **Config:**
  - `.env` (git-ignored): `GITHUB_TOKEN`
  - `config.json` (committed, no secrets):
    ```json
    {
      "forkLocalPath": "C:/dev/sp-dev-fx-webparts",
      "forkOwner": "<me>",
      "forkRepo": "sp-dev-fx-webparts",
      "baseBranch": "main",
      "targetSpfxVersion": "latest",
      "customAgent": "spfx-upgrade",
      "skipList": "config/skip-list.json"
    }
    ```
  - `targetSpfxVersion`: `"latest"` or an explicit version such as `"1.x.y"`.
  - `config/skip-list.json`: sample folders to exclude, each with a reason (e.g. third-party API).
- **Token:** fine-grained PAT scoped to the fork only, with the permissions GitHub documents for assigning issues to Copilot (Issues, Pull requests, Actions read, Contents read, Metadata read).

### 6.2 Target version resolution
- If `targetSpfxVersion` is `"latest"`: query the npm registry for the `latest` dist-tag of `@microsoft/generator-sharepoint` at startup and on refresh.
- The resolved **explicit** version is shown in the UI header and written into every issue. The agent never decides what "latest" means.

### 6.3 Sample discovery (from the local clone)
- Enumerate `forkLocalPath/samples/*`.
- Detect each sample's SPFx version:
  1. `package.json` → version of `@microsoft/sp-core-library` (primary source).
  2. Fallback: `.yo-rc.json` → `@microsoft/generator-sharepoint.version`.
  3. Neither found → show `unknown` and disable the button.
- Flag **Graph** samples (informational): `config/package-solution.json` contains `webApiPermissionRequests`, or `@microsoft/microsoft-graph-client` / `MSGraphClient` usage.
- Samples in the skip list show as **Skipped** with the reason, and their button is disabled.
- Rescan on demand (**Refresh** button).

> Because PRs stay open, `main` never contains upgraded code. The local clone always shows the
> **original** version, and upgrade progress comes only from GitHub (§6.4).

### 6.4 Status (from the GitHub API)
Each sample is matched to its issue by parsing the `### Sample folder` section of the issue body
(the format produced by the issue form, §7.6), among issues labelled `spfx-upgrade`.
The PR is found through the issue's linked PR (`Closes #<issue>`).

| Status | Rule |
|---|---|
| Skipped | in skip list |
| Up to date | detected version ≥ resolved target |
| Not started | no matching issue |
| Agent working | issue assigned to Copilot, no PR yet (or PR still draft with agent session running) |
| Build failed | PR's `build-sample` check failed |
| Build passed | `build-sample` check succeeded |
| Deployed | `deploy-sample` run succeeded for the PR's head commit |
| Tested | PR has label `tested` (terminal state) |
| Outdated upgrade | PR targets an older SPFx version than the current resolved target (shown as a warning) |

Each row links to its issue, PR and latest workflow runs.

### 6.5 UI
- Header: resolved target SPFx version · last refresh time.
- Table: sample · current SPFx version · Graph flag · status · links · **Launch upgrade** button.
- Filters: status; "needs upgrade only"; "Graph only".
- Sort: by version, by name.
- **Launch upgrade** is disabled if: up to date, skipped, unknown version, or an open upgrade issue already exists.
- A confirmation dialog shows the issue title and target version before anything is created.

### 6.6 Issue creation + agent assignment
One API call creates the issue **and** assigns it to Copilot (GitHub supports this via REST and GraphQL):
- Title: `[Upgrade] <folder-name> → SPFx <resolved-version>`
- Body: exactly the format the fork's issue form produces (§7.6): one `### <Field label>` section per field, in the same order, including the default "Instructions for Copilot" text.
- Label: `spfx-upgrade`.
- Agent assignment:
  - assignee: the Copilot coding agent bot
  - base branch: `baseBranch`
  - custom agent: `customAgent` (§7.3)
- **Everything the agent needs must be in the issue body.** Comments added to the issue later are not seen by the agent; follow-ups go as PR comments.

### 6.7 Out of scope for the app
No building, no deploying, no git writes, no tenant access.

## 7. Fork repo — what to implement

### 7.1 Repository settings
- Issues **enabled** (disabled by default on forks).
- Copilot coding agent enabled for the repo.
- Labels: `spfx-upgrade`, `deploy`, `tested`.
- Environment `dev-tenant` with **required reviewer = me**.
- Kept in sync with upstream before launching an upgrade.
- Check the setting for **Actions workflows on Copilot PRs**. By default they may need a manual "Approve and run" click. Decide whether to accept that extra click or change the setting.

### 7.2 Repository instructions (always loaded)
`.github/copilot-instructions.md` (or `AGENTS.md`), short and general:
- This repo is a fork of the PnP web part samples; each folder under `samples/` is an independent SPFx project.
- **Only modify the single `samples/<folder>` named in the issue.** Never touch other samples or repo-level files.
- For upgrade tasks, use the `spfx-upgrade` skill.
- PR rules: body contains `Closes #<issue>`, a summary of changes, the upgrade report steps applied, and anything skipped with the reason.
- Done means the project builds and packages. If that can't be reached, leave the PR as draft and explain what's blocking.

### 7.3 Custom agent (optional, recommended)
`.github/agents/spfx-upgrade.agent.md`: a dedicated agent profile for upgrades, selected by the app at assignment time. It keeps upgrade-specific behavior apart from the general repo instructions.

### 7.4 Skills
- `.github/skills/spfx/`: **unmodified** copy of the `spfx` skill from `SharePoint/spfx-dev-skills` (MIT), with an `UPSTREAM.md` recording the source commit so it can be refreshed.
- `.github/skills/spfx-sample-upgrade/`: my wrapper skill, which takes precedence over `spfx`:
  - Like-for-like upgrade: overrides the `spfx` skill's "PnPjs by default" rule and bans `react-design.md` (no UI redesign, no Fluent v9 migration).
  - Upgrade report written outside the sample folder (upstream rejects `upgrade-report.md`).
  - **gulp → Heft migration** whenever the target is ≥ 1.22 (`references/gulp-to-heft.md`, to be completed from the official Microsoft guide).
  - PnP sample hygiene: `.nvmrc`, README compatibility badges + version history, `assets/sample.json` (`SPFX-VERSION`, `updateDateTime`), `.devcontainer` image.
  - PR format and "draft if blocked" rule.

Validate the skills manually on 2–3 samples before the first agent run.

> Most samples are on gulp (SPFx ≤ 1.21) and gulp is officially unsupported from SPFx 1.24, so
> **nearly every upgrade includes a toolchain migration**. Expect lower agent success rates on old samples.

### 7.4b Upstream workflows in the fork
Enabling Actions on the fork also enables the upstream PnP workflows (stale issues, triage, docs deployment…).
Disable all of them except `validate-sample-pr.yml` and `validate-sample.yml`, which check PRs against the PnP contribution rules for free.

### 7.5 Agent environment setup
`.github/workflows/copilot-setup-steps.yml` (job name `copilot-setup-steps`):
- Install the Node version for the **target** SPFx version.
- `npm install -g @pnp/cli-microsoft365`.
- Pre-install anything else the skills rely on.
- Check that the agent firewall allows what the upgrade needs at runtime (npm registry at minimum).

### 7.6 Issue template
`.github/ISSUE_TEMPLATE/spfx-upgrade.yml` with these fields: sample folder, current version, target version, notes.
It must produce the same body as the app (§6.6), so issues created by hand also work.

### 7.7 Workflow `build-sample.yml`
- Trigger: `pull_request` to `main`.
- Detect the changed folder under `samples/`. **Fail if more than one sample changed.**
- Set up the Node version required by that sample's SPFx version.
- `npm ci` (or `npm install` if there is no lockfile), then the production build and package. Commands depend on the toolchain (gulp-based vs Heft-based), detected from the sample.
- Upload the `.sppkg` as a workflow artifact.
- Status check name: `build-sample`.

### 7.8 Workflow `deploy-sample.yml`
- Trigger: label `deploy` added to a PR whose `build-sample` check passed (plus `workflow_dispatch` for reruns).
- Environment `dev-tenant` (requires my approval).
- Downloads the `.sppkg` artifact from the build run (no rebuild).
- PnP PowerShell:
  - `Connect-PnPOnline` with app-only auth: client ID + **certificate**.
  - Deploy to the **site collection app catalog** of a dedicated test site, overwriting and publishing.
  - Create or update the test page `/SitePages/<folder-name>.aspx` with the web part added.
- PR comment: test page URL + list of Graph permission requests pending approval (if any).

### 7.9 Secrets (environment `dev-tenant`)
`TENANT_ID`, `CLIENT_ID`, `CERT_BASE64`, `CERT_PASSWORD`, `SITE_URL`.

## 8. Graph samples (delegated)

- Deployment works the same way. The **permission requests** declared by the package must be approved in the SharePoint admin center (API access) before the web part can call Graph.
- Approval stays **manual** (tenant admin action). The deploy workflow only lists what needs approving.
- Testing uses my own user (delegated), so the dev tenant needs whatever test data the sample expects (mail, calendar, groups…).

## 9. Security rules

- The GitHub token lives only in the app's backend `.env`, scoped to the fork, and is never committed.
- Tenant credentials live only in the fork's `dev-tenant` environment secrets, gated by my approval.
- The agent never has tenant credentials. `copilot-setup-steps.yml` must not reference `dev-tenant` secrets.
- **Dev tenant only.** Never an employer or client tenant.
- App registration: certificate auth, least privilege. Prefer `Sites.Selected` on the test site over tenant-wide permissions.

## 10. Milestones

1. **M0 – Fork ready:** settings, labels, issue template, instructions, skills, setup steps.
2. **M1 – Pipeline proven by hand:** 2–3 issues created manually and assigned to Copilot → PRs build green → deploy works → web parts tested.
3. **M2 – App read-only:** sample list, versions, Graph flag, skip list, target version resolution.
4. **M3 – App status:** GitHub status per sample.
5. **M4 – App launch:** create + assign issue from the UI.
6. **M5 – Polish:** filters, links, error handling, outdated-upgrade warning.

M1 comes before the app on purpose: if the pipeline doesn't produce clean PRs, the app is pointless.

## 11. Open decisions

- [ ] Custom agent profile (§7.3): use it, or rely on instructions + skills only?
- [ ] Approval click for Actions on Copilot PRs (§7.1): accept or change the setting?
- [ ] When an open PR becomes outdated because a newer SPFx version is released: re-run the upgrade on the same PR, or open a new issue?
- [ ] Initial contents of the skip list. Who identifies the third-party API samples: me manually, or a one-off scan?
