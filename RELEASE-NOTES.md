# Aperture for Omarchy 0.1.2

**Unpublished release candidate under evaluation.** Final native acceptance,
authenticated worker replacement, and release authorization remain separate
from this document.

This checkout retains the authenticated signed worker **v0.8.12** unchanged.
Additional worker corrections are implemented in canonical upstream source and
exercised as a separate unsigned development artifact. They are **not yet in
the plugin's signed payload**. A new authenticated worker release and normal
re-vendoring are required before publication approval. Stock OMP 18+ and Node
22+ remain required.

Historical release `omarchy-aperture-v0.1.1` remains plugin **0.1.1** with worker
**v0.8.9**; its tag and archive are unchanged.

## Hardening under evaluation

The plugin now bounds held notifications to 33 cards without evicting or
reordering the prefix being read. Unshown arrivals remain eligible, and the
reserved Open Aperture action reports currently unshown attention. Failed
activation rolls back only its new OMP registration, preserving existing
privacy, placement, and durable worker state. Four unused presentation helpers
and their orphan assertions were removed.

Aperture lifecycle commands now share an owner-checked guard, restore running
and enabled state after ambiguous pre-commit failures, and refuse observed
changes to the OMP lockfile or package link. Concurrent stock `omp plugin`
management remains unsupported because those writers do not share the guard.

The distribution includes exact third-party license notices and archive-local
release notes. Future upstream worker builds embed their bundled dependency
notices directly in the generated worker.

The pending upstream worker replacement addresses:

- retries after known pre-commit transient persistence failures, while retaining
  accepted/in-flight deduplication and conservative handling of ambiguous writes;
- terminal adapter-disable cleanup of heartbeat and focus ownership;
- agreement between retained attention, shutdown, and monotonic session expiry;
- terminal approval/input resolution independent of wall-clock ordering;
- terminal executable shutdown after socket ownership-lock failures, without
  deleting another worker's replacement socket;
- clean shutdown of registered focus without emitting a rejected snapshot
  after output has stopped.

These source corrections do not authorize publishing either project. The
existing signed payload remains the only production-accepted payload until
the normal upstream release and downstream authentication gates complete.

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
- **Stable held actions:** arrivals append below the cards being read until the
  33-card cap. Overflow is counted against current attention, not accumulated
  history. When the viewport cannot grow without moving held actions, scroll
  to reach the cards; the deck does not auto-scroll away from the current action.
  Long bodies also scroll. Notifications do not take keyboard focus or
  automatically open the overview.
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
