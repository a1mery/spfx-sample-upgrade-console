**Title:** [M2c] Resolve the target SPFx version and flag samples that need an upgrade

## Context
SPEC §6.2. The target is `"latest"` by default, overridable in `config.json`. The app resolves "latest"
itself, so every issue it creates (M4) contains an **exact** version.

## Requirements

### Resolver (`server/src/target/resolveTargetVersion.ts`)
- If `config.targetSpfxVersion` is an explicit version → use it, `source: "config"`, no network call.
- If `"latest"` → `GET https://registry.npmjs.org/@microsoft/generator-sharepoint`, read `dist-tags.latest`, `source: "npm"`.
- Cache the npm result for 1 hour. `forceRefresh` parameter bypasses the cache.
- Network or registry failure:
  - if a cached value exists → return it with `stale: true`
  - else → throw a clear error
- Use the built-in `fetch` with a 10 s timeout. The fetch function is injectable for tests.

### Shared types
```ts
export interface TargetVersion {
  version: string;
  source: 'config' | 'npm';
  resolvedAt: string;   // ISO date
  stale: boolean;
}
// extend SampleRow (from M2b):
//   needsUpgrade: boolean | null;   // null when spfxVersion is null
```

### API
- `GET /api/target-version` → `TargetVersion` (or `502 { error }` if it can't be resolved and nothing is cached).
- `GET /api/samples` rows now include `needsUpgrade`: `semver.lt(spfxVersion, target)`.
  If the target can't be resolved → `needsUpgrade: null` for all rows, and the response still returns `200`.
- `POST /api/samples/refresh` also refreshes the target version (`forceRefresh`).

### Tests (mocked fetch, no real network)
- Explicit config version → no fetch call.
- `"latest"` → reads `dist-tags.latest`.
- Cache: a second call within 1 h → one fetch; `forceRefresh` → a new fetch.
- Failure with cache → stale value; failure without cache → error.
- `needsUpgrade`: older → true, equal → false, newer → false, unknown version → null.

## Acceptance criteria
- [ ] With `"latest"`, `GET /api/target-version` returns the current SPFx generator version from npm.
- [ ] Changing `targetSpfxVersion` in `config.json` to an explicit version is respected after a restart.
- [ ] No new runtime dependency.
