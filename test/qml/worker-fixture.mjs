#!/usr/bin/env node
import { appendFileSync, existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";

if (process.argv.includes("--cleanup-owned-socket")) process.exit(0);
const root = dirname(dirname(process.argv[1]));
const scenario = basename(root);
const marker = join(root, "started");
const first = !existsSync(marker);
appendFileSync(marker, `${process.pid}\n`);
const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const hello = { type: "hello", protocolVersion: 4, packageVersion: "0.1.0", worker: "aperture-attention-engine", capabilities: { notificationInput: false, ompDirectInput: true, snapshots: true, responses: false, focusActivation: true } };
const ready = { type: "engine", state: "ready", acceptedSources: 0 };
const snapshot = { type: "snapshot", sequence: 1, sources: [], totals: { now: 0, next: 0, ambient: 0, sources: 0 }, view: { now: null, next: [], ambient: [] } };
let failing = first && scenario !== "readiness";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  if (!failing && chunk.includes('"shutdown"')) process.exit(0);
});
process.stdin.on("end", () => { if (!failing) process.exit(0); });

emit(hello);
if (!failing) {
  emit({ type: "engine", state: "restoring", acceptedSources: 0 });
  emit(snapshot);
  setTimeout(() => emit(ready), 500);
} else {
  setTimeout(() => {
    if (scenario === "exit74") process.stdout.write('{"type":');
    else if (scenario !== "exit75") {
      emit({ type: "error", code: "direct_transport_unavailable", message: `fixture ${scenario} diagnostic`, recoverable: scenario === "contention" });
      // Same-chunk trailing output must not revive a terminal generation.
      emit(ready);
      emit(snapshot);
    }
    setTimeout(() => process.exit(scenario === "contention" || scenario === "exit75" || scenario === "fatal-exit75" ? 75 : 74), 350);
  }, 200);
}
