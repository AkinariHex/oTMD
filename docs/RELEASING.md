# Releasing oTMD

Every release is built by hand, no CI. Tauri does not cross-compile, so each OS is built on that OS:
Windows here, Linux on a Linux machine or WSL, macOS on a Mac. A platform you skip is simply left out of
that release.

## Channels

| Version | GitHub release | Updater file |
|---|---|---|
| `3.0.0-beta.N` | **pre-release**, tag `v3.0.0-beta.N` | `updater/beta.json` |
| `3.0.0` | normal release, tag `v3.0.0` | `updater/stable.json` |

- The app reads its channel file from `https://raw.githubusercontent.com/AkinariHex/oTMD/master/updater/<channel>.json`,
  so the file must be pushed to **master** (it can be pushed on its own before the code is merged).
- Normal builds read `stable.json`. Beta builds add `--config src-tauri/tauri.beta.conf.json` and read `beta.json`.
- Betas must stay pre-releases: GitHub's "latest release" skips them, which keeps the Electron 2.x app from seeing them.
- Versions sort as `3.0.0-beta.1 < 3.0.0-beta.2 < 3.0.0`, so beta users update through every beta and onto the final.
- When `3.0.0` ships, write `stable.json` and copy it over `beta.json` too: beta users move to the stable build,
  which reads `stable.json` from then on.

## Signing key (once)

The updater only installs files signed with your private key. Lose it and installed copies can never auto-update
again (users would reinstall by hand), so keep a backup.

```powershell
npx tauri signer generate -w "$HOME\otmd.key"
```

- Choose a password. The key file is one line of text, already encrypted with that password.
- Put the **public** key (`otmd.key.pub`) in `src-tauri/tauri.conf.json` -> `plugins.updater.pubkey` and commit it.
- Store the private key text and its password in your password manager (one item). That is the copy that follows you to a new PC.
- Keep one offline copy (USB stick in a drawer, or printed). Never commit it; a GitHub secret is not a backup since it cannot be read back.
- Delete `otmd.key` from disk once it is stored.

Only the PC that builds a release needs the key, and only for that shell. Any PC can develop with `npm run tauri dev`,
or make a test exe without signing with `npx tauri build --no-bundle`.

## Build

1. Set the version in `src-tauri/tauri.conf.json`, `package.json` and `src-tauri/Cargo.toml`, add a `CHANGELOG.md` entry, commit.
2. Run the checks: `cargo clippy --all-targets`, `cargo test` (in `src-tauri`), `npm run build`.
3. In a fresh shell, load the key for this session only. The variable takes a path to `otmd.key` or the key text itself:

   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = "$HOME\otmd.key"
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = Read-Host "Key password" -MaskInput
   ```

   bash: `export TAURI_SIGNING_PRIVATE_KEY=~/otmd.key` and `read -rs TAURI_SIGNING_PRIVATE_KEY_PASSWORD; export TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
   Run this in your own terminal, never through an AI assistant. Close the shell when done.
4. Build. Add `--config src-tauri/tauri.beta.conf.json` for a beta (use `npx`: PowerShell strips the `--` of `npm run tauri build -- ...`):

   ```powershell
   npx tauri build --config src-tauri/tauri.beta.conf.json
   ```

### Windows

Output in `src-tauri/target/release/bundle/nsis/`: `*_x64-setup.exe` and `*_x64-setup.exe.sig`.

Portable zip (exe + `portable.txt`, data stays in a `data` folder next to it):

```powershell
$version = (Get-Content src-tauri\tauri.conf.json | ConvertFrom-Json).version
$portable = "src-tauri\target\release\portable"
New-Item -ItemType Directory -Force $portable | Out-Null
Copy-Item src-tauri\target\release\otmd.exe $portable
New-Item -ItemType File -Force "$portable\portable.txt" | Out-Null
Compress-Archive -Force "$portable\*" "src-tauri\target\release\bundle\oTMD_${version}_x64_portable.zip"
```

Portable copies do not update themselves: at launch they show a toast and a sidebar link to the new release page.

### Linux (WSL on the Windows PC)

One-time setup in the Ubuntu (WSL) terminal:

```bash
sudo apt update
sudo apt install -y build-essential curl wget file rsync libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# close and reopen the Ubuntu terminal, then:
nvm install --lts
```

Check that `which node npm cargo` points inside Linux (`/home/...`), not to `/mnt/c/...`.

Each release, in the Ubuntu terminal:

```bash
cd /mnt/c/CodingPersonal/oTMD
export TAURI_SIGNING_PRIVATE_KEY=/mnt/c/Users/<you>/otmd.key
read -rs TAURI_SIGNING_PRIVATE_KEY_PASSWORD; export TAURI_SIGNING_PRIVATE_KEY_PASSWORD
bash scripts/build-linux.sh --beta    # drop --beta for a stable release
```

The script builds from a copy in `~/otmd-build` (Windows `node_modules` cannot run on Linux) and copies the
`.AppImage` + `.sig` (used by the updater) and the `.deb` into `release/`.

### macOS (needs a Mac)

One-time setup: Xcode command line tools (`xcode-select --install`), Rust (`rustup`), Node LTS, then
`rustup target add aarch64-apple-darwin x86_64-apple-darwin`. Clone the repo and `npm ci`.

Each release, one universal build that runs on Apple Silicon and Intel:

```bash
export TAURI_SIGNING_PRIVATE_KEY=~/otmd.key
read -rs TAURI_SIGNING_PRIVATE_KEY_PASSWORD; export TAURI_SIGNING_PRIVATE_KEY_PASSWORD
npx tauri build --target universal-apple-darwin --config src-tauri/tauri.beta.conf.json
```

Output in `src-tauri/target/universal-apple-darwin/release/bundle/`: `dmg/*_universal.dmg` and
`macos/*.app.tar.gz` + `.sig`. The `.app.tar.gz` name has no version, so rename it and its `.sig` to
`oTMD_<version>_universal.app.tar.gz` before copying them into `release/`.
The app is ad-hoc signed (`signingIdentity: "-"`), not notarized: on first launch users right-click the app > Open.

## Publish

1. Copy every artifact and its `.sig` into `release/` at the repo root (git-ignored).
2. `npm run release:manifest`. It renames files to `oTMD_...` (GitHub rewrites spaces and `!` in asset names),
   checks each one matches the version, and writes `updater/beta.json` or `updater/stable.json`.
3. Create the GitHub release with tag `v<version>` (pre-release for betas) and upload everything in `release/`
   except the `.sig` files: installer, portable zip, AppImage, deb, dmg, `.app.tar.gz`.
4. Commit and push the updater json to master. This push is what makes installed apps update.

## Test an update

1. Install the current version with the setup exe.
2. Release the next version (for example `3.0.0-beta.2`) as above.
3. Start the installed app: the update screen downloads, installs and restarts on the new version.
   raw.githubusercontent can cache the json for a few minutes.
