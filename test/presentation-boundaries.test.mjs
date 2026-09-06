import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");
const manifest = JSON.parse(await read("manifest.json"));

await access(path.join(root, manifest.preview));
const readme = await read("README.md");
for (const [, image] of readme.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) {
  if (!/^https?:\/\//.test(image)) await access(path.join(root, image));
}

process.stdout.write("ok - plugin preview and README screenshots are available\n");
