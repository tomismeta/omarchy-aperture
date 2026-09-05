import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isUtf8 } from "node:buffer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFile(path.join(root, relative), "utf8");
const execFileAsync = promisify(execFile);

const policy = JSON.parse(await read("config/artifact-policy.json"));
const releaseLedger = JSON.parse(
  await read(".github/aperture-worker-release-ledger.json"),
);
const buildInfo = JSON.parse(await read("BUILDINFO.json"));

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

assert.equal(policy.artifactAcceptance, "production");
assert.equal(policy.productionEligible, true);
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
assert.equal(buildInfo.trustedCi, true);

process.stdout.write(
  "ok - tracked files protect operator privacy and signed payload/distribution evidence agrees\n",
);
