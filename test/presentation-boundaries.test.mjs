import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");
const panel = await read("Panel.qml");
const presentation = await read("PanelPresentationLogic.js");
const focus = await read("PanelFocusLogic.js");
const peek = await read("AttentionPeek.qml");
const manifest = JSON.parse(await read("manifest.json"));

for (const source of [panel, presentation, focus, peek]) {
  assert.equal(source.includes(".sort("), false, "renderer must preserve canonical order");
  assert.equal(/\bDate(?:\.now|\s*\()/.test(source), false, "renderer must not derive wait time");
  assert.equal(source.includes(".timing"), false, "renderer must not inspect protocol timestamps");
}
assert.equal(/\bKeyboardPanel\s*\{/.test(peek), false);
assert.equal(peek.includes("HyprlandFocusGrab"), false);
assert.equal(peek.includes("WlrKeyboardFocus"), false);
for (const forbidden of ["FileView", "StandardPaths", "fixtures/", "execDetached"])
  assert.equal(panel.includes(forbidden), false, `production panel bypasses its model boundary with ${forbidden}`);
const settingKeys = manifest.barWidget.schema.map((entry) => entry.key).sort();
assert.deepEqual(settingKeys, ["ambientDisplay", "privacyMode"]);
await access(path.join(root, manifest.preview));

process.stdout.write("ok - renderer preserves canonical semantics, passive preview, and model boundaries\n");
