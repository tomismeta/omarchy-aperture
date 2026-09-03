import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, readdir, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const launcher = path.join(fixtureDir, "aperture-attention-engine");
const payloadDir = process.env.APERTURE_ATTENTION_DEV_PAYLOAD_DIR || "";
assert(path.isAbsolute(payloadDir), "APERTURE_ATTENTION_DEV_PAYLOAD_DIR must be an absolute path");

const buildInfo = JSON.parse(await readFile(path.join(payloadDir, "BUILDINFO.json"), "utf8"));
assert.equal(buildInfo.artifactType, "node-commonjs-bundle");
assert.equal(buildInfo.minimumNodeMajor, 22);
assert.equal(buildInfo.trustedCi, false, "development proof refuses to describe a local bundle as trusted");
assert.equal(buildInfo.apertureSourceTag, null);
assert.equal(buildInfo.provenanceAttestationReference, null);
assert.equal(buildInfo.integrations?.omp?.artifactType, "omp-extension-module");
assert.equal(buildInfo.integrations?.omp?.minimumOmpVersion, "18.0.0");
assert.equal(buildInfo.integrations?.omp?.proofId, "aperture-omp-adapter-conformance-v1");

const inputLineBytes = 64 * 1024;
const outputLineBytes = 256 * 1024;
const bodyBytes = 8 * 1024;
const urgencyNames = ["low", "normal", "critical"];
const closeReasons = ["unknown", "expired", "dismissed", "closed", "actioned"];

function containsControl(value) {
  return /[\u0000-\u001f\u007f]/.test(String(value));
}

function projectUpsert(type, snapshot) {
  assert(type === "notification.observed" || type === "notification.updated");
  const truncated = new Set(snapshot.truncatedFields || []);
  if (truncated.has("appName")) return null;

  const appName = String(snapshot.appName || "");
  const summary = String(snapshot.summary || "");
  if (!appName.trim() || containsControl(appName) || !summary.trim() || containsControl(summary)) {
    return null;
  }

  const application = { name: appName };
  const desktopEntry = String(snapshot.desktopEntry || "");
  if (desktopEntry && !truncated.has("desktopEntry") && !containsControl(desktopEntry)) {
    application.desktopEntry = desktopEntry;
  }
  const category = String(snapshot.hints?.category || "");
  if (category && !truncated.has("category") && !containsControl(category)) {
    application.category = category;
  }

  const body = String(snapshot.body || "");
  assert(Buffer.byteLength(body, "utf8") <= bodyBytes, "observer body exceeded 8192 UTF-8 bytes");
  const urgency = urgencyNames[Number(snapshot.urgency)];
  assert(urgency, "observer urgency was outside 0..2");
  const occurredAt = new Date(Number(snapshot.timestamp)).toISOString();

  return {
    type,
    key: String(snapshot.key),
    occurredAt,
    application,
    summary,
    body,
    urgency,
  };
}

function projectClosed(key, reason, timestamp) {
  return {
    type: "notification.closed",
    key: String(key),
    occurredAt: new Date(Number(timestamp)).toISOString(),
    reason: closeReasons[Number(reason)] || "unknown",
  };
}

function serializeInput(message) {
  const line = `${JSON.stringify(message)}\n`;
  assert(Buffer.byteLength(line, "utf8") <= inputLineBytes, "projected worker line exceeded 64 KiB");
  return line;
}

class DevelopmentWorkerOwner {
  constructor(environment) {
    this.environment = environment;
    this.child = null;
    this.startCount = 0;
  }

  start() {
    if (this.child && this.child.exitCode === null && this.child.signalCode === null) return this.child;
    this.child = spawn(launcher, [], {
      env: this.environment,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.startCount += 1;
    return this.child;
  }
}

async function runGeneration(owner, messages) {
  const child = owner.start();
  assert.equal(owner.start(), child, "one owner started more than one live worker");
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", chunk => stdout += chunk);
  child.stderr.on("data", chunk => stderr += chunk);
  for (const message of messages) child.stdin.write(serializeInput(message));
  child.stdin.end();
  const exit = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  assert.deepEqual(exit, { code: 0, signal: null }, `worker failed: ${stderr}`);
  assert.equal(stderr, "");
  const rawLines = stdout.split("\n").filter(Boolean);
  for (const line of rawLines) {
    assert(Buffer.byteLength(`${line}\n`, "utf8") <= outputLineBytes, "worker output exceeded 256 KiB");
  }
  return {
    pid: child.pid,
    messages: rawLines.map(line => JSON.parse(line)),
  };
}

async function filesUnder(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(candidate);
      else if (entry.isFile()) files.push(candidate);
    }
  }
  await walk(root);
  return files;
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "omarchy-aperture-worker-proof-"));
try {
  const configHome = path.join(temporaryRoot, "config");
  const stateHome = path.join(temporaryRoot, "state");
  const configDir = path.join(configHome, "omarchy", "aperture");
  await mkdir(configDir, { recursive: true });
  await mkdir(stateHome, { recursive: true });
  await writeFile(path.join(configDir, "config.json"), JSON.stringify({
    schemaVersion: 1,
    identities: [{
      id: "omp",
      kind: "omp",
      label: "OMP",
      applicationNames: ["aperture-omp"],
    }],
  }));

  const environment = {
    ...process.env,
    HOME: temporaryRoot,
    XDG_CONFIG_HOME: configHome,
    XDG_STATE_HOME: stateHome,
    APERTURE_ATTENTION_DEV_PAYLOAD_DIR: payloadDir,
  };
  const owner = new DevelopmentWorkerOwner(environment);
  const observedAt = Date.now();
  const observerBase = {
    key: "development-omp-generation:1",
    replacementId: 1,
    appName: "aperture-omp",
    desktopEntry: "",
    body: "😀".repeat(2048),
    urgency: 2,
    timestamp: observedAt,
    hints: { category: "", transient: false, resident: false },
    truncatedFields: [],
  };
  const observed = projectUpsert("notification.observed", {
    ...observerBase,
    summary: "OMP needs approval for bash",
  });
  const updated = projectUpsert("notification.updated", {
    ...observerBase,
    timestamp: observedAt + 1000,
    summary: "OMP needs your input",
    body: "OMP is waiting for an operator response.",
  });
  assert(observed && updated);
  assert.equal(projectUpsert("notification.observed", {
    ...observerBase,
    appName: "A".repeat(120),
    summary: "Must be dropped",
    truncatedFields: ["appName"],
  }), null, "truncated exact identity did not fail closed");

  const first = await runGeneration(owner, [observed, updated, { type: "shutdown" }]);
  const firstSnapshots = first.messages.filter(message => message.type === "snapshot");
  assert(first.messages.some(message => message.type === "hello"));
  assert(first.messages.some(message => message.type === "engine" && message.state === "ready"));
  assert(firstSnapshots.length >= 3);
  for (const snapshot of firstSnapshots) {
    assert.equal(snapshot.view.now, null);
    assert.deepEqual(snapshot.view.next, []);
    for (const frame of snapshot.view.ambient) {
      assert.equal(frame.tone, "ambient");
      assert.equal(frame.consequence, "low");
      assert.equal(frame.provenance, undefined);
    }
  }
  const activeViews = firstSnapshots.filter(snapshot => snapshot.view.ambient.length === 1);
  assert(activeViews.length >= 2);
  const observedFrame = activeViews.at(-2).view.ambient[0];
  const updatedFrame = activeViews.at(-1).view.ambient[0];
  assert.equal(observedFrame.title, "OMP needs approval for bash");
  assert.equal(updatedFrame.title, "OMP needs your input");
  assert.equal(updatedFrame.version, observedFrame.version + 1);
  assert.equal(updatedFrame.timing.createdAt, observedFrame.timing.createdAt);

  const stateFiles = await filesUnder(stateHome);
  for (const stateFile of stateFiles) {
    const stateText = await readFile(stateFile, "utf8");
    assert(!stateText.includes("OMP is waiting for an operator response."), "raw body entered persisted state");
    assert(!stateText.includes("😀"), "multibyte raw body entered persisted state");
  }

  const closed = projectClosed(observerBase.key, 0, observedAt + 2000);
  const second = await runGeneration(owner, [closed, { type: "shutdown" }]);
  assert.equal(owner.startCount, 2, "worker owner did not create exactly one process per generation");
  const secondSnapshots = second.messages.filter(message => message.type === "snapshot");
  const restored = secondSnapshots.find(snapshot => snapshot.view.ambient.length === 1);
  assert(restored, "worker did not restore the active notification");
  assert.deepEqual(restored.view, activeViews.at(-1).view, "replacement replay changed the public AttentionView");
  assert(secondSnapshots.some(snapshot => snapshot.view.ambient.length === 0), "close did not clear Ambient");

  console.log(JSON.stringify({
    artifactType: buildInfo.artifactType,
    apertureCommit: buildInfo.apertureCommit,
    trustedCi: buildInfo.trustedCi,
    bundle: buildInfo.workerBundle,
    ompIntegration: {
      path: buildInfo.integrations.omp.path,
      manifestPath: buildInfo.integrations.omp.manifestPath,
      bytes: buildInfo.integrations.omp.bytes,
      sha256: buildInfo.integrations.omp.sha256,
      minimumOmpVersion: buildInfo.integrations.omp.minimumOmpVersion,
      proofId: buildInfo.integrations.omp.proofId,
    },
    proofIds: {
      ambient: buildInfo.validation.ambientCeilingProofId,
      conformance: buildInfo.validation.conformanceProofId,
      ompAdapter: buildInfo.validation.ompAdapterProofId ?? buildInfo.integrations.omp.proofId,
    },
    projection: {
      observedLineBytes: Buffer.byteLength(serializeInput(observed), "utf8"),
      updateLineBytes: Buffer.byteLength(serializeInput(updated), "utf8"),
      bodyBytes: Buffer.byteLength(observed.body, "utf8"),
      truncatedIdentityDropped: true,
    },
    lifecycle: {
      starts: owner.startCount,
      firstPid: first.pid,
      secondPid: second.pid,
      cleanShutdowns: 2,
      deterministicReplacementReplay: true,
    },
    ambientCeiling: {
      nowAlwaysNull: true,
      nextAlwaysEmpty: true,
      ambientTone: "ambient",
      consequence: "low",
      whyNowOmitted: true,
    },
  }, null, 2));
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
