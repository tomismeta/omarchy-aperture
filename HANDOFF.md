# Aperture for Omarchy Architecture Handoff

## Product boundary

Aperture `0.1.0` for Omarchy is an OMP-only attention-and-focus plugin. It consumes typed OMP events through the signed OMP extension and worker-owned Unix socket, applies canonical ApertureCore judgment in the bundled worker, renders complete Now/Next/Ambient snapshots, and focuses explicitly registered Herdr, direct Foot, or tmux sessions.

It does not observe or ingest desktop notifications, parse arbitrary harness payloads in QML, modify Omarchy or OMP source, respond to approvals/input, or require a separately installed Aperture runtime.

A bounded native notification may be emitted by the OMP extension only when direct delivery was definitely not accepted before write. It is a fail-open user alert outside Aperture and is never read back into the panel.

## Authority

- `AGENTS.md`: non-negotiable implementation rules
- `PROTOCOL.md`: normative runtime and wire contract
- `COORDINATION.md`: current cross-repository work and blockers
- `PROTOCOL_BASELINE`: machine-readable accepted facts
- `README.md`: product status and operator entry point

## Target flow

```text
typed OMP 18 lifecycle event
  -> signed integrations/omp/aperture-omp-extension.mjs
  -> canonical OMP attention-event + private focus control
  -> $XDG_RUNTIME_DIR/omarchy/aperture/attention.sock
  -> signed lib/aperture-attention-engine.cjs
  -> stateful ApertureCore
  -> complete private worker-output-v4 snapshot stream
  -> keep-loaded Service.qml / WorkerModel.qml
  -> Panel.qml on every monitor
```

The worker is the only direct-socket owner. The extension runs inside OMP and starts no sidecar. QML owns process transport and rendering, not semantics.

## Authenticated artifact

`aperture-worker-v0.7.2` at source commit `33ef16381e6feaf6a88e6b29515566afe3d14284` is the current authenticated production payload:

- exact-main Release Check `33799590141`
- signed-tag Worker Artifact `33800125027`
- successful workflow-run dispatcher `33800257801`
- signed-tag Direct Release `33800269578`
- signed-tag Release Evidence `33800684910`
- payload attestation `45090127`
- finalized BUILDINFO attestation `45090585`
- archive attestation `45090597`
- release-report attestation `45091181`
- strict source ref `refs/tags/aperture-worker-v0.7.2`
- 39 exact `0644` payload files plus `release/release-report.json`
- 517,433-byte worker and 49,625-byte OMP extension, each below 524,288 bytes

The GitHub release is immutable. Authenticated vendoring verified every recorded bundle and wrote the production policy only after the complete successful chain. `aperture-worker-v0.7.0` has no artifact or release after tag-checkout shadowing was detected. `aperture-worker-v0.7.1` has successful Artifact and Direct runs but no release because the Evidence workflow was rejected at parse time. Both remain immutable failed-attempt history. `aperture-worker-v0.6.0` is superseded historical evidence. `aperture-worker-v0.5.2` remains rejected evidence and is never a candidate or rollback.

## Direct delivery contract

Every typed event is mapped exactly once. The canonical event ID and timestamp are reused for retry and replay.

Delivery outcomes are divided into:

- **definitely not accepted**: failure before write; bounded native fail-open output is allowed
- **acceptance unknown**: write began but no durable acknowledgement arrived; retry the same event ID and never emit native fallback
- **accepted**: the worker has a durable receipt for the exact message identity
- **rejected**: the worker completed processing and returned a bounded explicit result

The worker retains a bounded receipt ledger. Duplicate delivery with the same request ID and exact canonical payload reuses the same pending or completed result; the same ID with different bytes is rejected.

Resolution and session-shutdown tombstones are bounded and persisted. A delayed replay at or before a newer resolution/shutdown cannot reopen work.

## Replay contract

Focus replay is single-flight and latest-wins:

- at most 64 cached active request events
- at most one replay operation
- while generation G1 runs, G2/G3 coalesce to G3
- close aborts the active socket request and discards queued generations
- no event after the already-written event may be sent after shutdown
- replay failure never becomes native fallback for the same event

## Focus contract

QML sees only:

```json
{"kind":"opaque-focus","handle":"<32 characters>"}
```

and sends only:

```json
{"type":"focus.activate","requestId":"<bounded>","handle":"<same handle>"}
```

The worker returns `focused`, `stale`, or `missing`.

Supported backends:

| Backend | Private target | Admission boundary |
| --- | --- | --- |
| Herdr 0.8.2 | owned socket, opaque pane ID, Hyprland instance | exact marker surface and one supported UI context |
| direct Foot 1.27 | one marker, address, class, Hyprland instance | unique exact Foot/footclient surface |
| tmux 3.7c | owned socket, session, pane, client, Hyprland instance | exactly one attached non-nested client |

Known marker ownership includes backend, lease key, epoch, instance, address, class, marker, and title. A duplicate title on another instance/address/class is unknown and rejected.

Herdr exposes no conditional title clear tied to an expected title/client. Cleanup therefore retains the exact marker rather than risk clearing another foreground client. Do not describe Herdr cleanup as compare-and-swap or title restoration. tmux retains compare-and-restore semantics for its owned options.

Focus never resumes, attaches, starts a terminal, interpolates a shell, responds to OMP, or sends Core feedback.

## Plugin service

The committed manifest target is:

- kinds `service` and `bar-widget`
- activation `keep-loaded`
- service `Service.qml`
- bar widget `Panel.qml`

`Service.qml` starts from plugin readiness only. It has no dependency on `omarchy.notifications` or any private Omarchy checkout.

It owns:

- exactly one production-verified engine worker
- bounded ASCII JSONL output assembled from unbuffered stream chunks
- bounded control input and a 16-entry focus-request ledger
- generation fencing and stable-uptime restart backoff
- graceful shutdown followed by bounded TERM/KILL escalation
- one shell-owned, engine-free cleanup process on disable/destruction
- lifecycle IPC used by explicit deactivation

`WorkerModel.qml` validates the exact worker-output-v4 hello, engine state, complete private snapshots, errors, focus results, and monotonic sequence. Package SemVer never substitutes for the wire version.

`Panel.qml` tracks keyboard selection by frame ID plus opaque handle. Reorder preserves identity; removal or handle rotation clears selection. `Focus OMP session` is the only action.

Presentation preserves snapshot order exactly. New installs default persistent `privacyMode` to hidden; that setting is authoritative for automatic peeks. `panelPrivacyOverride` exists only while the interactive panel is open and resets on close. A temporary reveal can never weaken a later passive peek. Frame identity, selection, ordering, and opaque focus handles are untouched.

Source metadata renders as lowercase `omp` or `omp - <name>` when worker `source.label` contains an authoritative display label. The current signed direct adapter hardcodes `OMP`; actual session naming therefore requires the upstream contract and signed-release work recorded in `COORDINATION.md`.

The default layout is deliberately compact: a 400-style-space reference width, a 520-style-space height cap, matching inline NEXT/AMBIENT summaries with no separator, two-line populated NEXT rows, and one-line collapsed AMBIENT.

`SUPER + A` routes through stock `shell toggle` to the focused monitor. A new NOW frame identity may open a passive `PopupWindow` for eight seconds. Versions refresh its content without restarting the reveal timer. A 30-second cooldown suppresses new-frame storms, and restoration of the same identity stays silent. NEXT never reveals it.

The peek has no input region for 450 ms. After that guard, an intentional pointer or accessibility press opens the interactive panel; it still never requests keyboard focus. Its accessibility role changes from passive static text to an Open Aperture button only when interaction arms. Non-navigable snapshots retain `P privacy · Esc` without advertising Enter.

The approved mark is one near-complete open aperture around a human silhouette, with a lower-right break that distinguishes it from notification/profile icons. Pressure consumes canonical NOW/NEXT totals, excludes AMBIENT, retains urgent for operational errors, and overlays no badge. Queued-only states stay in the subordinate half of the opaque contrast ramp; NOW alone receives the endpoint/active treatment.

`fixtures/development/Panel.qml` uses `WorkerModel.qml` and valid worker-output fixtures for real-shell screenshots. Production `Panel.qml` contains no demo data source, replacement IPC, filesystem discovery, or development switch.

The obsolete downstream `AttentionModel.qml`/external-runtime bridge is removed in the OMP-only cutover. The separate upstream public `aperture surface --stdio` API remains a distinct non-Omarchy surface and cannot carry private focus navigation.

## Omabot comparison

The Omabot watcher was reviewed end to end. Its defensive reads, bounded text, change-signature deduplication, atomic cache writes, stale-cache cleanup, and broken-pipe exit are sound patterns. Aperture already has stronger typed equivalents: direct schema-validated events, bounded durable receipts/state, snapshot-fingerprint deduplication, atomic persistence, restart supervision, and explicit shutdown.

No Omabot backend code is copied. Filesystem session scraping, mtime polling, inferred working/waiting state, avatar caching, and a monolithic watcher/parser/view would weaken Aperture's typed protocol and module boundaries. The adopted ideas are therefore presentation-only: hierarchy, compact rows, privacy, shortcut discovery, concise totals, constrained display settings, and fixture-driven real-shell preview capture.

## Production eligibility

The verifier has two explicit modes:

```text
--require-production
--allow-candidate
```

The committed launcher and OMP activation command always use `--require-production`. Candidate proof must be explicit and cannot be reached through the production service.

Production requires both:

```json
{"artifactAcceptance":"production","productionEligible":true}
```

Rejected, dogfood, or release-candidate policy cannot start the committed worker or activate OMP.

## Installation and removal

Activation is explicit consent. Until the public HTTPS repository exists, public `omarchy plugin add` instructions remain withheld. After installing and enabling a verified checkout:

```bash
omarchy-aperture-omp activate
```

Stock Omarchy has no plugin pre-remove hook. Supported removal is explicitly two-step:

```bash
omarchy-aperture-omp deactivate
omarchy plugin remove aperture
```

Deactivation must stop the service and leave zero engine/cleanup workers, listeners, sockets, timers, focus requests, OMP links, and Aperture lock/settings entries before checkout deletion.

A rejected checkout may remove provably owned OMP link/lock state only when the canonical runtime socket and lifecycle lock are already absent. If either resource exists, removal fails closed and preserves registration; restore a trusted production checkout and run deactivation so only verified cleanup code touches the endpoint.

## Signed release acceptance

A production payload must provide:

- exact `aperture-worker-v<semver>` annotated source tag signed by the downstream-pinned key under the `git` signer namespace
- successful exact-commit Release Check
- successful signed-tag Worker Artifact run
- successful signed-tag Direct Release `workflow_dispatch` run
- successful signed-tag Release Evidence `workflow_dispatch` run
- GitHub immutable releases enabled before publication
- strict tag-ref and source-digest verification for every payload file, BUILDINFO, archive, and release-report attestation, with each recorded attestation URL bound to the exact verified bundle
- schema-2 `release-report.json` that records conclusions only for already-completed prerequisite runs and identifies its finalizer without asserting its own conclusion
- exact sorted unique payload manifest with mode `0644`
- Node 22/24/current and OMP 18.0.11/18.1.2 evidence
- complete focus, replay, causal ordering, cap, cancellation, and shutdown tests

The `workflow_run` dispatcher observes a successful exact-tag Worker Artifact and invokes Direct Release with `workflow_dispatch --ref <signed-tag>`. Direct Release prepares and attests the packet without publishing. After that run has completed successfully, a maintainer explicitly dispatches Release Evidence on the same signed tag with the immutable Direct Release run ID. Release Evidence revalidates the completed chain, attests the report, and hands a complete packet to the environment-protected publisher. Downstream accepts it only through `.github/scripts/vendor-aperture-worker-release.mjs`, after confirming GitHub immutable releases and every exact attestation reference.

## Stock Omarchy acceptance

Final proof must run the committed plugin against `/usr/share/omarchy/shell` with no source modifications or private observer checkout.

Required scenarios:

- production verifier and launcher
- explicit OMP activate/deactivate
- calm and typed OMP NOW/NEXT/AMBIENT
- Herdr, direct Foot, and exact tmux focus
- keyboard and pointer
- hard worker crash, latest-generation replay, causal resolution, and post-replay focus
- disable/re-enable and zero-resource teardown
- two themes, relevant scale, overflow, and claimed multi-monitor behavior
- clean remove and reinstall from the exact production commit

The authenticated release gate has passed. These scenarios remain the publication gate until they are rerun against the current `0.1.0` plugin on stock Omarchy. Marketplace acceptance remains separate.
