import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = relative => readFile(new URL(`../${relative}`, import.meta.url), "utf8");
const report = JSON.parse(await read("evidence/runtime-imports.json"));
const bundled = new Set();
for (const source of report.sourceFiles) {
  if (!source.includes("node_modules/")) continue;
  const match = /\/\.pnpm\/([^/]+)\/node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(source);
  assert.ok(match, `unrecognized bundled dependency path: ${source}`);
  const [, installed, name] = match;
  const prefix = `${name.replace("/", "+")}@`;
  assert.ok(installed.startsWith(prefix), `unrecognized bundled package identity: ${source}`);
  bundled.add(`${name}@${installed.slice(prefix.length).split("_")[0]}`);
}
const notices = await read("THIRD-PARTY-NOTICES");
const sections = notices.split(/^Package: /m).slice(1);
const covered = sections.map(section => section.split("\n")[0]);
assert.equal(new Set(covered).size, covered.length, "duplicate bundled notice");
assert.deepEqual(covered.sort(), [...bundled].sort(), "notices must cover exactly the bundled package versions");
for (const section of sections) {
  assert.match(section, /Copyright \(c\)/, "bundled notice must retain attribution");
  if (section.includes("\nLicense: MIT\n")) {
    assert.match(section, /Permission is hereby granted/);
    assert.match(section, /The above copyright notice and this permission notice/);
    assert.match(section, /THE SOFTWARE IS PROVIDED "AS IS"/);
  } else if (section.includes("\nLicense: BSD-3-Clause\n")) {
    assert.match(section, /Redistributions in binary form must reproduce/);
    assert.match(section, /The names of any contributors may not be used/);
    assert.match(section, /THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS/);
  } else {
    assert.fail("new bundled license requires a distribution-notice review");
  }
}
process.stdout.write("ok - distribution notices cover every bundled third-party package version and license conditions\n");
