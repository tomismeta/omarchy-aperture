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
const releaseLedger = JSON.parse(
  await read(".github/aperture-worker-release-ledger.json"),
);
const buildInfo = JSON.parse(await read("BUILDINFO.json"));
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
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.keepLoaded, true);
assert.equal(Object.hasOwn(manifest, "activation"), false);
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
assert.equal(Object.hasOwn(policy, "schemaVersion"), false);
assert.equal(Object.hasOwn(policy, "provenanceHistory"), false);
assert.deepEqual(
  Object.keys(policy).sort(),
  [
    "apertureCommit",
    "approvedSourceTag",
    "artifactAcceptance",
    "artifactLimits",
    "artifactMode",
    "minimumNodeMajor",
    "minimumNodeVersion",
    "productionEligible",
    "release",
    "versions",
  ],
);
assert.equal(releaseLedger.releases[0].tag, policy.approvedSourceTag);
assert.equal(releaseLedger.releases[0].commit, policy.apertureCommit);
assert.equal(
  releaseLedger.releases[0].archiveSha256,
  policy.release.archive.sha256,
);
assert.equal(
  releaseLedger.releases[0].buildInfoSha256,
  policy.release.buildInfo.sha256,
);
assert.equal(
  new Set(releaseLedger.releases.map(entry => entry.tag)).size,
  releaseLedger.releases.length,
);
assert.equal(buildInfo.apertureSourceTag, policy.approvedSourceTag);
assert.equal(buildInfo.apertureCommit, policy.apertureCommit);
assert.equal(buildInfo.ompPackageVersion, policy.versions.ompIntegration);
assert.equal(buildInfo.trustedCi, true);

for (const required of [
  "The human-attention layer for an agentic operating system.",
  "Agent work runs in parallel. Human attention stays finite.",
  "with exact, fail-closed focus back to the right pane",
  "omarchy plugin add https://github.com/tomismeta/omarchy-aperture.git --enable",
  "~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp activate",
  "~/.config/omarchy/plugins/aperture/bin/omarchy-aperture-omp deactivate",
  "Focus OMP session",
  "NOW",
  "NEXT",
  "AMBIENT",
  "OMP-only",
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
  "fixtures/development/worker/worker-proof.mjs",
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

const launcher = await read("bin/aperture-attention-engine");
assert.match(launcher, /\.local\/share\/mise/);
assert.match(launcher, /mise_command=\/usr\/bin\/mise/);
assert.match(launcher, /installs\/node/);
assert.match(launcher, /env -u NODE_OPTIONS -u NODE_PATH/);
assert.equal(launcher.includes("command -v node"), false);
assert.equal(launcher.includes("node_modules"), false);
assert.equal(launcher.includes("--config"), false);

const verifier = await read("bin/omarchy-aperture-verify-payload");
assert.equal(verifier.includes("--allow-candidate"), false);
assert.equal(verifier.includes("legacy-release"), false);
assert.equal(verifier.includes("release-candidate"), false);
assert.match(verifier, /signed-tag release workflow policy is invalid/);
assert.match(verifier, /expected_fixture_count=15/);
assert.match(verifier, /expected_file_count=30/);
assert.match(verifier, /schemas\/omp-worker-output\.schema\.json/);
assert.equal(verifier.includes("notification-worker-input.schema.json"), false);
assert.equal(verifier.includes("notification-worker-output.schema.json"), false);
assert.equal(verifier.includes("status-event.json"), false);
assert.equal(verifier.includes("snapshot-status.json"), false);
assert.match(verifier, /required_current_protocol_version=4/);
assert.match(verifier, /ompWorkerOutputSchemaVersion == \$currentProtocolVersion/);
assert.match(verifier, /privateWorker: \{\s*protocolVersion: \$currentProtocolVersion/);
assert.match(verifier, /has\("stateMigration"\) \| not/);
assert.match(verifier, /obsolete OMP identity configuration remains installed/);
assert.match(
  vendorGate,
  /\.github\/aperture-worker-release-ledger\.json/,
);
assert.match(vendorGate, /return \{ policy, ledger: \{ releases: history \} \}/);
assert.equal(vendorGate.includes("provenanceHistory"), false);

assert.match(vendorGate, /schemas\/omp-worker-output\.schema\.json/);
assert.equal(vendorGate.includes("notification-worker-input.schema.json"), false);
assert.equal(vendorGate.includes("notification-worker-output.schema.json"), false);
assert.match(vendorGate, /requiredOmpWorkerOutputSchemaVersion = 4/);
assert.match(vendorGate, /requiredWorkerDirectProtocolVersion = 4/);
assert.match(vendorGate, /build\.files\?\.length, 30/);
assert.match(vendorGate, /Object\.hasOwn\(build, "stateMigration"\), false/);
for (const required of [
  "tagName,isDraft,isImmutable,isPrerelease,url,assets",
  'assert.equal(release.isImmutable, true',
  "source tag commit is not reachable from protected main",
  "Aperture Worker Release",
  "workflow attempt mismatch",
  "payload file count mismatch",
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
  "Catalog publication remains blocked",
]) {
  assert(pluginRelease.includes(required), `plugin distribution gate omits: ${required}`);
}
assert.equal(
  [...pluginRelease.matchAll(/\(\[\$archive, \(\$archive \+ "\.sha256"\)\] \| sort\)/g)].length,
  2,
);

await assert.rejects(() => access(path.join(root, "AttentionModel.qml")));

process.stdout.write(
  "ok - public documentation, signed payload, manifest, and runtime gates agree\n",
);
