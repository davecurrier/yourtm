# Retiring the Next.js engine — Swift port plan

Working plan for making YourTM.app self-sufficient: no Node, no `next dev`, no
`localhost:3344`. Written 2026-07-29 to be picked up in later sessions with no
prior context.

**Status: not started.** Feasibility is proven and two components exist, but
zero processing has moved to Swift. See *Current state* below before assuming
otherwise.

---

## 1. Goal — distribution, not tidiness

The real driver: **Dave needs to hand the app to his team and have them edit the
container.** Today that is impossible, and not because of file layout.

`BackendManager.swift` shells out to `node` and launches `next dev` from
`node_modules`. Handing someone `YourTM.app` alone fails at launch. A working
install needs:

| | |
|---|---|
| `YourTM.app` | 28 MB |
| engine source (`desktop/src`) | 620 KB |
| `node_modules` | **1.1 GB** |
| Node installed on their Mac | required |

So the port is what makes the app *distributable at all* — afterwards it is one
signed ~28 MB bundle, drag-and-drop installable, no Node.

**Distribution alone is not enough, and embedding the container is the wrong
answer to the rest.** If container sources live inside the `.app`, sending the
app sends a frozen snapshot: the recipient's edits land in their copy, yours in
yours, two containers diverging with no way to merge. A self-contained *app* is
correct; a self-contained *app + container* is a single-player product.

Target end state, in order:

1. **Installable** — native Swift, no Node, no `packages/desktop`. §6 below.
2. **Shareable** — the container is hosted; a teammate installs the app, signs
   in, and edits the shared container without ever touching a file. §7.
3. Team features (roles, approvals, version history) on top of 2 — these are
   already specified in `CLAUDE.md` §6 and §8, and none of them are achievable
   while the container is a folder on one laptop.

Interim, and it works today: `projects/vital-tag` is already a git repo, so a
developer teammate can clone it and point the app at their clone. That covers
developers, not marketers, and needs no new work.

Note this demotes the document-package idea (§5b): if the container is hosted,
packaging a local folder is cosmetic. Keep it, but it is no longer load-bearing.

## 2. Verified facts — do not re-spike these

Both hard blockers were tested on 2026-07-29 and cleared. Re-running the spikes
is wasted effort; the evidence:

| Blocker | Resolution | Measured |
|---|---|---|
| TypeScript **compilation** — no Swift equivalent of esbuild | The `esbuild` npm package is only a Node wrapper around a self-contained Mach-O binary. Invoke it with `Process`. | 9.9 MB binary; compiles TS → minified IIFE standalone; still runs after the app is codesigned |
| TypeScript **AST editing** — no Swift TypeScript parser exists | `ts-morph` bundles to one JS file and runs in **JavaScriptCore**, a macOS system framework. Strings in / strings out, so the JS never touches a filesystem (`useInMemoryFileSystem`). | 13.3 MB bundle; **144 ms** load once, **10.9 ms** per edit — faster than the HTTP round-trip it replaces |

Both were verified against a real container file
(`projects/vital-tag/yourtm/tags/meta-pixel.ts`) **from inside the shipped,
codesigned `.app`**, not just from the source tree.

Conclusion: nothing about this port is blocked on an unknown. What remains is
volume plus two genuinely risky pieces (§5).

## 3. Current state

Already built and committed (`f463d66`):

- `Sources/YourTM/NativeCompiler.swift` — drives the bundled esbuild binary.
  Reads both pipes before `waitUntilExit()` so a large bundle cannot deadlock
  the child.
- `Sources/YourTM/ScriptRuntime.swift` — actor hosting ts-morph in a `JSContext`.
  Resolves its resource from the app bundle, falling back to the source tree so
  `swift run` works.
- `scripts/build-js-runtime.sh` — regenerates both resources. They are
  gitignored (~23 MB of build output).

**Both have zero callers.** They are proven, shelf-ready, and currently dead
code. That is the honest starting line.

## 4. Real scope

The often-quoted "13,057 LOC" overstates the job: 7,483 of it is the Next.js web
UI, which the SwiftUI app already replaced and which gets **deleted, not ported**.

| Area | LOC | Disposition |
|---|---|---|
| `desktop/src/app/api/**/route.ts` | 4,635 | **Port** — the actual engine |
| `desktop/src/lib/*.ts` | 817 | **Port** — project config, ts-morph editing, watcher |
| `desktop/src/app/**/*.tsx` + components | 7,483 | **Delete** — superseded by SwiftUI |
| `cli/src/compiler/` | 872 | **Port** (see §5) |
| `cli/src/vendors/` (GTM import) | 766 | **Port** |
| `cli/src/cloudflare/` | 4,051 | **Port selectively** — mostly REST calls that become `URLSession`; check how much is worker-template text |
| `cli/src/utils/config.ts` | 184 | **Port** — loads `yourtm.config.ts` via esbuild |

So ~5,450 LOC of engine to port, plus the CLI pieces it leans on.

## 5. The two risky pieces

Everything else is mechanical. These are not.

### 5.1 The compiler is not "just esbuild"

`cli/src/compiler/index.ts` marks `@yourtm/*` external, then **strips those
import statements from the output and regex-injects identity shims** for the
`define*()` helpers:

```js
const defineVariable = (variable) => variable;
const defineDataLayerVariable = (variable) => ({ ...variable, type: 'dataLayer' });
// …one per helper
```

Stopping at `--external:` leaves esbuild's `require` shim in the bundle, which
throws in a browser. This was observed directly, not theorised.
`NativeCompiler.bundle()` is deliberately documented as a primitive for exactly
this reason — **do not treat it as a container build.**

Failure mode to fear: output that compiles cleanly and breaks at runtime. Verify
by diffing compiled bundles byte-for-byte against the current engine's output
for the whole `projects/vital-tag` container before switching anything over.

### 5.2 Rewriting TypeScript sources corrupts files when done casually

`project-service.ts` edits tag/trigger/variable sources. An earlier session
corrupted `beacon-analytics.ts` (22 tags → 21) because the writer emitted raw
unescaped strings and mishandled `code` as a non-standard property. The escaping
that matters, for multi-line values:

```
backtick-quote, then escape  \  →  \\ ,  ` →  \` ,  ${ →  \${
```

`ScriptRuntime.editAsset()` already implements this. Keep it there — never
hand-roll text manipulation on TypeScript sources in Swift. That is precisely
what caused the corruption.

## 6. Phases

Each phase must leave the app fully working. Never break the engine path until
its Swift replacement passes the stated check.

### Phase 1 — asset editing off Node
Wire `ScriptRuntime` into the asset save path, replacing the `ts-morph` half of
`project-service.ts`. Smallest step that turns dead code into a live replacement.

*Verify:* round-trip every asset in `projects/vital-tag` (22 tags, plus triggers,
variables, zones) through Swift and through the engine; the outputs must be
byte-identical. Confirm the file count never drops — that is the corruption
signature.

### Phase 2 — the compiler
Port `compiler/` including the import-strip and shim injection. Keep the JS
compiler runnable side by side during this phase.

*Verify:* compile the full container both ways; every bundle byte-identical.
Then load a Swift-built bundle in a real browser and confirm the same 12 tags
fire and the same 5 vendor scripts load (the check `scratchpad/vendor-check.mjs`
performs).

**Status: core bundle done** (`NativeBuilder.buildCore`). Measured against the
engine on the reference container: 18,659 vs 18,661 bytes, with exactly two
differences and no others.

1. **One constant folds differently.** The engine emits
   `13*30*24*60*60*1e3`, native emits `390*24*60*60*1e3`. Both equal
   33,696,000,000 — the 13-month consent expiry. Same esbuild (0.27.3), same
   source file, reproducible from a cold engine restart with the output deleted;
   CLI and Node API fold identically in isolation, so it is not the invocation.
   Semantically equal, so it was not worth chasing further.
2. **Asset ordering.** The engine emits glob order (`university-pages` first),
   native emits alphabetical (`all-pages` first). Contents are **identical as a
   set** — all 19 triggers and 13 variables match field for field.

The ordering divergence is deliberate and should stay. Glob order is filesystem
order, so the engine's builds are not reproducible across machines; sorting
makes them so. Triggers are registered by id, so order does not affect firing.
Do not "fix" this by matching the engine.

Still to do in this phase: zone bundles (`generateZoneBundle`) and the orphan-tag
default bundle, then wiring the build into the app's Build action.

### Phase 3 — the read-only and file routes
`project`, `project/[type]/[id]`, `project/tags/[id]`, `settings`,
`settings/project`, `project/deployment`, `project/clear`, `project/audit`,
`project/watch`, `preview/bookmarklet`. Plain `FileManager` + JSON.

*Verify:* each Swift call returns the same payload as the engine route for the
same input.

### Phase 4 — Cloudflare and deploy
`project/deploy`, `deploy/status`, `deploy/versions`, `deploy/rollback`,
`project/rum`, `build`. `URLSession` against the Cloudflare REST API.

Carry these hard-won details across:
- Account-owned tokens (`cfat_`) verify at `/accounts/{id}/tokens/verify`, **not**
  `/user/tokens/verify`. Using the wrong one produces a false "invalid token".
- Durable Object migrations are first-creation only. Re-sending `new_tag` on an
  existing script fails with error **10079** — try with, fall back to without.
- The metadata `bindings` array **replaces all bindings**; anything omitted is
  silently dropped. Parse `[vars]` as well as `[durable_objects]`.
- Uploading a script binds **no route**. Routes are a separate zone-scoped API
  (`syncWorkerRoutes`), and a worker without them is unreachable on the domain.
- Route patterns match the **full URL**, so `/ytmcore.js` needs a trailing `*`
  to survive a query string.
- Script listing is **paginated at 10** — do not conclude a worker is missing
  from an unpaginated list.

*Verify:* deploy to staging, confirm routes bind, confirm `/ytmcore.js` serves
and `/_ytm/telemetry` accepts a POST and reads back through
`/_ytm/telemetry/stats`.

### Phase 5 — WordPress and telemetry
`wordpress`, `wordpress/sites/[id]`, `wordpress/sync`, `wordpress/zones`,
`preview/telemetry`, `preview/dev-server`, `project/import`, `project/create`,
`project/templates`.

Keep the human-readable WordPress failure messages (`describeWpFailure` in
`desktop/src/app/api/wordpress/route.ts`). Before that existed, a site without
the plugin dumped an entire HTML page into the UI and a bad key dumped a
`WP_Error` JSON envelope. Map 401/403 → invalid key, 404/405 → no plugin, and
never echo a body starting with `<`.

*Verify:* connect a site, publish a bundle, confirm `bundle_version` advances on
the WordPress side.

### Phase 5b — containers as document packages

Goal: a container is **one Finder item**, not a loose folder of `.ts` files —
`Vital Design.yourtm`, double-clickable, with *Show Package Contents* to drill
in. Sequenced after Phase 3 because it changes how the project path is resolved.

**Not an option: storing sources inside `YourTM.app`.** Verified 2026-07-29 —
writing a single file into the bundle immediately invalidates the signature
(`a sealed resource is missing or invalid`). It would also be destroyed by every
app update, and fails outright when macOS translocates a downloaded app to a
read-only path.

The correct pattern is a **document package**: a directory declared with
`LSTypeIsPackage` in `Info.plist`, which Finder presents as a single file. Same
mechanism as `.sketch`, `.rtfd`, `.xcodeproj` — and as `.app` itself.

Why this over hiding sources in `~/Library/Application Support/`: a package is
still a **real directory**, so esbuild, ts-morph, external editors and **git all
keep working unchanged**. `projects/vital-tag` is a git repo; that survives.
Nothing in path resolution needs to change beyond pointing at the package.

Work:
- Declare the exported type + `LSTypeIsPackage` and a document icon.
- Register `.yourtm` as a document type so double-click opens the app.
- Migration: existing plain-directory projects must keep opening. Detect and
  offer conversion; never silently move a user's files.
- Sources become externally editable (see below), so the app must watch for
  on-disk changes and reload — `desktop/src/lib/file-watcher.ts` and the
  `project/watch` route become FSEvents in Swift.

*Verify:* Finder shows one item with the right icon; *Show Package Contents*
reveals `yourtm/`; double-click opens the container; a plain-directory project
still opens; compiling from inside a package produces bundles identical to
compiling from the directory form.

### Phase 6 — delete the engine
Remove `BackendManager`'s spawn path, delete `packages/desktop`, drop `next` from
the workspace. Confirm the app launches and functions with **no Node on `PATH`**.

## 6b. Phase 7 — hosted container (the actual goal)

Everything above only makes the app *installable*. This is what makes it
*shareable*, which is the requirement that started the work (§1).

Shape: **app = client, container = remote.** The teammate installs one bundle,
signs in, and sees the container. Local files become a working copy, not the
source of truth.

The infrastructure already exists in this account — no new vendor:

- **R2** — container documents (assets as JSON, plus compiled bundles).
- **Durable Object** — write-locking and version history. One DO per container
  serialises writes, which is what stops two editors clobbering each other. The
  telemetry DO already proves the pattern.
- **Worker** — the API surface, already deployed and routed.

Work, roughly in order:
1. Define the container document format and a migration from the file tree.
2. Worker endpoints: read, write-with-version-check, list versions.
3. Auth. Cloudflare API tokens are the expedient start; real user accounts are a
   product decision, not a technical one.
4. App: sync, conflict surface ("someone else changed this"), offline read.
5. Export/import to the file tree, so git and `ytm` keep working.

*Verify:* two machines, same container, edits from one visible on the other; a
stale write is rejected rather than silently winning.

Open: does a hosted container become the only mode, or does local-folder mode
stay for solo/developer use? Keeping both is more work but is what makes the
"developer-centric, it's just TypeScript in git" positioning survive.

## 7. Decisions already made

- **One compiler, two front ends.** `ytm` becomes a thin shell over the same
  esbuild binary rather than keeping a second Node copy of the compile logic.
  Two implementations of the same thing already caused the duplicate WordPress
  push (`cli/src/commands/deploy.ts:488` bypasses the engine route) — don't add
  another.
- **ts-morph stays JavaScript**, hosted in JavaScriptCore. Do not attempt a
  Swift TypeScript parser or regex-based source editing.
- **esbuild ships as a binary** inside the `.app`, regenerated by
  `scripts/build-js-runtime.sh`, gitignored.

## 8. Open questions

- How much of `cli/src/cloudflare/` (4,051 LOC) is REST plumbing versus worker
  template strings? Determines whether it ports or largely moves to Swift string
  literals.
- Does the CLI need to keep working *during* the port, or can it break
  temporarily? Affects whether Phase 2 must maintain both compilers.
- `packages/desktop/` is currently **gitignored** (`.gitignore:35`), so none of
  the engine has history. Worth tracking it before porting, so the reference
  implementation is recoverable — the same exclusion on
  `examples/vital-design/` already caused one permanent loss of a function body.

## 9. Trap: `worker.js` is NOT built from the TypeScript sources

Measured 2026-07-29 on `projects/vital-tag`:

| | count |
|---|---|
| Tag sources in git HEAD | 22 |
| Tag sources in working tree | 21 (`linkedin-setup.ts` deleted, uncommitted) |
| Tags inside the compiled `worker.js` | **23** |

The sets genuinely differ:

- Present in `worker.js` with **no source file**: `ga4-debug`, `ga4-ss`,
  `linkedin-setup`
- Present as a source with **no worker counterpart**: `ga4-server-side`

`ga4-ss` vs `ga4-server-side` looks like one tag renamed on one side only.

So the deployed `worker.js` is **hand-maintained**, not generated from
`yourtm/tags/`. Consequences for this port:

1. **Never validate a Swift build by diffing against `worker.js`.** They are
   different artifacts that have drifted. Diff Swift output against the *current
   engine's* output for the same sources — that is the only apples-to-apples
   comparison.
2. Reconciling the two is separate work, and should happen **before** Phase 2
   rather than being discovered mid-port. Until then, treat the source tree as
   the port's subject and the worker as a production artifact that happens to be
   ahead of it.

## 10. Regression baseline

Capture before changing anything, so "unchanged" is provable rather than assumed:

- Compile `projects/vital-tag` with the current engine; record each bundle's
  SHA-256. That set is the Phase 2 target.
- The live site fires **12 tags** and loads **5 vendor scripts** from their own
  CDNs (`scratchpad/vendor-check.mjs` drives this in a real browser). The single
  aborted `google.com/ccm/collect` request is gtag's own Google Ads beacon and is
  expected — not a regression.
- `projects/vital-tag/test/telemetry-stats.test.mjs` — 18 cases, all passing.
- Tag source count is **21** in the working tree. A drop after any edit means
  source corruption (§5.2), not a successful change.
