**Title:** [M2a] Sample discovery: detect samples, SPFx version, toolchain and Graph usage

## Context
SPEC §6.3. This issue is a **pure server-side module plus tests**: no API endpoint, no UI.
It reads a `samples/` folder (a local clone of the PnP web parts repo) and returns one record per sample.

## Requirements

### Shared type (`shared/`)
```ts
export type Toolchain = 'gulp' | 'heft' | 'unknown';
export type VersionSource = 'package.json' | '.yo-rc.json' | null;

export interface SampleInfo {
  folder: string;               // folder name under samples/
  title: string | null;         // assets/sample.json → [0].title
  spfxVersion: string | null;   // normalized "x.y.z", null if unknown
  versionSource: VersionSource;
  toolchain: Toolchain;
  usesGraph: boolean;
  error: string | null;         // set if the sample couldn't be parsed; scan continues
}
```

### Module `server/src/samples/discoverSamples.ts`
`discoverSamples(samplesRoot: string): Promise<SampleInfo[]>`
- Lists **directories** directly under `samplesRoot` (ignore files and hidden folders). Results sorted by `folder`.
- **SPFx version**, in this order:
  1. `package.json` → `dependencies` or `devDependencies` → `@microsoft/sp-core-library`
  2. fallback: `.yo-rc.json` → `["@microsoft/generator-sharepoint"].version`
  3. else `null`
- **Normalize** versions: strip range prefixes (`^`, `~`, `>=`…); keep `x.y.z` (and a pre-release suffix if present). Use the `semver` package (allowed dependency).
- **Toolchain**:
  - `heft` if any dependency name starts with `@rushstack/heft`
  - else `gulp` if `gulpfile.js` exists or a `gulp` dependency is present
  - else `unknown`
- **Graph usage** (`usesGraph = true` if any):
  - `config/package-solution.json` → `solution.webApiPermissionRequests` contains an entry whose `resource` is `Microsoft Graph`
  - a dependency on `@microsoft/microsoft-graph-client` or `@pnp/graph`
- **Title**: `assets/sample.json` is a JSON array; take `[0].title`. Missing or invalid → `null` (not an error).
- **Errors**: invalid JSON in `package.json` or `.yo-rc.json` → `error` set (message includes the file name), other fields filled as far as possible. **Never throw for a single sample.** Only a missing or unreadable `samplesRoot` makes the function throw.
- **Performance**: read samples concurrently (bounded, e.g. 16 at a time). ~450 folders must scan in under 2 s on a laptop SSD.

### Fixtures (`server/test/fixtures/samples/`)
Create these fake samples (minimal files only, no `src/`):

| Folder | Content | Expected |
|---|---|---|
| `react-gulp-old` | package.json with `"@microsoft/sp-core-library": "~1.4.1"`, `gulp` devDep, `gulpfile.js` | `1.4.1`, gulp, source package.json |
| `react-heft-recent` | package.json with `"1.22.1"`, `@rushstack/heft` devDep, `assets/sample.json` with title | `1.22.1`, heft, title set |
| `react-yo-only` | no sp-core-library in package.json, `.yo-rc.json` with version `1.18.0` | `1.18.0`, source .yo-rc.json |
| `react-graph` | `"1.20.0"` + `config/package-solution.json` with a Microsoft Graph permission request | usesGraph true |
| `react-pnp-graph` | `"1.21.1"` + `@pnp/graph` dependency | usesGraph true |
| `react-broken-json` | `package.json` containing invalid JSON | error set, spfxVersion null |
| `react-no-version` | package.json without SPFx deps, no `.yo-rc.json` | spfxVersion null, error null |
| `.hidden-folder` | anything | ignored |
| `README.md` (file) | | ignored |

### Tests (`server/src/samples/discoverSamples.test.ts`)
- One test per fixture row above.
- Missing `samplesRoot` → throws a clear error.
- Result is sorted by folder.

## Acceptance criteria
- [ ] All fixture expectations covered by tests; `npm test` passes.
- [ ] No API route or UI change in this PR.
- [ ] Only new dependency: `semver` (+ `@types/semver`).
