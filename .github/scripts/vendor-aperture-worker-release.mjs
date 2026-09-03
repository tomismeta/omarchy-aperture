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
const directSigner = `${sourceRepository}/.github/workflows/aperture-worker-direct-release.yml`;
const reportSigner = `${sourceRepository}/.github/workflows/aperture-worker-release-evidence.yml`;
const maximumTextArtifactBytes = 524_288;
const requiredApertureVersion = "0.10.0";
const requiredCoreVersion = "0.9.0";
const requiredOmpVersion = "0.1.0";
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
    "tagName,isDraft,isPrerelease,url,assets",
  ]);
  assert.equal(release.tagName, tag, "release tag mismatch");
  assert.equal(release.isDraft, false, "release is still a draft");
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
    "release-metadata.json",
    "release-report.json",
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
  const releaseReportPath = path.join(downloadRoot, "release-report.json");
  const releaseMetadataPath = path.join(downloadRoot, "release-metadata.json");
  const archive = await fileIdentity(archivePath);
  assert.equal(
    await readFile(archiveChecksumPath, "utf8"),
    `${archive.sha256}  ${archiveName}\n`,
    "archive checksum file mismatch",
  );
  const releaseMetadata = await readJson(releaseMetadataPath);
  const releaseReport = await readJson(releaseReportPath);
  validateReleaseMetadata(releaseMetadata, releaseReport, sourceCommit);
  validateReleaseReport(releaseReport, sourceCommit, archive);
  const reportIdentity = await fileIdentity(releaseReportPath);
  assert.equal(
    releaseMetadata.releaseReport.bytes,
    reportIdentity.bytes,
    "report byte count mismatch",
  );
  assert.equal(
    releaseMetadata.releaseReport.sha256,
    reportIdentity.sha256,
    "report digest mismatch",
  );

  await verifyWorkflowChain(releaseReport, releaseMetadata, sourceCommit);
  await verifyAttestation(
    archivePath,
    sourceCommit,
    directSigner,
    releaseReport.archiveAttestationReference,
  );
  await verifyAttestation(
    releaseReportPath,
    sourceCommit,
    reportSigner,
    releaseMetadata.releaseReport.attestationReference,
  );
  await validateAndExtractArchive(archivePath, extractedRoot, releaseReport);

  const buildInfoPath = path.join(extractedRoot, "BUILDINFO.json");
  const buildInfoIdentity = await fileIdentity(buildInfoPath);
  assert.equal(
    await readFile(buildInfoChecksumPath, "utf8"),
    `${buildInfoIdentity.sha256}  BUILDINFO.json\n`,
    "BUILDINFO checksum file mismatch",
  );
  const buildInfo = await readJson(buildInfoPath);
  validateBuildInfo(buildInfo, releaseReport, sourceCommit, buildInfoIdentity);
  await verifyAttestation(
    buildInfoPath,
    sourceCommit,
    directSigner,
    releaseReport.buildInfoAttestationReference,
  );
  await verifyExtractedPayload(
    extractedRoot,
    buildInfo,
    sourceCommit,
    releaseReport.provenanceAttestationReference,
  );

  const policy = await createArtifactPolicy(
    buildInfo,
    releaseReport,
    releaseMetadata,
    archive,
    buildInfoIdentity,
    reportIdentity,
    sourceCommit,
  );
  await stagePayload(extractedRoot, releaseReportPath, policy);
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
}

async function assertTargetsAreUnmodified() {
  const targets = [
    "BUILDINFO.json",
    "config/artifact-policy.json",
    "config/identities.json",
    "evidence",
    "fixtures/omp-direct",
    "integrations/omp",
    "lib",
    "release/release-report.json",
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

function validateReleaseMetadata(metadata, report, sourceCommit) {
  assert.equal(metadata.schemaVersion, 1, "release metadata schema mismatch");
  assert.equal(metadata.sourceTag, tag, "release metadata tag mismatch");
  assert.equal(
    metadata.sourceCommit,
    sourceCommit,
    "release metadata commit mismatch",
  );
  assert.equal(
    String(metadata.evidenceFinalizerRunId),
    String(report.finalization?.runId),
    "release metadata finalizer run mismatch",
  );
  assert.deepEqual(
    Object.keys(metadata.releaseReport ?? {}).sort(),
    ["attestationReference", "bytes", "path", "sha256"],
    "release metadata report identity is malformed",
  );
  assert.equal(
    metadata.releaseReport.path,
    "release-report.json",
    "release report path mismatch",
  );
  assertPositiveInteger(
    metadata.releaseReport.bytes,
    "release report byte count",
  );
  assertSha256(metadata.releaseReport.sha256, "release report digest");
  assertAttestationUrl(
    metadata.releaseReport.attestationReference,
    "release report attestation",
  );
}

function validateReleaseReport(report, sourceCommit, archive) {
  assert.equal(report.schemaVersion, 2, "release report schema mismatch");
  assert.equal(report.status, "passed", "release report did not pass");
  assert.equal(report.signedTag, tag, "release report tag mismatch");
  assert.equal(
    report.signedTagCommit,
    sourceCommit,
    "release report commit mismatch",
  );
  assert.equal(report.sourceDirty, false, "release source was dirty");
  assert.equal(
    report.aperturePackageVersion,
    requiredApertureVersion,
    "public package version mismatch",
  );
  assert.equal(
    report.apertureCoreVersion,
    requiredCoreVersion,
    "Core version mismatch",
  );
  assert.equal(
    report.ompPackageVersion,
    requiredOmpVersion,
    "private OMP version mismatch",
  );
  assert.equal(
    report.artifactArchiveSha256,
    archive.sha256,
    "release archive digest mismatch",
  );
  assert.equal(
    report.artifactUrl,
    `https://github.com/${sourceRepository}/releases/download/${tag}/${tag}.tar.gz`,
    "release archive URL mismatch",
  );
  assert.equal(
    report.allValidationsPassed,
    true,
    "release validations did not all pass",
  );
  assert.equal(
    report.fixedIdentitiesMatched,
    true,
    "fixed identity validation did not pass",
  );
  assert.deepEqual(
    report.unmetPrerequisites,
    [],
    "release has unmet prerequisites",
  );
  assert.equal(
    report.artifactLimits?.maximumTextArtifactBytes,
    maximumTextArtifactBytes,
  );
  assert.equal(
    report.workerBytes <= maximumTextArtifactBytes,
    true,
    "worker exceeds marketplace cap",
  );
  assert.equal(
    report.integrations?.omp?.bytes <= maximumTextArtifactBytes,
    true,
    "OMP extension exceeds marketplace cap",
  );
  assert.equal(report.schemaVersions?.notificationOutputSchemaVersion, 4);
  assert.equal(report.schemaVersions?.surfaceProtocolVersion, 4);
  assert.equal(report.schemaVersions?.workerDirectProtocolVersion, 4);
  assert.deepEqual(
    report.schemaVersions?.jsonlHandshakes,
    expectedJsonlHandshakes(),
  );
  assert.deepEqual(
    report.directSocketLifecycle,
    expectedDirectSocketLifecycle(),
  );
  assert.deepEqual(report.finalization, {
    runId: report.finalization?.runId,
    workflowName: "Aperture Worker Release Evidence",
    event: "workflow_dispatch",
    sourceRef: `refs/tags/${tag}`,
    sourceDigest: sourceCommit,
  });
  assert.equal(Object.hasOwn(report.finalization, "conclusion"), false);
  assert.deepEqual(
    report.attestationPolicy,
    expectedAttestationPolicy(sourceCommit),
  );
  assertAttestationUrl(
    report.provenanceAttestationReference,
    "payload attestation",
  );
  assertAttestationUrl(
    report.buildInfoAttestationReference,
    "BUILDINFO attestation",
  );
  assertAttestationUrl(
    report.archiveAttestationReference,
    "archive attestation",
  );
}

async function verifyWorkflowChain(report, metadata, sourceCommit) {
  const ref = `refs/tags/${tag}`;
  await verifyRun(report.workflowChain?.releaseCheck?.runId, {
    name: "Release Check",
    path: ".github/workflows/release-check.yml",
    event: "push",
    branch: "main",
    commit: sourceCommit,
  });
  await verifyRun(report.workflowChain?.workerArtifact?.runId, {
    name: "Aperture Worker Artifact",
    path: ".github/workflows/aperture-worker-artifact.yml",
    event: "push",
    branch: tag,
    commit: sourceCommit,
  });
  await verifyRun(report.workflowChain?.directRelease?.runId, {
    name: "Aperture Worker Direct Release",
    path: ".github/workflows/aperture-worker-direct-release.yml",
    event: "workflow_dispatch",
    branch: tag,
    commit: sourceCommit,
  });
  await verifyRun(report.finalization?.runId, {
    name: "Aperture Worker Release Evidence",
    path: ".github/workflows/aperture-worker-release-evidence.yml",
    event: "workflow_dispatch",
    branch: tag,
    commit: sourceCommit,
  });
  for (const entry of Object.values(report.workflowChain ?? {})) {
    assert.equal(
      entry.conclusion,
      "success",
      "release report workflow conclusion mismatch",
    );
    assert.equal(
      entry.sourceDigest,
      sourceCommit,
      "release report workflow commit mismatch",
    );
  }
  assert.equal(report.workflowChain.releaseCheck.sourceRef, "refs/heads/main");
  assert.equal(report.workflowChain.workerArtifact.sourceRef, ref);
  assert.equal(report.workflowChain.directRelease.sourceRef, ref);
  assert.equal(report.finalization.sourceRef, ref);
  assert.equal(
    String(metadata.evidenceFinalizerRunId),
    String(report.finalization.runId),
  );
  const ids = [
    report.workflowChain.releaseCheck.runId,
    report.workflowChain.workerArtifact.runId,
    report.workflowChain.directRelease.runId,
    report.finalization.runId,
  ].map(String);
  assert.equal(
    new Set(ids).size,
    ids.length,
    "release workflow run IDs are not distinct",
  );
}

async function verifyRun(runId, expected) {
  assert.match(
    String(runId ?? ""),
    /^[1-9][0-9]*$/,
    "workflow run ID is malformed",
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
    run.head_branch,
    expected.branch,
    `${expected.name} source branch mismatch`,
  );
  assert.equal(
    run.head_sha,
    expected.commit,
    `${expected.name} source commit mismatch`,
  );
}

async function verifyAttestation(
  filePath,
  sourceCommit,
  signerWorkflow,
  attestationReference,
) {
  process.stdout.write(`Verifying attestation: ${path.basename(filePath)}\n`);
  assertAttestationUrl(attestationReference, "attestation");
  const attestationId = String(attestationReference).split("/").at(-1);
  const identity = await fileIdentity(filePath);
  const response = await ghJson([
    "api",
    `repos/${sourceRepository}/attestations/sha256:${identity.sha256}?per_page=100`,
  ]);
  assert.equal(
    Array.isArray(response.attestations),
    true,
    "attestation API response is malformed",
  );
  const exact = response.attestations.find((candidate) => {
    if (
      !candidate ||
      typeof candidate.bundle_url !== "string" ||
      !candidate.bundle ||
      typeof candidate.bundle !== "object"
    ) {
      return false;
    }
    const pathname = new URL(candidate.bundle_url).pathname;
    return pathname.endsWith(`/${attestationId}.json`) ||
      pathname.endsWith(`/${attestationId}.json.sn`);
  });
  assert.ok(exact, `attestation reference ${attestationId} is not bound to the artifact digest`);
  const bundlePath = path.join(temporaryRoot, `attestation-${attestationId}.json`);
  await writeFile(bundlePath, `${JSON.stringify(exact.bundle)}\n`, { mode: 0o600 });
  await run("gh", [
    "attestation",
    "verify",
    filePath,
    "--bundle",
    bundlePath,
    "--repo",
    sourceRepository,
    "--source-ref",
    `refs/tags/${tag}`,
    "--source-digest",
    sourceCommit,
    "--signer-workflow",
    signerWorkflow,
    "--deny-self-hosted-runners",
  ]);
}

async function validateAndExtractArchive(archivePath, destination, report) {
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
  assert.deepEqual(
    regularFiles,
    report.archiveMembers.map((member) => member.path),
    "archive regular-file membership or order differs from the release report",
  );
  await run("tar", ["-xzf", archivePath, "-C", destination]);
}

function validateBuildInfo(build, report, sourceCommit, identity) {
  assert.equal(build.schemaVersion, 1, "BUILDINFO schema mismatch");
  assert.equal(build.artifactType, "node-commonjs-bundle");
  assert.equal(build.worker, "aperture-attention-engine");
  assert.equal(build.minimumNodeVersion, "22.0.0");
  assert.equal(build.minimumNodeMajor, 22);
  assert.equal(build.apertureCommit, sourceCommit);
  assert.equal(build.apertureSourceTag, tag);
  assert.equal(build.releaseSeries, tag.replace(/\.\d+$/, ""));
  assert.equal(build.sourceDirty, false);
  assert.equal(build.payloadProfile, "release");
  assert.equal(build.trustedCi, true);
  assert.equal(build.aperturePackageVersion, requiredApertureVersion);
  assert.equal(build.apertureCoreVersion, requiredCoreVersion);
  assert.equal(build.ompPackageVersion, requiredOmpVersion);
  assert.equal(
    build.artifactLimits?.maximumTextArtifactBytes,
    maximumTextArtifactBytes,
  );
  assert.equal(
    build.provenanceAttestationReference,
    report.provenanceAttestationReference,
  );
  assert.equal(build.workerContract?.notificationInputSchemaVersion, 2);
  assert.equal(build.workerContract?.notificationOutputSchemaVersion, 4);
  assert.equal(build.workerContract?.surfaceProtocolVersion, 4);
  assert.equal(build.workerContract?.ompAttentionEventSchemaVersion, 2);
  assert.equal(build.workerContract?.workerDirectProtocolVersion, 4);
  assert.deepEqual(
    build.workerContract?.jsonlHandshakes,
    expectedJsonlHandshakes(),
  );
  assert.deepEqual(
    build.directSocketLifecycle,
    expectedDirectSocketLifecycle(),
  );
  assert.deepEqual(build.focusBackends, [
    "herdr-0.8.2",
    "foot-1.27",
    "tmux-3.7c",
  ]);
  assert.equal(build.focusCoordinator?.herdrProtocol, "raw-ndjson-0.8.2");
  assert.equal(
    build.focusCoordinator?.compositorExecutable,
    "/usr/bin/hyprctl",
  );
  assert.equal(
    build.focusCoordinator?.clientPolicy,
    "backend-scoped-single-client-admission",
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
  assert.equal(build.runtimeDependencies?.policy, "node-builtins-only");
  assert.equal(build.runtimeDependencies?.status, "passed");
  assert.equal(build.integrations?.omp?.packageVersion, requiredOmpVersion);
  assert.equal(
    build.integrations?.omp?.runtimeDependencies?.policy,
    "node-builtins-only",
  );
  assert.equal(build.integrations?.omp?.runtimeDependencies?.status, "passed");
  assert.equal(build.integrations?.omp?.validation?.status, "passed");
  assert.equal(build.integrations?.omp?.hostCompatibility?.status, "passed");
  assert.deepEqual(build.integrations?.omp?.hostCompatibility?.versions, [
    "18.0.11",
    "18.1.2",
  ]);
  assert.equal(build.workerBundle?.bytes <= maximumTextArtifactBytes, true);
  assert.equal(
    build.integrations?.omp?.bytes <= maximumTextArtifactBytes,
    true,
  );
  assert.equal(
    identity.sha256,
    report.buildInfoSha256,
    "release report BUILDINFO digest mismatch",
  );
  assert.equal(report.buildInfoPath, "BUILDINFO.json");
  assert.equal(report.filesManifestCount, build.files.length);
  assert.deepEqual(report.schemaVersions, build.workerContract);
  assert.deepEqual(report.directSocketLifecycle, build.directSocketLifecycle);
  assert.deepEqual(report.archiveMembers, [
    {
      path: "BUILDINFO.json",
      bytes: identity.bytes,
      sha256: identity.sha256,
      mode: "0644",
    },
    ...build.files,
  ]);
}

async function verifyExtractedPayload(root, build, sourceCommit, attestationReference) {
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
    await verifyAttestation(absolute, sourceCommit, directSigner, attestationReference);
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
  const identities = await readJson(
    path.join(root, "config", "identities.json"),
  );
  assert.deepEqual(identities, {
    schemaVersion: 1,
    identities: [
      {
        id: "omp",
        kind: "omp",
        label: "OMP",
        applicationNames: ["aperture-omp"],
      },
    ],
  });
}

async function createArtifactPolicy(
  build,
  report,
  metadata,
  archive,
  buildInfoIdentity,
  reportIdentity,
  sourceCommit,
) {
  let prior = {};
  try {
    prior = await readJson(
      path.join(pluginRoot, "config", "artifact-policy.json"),
    );
  } catch {
    prior = {};
  }
  const previousCurrent =
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
  const history = [
    previousCurrent,
    ...(Array.isArray(prior.provenanceHistory) ? prior.provenanceHistory : []),
  ]
    .filter(Boolean)
    .filter(
      (entry, index, entries) =>
        entry.tag !== tag &&
        entries.findIndex((item) => item.tag === entry.tag) === index,
    );
  return {
    schemaVersion: 3,
    artifactAcceptance: "production",
    productionEligible: true,
    approvedSourceTag: tag,
    apertureCommit: sourceCommit,
    versions: {
      aperture: requiredApertureVersion,
      apertureCore: requiredCoreVersion,
      ompIntegration: requiredOmpVersion,
    },
    minimumNodeVersion: "22.0.0",
    minimumNodeMajor: 22,
    artifactLimits: { maximumTextArtifactBytes },
    release: {
      immutable: true,
      attestationReferencesBound: true,
      url: `https://github.com/${sourceRepository}/releases/tag/${tag}`,
      archive: { name: `${tag}.tar.gz`, ...archive },
      buildInfo: {
        path: "BUILDINFO.json",
        ...buildInfoIdentity,
        attestationReference: report.buildInfoAttestationReference,
      },
      releaseReport: {
        path: "release/release-report.json",
        ...reportIdentity,
        attestationReference: metadata.releaseReport.attestationReference,
      },
      payloadAttestationReference: report.provenanceAttestationReference,
      archiveAttestationReference: report.archiveAttestationReference,
      attestationPolicy: report.attestationPolicy,
      workflowChain: {
        releaseCheck: compactRun(report.workflowChain.releaseCheck),
        workerArtifact: compactRun(report.workflowChain.workerArtifact),
        directRelease: compactRun(report.workflowChain.directRelease),
        evidenceFinalizer: {
          runId: String(report.finalization.runId),
          conclusion: "success",
        },
      },
    },
    provenanceHistory: history,
  };
}

function compactRun(run) {
  return { runId: String(run.runId), conclusion: "success" };
}

async function stagePayload(extracted, reportPath, policy) {
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
    path.join(extracted, "config", "identities.json"),
    path.join(stagedRoot, "config", "identities.json"),
  );
  await cp(
    path.join(extracted, "BUILDINFO.json"),
    path.join(stagedRoot, "BUILDINFO.json"),
  );
  await mkdir(path.join(stagedRoot, "release"), {
    recursive: true,
    mode: 0o700,
  });
  await cp(reportPath, path.join(stagedRoot, "release", "release-report.json"));
  await writeFile(
    path.join(stagedRoot, "config", "artifact-policy.json"),
    `${JSON.stringify(policy, null, 2)}\n`,
    { mode: 0o644 },
  );
  for (const relative of await walkFiles(stagedRoot)) {
    await chmod(path.join(stagedRoot, relative), 0o644);
  }
  for (const directory of [
    "config",
    "evidence",
    "fixtures",
    "fixtures/omp-direct",
    "integrations",
    "integrations/omp",
    "lib",
    "release",
    "schemas",
  ]) {
    await chmod(path.join(stagedRoot, directory), 0o755);
  }
}

async function installTransaction() {
  const targets = [
    "config/identities.json",
    "evidence",
    "fixtures/omp-direct",
    "integrations/omp",
    "lib",
    "release/release-report.json",
    "schemas",
    "BUILDINFO.json",
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
      await rename(staged, target);
      installed.push(relative);
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

function expectedAttestationPolicy(sourceCommit) {
  return {
    sourceRef: `refs/tags/${tag}`,
    sourceDigest: sourceCommit,
    payloadSignerWorkflow: directSigner,
    buildInfoSignerWorkflow: directSigner,
    archiveSignerWorkflow: directSigner,
    releaseReportSignerWorkflow: reportSigner,
  };
}

function expectedJsonlHandshakes() {
  return {
    privateWorker: {
      protocolVersion: 4,
      peer: "aperture-attention-engine",
      framing: "jsonl",
      outputEncoding: "ascii-json-escapes",
      maximumLineBytes: 262_144,
      navigation: "validated-opaque-focus-only",
    },
    publicSurface: {
      protocolVersion: 4,
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
  };
}

function requiredPayloadPaths() {
  return [
    "config/identities.json",
    "integrations/omp/aperture-omp-extension.mjs",
    "integrations/omp/package.json",
    "lib/aperture-attention-engine.cjs",
    "schemas/notification-worker-input.schema.json",
    "schemas/notification-worker-output.schema.json",
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
    "fixtures/omp-direct/status-event.json",
    "fixtures/omp-direct/snapshot-failure.json",
    "fixtures/omp-direct/snapshot-completion.json",
    "fixtures/omp-direct/snapshot-status.json",
    "fixtures/omp-direct/snapshot-now-next.json",
    "fixtures/omp-direct/snapshot-resolved.json",
    "fixtures/omp-direct/notification-fallback-ambient.json",
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
      "config",
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
    value === "config/identities.json" ||
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

function assertAttestationUrl(value, label) {
  assert.match(
    String(value ?? ""),
    /^https:\/\/github\.com\/tomismeta\/aperture\/attestations\/[1-9][0-9]*$/,
    `${label} URL is invalid`,
  );
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
