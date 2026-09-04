import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceBin = path.join(repoRoot, "bin");
const sourcePolicy = JSON.parse(
  await readFile(path.join(repoRoot, "config", "artifact-policy.json"), "utf8"),
);
const pluginId = "@tomismeta/aperture-omp";
const approvedTag = "aperture-worker-v9.9.9";
const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), "omarchy-aperture-package-test-"),
);
const fixtureContract = {
  identityConfig: {
    path: "config/identities.json",
    schemaVersion: 1,
    identities: [
      {
        id: "omp",
        kind: "omp",
        label: "OMP",
        applicationNames: ["aperture-omp"],
      },
    ],
  },
  worker: {
    path: "lib/aperture-attention-engine.cjs",
    conformanceProofId: "aperture-omp-only-worker-conformance-v1",
    directTransportProofId: "aperture-omp-direct-transport-conformance-v1",
    directPrivacyProofId: "aperture-omp-direct-privacy-v1",
    navigationProofId: "aperture-opaque-focus-navigation-v4",
  },
  omp: {
    path: "integrations/omp/aperture-omp-extension.mjs",
    manifestPath: "integrations/omp/package.json",
    minimumVersion: "18.0.0",
    proofId: "aperture-omp-adapter-conformance-v1",
    hostProofId: "aperture-omp-host-direct-compatibility-v1",
  },
  schemas: {
    notificationInputVersion: 2,
    notificationOutputVersion: 4,
    surfaceProtocolVersion: 4,
    ompAttentionEventVersion: 2,
    workerDirectProtocolVersion: 4,
  },
  state: {
    migrationSources: [1, 2],
    directSchemaVersion: 3,
    causalTombstones: ["interaction-resolution", "session-shutdown"],
  },
  focus: {
    attentionAcknowledgementTimeoutMs: 1000,
    shutdownTimeoutMs: 3000,
    maximumDirectClients: 32,
    maximumDirectReceipts: 1024,
    maximumAmbiguousDeliveryAttempts: 3,
    nativeFallbackPolicy: "definite-pre-write-only",
    maximumQueuedFocusOperations: 64,
    maximumActiveRegistrations: 128,
    maximumLeaseMembers: 32,
    maximumPendingQmlFocusRequests: 16,
    maximumFocusReplayEvents: 64,
    focusReplayAcknowledgementTimeoutMs: 750,
    maximumConcurrentFocusReplays: 1,
    herdrProtocol: "raw-ndjson-0.8.2",
    compositorExecutable: "/usr/bin/hyprctl",
    activationResults: ["focused", "stale", "missing"],
    titleOwnership: "tmux-cas-herdr-retain-no-conditional-clear",
    herdrTitleRelease: "retained-no-conditional-clear",
    workerGeneration: "volatile-per-worker",
    clientPolicy: "backend-scoped-single-client-admission",
    persistence: "volatile-only",
    backends: ["herdr-0.8.2", "foot-1.27", "tmux-3.7c"],
  },
};

function digest(content) {
  return createHash("sha256").update(content).digest("hex");
}

function pass(label) {
  process.stdout.write(`ok - ${label}\n`);
}

async function writeExecutable(file, content) {
  await writeFile(file, content, "utf8");
  await chmod(file, 0o755);
}

async function createFakeCommands(root) {
  const bin = path.join(root, "fake-bin");
  await mkdir(bin, { recursive: true });
  const node = process.execPath;
  await writeExecutable(
    path.join(bin, "omp"),
    `#!${node}\n${String.raw`
const fs = require("node:fs");
const path = require("node:path");
const id = "@tomismeta/aperture-omp";
const args = process.argv.slice(2);
if (process.env.FAKE_OMP_LOG) fs.appendFileSync(process.env.FAKE_OMP_LOG, JSON.stringify({ args, cwd: process.cwd() }) + "\n");
if (args[0] === "--version") { console.log("omp/18.0.11"); process.exit(0); }
if (args[0] !== "plugin") process.exit(2);
const action = args[1];
if (action === "install" || action === "uninstall") process.exit(97);
const root = process.env.XDG_DATA_HOME ? path.join(process.env.XDG_DATA_HOME, "omp", "plugins") : path.join(process.env.HOME, ".omp", "plugins");
const packagePath = path.join(root, "node_modules", "@tomismeta", "aperture-omp");
const lockPath = path.join(root, "omp-plugins.lock.json");
const readLock = () => fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, "utf8")) : { plugins: {}, settings: {} };
const writeLock = value => { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(lockPath, JSON.stringify(value, null, 2) + "\n", { mode: 0o640 }); };
if (action === "link") {
  const target = path.resolve(args[2]);
  fs.mkdirSync(path.dirname(packagePath), { recursive: true });
  if (!fs.existsSync(packagePath)) fs.symlinkSync(target, packagePath);
  const lock = readLock();
  lock.plugins[id] = { version: "0.1.0", enabledFeatures: null, enabled: true };
  lock.settings[id] = { fixture: true };
  writeLock(lock);
  console.log("linked");
  process.exit(0);
}
if (action === "enable" || action === "disable") {
  const lock = readLock();
  if (!lock.plugins[id]) process.exit(3);
  lock.plugins[id].enabled = action === "enable";
  writeLock(lock);
  console.log(action + "d");
  process.exit(0);
}
if (action === "list") {
  const lock = readLock();
  const npm = fs.existsSync(packagePath) && lock.plugins[id] ? [{ name: id, version: "0.1.0", path: packagePath, manifest: { extensions: ["./aperture-omp-extension.mjs"], version: "0.1.0" }, enabledFeatures: null, enabled: process.env.FAKE_LIST_FORCE_DISABLED === "1" ? false : lock.plugins[id].enabled === true }] : [];
  console.log(JSON.stringify({ npm, marketplace: [] }));
  process.exit(0);
}
process.exit(4);
`}`,
  );
  await writeExecutable(
    path.join(bin, "omarchy-shell"),
    `#!${node}
${String.raw`
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const state = path.join(process.env.HOME, ".fake-attention-service-stopped");
if (process.env.FAKE_SHELL_LOG)
  fs.appendFileSync(process.env.FAKE_SHELL_LOG, JSON.stringify({ args, cwd: process.cwd() }) + "\n");
if (args[0] !== "aperture.worker") process.exit(2);
if (args[1] === "shutdown") {
  if (process.env.FAIL_SERVICE_SHUTDOWN === "1") process.exit(3);
  fs.writeFileSync(state, "stopped\n");
}
if (args[1] === "resume") {
  if (process.env.FAIL_SERVICE_RESUME === "1") process.exit(3);
  if (fs.existsSync(state)) fs.unlinkSync(state);
}
if (args[1] === "status" || args[1] === "shutdown" || args[1] === "resume") {
  const stopped = fs.existsSync(state);
  console.log(JSON.stringify({
    processReferenceCount: stopped ? 0 : 1,
    activeProcessCount: stopped ? 0 : 1,
    activeTimerCount: stopped ? 0 : 1,
    pendingInputCount: 0,
    pendingFocusRequestCount: 0,
    shutdownRequested: stopped,
  }));
  process.exit(0);
}
process.exit(4);
`}`,
  );
  await writeExecutable(
    path.join(bin, "realpath"),
    `#!${node}\n${String.raw`
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2).filter(value => value !== "-e");
const candidate = path.resolve(args[0]);
if (!fs.existsSync(candidate)) process.exit(1);
console.log(fs.realpathSync(candidate));
`}`,
  );
  await writeExecutable(
    path.join(bin, "stat"),
    `#!${node}\n${String.raw`
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] !== "-c" || args[1] !== "%a") process.exit(2);
console.log((fs.statSync(args[2]).mode & 0o777).toString(8));
`}`,
  );
  await writeExecutable(
    path.join(bin, "mv"),
    `#!${node}\n${String.raw`
const fs = require("node:fs");
const args = process.argv.slice(2).filter(value => value !== "-T" && value !== "-f" && value !== "-Tf" && value !== "--");
if (process.env.FAIL_LOCK_MV === "1") process.exit(1);
fs.renameSync(args[0], args[1]);
`}`,
  );
  return bin;
}

async function createPluginFixture(root, approved = true) {
  for (const directory of [
    "bin",
    "config",
    "lib",
    "integrations/omp",
    "schemas",
    "evidence",
    "fixtures/omp-direct",
    "release",
  ])
    await mkdir(path.join(root, directory), { recursive: true });
  for (const command of [
    "aperture-attention-engine",
    "omarchy-aperture-omp",
    "omarchy-aperture-pre-remove",
    "omarchy-aperture-verify-payload",
  ]) {
    await copyFile(
      path.join(sourceBin, command),
      path.join(root, "bin", command),
    );
    await chmod(path.join(root, "bin", command), 0o755);
  }

  const worker = Buffer.from(`"use strict";
const fs = require("node:fs");
const path = require("node:path");
if (process.argv.includes("--cleanup-owned-socket")) {
  if (process.env.FAKE_CLEANUP_LOG) fs.appendFileSync(process.env.FAKE_CLEANUP_LOG, "cleanup\\n");
  const transientOnce = process.env.FAKE_CLEANUP_TRANSIENT_ONCE;
  if (transientOnce && !fs.existsSync(transientOnce)) {
    fs.writeFileSync(transientOnce, "transient\\n");
    process.exit(75);
  }
  const exitCode = Number(process.env.FAKE_CLEANUP_EXIT || 0);
  if (exitCode !== 0) process.exit(exitCode);
  const runtimeRoot = process.env.XDG_RUNTIME_DIR;
  if (runtimeRoot && path.isAbsolute(runtimeRoot)) {
    const socketDirectory = path.join(runtimeRoot, "omarchy", "aperture");
    fs.rmSync(path.join(socketDirectory, "attention.sock"), { force: true });
    fs.rmSync(path.join(socketDirectory, ".attention.sock.lifecycle.lock"), { force: true });
  }
  process.exit(0);
}
if (process.argv[2] !== "--config"
    || !String(process.argv[3] || "").endsWith("/config/identities.json")) process.exit(3);
process.stdout.write(JSON.stringify({
  type: "hello",
  protocolVersion: 4,
  packageVersion: "0.10.0",
  worker: "aperture-attention-engine",
  capabilities: { notificationInput: false, ompDirectInput: true, snapshots: true, responses: false, focusActivation: true }
}) + "\\n");
let buffered = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buffered += chunk;
  let newline;
  while ((newline = buffered.indexOf("\\n")) !== -1) {
    const line = buffered.slice(0, newline);
    buffered = buffered.slice(newline + 1);
    if (JSON.parse(line).type === "shutdown") process.exit(0);
  }
});
process.stdin.on("end", () => process.exit(2));
`);
  const extension = Buffer.from("trusted OMP extension fixture\n");
  await writeFile(
    path.join(root, "lib", "aperture-attention-engine.cjs"),
    worker,
  );
  await writeFile(
    path.join(root, "integrations", "omp", "aperture-omp-extension.mjs"),
    extension,
  );
  await writeFile(
    path.join(root, "integrations", "omp", "package.json"),
    JSON.stringify(
      {
        name: pluginId,
        version: "0.1.0",
        private: true,
        type: "module",
        omp: { extensions: ["./aperture-omp-extension.mjs"] },
      },
      null,
      2,
    ) + "\n",
  );

  const schemaPaths = {
    input: "schemas/notification-worker-input.schema.json",
    output: "schemas/notification-worker-output.schema.json",
    surface: "schemas/surface-protocol.schema.json",
    ompAttentionEvent: "schemas/omp-attention-event.schema.json",
    workerDirectMessage: "schemas/worker-direct-message.schema.json",
  };
  const evidencePaths = [
    "evidence/direct-node-22.0.0.json",
    "evidence/direct-node-24.0.0.json",
    "evidence/direct-node-26.0.0.json",
    "evidence/direct-privacy.json",
    "evidence/direct-transport.json",
    "evidence/focus-backends.json",
    "evidence/node-22.0.0.json",
    "evidence/node-24.0.0.json",
    "evidence/node-26.0.0.json",
    "evidence/omp-adapter.json",
    "evidence/omp-host-matrix.json",
    "evidence/omp-only-worker.json",
    "evidence/omp-runtime-imports.json",
    "evidence/runtime-imports.json",
  ];
  const fixturePaths = [
    "fixtures/omp-direct/approval-request.json",
    "fixtures/omp-direct/input-request.json",
    "fixtures/omp-direct/failure-event.json",
    "fixtures/omp-direct/completion-event.json",
    "fixtures/omp-direct/status-event.json",
    "fixtures/omp-direct/focus-registration.json",
    "fixtures/omp-direct/focus-registration-direct-terminal.json",
    "fixtures/omp-direct/focus-registration-tmux.json",
    "fixtures/omp-direct/focus-activation.json",
    "fixtures/omp-direct/focus-result.json",
    "fixtures/omp-direct/snapshot-now-next.json",
    "fixtures/omp-direct/snapshot-resolved.json",
    "fixtures/omp-direct/snapshot-failure.json",
    "fixtures/omp-direct/snapshot-completion.json",
    "fixtures/omp-direct/snapshot-status.json",
  ];
  for (const relative of Object.values(schemaPaths))
    await writeFile(path.join(root, relative), "{}\n");
  for (const relative of [...evidencePaths, ...fixturePaths])
    await writeFile(
      path.join(root, relative),
      JSON.stringify({ status: "passed" }) + "\n",
    );

  const policy = structuredClone(sourcePolicy);
  policy.artifactAcceptance = approved ? "production" : "rejected";
  policy.productionEligible = approved;
  policy.approvedSourceTag = approvedTag;
  if (approved) delete policy.rejection;
  const fixturePayloadAttestation =
    "https://github.com/tomismeta/aperture/attestations/1";
  policy.release.immutable = true;
  policy.release.attestationReferencesBound = true;
  policy.release.url = `https://github.com/tomismeta/aperture/releases/tag/${approvedTag}`;
  policy.release.archive = {
    name: `${approvedTag}.tar.gz`,
    bytes: 1,
    sha256: "a".repeat(64),
  };
  policy.release.payloadAttestationReference = fixturePayloadAttestation;
  policy.release.archiveAttestationReference =
    "https://github.com/tomismeta/aperture/attestations/2";
  policy.release.workflowChain = {
    releaseCheck: { runId: "11", runAttempt: "1", conclusion: "success" },
    workerArtifact: { runId: "12", runAttempt: "1", conclusion: "success" },
    directRelease: { runId: "13", runAttempt: "1", conclusion: "success" },
    evidenceFinalizer: { runId: "14", runAttempt: "1", conclusion: "success" },
  };
  const releaseSigner =
    "tomismeta/aperture/.github/workflows/aperture-worker-direct-release.yml";
  const reportSigner =
    "tomismeta/aperture/.github/workflows/aperture-worker-release-evidence.yml";
  policy.release.attestationPolicy = {
    sourceRef: `refs/tags/${approvedTag}`,
    sourceDigest: policy.apertureCommit,
    payloadSignerWorkflow: releaseSigner,
    buildInfoSignerWorkflow: releaseSigner,
    archiveSignerWorkflow: releaseSigner,
    releaseReportSignerWorkflow: reportSigner,
  };
  await writeFile(
    path.join(root, fixtureContract.identityConfig.path),
    JSON.stringify(
      {
        schemaVersion: fixtureContract.identityConfig.schemaVersion,
        identities: fixtureContract.identityConfig.identities,
      },
      null,
      2,
    ) + "\n",
  );

  const relativeFiles = [
    fixtureContract.identityConfig.path,
    ...evidencePaths,
    ...fixturePaths,
    fixtureContract.omp.path,
    fixtureContract.omp.manifestPath,
    fixtureContract.worker.path,
    ...Object.values(schemaPaths),
  ].sort();
  assert.equal(relativeFiles.length, 38);
  const files = await Promise.all(
    relativeFiles.map(async (relative) => {
      const content = await readFile(path.join(root, relative));
      return {
        path: relative,
        sha256: digest(content),
        bytes: content.length,
        mode: "0644",
      };
    }),
  );
  const fileFor = (relative) => files.find((file) => file.path === relative);
  const buildInfo = {
    schemaVersion: 1,
    artifactType: "node-commonjs-bundle",
    artifactMode: "omp-only",
    worker: "aperture-attention-engine",
    minimumNodeVersion: policy.minimumNodeVersion,
    minimumNodeMajor: policy.minimumNodeMajor,
    trustedCi: true,
    sourceDirty: false,
    payloadProfile: "release",
    apertureCommit: policy.apertureCommit,
    apertureSourceTag: approvedTag,
    releaseSeries: approvedTag.slice(0, approvedTag.lastIndexOf(".")),
    aperturePackageVersion: policy.versions.aperture,
    apertureCoreVersion: policy.versions.apertureCore,
    ompPackageVersion: policy.versions.ompIntegration,
    artifactLimits: { maximumTextArtifactBytes: 524288 },
    builtAt: "2026-09-01T00:00:00.000Z",
    ci: {
      workflowRef: `tomismeta/aperture/.github/workflows/aperture-worker-artifact.yml@refs/tags/${approvedTag}`,
      runId: policy.release.workflowChain.workerArtifact.runId,
      runAttempt: 1,
    },
    provenanceAttestationReference: fixturePayloadAttestation,
    workerBundle: {
      path: fixtureContract.worker.path,
      bytes: worker.length,
      sha256: digest(worker),
    },
    workerContract: {
      notificationInput: false,
      notificationInputSchemaVersion:
        fixtureContract.schemas.notificationInputVersion,
      notificationOutputSchemaVersion:
        fixtureContract.schemas.notificationOutputVersion,
      surfaceProtocolVersion: fixtureContract.schemas.surfaceProtocolVersion,
      ompAttentionEventSchemaVersion:
        fixtureContract.schemas.ompAttentionEventVersion,
      workerDirectProtocolVersion:
        fixtureContract.schemas.workerDirectProtocolVersion,
      jsonlHandshakes: {
        privateWorker: {
          protocolVersion: 4,
          peer: "aperture-attention-engine",
          framing: "jsonl",
          outputEncoding: "ascii-json-escapes",
          maximumLineBytes: 262144,
          navigation: "validated-opaque-focus-only",
        },
        publicSurface: {
          protocolVersion: 4,
          peer: "aperture-stdio",
          framing: "jsonl",
          outputEncoding: "ascii-json-escapes",
          maximumLineBytes: 262144,
          navigation: "absent",
        },
      },
    },
    stateMigration: {
      ompDirect: {
        fromSchemaVersions: fixtureContract.state.migrationSources,
        toSchemaVersion: fixtureContract.state.directSchemaVersion,
        navigationAfterMigration: "absent-until-live-registration",
        causalTombstones: fixtureContract.state.causalTombstones,
      },
      legacyNotificationState: "removed-without-restore",
    },
    schemas: {
      input: {
        version: fixtureContract.schemas.notificationInputVersion,
        path: schemaPaths.input,
        sha256: fileFor(schemaPaths.input).sha256,
      },
      output: {
        version: fixtureContract.schemas.notificationOutputVersion,
        path: schemaPaths.output,
        sha256: fileFor(schemaPaths.output).sha256,
      },
      surface: {
        version: fixtureContract.schemas.surfaceProtocolVersion,
        path: schemaPaths.surface,
        sha256: fileFor(schemaPaths.surface).sha256,
      },
      ompAttentionEvent: {
        version: fixtureContract.schemas.ompAttentionEventVersion,
        path: schemaPaths.ompAttentionEvent,
        sha256: fileFor(schemaPaths.ompAttentionEvent).sha256,
      },
      workerDirectMessage: {
        version: fixtureContract.schemas.workerDirectProtocolVersion,
        path: schemaPaths.workerDirectMessage,
        sha256: fileFor(schemaPaths.workerDirectMessage).sha256,
      },
    },
    fixtures: { ompDirect: { version: 4, paths: fixturePaths } },
    files,
    runtimeDependencies: {
      policy: "node-builtins-only",
      status: "passed",
      evidencePath: "evidence/runtime-imports.json",
      evidenceSha256: fileFor("evidence/runtime-imports.json").sha256,
    },
    integrations: {
      omp: {
        artifactType: "omp-extension-module",
        path: fixtureContract.omp.path,
        manifestPath: fixtureContract.omp.manifestPath,
        packageVersion: "0.1.0",
        bytes: extension.length,
        sha256: digest(extension),
        minimumOmpVersion: fixtureContract.omp.minimumVersion,
        proofId: fixtureContract.omp.proofId,
        runtimeDependencies: {
          policy: "node-builtins-only",
          status: "passed",
          evidencePath: "evidence/omp-runtime-imports.json",
          evidenceSha256: fileFor("evidence/omp-runtime-imports.json").sha256,
        },
        validation: {
          status: "passed",
          proofId: fixtureContract.omp.proofId,
          reportPath: "evidence/omp-adapter.json",
          reportSha256: fileFor("evidence/omp-adapter.json").sha256,
        },
        hostCompatibility: {
          status: "passed",
          proofId: fixtureContract.omp.hostProofId,
          versions: ["18.0.11", "18.1.2"],
        },
      },
    },
    validation: {
      status: "passed",
      conformanceProofId: fixtureContract.worker.conformanceProofId,
      ompOnlyReport: "evidence/omp-only-worker.json",
      ompAdapterProofId: fixtureContract.omp.proofId,
      directTransportProofId: fixtureContract.worker.directTransportProofId,
      directPrivacyProofId: fixtureContract.worker.directPrivacyProofId,
      navigationProofId: fixtureContract.worker.navigationProofId,
      focusBackendReport: "evidence/focus-backends.json",
      ompHostProofId: fixtureContract.omp.hostProofId,
      nodeCompatibility: [{ nodeVersion: "22.0.0", status: "passed" }],
      directNodeCompatibility: [{ nodeVersion: "22.0.0", status: "passed" }],
    },
    focusCoordinator: {
      registrationTtlMs: 15000,
      heartbeatIntervalMs: 5000,
      retryInitialMs: 250,
      retryMaximumMs: 5000,
      attentionAcknowledgementTimeoutMs:
        fixtureContract.focus.attentionAcknowledgementTimeoutMs,
      focusAcknowledgementTimeoutMs: 2750,
      focusServerProcessingTimeoutMs: 2250,
      activeWindowConfirmationIntervalMs: 25,
      activeWindowConfirmationTimeoutMs: 1000,
      shutdownTimeoutMs: fixtureContract.focus.shutdownTimeoutMs,
      maximumDirectClients: fixtureContract.focus.maximumDirectClients,
      maximumDirectReceipts: fixtureContract.focus.maximumDirectReceipts,
      maximumAmbiguousDeliveryAttempts:
        fixtureContract.focus.maximumAmbiguousDeliveryAttempts,
      nativeFallbackPolicy: fixtureContract.focus.nativeFallbackPolicy,
      sessionHeartbeatIntervalMs: 5000,
      sessionLeaseMs: 20000,
      sessionReconnectGraceMs: 10000,
      maximumSessionLeaseRecords: 128,
      maximumQueuedFocusOperations:
        fixtureContract.focus.maximumQueuedFocusOperations,
      maximumActiveRegistrations:
        fixtureContract.focus.maximumActiveRegistrations,
      maximumLeaseMembers: fixtureContract.focus.maximumLeaseMembers,
      maximumPendingQmlFocusRequests:
        fixtureContract.focus.maximumPendingQmlFocusRequests,
      maximumFocusReplayEvents: fixtureContract.focus.maximumFocusReplayEvents,
      focusReplayAcknowledgementTimeoutMs:
        fixtureContract.focus.focusReplayAcknowledgementTimeoutMs,
      maximumConcurrentFocusReplays:
        fixtureContract.focus.maximumConcurrentFocusReplays,
      herdrProtocol: fixtureContract.focus.herdrProtocol,
      compositorExecutable: fixtureContract.focus.compositorExecutable,
      compositorDispatchTemplate:
        'dispatch hl.dsp.focus({ window = "address:<validated>" })',
      activationResults: fixtureContract.focus.activationResults,
      titleOwnership: fixtureContract.focus.titleOwnership,
      herdrTitleRelease: fixtureContract.focus.herdrTitleRelease,
      workerGeneration: fixtureContract.focus.workerGeneration,
      clientPolicy: fixtureContract.focus.clientPolicy,
      markerAdmission: "exact-marker-and-live-address-only",
      persistence: fixtureContract.focus.persistence,
    },
    focusBackends: fixtureContract.focus.backends,
    directSocketLifecycle: {
      directoryMode: "0700",
      socketMode: "0600",
      lifecycleLockMode: "0600",
      lifecycleSerialization: "hard-link-owner-lock",
      cleanupDeadlineMs: 1500,
      cleanupExitCodes: { removedOrAbsent: 0, unsafe: 74, transient: 75 },
    },
  };
  const buildInfoContent = JSON.stringify(buildInfo, null, 2) + "\n";
  await writeFile(path.join(root, "BUILDINFO.json"), buildInfoContent);
  policy.release.buildInfo = {
    path: "BUILDINFO.json",
    bytes: Buffer.byteLength(buildInfoContent),
    sha256: digest(buildInfoContent),
    attestationReference:
      "https://github.com/tomismeta/aperture/attestations/3",
  };
  const tagRef = `refs/tags/${approvedTag}`;
  const releaseReport = {
    schemaVersion: 3,
    status: "passed",
    signedTag: approvedTag,
    signedTagCommit: policy.apertureCommit,
    sourceDirty: false,
    sourceTrust: {
      protectedMainRef: "refs/heads/main",
      requiredStatusCheck: "release-check",
      signerAllowlistSource: "protected-main",
    },
    workflowChain: {
      releaseCheck: {
        runId: policy.release.workflowChain.releaseCheck.runId,
        runAttempt: "1",
        workflowName: "Release Check",
        event: "push",
        sourceRef: "refs/heads/main",
        sourceDigest: policy.apertureCommit,
        conclusion: "success",
      },
      workerArtifact: {
        runId: policy.release.workflowChain.workerArtifact.runId,
        workflowName: "Aperture Worker Artifact",
        runAttempt: "1",
        workflowRef: buildInfo.ci.workflowRef,
        event: "push",
        sourceRef: tagRef,
        sourceDigest: policy.apertureCommit,
        conclusion: "success",
      },
      directRelease: {
        runId: policy.release.workflowChain.directRelease.runId,
        runAttempt: "1",
        workflowName: "Aperture Worker Direct Release",
        event: "workflow_dispatch",
        sourceRef: tagRef,
        sourceDigest: policy.apertureCommit,
        conclusion: "success",
      },
    },
    finalization: {
      runId: policy.release.workflowChain.evidenceFinalizer.runId,
      runAttempt: "1",
      workflowName: "Aperture Worker Release Evidence",
      event: "workflow_dispatch",
      sourceRef: tagRef,
      sourceDigest: policy.apertureCommit,
    },
    releasePolicy: {
      environment: "aperture-worker-release",
      immutableReleasesRequired: true,
    },
    artifactMode: "omp-only",
    notificationInput: false,
    legacyNotificationState: "removed-without-restore",
    ompOnlyWorkerProof: fixtureContract.worker.conformanceProofId,
    ompOnlyWorkerEvidence: "evidence/omp-only-worker.json",
    artifactUrl: `https://github.com/tomismeta/aperture/releases/download/${approvedTag}/${policy.release.archive.name}`,
    artifactArchiveSha256: policy.release.archive.sha256,
    archiveAttestationReference: policy.release.archiveAttestationReference,
    buildInfoAttestationReference:
      policy.release.buildInfo.attestationReference,
    provenanceAttestationReference: policy.release.payloadAttestationReference,
    attestationPolicy: policy.release.attestationPolicy,
    aperturePackageVersion: policy.versions.aperture,
    apertureCoreVersion: policy.versions.apertureCore,
    ompPackageVersion: "0.1.0",
    artifactLimits: { maximumTextArtifactBytes: 524288 },
    workerBytes: worker.length,
    workerSha256: digest(worker),
    integrations: {
      omp: {
        packageVersion: "0.1.0",
        bytes: extension.length,
        sha256: digest(extension),
      },
    },
    buildInfoPath: "BUILDINFO.json",
    buildInfoSha256: policy.release.buildInfo.sha256,
    filesManifestCount: files.length,
    schemaVersions: buildInfo.workerContract,
    directSocketLifecycle: buildInfo.directSocketLifecycle,
    archiveMembers: [
      {
        path: "BUILDINFO.json",
        bytes: policy.release.buildInfo.bytes,
        sha256: policy.release.buildInfo.sha256,
        mode: "0644",
      },
      ...files,
    ],
    allValidationsPassed: true,
    fixedIdentitiesMatched: true,
    unmetPrerequisites: [],
  };
  const releaseReportContent = JSON.stringify(releaseReport, null, 2) + "\n";
  const releaseReportPath = "release/release-report.json";
  await writeFile(path.join(root, releaseReportPath), releaseReportContent);
  policy.release.releaseReport = {
    path: releaseReportPath,
    bytes: Buffer.byteLength(releaseReportContent),
    sha256: digest(releaseReportContent),
    attestationReference:
      "https://github.com/tomismeta/aperture/attestations/4",
  };
  await writeFile(
    path.join(root, "config", "artifact-policy.json"),
    JSON.stringify(policy, null, 2) + "\n",
  );
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify(
      {
        dependencies: { "unrelated-package": "1.0.0" },
      },
      null,
      2,
    ) + "\n",
  );
}

function environment(home, fakeBin, extra = {}) {
  return {
    ...process.env,
    HOME: home,
    PATH: `${fakeBin}:${process.env.PATH}`,
    XDG_RUNTIME_DIR: path.join(home, "runtime"),
    FAKE_OMP_LOG: path.join(home, "omp-calls.jsonl"),
    FAKE_SHELL_LOG: path.join(home, "shell-calls.jsonl"),
    FAKE_CLEANUP_LOG: path.join(home, "cleanup-calls.log"),
    ...extra,
  };
}

function run(command, args, env, expected = 0) {
  const result = spawnSync(command, args, { env, encoding: "utf8" });
  assert.equal(
    result.status,
    expected,
    `command failed: ${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`,
  );
  return result;
}

function defaultRoot(home) {
  return path.join(home, ".omp", "plugins");
}

function xdgRoot(xdg) {
  return path.join(xdg, "omp", "plugins");
}

async function assertAbsent(root) {
  const lock = JSON.parse(
    await readFile(path.join(root, "omp-plugins.lock.json"), "utf8"),
  );
  assert.equal(lock.plugins[pluginId], undefined);
  assert.equal(lock.settings[pluginId], undefined);
  await assert.rejects(
    lstat(path.join(root, "node_modules", "@tomismeta", "aperture-omp")),
  );
}

async function createOwnedState(root, integration, options = {}) {
  const packagePath = path.join(
    root,
    "node_modules",
    "@tomismeta",
    "aperture-omp",
  );
  await mkdir(path.dirname(packagePath), { recursive: true });
  if (options.nonSymlink) await mkdir(packagePath);
  else await symlink(options.target ?? integration, packagePath);
  const lock = options.malformed
    ? "{ malformed"
    : JSON.stringify(
        {
          plugins: {
            [pluginId]: { enabled: options.enabled ?? true },
            "other.plugin": { enabled: true },
          },
          settings: {
            [pluginId]: { owned: true },
            "other.plugin": { keep: true },
          },
        },
        null,
        2,
      ) + "\n";
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "omp-plugins.lock.json"), lock, {
    mode: 0o640,
  });
  await mkdir(path.join(root, "node_modules", "other.scope"), {
    recursive: true,
  });
}

try {
  const fakeBin = await createFakeCommands(temporaryRoot);

  // Untrusted and mismatched payloads are rejected before OMP is touched.
  const rejectedRoot = path.join(temporaryRoot, "plugin-rejected");
  const rejectedHome = path.join(temporaryRoot, "home-rejected");
  await createPluginFixture(rejectedRoot, false);
  await mkdir(rejectedHome, { recursive: true });
  const rejectedEnv = environment(rejectedHome, fakeBin);
  run(
    path.join(rejectedRoot, "bin", "omarchy-aperture-omp"),
    ["activate"],
    rejectedEnv,
    1,
  );
  const rejectedRemove = path.join(
    rejectedRoot,
    "bin",
    "omarchy-aperture-pre-remove",
  );
  run(rejectedRemove, [], rejectedEnv);
  const rejectedIntegration = path.join(rejectedRoot, "integrations", "omp");
  await createOwnedState(defaultRoot(rejectedHome), rejectedIntegration);
  run(rejectedRemove, [], rejectedEnv);
  await assertAbsent(defaultRoot(rejectedHome));
  await createOwnedState(defaultRoot(rejectedHome), rejectedIntegration);
  const rejectedSocketDirectory = path.join(
    rejectedEnv.XDG_RUNTIME_DIR,
    "omarchy",
    "aperture",
  );
  const rejectedLifecycleLock = path.join(
    rejectedSocketDirectory,
    ".attention.sock.lifecycle.lock",
  );
  await mkdir(rejectedSocketDirectory, { recursive: true, mode: 0o700 });
  await writeFile(rejectedLifecycleLock, "fixture\n", { mode: 0o600 });
  run(rejectedRemove, [], rejectedEnv, 1);
  await lstat(
    path.join(
      defaultRoot(rejectedHome),
      "node_modules",
      "@tomismeta",
      "aperture-omp",
    ),
  );
  const preservedRejectedLock = JSON.parse(
    await readFile(
      path.join(defaultRoot(rejectedHome), "omp-plugins.lock.json"),
      "utf8",
    ),
  );
  assert.equal(preservedRejectedLock.plugins[pluginId].enabled, true);
  await rm(rejectedLifecycleLock);
  run(rejectedRemove, [], rejectedEnv);
  await assertAbsent(defaultRoot(rejectedHome));
  pass("rejected payload removal succeeds only when no socket cleanup is required");
  await createPluginFixture(rejectedRoot, true);
  const candidatePolicyPath = path.join(
    rejectedRoot,
    "config",
    "artifact-policy.json",
  );
  const candidatePolicy = JSON.parse(
    await readFile(candidatePolicyPath, "utf8"),
  );
  candidatePolicy.artifactAcceptance = "release-candidate";
  candidatePolicy.productionEligible = false;
  await writeFile(
    candidatePolicyPath,
    JSON.stringify(candidatePolicy, null, 2) + "\n",
  );
  run(
    path.join(rejectedRoot, "bin", "omarchy-aperture-omp"),
    ["activate"],
    rejectedEnv,
    1,
  );
  run(
    path.join(rejectedRoot, "bin", "omarchy-aperture-verify-payload"),
    ["--allow-candidate"],
    rejectedEnv,
  );
  await rm(rejectedRoot, { recursive: true, force: true });
  for (const workflow of [
    "releaseCheck",
    "workerArtifact",
    "directRelease",
    "evidenceFinalizer",
  ]) {
    await createPluginFixture(rejectedRoot, true);
    const policyPath = path.join(
      rejectedRoot,
      "config",
      "artifact-policy.json",
    );
    const substitutedPolicy = JSON.parse(await readFile(policyPath, "utf8"));
    substitutedPolicy.release.workflowChain[workflow].runId = "999";
    await writeFile(
      policyPath,
      JSON.stringify(substitutedPolicy, null, 2) + "\n",
    );
    run(
      path.join(rejectedRoot, "bin", "omarchy-aperture-verify-payload"),
      ["--require-production"],
      rejectedEnv,
      1,
    );
    await rm(rejectedRoot, { recursive: true, force: true });
  }
  await createPluginFixture(rejectedRoot, true);
  await writeFile(
    path.join(rejectedRoot, "lib", "aperture-attention-engine.cjs"),
    "tampered\n",
  );
  run(
    path.join(rejectedRoot, "bin", "omarchy-aperture-omp"),
    ["activate"],
    rejectedEnv,
    1,
  );
  await rm(rejectedRoot, { recursive: true, force: true });
  await createPluginFixture(rejectedRoot, true);
  await writeFile(
    path.join(rejectedRoot, "evidence", "ambient-ceiling.json"),
    '{"status":"tampered"}\n',
  );
  run(
    path.join(rejectedRoot, "bin", "omarchy-aperture-omp"),
    ["activate"],
    rejectedEnv,
    1,
  );
  await rm(rejectedRoot, { recursive: true, force: true });
  await createPluginFixture(rejectedRoot, true);
  const tamperedIdentity = Buffer.from(
    JSON.stringify(
      {
        schemaVersion: 1,
        identities: [
          {
            id: "omp",
            kind: "omp",
            label: "OMP",
            applicationNames: ["Oh My Pi"],
          },
        ],
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    path.join(rejectedRoot, fixtureContract.identityConfig.path),
    tamperedIdentity,
  );
  const identityBuildInfo = JSON.parse(
    await readFile(path.join(rejectedRoot, "BUILDINFO.json"), "utf8"),
  );
  const identityRecord = identityBuildInfo.files.find(
    (file) => file.path === fixtureContract.identityConfig.path,
  );
  identityRecord.bytes = tamperedIdentity.length;
  identityRecord.sha256 = digest(tamperedIdentity);
  await writeFile(
    path.join(rejectedRoot, "BUILDINFO.json"),
    JSON.stringify(identityBuildInfo, null, 2) + "\n",
  );
  run(
    path.join(rejectedRoot, "bin", "omarchy-aperture-omp"),
    ["activate"],
    rejectedEnv,
    1,
  );
  await rm(rejectedRoot, { recursive: true, force: true });
  await createPluginFixture(rejectedRoot, true);
  await writeFile(path.join(rejectedRoot, "evidence", "unlisted.json"), "{}\n");
  run(
    path.join(rejectedRoot, "bin", "omarchy-aperture-omp"),
    ["activate"],
    rejectedEnv,
    1,
  );
  await rm(rejectedRoot, { recursive: true, force: true });
  await createPluginFixture(rejectedRoot, true);
  const untrustedBuildInfo = JSON.parse(
    await readFile(path.join(rejectedRoot, "BUILDINFO.json"), "utf8"),
  );
  untrustedBuildInfo.trustedCi = false;
  await writeFile(
    path.join(rejectedRoot, "BUILDINFO.json"),
    JSON.stringify(untrustedBuildInfo, null, 2) + "\n",
  );
  run(
    path.join(rejectedRoot, "bin", "omarchy-aperture-omp"),
    ["activate"],
    rejectedEnv,
    1,
  );
  pass(
    "activation rejects unapproved, untrusted, tampered, and unlisted payloads",
  );

  // Default-root activation is idempotent, runs from HOME, and removes without Bun.
  const pluginRoot = path.join(temporaryRoot, "plugin-default");
  const home = path.join(temporaryRoot, "home-default");
  await createPluginFixture(pluginRoot, true);
  await mkdir(home, { recursive: true });
  const env = environment(home, fakeBin);
  const activate = path.join(pluginRoot, "bin", "omarchy-aperture-omp");
  const remove = path.join(pluginRoot, "bin", "omarchy-aperture-pre-remove");
  const launcher = path.join(pluginRoot, "bin", "aperture-attention-engine");
  const launch = spawnSync(launcher, [], {
    cwd: home,
    env,
    input: '{"type":"shutdown"}\n',
    encoding: "utf8",
  });
  assert.equal(launch.status, 0, launch.stderr);
  const handshake = JSON.parse(launch.stdout.trim());
  assert.equal(handshake.worker, "aperture-attention-engine");
  assert.equal(handshake.protocolVersion, 4);
  assert.equal(handshake.packageVersion, sourcePolicy.versions.aperture);
  assert.equal(
    JSON.parse(
      await readFile(
        path.join(pluginRoot, fixtureContract.omp.manifestPath),
        "utf8",
      ),
    ).version,
    "0.1.0",
  );
  assert.equal(handshake.capabilities.notificationInput, false);
  pass("trusted launcher verifies and execs one host-Node worker");

  // Launch failures retain distinct machine and operator-visible meanings.
  const launchStateRoot = path.join(temporaryRoot, "plugin-launch-states");
  const launchStateHome = path.join(temporaryRoot, "home-launch-states");
  const launchStateEnv = environment(launchStateHome, fakeBin);
  await mkdir(launchStateHome, { recursive: true });

  await createPluginFixture(launchStateRoot, true);
  await rm(path.join(launchStateRoot, "lib", "aperture-attention-engine.cjs"));
  let launchFailure = run(
    path.join(launchStateRoot, "bin", "aperture-attention-engine"),
    [],
    launchStateEnv,
    66,
  );
  assert.match(launchFailure.stderr, /installed payload is incomplete/);

  await rm(launchStateRoot, { recursive: true, force: true });
  await createPluginFixture(launchStateRoot, true);
  const nonProductionPolicyPath = path.join(
    launchStateRoot,
    "config",
    "artifact-policy.json",
  );
  const nonProductionPolicy = JSON.parse(
    await readFile(nonProductionPolicyPath, "utf8"),
  );
  nonProductionPolicy.artifactAcceptance = "release-candidate";
  nonProductionPolicy.productionEligible = false;
  await writeFile(
    nonProductionPolicyPath,
    JSON.stringify(nonProductionPolicy, null, 2) + "\n",
  );
  launchFailure = run(
    path.join(launchStateRoot, "bin", "aperture-attention-engine"),
    [],
    launchStateEnv,
    77,
  );
  assert.match(launchFailure.stderr, /not approved for production/);

  await rm(launchStateRoot, { recursive: true, force: true });
  await createPluginFixture(launchStateRoot, true);
  await writeFile(
    path.join(launchStateRoot, "lib", "aperture-attention-engine.cjs"),
    "tampered\n",
  );
  launchFailure = run(
    path.join(launchStateRoot, "bin", "aperture-attention-engine"),
    [],
    launchStateEnv,
    65,
  );
  assert.match(launchFailure.stderr, /failed provenance verification/);

  await rm(launchStateRoot, { recursive: true, force: true });
  await createPluginFixture(launchStateRoot, true);
  const oldNodeBin = path.join(temporaryRoot, "old-node-bin");
  await mkdir(oldNodeBin, { recursive: true });
  await writeExecutable(
    path.join(oldNodeBin, "node"),
    "#!/bin/sh\nprintf 'v21.9.0\\n'\n",
  );
  launchFailure = run(
    path.join(launchStateRoot, "bin", "aperture-attention-engine"),
    [],
    {
      ...launchStateEnv,
      PATH: `${oldNodeBin}:${launchStateEnv.PATH}`,
    },
    78,
  );
  assert.match(launchFailure.stderr, /installed Node is older than 22/);

  const noNodeBin = path.join(temporaryRoot, "no-node-bin");
  await mkdir(noNodeBin, { recursive: true });
  for (const command of [
    "cut",
    "find",
    "jq",
    "sha256sum",
    "sort",
    "tr",
    "wc",
  ]) {
    const lookup = spawnSync(
      "/bin/sh",
      ["-c", `command -v ${command}`],
      { encoding: "utf8" },
    );
    assert.equal(lookup.status, 0, `test dependency is unavailable: ${command}`);
    await symlink(lookup.stdout.trim(), path.join(noNodeBin, command));
  }
  launchFailure = run(
    path.join(launchStateRoot, "bin", "aperture-attention-engine"),
    [],
    {
      ...launchStateEnv,
      PATH: `${fakeBin}:${noNodeBin}`,
    },
    69,
  );
  assert.match(launchFailure.stderr, /Node is missing/);
  pass("launcher distinguishes missing, unapproved, invalid, and incompatible runtime states");
  run(activate, ["activate"], { ...env, FAIL_SERVICE_RESUME: "1" }, 1);
  await assert.rejects(
    lstat(path.join(defaultRoot(home), "node_modules", "@tomismeta", "aperture-omp")),
  );

  run(activate, ["activate"], { ...env, FAKE_LIST_FORCE_DISABLED: "1" }, 1);
  await assertAbsent(defaultRoot(home));

  const integration = path.join(pluginRoot, "integrations", "omp");
  await createOwnedState(defaultRoot(home), integration, { enabled: false });
  run(activate, ["activate"], { ...env, FAIL_SERVICE_RESUME: "1" }, 1);
  let disabledLock = JSON.parse(
    await readFile(path.join(defaultRoot(home), "omp-plugins.lock.json"), "utf8"),
  );
  assert.equal(disabledLock.plugins[pluginId].enabled, false);
  run(activate, ["activate"], { ...env, FAKE_LIST_FORCE_DISABLED: "1" }, 1);
  disabledLock = JSON.parse(
    await readFile(path.join(defaultRoot(home), "omp-plugins.lock.json"), "utf8"),
  );
  assert.equal(disabledLock.plugins[pluginId].enabled, false);
  run(remove, [], env);
  pass("activation preflight and rollback preserve absent and disabled OMP states");
  run(activate, ["activate"], env);
  run(activate, ["activate"], env);
  const listing = JSON.parse(run(activate, ["status"], env).stdout);
  assert.equal(listing.length, 1);
  assert.equal(listing[0].enabled, true);
  const calls = (await readFile(env.FAKE_OMP_LOG, "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse);
  const resolvedHome = await realpath(home);
  assert(calls.every((call) => call.cwd === resolvedHome));
  assert(
    calls.some((call) => call.args[0] === "plugin" && call.args[1] === "link"),
  );
  assert(
    !calls.some(
      (call) =>
        call.args.includes("install") || call.args.includes("uninstall"),
    ),
  );
  const packageJsonBefore = await readFile(
    path.join(pluginRoot, "package.json"),
    "utf8",
  );
  let lock = JSON.parse(
    await readFile(
      path.join(defaultRoot(home), "omp-plugins.lock.json"),
      "utf8",
    ),
  );
  lock.plugins["other.plugin"] = { enabled: true };
  lock.settings["other.plugin"] = { keep: true };
  await writeFile(
    path.join(defaultRoot(home), "omp-plugins.lock.json"),
    JSON.stringify(lock, null, 2) + "\n",
    { mode: 0o640 },
  );
  await mkdir(path.join(defaultRoot(home), "node_modules", "other.scope"), {
    recursive: true,
  });
  const ompCallsBeforeCleanupFailure = (
    await readFile(env.FAKE_OMP_LOG, "utf8")
  )
    .trim()
    .split("\n").length;
  const cleanupSocketDirectory = path.join(
    env.XDG_RUNTIME_DIR,
    "omarchy",
    "aperture",
  );
  await mkdir(cleanupSocketDirectory, { recursive: true, mode: 0o700 });
  await writeFile(
    path.join(cleanupSocketDirectory, ".attention.sock.lifecycle.lock"),
    "fixture\n",
    { mode: 0o600 },
  );
  const cleanupFailure = run(
    remove,
    [],
    { ...env, FAKE_CLEANUP_EXIT: "75" },
    1,
  );
  assert.match(cleanupFailure.stderr, /bounded cleanup deadline/);
  const ompCallsAfterCleanupFailure = (await readFile(env.FAKE_OMP_LOG, "utf8"))
    .trim()
    .split("\n").length;
  assert.equal(ompCallsAfterCleanupFailure, ompCallsBeforeCleanupFailure);
  lock = JSON.parse(
    await readFile(
      path.join(defaultRoot(home), "omp-plugins.lock.json"),
      "utf8",
    ),
  );
  assert.equal(lock.plugins[pluginId].enabled, true);
  await lstat(
    path.join(defaultRoot(home), "node_modules", "@tomismeta", "aperture-omp"),
  );
  await assert.rejects(
    lstat(path.join(home, ".fake-attention-service-stopped")),
  );
  pass("pre-remove preserves OMP state when bounded socket cleanup fails");
  run(remove, [], env);
  const shellCalls = (await readFile(env.FAKE_SHELL_LOG, "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert(shellCalls.some((call) => call.args[1] === "shutdown"));
  assert(shellCalls.filter((call) => call.args[1] === "status").length >= 2);
  assert.match(await readFile(env.FAKE_CLEANUP_LOG, "utf8"), /^cleanup\n/);
  await assertAbsent(defaultRoot(home));
  lock = JSON.parse(
    await readFile(
      path.join(defaultRoot(home), "omp-plugins.lock.json"),
      "utf8",
    ),
  );
  assert.deepEqual(lock.plugins["other.plugin"], { enabled: true });
  assert.deepEqual(lock.settings["other.plugin"], { keep: true });
  assert.equal(
    await readFile(path.join(pluginRoot, "package.json"), "utf8"),
    packageJsonBefore,
  );
  await lstat(path.join(defaultRoot(home), "node_modules", "other.scope"));
  run(remove, [], env);
  run(activate, ["activate"], env);
  await assert.rejects(
    lstat(path.join(home, ".fake-attention-service-stopped")),
  );
  run(remove, [], env);
  pass(
    "default-root activation, idempotent removal, reinstall, and unrelated state preservation pass",
  );

  // XDG-root lifecycle.
  const xdgHome = path.join(temporaryRoot, "home-xdg");
  const xdg = path.join(temporaryRoot, "xdg-data");
  await mkdir(xdgHome, { recursive: true });
  const xdgEnv = environment(xdgHome, fakeBin, { XDG_DATA_HOME: xdg });
  run(activate, ["activate"], xdgEnv);
  await lstat(
    path.join(xdgRoot(xdg), "node_modules", "@tomismeta", "aperture-omp"),
  );
  run(remove, [], xdgEnv);
  await assertAbsent(xdgRoot(xdg));
  pass("XDG-root activation and removal pass");

  const expectedIntegration = path.join(pluginRoot, "integrations", "omp");

  const transientCleanupHome = path.join(temporaryRoot, "home-transient-cleanup");
  const transientCleanupRoot = defaultRoot(transientCleanupHome);
  const transientCleanupRuntime = path.join(
    temporaryRoot,
    "runtime-transient-cleanup",
  );
  const transientCleanupSocketDirectory = path.join(
    transientCleanupRuntime,
    "omarchy",
    "aperture",
  );
  const transientCleanupMarker = path.join(
    transientCleanupHome,
    "cleanup-was-transient",
  );
  await createOwnedState(transientCleanupRoot, expectedIntegration);
  await mkdir(transientCleanupSocketDirectory, {
    recursive: true,
    mode: 0o700,
  });
  await writeFile(
    path.join(transientCleanupSocketDirectory, ".attention.sock.lifecycle.lock"),
    "fixture\n",
    { mode: 0o600 },
  );
  run(
    remove,
    [],
    environment(transientCleanupHome, fakeBin, {
      XDG_RUNTIME_DIR: transientCleanupRuntime,
      FAKE_CLEANUP_TRANSIENT_ONCE: transientCleanupMarker,
    }),
  );
  await lstat(transientCleanupMarker);
  await assertAbsent(transientCleanupRoot);
  await assert.rejects(
    lstat(
      path.join(
        transientCleanupSocketDirectory,
        ".attention.sock.lifecycle.lock",
      ),
    ),
  );
  pass("pre-remove retries one transient socket cleanup within a fixed bound");


  // A loaded service must confirm zero lifecycle state before OMP mutation.
  const serviceFailureHome = path.join(temporaryRoot, "home-service-failure");
  const serviceFailureRoot = defaultRoot(serviceFailureHome);
  await createOwnedState(serviceFailureRoot, expectedIntegration);
  run(
    remove,
    [],
    environment(serviceFailureHome, fakeBin, { FAIL_SERVICE_SHUTDOWN: "1" }),
    1,
  );
  await lstat(
    path.join(serviceFailureRoot, "node_modules", "@tomismeta", "aperture-omp"),
  );
  lock = JSON.parse(
    await readFile(
      path.join(serviceFailureRoot, "omp-plugins.lock.json"),
      "utf8",
    ),
  );
  assert.equal(lock.plugins[pluginId].enabled, true);
  pass("service shutdown refusal prevents OMP mutation");

  // Mismatched symlink refusal.
  const mismatchHome = path.join(temporaryRoot, "home-mismatch");
  const mismatchTarget = path.join(temporaryRoot, "unexpected-target");
  await mkdir(mismatchTarget, { recursive: true });
  await createOwnedState(defaultRoot(mismatchHome), expectedIntegration, {
    target: mismatchTarget,
  });
  const mismatchEnv = environment(mismatchHome, fakeBin);
  run(remove, [], mismatchEnv, 1);
  assert.equal(
    await readlink(
      path.join(
        defaultRoot(mismatchHome),
        "node_modules",
        "@tomismeta",
        "aperture-omp",
      ),
    ),
    mismatchTarget,
  );
  pass("mismatched symlink is refused without mutation");
  await assert.rejects(readFile(mismatchEnv.FAKE_SHELL_LOG, "utf8"));

  // Non-symlink refusal.
  const nonsymlinkHome = path.join(temporaryRoot, "home-nonsymlink");
  await createOwnedState(defaultRoot(nonsymlinkHome), expectedIntegration, {
    nonSymlink: true,
  });
  run(remove, [], environment(nonsymlinkHome, fakeBin), 1);
  await lstat(
    path.join(
      defaultRoot(nonsymlinkHome),
      "node_modules",
      "@tomismeta",
      "aperture-omp",
    ),
  );
  pass("non-symlink package path is refused");

  // Duplicate-root refusal.
  const duplicateHome = path.join(temporaryRoot, "home-duplicate");
  const duplicateXdg = path.join(temporaryRoot, "xdg-duplicate");
  await createOwnedState(defaultRoot(duplicateHome), expectedIntegration);
  await createOwnedState(xdgRoot(duplicateXdg), expectedIntegration);
  run(
    remove,
    [],
    environment(duplicateHome, fakeBin, { XDG_DATA_HOME: duplicateXdg }),
    1,
  );
  pass("duplicate active roots are refused");

  // Malformed and unsafe lock refusal.
  const malformedHome = path.join(temporaryRoot, "home-malformed");
  await createOwnedState(defaultRoot(malformedHome), expectedIntegration, {
    malformed: true,
  });
  run(remove, [], environment(malformedHome, fakeBin), 1);
  pass("malformed lock is refused");
  const unsafeHome = path.join(temporaryRoot, "home-unsafe-lock");
  const unsafeRoot = defaultRoot(unsafeHome);
  await createOwnedState(unsafeRoot, expectedIntegration);
  const realLock = path.join(unsafeRoot, "real-lock.json");
  await copyFile(path.join(unsafeRoot, "omp-plugins.lock.json"), realLock);
  await rm(path.join(unsafeRoot, "omp-plugins.lock.json"));
  await symlink(realLock, path.join(unsafeRoot, "omp-plugins.lock.json"));
  run(remove, [], environment(unsafeHome, fakeBin), 1);
  pass("symlinked lock is refused");

  // Lock-only state cannot establish ownership.
  const lockOnlyHome = path.join(temporaryRoot, "home-lock-only");
  const lockOnlyRoot = defaultRoot(lockOnlyHome);
  await mkdir(lockOnlyRoot, { recursive: true });
  await writeFile(
    path.join(lockOnlyRoot, "omp-plugins.lock.json"),
    JSON.stringify({ plugins: { [pluginId]: {} }, settings: {} }),
  );
  run(remove, [], environment(lockOnlyHome, fakeBin), 1);
  pass("lock-only partial state is refused");

  // Atomic replacement failure restores the verified symlink.
  const restoreHome = path.join(temporaryRoot, "home-restore");
  await mkdir(restoreHome, { recursive: true });
  const restoreEnv = environment(restoreHome, fakeBin);
  run(activate, ["activate"], restoreEnv);
  run(remove, [], { ...restoreEnv, FAIL_LOCK_MV: "1" }, 1);
  const restoredLink = path.join(
    defaultRoot(restoreHome),
    "node_modules",
    "@tomismeta",
    "aperture-omp",
  );
  assert.equal(
    await readlink(restoredLink),
    await realpath(expectedIntegration),
  );
  lock = JSON.parse(
    await readFile(
      path.join(defaultRoot(restoreHome), "omp-plugins.lock.json"),
      "utf8",
    ),
  );
  assert(lock.plugins[pluginId]);
  assert.equal(lock.plugins[pluginId].enabled, true);
  await assert.rejects(
    lstat(path.join(restoreHome, ".fake-attention-service-stopped")),
  );
  run(remove, [], restoreEnv);
  pass("lock replacement failure restores the verified symlink");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
