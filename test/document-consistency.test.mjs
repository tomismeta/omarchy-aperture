import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFile(path.join(root, relative), "utf8");

const manifest = JSON.parse(await read("manifest.json"));
const policy = JSON.parse(await read("config/artifact-policy.json"));
const buildInfo = JSON.parse(await read("BUILDINFO.json"));
const report = JSON.parse(await read(policy.release.releaseReport.path));
const readme = await read("README.md");
const contributing = await read("CONTRIBUTING.md");

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
  "The attention surface for OMP on Omarchy.",
  "Stop babysitting OMP sessions.",
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
]) {
  await assert.rejects(
    () => access(path.join(root, internal)),
    undefined,
    `internal artifact remains in the public tree: ${internal}`,
  );
}

const developmentManifest = JSON.parse(
  await read("fixtures/development/manifest.json"),
);
assert.equal(developmentManifest.id, "aperture.fixtures");
assert.equal(developmentManifest.name, "Aperture Fixtures");

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

await assert.rejects(() => access(path.join(root, "AttentionModel.qml")));

process.stdout.write(
  "ok - public documentation, signed payload, manifest, and runtime gates agree\n",
);
