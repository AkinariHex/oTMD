// Writes updater/<channel>.json from the signed artifacts collected in release/. See docs/RELEASING.md.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RELEASE_DIR = "release";
const REPO = "https://github.com/AkinariHex/oTMD/releases/download";
const PLATFORMS = [
  ["windows-x86_64", /-setup\.exe$/],
  ["linux-x86_64", /\.AppImage$/],
  ["darwin-aarch64", /(aarch64|universal).*\.app\.tar\.gz$/],
  ["darwin-x86_64", /(x64|x86_64|universal).*\.app\.tar\.gz$/],
];

const { version } = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const channel = version.includes("-") ? "beta" : "stable";

if (!existsSync(RELEASE_DIR)) {
  console.error(`Put the artifacts and their .sig files in ${RELEASE_DIR}/ first.`);
  process.exit(1);
}

// GitHub rewrites spaces and "!" in asset names, so "osu! Tourney Match Displayer_..." would not match its URL.
for (const file of readdirSync(RELEASE_DIR)) {
  const safe = file.replace(/^[^_]*_/, "oTMD_");
  if (safe !== file) renameSync(join(RELEASE_DIR, file), join(RELEASE_DIR, safe));
}

const files = readdirSync(RELEASE_DIR);
const platforms = {};
for (const [platform, pattern] of PLATFORMS) {
  const artifact = files.find((file) => pattern.test(file) && files.includes(`${file}.sig`));
  if (!artifact) continue;
  if (!artifact.includes(version)) {
    console.error(`${artifact} is not version ${version}.`);
    process.exit(1);
  }
  platforms[platform] = {
    signature: readFileSync(join(RELEASE_DIR, `${artifact}.sig`), "utf8").trim(),
    url: `${REPO}/v${version}/${artifact}`,
  };
}

if (Object.keys(platforms).length === 0) {
  console.error(`No signed artifact found in ${RELEASE_DIR}/.`);
  process.exit(1);
}

mkdirSync("updater", { recursive: true });
const manifest = { version, notes: `https://github.com/AkinariHex/oTMD/releases/tag/v${version}`, pub_date: new Date().toISOString(), platforms };
writeFileSync(`updater/${channel}.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`updater/${channel}.json: ${Object.keys(platforms).join(", ")}`);
