# Cross-Repository Coordination

## Binding decision

Aperture `0.1.0` for Omarchy is OMP-only and must run entirely through the stock Omarchy plugin framework.

No work may modify Omarchy or OMP source. The private notification-observer branch is no longer a dependency or acceptance environment. Native notifications are not Aperture input.

A bounded outbound OMP notification may remain only for definite pre-write direct failure. It is never re-ingested.

## Repository ownership

### `tomismeta/aperture`

Owns:

- canonical OMP attention-event and private worker-direct schemas
- OMP event mapping and extension
- direct socket client/server
- durable direct receipts and causal tombstones
- FocusHost and worker-generation replay
- FocusCoordinator and native backends
- signed worker/extension artifact
- tag-bound release workflows, attestations, and release report

### `tomismeta/omarchy-aperture`

Owns:

- stock-Omarchy manifest and QML
- worker launcher and offline payload verifier
- explicit OMP activate/deactivate commands
- exact vendored release payload and release report
- production eligibility policy
- stock-shell lifecycle, visual, keyboard, pointer, scale, theme, overflow, and multi-monitor proof

### Omarchy and OMP

Read-only for this product. Use public plugin/runtime contracts only.

## Rejected release containment

`aperture-worker-v0.5.2` at `022a4ce43728e144bf4a1315c64f2a051c141f31` is immutable rejected prerelease evidence.

Verified artifact facts remain historical evidence:

- archive: 223,876 bytes, SHA-256 `e87694a9c3dfde3c6b0b5aeb05496ffac6d2133a51192d3274365999c5008c1b`
- BUILDINFO: 16,481 bytes, SHA-256 `50fd2d81e1597ab39962d19cb7464e0302c530d9655c73da2edc1e044c333d5c`
- worker: 1,019,789 bytes, SHA-256 `9958267467ef5eab5d2d161aece97737195e1211c52da6754eba87505c7fd3ab`
- OMP extension: 83,892 bytes, SHA-256 `ea37ddf53a852c338d63f5c42e050d69d090715582d4eddd49b68fb6ddc1cb14`
- 39 declared payload files

It is not a candidate, production artifact, or rollback. The box runtime and OMP link were stopped after rejection.

## Current authenticated release

`aperture-worker-v0.7.2` at `33ef16381e6feaf6a88e6b29515566afe3d14284` is the authenticated production payload for the current OMP-only contract.

- Release Check: `33799590141`
- Worker Artifact: `33800125027`
- workflow-run dispatcher: `33800257801`
- Direct Release: `33800269578`
- Release Evidence: `33800684910`
- payload attestation: `45090127`
- BUILDINFO attestation: `45090585`
- archive attestation: `45090597`
- release-report attestation: `45091181`
- archive SHA-256: `98ff95e03b1050b8f1ff47121df3ba6409580cab1e2c0708685548e8524c18bc`
- BUILDINFO SHA-256: `7bc158a6f6d7c472ae508211b07077d2bda8742b48e2edea3bc2aabd145937ed`
- worker SHA-256: `dd17c23ef6cad749a67795a0e90558f84ba0785085f1fd96a1981bc7f983b946`
- OMP extension SHA-256: `ff6ce6cb6bbce84ab272fe5f1a6a0d6d456936e3e008cb6dfd02359c5d87fac4`
- exact source ref `refs/tags/aperture-worker-v0.7.2`

The immutable v0.7.0 tag produced no artifact or release after strict tag verification detected checkout tag shadowing. The immutable v0.7.1 tag produced successful Artifact and Direct runs but no release because the Evidence workflow was rejected during parsing. v0.6 is superseded historical evidence; v0.5.2 remains rejected. No failed-attempt tag is a candidate or rollback.

## Confirmed adversarial findings

The current source and signed release close each item with observable regression or strict workflow proof:

1. Read timeout must detach handlers and destroy the connection before later bytes can parse.
2. Post-write timeout/acknowledgement loss must retry the same durable receipt and never trigger native fallback.
3. Replay must coalesce pending generations latest-wins.
4. Shutdown must abort replay and prevent later event sends.
5. Resolution/session-shutdown tombstones must dominate delayed replay.
6. Known markers must match exact instance, address, class, backend, lease, and epoch.
7. Herdr must not clear a title without conditional expected-title/client support.
8. Final release attestations must bind to the signed tag ref and exact source digest.
9. The downstream verifier must authenticate all workflow IDs through an exact vendored attested release report.
10. Production launcher and OMP activation must reject non-production policy.
11. Mandatory documentation and policy facts must remain machine-checked for consistency.
12. Worker and public-surface hello frames must carry exact protocol versions independent of package SemVer.
13. Public surface schemas/types/projection must be incapable of carrying private navigation.
14. Worker-output source totals may exceed bounded visible source prefixes; downstream must display canonical totals.
15. Stock disable must leave no stale socket after a bounded signed cleanup path.
16. Newline-free worker output must not accumulate without a 256 KiB QML bound.
17. Worker and OMP extension text artifacts must each fit the 524,288-byte marketplace limit.
18. Public plugin and private OMP package versions must be `0.1.0`; immutable upstream package/tag history remains unchanged.

## OMP-only downstream cutover

The target downstream change:

- removes every `omarchy.notifications` lookup and signal connection
- removes notification projection and coalescing from `WorkerBridgeLogic.js`
- starts the worker from plugin readiness alone
- makes no-source OMP calm a valid state
- commits `manifest.json` as keep-loaded `Service.qml`
- removes obsolete `AttentionModel.qml`
- retains only bounded focus/control stdin
- requires production verifier mode from the launcher and activation command
- documents explicit deactivation before plugin removal
- requires exact worker-output protocol v4 rather than inferring compatibility from package SemVer
- consumes only private worker snapshots; upstream public surface v4 contains no navigation
- assembles ASCII JSONL from unbuffered chunks under a 256 KiB cap
- starts one shell-owned, engine-free signed cleanup process after immediate service destruction

The generic worker may retain notification-input capability as unused upstream functionality. The plugin does not connect or send that input.

## Herdr limitation

Herdr 0.8.2 has no conditional title clear. The replacement backend must retain its exact marker at release rather than clear a potentially different foreground client.

Consequences:

- no false compare-and-swap/title-restoration claim
- unrelated client title cannot be cleared
- a retained marker may remain until Herdr replaces the title
- exact marker scope and duplication remain fail-closed

A future Herdr conditional-clear API could improve cleanup without changing the plugin boundary.

## Release workflow

Required chain:

1. `Release Check` succeeds for the exact source commit.
2. GitHub immutable releases are enabled for the upstream repository.
3. An exact `aperture-worker-v<semver>` annotated tag, signed by the pinned key under the `git` namespace, triggers Worker Artifact to build and attest the atomic payload.
4. A minimal `workflow_run` dispatcher invokes Direct Release using `workflow_dispatch --ref <signed-tag>`.
5. Direct Release authenticates the tag, exact Worker Artifact workflow path, and Release Check; revalidates and attests every payload file, finalized BUILDINFO, and the archive; then completes without publication.
6. After Direct Release succeeds, a maintainer explicitly dispatches Release Evidence on the same signed tag with that completed run ID.
7. Release Evidence authenticates all completed prerequisites, independently verifies the packet, writes a schema-2 report without a self-conclusion claim, and attests it.
8. An `aperture-worker-release` environment-protected job publishes only the finalized packet and executes no checked-out repository code or dependencies.
9. Downstream `.github/scripts/vendor-aperture-worker-release.mjs` pins the `git`-namespaced authorized tag signer, authenticates all four successful run IDs and every exact URL-bound attestation bundle, confirms immutable releases, rejects unsafe archives, and transactionally installs the exact payload and production policy.

The report contains structured completed-workflow records for Release Check, Worker Artifact, and Direct Release. Its separate `finalization` identity has no conclusion because the evidence run cannot truthfully assert its own future result; downstream queries and records that result after completion.

## Downstream acceptance policy

Policy states:

- `rejected`: unusable in every verifier mode
- `dogfood`: explicit historical proof only
- `release-candidate`: allowed only with `--allow-candidate`
- `production`: requires `productionEligible: true`

The committed launcher and OMP activation always use `--require-production`.

Authenticated vendoring has written production policy after complete release-chain verification and installed the exact payload transactionally. Current stock proof remains the downstream publication gate; there is no later manual policy flip.

## Explicit lifecycle

Install/activate:

```bash
omarchy plugin add <repo> --enable
omarchy-aperture-omp activate
```

Deactivate/remove:

```bash
omarchy-aperture-omp deactivate
omarchy plugin remove aperture
```

There is no automatic pre-remove hook. Documentation must not imply otherwise.

## Stock acceptance

The previous payload's private stock record is historical proof only. It covered clean plugin add/remove, OMP lifecycle, observer-free service behavior, calm/attention, all focus backends, hard replay, keyboard/pointer, two themes, scale 1/2, bounded overflow, and one worker across two outputs.

The current `0.1.0` tree requires a new unversioned acceptance record after the replacement signed payload is vendored. It must additionally prove protocol-v4 mismatch handling, chunk overflow, focus-failure reopening, visible-details first install with a persistent privacy option, the stock-accepted compact human-and-arc mark, and bounded zero-socket disable cleanup. No Omarchy or OMP source modification is permitted. Marketplace acceptance remains separate.

## Open OMP session display label

OMP attention-event v2 exposes an opaque `sessionId`, not a display-safe session or agent name. The signed direct adapter therefore emits the generic source label `OMP`. The renderer formats that as lowercase `omp` and will format any future authoritative label as `omp - <name>`; it never derives a name from IDs, paths, process state, terminal titles, or private metadata.

Showing a real name requires an upstream Aperture change: add a bounded optional display label sourced directly from an authoritative OMP extension field, project it into worker `source.label`, cover privacy and bounds in Aperture tests, and ship it through a new signed worker release. No protocol field is invented downstream.

## Open ApertureCore ordering question

The renderer preserves the exact `view.now`, `view.next`, and `view.ambient` order accepted from the signed worker. It does not inspect timestamps, calculate wait duration, or reorder equal-priority items.

Upstream question: does ApertureCore guarantee starvation resistance when multiple frames remain equal under its canonical priority and consequence rules? If not, ApertureCore should own and test a stable tie-breaker—such as oldest lane-entry order—before emitting the snapshot. This is not a QML concern and must not be approximated locally.

## Non-goals

- native notification ingestion
- non-OMP harness identity inference
- Omarchy source changes
- OMP source changes
- automatic approval/input responses
- arbitrary metadata rendering
- shell/process/title heuristics
- runtime downloads or external Aperture installation
