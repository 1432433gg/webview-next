import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const layout = resolve(process.argv[2] ?? ".");
const arch = process.argv[3];
const load = async file => JSON.parse(await readFile(file, "utf8"));
const blob = digest => resolve(layout, "blobs", ...digest.split(":"));
const index = await load(resolve(layout, "index.json"));
const entry = index.manifests.find(item => !item.platform || item.platform.architecture === arch);
assert.ok(entry, `OCI manifest missing for ${arch}`);
const manifest = await load(blob(entry.digest));
const config = await load(blob(manifest.config.digest));
assert.equal(config.architecture, arch);
console.log(JSON.stringify({
  platform: `${config.os}/${config.architecture}`,
  manifest: entry.digest,
  compressedLayerBytes: manifest.layers.reduce((total, layer) => total + layer.size, 0),
}));
