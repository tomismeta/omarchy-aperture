import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { isUtf8 } from "node:buffer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFile(path.join(root, relative), "utf8");
const execFileAsync = promisify(execFile);

const manifest = JSON.parse(await read("manifest.json"));
const policy = JSON.parse(await read("config/artifact-policy.json"));
const buildInfo = JSON.parse(await read("BUILDINFO.json"));
const report = JSON.parse(await read(policy.release.releaseReport.path));
const readme = await read("README.md");
const contributing = await read("CONTRIBUTING.md");
const vendorGate = await read(".github/scripts/vendor-aperture-worker-release.mjs");
const pluginReleaseCheck = await read(".github/workflows/plugin-release-check.yml");
const pluginRelease = await read(".github/workflows/plugin-release.yml");

const { stdout: trackedOutput } = await execFileAsync(
  "git",
  ["ls-files", "-z"],
  { cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
);
const trackedFiles = trackedOutput.split("\0").filter(Boolean);
const privateDataPatterns = [
  {
    label: "absolute operator home path",
    pattern: /\/(?:Users|home)\/[A-Za-z0-9._-]+(?:\/|\b)/,
  },
  {
    label: "operator SSH address",
    pattern: /\b[A-Za-z0-9._-]+@(?:\d{1,3}\.){3}\d{1,3}\b/,
  },
  {
    label: "Tailscale address",
    pattern: /\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])(?:\.\d{1,3}){2}\b/,
  },
];

for (const relative of trackedFiles) {
  let content;
  try {
    content = await readFile(path.join(root, relative));
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }
  if (!isUtf8(content)) continue;
  const text = content.toString("utf8");
  for (const { label, pattern } of privateDataPatterns) {
    assert.equal(
      pattern.test(text),
      false,
      `${relative} contains ${label}`,
    );
  }
}

assert.equal(manifest.id, "aperture");
assert.equal(manifest.name, "Aperture");
assert.equal(manifest.version, "0.1.0");
assert.equal(manifest.activation, "keep-loaded");
assert.equal(manifest.entryPoints.service, "Service.qml");
assert.equal(manifest.entryPoints.barWidget, "Panel.qml");
assert.equal(manifest.barWidget.defaultSection, "right");
assert.equal(manifest.barWidget.defaults.privacyMode, "false");
assert.equal(manifest.barWidget.defaults.ambientDisplay, "summary");
assert.equal(manifest.preview, "preview.png");
await access(path.join(root, manifest.preview));

assert.equal(policy.artifactAcceptance, "production");
assert.equal(policy.productionEligible, true);
assert.equal(policy.versions.ompIntegration, "0.1.0");
assert.equal(policy.minimumNodeMajor, 22);
assert.equal(policy.artifactLimits.maximumTextArtifactBytes, 524288);
assert.equal(buildInfo.apertureSourceTag, policy.approvedSourceTag);
assert.equal(buildInfo.apertureCommit, policy.apertureCommit);
assert.equal(buildInfo.ompPackageVersion, policy.versions.ompIntegration);
assert.equal(report.status, "passed");
assert.equal(report.signedTag, policy.approvedSourceTag);
assert.equal(report.signedTagCommit, policy.apertureCommit);
assert.deepEqual(report.attestationPolicy, policy.release.attestationPolicy);

for (const required of [
  "The human-attention layer for an agentic operating system.",
  "Agent work runs in parallel. Human attention stays finite.",
  "Typed OMP events become a clear `NOW`, `NEXT`, and `AMBIENT` attention view",
  "omarchy plugin add https://github.com/tomismeta/omarchy-aperture.git --enable",
  "~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp activate",
  "~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp deactivate",
  "Focus OMP session",
  "NOW",
  "NEXT",
  "AMBIENT",
  "OMP-only",
  policy.approvedSourceTag,
  policy.apertureCommit,
]) {
  assert(readme.includes(required), `README omits public contract: ${required}`);
}

for (const content of [readme, contributing]) {
  for (const internal of [
    "AGENTS.md",
    "HANDOFF.md",
    "COORDINATION.md",
    "PROTOCOL.md",
    "PROTOCOL_BASELINE",
    "acceptance/stock-aperture.json",
  ]) {
    assert.equal(
      content.includes(internal),
      false,
      `public documentation references internal artifact: ${internal}`,
    );
  }
}

for (const internal of [
  "AGENTS.md",
  "HANDOFF.md",
  "COORDINATION.md",
  "PROTOCOL.md",
  "PROTOCOL_BASELINE",
  "acceptance/stock-aperture.json",
  "docs/aperture-attention-mockups.html",
  "fixtures/development/manifest.json",
  "fixtures/development/worker/omp-real-proof.json",
]) {
  await assert.rejects(
    () => access(path.join(root, internal)),
    undefined,
    `internal artifact remains in the public tree: ${internal}`,
  );
}


const service = await read("Service.qml");
for (const forbidden of [
  "omarchy.notifications",
  "notificationObserved",
  "notificationUpdated",
  "notificationClosed",
  "observerGeneration",
]) {
  assert.equal(service.includes(forbidden), false, `Service.qml retained ${forbidden}`);
}

const bridge = await read("WorkerBridgeLogic.js");
for (const forbidden of [
  "projectUpsert",
  "projectClosed",
  "notification.observed",
  "notification.updated",
]) {
  assert.equal(
    bridge.includes(forbidden),
    false,
    `WorkerBridgeLogic.js retained ${forbidden}`,
  );
}

for (const relative of [
  "README.md",
  "CONTRIBUTING.md",
  "Panel.qml",
  "Service.qml",
  "bin/omarchy-aperture-pre-remove",
]) {
  assert.equal(
    (await read(relative)).includes("aperture.attention"),
    false,
    `${relative} retained the pre-release plugin id`,
  );
}

for (const relative of [
  "bin/aperture-attention-engine",
  "bin/omarchy-aperture-omp",
]) {
  assert(
    (await read(relative)).includes("--require-production"),
    `${relative} lacks the production gate`,
  );
}

for (const required of [
  "tagName,isDraft,isImmutable,isPrerelease,url,assets",
  'assert.equal(release.isImmutable, true',
  "source tag commit is not reachable from protected main",
]) {
  assert(vendorGate.includes(required), `vendor gate omits immutable trust check: ${required}`);
}

for (const required of [
  "node test/run.mjs",
  "bin/omarchy-aperture-verify-payload --require-production",
]) {
  assert(pluginReleaseCheck.includes(required), `release check omits gate: ${required}`);
  assert(pluginRelease.includes(required), `release workflow omits gate: ${required}`);
}

for (const required of [
  "omarchy-aperture-v*",
  "git merge-base --is-ancestor",
  'index("release-check")',
  "GITHUB_RUN_ATTEMPT",
  "environment:",
  "name: omarchy-aperture-release",
  "immutable-releases",
  ".isImmutable == true",
  'catalogPublication: "manual-separate-gate"',
]) {
  assert(pluginRelease.includes(required), `plugin distribution gate omits: ${required}`);
}

await assert.rejects(() => access(path.join(root, "AttentionModel.qml")));

process.stdout.write(
  "ok - public documentation, signed payload, manifest, and runtime gates agree\n",
);
