# Contributing

## Development state

The plugin is under coordinated development with the Aperture repository. Read `HANDOFF.md` and `COORDINATION.md` before changing behavior.

## Contract changes

The Aperture repository owns two separate contracts: the public navigation-free surface protocol and the private worker-output protocol consumed by this plugin. Propose protocol needs in `COORDINATION.md`; do not create renderer-local aliases, undocumented fields, or a bridge between those surfaces.

## Plugin changes

Keep changes narrow and observable:

- one working QML path rather than placeholder components
- fixture-backed development only behind an explicit development path
- theme-native components
- no provider-specific branches
- no approval, input, or other engagement responses; `Focus OMP session` is the only action

## Validation

Use current Omarchy and Quickshell, then run:

```bash
omarchy plugin validate .
```

Visual changes require verification in the actual stock shell at more than one theme, scale, and monitor layout. Protocol parsing changes require fixture coverage for the exact versioned handshake, ASCII-only bounded JSONL framing, malformed input, incompatible package/capability, canonical connection order, and out-of-order sequence.

## Commit style

Use concise lowercase conventional commits, for example:

```text
feat: render snapshot attention surface
fix: distinguish missing source coverage from calm
```

Do not include AI co-author lines.
