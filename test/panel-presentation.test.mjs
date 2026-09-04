import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Presentation = require("../PanelPresentationLogic.js");
const Focus = require("../PanelFocusLogic.js");

const completionSnapshot = JSON.parse(
  readFileSync(new URL("../fixtures/omp-direct/snapshot-completion.json", import.meta.url), "utf8"),
);

function pass(label) {
  process.stdout.write(`ok - ${label}\n`);
}

function rgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

{
  const totals = { now: 1, next: 3, ambient: 4, sources: 99 };
  assert.equal(
    Presentation.canonicalHeaderSummary(totals),
    "1 now · 3 next · 4 ambient · 99 sources",
  );
  assert.equal(Presentation.clippedMessage("queued items", 8, 3), "3 of 8 queued items shown");
  assert.equal(Presentation.clippedMessage("queued items", 3, 3), "");
  assert.equal(Presentation.nextSummary(0), "None");
  assert.equal(Presentation.nextSummary(3), "3 queued");
  assert.equal(Presentation.ambientSummary(0), "None");
  assert.equal(Presentation.ambientSummary(4), "4 quiet · no action needed");
  pass("canonical header uses totals and source coverage without visible-array recounting");
}

{
  const frame = {
    id: "frame-1",
    version: 7,
    title: "Deploy production",
    summary: "A bounded summary",
    source: { kind: "omp", label: "OMP" },
    context: { items: [{ id: "project", label: "Project", value: "Aperture" }] },
    provenance: { whyNow: "Approval is required." },
    navigation: { kind: "opaque-focus", handle: "H".repeat(32) },
  };
  const original = structuredClone(frame);
  const before = Focus.selectionFor(frame);
  assert.equal(Presentation.frameTitle(frame, 1, true), "Task 1");
  assert.equal(Presentation.frameSummary(frame, true), "[details hidden]");
  assert.equal(Presentation.frameMeta(frame, 2, true), "omp - session 2");
  assert.equal(
    Presentation.frameLine(frame, 1, true),
    "Task 1 — [details hidden]",
  );
  const after = Focus.selectionFor(frame);
  assert.deepEqual(after, before);
  assert.equal(after.handle, frame.navigation.handle);
  assert.deepEqual(frame, original);
  assert.equal(Presentation.frameTitle(frame, 1, false), frame.title);
  assert.equal(Presentation.frameSummary(frame, false), frame.summary);
  assert.equal(Presentation.frameMeta(frame, 1, false), "omp");
  assert.equal(
    Presentation.frameLine(frame, 1, false),
    "Deploy production — A bounded summary",
  );
  assert.equal(
    Presentation.frameMeta(
      { source: { kind: "omp", label: "Review session" } },
      1,
      false,
    ),
    "omp - Review session",
  );
  assert.equal(
    Presentation.frameMeta({ source: { kind: "omp", label: "OMP" } }, 1, false),
    "omp",
  );
  pass("privacy changes presentation without mutating identity selection or focus handle");
}

{
  assert.equal(Presentation.frameOrdinal(false, 2, "next", 0), 1);
  assert.equal(Presentation.frameOrdinal(false, 2, "next", 1), 2);
  assert.equal(Presentation.frameOrdinal(false, 2, "ambient", 0), 3);
  assert.equal(Presentation.frameOrdinal(true, 2, "now", 0), 1);
  assert.equal(Presentation.frameOrdinal(true, 2, "next", 0), 2);
  assert.equal(Presentation.frameOrdinal(true, 2, "ambient", 0), 4);
  pass("privacy ordinals remain contiguous with or without a Now frame");
}

{
  assert.equal(
    Presentation.shortcutFooter(true, true),
    "↑↓ select · Enter focus · P privacy · Esc",
  );
  assert.equal(Presentation.shortcutFooter(true, false), "P privacy · Esc");
  assert.equal(Presentation.shortcutFooter(false, false), "");
  assert.equal(Presentation.showFocusStatus(false, false, false, false), false);
  assert.equal(Presentation.showFocusStatus(true, false, false, false), true);
  assert.equal(Presentation.showFocusStatus(false, true, false, false), true);
  assert.equal(Presentation.showFocusStatus(false, false, true, false), true);
  assert.equal(Presentation.showFocusStatus(false, false, false, true), true);

  assert.equal(Presentation.panelPrivacyEnabled(true, false, true), true);
  assert.equal(Presentation.panelPrivacyEnabled(true, true, true), false);
  assert.equal(Presentation.panelPrivacyEnabled(true, true, false), true);
  assert.equal(Presentation.panelPrivacyEnabled(false, false, true), false);
  assert.equal(Presentation.panelPrivacyEnabled(false, true, true), true);
  assert.equal(Presentation.panelPrivacyEnabled(false, true, false), false);
  pass("panel privacy override is scoped to an open panel and footer remains discoverable");
}

{
  assert.equal(Presentation.pressureLevel({ now: 0, next: 0, ambient: 99 }), 0);
  assert.equal(Presentation.pressureLevel({ now: 0, next: 1, ambient: 99 }), 1);
  assert.equal(Presentation.pressureLevel({ now: 0, next: 2, ambient: 0 }), 2);
  assert.equal(Presentation.pressureLevel({ now: 0, next: 3, ambient: 0 }), 2);
  assert.equal(Presentation.pressureLevel({ now: 0, next: 4, ambient: 0 }), 3);
  assert.equal(Presentation.pressureLevel({ now: 1, next: 0, ambient: 0 }), 4);
  assert.equal(Presentation.pressureLevel({ now: 1, next: 99, ambient: 99 }), 4);

  const themes = [
    {
      name: "Tokyo Night",
      background: rgb("#1a1b26"),
      foreground: rgb("#a9b1d6"),
      accent: rgb("#7aa2f7"),
    },
    {
      name: "Catppuccin Latte",
      background: rgb("#eff1f5"),
      foreground: rgb("#4c4f69"),
      accent: rgb("#1e66f5"),
    },
  ];
  for (const theme of themes) {
    const colors = [0, 1, 2, 3, 4].map((level) =>
      Presentation.pressureColor(
        level,
        theme.background,
        theme.foreground,
        theme.accent,
      ));
    const contrasts = colors.map((color) =>
      Presentation.contrastRatio(color, theme.background));
    assert.equal(colors.every((color) => color.a === 1), true, `${theme.name} must stay opaque`);
    for (let level = 1; level < contrasts.length; level++) {
      assert(
        contrasts[level] >= contrasts[level - 1],
        `${theme.name} level ${level} must not be fainter than level ${level - 1}`,
      );
      assert(
        contrasts[level] - contrasts[level - 1] >= 0.01,
        `${theme.name} pressure levels must remain visually distinct`,
      );
    }
  }
  pass("dark and light pressure colors are opaque, distinct, and contrast-monotonic");
}

{
  let state = Presentation.createPeekState();
  let result = Presentation.transitionPeek(
    state,
    completionSnapshot.view.now,
    true,
    false,
    true,
  );
  assert.equal(result.revealStarted, true);
  state = result.state;

  for (let version = 2; version <= 10; version++) {
    result = Presentation.transitionPeek(
      state,
      { ...completionSnapshot.view.now, version },
      true,
      false,
      true,
    );
    assert.equal(result.revealStarted, false);
    assert.equal(result.state.visible, true);
    state = result.state;
  }

  state = Presentation.hidePeek(state);
  assert.equal(state.visible, false);
  result = Presentation.transitionPeek(
    state,
    { id: "frame-2", version: 1 },
    true,
    false,
    true,
  );
  assert.equal(result.revealStarted, false);
  state = result.state;
  state = Presentation.endPeekCooldown(state);
  result = Presentation.transitionPeek(
    state,
    { id: "frame-2", version: 2 },
    true,
    false,
    true,
  );
  assert.equal(result.revealStarted, false);
  result = Presentation.transitionPeek(
    result.state,
    { id: "frame-3", version: 1 },
    true,
    false,
    true,
  );
  assert.equal(result.revealStarted, true);

  state = Presentation.createPeekState();
  state = Presentation.transitionPeek(
    state,
    { id: "restored", version: 1 },
    true,
    false,
    true,
  ).state;
  state = Presentation.hidePeek(state);
  state = Presentation.transitionPeek(state, null, false, false, true).state;
  state = Presentation.endPeekCooldown(state);
  result = Presentation.transitionPeek(
    state,
    { id: "restored", version: 99 },
    true,
    false,
    true,
  );
  assert.equal(result.revealStarted, false);
  assert.equal(
    Presentation.transitionPeek(state, null, true, false, true).revealStarted,
    false,
  );
  pass("completion peeks, rapid versions, cooldown, NEXT-only, and restored identity remain stable");
}
