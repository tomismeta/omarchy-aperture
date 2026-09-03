# Aperture for Omarchy Worker Protocol

## Authority and scope

The Aperture repository owns the canonical schemas and signed worker/OMP artifacts. This repository vendors exact release bytes and implements only stock-Omarchy process transport and rendering.

The current plugin is OMP-only and accepts typed OMP events. Native notifications are never Aperture input. QML never parses OMP payloads or private focus-control messages.

`aperture-worker-v0.7.3` at `b25e42b3724e7cf598b8e24d858f17c5b19a6fce` is the authenticated production payload. Its immutable release and attestations bind the private worker-output-v4, public surface-v4, bounded socket cleanup, 524,288-byte text-artifact cap, and private OMP package `0.1.0` to `refs/tags/aperture-worker-v0.7.3`. v0.7.2 is superseded because its direct-Foot marker could be overwritten by OMP's later title generation; v0.7.3 claims the title only for actionable attention. v0.7.0 and v0.7.1 are immutable failed-attempt history without releases; v0.6 is superseded history and v0.5.2 remains rejected. None is a rollback target.

## Runtime topology

```text
OMP extension
  -> private worker-direct Unix socket
  -> canonical worker and ApertureCore
  -> complete JSONL snapshots on stdout
  -> Service.qml / WorkerModel.qml
  -> Panel.qml
```

Paths and modes:

- socket: `$XDG_RUNTIME_DIR/omarchy/aperture/attention.sock`
- runtime directory: `0700`
- socket: `0600`
- worker state: `$XDG_STATE_HOME/omarchy/aperture/`
- state directory: `0700`
- state files: `0600`

The engine worker alone creates, replaces, listens on, and normally removes the socket. The extension starts no sidecar. The launcher uses Node >=22 from the graphical-session PATH or standard mise shim and ends with `exec`. On disable or service destruction, one engine-free cleanup process is created under the long-lived stock shell. Its signed `--cleanup-owned-socket` mode is deadline-bounded, accepts only the canonical XDG path, refuses live/unsafe/replaced endpoints, rechecks device/inode before unlink, and then exits.

Launcher failures are closed and distinct: malformed or tampered provenance exits `65`, an incomplete payload exits `66`, missing Node exits `69`, a valid but non-production policy exits `77`, and an installed but incompatible Node exits `78`. `Service.qml` latches each into a stable machine-readable error code instead of restarting; malformed worker JSON, unsupported protocol, unexpected worker exit, and a valid calm snapshot remain separate states.

## OMP event boundary

Canonical attention events use the package-owned OMP attention-event schema. They contain bounded display facts and opaque identities only:

- event ID and timestamp
- session/turn/interaction identity
- classification and transition
- bounded title/summary/status
- optional opaque focus handle

They exclude prompts, raw tool output, approval reasons, credentials, response specifications, private paths, arbitrary metadata, commands, and private native target data.

Each OMP event is mapped exactly once. Retry and replay retain the same canonical event ID and timestamp.

## Direct delivery outcomes

A direct operation has one of four meanings:

1. `definitely-not-accepted`: connection failed before write; native fail-open output is allowed.
2. `acceptance-unknown`: write began but no durable result arrived; retry the same event ID and never emit native fallback.
3. `accepted`: the worker durably processed the exact canonical message.
4. `rejected`: processing completed with a bounded explicit rejection.

Connection read timeout is terminal: stop reading, detach handlers, write at most one rejection, and destroy the socket. Bytes arriving afterward cannot parse or mutate state.

The client response timeout exceeds the ordinary worker processing bound. Ambiguous post-write outcomes retry the same event ID up to the declared cap. A native notification is permitted only for a definite pre-write failure and is never ingested by Aperture.

## Durable receipts

The worker maintains a bounded in-memory receipt ledger:

- key: direct event ID
- identity: exact canonical event serialization
- value: one pending or settled acknowledgement
- duplicate exact message: share/reuse the receipt
- duplicate ID with different message: reject `request_identity_conflict`
- cap: declared in `BUILDINFO.json`
- when full: evict settled oldest entries; never evict a pending receipt to admit more work

A processing deadline aborts the handler but does not report non-commit until that handler settles. If the handler completes after cancellation, its durable result remains accepted. Snapshot-output failure after durable engine mutation does not convert the committed event into a rejection.

## Causal state

Direct state persists active revisions plus bounded tombstones under schema v3.

Tombstones:

- interaction resolution keyed by canonical interaction key
- session shutdown keyed by OMP session ID

Rules:

- resolution is recorded even if its request has not arrived
- session shutdown is recorded even if no session entries are active
- a request at or before its interaction-resolution tombstone is ignored
- an event at or before its session-shutdown tombstone is ignored
- an older replay cannot replace a newer active revision
- navigation remains volatile and is absent after state restoration until live focus registration

State migration accepts prior direct-state schemas v1 and v2 and rewrites them atomically to v3 without persisted private navigation.

## Worker-generation replay

The OMP host caches at most 64 sanitized active approval/input requests. Resolution removes the matching cached request; session shutdown removes every cached request for that session.

Replay is:

- single-flight
- latest-generation-wins
- one direct request at a time
- bounded to 64 events
- cancellable with `AbortSignal`
- independent of new event mapping

If G1 is active while G2 and G3 arrive, replay sends G1 then G3. G2 is safely coalesced. Shutdown aborts the active request and discards pending generations; no later event may be sent.

Persisted tombstones remain the final defense against replay/live network reordering.

## Focus control

Private focus targets and registration records are backend-neutral and never enter worker output or QML. The exact private worker-output snapshot may expose only this opaque capability:

```json
{"kind":"opaque-focus","handle":"<32 base64url characters>"}
```

QML sends only:

```json
{"type":"focus.activate","requestId":"<bounded visible ID>","handle":"<same handle>"}
```

Results are exactly:

```text
focused
stale
missing
```

Supported backends:

| Backend | Authoritative private identity |
| --- | --- |
| Herdr 0.8.2 | owned socket, pane ID, Hyprland instance, exact marked Foot surface |
| direct Foot 1.27 | marker, Hyprland instance, exact address and Foot/footclient class |
| tmux 3.7c | owned socket, session, pane, sole client, Hyprland instance, exact marked surface |

Known surface ownership is a record of backend, lease key, epoch, instance, address, class, marker, and marker title. Matching a title string alone never establishes ownership. Duplicate observations of a known marker are rejected.

The coordinator caps direct clients, receipts, queued operations, registrations, lease members, replay events, pending QML requests, cancellation fences, and shutdown duration. Replay and shared QML focus admission are each single-flight: a second panel cannot start focus while another panel's request is pending.

Activation validates the lease, focuses the inner Herdr/tmux pane, focuses and confirms the exact outer Foot address, then reconfirms the inner target.

## Herdr title limitation

Herdr 0.8.2 exposes `client.window_title.clear` with empty parameters. It cannot condition the clear on expected title or client identity.

The backend therefore does not call clear during release or failed acquisition. It validates the exact surface and retains the marker. This may leave a marker until Herdr itself replaces the window title, but it cannot clear a different foreground client's title. Documentation and evidence must not claim compare-and-swap or automatic title restoration for Herdr.

tmux cleanup remains compare-and-restore against its exact owned options and title.

## Worker output

Notification-worker output v4 is the private Omarchy JSONL contract. Its exact hello includes `protocolVersion: 4`; package SemVer is separate provenance and never negotiates the wire. Output contains:

- exact hello/capabilities
- ordered engine state
- complete bounded private snapshots
- optional opaque navigation capability
- bounded errors
- focus activation results

Every line is ASCII JSON (non-ASCII content is JSON-escaped) and at most 256 KiB including newline. `Service.qml` uses an unbuffered stock `SplitParser`, assembles lines itself, and tears down as soon as its bounded partial buffer would overflow. Snapshots are atomic, never patches; sequence is monotonic. QML rejects malformed/unterminated framing, non-ASCII wire bytes, unsupported protocol/capabilities, unknown fields, out-of-order sequence, invalid totals, and oversized lines.

The public Aperture stdio surface v4 is a separate exact contract. Its hello also carries `protocolVersion: 4`, but its schema/types/projection cannot contain `navigation`; non-engagement surfaces never receive focus capabilities.

## QML ownership

`Service.qml` owns one worker, bounded stdin/stdout, restart, and teardown. It depends only on stock plugin injection (`shell`, `manifest`, and `pluginRegistry`) and never looks up `omarchy.notifications`.

`WorkerModel.qml` owns accepted protocol state.

`Panel.qml` owns rendering and safe interaction. Selection identity is `(frame.id, navigation.handle)`, never array index. Reorder cannot retarget; removal or handle rotation clears selection. The only action is `Focus OMP session`.

The renderer consumes `view.now`, `view.next`, and `view.ambient` in their accepted order. It does not sort, rank, deduplicate, infer elapsed time, or change lanes. Header counts—including source coverage—come from accepted `totals`; visible source/frame arrays may be bounded prefixes, and clipped frame arrays are labeled explicitly.

Privacy is a local presentation transform and defaults to visible on new installs. Persistent `privacyMode` is authoritative for automatic surfaces. An interactive `panelPrivacyOverride` may invert it only while the panel is open and resets on close. Neither scope can mutate a frame, position, selection identity, or navigation handle.

Source metadata is formatted as `omp` or `omp - <name>`. OMP attention-event v2 contains only an opaque session ID and the signed direct adapter currently emits `OMP`, so no real session name is available downstream. QML must not derive one from IDs, paths, processes, titles, or private metadata.

Default presentation is bounded to a 400-style-space reference width and a 520-style-space height cap. NEXT and AMBIENT use matching inline label/count summaries with no separator between them. Populated NEXT renders metadata plus a single elided title-summary line; collapsed AMBIENT renders one line. Expansion may scroll but cannot change the accepted arrays.

Auto-reveal is bounded presentation state, not attention judgment. One new accepted NOW frame identity may begin an eight-second reveal on the focused monitor. Later versions refresh bound content without restarting that timer. A 30-second cooldown suppresses different NOW identities; identities observed during cooldown are not queued. Worker restoration of the same identity remains silent. NEXT/AMBIENT-only snapshots never reveal.

The passive peek requests no keyboard focus. Its input region remains empty for 450 ms, preventing an already-positioned pointer from losing an immediate click. Once armed, an intentional pointer or accessibility press closes the peek and opens only the existing interactive panel; its accessibility role changes from static text to a button only for that armed phase.

Pressure consumes only accepted `totals.now` and `totals.next`; AMBIENT is excluded. All mark colors are opaque. The contrast ramp distinguishes one queued item, two or three queued items, four or more queued items, and NOW. Operational errors retain urgent, and geometry, lanes, and item order never change.

## Manifest and production gate

The committed target manifest is keep-loaded and points to `Service.qml` plus `Panel.qml`.

The launcher and OMP activation invoke:

```text
omarchy-aperture-verify-payload --require-production
```

Production requires:

```json
{"artifactAcceptance":"production","productionEligible":true}
```

`--allow-candidate` exists only for explicit audit/proof commands. It is not used by the committed service or activation path. Rejected payloads fail both modes.

## Explicit lifecycle

Install/activate is explicitly two-step. Public install syntax remains withheld until an exact public HTTPS repository URL exists. After installing and enabling a verified checkout:

```bash
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp activate
```

Deactivate and remove:

```bash
~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp deactivate
omarchy plugin remove aperture
```

There is no Omarchy source change or pre-remove hook. Deactivation must precede checkout deletion and prove zero engine/cleanup workers, listeners, sockets, timers, queued input/focus requests, OMP links, and owned lock/settings entries.

A rejected checkout may remove provably owned OMP registration only when the canonical runtime socket and lifecycle lock are absent. If either exists, it preserves registration and fails closed; a trusted production checkout must be restored before bounded socket cleanup.

## Release trust

Release publication uses four authenticated runs:

1. exact-commit `Release Check` on main
2. signed-tag `Aperture Worker Artifact`
3. signed-tag `Aperture Worker Direct Release`, dispatched only after successful artifact completion
4. signed-tag `Aperture Worker Release Evidence`, dispatched only after Direct Release has completed successfully

Direct Release authenticates the exact SemVer worker tag and prerequisite runs, revalidates the payload, and creates tag-bound attestations without publishing. Release Evidence independently verifies the completed chain, archive, BUILDINFO, and every declared file; then it writes and attests schema-2 `release-report.json`. The report records conclusions only for already-completed prerequisite workflows. Its `finalization` record identifies the evidence run but deliberately has no self-conclusion.

GitHub immutable releases must be enabled before publication. The only `contents: write` job downloads the finalized packet without checking out or executing repository dependencies. The `aperture-worker-release` environment gates its draft-to-public transition. Downstream vendoring uses `.github/scripts/vendor-aperture-worker-release.mjs` to authenticate the `git`-namespaced pinned tag signer, all four successful run IDs, each exact tag-ref/digest/signer attestation bundle named by its recorded URL, safe archive membership, and every file identity before replacing payload bytes or writing production policy. The offline verifier then checks that exact vendored policy, BUILDINFO, report, and file tree.

## Production evidence

The committed plugin and production policy must pass:

- clean stock `omarchy plugin add`, activation, explicit deactivation, removal, and reinstall
- observer-free startup on `/usr/share/omarchy/shell`
- calm, native-notification non-ingestion, and causal resolution
- Herdr, direct Foot, and exact tmux focus plus worker-crash replay
- keyboard, pointer, dark/light themes, bounded overflow, scale 1/2, and two-output one-worker ownership
- zero-resource disable and deactivation

The authenticated signed-release gates have passed. Stock lifecycle, focus, visual, input, scale, overflow, and multi-monitor proof remains pending for the current plugin before publication.

The generic Omarchy notification observer, non-OMP identity corpus, and Omarchy source changes are not part of this product. Marketplace publication is not implied by production eligibility.
