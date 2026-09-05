#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const sourceRepository = "tomismeta/aperture";
const sourceRemote = `https://github.com/${sourceRepository}.git`;
const releaseWorkflowPath = ".github/workflows/aperture-worker-release.yml";
const releaseWorkflowRef = `${sourceRepository}/${releaseWorkflowPath}`;
const maximumTextArtifactBytes = 524_288;
const requiredOmpVersion = "0.1.0";
const requiredOmpWorkerOutputSchemaVersion = 4;
const requiredSurfaceProtocolVersion = 4;
const requiredOmpAttentionEventSchemaVersion = 4;
const requiredWorkerDirectProtocolVersion = 4;
const signerFileSha256 =
  "533e9ab9e5f42fc39b954da45e7dd798dc054da9530434c8a13b50f8255ee778";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(scriptDirectory, "..", "..");
const signerFile = path.join(pluginRoot, "config", "aperture-release-signers");
const verifier = path.join(
  pluginRoot,
  "bin",
  "omarchy-aperture-verify-payload",
);
const releaseLedger = path.join(
  pluginRoot,
  ".github",
  "aperture-worker-release-ledger.json",
);
const tag = process.argv[2];

if (
  process.argv.length !== 3 ||
  !tag ||
  !/^aperture-worker-v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(tag)
) {
  throw new Error(
    "usage: node .github/scripts/vendor-aperture-worker-release.mjs aperture-worker-v<major>.<minor>.<patch>",
  );
}

const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), "omarchy-aperture-vendor-"),
);
const downloadRoot = path.join(temporaryRoot, "release");
const sourceRoot = path.join(temporaryRoot, "source");
const extractedRoot = path.join(temporaryRoot, "payload");
const transactionToken = randomBytes(12).toString("hex");
const stagedRoot = path.join(pluginRoot, `.vendor-stage-${transactionToken}`);
const backupRoot = path.join(pluginRoot, `.vendor-backup-${transactionToken}`);

let preserveVendorRecovery = false;
try {
  await verifyTrustAnchor();
  await verifyRepositoryControls();
  await assertTargetsAreUnmodified();
  await mkdir(downloadRoot, { mode: 0o700 });
  await mkdir(sourceRoot, { mode: 0o700 });
  await mkdir(extractedRoot, { mode: 0o700 });

  const release = await ghJson([
    "release",
    "view",
    tag,
    "--repo",
    sourceRepository,
    "--json",
    "tagName,isDraft,isImmutable,isPrerelease,url,assets",
  ]);
  assert.equal(release.tagName, tag, "release tag mismatch");
  assert.equal(release.isDraft, false, "release is still a draft");
  assert.equal(release.isImmutable, true, "release assets and source tag are mutable");
  assert.equal(
    release.isPrerelease,
    false,
    "prerelease payload cannot enter production",
  );
  assert.equal(
    release.url,
    `https://github.com/${sourceRepository}/releases/tag/${tag}`,
    "release URL mismatch",
  );
  const expectedAssetNames = [
    "BUILDINFO.sha256",
    `${tag}.tar.gz`,
    `${tag}.tar.gz.sha256`,
  ].sort();
  assert.deepEqual(
    release.assets.map((asset) => asset.name).sort(),
    expectedAssetNames,
    "release asset set is incomplete or contains extras",
  );

  const sourceCommit = await verifySignedTag();
  await run("gh", [
    "release",
    "download",
    tag,
    "--repo",
    sourceRepository,
    "--dir",
    downloadRoot,
  ]);

  const archiveName = `${tag}.tar.gz`;
  const archivePath = path.join(downloadRoot, archiveName);
  const archiveChecksumPath = `${archivePath}.sha256`;
  const buildInfoChecksumPath = path.join(downloadRoot, "BUILDINFO.sha256");
  const archive = await fileIdentity(archivePath);
  assert.equal(
    await readFile(archiveChecksumPath, "utf8"),
    `${archive.sha256}  ${archiveName}\n`,
    "archive checksum file mismatch",
  );
  const archiveMembers = await validateAndExtractArchive(
    archivePath,
    extractedRoot,
  );

  const buildInfoPath = path.join(extractedRoot, "BUILDINFO.json");
  const buildInfoIdentity = await fileIdentity(buildInfoPath);
  assert.equal(
    await readFile(buildInfoChecksumPath, "utf8"),
    `${buildInfoIdentity.sha256}  BUILDINFO.json\n`,
    "BUILDINFO checksum file mismatch",
  );
  const buildInfo = await readJson(buildInfoPath);
  validateBuildInfo(buildInfo, sourceCommit);
  assert.deepEqual(
    archiveMembers,
    ["BUILDINFO.json", ...buildInfo.files.map((entry) => entry.path)],
    "archive regular-file membership or order differs from BUILDINFO",
  );
  await verifyRun(buildInfo.ci?.runId, buildInfo.ci?.runAttempt, {
    name: "Aperture Worker Release",
    path: releaseWorkflowPath,
    event: "push",
    branch: tag,
    commit: sourceCommit,
  });
  await verifyExtractedPayload(extractedRoot, buildInfo);

  const { policy, ledger } = await createArtifactPolicy(
    buildInfo,
    archive,
    buildInfoIdentity,
    sourceCommit,
  );
  await stagePayload(extractedRoot, policy, ledger);
  await installTransaction();
  process.stdout.write(
    `Vendored authenticated Aperture payload ${tag} at ${sourceCommit}\n`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
  if (!preserveVendorRecovery) {
    await rm(stagedRoot, { recursive: true, force: true });
    await rm(backupRoot, { recursive: true, force: true });
  }
}

async function verifyTrustAnchor() {
  const metadata = await lstat(signerFile);
  assert.equal(
    metadata.isFile(),
    true,
    "release signer trust anchor is not a regular file",
  );
  assert.equal(
    metadata.isSymbolicLink(),
    false,
    "release signer trust anchor is a symlink",
  );
  const identity = await fileIdentity(signerFile);
  assert.equal(
    identity.sha256,
    signerFileSha256,
    "release signer trust anchor changed",
  );
}

async function verifyRepositoryControls() {
  const immutableReleases = await ghJson([
    "api",
    `repos/${sourceRepository}/immutable-releases`,
  ]);
  assert.equal(
    immutableReleases.enabled,
    true,
    "upstream immutable releases must be enabled before vendoring",
  );
  const main = await ghJson(["api", `repos/${sourceRepository}/branches/main`]);
  assert.equal(main.protected, true, "upstream main branch must be protected");
  assert.equal(
    main.protection?.required_status_checks?.contexts?.includes("release-check"),
    true,
    "upstream main must require the exact Release Check",
  );
  assert.match(
    String(main.commit?.sha ?? ""),
    /^[0-9a-f]{40}$/,
    "protected main commit is malformed",
  );
  const allowlist = await ghJson([
    "api",
    `repos/${sourceRepository}/contents/.github/release-signers?ref=${main.commit.sha}`,
  ]);
  assert.equal(allowlist.type, "file", "protected-main signer allowlist is not a file");
  assert.equal(
    allowlist.path,
    ".github/release-signers",
    "protected-main signer allowlist path mismatch",
  );
  assert.equal(
    allowlist.encoding,
    "base64",
    "protected-main signer allowlist encoding is unsupported",
  );
  assert.deepEqual(
    Buffer.from(allowlist.content, "base64"),
    await readFile(signerFile),
    "vendored signer trust anchor differs from protected main",
  );
}

async function assertTargetsAreUnmodified() {
  const targets = [
    "BUILDINFO.json",
    "config/artifact-policy.json",
    ".github/aperture-worker-release-ledger.json",
    "config/identities.json",
    "evidence",
    "fixtures/omp-direct",
    "integrations/omp",
    "lib",
    "release",
    "schemas",
  ];
  const { stdout } = await run(
    "git",
    [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--ignored=matching",
      "--",
      ...targets,
    ],
    { cwd: pluginRoot },
  );
  assert.equal(
    stdout.trim(),
    "",
    "refusing to replace locally modified vendored payload files",
  );
}

async function verifySignedTag() {
  const ref = await ghJson([
    "api",
    `repos/${sourceRepository}/git/ref/tags/${tag}`,
  ]);
  assert.equal(ref.object?.type, "tag", "source tag is not annotated");
  const tagObject = await ghJson([
    "api",
    `repos/${sourceRepository}/git/tags/${ref.object.sha}`,
  ]);
  assert.equal(
    tagObject.verification?.verified,
    true,
    "GitHub did not verify the source tag signature",
  );
  assert.equal(
    tagObject.verification?.reason,
    "valid",
    "GitHub source tag signature is not valid",
  );
  assert.equal(
    tagObject.object?.type,
    "commit",
    "annotated tag does not identify a commit",
  );
  const commit = tagObject.object.sha;
  assert.match(commit, /^[0-9a-f]{40}$/, "source commit is malformed");
  const comparison = await ghJson([
    "api",
    `repos/${sourceRepository}/compare/${commit}...main`,
  ]);
  assert.equal(
    comparison.merge_base_commit?.sha,
    commit,
    "source tag commit is not reachable from protected main",
  );
  assert.equal(
    comparison.status === "ahead" || comparison.status === "identical",
    true,
    "protected main does not contain the source tag commit",
  );

  await run("git", ["init", "--quiet"], { cwd: sourceRoot });
  await run("git", ["remote", "add", "origin", sourceRemote], {
    cwd: sourceRoot,
  });
  await run(
    "git",
    [
      "fetch",
      "--quiet",
      "--depth=1",
      "origin",
      `refs/tags/${tag}:refs/tags/${tag}`,
    ],
    { cwd: sourceRoot },
  );
  assert.equal(
    (
      await run("git", ["cat-file", "-t", `refs/tags/${tag}`], {
        cwd: sourceRoot,
      })
    ).stdout.trim(),
    "tag",
    "fetched source tag is not annotated",
  );
  await run(
    "git",
    [
      "-c",
      "gpg.format=ssh",
      "-c",
      `gpg.ssh.allowedSignersFile=${signerFile}`,
      "verify-tag",
      tag,
    ],
    { cwd: sourceRoot },
  );
  assert.equal(
    (
      await run("git", ["rev-parse", `${tag}^{commit}`], { cwd: sourceRoot })
    ).stdout.trim(),
    commit,
    "locally authenticated tag commit differs from GitHub",
  );
  return commit;
}


async function verifyRun(runId, runAttempt, expected) {
  assert.match(
    String(runId ?? ""),
    /^[1-9][0-9]*$/,
    "workflow run ID is malformed",
  );
  assert.match(
    String(runAttempt ?? ""),
    /^[1-9][0-9]*$/,
    "workflow run attempt is malformed",
  );
  const run = await ghJson([
    "api",
    `repos/${sourceRepository}/actions/runs/${runId}`,
  ]);
  assert.equal(run.name, expected.name, `${expected.name} run name mismatch`);
  assert.equal(
    run.path,
    expected.path,
    `${expected.name} workflow path mismatch`,
  );
  assert.equal(run.event, expected.event, `${expected.name} event mismatch`);
  assert.equal(run.conclusion, "success", `${expected.name} did not succeed`);
  assert.equal(
    String(run.run_attempt),
    String(runAttempt),
    `${expected.name} workflow attempt mismatch`,
  );
  assert.equal(
    run.head_branch,
    expected.branch,
    `${expected.name} source branch mismatch`,
  );
  assert.equal(
    run.head_sha,
    expected.commit,
    `${expected.name} source commit mismatch`,
  );
  assert.equal(
    run.head_repository?.full_name,
    sourceRepository,
    `${expected.name} source repository mismatch`,
  );
}


async function validateAndExtractArchive(archivePath, destination) {
  const names = splitLines((await run("tar", ["-tzf", archivePath])).stdout);
  const verbose = splitLines((await run("tar", ["-tvzf", archivePath])).stdout);
  assert.equal(names.length, verbose.length, "archive listing is ambiguous");
  assert.equal(
    new Set(names).size,
    names.length,
    "archive contains duplicate members",
  );
  const regularFiles = [];
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    assertSafeArchivePath(name);
    const type = verbose[index]?.[0];
    assert.ok(
      type === "-" || type === "d",
      `archive member type is unsafe: ${name}`,
    );
    if (type === "-") regularFiles.push(name);
  }
  await run("tar", ["-xzf", archivePath, "-C", destination]);
  return regularFiles;
}

function validateBuildInfo(build, sourceCommit) {
  assert.equal(build.schemaVersion, 1, "BUILDINFO schema mismatch");
  assert.equal(build.artifactType, "node-commonjs-bundle");
  assert.equal(build.artifactMode, "omp-only");
  assert.equal(build.worker, "aperture-attention-engine");
  assert.equal(build.minimumNodeVersion, "22.0.0");
  assert.equal(build.minimumNodeMajor, 22);
  assert.equal(build.apertureCommit, sourceCommit);
  assert.equal(build.apertureSourceTag, tag);
  assert.equal(build.releaseSeries, tag.replace(/\.\d+$/, ""));
  assert.equal(build.sourceDirty, false);
  assert.equal(build.payloadProfile, "release");
  assert.equal(build.trustedCi, true);
  assert.match(
    build.aperturePackageVersion,
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/,
    "public package version is malformed",
  );
  assert.match(
    build.apertureCoreVersion,
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/,
    "Core version is malformed",
  );
  assert.equal(build.ompPackageVersion, requiredOmpVersion);
  assert.equal(
    build.ci?.workflowRef,
    `${releaseWorkflowRef}@refs/tags/${tag}`,
  );
  assert.match(String(build.ci?.runId ?? ""), /^[1-9][0-9]*$/);
  assert.match(String(build.ci?.runAttempt ?? ""), /^[1-9][0-9]*$/);
  assert.deepEqual(Object.keys(build.workerContract ?? {}).sort(), [
    "jsonlHandshakes",
    "notificationInput",
    "ompAttentionEventSchemaVersion",
    "ompWorkerOutputSchemaVersion",
    "surfaceProtocolVersion",
    "workerDirectProtocolVersion",
  ]);
  assert.deepEqual(Object.keys(build.schemas ?? {}).sort(), [
    "ompAttentionEvent",
    "output",
    "surface",
    "workerDirectMessage",
  ]);
  assert.equal(build.workerContract?.notificationInput, false);
  assert.equal(
    build.workerContract?.ompWorkerOutputSchemaVersion,
    build.schemas?.output?.version,
  );
  assert.equal(
    build.workerContract?.ompWorkerOutputSchemaVersion,
    requiredOmpWorkerOutputSchemaVersion,
  );
  assert.equal(
    build.workerContract?.surfaceProtocolVersion,
    build.schemas?.surface?.version,
  );
  assert.equal(
    build.workerContract?.surfaceProtocolVersion,
    requiredSurfaceProtocolVersion,
  );
  assert.equal(
    build.workerContract?.ompAttentionEventSchemaVersion,
    build.schemas?.ompAttentionEvent?.version,
  );
  assert.equal(
    build.workerContract?.ompAttentionEventSchemaVersion,
    requiredOmpAttentionEventSchemaVersion,
  );
  assert.equal(
    build.workerContract?.workerDirectProtocolVersion,
    build.schemas?.workerDirectMessage?.version,
  );
  assert.equal(
    build.workerContract?.workerDirectProtocolVersion,
    requiredWorkerDirectProtocolVersion,
  );
  assert.deepEqual(
    build.workerContract?.jsonlHandshakes,
    expectedJsonlHandshakes(
      requiredSurfaceProtocolVersion,
      requiredWorkerDirectProtocolVersion,
    ),
  );
  assert.deepEqual(
    build.directSocketLifecycle,
    expectedDirectSocketLifecycle(),
  );
  assert.equal(Object.hasOwn(build, "stateMigration"), false);
  assert.deepEqual(build.focusBackends, [
    "herdr-0.8.2",
    "foot-1.27",
    "tmux-3.7c",
  ]);
  assert.equal(build.focusCoordinator?.registrationTtlMs, 15_000);
  assert.equal(build.focusCoordinator?.heartbeatIntervalMs, 5_000);
  assert.equal(build.focusCoordinator?.focusAcknowledgementTimeoutMs, 2_750);
  assert.equal(build.focusCoordinator?.focusServerProcessingTimeoutMs, 2_250);
  assert.equal(build.focusCoordinator?.sessionHeartbeatIntervalMs, 5_000);
  assert.equal(build.focusCoordinator?.sessionLeaseMs, 20_000);
  assert.equal(build.focusCoordinator?.sessionReconnectGraceMs, 10_000);
  assert.equal(build.focusCoordinator?.maximumSessionLeaseRecords, 128);
  assert.equal(build.focusCoordinator?.herdrProtocol, "raw-ndjson-0.8.2");
  assert.equal(
    build.focusCoordinator?.compositorExecutable,
    "/usr/bin/hyprctl",
  );
  assert.equal(
    build.focusCoordinator?.clientPolicy,
    "backend-scoped-single-client-admission",
  );
  assert.equal(
    build.focusCoordinator?.markerAdmission,
    "exact-marker-and-live-address-only",
  );
  assert.equal(build.focusCoordinator?.persistence, "volatile-only");
  assert.equal(
    build.focusCoordinator?.nativeFallbackPolicy,
    "definite-pre-write-only",
  );
  assert.equal(
    build.focusCoordinator?.herdrTitleRelease,
    "retained-no-conditional-clear",
  );
  assert.equal(build.validation?.status, "passed");
  assert.equal(
    build.validation?.conformanceProofId,
    "aperture-omp-only-worker-conformance-v1",
  );
  assert.equal(build.validation?.ompOnlyReport, "evidence/omp-only-worker.json");
  assert.equal(Object.hasOwn(build.validation, "ambientCeilingProofId"), false);
  assert.equal(build.runtimeDependencies?.policy, "node-builtins-only");
  assert.equal(build.runtimeDependencies?.status, "passed");
  assert.equal(build.integrations?.omp?.packageVersion, requiredOmpVersion);
  assert.equal(
    build.integrations?.omp?.runtimeDependencies?.policy,
    "node-builtins-only",
  );
  assert.equal(build.integrations?.omp?.runtimeDependencies?.status, "passed");
  assert.equal(build.integrations?.omp?.validation?.status, "passed");
  assert.equal(build.workerBundle?.bytes <= maximumTextArtifactBytes, true);
  assert.equal(
    build.integrations?.omp?.bytes <= maximumTextArtifactBytes,
    true,
  );
  assert.equal(build.files?.length, 30, "payload file count mismatch");
}

async function verifyExtractedPayload(root, build) {
  assert.ok(
    Array.isArray(build.files) && build.files.length > 0,
    "BUILDINFO file manifest is empty",
  );
  const paths = build.files.map((entry) => entry.path);
  assert.deepEqual(
    paths,
    [...paths].sort(),
    "BUILDINFO file manifest is not sorted",
  );
  assert.equal(
    new Set(paths).size,
    paths.length,
    "BUILDINFO file manifest contains duplicates",
  );
  const actualFiles = (await walkFiles(root))
    .filter((entry) => entry !== "BUILDINFO.json")
    .sort();
  assert.deepEqual(
    actualFiles,
    paths,
    "extracted payload tree differs from BUILDINFO",
  );

  for (const entry of build.files) {
    assertSafePayloadPath(entry.path);
    assertPositiveIntegerOrZero(
      entry.bytes,
      `payload byte count for ${entry.path}`,
    );
    assertSha256(entry.sha256, `payload digest for ${entry.path}`);
    assert.equal(entry.mode, "0644", `payload mode for ${entry.path}`);
    const absolute = path.join(root, entry.path);
    const metadata = await lstat(absolute);
    assert.equal(
      metadata.isFile(),
      true,
      `payload member is not a regular file: ${entry.path}`,
    );
    assert.equal(
      metadata.isSymbolicLink(),
      false,
      `payload member is a symlink: ${entry.path}`,
    );
    const identity = await fileIdentity(absolute);
    assert.equal(
      identity.bytes,
      entry.bytes,
      `payload byte count mismatch: ${entry.path}`,
    );
    assert.equal(
      identity.sha256,
      entry.sha256,
      `payload digest mismatch: ${entry.path}`,
    );
  }

  for (const required of requiredPayloadPaths()) {
    assert.equal(
      paths.includes(required),
      true,
      `required payload member is absent: ${required}`,
    );
  }
  const ompManifest = await readJson(
    path.join(root, "integrations", "omp", "package.json"),
  );
  assert.deepEqual(ompManifest, {
    name: "@tomismeta/aperture-omp",
    version: requiredOmpVersion,
    private: true,
    type: "module",
    omp: { extensions: ["./aperture-omp-extension.mjs"] },
  });
}

async function createArtifactPolicy(
  build,
  archive,
  buildInfoIdentity,
  sourceCommit,
) {
  const prior = await readJson(
    path.join(pluginRoot, "config", "artifact-policy.json"),
  );
  const priorLedger = await readJson(releaseLedger);
  assert.deepEqual(
    Object.keys(priorLedger).sort(),
    ["releases"],
    "release ledger has unexpected fields",
  );
  assert.equal(
    Array.isArray(priorLedger.releases),
    true,
    "release ledger is malformed",
  );
  for (const entry of priorLedger.releases) validateLedgerEntry(entry);
  assert.equal(
    new Set(priorLedger.releases.map((entry) => entry.tag)).size,
    priorLedger.releases.length,
    "release ledger contains duplicate tags",
  );
  const acceptedRelease = {
    tag,
    commit: sourceCommit,
    archiveSha256: archive.sha256,
    buildInfoSha256: buildInfoIdentity.sha256,
    acceptance: "production",
    productionEligible: true,
  };
  const priorCurrent =
    typeof prior.approvedSourceTag === "string" &&
    typeof prior.apertureCommit === "string"
      ? {
          tag: prior.approvedSourceTag,
          commit: prior.apertureCommit,
          archiveSha256: prior.release?.archive?.sha256,
          buildInfoSha256: prior.release?.buildInfo?.sha256,
          acceptance: prior.artifactAcceptance,
          productionEligible: prior.productionEligible,
        }
      : undefined;
  const history = [acceptedRelease, priorCurrent, ...priorLedger.releases]
    .filter(Boolean)
    .filter(
      (entry, index, entries) =>
        entries.findIndex((item) => item.tag === entry.tag) === index,
    );
  for (const entry of history) validateLedgerEntry(entry);
  const policy = {
    artifactAcceptance: "production",
    productionEligible: true,
    artifactMode: "omp-only",
    approvedSourceTag: tag,
    apertureCommit: sourceCommit,
    versions: {
      aperture: build.aperturePackageVersion,
      apertureCore: build.apertureCoreVersion,
      ompIntegration: requiredOmpVersion,
    },
    minimumNodeVersion: "22.0.0",
    minimumNodeMajor: 22,
    artifactLimits: { maximumTextArtifactBytes },
    release: {
      immutable: true,
      environment: "aperture-worker-release",
      immutableReleasesRequired: true,
      protectedMainRef: "refs/heads/main",
      url: `https://github.com/${sourceRepository}/releases/tag/${tag}`,
      archive: { name: `${tag}.tar.gz`, ...archive },
      buildInfo: {
        path: "BUILDINFO.json",
        ...buildInfoIdentity,
      },
      workflow: {
        name: "Aperture Worker Release",
        path: releaseWorkflowPath,
        ref: build.ci.workflowRef,
        runId: String(build.ci.runId),
        runAttempt: String(build.ci.runAttempt),
        event: "push",
        sourceRef: `refs/tags/${tag}`,
        sourceDigest: sourceCommit,
        conclusion: "success",
      },
    },
  };
  return { policy, ledger: { releases: history } };
}

function validateLedgerEntry(entry) {
  assert.deepEqual(
    Object.keys(entry).sort(),
    [
      "acceptance",
      "archiveSha256",
      "buildInfoSha256",
      "commit",
      "productionEligible",
      "tag",
    ],
    "release ledger entry has unexpected fields",
  );
  assert.match(
    entry.tag,
    /^aperture-worker-v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/,
    "release ledger tag is malformed",
  );
  assert.match(entry.commit, /^[0-9a-f]{40}$/, "release ledger commit is malformed");
  assertSha256(entry.archiveSha256, "release ledger archive digest");
  assertSha256(entry.buildInfoSha256, "release ledger BUILDINFO digest");
  assert.equal(
    ["production", "rejected", "dogfood"].includes(entry.acceptance),
    true,
    "release ledger acceptance is invalid",
  );
  assert.equal(typeof entry.productionEligible, "boolean");
  assert.equal(
    entry.productionEligible,
    entry.acceptance === "production",
    "release ledger eligibility does not match acceptance",
  );
}


async function stagePayload(extracted, policy, ledger) {
  await mkdir(stagedRoot, { mode: 0o700 });
  for (const directory of ["evidence", "schemas", "lib"]) {
    await cp(
      path.join(extracted, directory),
      path.join(stagedRoot, directory),
      { recursive: true },
    );
  }
  await cp(
    path.join(extracted, "fixtures", "omp-direct"),
    path.join(stagedRoot, "fixtures", "omp-direct"),
    { recursive: true },
  );
  await cp(
    path.join(extracted, "integrations", "omp"),
    path.join(stagedRoot, "integrations", "omp"),
    { recursive: true },
  );
  await mkdir(path.join(stagedRoot, "config"), {
    recursive: true,
    mode: 0o700,
  });
  await cp(
    path.join(extracted, "BUILDINFO.json"),
    path.join(stagedRoot, "BUILDINFO.json"),
  );
  await writeFile(
    path.join(stagedRoot, "config", "artifact-policy.json"),
    `${JSON.stringify(policy, null, 2)}\n`,
    { mode: 0o644 },
  );
  await mkdir(path.join(stagedRoot, ".github"), {
    recursive: true,
    mode: 0o700,
  });
  await writeFile(
    path.join(stagedRoot, ".github", "aperture-worker-release-ledger.json"),
    `${JSON.stringify(ledger, null, 2)}\n`,
    { mode: 0o644 },
  );
  for (const relative of await walkFiles(stagedRoot)) {
    await chmod(path.join(stagedRoot, relative), 0o644);
  }
  for (const directory of [
    ".github",
    "config",
    "evidence",
    "fixtures",
    "fixtures/omp-direct",
    "integrations",
    "integrations/omp",
    "lib",
    "schemas",
  ]) {
    await chmod(path.join(stagedRoot, directory), 0o755);
  }
}

async function installTransaction() {
  const removals = new Set(["config/identities.json", "release"]);
  const targets = [
    "config/identities.json",
    "evidence",
    "fixtures/omp-direct",
    "integrations/omp",
    "lib",
    "release",
    "schemas",
    "BUILDINFO.json",
    ".github/aperture-worker-release-ledger.json",
    "config/artifact-policy.json",
  ];
  const installed = [];
  const backedUp = [];
  await mkdir(backupRoot, { mode: 0o700 });
  try {
    for (const relative of targets) {
      const target = path.join(pluginRoot, relative);
      const staged = path.join(stagedRoot, relative);
      const backup = path.join(backupRoot, relative);
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await mkdir(path.dirname(backup), { recursive: true, mode: 0o700 });
      try {
        await rename(target, backup);
        backedUp.push(relative);
      } catch (error) {
        if (!hasCode(error, "ENOENT")) throw error;
      }
      if (!removals.has(relative)) {
        await rename(staged, target);
        installed.push(relative);
      }
    }
    await run(verifier, ["--require-production"], { cwd: pluginRoot });
  } catch (error) {
    const rollbackFailures = [];
    for (const relative of [...installed].reverse()) {
      try {
        await rm(path.join(pluginRoot, relative), {
          recursive: true,
          force: true,
        });
      } catch (rollbackError) {
        rollbackFailures.push(rollbackError);
      }
    }
    const policyPath = "config/artifact-policy.json";
    const restorationOrder = [
      ...backedUp.filter((relative) => relative !== policyPath).reverse(),
      ...(backedUp.includes(policyPath) ? [policyPath] : []),
    ];
    for (const relative of restorationOrder) {
      const backup = path.join(backupRoot, relative);
      const target = path.join(pluginRoot, relative);
      try {
        await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        await rename(backup, target);
      } catch (rollbackError) {
        rollbackFailures.push(rollbackError);
      }
    }
    if (rollbackFailures.length > 0) {
      preserveVendorRecovery = true;
      throw new AggregateError(
        [error, ...rollbackFailures],
        `vendor transaction rollback failed; recovery data retained at ${backupRoot}`,
      );
    }
    throw error;
  }
}


function expectedJsonlHandshakes(surfaceProtocolVersion, workerDirectProtocolVersion) {
  return {
    privateWorker: {
      protocolVersion: workerDirectProtocolVersion,
      peer: "aperture-attention-engine",
      framing: "jsonl",
      outputEncoding: "ascii-json-escapes",
      maximumLineBytes: 262_144,
      navigation: "validated-opaque-focus-only",
    },
    publicSurface: {
      protocolVersion: surfaceProtocolVersion,
      peer: "aperture-stdio",
      framing: "jsonl",
      outputEncoding: "ascii-json-escapes",
      maximumLineBytes: 262_144,
      navigation: "absent",
    },
  };
}

function expectedDirectSocketLifecycle() {
  return {
    directoryMode: "0700",
    socketMode: "0600",
    lifecycleLockMode: "0600",
    lifecycleSerialization: "hard-link-owner-lock",
    cleanupDeadlineMs: 1_500,
    cleanupExitCodes: { removedOrAbsent: 0, unsafe: 74, transient: 75 },
    startupErrorCode: "direct_transport_unavailable",
    startupExitCodes: { unsafe: 74, transient: 75 },
    startupFailureReadiness: "no-ready-or-snapshot",
  };
}

function requiredPayloadPaths() {
  return [
    "evidence/direct-node-22.23.2.json",
    "evidence/direct-privacy.json",
    "evidence/direct-transport.json",
    "evidence/node-22.23.2.json",
    "evidence/omp-adapter.json",
    "evidence/omp-only-worker.json",
    "evidence/omp-runtime-imports.json",
    "evidence/runtime-imports.json",
    "integrations/omp/aperture-omp-extension.mjs",
    "integrations/omp/package.json",
    "lib/aperture-attention-engine.cjs",
    "schemas/omp-worker-output.schema.json",
    "schemas/omp-attention-event.schema.json",
    "schemas/surface-protocol.schema.json",
    "schemas/worker-direct-message.schema.json",
    "fixtures/omp-direct/approval-request.json",
    "fixtures/omp-direct/input-request.json",
    "fixtures/omp-direct/failure-event.json",
    "fixtures/omp-direct/focus-registration.json",
    "fixtures/omp-direct/focus-registration-direct-terminal.json",
    "fixtures/omp-direct/focus-registration-tmux.json",
    "fixtures/omp-direct/focus-activation.json",
    "fixtures/omp-direct/focus-result.json",
    "fixtures/omp-direct/completion-event.json",
    "fixtures/omp-direct/completion-resolved-event.json",
    "fixtures/omp-direct/snapshot-failure.json",
    "fixtures/omp-direct/snapshot-completion.json",
    "fixtures/omp-direct/snapshot-completion-resolved.json",
    "fixtures/omp-direct/snapshot-now-next.json",
    "fixtures/omp-direct/snapshot-resolved.json",
  ];
}

async function walkFiles(root, relative = "") {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = relative ? path.posix.join(relative, entry.name) : entry.name;
    const absolute = path.join(root, child);
    const metadata = await lstat(absolute);
    assert.equal(
      metadata.isSymbolicLink(),
      false,
      `symlink found in payload: ${child}`,
    );
    if (metadata.isDirectory()) files.push(...(await walkFiles(root, child)));
    else if (metadata.isFile()) files.push(child);
    else throw new Error(`unsupported filesystem entry in payload: ${child}`);
  }
  return files;
}

function assertSafeArchivePath(value) {
  assert.equal(typeof value, "string");
  assert.ok(
    value.length > 0 && !value.startsWith("/"),
    `unsafe archive path: ${value}`,
  );
  assert.equal(
    /[\x00-\x1f\x7f]/.test(value),
    false,
    `control character in archive path: ${value}`,
  );
  const parts = value.replace(/\/$/, "").split("/");
  assert.equal(
    parts.some((part) => part === "" || part === "." || part === ".."),
    false,
  );
  assert.ok(
    [
      "BUILDINFO.json",
      "evidence",
      "fixtures",
      "integrations",
      "lib",
      "schemas",
    ].includes(parts[0]),
    `unexpected archive root: ${value}`,
  );
}

function assertSafePayloadPath(value) {
  assertSafeArchivePath(value);
  assert.equal(
    value.endsWith("/"),
    false,
    `payload file path ends in slash: ${value}`,
  );
  assert.ok(
    /^(evidence|fixtures\/omp-direct|integrations\/omp|lib|schemas)\/[A-Za-z0-9._-]+$/.test(
      value,
    ),
    `payload file path is outside the closed layout: ${value}`,
  );
  assert.equal(
    /(?:node_modules|\.map$|installer|downloader)/i.test(value),
    false,
  );
}

async function fileIdentity(filePath) {
  const metadata = await stat(filePath);
  const content = await readFile(filePath);
  return {
    bytes: metadata.size,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}


function assertSha256(value, label) {
  assert.match(String(value ?? ""), /^[0-9a-f]{64}$/, `${label} is invalid`);
}

function assertPositiveInteger(value, label) {
  assert.equal(
    Number.isSafeInteger(value) && value > 0,
    true,
    `${label} is invalid`,
  );
}

function assertPositiveIntegerOrZero(value, label) {
  assert.equal(
    Number.isSafeInteger(value) && value >= 0,
    true,
    `${label} is invalid`,
  );
}

function splitLines(value) {
  const normalized = value.endsWith("\n") ? value.slice(0, -1) : value;
  return normalized ? normalized.split("\n") : [];
}

async function ghJson(args) {
  return JSON.parse((await run("gh", args)).stdout);
}

async function run(command, args, options = {}) {
  return execFileAsync(command, args, {
    cwd: options.cwd ?? pluginRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    env: process.env,
  });
}

function hasCode(error, code) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === code,
  );
}
