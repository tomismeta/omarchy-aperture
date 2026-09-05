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

The package version remains `0.1.0`. Stock Omarchy supplies Node 22 or newer;
the plugin must never bundle, download, or install Node. Do not add
`node_modules`, runtime installers, downloaders, package managers, build hooks,
source maps, or third-party runtime dependencies. The signed CommonJS worker
bundles first-party ApertureCore and otherwise uses Node built-ins.

Preserve these product boundaries:

- **Focus OMP session** is the only panel action.
- NOW, NEXT, and AMBIENT ordering is canonical.
- Unsupported or ambiguous focus targets fail closed.
- Session labels are bounded; unnamed concurrent sessions receive stable,
  privacy-safe anonymous presentation.
- Queues, timers, retries, framing, replay, and teardown stay bounded.
- OMP typed events are the only attention input. Never infer attention from
  notification prose, process names, PIDs, or window titles.
- Theme values come from Omarchy; presentation colors are not hard-coded.

## Signed Payload Changes

Change the upstream Aperture repository and publish an authenticated signed
worker release. Then replace the downstream payload transactionally with:

```bash
node .github/scripts/vendor-aperture-worker-release.mjs aperture-worker-v<major>.<minor>.<patch>
```

The vendor command authenticates the signed-tag release workflow. Never copy, rebuild, or
patch worker or extension bytes by hand.

## Source Checkout and Release Archive

A stock installation is a Git clone of the complete source repository. Keep
that path intact: `omarchy plugin update` depends on its Git history and may use
the tests and source tooling before accepting a fast-forward update.

The repository-release tarball is different. Its closed 50-path allowlist in
`.github/workflows/plugin-release.yml` contains only:

- root product files: the nine production QML/JavaScript files, `README.md`,
  `LICENSE`, `manifest.json`, and `preview.png`
- all four `bin/` launch, lifecycle, and offline-verification commands
- `BUILDINFO.json`, `config/aperture-release-signers`, and
  `config/artifact-policy.json`
- all 30 immutable signed upstream payload files recorded by `BUILDINFO.json`:
  eight `evidence/*.json` files, 15 `fixtures/omp-direct/*.json` files, both
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
an authorized annotated `omarchy-aperture-v0.1.0` tag can be considered. The
release workflow verifies the signed tag and source commit, rebuilds the checks,
waits for approval in `omarchy-aperture-release`, publishes only the
deterministic archive and its SHA-256 checksum, and requires immutable GitHub releases.

The workflow creates no plugin-catalog submission. Catalog publication is
blocked pending an explicit readiness decision after stock-Omarchy acceptance;
do not imply readiness or combine that gate with a repository release. Stock
Omarchy also has no plugin pre-remove hook, so user documentation must preserve
the explicit OMP deactivation step before standard removal.

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

## Commits

Use narrow commits with concise imperative subjects. Do not include AI
co-author lines.
