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

For updates, follow the [settings-preserving sequence](#update): perform the stock
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

## Operator Reference

The [README](./README.md) covers first-run setup and everyday use. The following
sections document compatibility, safe maintenance, and support diagnostics.

### Supported focus

Focus is deliberately fail-closed:

| Backend | Supported target | Refused boundary |
| --- | --- | --- |
| Herdr 0.8.2 | Interactive OMP, one attached Herdr UI client, opaque pane ID, exact marked Foot surface | Missing or unsafe socket/pane, duplicate or lost marker, multiple UI clients |
| Foot 1.27 | Interactive OMP directly in Foot, exact one-shot terminal probe | Unknown class, missing or duplicate marker, ambiguous surface |
| tmux 3.7c | Interactive OMP pane, owned socket and pane, exactly one attached client | Detached, multiple, or nested clients; unsafe socket; missing pane; ambiguous surface |

Kitty, WezTerm, Zellij, Ghostty, Alacritty, GNU Screen/`STY`, generic xterm,
RPC/headless sessions, and unknown contexts are non-navigable. Aperture never
resumes or attaches a session, spawns a replacement terminal, interpolates a
shell command, responds to OMP, or sends ApertureCore feedback from focus.
Private focus targets are volatile and are never persisted or rendered.

### Delivery and failure states

Missing or invalid payload, failed provenance, missing or incompatible Node,
malformed protocol, worker failure, no connected session, and calm remain
distinct states. Configuration failures latch; unexpected worker crashes and
temporary contention with a still-exiting OMP socket owner use bounded restart
backoff. Unsafe socket paths, ownership, permissions, or identity failures
latch without automatic retry. The worker must report ready before Aperture
presents calm/attention or accepts focus input.

The direct OMP-to-worker path is bounded and acknowledged. Native fallback is
allowed only after a definite failure before any direct bytes were written.
Ambiguous and post-write outcomes never emit fallback. The fallback is
token-bounded, runs outside Aperture, and is not covered by panel privacy.
Privacy presentation never changes frame identity, ordering, or focus identity.

### Update

Update from an unlocked graphical session, then request graceful worker
shutdown. Stop if either command fails:

```bash
omarchy plugin update aperture &&
  omarchy-shell aperture.worker shutdown
```

Check `omarchy-shell aperture.worker status` until `activeProcessCount` and
`processReferenceCount` are both `0`. Then load the updated QML/JavaScript with
the stock shell restart and re-activate:

```bash
omarchy-restart-shell &&
  ~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp activate
```

The explicit restart is an operational precaution, not evidence that stock
reload is broken. Do not replace it with a custom kill command. This sequence
preserves OMP registration, bar placement, and privacy settings; deactivation
is unnecessary for an update.

Stock update is fast-forward-only and rolls back when the updated checkout
fails plugin validation. If shutdown does not complete or another step fails,
inspect both lifecycle statuses below and resolve the error before continuing.

**Restart already-open OMP sessions afterward.** Updating the package link and
registration does not replace their loaded extension.

### Restart or repair

The worker restarts automatically after an unexpected crash. To request an
immediate worker restart without changing OMP registration:

```bash
omarchy-shell aperture.worker restart
```

Inspect the two independent lifecycle states before repairing:

```bash
omarchy-shell aperture.worker status
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp status
```

The first reports worker status, errors, process counts, and shutdown state;
the second reports OMP package registration (`[]` means absent). Registration
does not prove an already-open OMP session has loaded the extension. When the
shell plugin is disabled its worker IPC is absent; activation re-enables it.

For an installation or integration failure, verify the checkout, re-activate
OMP, and restart open OMP sessions:

```bash
omarchy plugin validate ~/.config/omarchy/plugins/aperture
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-verify-payload --require-production
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp activate
```

If Node is missing or damaged, repair stock Omarchy rather than installing a
private runtime for Aperture. The stock `omarchy reinstall` recovery resets
Omarchy packages and configuration, so back up your configuration first.

### Deactivate and remove

Stock Omarchy has no plugin pre-remove hook. **Deactivation must succeed before
removal**; stop if the first command fails:

```bash
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp deactivate &&
  omarchy plugin remove aperture
```

Deactivation verifies worker shutdown and owned socket cleanup, removes the
owned OMP package link and registration/settings, disables Aperture through
stock Omarchy, and clears owned worker state. Disabling persists across shell
reloads and removes the bar widget. Deactivation also works if Aperture was
already disabled, provided the shell registry and owned paths can be verified.

Deactivation can fail **after OMP registration has already been removed**, for
example if final worker-state cleanup cannot prove ownership. Keep the checkout
in place: a failure does not mean all earlier changes were rolled back. Use the
two status commands above to distinguish registration state from worker state;
missing worker IPC is expected when the shell plugin is disabled. Resolve the
reported error without force-deleting unverified paths, then rerun `deactivate`.
Only proceed with removal after that command succeeds; reactivation is not a
prerequisite for retrying cleanup.

**Restart already-open OMP sessions after deactivation.** Removing registration
does not unload their in-memory extension, timers, or native notification
fallback. The shutdown proof covers the Aperture worker, not those OMP processes.

Running `activate` again re-enables the shell plugin. Stock disable/re-enable
resets its widget entry: reapply custom placement and privacy settings before
resuming attention delivery.

Removing Aperture directly through the stock CLI/menu skips this cleanup and
can leave a dangling OMP registration. The two-step workflow does not establish
that standard removal is safe.

### Reinstall and roll back

For a clean reinstall, deactivate before stock removal, then add the Git
checkout again:

```bash
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp deactivate &&
  omarchy plugin remove aperture &&
  omarchy plugin add https://github.com/tomismeta/omarchy-aperture.git --enable &&
  ~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp activate
```

Restart open OMP sessions afterward. There is no stock per-plugin rollback
command after a successful update. A failed plugin update rolls itself back;
for a larger Omarchy update, restart and select the pre-update system snapshot
from the boot menu.

### Reporting an issue

Run these commands in the affected graphical session and include their output,
including any failure, with reproduction steps, expected behavior, and actual
behavior:

```bash
plugin="$HOME/.config/omarchy/plugins/aperture"
jq '{id, version}' "$plugin/manifest.json"
git -C "$plugin" rev-parse HEAD
git -C "$plugin" status --short
jq . "$plugin/config/artifact-policy.json"
omarchy-shell aperture.worker status
"$plugin/bin/omarchy-aperture-omp" status
omarchy-version
pacman -Q quickshell
node --version
omp --version
```

Include both statuses even when one fails. Missing worker IPC is expected for a
disabled plugin; registration alone does not prove a session loaded the extension.
`omarchy-version` is the stock version command; `pacman -Q quickshell` reports
the installed package version without relying on a Quickshell version flag.

Say whether you restarted the shell and existing OMP sessions after an update.
For focus issues, include the terminal/multiplexer and its version. For visual
or accessibility issues, include theme, scale, monitor arrangement, and
assistive technology/version. Redact private paths, session text, and other
sensitive details from output and screenshots; retain release identity and errors.

### Release identity

Identify a Git installation by package version, Git commit, and
`config/artifact-policy.json`, not package version alone. Git updates can change
the checkout between immutable releases.

The immutable `omarchy-aperture-v0.1.0` archive contains worker `v0.8.7` and
plugin package `0.1.0`; later Git-main fixes also used `0.1.0`. That historical
archive and tag remain unchanged. Release `omarchy-aperture-v0.1.1` pairs plugin
package `0.1.1` with authenticated worker `v0.8.9`; its archive must match the
tagged source and signed payload.

### Integration readiness

**Aperture is not yet ready for the Omarchy plugin catalog.** Installing the
plugin does not patch Omarchy or Quickshell.

- **Safe removal:** an Omarchy PR is needed for a pre-remove lifecycle hook
  whose failure prevents removal. Catalog readiness requires that support to
  ship and pass end-to-end removal checks. Manual deactivation does not clear
  this blocker; the required removal-hook PR is not claimed to have landed.
- **Screen readers:** Quickshell 0.3.1 does not expose its managed windows through
  AT-SPI, so screen readers cannot discover Aperture controls. The
  [upstream fix exists](https://github.com/quickshell-mirror/quickshell/issues/1006);
  a duplicate fix PR is not needed. Stock Omarchy must ship a build containing
  it, followed by fresh Orca checks for discovery, announcements, privacy, and
  actions. Keyboard and pointer interaction are verified; screen-reader
  interaction is not.
