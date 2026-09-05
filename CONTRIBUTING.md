# Contributing

Thanks for improving Aperture for Omarchy. This source repository packages an
OMP-only Omarchy shell plugin; the canonical engine and signed OMP integration
are developed in
[`tomismeta/aperture`](https://github.com/tomismeta/aperture).

## Repository Boundaries

- `Service.qml` owns worker and protocol lifecycle.
- `WorkerModel.qml` and `WorkerOutputLogic.js` own accepted worker state.
- `Panel.qml` and `AttentionPeek.qml` own rendering and interaction.
- `WorkerBridgeLogic.js` serializes bounded control and opaque focus requests.
- `lib/aperture-attention-engine.cjs` and `integrations/omp/` are authenticated
  upstream artifacts and must not be edited downstream.

Keep judgment, ranking, continuity, deduplication, lane selection, receipts,
focus coordination, and typed OMP event mapping upstream. QML renders accepted
snapshots; it does not recreate engine policy or parse native harness payloads.
Session names, anonymous labels, and facets are presentation only and must not
affect identity, judgment, lanes, ordering, or continuity.

Native fallback is permitted only after a definite direct failure before any
bytes were written. Ambiguous or post-write outcomes must never emit fallback.
The native path is token-bounded, outside Aperture, and outside panel privacy.

## Runtime Contract

The plugin package version is `0.1.1`. Stock Omarchy supplies Node 22 or newer;
the plugin must never bundle, download, or install Node. Do not add
`node_modules`, runtime installers, downloaders, package managers, build hooks,
source maps, or third-party runtime dependencies. The signed CommonJS worker
bundles first-party ApertureCore and otherwise uses Node built-ins.

Preserve these product boundaries:

- **Focus OMP session** is the only external panel action. Privacy toggles,
  expansion, and inspection are local presentation actions, not OMP actions.
- NOW, NEXT, and AMBIENT ordering is canonical.
- Unsupported or ambiguous focus targets fail closed.
- Session labels are bounded; unnamed concurrent sessions receive stable,
  privacy-safe anonymous presentation.
- Queues, timers, retries, framing, replay, and teardown stay bounded.
- OMP typed events are the only attention input. Never infer attention from
  notification prose, process names, PIDs, or window titles.
- Theme values come from Omarchy; presentation colors are not hard-coded.

Package/release identity and wire identity are separate. Bump package versions
for immutable releases, not every commit; a Git installation is identified by
package version, commit, and `config/artifact-policy.json` together.
BUILDINFO schema version `2` keeps each protocol's version, path, and hash only
in `schemas.{output,surface,ompAttentionEvent,workerDirectMessage}`. These four
live protocols are independently version `4`: private worker JSONL hello uses
the output protocol, and public surface hello uses the surface protocol, never
the worker-direct protocol as an output alias.

`workerContract` retains only `notificationInput` and `jsonlHandshakes`; the OMP
package version lives at `integrations.omp.packageVersion`. Release series is
derived from the source tag, and fixtures do not carry a second protocol
version. Artifact policy retains the tag, commit, signature, hash, and host
requirements, but derives component identity from hash-authenticated BUILDINFO
rather than duplicating version fields.

## Signed Payload Changes

Change the upstream Aperture repository and publish an authenticated signed
worker release. Then replace the downstream payload with:

```bash
node .github/scripts/vendor-aperture-worker-release.mjs aperture-worker-v<major>.<minor>.<patch>
```

The vendor command authenticates the signed-tag release workflow, stages and
verifies the payload, and restores backups on caught replacement errors. This
is not a crash-atomic multi-file update. Run it in a development checkout, not
the live installed plugin. Never copy, rebuild, or patch generated worker or
extension bytes by hand.

## Source Checkout and Release Archive

A stock installation is a Git clone of the complete source repository. Keep
that path intact: `omarchy plugin update` depends on its Git history. Tests and
source tooling are development material, not stock manifest validation.

The repository-release tarball is different. Its closed 51-path allowlist in
`.github/workflows/plugin-release.yml` contains only:

- root product files: the nine production QML/JavaScript files, `README.md`,
  `LICENSE`, `manifest.json`, and `preview.png`
- all four `bin/` launch, lifecycle, and offline-verification commands
- `BUILDINFO.json`, `config/aperture-release-signers`, and
  `config/artifact-policy.json`
- all 31 immutable signed upstream payload files recorded by `BUILDINFO.json`:
  eight `evidence/*.json` files, 16 `fixtures/omp-direct/*.json` files, both
  `integrations/omp/` files, the CommonJS worker in `lib/`, and four canonical
  schemas

Do not broaden directory entries or replace the individual path allowlist with
an open archive of the repository. Tests, development fixtures, acceptance
data, workflows, vendor tooling, contributor material, completed SDLC
artifacts, Node, `node_modules`, source maps, and third-party runtime
dependencies must remain outside the release archive. The tarball is for an
authenticated repository release; extracting it does not create a stock
Git-managed installation.

## Release Policy

`plugin-release-check.yml` must pass on the exact protected-`main` commit before
an authorized annotated release tag can be considered. The existing immutable
`omarchy-aperture-v0.1.0` tag and its archive must never be moved or reused.
Plugin package `0.1.1` is reserved for the next immutable release; its archive
must match the new tagged source and signed payload. Historical `0.1.0` archives
do not acquire later Git-main fixes.
The release workflow verifies the signed tag and source commit, rebuilds the checks,
waits for approval in `omarchy-aperture-release`, publishes only the
deterministic archive and its SHA-256 checksum, and requires immutable GitHub releases.

The workflow creates no plugin-catalog submission. Stock Omarchy has no plugin
pre-remove hook, so direct removal can orphan OMP registration. Catalog
publication remains blocked; explicit two-step removal is the supported
operator workflow, not a replacement for a safe stock removal contract.
Deactivation uses stock disabled state, not a second settings store, to prevent
worker restart after shell reload. OMP sessions already running must be
restarted separately to unload their extension.

For updates, follow README's settings-preserving sequence: perform the stock
update, request worker shutdown and wait for zero processes/references, run
`omarchy-restart-shell`, then activate. Do not deactivate or substitute custom
process kills. This restart precaution does not establish a stock reload defect.
Restart existing OMP sessions separately to load the new extension.

Screen-reader readiness remains separate: Quickshell 0.3.1 does not expose its
managed windows through AT-SPI. A stock build containing the upstream fix and
fresh Orca acceptance checks are required; keyboard/pointer coverage does not
prove screen-reader support.

## Verification

Run the focused contract suite and offline payload verifier for changes:

```bash
node test/run.mjs
bin/omarchy-aperture-verify-payload --require-production
```

On stock Omarchy, also run `omarchy plugin validate .`. Behavioral changes must
be exercised in the real stock shell. Visual changes require keyboard and
pointer checks across relevant themes, scales, overflow, and multi-monitor
layouts. Focus changes require supported Herdr 0.8.2, Foot 1.27, and tmux 3.7c
paths before and after a hard worker crash.

Never substitute a preview, source inspection, or fixture-only result for the
changed stock surface.

Run the real supervisor scenarios on Linux with Node 22+ and Quickshell in the
graphical-session environment:

```bash
node test/qml-supervisor.test.mjs
```

The runner stages the actual QML supervisor in a temporary config and exercises
readiness, recoverable contention, fatal failures, exit-code fallback, and
serialized replacement with controlled children. It never replaces the
installed plugin or contacts its socket. For the authenticated worker, set
`APERTURE_SUPERVISOR_SCENARIO=production-overlap` and
`APERTURE_SUPERVISOR_PLUGIN_DIR` to a verified plugin checkout. The isolated
runtime holds a responsive old owner until the first replacement encounters
contention, then requires a new generation and an accepted heartbeat on the
current-UID, mode-0600 socket.

## Commits

Use narrow commits with concise imperative subjects. Do not include AI
co-author lines.
