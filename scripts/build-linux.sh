#!/usr/bin/env bash
# Builds the Linux release inside WSL. Run from the repo: bash scripts/build-linux.sh [--beta]
# Needs TAURI_SIGNING_PRIVATE_KEY (path or key text) and TAURI_SIGNING_PRIVATE_KEY_PASSWORD set. See docs/RELEASING.md.
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
work="$HOME/otmd-build"
config=()
[[ "${1:-}" == "--beta" ]] && config=(--config src-tauri/tauri.beta.conf.json)

# Windows node_modules hold Windows binaries and /mnt/c is slow, so build from a copy in the Linux filesystem.
mkdir -p "$work"
rsync -a --delete --exclude node_modules --exclude src-tauri/target --exclude release --exclude graphify-out --exclude .git "$repo/" "$work/"
cd "$work"
npm ci
# linuxdeploy is itself an AppImage, and WSL has no FUSE to mount it.
APPIMAGE_EXTRACT_AND_RUN=1 npx tauri build --bundles appimage deb "${config[@]}"

mkdir -p "$repo/release"
cp src-tauri/target/release/bundle/appimage/*.AppImage src-tauri/target/release/bundle/appimage/*.AppImage.sig src-tauri/target/release/bundle/deb/*.deb "$repo/release/"
echo "Linux artifacts copied to release/"
