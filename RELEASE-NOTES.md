# Aperture for Omarchy 0.2.1

This release includes authenticated signed worker **v0.8.14**, published from
protected upstream commit `c9d1c32d3524afd3bbefe9a693fcf6ebfdb2aec3` and imported
through the normal authenticated vendor command. The included OMP package is
**0.2.0**. Stock OMP 18+ and Node 22+ remain required.

Earlier signed plugin releases and their archives are unchanged.

## Panel polish

- Empty AMBIENT sections are omitted, including their divider and placeholder.
- Details card navigation is centered across the panel, independently of
  Overview and Open Session. Narrow panels place navigation on a centered
  second row rather than overlapping either action.
- The worker and included OMP extension are unchanged from the signed 0.2.0
  candidate; existing OMP sessions do not need another restart for this patch.

## Session metadata and Details

- **Session-first scanning:** notifications and overview rows show repository,
  branch, and model context when available. Aperture continues to own NOW/NEXT
  ordering; the plugin does not rerank attention.
- **Inspection without navigation:** clicking an overview row or pressing D
  opens Details, including for sessions that cannot be navigated to. Clicking
  a notification body opens the overview with that item selected.
- **Exact-session navigation:** Open Session remains a separate action.
  Enter opens the selected overview item or the inspected Details item, never
  a guessed replacement target.
- **Structured Details:** the top toolbar contains Overview, previous/index/next,
  and Open Session. Checkout and Agent sections show repository, branch,
  worktree, provider, and the full model identifier. Missing fields are omitted;
  model names containing slashes are preserved.
- **Privacy:** hidden task text also hides all metadata and its accessible
  labels. Reveal panel only is local to the open panel; notifications remain
  private. Privacy does not cover native OMP notification fallback.

The refreshed [README](./README.md) images come from the approved HTML
illustration, including the exact OMP selector `opencode-go/deepseek-v4-flash`.
They are presentation illustrations, not evidence of native acceptance across
supported configurations.

## Persistent, scoped attention clearing

- **C in Details** clears only the inspected item. **C in the overview** clears
  all current NOW/NEXT attention, including attention coalesced or omitted from
  the visible projection. AMBIENT context is preserved.
- The worker commits dismissal before acknowledging it. Stale requests and
  persistence failures do not speculatively hide rows. Holding C across the
  Details-to-overview transition cannot clear the remaining attention.
- Cleared revisions stay fenced across worker restarts within the worker's
  bounded retention policy: 24 hours, 1,024 tombstones, and 4 MiB of state.
  Genuinely newer attention can reappear. Recurring provider failures have
  occurrence-specific identities rather than sharing one permanent event ID.
- Clearing never stops an agent, cancels work, approves a request, or supplies
  an answer. Sessions continue running.

Private worker output is now protocol **5**, with negotiated attention-dismissal
support. Worker input, direct socket messages, and focus requests/results remain
protocol **4**. Update the plugin and its authenticated payload together.

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
- **Focus:** navigation is restricted to the documented supported Foot, Herdr,
  and tmux configurations. Unsupported or ambiguous sessions remain
  non-navigable.

See [supported focus configurations](https://github.com/tomismeta/omarchy-aperture/blob/main/CONTRIBUTING.md#supported-focus)
and [integration readiness](https://github.com/tomismeta/omarchy-aperture/blob/main/CONTRIBUTING.md#integration-readiness).
