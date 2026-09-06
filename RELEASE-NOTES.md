# Aperture for Omarchy 0.1.2

**Prepared release candidate—not a published plugin release.** Final native
acceptance and release authorization remain separate from this document.

This candidate pairs plugin **0.1.2** with the already authenticated signed
worker **v0.8.12**. Candidate preparation does not bump the worker or OMP
integration and does not modify signed payload bytes. Stock OMP 18+ and Node
22+ remain required.

Historical release `omarchy-aperture-v0.1.1` remains plugin **0.1.1** with worker
**v0.8.9**; its tag and archive are unchanged.

## Changes since 0.1.1

### Signed worker fixes

The worker updates since v0.8.9, included through v0.8.12, address:

- **Shared-focus isolation:** a Herdr pane's registration failure no longer
  revokes other panes while their shared socket and exact marked surface remain
  valid. Unsupported or ambiguous targets still fail closed.
- **Resumed attention and heartbeat repair:** resuming the same OMP conversation
  accepts genuinely newer attention without clearing worker state. Regular
  heartbeats continue during sustained session activity instead of being
  postponed. Earlier closed work remains fenced against delayed replay.
- **Agent-run completion identity:** completions include the originating agent
  run, so OMP's reuse of numeric turn numbers across runs does not conflate
  separate completions. Conversation identity is unchanged.

### Session-first overview and notifications

- **Compact A4 overview:** NOW puts the session name above a concise status;
  NEXT uses compact single-line rows. Quiet AMBIENT context remains available,
  and empty lanes are omitted.
- **Exact-session navigation:** Open Session appears on a hovered or
  keyboard-selected overview row without shifting its text. Row click and
  Enter open the originating OMP pane, never a guessed replacement target.
- **Notification deck:** each session has its own card with the full available
  event title and summary. Hover pauses expiry and reveals Open Session for
  that card's exact pane. Opening a session removes only its card.
- **Stable held actions:** arrivals append below the cards being read. When the
  viewport cannot grow without moving held actions, scroll to reach the new
  cards; the deck does not auto-scroll away from the current action. Long
  bodies also scroll. Notifications do not take keyboard focus or auto-open
  the overview.
- **Details and privacy:** D is the only way to open Details. Arrow keys browse
  and scroll; D or Esc returns to the overview. P hides or reveals rendered
  details with no visible privacy control. Start with details hidden remains
  available in settings. Supplied attention text is event metadata, not the
  assistant's full response.
- **Shortcut display setting:** Open Aperture shortcut (display only)
  (`openShortcut`) changes the notification and bar-tooltip hint. Its default
  is Super + A. It does not install or change a Hyprland binding.

The [README](./README.md) presents the compact overview, notification deck,
Details, and privacy screenshot suite. Screenshots illustrate presentation;
they do not establish native acceptance across supported configurations.

## Updating safely

Follow the [settings-preserving update procedure](https://github.com/tomismeta/omarchy-aperture/blob/main/CONTRIBUTING.md#update):
update the checkout, request graceful worker shutdown and wait for it to exit,
restart the stock shell, then activate the extension. Restart already-open OMP
sessions to load it. Do not deactivate for a normal update.

For removal, **deactivate before removing the plugin**. If deactivation fails,
keep the checkout and follow the recovery guidance; do not bypass the failure.

## Separate limitations

- **Omarchy catalog:** publication remains blocked by the lack of a stock
  pre-remove lifecycle hook whose failure prevents removal. Manual two-step
  deactivation/removal is supported operator guidance, not a fix for that
  catalog blocker.
- **Screen readers:** Quickshell 0.3.1 does not expose its managed windows through
  AT-SPI. Stock Omarchy needs a build containing the upstream fix, followed by
  fresh Orca acceptance. Keyboard, pointer, and screenshot checks do not prove
  screen-reader support.
- **Focus and privacy:** navigation is restricted to the documented supported
  Foot, Herdr, and tmux configurations. Unsupported or ambiguous sessions remain
  non-navigable. Privacy does not cover native OMP notification fallback.
  Aperture never approves requests or answers on the user's behalf.

See [supported focus configurations](https://github.com/tomismeta/omarchy-aperture/blob/main/CONTRIBUTING.md#supported-focus)
and [integration readiness](https://github.com/tomismeta/omarchy-aperture/blob/main/CONTRIBUTING.md#integration-readiness).
