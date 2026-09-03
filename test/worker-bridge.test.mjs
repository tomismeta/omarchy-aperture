import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Bridge = require("../WorkerBridgeLogic.js");
const PanelFocus = require("../PanelFocusLogic.js");

function pass(label) {
  process.stdout.write(`ok - ${label}\n`);
}

{
  assert.equal(Bridge.projectUpsert, undefined);
  assert.equal(Bridge.projectClosed, undefined);
  assert.equal(Bridge.limits().bodyBytes, undefined);
  pass("OMP-only bridge exposes no native notification projection");
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
    assert.equal(Bridge.take(queue).message.requestId, `focus-${index}`);
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
  const now = { id: "frame-a", version: 1, navigation: { kind: "opaque-focus", handle: handleA } };
  const next = { id: "frame-b", version: 1, navigation: { kind: "opaque-focus", handle: handleB } };
  const selection = PanelFocus.selectionFor(next);
  assert.deepEqual(selection, { frameId: "frame-b", handle: handleB });
  const reordered = PanelFocus.navigableFrames(next, [now], "");
  assert.equal(PanelFocus.findFrame(reordered, selection.frameId, selection.handle), next);
  assert.equal(PanelFocus.selectionIndex(reordered, selection.frameId, selection.handle), 0);
  assert.equal(PanelFocus.findFrame([now], selection.frameId, selection.handle), null);
  assert.equal(
    PanelFocus.findFrame(
      [{ ...next, navigation: { kind: "opaque-focus", handle: handleA } }],
      selection.frameId,
      selection.handle,
    ),
    null,
  );
  pass("panel selection survives reorder and never retargets removal or handle change");
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
