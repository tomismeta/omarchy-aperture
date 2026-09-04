# Agent handoff: Aperture panel — Option 1 "Stock-Aligned Compact"

## Goal

Restyle `Panel.qml` to match the stock Omarchy network/audio panel anatomy: **flat hero + flat
icon-led rows**, replacing the current per-row `BorderSurface` cards. Lane is carried by a
full/empty dot (**● = NOW, ○ = NEXT**). Bar icon (`ApertureMark.qml`) is **unchanged** — the
current full-human mark (short arc over bust) is the chosen mark.

Design reference: `docs/aperture-panel-directions.html`, direction **01 / recommended**.
Stock reference: network plugin scan-list rows (leading glyph + 1–2 line label + trailing
hover affordance, no card chrome).

## Scope

**One file: `Panel.qml`.** No changes to `ApertureMark.qml`, `Service.qml`, `WorkerModel.qml`,
`manifest.json`, or any JS logic file. All focus/navigation/privacy behavior is preserved.

## Required changes

### 1. NOW row: card → flat row with ● dot

Replace the `BorderSurface { id: nowCard … }` with a flat row `Item` that keeps the same id
(`revealSelectedFrame()` calls `revealPanelItem(nowCard)` — the id must survive).

Anatomy (mirrors the network scan row):

```
Item { id: nowCard
  // selection/hover paint: a plain Rectangle behind content, "transparent" at rest,
  // Style.selectedFillFor(foreground, Color.accent) on hover,
  // Style.hoverFillFor + Border.controlSpec("hover-cursor", …) when selected
  Row {
    Text  { text: "●"; color: Color.accent; font.pixelSize: Style.font.caption }
    Column {
      Text  // meta:    root.frameMeta(root.nowFrame)     — caption, root.dim
      Text  // title:   root.frameTitle(root.nowFrame)    — body, bold, elide right
      Text  // summary:  root.frameSummary(root.nowFrame) — bodySmall, root.dim, max 2 lines
      Text  // CTA:      root.navigationStatusText(...)   — caption, Color.accent,
            //            visible per root.showFocusStatus(root.nowFrame, nowCard.hovered)
    }
  }
}
```

- Keep the existing `hovered`/`selected` properties, `HoverHandler`, `MouseArea`, and
  `Accessible.*` wiring exactly as they are; only the visual container changes.
- Row padding: `Style.space(6)` horizontal, `Style.space(4)` vertical. Dot-to-text gap
  `Style.space(8)`.

### 2. NEXT rows: card → flat row with ○ dot

Same treatment for the `Repeater id: nextRepeater` delegate (`BorderSurface { id: nextCard }`):

- Leading dot `Text { text: "○"; color: root.dim; font.pixelSize: Style.font.caption }`.
- Body: meta line (existing `frameMeta`) + one elided title line (existing `frameLine`).
- Trailing `↵` / status text stays right-aligned, revealed on hover/selection via the
  existing `showFocusStatus()` logic (unchanged).
- Keep the delegate id `nextCard` (used by `revealPanelItem(nextRepeater.itemAt(index))`).
- Selected state: `Style.hoverFillFor` fill + `Border.controlSpec("hover-cursor", …)` border,
  same as today — just painted on a plain Rectangle instead of a BorderSurface.

### 3. AMBIENT collapses to one summary line

- Keep the existing `ambientLabel`/`ambientText` header row (`AMBIENT … 1 · quiet`).
- The `ambientDisplay: "expanded"` manifest setting keeps working (do not remove the
  Repeater), but expanded ambient rows also lose their `BorderSurface` and render as flat,
  dim caption rows (no leading dot).

### 4. What stays

- `PanelHero` (already flat — correct).
- `PanelSectionHeader`s (`NOW`, `NEXT`, `AMBIENT`) and `PanelSeparator`s.
- `calmCard`, `stateCard`, `focusFailureCard` keep their `BorderSurface` chrome — these are
  status banners, not list rows.
- `AttentionPeek`, shortcut footer, keyboard handling, peek timers, focus dispatch — untouched.
- `PanelPresentationLogic.js` / `PanelFocusLogic.js` APIs — untouched.

## Non-goals

- No new icon work. `ApertureMark.qml` stays byte-identical.
- No changes to lane judgment, ordering, privacy placeholders, or focus semantics.
- No new settings keys.

## Conventions to follow

- Fonts/spacing only via `Style.font.*` / `Style.space()` — no hard-coded pixel sizes.
- Colors only from `root.foreground`, `root.dim`, `root.urgent`, `Color.accent`, and the
  existing `Style.selectedFillFor` / `Style.hoverFillFor` helpers.
- Dots are plain text glyphs (U+25CF / U+25CB) in the bar font — no Nerd Font dependency,
  no SVG.

## Verification

1. `node test/run.mjs` — full contract suite passes (panel presentation tests included).
2. `omarchy plugin validate .` on stock Omarchy.
3. Visual smoke in the real shell (per README): dark + light themes, display scale 1.0/1.5,
   overflow with a long NEXT list, multi-monitor.
4. Keyboard path: open panel → `↑`/`↓` moves selection fill between flat rows → `Enter`
   focuses the exact pane → `P` toggles privacy → `Esc` closes.

## Acceptance criteria

- No `BorderSurface` remains around NOW/NEXT list rows.
- NOW rows lead with a ● dot in `Color.accent`; NEXT rows lead with a ○ dot in `root.dim`.
- Panel height for 1 NOW + 7 NEXT + 1 AMBIENT is visibly (~35%) shorter than the current
  card layout, matching direction 01 in `docs/aperture-panel-directions.html`.
- All existing tests pass unmodified; focus, privacy, and error states behave exactly as
  before.
