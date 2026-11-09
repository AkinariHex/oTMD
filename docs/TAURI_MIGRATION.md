# oTMD → Tauri 2 migration spec

This file is the single source of truth for porting oTMD from Electron 16 to Tauri 2
(Rust core + React UI). Claude Code: read this whole file before any work, do ONE phase
per session, and do not start a phase until the previous one meets its acceptance criteria.

---

## 0. Non-negotiable goals (in priority order)

1. **Zero cost while in tray.** Players are in-game. When the app is in the tray, the
   WebView must NOT exist (destroy the window, never `hide()`). Only the Rust core runs:
   tray icon + one poller task + the axum server feeding OBS. No GPU, no JS, no timers
   besides the poller. Process priority below-normal + Windows Efficiency Mode.
2. Never run elevated, never raise priority. Remove `requireAdministrator`, `perMachine`,
   and the old `os.setPriority(-20)` behavior.
3. Small and light: system WebView, no Node runtime, overlay files embedded in the binary.
4. Windows, Linux, macOS from one codebase. Installed AND portable builds.
5. Existing OBS browser sources at `http://localhost:21086/visualizer` keep working.

## 1. Current app (what exists today)

- `public/electron/*` — Electron main process: `ipc.js` (settings + window controls),
  `express.js` (overlay static server, :21086 prod / :3001 dev), `websocket.js`
  (ws server :9052, polls osu! every 10 s), `systemTray.js`, `autoUpdate.js`,
  `obsFinder.js` (find `obs64.exe`), `fileCheck.js` (creates data folder + default settings).
- `public/osu/*` — match logic: `main.js` (dispatch by Stage/MatchType),
  `match/1v1.js`, `match/teamVS.js`, `match/qualifiers.js`, `functions/score.js`,
  `functions/scoremodification.js`, `functions/players.js`, `functions/teams.js`,
  `functions/tournament.js` (GET `https://otmd.app/api/tournaments/app?t=<acronym>`).
- `public/visualizer/*` — OBS overlay (plain HTML/JS, `data.js` connects to `ws://127.0.0.1:9052`).
- `src/*` — React 17 UI (CRA). 9 files use `window.require("electron").ipcRenderer`.
- Settings: `settingsApp.json` in `%APPDATA%/otmd` (Windows) or `~/Documents/otmd` (Linux),
  plus `teams/` (team images) and `exports/`. Shape:
  `{ accounts[], matchSettings{ActiveAccount, MatchID, MatchType, Stage, BestOF,
  MapsNqualifiers, Warmups, ScoreReverse, isFinished}, displayerSettings{VisualizerStyle,
  SmallDisplayer, TransparentBackground}, appSettings{CompactUI, SystemTray,
  ExportMatches{status, apikey}} }`

## 2. Known bugs to FIX during the port (do not replicate)

1. WS `initLoad` sends the whole settings file incl. every osu! API key; port has no origin check.
   → Overlay payloads must never contain API keys. Check `Origin` on WS upgrade.
2. `teamVS.js` hardcodes `localhost:3001` for team images (prod is 21086); sort comparator returns
   bool; `.filter()` result discarded. → use relative URLs `/teams/<file>`.
3. Qualifier average: `replace(",", "")` strips only the first comma. → keep scores numeric,
   format only for display.
4. Mod multipliers don't stack (each branch recomputes from the original score); `HDHR`/`HDEZ`/`EZFL`
   keys can never match; missing `SD` key crashes. → define and test explicit combination rules
   (see Phase 2), missing multiplier = 1.0.
5. Caches never hit (`oldTournament` never set; arrays compared by reference). → cache tournament
   and player lookups per MatchID.
6. `changeActiveAccount` creates a new WebSocketServer each time → EADDRINUSE.
7. IPC listeners registered inside every WS connection → leak; double writers on settings file.
8. One global interval → only the last connected overlay gets updates.
9. Settings JSON re-read from disk 5–6× per tick. → in-memory state, write on change.
10. macOS paths undefined.
11. `otmd://` protocol and `.otmdt` association registered but unhandled → drop unless implemented.
12. Export to otmd.app runs inside every overlay (duplicate posts/webhooks with 2 OBS scenes).
    → move export to the Rust core, once per match.

## 2a. Auth change: one account, osu! API v2 OAuth (decided after Phase 1, overrides the rest of this file)

Drop `accounts[]`, `ActiveAccount`, account switching and every osu! API v1 key. One logged-in
account via OAuth. Legacy import takes match/displayer/app settings only; never read or copy v1 keys.
The website `ExportMatches.apikey` is separate and stays.

- **Secret:** lives on otmd.app, see `docs/OTMD_APP_OAUTH_BROKER.md`. **Phase 3 login needs that
  broker deployed first.** The app holds only the broker base URL, no client ID or secret.
- **Login:** through the website, not osu! directly. Open
  `https://otmd.app/api/auth/desktop/login?state=<S>&code_challenge=<C>` in the system browser. The
  site returns to `http://127.0.0.1:21086/oauth/callback`. Reject a mismatched `state`, then POST
  `code`, `code_binding` and the PKCE verifier to `/api/osu/oauth/token`.
- **Website API key check:** `GET /api/validate` now takes `Authorization: Bearer <key>`, never `?api=`.
- **Match export (Phase 4):** `POST https://otmd.app/api/match`, JSON, `Authorization: Bearer <key>`, once
  per finished match. The owner comes from the key. Saves the match and posts to the user's Discord channels.
  Fields: `matchID`, `matchType` (`1vs1`/`teamVS`), `stage`, `tournament{name,acronym}`, `matchStart`, and
  - versus: `bestOF`, `warmups`, `scores{winner}` (1 or 2) with `player1`/`player2` and `players[2]{userid,username}`
    for 1vs1, or `team1`/`team2` and `teams[2]` for teamVS; optional `matchCost[]{id,username,side,cost}`, `side` is
    `red`/`blue`, computed by the app.
  - `stage: "Qualifiers"`: `player{userid,username}`, `totalMaps`, `scores{list[]{score,mods[]},average}`.

  Responses: 201 `{message:"saved",discord:"sent"|"skipped"|"failed"}`, 200 `already saved`, 400, 401, 429, 500.
- **Data:** the app calls osu! v2 directly with the access token, `GET /matches/{id}`, not v1
  `get_match`. Events are paged (`before`/`after`/`limit`, max 101), so poll with `after=` the event
  before the first unfinished game, or the last seen event id if none: osu! finishes a game by updating
  its existing event. Pin `x-api-version: 20220704`, newer versions change the score shape.
- **Storage:** `auth.json` in the data dir, atomic writes, separate from `settingsApp.json`. Tokens
  never reach React or overlay payloads. Holds a `public identify` token only, in plain text like
  the old keys; move to the OS keychain if the scope ever grows.

### Auto-refresh (must never interrupt a stream)

- Runs in the Rust core, independent of window state, so it works in tray. No second task: the
  poller sleeps until the earlier of next poll or refresh due, keeping goal #1. The refresh timer
  still runs when the poller is idle with no MatchID, so long idle periods can't lapse the session.
- Refresh when half the lifetime has passed (from `expires_in`, about 12 h remaining), which rides
  out a broker outage. Also check on startup and after system wake, and refresh once on a 401.
- Refresh tokens rotate: one refresh at a time, and write the new tokens to disk before using them.
- Network errors, 429 and 5xx: keep tokens, retry with backoff (1 min → max 15 min), keep polling
  with the still-valid access token.
- Only broker `invalid_grant` ends the session: mark logged out, keep the overlay showing its last
  data, show a tray notification and a re-login prompt. Never show a login screen for a temporary
  failure.

### Consequences

- `obs_active` only hid the API key on Profile, so `obs.rs` and `sysinfo` are dropped unless
  something else needs them.
- Login page becomes one "Login with osu!" button. Profile gets Logout and loses the key field.
- Remove the React `fetch` to `osu.ppy.sh` and its `connect-src` CSP entry in Phase 3.

## 3. Target architecture

```
src-tauri/src/
  main.rs / lib.rs   builder, plugins, tray, RunEvent::ExitRequested → prevent_exit
  settings.rs        typed Settings (serde), RwLock in app state, data-dir resolution
                     (portable vs installed), legacy import
  osu.rs             reqwest client (rustls), get_match / get_user, typed structs
  tournament.rs      otmd.app tournament lookup, cached per acronym
  scoring.rs         PURE functions: one_v_one, team_vs, qualifiers, mods → unit tested
  poller.rs          single tokio task; sleeps on Notify when no MatchID or finished;
                     10 s interval otherwise; broadcasts only when payload changed
  server.rs          axum on 127.0.0.1:21086: GET /visualizer, embedded static files
                     (rust-embed), GET /teams/* from data dir, GET /ws (broadcast subscriber)
  export.rs          otmd.app POST + discord webhook, once per finished match
  window.rs          open_main / send_to_tray (destroy) / power::background|foreground
  obs.rs             sysinfo: is OBS running (obs64.exe / obs / OBS)
  commands.rs        #[tauri::command] wrappers used by React
src/                 React UI (Vite + TS), src/lib/api.ts wraps invoke()/listen()
overlay/             former public/visualizer, embedded into the binary
```

Crates: tauri 2, tokio, axum, tower-http, rust-embed, reqwest (rustls-tls, json), serde,
serde_json, sysinfo, thiserror, tracing. Windows only: `windows` crate
(Win32_System_Threading, Win32_Foundation).
Plugins: tauri-plugin-updater, tauri-plugin-opener, tauri-plugin-single-instance,
optional tauri-plugin-window-state.

### Tray / zero-cost rules (goal #1, details)

- Tray icon always exists (Open / Quit, double-click opens).
- `send_to_tray`: `window.destroy()` then `power::background()`:
  `SetPriorityClass(BELOW_NORMAL_PRIORITY_CLASS)`, `SetProcessInformation(ProcessPowerThrottling,
  EXECUTION_SPEED)` (Efficiency mode), `SetProcessWorkingSetSize(-1,-1)`.
- `open_main`: `power::foreground()` (NORMAL, throttling off), recreate window with
  `WebviewWindowBuilder` (label "main", 1000×600, not resizable, `decorations(false)`).
- `RunEvent::ExitRequested { code: None }` → `api.prevent_exit()`. Quit menu → `app.exit(0)`.
- OS minimize (`WindowEvent::Resized` + `is_minimized()`) → `send_to_tray` when
  `appSettings.SystemTray` is true.
- macOS: `ActivationPolicy::Accessory` while in tray.
- tokio runtime capped at 2 worker threads. No `timeBeginPeriod`. No busy loops.
- React holds NO authoritative state: on mount it fetches everything via `invoke`.
- Fallback ONLY if WebView2 processes linger after destroy (verify in Task Manager):
  split into `otmd.exe` (core, no WebView) + `otmd-ui.exe` (UI, spawned/killed by core).

### Portable vs installed

- If `portable.txt` (or `data/`) exists next to the exe → data dir = `<exe dir>/data`,
  WebView2 data dir also there. Else → `app_config_dir()`.
- Windows release artifacts: NSIS installer (per-user, no admin) + zip with exe + `portable.txt`.
- Updater only in installed mode; portable mode checks GitHub releases and links to the zip.

### Overlay changes (minimal)

- WS URL → `ws://127.0.0.1:21086/ws` (same port as HTTP).
- Remove `sendMatchToWebsite` (moved to core).
- Reconnect with backoff (1 s → max 10 s) instead of a fixed 1 s loop.
- Message shapes (`initLoad`, `matchSettings`, `displayerSettings`) stay compatible,
  minus API keys.

## 4. Phases (one per Claude Code session, one branch/commit each)

### Phase 1 — Scaffold
Tauri 2 + Vite + React + TS in this repo (new branch `tauri`). Move `src/` over, add
`src/lib/api.ts` with stubbed functions mirroring every current IPC channel. UI renders.
Custom title bar uses `data-tauri-drag-region`.
**Accept:** `npm run tauri dev` opens the UI on Windows; no `window.require` left in `src/`.

### Phase 2 — Scoring in Rust with tests
Port `score.js` + `scoremodification.js` into `scoring.rs` as pure functions over typed
structs. Fix bugs 3, 4. Add fixtures in `src-tauri/tests/fixtures/` (real v2 `GET /matches/{id}`
JSONs, see section 2a: 1v1, teamVS, qualifiers, with warmups). Where the new result intentionally differs from
the old JS, document it in a test comment.
**Accept:** `cargo test` green; every bug fix has a test.

### Phase 3 — Settings + commands
`settings.rs` with typed Settings, portable/installed dir resolution, first-run legacy
import from the old path, atomic writes (write temp + rename). Implement all commands
and wire `api.ts` to them. Add OAuth login, `auth.json` and auto-refresh per section 2a, with
`server.rs` starting as just the callback route.
**Accept:** OAuth login survives restart; logout works; match/displayer/app settings persist;
refresh tested with a forced near-expiry token; a broker outage keeps the session, `invalid_grant`
ends it.

### Phase 4 — Server + poller + overlay
`server.rs`, `poller.rs`, `osu.rs`, `tournament.rs`, `export.rs`. Broadcast to N overlays.
Fix bugs 1, 2, 5–9, 12. Update overlay JS as in section 3.
**Accept:** two OBS browser sources update simultaneously from a real lobby; payload has
no tokens or API keys; logging out and back in doesn't crash; poller idles when no MatchID.

### Phase 5 — Tray, power, updater
Everything in "Tray / zero-cost rules". Updater plugin wired to
the AppUpdate page (progress events).
**Accept:** in tray, Task Manager shows no `msedgewebview2.exe` children of oTMD,
`otmd.exe` ~0% CPU, Efficiency mode leaf visible, OBS overlay still updating.

### Phase 6 — Packaging + CI
`tauri.conf.json` bundles: NSIS (per-user), zip portable, AppImage + deb, macOS dmg.
GitHub Actions matrix (windows/ubuntu/macos) with `tauri-apps/tauri-action`, signed
updater artifacts (`TAURI_SIGNING_PRIVATE_KEY` secret), `latest.json` on releases.
**Accept:** tag push produces all artifacts; installed app auto-updates from a test release.

### Phase 7 — Hand-off from Electron
Last Electron 2.x release whose update screen links to the v3 download. README update.

## 5. Rules for Claude Code

- Read this file first every session. Work only on the current phase.
- Use plan mode before writing code; show the plan, then implement.
- Never reintroduce: admin rights, priority boosts, API keys in overlay payloads,
  `hide()` for tray, Node in the UI.
- Run `cargo clippy`, `cargo test`, `npm run build` before declaring a phase done.
- Commit at the end of each phase with a clear message. Update the checklist below.

## 6. Progress checklist

- [x] Phase 1 — Scaffold
- [x] Phase 2 — Scoring + tests (done after Phase 3: real fixtures need a login)
- [x] Phase 3 — Settings + commands
- [ ] Phase 4 — Server + poller + overlay
- [ ] Phase 5 — Tray, power, OBS, updater
- [ ] Phase 6 — Packaging + CI
- [ ] Phase 7 — Electron hand-off
