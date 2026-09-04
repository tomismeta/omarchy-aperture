# Contributing

Thanks for improving Aperture for Omarchy.

## Start Here

This repository packages a self-contained, OMP-only Omarchy shell plugin. The
canonical attention engine and signed OMP integration are developed in
[`tomismeta/aperture`](https://github.com/tomismeta/aperture).

Before changing code:

```bash
node test/run.mjs
bin/omarchy-aperture-verify-payload --require-production
```

On stock Omarchy, also run:

```bash
omarchy plugin validate .
```

## Repository Boundaries

- `Service.qml` owns worker and protocol lifecycle.
- `WorkerModel.qml` and `WorkerOutputLogic.js` own accepted worker state.
- `Panel.qml` and `AttentionPeek.qml` own rendering and interaction.
- `WorkerBridgeLogic.js` serializes bounded control and opaque focus requests.
- `lib/aperture-attention-engine.cjs` and `integrations/omp/` are authenticated
  upstream artifacts and must not be edited downstream.

Keep judgment, ranking, continuity, deduplication, lane selection, receipts,
focus coordination, and typed OMP event mapping in the upstream Aperture
implementation. QML renders accepted snapshots; it does not recreate engine
policy or parse native harness payloads.

## Signed Payload Changes

Change the upstream Aperture repository, publish the next signed worker tag,
and then run:

```bash
node .github/scripts/vendor-aperture-worker-release.mjs aperture-worker-v<major>.<minor>.<patch>
```

The vendor command authenticates the release chain and replaces the payload
transactionally. Do not copy, rebuild, or patch worker or extension bytes by
hand.

## Change Requirements

- Keep **Focus OMP session** as the only panel action.
- Preserve canonical NOW, NEXT, and AMBIENT ordering.
- Fail closed for unsupported or ambiguous focus targets.
- Use Omarchy theme values; do not hardcode presentation colors.
- Preserve bounded queues, timers, retries, JSONL framing, and teardown.
- Do not ingest desktop notifications or infer attention from prose, process
  names, PIDs, or window titles.
- Do not add runtime installers, downloaders, package managers, or build hooks.

## Verification

Run `node test/run.mjs` for every change. Add focused coverage only for a new
observable contract or regression.

Behavioral changes must also be exercised in stock `/usr/share/omarchy/shell`.
Visual changes require keyboard and pointer checks plus relevant themes,
display scales, overflow, and multi-monitor layouts. Focus changes require the
supported Herdr 0.8.2, Foot 1.27, and tmux 3.7c paths before and after a hard
worker crash.

Never substitute a static preview, source inspection, or fixture-only result for
the changed stock surface.

## Commits

Use narrow commits with concise imperative subjects. Do not include AI
co-author lines.
