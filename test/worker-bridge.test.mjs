import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Bridge = require("../WorkerBridgeLogic.js");
const Protocol = require("../WorkerOutputLogic.js");
const PanelFocus = require("../PanelFocusLogic.js");

function pass(label) {
  process.stdout.write(`ok - ${label}\n`);
}

{
  const lines = [];
  let framed = Bridge.consumeWorkerOutput(
    "",
    "{\"first\":",
    1024,
    line => lines.push(line),
  );
  assert.equal(framed.ok, true);
  assert.equal(framed.buffer, "{\"first\":");
  framed = Bridge.consumeWorkerOutput(
    framed.buffer,
    "1}\n{\"second\":2}\r\n",
    1024,
    line => lines.push(line),
  );
  assert.equal(framed.ok, true);
  assert.equal(framed.buffer, "");
  assert.deepEqual(lines, ["{\"first\":1}", "{\"second\":2}\r"]);

  const blank = Bridge.consumeWorkerOutput("", "\n", 1024, () => true);
  assert.deepEqual(blank, {
    ok: false,
    buffer: "",
    code: "empty_line",
  });
  const consecutiveLines = [];
  const consecutive = Bridge.consumeWorkerOutput(
    "",
    "{}\n\n",
    1024,
    line => consecutiveLines.push(line),
  );
  assert.equal(consecutive.ok, false);
  assert.equal(consecutive.code, "empty_line");
  assert.deepEqual(consecutiveLines, ["{}"]);

  const whitespaceLines = [];
  const whitespace = Bridge.consumeWorkerOutput(
    "",
    " \t\r\n",
    1024,
    line => whitespaceLines.push(line),
  );
  assert.equal(whitespace.ok, true);
  assert.equal(Protocol.parse(whitespaceLines[0], false, 0).code, "malformed_json");

  const incomplete = Bridge.consumeWorkerOutput(
    "",
    "{\"incomplete\":true}",
    1024,
    () => true,
  );
  assert.equal(incomplete.ok, true);
  assert.equal(incomplete.buffer, "{\"incomplete\":true}");
  assert.equal(
    Bridge.consumeWorkerOutput("", "é\n", 1024, () => true).code,
    "non_ascii",
  );
  assert.equal(
    Bridge.consumeWorkerOutput("", "1234\n", 4, () => true).code,
    "oversized_line",
  );
  pass("JSONL delimiter, blank, whitespace, and trailing-frame rules stay strict");
}

{
  const handle = "AbCdEfGhIjKlMnOpQrStUvWxYz_12345";
  assert.deepEqual(Bridge.projectFocusActivation("focus-1-7", handle), {
    type: "focus.activate",
    requestId: "focus-1-7",
    handle,
  });
  for (const [requestId, candidate] of [
    ["", handle],
    ["   ", handle],
    ["bad\nrequest", handle],
    ["x".repeat(161), handle],
    ["focus-1-7", ""],
    ["focus-1-7", "x".repeat(31)],
    ["focus-1-7", "x".repeat(33)],
    ["focus-1-7", "invalid+focus+handle+0000000000"],
  ]) assert.equal(Bridge.projectFocusActivation(requestId, candidate), null);
  pass("focus activation input carries only bounded request and opaque handle");
}

{
  assert.equal(Bridge.serializeInput({ body: "x".repeat(70 * 1024) }), null);
  const circular = {};
  circular.self = circular;
  assert.equal(Bridge.serializeInput(circular), null);
  assert.equal(Bridge.serializeInput(null), null);
  pass("OMP control input serialization is bounded and defensive");
}

{
  const queue = Bridge.createQueue();
  for (let index = 0; index < Bridge.limits().queueEntries; index += 1) {
    const message = Bridge.projectFocusActivation(`focus-${index}`, String(index).padEnd(32, "A"));
    assert(Bridge.enqueue(queue, message, Bridge.serializeInput(message)));
  }
  const overflow = Bridge.projectFocusActivation("focus-overflow", "Z".repeat(32));
  assert.equal(Bridge.enqueue(queue, overflow, Bridge.serializeInput(overflow)), false);
  assert.equal(queue.entries.length, 16);
  for (let index = 0; index < 16; index += 1)
    assert.equal(JSON.parse(Bridge.take(queue).line).requestId, `focus-${index}`);
  assert.equal(Bridge.take(queue), null);
  pass("OMP control queue is bounded FIFO without notification coalescing");
}

{
  const queue = Bridge.createQueue();
  const message = Bridge.projectFocusActivation("focus-clear", "C".repeat(32));
  assert(Bridge.enqueue(queue, message, Bridge.serializeInput(message)));
  Bridge.clearQueue(queue);
  assert.deepEqual(queue.entries, []);
  pass("OMP control queue clears deterministically");
}

{
  const handleA = "A".repeat(32);
  const handleB = "B".repeat(32);
  const handleC = "C".repeat(32);
  const now = { id: "frame-a", version: 1, navigation: { kind: "opaque-focus", handle: handleA } };
  const next = { id: "frame-b", version: 1, navigation: { kind: "opaque-focus", handle: handleB } };
  const ambient = { id: "frame-c", version: 1, navigation: { kind: "opaque-focus", handle: handleC } };
  const selection = PanelFocus.selectionFor(next);
  assert.deepEqual(selection, { frameId: "frame-b", handle: handleB });
  const reordered = PanelFocus.navigableFrames(next, [now], [ambient], "");
  assert.equal(PanelFocus.findFrame(reordered, selection.frameId, selection.handle), next);
  assert.equal(PanelFocus.selectionIndex(reordered, selection.frameId, selection.handle), 0);
  assert.deepEqual(
    PanelFocus.moveSelection(reordered, now.id, handleA, 1),
    { frameId: "frame-c", handle: handleC },
  );
  assert.equal(PanelFocus.findFrame(reordered, ambient.id, handleC), ambient);
  assert.equal(PanelFocus.findFrame([now], selection.frameId, selection.handle), null);
  assert.equal(
    PanelFocus.findFrame(
      [{ ...next, navigation: { kind: "opaque-focus", handle: handleA } }],
      selection.frameId,
      selection.handle,
    ),
    null,
  );
  pass("panel selection includes ambient and never retargets reorder, removal, or handle change");
}

{
  const handleNow = "N".repeat(32);
  const handleNext = "Q".repeat(32);
  const pendingNow = {
    id: "frame-now",
    interactionId: "interaction-now",
    version: 1,
  };
  const directNow = {
    ...pendingNow,
    navigation: { kind: "opaque-focus", handle: handleNow },
  };
  const next = {
    id: "frame-next",
    interactionId: "interaction-next",
    version: 1,
    navigation: { kind: "opaque-focus", handle: handleNext },
  };
  assert.deepEqual(
    PanelFocus.initialSelectionFor(pendingNow, [next], ""),
    {
      frameId: "frame-now",
      handle: "",
      interactionId: "interaction-now",
    },
  );
  assert.deepEqual(
    PanelFocus.initialSelectionFor(directNow, [directNow, next], ""),
    {
      frameId: "frame-now",
      handle: handleNow,
      interactionId: "",
    },
  );
  assert.deepEqual(
    PanelFocus.initialSelectionFor(null, [next], ""),
    {
      frameId: "frame-next",
      handle: handleNext,
      interactionId: "",
    },
  );
  pass("panel opening preserves semantic NOW before navigable fallback");
}

{
  const handle = "P".repeat(32);
  const frame = {
    id: "peek-frame",
    version: 1,
    navigation: { kind: "opaque-focus", handle },
  };
  assert.equal(PanelFocus.canStartFocus(frame, "", "", ""), true);
  assert.equal(PanelFocus.canStartFocus(frame, handle, "", ""), false);
  assert.equal(PanelFocus.canStartFocus(frame, "", "focus-pending", ""), false);
  assert.equal(PanelFocus.canStartFocus(frame, "", "", handle), false);
  assert.equal(PanelFocus.canStartFocus({ id: "peek-frame" }, "", "", ""), false);
  assert.equal(PanelFocus.canActivatePeekSession(frame, "", "", ""), true);
  assert.equal(PanelFocus.canActivatePeekSession(frame, handle, "", ""), false);
  pass("peek starts direct focus only for an available exact navigation target");
}

{
  const pending = {
    id: "peek-frame",
    interactionId: "peek-interaction",
    version: 1,
  };
  assert.deepEqual(PanelFocus.pendingSelectionFor(pending), {
    frameId: "peek-frame",
    interactionId: "peek-interaction",
  });
  assert.equal(PanelFocus.canWaitForNavigation(pending, "", ""), true);
  assert.equal(PanelFocus.canWaitForNavigation(pending, "focus-pending", ""), false);
  assert.equal(PanelFocus.canWaitForNavigation(pending, "", "Q".repeat(32)), false);
  assert.equal(PanelFocus.canActivatePeekSession(pending, "", "", ""), true);
  assert.equal(
    PanelFocus.canActivatePeekSession(pending, "", "focus-pending", ""),
    false,
  );
  assert.equal(
    PanelFocus.canActivatePeekSession(
      { id: "peek-frame", version: 1 },
      "",
      "",
      "",
    ),
    false,
  );
  assert.equal(
    PanelFocus.matchesInteraction(
      {
        ...pending,
        version: 2,
        navigation: { kind: "opaque-focus", handle: "R".repeat(32) },
      },
      "peek-frame",
      "peek-interaction",
    ),
    true,
  );
  assert.equal(
    PanelFocus.matchesInteraction(
      { ...pending, id: "replacement-frame" },
      "peek-frame",
      "peek-interaction",
    ),
    false,
  );
  assert.equal(
    PanelFocus.matchesInteraction(
      { ...pending, interactionId: "replacement-interaction" },
      "peek-frame",
      "peek-interaction",
    ),
    false,
  );
  assert.equal(
    PanelFocus.canWaitForNavigation(
      {
        ...pending,
        navigation: { kind: "opaque-focus", handle: "S".repeat(32) },
      },
      "",
      "",
    ),
    false,
  );
  pass("early peek focus waits only for the exact interaction navigation");
}

{
  const ledger = Bridge.createFocusRequestLedger(16);
  for (let index = 0; index < 16; index += 1)
    assert.equal(Bridge.addFocusRequest(ledger, `panel-${index}`, String(index).padEnd(32, "A")), true);
  assert.equal(ledger.count, 16);
  assert.equal(Bridge.addFocusRequest(ledger, "overflow", "Z".repeat(32)), false);
  assert.equal(Bridge.takeFocusRequest(ledger, "panel-7"), "7".padEnd(32, "A"));
  assert.equal(ledger.count, 15);
  assert.equal(Bridge.addFocusRequest(ledger, "replacement", "R".repeat(32)), true);
  const cleared = Bridge.clearFocusRequests(ledger);
  assert.equal(cleared.length, 16);
  assert.equal(ledger.count, 0);
  assert.equal(Bridge.takeFocusRequest(ledger, "replacement"), null);
  pass("shared panel focus requests cap and clear deterministically");
}
