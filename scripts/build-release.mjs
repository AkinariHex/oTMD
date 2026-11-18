// Release builds from Windows: `npm run build:windows`, `npm run build:linux` or `npm run build:all`.
// Needs TAURI_SIGNING_PRIVATE_KEY (path or key text) and TAURI_SIGNING_PRIVATE_KEY_PASSWORD in this shell. See docs/RELEASING.md.
// A prerelease version (anything with a "-", like 3.0.0-beta.1) builds with the beta updater channel.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(repo, "src-tauri", "tauri.conf.json"), "utf8"));
const beta = version.includes("-");
const targets = process.argv.slice(2);

function run(command, args, env = process.env) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: repo, stdio: "inherit", env, shell: process.platform === "win32" && command === "npx" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function requireSigningKey() {
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY || process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD === undefined) {
    console.error("Set TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PASSWORD in this shell first. See docs/RELEASING.md.");
    process.exit(1);
  }
}

function buildWindows() {
  run("npx", ["tauri", "build", ...(beta ? ["--config", "src-tauri/tauri.beta.conf.json"] : [])]);

  // Portable zip: the exe plus portable.txt, which keeps the data in a folder next to it.
  const release = join(repo, "src-tauri", "target", "release");
  const portable = join(release, "portable");
  rmSync(portable, { recursive: true, force: true });
  mkdirSync(portable, { recursive: true });
  copyFileSync(join(release, "otmd.exe"), join(portable, "otmd.exe"));
  writeFileSync(join(portable, "portable.txt"), "");
  const zip = join(release, "bundle", `oTMD_${version}_x64_portable.zip`);
  rmSync(zip, { force: true });
  // Windows' own tar (not Git's GNU tar, which may come first on PATH) writes zip archives with -a.
  const tar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  run(tar, ["-a", "-c", "-f", zip, "-C", portable, "otmd.exe", "portable.txt"]);
  console.log(`\nWindows: installer in src-tauri/target/release/bundle/nsis, portable zip at ${zip}`);
}

function buildLinux() {
  // WSL only sees the variables listed in WSLENV. /p turns a Windows key path into a Linux one; key text passes as is.
  const keyIsFile = existsSync(process.env.TAURI_SIGNING_PRIVATE_KEY);
  const forwarded = [`TAURI_SIGNING_PRIVATE_KEY${keyIsFile ? "/p" : ""}`, "TAURI_SIGNING_PRIVATE_KEY_PASSWORD", process.env.WSLENV].filter(Boolean).join(":");
  run("wsl.exe", ["-d", "Ubuntu", "--", "bash", "scripts/build-linux.sh", ...(beta ? ["--beta"] : [])], { ...process.env, WSLENV: forwarded });
}

const builds = { windows: buildWindows, linux: buildLinux };
if (targets.length === 0 || targets.some((target) => !(target in builds))) {
  console.error("Usage: node scripts/build-release.mjs windows|linux [...]");
  process.exit(1);
}

requireSigningKey();
console.log(`Building ${version}${beta ? " on the beta channel" : ""}: ${targets.join(", ")}`);
for (const target of targets) builds[target]();
