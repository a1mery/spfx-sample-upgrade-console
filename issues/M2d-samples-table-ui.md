**Title:** [M2d] Samples table UI: list, filters, sort, refresh

## Context
SPEC §6.5, **read-only part only**. GitHub status (M3) and the Launch upgrade button (M4) come later.
Uses `GET /api/samples`, `POST /api/samples/refresh` and `GET /api/target-version`.

## Requirements

### Header
- Title, **target SPFx version** (with "from npm" / "from config" and a "stale" warning badge when `stale`).
- Last scan time (`scannedAt`, local time format).
- **Refresh** button: calls `POST /api/samples/refresh`, disabled and showing a spinner while running.
- Summary counts: total · needs upgrade · up to date · skipped · unknown version.

### Table (Fluent UI v9 `DataGrid` or `Table`)
| Column | Content |
|---|---|
| Sample | title (or folder if no title) + folder name in secondary text |
| SPFx version | version, or "unknown" (with the `error` message as tooltip if present) |
| Toolchain | badge: Heft / gulp / unknown |
| Graph | icon/badge if `usesGraph` |
| Status | derived, see below |

Derived status (M2 only):
| Status | Rule |
|---|---|
| Skipped | `skipped` (show `skipReason` as tooltip) |
| Unknown | `spfxVersion === null` |
| Needs upgrade | `needsUpgrade === true` |
| Up to date | `needsUpgrade === false` |

Put this logic in a pure function `web/src/samples/deriveStatus.ts` (unit-tested).

### Filters and sort
- Text search on title + folder (case-insensitive).
- Status filter (multi-select), default: all.
- "Graph only" toggle.
- Sort by sample name (default) or SPFx version (semver order; unknown last).
- Filter and sort logic in pure functions in `web/src/samples/` (unit-tested), not inside components.
- Filters persist in the URL query string (so a refresh keeps them).

### States
- Loading (initial), error (with a retry button and the server's error message), empty result after filtering ("No sample matches the filters").

### Tests
- Unit: `deriveStatus`, filter, sort (including unknown versions).
- Component (React Testing Library, mocked fetch): renders rows, filtering reduces rows, Refresh calls the endpoint and updates the scan time, error state shows retry.

## Acceptance criteria
- [ ] With a real clone (~450 samples), the table loads and filters without visible lag.
- [ ] Keyboard accessible: table, filters and Refresh are reachable and usable with the keyboard.
- [ ] No GitHub calls, no Launch upgrade button in this PR.
