# Omarchy Aperture Agent Instructions

After this file, read in order:

1. `HANDOFF.md`
2. `PROTOCOL.md`
3. `COORDINATION.md`
4. `PROTOCOL_BASELINE`
5. `README.md`

## Scope

This repository owns a self-contained Omarchy attention-and-focus plugin for typed OMP events. The installed plugin contains native QML, a small Bash launcher, a signed dependency-free CommonJS worker, and the signed OMP extension produced by the Aperture repository. Supported stock Omarchy supplies Node >=22.

V1 is OMP-only. It does not observe, ingest, rank, persist, or render desktop notifications. A bounded native OMP notification may remain only as a fail-open user alert when direct delivery was definitely not accepted; Aperture never reads that notification back.

## Hard rules

- Edit only `/Users/tom/dev/omarchy-aperture` unless the user explicitly assigns Aperture files.
- Never modify Omarchy or OMP source for this product. Stock plugin APIs are the platform boundary.
- Do not call Aperture private routes or read runtime registry/token files.
- Do not parse native harness payloads in QML.
- Do not implement judgment, ranking, dedupe, continuity, feedback interpretation, or lane changes in QML.
- Do not implement approval, input, or other engagement responses in V1.
- Do not render arbitrary metadata or executable notification actions.
- Do not inspect `omarchy.notifications`, `popupModel`, or D-Bus notification traffic.
- Do not infer typed attention from notification prose, processes, PIDs, or human window titles.
- Keep native fallback output outside the Aperture surface. Never emit fallback after an ambiguous post-write direct outcome.
- Keep `Service.qml` responsible for process/protocol state and `Panel.qml` responsible for rendering and interaction.
- Parse every JSON line defensively and reject unsupported protocol versions visibly.
- Treat missing payload, non-production payload, missing Node, incompatible Node, malformed protocol, worker failure, and calm as different states.
- Use bounded restart backoff, input queues, focus requests, direct clients, receipts, registrations, leases, replay, timers, and shutdown.
- Preserve complete snapshot ordering and stable frame-ID-plus-handle selection.
- Use `NOW`, `NEXT`, and `AMBIENT` and the clear text `Nothing needs you now`.
- Make `Focus OMP session` the only V1 action.
- Support focus only for explicit Herdr 0.8.2, direct Foot 1.27, and tmux 3.7c contracts. Every unsupported or ambiguous target is non-navigable.
- Never resume, attach, spawn a replacement terminal, interpolate a shell command, or send Core feedback from focus activation.
- Do not claim Herdr title cleanup is compare-and-swap. Herdr exposes no conditional clear; retain the owned marker rather than risk clearing another client.
- Do not persist private focus targets or recovery data.
- Do not accept or vendor locally built or manually copied worker/extension bytes.
- Never patch a released worker or extension downstream. Replace it through a new signed release.
- Production launch and OMP activation must require `artifactAcceptance: production` and `productionEligible: true`.
- Candidate proof requires an explicit non-production verifier path and must never be reachable from the committed production service.
- OMP registration is explicit. Users must run `~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp deactivate` before `omarchy plugin remove aperture`; stock Omarchy has no pre-remove hook.
- Never install, download, or update Node at runtime or invoke npm, pnpm, a downloader, or a build hook.
- Do not persist state inside the plugin checkout.
- Create runtime/state directories with mode `0700`, state files with `0600`, and the worker socket with `0600`.
- Do not hardcode mockup colors; use Omarchy `Color`, `Style`, and bar theme values.
- Do not claim marketplace readiness before signed-artifact, stock-Omarchy, lifecycle, theme, scale, pointer, overflow, and multi-monitor gates pass.

## Required signed artifact

The Aperture repository must produce one atomic payload containing:

- `lib/aperture-attention-engine.cjs`
- `integrations/omp/package.json`
- `integrations/omp/aperture-omp-extension.mjs`
- canonical schemas and OMP fixtures
- trusted validation evidence
- `BUILDINFO.json`

The worker may require Node built-ins only and must ship without `node_modules`, source maps, installers, downloaders, the generic Aperture HTTP runtime, registry discovery, bearer auth, CLI, or TUI.

Every accepted release must have:

- a valid annotated signed source tag
- a successful exact-commit Release Check
- a successful signed-tag Worker Artifact run
- a successful signed-tag Direct Release run
- tag-ref-bound payload, BUILDINFO, release-report, and archive attestations
- an attested `release-report.json` whose locally vendored bytes authenticate the complete workflow chain
- exact sorted file identities, byte counts, modes, and SHA-256 values

`aperture-worker-v0.7.3` at `b25e42b3724e7cf598b8e24d858f17c5b19a6fce` is the authenticated production payload for the current OMP-only stock-Omarchy contract. It is release-immutable, protocol-v4, carries private OMP package `0.1.0`, and keeps each marketplace-sensitive text artifact within 524,288 bytes.

`aperture-worker-v0.5.2` at `022a4ce43728e144bf4a1315c64f2a051c141f31` is rejected audit evidence. It is not a candidate, production artifact, or rollback.

## Target responsibilities

- `Service.qml`: own exactly one verified worker across monitors, bounded JSONL control, restart, and teardown; depend on no notification observer.
- `WorkerModel.qml`: own canonical worker protocol state and expose complete snapshots.
- `WorkerOutputLogic.js`: validate worker output and protocol ordering.
- `WorkerBridgeLogic.js`: serialize only bounded worker control and focus requests; contain no notification projection.
- `Panel.qml`: render OMP Now, Next, Ambient, calm/no-session/error states, and safe focus interaction only.
- `bin/aperture-attention-engine`: require a production-eligible payload, locate Omarchy's Node >=22, and `exec` the plugin-relative worker.
- `bin/omarchy-aperture-omp`: explicitly activate or deactivate the exact production-eligible OMP extension.
- `bin/omarchy-aperture-pre-remove`: stop the service and remove only provably owned OMP state.
- `lib/aperture-attention-engine.cjs`: own canonical judgment, continuity, bounded persistence, causal tombstones, focus coordination, and projection.
- `integrations/omp/aperture-omp-extension.mjs`: map allowlisted typed OMP events once, deliver them idempotently, and own no judgment or lane selection.

## Source references

Use current Omarchy `quattro` plugin sources without modifying them, especially:

- `shell/plugins/agents/manifest.json`
- `shell/plugins/agents/Panel.qml`
- `shell/plugins/agents/Main.qml`
- `shell/plugins/agents/Agent.qml`
- service-loading and bar-widget plugin contracts

Official docs:

- <https://omarchy.org/manual/shell-plugins/>
- <https://quickshell.org/docs/v0.3.0/types/Quickshell.Io/Process/>

## Validation

Before reporting implementation complete:

- run the complete upstream release gate
- verify the new annotated tag signature and exact source commit
- verify all release workflows and strict tag-ref attestations
- independently verify archive, BUILDINFO, release report, and every payload file
- run `node test/run.mjs`
- run `bin/omarchy-aperture-verify-payload --require-production`
- run `omarchy plugin validate .`
- drive the committed plugin on stock `/usr/share/omarchy/shell`, never the private observer checkout
- test missing payload, non-production payload, missing Node, incompatible Node, malformed JSON, protocol mismatch, calm, NOW, NEXT, AMBIENT, and restart
- test Herdr, direct Foot, and exact tmux focus before and after a hard worker crash
- test keyboard and pointer
- test explicit activation, deactivation, disable, re-enable, removal, reinstall, and rollback
- test at least two themes, relevant display scaling, overflow, and claimed multi-monitor behavior
- confirm disabling and explicit deactivation leave no worker, listener, socket, timer, or OMP registration
- confirm the final shell is owned by Hyprland's graphical-session cgroup
- confirm no Omarchy/OMP source modification or private observer checkout is involved

Do not substitute HTML screenshots, source inspection, fixture-only output, or a rejected release for actual stock-surface verification.
