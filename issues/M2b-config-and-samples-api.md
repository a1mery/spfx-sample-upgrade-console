**Title:** [M2b] Config loading, skip list and GET /api/samples

## Context
SPEC §6.1 and §6.3. Wires `discoverSamples` (M2a) to configuration and exposes it through the API.

## Requirements

### Config (`server/src/config/`)
- Load `config.json` from the repo root (path overridable with `CONFIG_PATH` env var) and validate it with `zod`:
  ```ts
  {
    forkLocalPath: string;                        // must exist and contain a samples/ folder
    forkOwner: string;
    forkRepo: string;
    baseBranch: string;                           // default "main"
    targetSpfxVersion: string;                    // "latest" or a valid semver version
    customAgent?: string;
    skipList: string;                             // path, relative to repo root, default "config/skip-list.json"
  }
  ```
- Load `.env`. `GITHUB_TOKEN` is **optional for now** (it's needed from M3).
- Invalid or missing config: the server **fails at startup** with a readable message listing every problem (zod issues mapped to plain text). Never print the token.
- Update `config.example.json` and add `config/skip-list.example.json`.

### Skip list
- File format:
  ```json
  [ { "folder": "react-some-sample", "reason": "Calls a third-party API" } ]
  ```
- Missing file → empty list (log a warning). Invalid file → startup error.
- Skip list entries whose folder doesn't exist → warning in the log, not an error.

### Shared types
```ts
export interface SampleRow extends SampleInfo {
  skipped: boolean;
  skipReason: string | null;
}
export interface SamplesResponse {
  samples: SampleRow[];
  scannedAt: string;   // ISO date
  total: number;
}
```

### API
- `GET /api/samples`: returns `SamplesResponse` from an **in-memory cache**. The first call triggers the scan.
- `POST /api/samples/refresh`: rescans `forkLocalPath/samples`, replaces the cache, returns the new `SamplesResponse`.
- Concurrent refreshes share the same in-flight scan (no double scan).
- Scan failure (e.g. folder deleted) → `500` with `{ error: string }`; the previous cache is kept.

### Tests
- Config: valid config; each invalid field gives a clear message; `"latest"` accepted; `"1.x"` rejected.
- Skip list: missing → empty; invalid → error; applied to the rows.
- API with `app.inject()` against the M2a fixtures: `GET` returns all fixture samples, a skipped one is flagged, `POST /refresh` updates `scannedAt`, concurrent refreshes call `discoverSamples` once.

## Acceptance criteria
- [ ] `npm run dev` with a valid `config.json` pointing at a real clone returns all samples at `GET /api/samples`.
- [ ] With an invalid config, startup fails with a message a human can act on.
- [ ] Token never appears in logs or responses.
- [ ] New dependency allowed: `zod`.
