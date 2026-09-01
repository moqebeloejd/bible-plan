import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const read = name => fs.readFileSync(path.join(root, name));
const digest = source => crypto.createHash("sha256").update(source).digest("hex").slice(0, 12);

const canonicalAssets = [
  {sourceName:"icon.svg", extension:"svg", sizes:"any", type:"image/svg+xml", purpose:"any", normalize:true},
  {sourceName:"icon-180.png", extension:"png", sizes:"180x180", type:"image/png", purpose:"any"},
  {sourceName:"icon-192.png", extension:"png", sizes:"192x192", type:"image/png", purpose:"any maskable"},
  {sourceName:"icon-512.png", extension:"png", sizes:"512x512", type:"image/png", purpose:"any maskable"}
].map(asset => {
  const raw = read(asset.sourceName);
  const source = asset.normalize ? Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8") : raw;
  const revision = digest(source);
  const basename = path.basename(asset.sourceName, `.${asset.extension}`);
  return {...asset, source, revision, assetName:`${basename}.${revision}.${asset.extension}`};
});

const bySourceName = new Map(canonicalAssets.map(asset => [asset.sourceName, asset]));
const appleIcon = bySourceName.get("icon-180.png");
const manifestIcons = ["icon-192.png","icon-512.png","icon.svg"].map(name => bySourceName.get(name));
const bundleRevision = digest(Buffer.concat(canonicalAssets.flatMap(asset => [Buffer.from(asset.sourceName), asset.source])));

const readText = name => read(name).toString("utf8");
const iconUrlPattern = /(?:\.\/)?icon(?:-(?:180|192|512))?(?:\.[a-f0-9]{12})?\.(?:svg|png)(?:\?v=\d+)?/g;
const canonicalNameForUrl = value => {
  const name = value.replace(/^\.\//, "").replace(/\?v=\d+$/, "");
  if(name.endsWith(".svg"))return "icon.svg";
  const sized = name.match(/^icon-(180|192|512)/);
  return sized ? `icon-${sized[1]}.png` : null;
};
const updateIconUrls = text => text.replace(iconUrlPattern, match => {
  const asset = bySourceName.get(canonicalNameForUrl(match));
  return asset ? `${match.startsWith("./") ? "./" : ""}${asset.assetName}` : match;
});

const manifestSource = readText("manifest.json");
const manifestEol = manifestSource.includes("\r\n") ? "\r\n" : "\n";
const manifest = JSON.parse(manifestSource);
manifest.id = "./";
manifest.icons = manifestIcons.map(({assetName,sizes,type,purpose}) => ({src:assetName,sizes,type,purpose}));

let html = updateIconUrls(readText("index.html"));
html = html.replace(/(<link rel="apple-touch-icon" href=")[^"]+/, `$1${appleIcon.assetName}`);

let serviceWorker = updateIconUrls(readText("sw.js")).replace(
  /const ICON_REVISION = "[a-f0-9]{12}";/,
  `const ICON_REVISION = "${bundleRevision}";`
);
serviceWorker = serviceWorker.replace(/const ASSETS = (\[[^\n]*\]);/, (_line,json) => {
  const assets = JSON.parse(json).filter(asset => !/^\.\/icon(?:-(?:180|192|512))?(?:\.[a-f0-9]{12})?\.(?:svg|png)$/.test(asset));
  const iconAssets = canonicalAssets.map(asset => `./${asset.assetName}`);
  return `const ASSETS = ${JSON.stringify([...assets.slice(0,3),...iconAssets,...assets.slice(3)])};`;
});

const expected = {
  "index.html": html,
  "manifest.json": `${JSON.stringify(manifest, null, 2).replace(/\n/g, manifestEol)}${manifestEol}`,
  "sw.js": serviceWorker
};

const stale = [];
for (const [name, content] of Object.entries(expected)) {
  const current = readText(name);
  if (current === content) continue;
  if (checkOnly) stale.push(name);
  else fs.writeFileSync(path.join(root, name), content);
}

for (const asset of canonicalAssets) {
  const assetPath = path.join(root, asset.assetName);
  const raw = fs.existsSync(assetPath) ? read(asset.assetName) : null;
  const current = raw && asset.normalize ? Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8") : raw;
  const matches = current?.equals(asset.source);
  if(matches)continue;
  if(checkOnly)stale.push(asset.assetName);
  else fs.writeFileSync(assetPath, asset.source);
}

if (stale.length) {
  throw new Error(`PWA icon references are stale: ${stale.join(", ")}. Run npm run sync:pwa-icon.`);
}

console.log(JSON.stringify({
  revision:bundleRevision,
  assets:canonicalAssets.map(({sourceName,assetName}) => ({source:sourceName,asset:assetName})),
  mode:checkOnly ? "check" : "sync"
}));
