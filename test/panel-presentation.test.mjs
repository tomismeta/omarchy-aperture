import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Presentation = require("../PanelPresentationLogic.js");
const Focus = require("../PanelFocusLogic.js");

const completionSnapshot = JSON.parse(
  readFileSync(new URL("../fixtures/omp-direct/snapshot-completion.json", import.meta.url), "utf8"),
);
const inputSnapshot = JSON.parse(
  readFileSync(new URL("../fixtures/omp-direct/snapshot-now-next.json", import.meta.url), "utf8"),
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
  assert.equal(Presentation.clippedMessage("queued items", 3, 3), "");
  pass("clipping indicator stays absent when all items are visible");
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
  const privateText = [
    Presentation.frameTitle(frame, 1, true),
    Presentation.frameSummary(frame, true),
    Presentation.frameMeta(frame, 2, true),
    Presentation.frameLine(frame, 1, true),
    Presentation.accessibleFrameName("ambient", frame, 2, true),
  ].join("\n");
  for (const value of [frame.title, frame.summary, frame.navigation.handle])
    assert.equal(privateText.includes(value), false);
  const after = Focus.selectionFor(frame);
  assert.deepEqual(after, before);
  assert.equal(after.handle, frame.navigation.handle);
  assert.deepEqual(frame, original);
  assert.deepEqual(
    Focus.selectionFor({ ...frame, source: { kind: "omp", label: "Other session" } }),
    before,
  );
  assert.equal(Presentation.frameTitle(frame, 1, false), frame.title);
  assert.equal(Presentation.frameSummary(frame, false), frame.summary);
  assert.equal(Presentation.boundedMetadataWidth(400, 160), 128);
  assert.equal(Presentation.boundedMetadataWidth(200, 190), 10);
  assert.equal(Presentation.boundedMetadataWidth(120, 160), 0);
  pass("accessible lane names respect privacy and metadata leaves bounded title space");
  pass("privacy changes presentation without mutating identity, focus, or accessible copy");
}

{
  const frame = completionSnapshot.view.now;
  const original = structuredClone(frame);
  const selection = Focus.selectionFor(frame);
  const card = Presentation.cardPresentation(frame, 1, false);
  assert.equal(card.meta, "omarchy-aperture");
  assert.equal(card.summary, "", "the stock completion prose repeats the event line");
  assert.deepEqual(frame, original);
  assert.deepEqual(Focus.selectionFor(frame), selection);
  pass("the stock OMP completion pair becomes a concise card without changing its routing");
}

{
  const frame = {
    ...completionSnapshot.view.now,
    title: "private-title-canary",
    summary: "private-summary-canary",
    source: { kind: "omp", label: "OMP private-session-canary" },
  };
  const privateCard = Presentation.cardPresentation(frame, 2, true);
  const neutralFrame = { ...frame, title: "", summary: "", source: null };
  assert.deepEqual(privateCard, Presentation.cardPresentation(neutralFrame, 2, true));
  const privateText = JSON.stringify(privateCard);
  for (const value of [
    frame.title, frame.summary, "private-session-canary", frame.navigation.handle,
  ]) assert.equal(privateText.includes(value), false);
  assert.notEqual(privateCard.meta, Presentation.cardPresentation(frame, 1, true).meta);
  assert.deepEqual(
    Presentation.cardPresentation(completionSnapshot.view.now, 2, true),
    privateCard,
    "stock copy cannot bypass the privacy projection",
  );
  assert.equal(
    Presentation.cardPresentation(frame, 2, false).meta,
    "private-session-canary",
  );
  pass("card privacy hides all private copy while retaining a neutral session identity");
}

{
  const stock = completionSnapshot.view.now;
  const preserved = [
    { ...stock, title: "Indexing workspace", summary: "Waiting for the next file." },
    { ...stock, summary: "Updated auth.ts; the migration still needs review." },
    { ...stock, title: "OMP needs input", mode: "input" },
    { ...stock, title: "Approve deployment", mode: "approval" },
    { ...stock, title: "OMP failed", summary: "The build exited with code 1." },
    { ...stock, mode: "input" },
    { ...stock, source: { kind: "unknown", label: "Other session" } },
    { ...stock, source: null },
  ];
  for (const frame of preserved) {
    const original = structuredClone(frame);
    const card = Presentation.cardPresentation(frame, 1, false);
    assert.equal(card.title, frame.title);
    assert.equal(card.summary, frame.summary);
    assert.deepEqual(frame, original);
  }
  for (const label of ["OMP Review session", "omp · Review session", "omp - Review session", "Review session"]) {
    assert.equal(
      Presentation.cardPresentation({ source: { kind: "omp", label } }, 1, false).meta,
      "Review session",
    );
  }
  assert.equal(
    Presentation.cardPresentation({ source: { kind: "omp", label: "OMP" } }, 1, false).meta,
    Presentation.cardPresentation(null, 1, false).meta,
  );
  pass("card normalization preserves custom status, substantive completion detail, and other events");
}

{
  const cases = [
    { frame: completionSnapshot.view.now, title: "Response ready",
      alertTitle: "Response ready to review", alertSummary: "" },
    { frame: inputSnapshot.view.next[0], title: "Needs your input",
      alertTitle: "OMP needs your input", alertSummary: "OMP is waiting for an operator response." },
  ];
  for (const { frame, title, alertTitle, alertSummary } of cases) {
    const original = structuredClone(frame);
    const panel = Presentation.compactPanelPresentation(frame, 1, false);
    assert.equal(panel.title, title);
    assert.equal(panel.summary, "", "only redundant stock prose is removed from panel rows");
    const alert = Presentation.cardPresentation(frame, 1, false);
    assert.equal(alert.title, alertTitle, "compact panel copy must not change notifications");
    assert.equal(alert.summary, alertSummary);
    assert.deepEqual(frame, original, "panel projection cannot mutate shared frame data");

    for (const custom of [
      { ...frame, title: "Review migration risks" },
      { ...frame, summary: "The auth migration needs a rollback plan." },
      { ...frame, mode: "approval" },
      { ...frame, source: { kind: "other", label: "Other session" } },
    ]) {
      const copy = Presentation.compactPanelPresentation(custom, 1, false);
      assert.equal(copy.title, custom.title);
      assert.equal(copy.summary, custom.summary);
    }
  }
  pass("panel-only stock normalization preserves custom content and notification projection");
}

{
  const frame = {
    ...completionSnapshot.view.now,
    title: "private-title-canary",
    summary: "private-summary-canary",
    source: { kind: "omp", label: "OMP private-session-canary" },
    context: { items: [{ value: "private-context-canary" }] },
    provenance: { whyNow: "private-provenance-canary" },
  };
  const panel = Presentation.compactPanelPresentation(frame, 2, true);
  assert.equal(panel.summary, "");
  assert.notEqual(panel.meta, Presentation.compactPanelPresentation(frame, 1, true).meta);
  for (const candidate of [frame, completionSnapshot.view.now, inputSnapshot.view.next[0]]) {
    assert.deepEqual(Presentation.compactPanelPresentation(candidate, 2, true), panel);
  }
  const privateText = JSON.stringify(panel);
  for (const value of [
    frame.title, frame.summary, "private-session-canary", frame.navigation.handle,
    "private-context-canary", "private-provenance-canary",
  ]) assert.equal(privateText.includes(value), false);
  pass("private panel rows retain neutral session identity without revealing frame content");
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
  pass("panel privacy override is scoped to an open panel");
}

{
  const frame = {
    id: "inspection-one",
    version: 4,
    title: "private-title-canary",
    summary: "private-summary-canary",
    source: { kind: "omp", label: "private-session-canary" },
    navigation: { kind: "opaque-focus", handle: "H".repeat(32) },
    context: { items: [{ value: "hidden-context-canary" }] },
    provenance: { whyNow: "hidden-provenance-canary" },
  };
  const target = Presentation.inspectionTargetFor(frame);
  const other = { ...frame, id: "inspection-two" };
  assert.equal(Presentation.inspectedFrame([other, frame], target), frame);
  assert.equal(Presentation.inspectedFrame([other], target), null);
  assert.equal(
    Presentation.inspectedFrame([{ ...frame, version: 5 }], target),
    null,
  );
  assert.equal(Presentation.inspectedFrame([frame], null), null);
  const publicText = Presentation.inspectionText(frame, 2, false);
  const panelPublicText = Presentation.panelInspectionText(frame, 2, false);
  for (const text of [publicText, panelPublicText]) {
    for (const value of [frame.title, frame.summary, frame.source.label])
      assert(text.includes(value));
  }
  const privateText = Presentation.inspectionText(frame, 2, true);
  const panelPrivateText = Presentation.panelInspectionText(frame, 2, true);
  for (const text of [privateText, panelPrivateText]) {
    for (const value of [frame.title, frame.summary, frame.source.label])
      assert.equal(text.includes(value), false);
  }
  assert.deepEqual(panelPrivateText.split("\n\n"), ["omp · session 2", "Task 2"]);
  for (const text of [publicText, privateText, panelPublicText, panelPrivateText]) {
    assert.equal(text.includes(frame.navigation.handle), false);
    assert.equal(text.includes("hidden-context-canary"), false);
    assert.equal(text.includes("hidden-provenance-canary"), false);
  }
  assert.equal(Presentation.inspectionText(null, 2, false), "");
  assert.equal(Presentation.panelInspectionText(null, 2, true), "");
  assert.equal(Presentation.panelInspectionText(null, 2, false), "");
  pass("inspection pins the exact visible revision and only exposes privacy-filtered presentation");
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

function attentionFrame(id, overrides = {}) {
  return {
    ...completionSnapshot.view.now,
    id, interactionId: `interaction-${id}`,
    title: `Title ${id}`, summary: `Body ${id}`,
    ...overrides,
  };
}

function peekSnapshot(now, next = [], ambient = [], presents = true) {
  return { now, next, ambient, presents };
}

function advancePeek(state, snapshot, now, options = {}) {
  return Presentation.transitionPeek(state, snapshot, {
    now, canReveal: true, opened: false, reading: false,
    duration: 8000, grace: 2000, ...options,
  });
}

function displayedIds(state) {
  return state.cards.map((card) => card.frame.id);
}

{
  const a = attentionFrame("A");
  const b = attentionFrame("B");
  const c = attentionFrame("C");
  let state = advancePeek(Presentation.createPeekState(), peekSnapshot(a), 0);
  state = advancePeek(state, peekSnapshot(a), 1000, { reading: true });
  const updatedA = { ...a, version: 999, title: "Changed while reading" };
  state = advancePeek(state, peekSnapshot(b, [updatedA]), 2000, { reading: true });
  assert.deepEqual(displayedIds(state), ["A", "B"], "arrival appears immediately below the hovered card");
  state = advancePeek(state, peekSnapshot(c, [b, updatedA]), 50000, { reading: true });
  assert.deepEqual(displayedIds(state), ["A", "B", "C"]);
  assert.equal(state.cards[0].frame, a, "reading retains the immutable original copy");
  assert.equal(state.remaining, 8000, "new arrivals receive a full interval after hover");
  assert.equal(state.visible, true);
  const reordered = peekSnapshot(c, [updatedA, b]);
  state = advancePeek(state, reordered, 60000);
  assert.deepEqual(displayedIds(state), ["C", "A", "B"]);
  assert.equal(state.cards[1].frame, updatedA);
  assert.equal(state.deadline, 68000);
  assert.equal(state.reading, false);
  pass("hover pins existing cards while arrivals append immediately; leaving restores canonical order");
}

{
  const a = attentionFrame("A");
  const b = attentionFrame("B");
  const quiet = attentionFrame("quiet");
  let state = advancePeek(Presentation.createPeekState(), peekSnapshot(null, [], [quiet]), 0);
  assert.equal(state.visible, false, "AMBIENT alone does not start passive presentation");
  state = advancePeek(state, peekSnapshot(a, [b], [quiet]), 1);
  assert.deepEqual(displayedIds(state), ["A", "B"]);
  state = advancePeek(state, peekSnapshot(b, [a], [quiet]), 1000);
  assert.deepEqual(displayedIds(state), ["B", "A"]);
  assert.equal(state.deadline, 8001, "canonical reordering does not reset the lifetime");
  state = advancePeek(state, peekSnapshot(b, [a], [quiet]), 8001);
  assert.equal(state.visible, false);
  state = advancePeek(state, peekSnapshot({ ...b, version: 800 }, [a], [quiet]), 9000);
  assert.equal(state.visible, false, "shown NEXT becoming NOW and heartbeats cannot replay");
  const nextInteraction = { ...b, interactionId: "genuinely-new" };
  state = advancePeek(state, peekSnapshot(nextInteraction, [a], [quiet]), 10000);
  assert.deepEqual(displayedIds(state), ["B"]);
  assert.equal(state.cards[0].identity, Presentation.peekIdentity(nextInteraction));
  pass("displayed interactions coalesce across versions and lanes without replay");
}

{
  const a = attentionFrame("A");
  const b = attentionFrame("B");
  let state = advancePeek(Presentation.createPeekState(), peekSnapshot(a), 0);
  state = advancePeek(state, peekSnapshot(a), 8000);
  assert.equal(state.visible, false);
  state = advancePeek(state, peekSnapshot(a, [b]), 9000);
  assert.deepEqual(displayedIds(state), ["B"], "unseen NEXT opens without replaying old NOW");
  assert.equal(state.deadline, 17000);
  const nextOnly = advancePeek(Presentation.createPeekState(), peekSnapshot(null, [b]), 0);
  assert.deepEqual(displayedIds(nextOnly), ["B"]);
  pass("unseen NEXT starts a popup alone or after an earlier popup expires");
}

{
  const a = attentionFrame("A");
  const b = attentionFrame("B");
  const c = attentionFrame("C");
  let state = advancePeek(Presentation.createPeekState(), peekSnapshot(a), 0);
  state = advancePeek(state, peekSnapshot(a), 8000);
  state = advancePeek(state, peekSnapshot(a, [b]), 9000);
  assert.deepEqual(displayedIds(state), ["B"]);
  const privateB = Presentation.cardPresentation(state.cards[0].frame, state.cards[0].ordinal, true);
  assert.equal(privateB.meta, "session 2");
  assert.equal(privateB.title, "Task 2");
  state = advancePeek(state, peekSnapshot(a, [b]), 9100, { reading: true });
  state = advancePeek(state, peekSnapshot(a, [b, c]), 9200, { reading: true });
  assert.deepEqual(displayedIds(state), ["B", "C"]);
  const privateCards = state.cards.map((card) => Presentation.cardPresentation(card.frame, card.ordinal, true));
  assert.deepEqual(privateCards[0], privateB, "the held private card keeps its label and copy");
  assert.notEqual(privateCards[1].meta, privateB.meta, "appended sessions have distinct private labels");
  assert.notEqual(privateCards[1].title, privateB.title, "appended tasks have distinct private labels");
  pass("sparse held ordinals remain stable and unique when an arrival appends");
}

{
  const a = attentionFrame("A");
  const b = attentionFrame("B");
  let state = advancePeek(Presentation.createPeekState(), peekSnapshot(a), 0);
  state = advancePeek(state, peekSnapshot(b, [a]), 1000, { reading: true });
  assert.deepEqual(displayedIds(state), ["A", "B"]);
  state = advancePeek(state, peekSnapshot(b, [a]), 2000, {
    reading: true, activatedIdentity: Presentation.peekIdentity(a),
  });
  assert.deepEqual(displayedIds(state), ["B"], "opening A removes only its own card");
  assert.equal(state.reading, false);
  assert.equal(state.deadline, 10000);
  state = advancePeek(state, peekSnapshot(b), 3000);
  assert.deepEqual(displayedIds(state), ["B"]);
  state = advancePeek(state, peekSnapshot(b), 10000);
  assert.equal(state.visible, false);
  state = advancePeek(state, peekSnapshot(b), 11000);
  assert.equal(state.visible, false, "the displayed B must not replay on heartbeat");
  pass("opening one session preserves the other notifications and their lifetime");
}

{
  const a = attentionFrame("A");
  const b = attentionFrame("B");
  const c = attentionFrame("C");
  let state = advancePeek(Presentation.createPeekState(), peekSnapshot(a), 0);
  state = advancePeek(state, peekSnapshot(a), 7500, { reading: true });
  state = advancePeek(state, peekSnapshot(b, [a]), 9000, { reading: true });
  state = advancePeek(state, peekSnapshot(c, [a]), 10000, { reading: true });
  assert.deepEqual(displayedIds(state), ["A", "B", "C"], "held cards remain in place as arrivals append");
  state = advancePeek(state, peekSnapshot(c, [a]), 11000);
  assert.deepEqual(displayedIds(state), ["C", "A"]);
  assert.equal(state.deadline, 19000, "leaving gives the latest arrival its full readable interval");
  state = advancePeek(state, peekSnapshot(c, [a]), 18000, { reading: true });
  state = advancePeek(state, peekSnapshot(c, [a]), 99000);
  assert.equal(state.deadline, 101000, "leaving near expiry provides at least two seconds");
  state = advancePeek(state, peekSnapshot(c, [a]), 100999);
  assert.equal(state.visible, true);
  state = advancePeek(state, peekSnapshot(c, [a]), 101000);
  assert.equal(state.visible, false);
  pass("held-card pruning and leave/resume respect the shared lifetime boundary");
}

{
  const a = attentionFrame("A");
  const b = attentionFrame("B");
  let state = advancePeek(Presentation.createPeekState(), peekSnapshot(a), 0);
  state = advancePeek(state, peekSnapshot(a), 100, { reading: true });
  const latest = peekSnapshot(b);
  state = advancePeek(state, latest, 200, { reading: true });
  assert.deepEqual(displayedIds(state), ["A", "B"]);
  assert.equal(Presentation.resolvePeekFrame(latest, state.cards[0].identity), null);
  const staleStatus = Presentation.peekCardAvailability(state.cards[0], null, true);
  const outageStatus = Presentation.peekCardAvailability(state.cards[0], null, false);
  assert.notEqual(staleStatus, "");
  assert.notEqual(outageStatus, "");
  assert.notEqual(staleStatus, outageStatus, "worker loss is not a resolution");
  state = advancePeek(state, latest, 300);
  assert.deepEqual(displayedIds(state), ["B"], "stale held cards leave only after the pointer");
  assert.equal(state.seen.includes(Presentation.peekIdentity(a)), false);
  const noNavigation = { ...b, navigation: null };
  state = advancePeek(state, peekSnapshot(noNavigation), 400, { reading: true });
  const lostSession = Presentation.peekCardAvailability(state.cards[0], noNavigation, true);
  assert.notEqual(lostSession, "");
  assert.notEqual(lostSession, staleStatus, "capability loss does not imply resolved attention");
  const disconnected = peekSnapshot(null, [], [], false);
  state = advancePeek(state, disconnected, 90000, { reading: true });
  assert.deepEqual(displayedIds(state), ["B"]);
  state = advancePeek(state, disconnected, 90001);
  assert.equal(state.visible, false);
  assert.deepEqual(state.seen, [], "dedup does not become persistent history");
  pass("held invalidations remain readable but unavailable, then disappear on leave");
}

{
  const a = attentionFrame("A", { navigation: null });
  let state = advancePeek(Presentation.createPeekState(), peekSnapshot(a), 0);
  state = advancePeek(state, peekSnapshot(a), 100, { reading: true });
  assert.equal(Presentation.peekCardAvailability(state.cards[0], a, true), "");
  assert.equal(Focus.canWaitForNavigation(a, "", ""), true);
  const navigable = { ...a, navigation: { kind: "opaque-focus", handle: "N".repeat(32) } };
  state = advancePeek(state, peekSnapshot(navigable), 200, { reading: true });
  state = advancePeek(state, peekSnapshot(a), 300, { reading: true });
  assert.notEqual(Presentation.peekCardAvailability(state.cards[0], a, true), "");
  assert.equal(state.cards[0].frame, a);
  pass("initial pending navigation may defer, but a subsequently lost session is unavailable");
}

{
  const a = attentionFrame("A");
  const b = attentionFrame("B");
  const c = attentionFrame("C");
  let state = advancePeek(Presentation.createPeekState(), peekSnapshot(a), 0);
  state = advancePeek(state, peekSnapshot(b, [a]), 100, { reading: true });
  state = advancePeek(state, peekSnapshot(b, [a]), 200, { opened: true, reading: true });
  assert.equal(state.visible, false);
  state = advancePeek(state, peekSnapshot(b, [a]), 300);
  assert.equal(state.visible, false);
  state = advancePeek(state, peekSnapshot(c, [b, a]), 400);
  assert.deepEqual(displayedIds(state), ["C"]);
  pass("opening overview consumes current notifications without replay after close");
}

{
  const a = attentionFrame("A");
  const b = attentionFrame("B");
  const identity = Presentation.peekIdentity(a);
  const updatedA = {
    ...a, version: 100, navigation: { kind: "opaque-focus", handle: "Z".repeat(32) },
  };
  const snapshot = peekSnapshot(b, [updatedA]);
  const exact = Presentation.resolvePeekFrame(snapshot, identity);
  assert.equal(exact, updatedA);
  assert.equal(Focus.navigationFor(exact).handle, "Z".repeat(32));
  assert.equal(Focus.matchesInteraction(exact, a.id, a.interactionId), true);
  assert.equal(
    Presentation.resolvePeekFrame(peekSnapshot(b, [{ ...updatedA, interactionId: "replacement" }]), identity),
    null,
  );
  assert.equal(Presentation.resolvePeekFrame(peekSnapshot(b, [], [updatedA]), identity), null);
  assert.equal(Presentation.resolvePeekFrame(peekSnapshot(b, [updatedA], [], false), identity), null);
  assert.equal(Presentation.resolvePeekFrame(snapshot, Presentation.peekIdentity(b)), b);
  pass("each deck action resolves its exact current NOW/NEXT interaction and capability, never a replacement");
}
