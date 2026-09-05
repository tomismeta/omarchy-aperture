import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Protocol = require("../WorkerOutputLogic.js");
const Fixtures = require("../fixtures/development/FixtureLogic.js");

async function json(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

function pass(label) {
  process.stdout.write(`ok - ${label}\n`);
}

const hello = await json("../fixtures/development/worker-output/hello.json");
const restoring = await json("../fixtures/development/worker-output/engine-restoring.json");
const ready = await json("../fixtures/development/worker-output/engine-ready.json");
const degraded = await json("../fixtures/development/worker-output/engine-degraded.json");
const error = await json("../fixtures/development/worker-output/error.json");
const now = await json("../fixtures/omp-direct/snapshot-now-next.json");
const ambient = structuredClone(now);
const ambientFrame = structuredClone(now.view.next[0]);
ambientFrame.tone = "ambient";
ambient.view = { now: null, next: [], ambient: [ambientFrame] };
ambient.totals = { now: 0, next: 0, ambient: 1, sources: 1 };

for (const message of [hello, restoring, ready, degraded, error]) {
  const result = Protocol.parse(JSON.stringify(message), message.type !== "hello", 0);
  assert.equal(result.ok, true, `${message.type} fixture must satisfy worker output protocol`);
}
pass("development worker-state fixtures pass WorkerOutputLogic");

const hierarchy = Fixtures.hierarchy(now, ambient);
const nextOnly = Fixtures.nextOnly(now, ambient);
const nonNavigableNow = Fixtures.nonNavigableNow(now, ambient);
const longText = Fixtures.longText(now, ambient);
const clipped = Fixtures.clipped(now, ambient);
const minimal = Fixtures.minimal(now);
for (const snapshot of [hierarchy, nextOnly, nonNavigableNow, longText, clipped, minimal]) {
  const result = Protocol.parse(JSON.stringify(snapshot), true, 0);
  assert.equal(result.ok, true, result.error);
}
assert.deepEqual(
  hierarchy.view.next.map((frame) => frame.title),
  [
    "Review the failed integration check",
    "Choose the rollout window",
    "Confirm the release notes",
  ],
);
assert.equal(
  hierarchy.view.ambient.every(
    (frame) => frame.navigation?.kind === "opaque-focus"),
  true,
);
assert.equal(nextOnly.view.now, null);
assert.equal(nextOnly.totals.now, 0);
assert.equal(nextOnly.totals.next, nextOnly.view.next.length);
assert.equal(nonNavigableNow.view.now.navigation, undefined);
assert.equal(nonNavigableNow.view.next.length, 0);
assert.equal(clipped.totals.next > clipped.view.next.length, true);
assert.equal(clipped.totals.ambient > clipped.view.ambient.length, true);
pass("presentation scenarios preserve declared order and valid clipped totals");
