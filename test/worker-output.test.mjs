import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Protocol = require("../WorkerOutputLogic.js");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const fixtureRoot = process.env.APERTURE_ATTENTION_DEV_PAYLOAD_DIR
  ? path.resolve(process.env.APERTURE_ATTENTION_DEV_PAYLOAD_DIR, "fixtures", "omp-direct")
  : path.resolve("fixtures/omp-direct");
const readFixture = name => JSON.parse(readFileSync(path.join(fixtureRoot, name), "utf8"));

function pass(label) {
  process.stdout.write(`ok - ${label}\n`);
}

const hello = {
  type: "hello",
  protocolVersion: 4,
  packageVersion: "0.10.0",
  worker: "aperture-attention-engine",
  capabilities: {
    notificationInput: false,
    ompDirectInput: true,
    snapshots: true,
    responses: false,
    focusActivation: true,
  },
};

const frame = {
  id: "frame-1",
  taskId: "task-1",
  interactionId: "interaction-1",
  version: 1,
  mode: "status",
  tone: "ambient",
  consequence: "low",
  title: "Approval resolved",
  summary: "The approval no longer needs attention.",
  source: { kind: "notification", label: "OMP" },
  context: {
    stage: "complete",
    progress: 1,
    items: [{ id: "project", label: "Project", value: "Aperture" }],
  },
  timing: {
    createdAt: "2026-02-02T02:40:00.123Z",
    updatedAt: "2026-02-02T02:40:01.123Z",
    expiresAt: "2026-02-02T02:45:00.123Z",
  },
};

function snapshot(overrides = {}) {
  return {
    type: "snapshot",
    sequence: 1,
    sources: [{ kind: "notification", label: "OMP" }],
    totals: { now: 0, next: 0, ambient: 1, sources: 1 },
    view: { now: null, next: [], ambient: [frame] },
    ...overrides,
  };
}

{
  const result = Protocol.parse(JSON.stringify(hello), false, 0);
  assert.equal(result.ok, true);
  assert.equal(result.kind, "hello");
  assert.equal(Protocol.parse(JSON.stringify({ ...hello, extra: true }), false, 0).code, "invalid_hello");
  assert.equal(Protocol.parse(JSON.stringify({ ...hello, worker: "other" }), false, 0).code, "invalid_hello");
  assert.equal(Protocol.parse(JSON.stringify({ ...hello, capabilities: { ...hello.capabilities, responses: true } }), false, 0).code, "invalid_hello");
  assert.equal(Protocol.parse(JSON.stringify({ ...hello, capabilities: { ...hello.capabilities, notificationInput: true } }), false, 0).code, "invalid_hello");
  assert.equal(Protocol.parse(JSON.stringify(hello), true, 0).code, "invalid_hello");
  assert.equal(Protocol.parse(JSON.stringify({ ...hello, constructor: "unexpected" }), false, 0).code, "invalid_hello");
  assert.equal(
    Protocol.parse(JSON.stringify({ ...hello, protocolVersion: 5 }), false, 0).code,
    "unsupported_protocol",
  );
  pass("worker handshake is exact and capability-gated");
}

{
  assert.equal(Protocol.parse("not-json", false, 0).code, "malformed_json");
  assert.equal(Protocol.parse("[]", false, 0).code, "invalid_message");
  assert.equal(Protocol.parse(JSON.stringify({ type: "engine", state: "ready", acceptedSources: 0 }), false, 0).code, "missing_hello");
  assert.equal(Protocol.parse(JSON.stringify({ type: "future" }), true, 0).code, "unknown_message");
  pass("framing and handshake order failures are explicit");
}

{
  for (const state of ["restoring", "ready", "degraded"]) {
    const result = Protocol.parse(JSON.stringify({ type: "engine", state, acceptedSources: 2 }), true, 0);
    assert.equal(result.ok, true);
    assert.equal(result.kind, "engine");
  }
  assert.equal(Protocol.parse(JSON.stringify({ type: "engine", state: "ready", acceptedSources: -1 }), true, 0).code, "invalid_engine");
  assert.equal(Protocol.parse(JSON.stringify({ type: "engine", state: "future", acceptedSources: 0 }), true, 0).code, "invalid_engine");
  pass("engine lifecycle states and counts are bounded");
}

{
  const result = Protocol.parse(JSON.stringify(snapshot()), true, 0);
  assert.equal(result.ok, true);
  assert.equal(result.kind, "snapshot");
  assert.equal(result.message.view.now, null);
  assert.equal(result.message.view.next.length, 0);
  assert.equal(result.message.view.ambient[0].tone, "ambient");
  assert.equal(Protocol.parse(JSON.stringify(snapshot()), true, 1).code, "invalid_snapshot");
  assert.equal(Protocol.parse(JSON.stringify(snapshot({ sequence: 0 })), true, 0).code, "invalid_snapshot");
  pass("complete Ambient-only snapshots and monotonic ordering pass unchanged");
}

{
  const badTotals = snapshot({ totals: { now: 1, next: 0, ambient: 1, sources: 1 } });
  const badSources = snapshot({ totals: { now: 0, next: 0, ambient: 1, sources: 0 } });
  const badExtra = snapshot({ arbitraryMetadata: { secret: true } });
  const badFrame = snapshot({ view: { now: null, next: [], ambient: [{ ...frame, title: "x".repeat(201) }] } });
  const badDate = snapshot({ view: { now: null, next: [], ambient: [{ ...frame, timing: { ...frame.timing, createdAt: "not-a-date" } }] } });
  const badDateFormat = snapshot({ view: { now: null, next: [], ambient: [{ ...frame, timing: { ...frame.timing, createdAt: "2026-02-02" } }] } });
  const badCalendarDate = snapshot({ view: { now: null, next: [], ambient: [{ ...frame, timing: { ...frame.timing, createdAt: "2026-02-30T02:40:00Z" } }] } });
  for (const value of [badTotals, badSources, badExtra, badFrame, badDate, badDateFormat, badCalendarDate])
    assert.equal(Protocol.parse(JSON.stringify(value), true, 0).code, "invalid_snapshot");
  const leapDay = snapshot({ view: { now: null, next: [], ambient: [{ ...frame, timing: { ...frame.timing, createdAt: "2028-02-29T02:40:00Z" } }] } });
  assert.equal(Protocol.parse(JSON.stringify(leapDay), true, 0).ok, true);
  pass("snapshot totals, unknown metadata, text bounds, and timestamps fail closed");
}

{
  const clippedSources = snapshot({
    totals: { now: 0, next: 0, ambient: 1, sources: 4 },
  });
  assert.equal(Protocol.parse(JSON.stringify(clippedSources), true, 0).ok, true);
  pass("canonical source totals may exceed the bounded visible source prefix");
}

{
  const recoverable = Protocol.parse(JSON.stringify({
    type: "error",
    code: "ledger_recovered",
    message: "A corrupt ledger was replaced.",
    recoverable: true,
  }), true, 0);
  assert.equal(recoverable.ok, true);
  assert.equal(recoverable.kind, "error");
  assert.equal(Protocol.parse(JSON.stringify({
    type: "error",
    code: "",
    message: "bad",
    recoverable: true,
  }), true, 0).code, "invalid_error");
  pass("bounded worker errors remain protocol data");
}

{
  const handle = "AbCdEfGhIjKlMnOpQrStUvWxYz_12345";
  for (const resultName of ["focused", "stale", "missing"]) {
    const result = Protocol.parse(JSON.stringify({
      type: "focus.result",
      requestId: "focus-1-7",
      result: resultName,
    }), true, 0);
    assert.equal(result.ok, true);
    assert.equal(result.kind, "focus");
  }
  for (const message of [
    { type: "focus.result", requestId: "", result: "focused" },
    { type: "focus.result", requestId: "   ", result: "focused" },
    { type: "focus.result", requestId: "x".repeat(161), result: "focused" },
    { type: "focus.result", requestId: "bad\nrequest", result: "focused" },
    { type: "focus.result", requestId: "focus-1-7", result: "future" },
    { type: "focus.result", requestId: "focus-1-7", result: "focused", handle },
  ]) assert.equal(Protocol.parse(JSON.stringify(message), true, 0).code, "invalid_focus_result");
  pass("focus results are exact bounded protocol data");
}

{
  const nowNext = readFixture("snapshot-now-next.json");
  const result = Protocol.parse(JSON.stringify(nowNext), true, 0);
  assert.equal(result.ok, true);
  assert.equal(result.message.view.now.title, "OMP needs approval for bash");
  assert.equal(result.message.view.now.navigation.kind, "opaque-focus");
  assert.equal(result.message.view.next.length, 1);
  assert.equal(result.message.view.next[0].title, "OMP needs your input");
  assert.equal(
    result.message.view.next[0].navigation.handle,
    "A23456789_-bcdefghijklmnopqrstuv",
  );
  pass("trusted direct fixture carries canonical NOW, NEXT, and navigation");
}

{
  const resolved = readFixture("snapshot-resolved.json");
  const failure = readFixture("snapshot-failure.json");
  const completion = readFixture("snapshot-completion.json");
  const completionResolved = readFixture("snapshot-completion-resolved.json");
  assert.equal(Protocol.parse(JSON.stringify(resolved), true, 0).ok, true);
  assert.equal(resolved.view.now.title, "OMP needs your input");
  assert.equal(resolved.view.next.length, 0);
  assert.equal(Protocol.parse(JSON.stringify(failure), true, 0).ok, true);
  assert.equal(failure.view.now.title, "OMP bash failed");
  assert.equal(Protocol.parse(JSON.stringify(completion), true, 0).ok, true);
  assert.equal(completion.view.now.title, "OMP completed a turn");
  assert.equal(completion.view.now.tone, "focused");
  assert.equal(completion.view.now.navigation.kind, "opaque-focus");
  assert.match(completion.view.now.navigation.handle, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(completion.view.next.length, 0);
  assert.equal(completion.view.ambient.length, 0);
  assert.equal(Protocol.parse(JSON.stringify(completionResolved), true, 0).ok, true);
  assert.equal(completionResolved.view.now, null);
  assert.deepEqual(completionResolved.view.next, []);
  assert.deepEqual(completionResolved.view.ambient, []);
  pass("trusted doctrine fixtures preserve resolution, failure, and completion");
}

{
  assert.equal(Protocol.validNavigation({
    kind: "opaque-focus",
    handle: "AbCdEfGhIjKlMnOpQrStUvWxYz_12345",
  }), true);
  for (const navigation of [
    { kind: "future", handle: "AbCdEfGhIjKlMnOpQrStUvWxYz_12345" },
    { kind: "opaque-focus", handle: "" },
    { kind: "opaque-focus", handle: "x".repeat(31) },
    { kind: "opaque-focus", handle: "x".repeat(33) },
    { kind: "opaque-focus", handle: "invalid+focus+handle+0000000000" },
    { kind: "opaque-focus", handle: "AbCdEfGhIjKlMnOpQrStUvWxYz_12345", extra: true },
  ]) assert.equal(Protocol.validNavigation(navigation), false);
  pass("navigation validation rejects unsupported or malformed focus handles");
}

{
  for (const name of [
    "approval-request.json",
    "input-request.json",
    "failure-event.json",
    "completion-event.json",
    "completion-resolved-event.json",
  ]) {
    const event = readFixture(name);
    assert.equal(event.schemaVersion, 4);
    assert.equal(typeof event.type, "string");
    assert.deepEqual(event.session, {
      label: "omarchy-aperture",
      facets: [{ id: "branch", label: "Branch", value: "main" }],
    });
  }
  pass("all trusted direct input event fixtures carry bounded session presentation");
}


{
  const registrations = [
    ["focus-registration.json", "herdr"],
    ["focus-registration-direct-terminal.json", "direct-terminal"],
    ["focus-registration-tmux.json", "tmux"],
  ].map(([name, kind]) => {
    const registration = readFixture(name);
    assert.equal(registration.schemaVersion, 4);
    assert.equal(registration.type, "focus.register");
    assert.equal(registration.target.kind, kind);
    return registration;
  });
  const registration = registrations[0];
  const activation = readFixture("focus-activation.json");
  const result = readFixture("focus-result.json");
  assert.equal(Protocol.validNavigation({
    kind: "opaque-focus",
    handle: registration.publicHandle,
  }), true);
  assert.deepEqual(Object.keys(activation).sort(), ["handle", "requestId", "type"]);
  assert.equal(activation.type, "focus.activate");
  assert.match(activation.handle, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(Protocol.parse(JSON.stringify(result), true, 0).kind, "focus");
  pass("canonical focus registration activation and result fixtures are consumable");
}
