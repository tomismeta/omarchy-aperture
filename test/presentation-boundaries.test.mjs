import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");
const manifest = JSON.parse(await read("manifest.json"));

const settingKeys = manifest.barWidget.schema.map((entry) => entry.key).sort();
assert.deepEqual(settingKeys, ["ambientDisplay", "privacyMode"]);
await access(path.join(root, manifest.preview));

process.stdout.write("ok - presentation settings and preview are available\n");
