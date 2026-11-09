# oTMD → Tauri 2 migration spec

This file is the single source of truth for porting oTMD from Electron 16 to Tauri 2
(Rust core + React UI). Claude Code: read this whole file before any work, do ONE phase
per session, and do not start a phase until the previous one meets its acceptance criteria.

---

## 0. Non-negotiable goals (in priority order)

1. **Zero cost while in tray.** Players are in-game. When the app is in the tray, the
   WebView must NOT exist (destroy the window, never `hide()`). Only the Rust core runs:
   tray icon + one poller task + the axum server feeding OBS. No GPU, no JS, no timers
   besides the poller. Process priority idle + Windows Efficiency Mode.
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
  SmallDisplayer, TransparentBackground}, appSettings{CompactUI, TrayBehavior,
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
  ranked.rs          PURE life-point rules + parser for the official sources (Phase 8)
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

- Tray icon always exists (Open / Quit, single click opens).
- `send_to_tray`: `window.destroy()` then `power::background()`:
  `SetPriorityClass(IDLE_PRIORITY_CLASS)`, `SetProcessInformation(ProcessPowerThrottling,
  EXECUTION_SPEED)` (Efficiency mode), `SetProcessWorkingSetSize(-1,-1)`.
- `open_main`: `power::foreground()` (NORMAL, throttling off), recreate window with
  `WebviewWindowBuilder` (label "main", 1000×600, not resizable, `decorations(false)`).
- `RunEvent::ExitRequested { code: None }` → `api.prevent_exit()`. Quit menu → `app.exit(0)`.
- X or OS close → `send_to_tray` with `TrayBehavior: closeToTray` (default), quit otherwise. OS minimize → `send_to_tray` only when
  `TrayBehavior` is `minimizeToTray`.
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

### Phase 6 - UI foundation
Tray and window lifecycle stay exactly as Phase 5 left them. No GPUI, no warm hide.
- React 17 to 19: `ReactDOM.render` becomes `createRoot` in `src/index.jsx`. formik, react-router 6
  and iconsax accept React 19. Replace `react-sweet-progress` with shadcn `Progress`.
- Add `motion`, `lucide-react`, `sonner`. Add only the shadcn primitives a screen actually uses.
  New or rewritten components are `.tsx`. iconsax is removed here: React 19 ignores the `defaultProps`
  its icons depend on.
- Keep the Tailwind setup (`source(none)`, no preflight) until the last legacy CSS is gone in Phase 7.
- `appSettings` gains `Animations` and `HardwareAcceleration`, both default `true`, both with serde
  defaults so existing settings files load unchanged. Both are shadcn `Switch` rows in App Settings.
- **Animations off:** `MotionConfig reducedMotion="always"` plus `data-animations="off"` on `<html>`
  zeroing CSS transitions and keyframes. Applied before `window_ready`, so nothing animates on open.
  With the switch on, OS reduced-motion is still respected (`reducedMotion="user"`). OBS overlays are
  not affected.
- **Hardware acceleration off:** Windows, `--disable-gpu` through `additional_browser_args` in
  `open_main`; that call replaces Tauri's default WebView2 flags, so pass those too. Linux,
  `WEBKIT_DISABLE_COMPOSITING_MODE=1` set before WebKit starts. macOS has no switch: hide the row.
  Takes effect on the next app start and the row says so. No automatic restart, it would stop tracking.

**Accept:** every existing screen works on React 19; both switches persist; animations off leaves no
running transition; GPU off starts WebView2 with `--disable-gpu` and the GPU column in Task Manager
stays near 0 after a restart (the GPU process still exists, rendering in software); tray cost unchanged
from Phase 5.

### Phase 7 - Redesign, login, animations
Window stays 1000x600, not resizable, and hidden until the first screen is ready. Direction chosen
through prototypes: Plus Jakarta Sans bundled with the app, no Maximize button, two layouts selectable
from Settings (`appSettings.Layout`: Sidebar by default, or Tabs).
- Rebuild on shadcn: shell, Match, Overlay, Settings, Profile, Changelog, Update.
  Forms keep their current fields and validation. Delete each legacy CSS file as its screen moves.
- Match and Overlay show the real overlay in a frame (`/visualizer?preview=1`), so the preview always
  matches OBS. Preview connections are not counted as sources.
- Overlay page: one card per overlay with its own URL and SVG thumbnail. Ranked and Broadcast stay
  disabled until Phases 8 and 9 add them.
- Match, Ranked and Broadcast fields accept the full osu! link as well as the ID.
- **Login page:** one "Login with osu!" action, a visible waiting-for-browser state with cancel and
  retry, clear messages for port 21086 in use and expired session. Tokens still never reach React.
- **Animations:** route transitions, staggered entrances on first paint of a list, press feedback,
  animated number changes, shared-element movement for the nav indicator. `opacity` and `transform`
  only. Micro interactions up to 150 ms, transitions up to 300 ms. Nothing loops while idle.
- Errors and confirmations go through sonner.

**Accept:** no legacy page CSS left; every action has loading and error feedback; route changes hold
60 fps on the integrated GPU; all screens remain usable with animations off.

### Phase 8 - osu!lazer Ranked Play
Port from `../oTMD_v3` what the user sees, not how it was built. **Do not port:** `new Function` on
downloaded text, the client secret, access tokens passing through the renderer, Express on port 22088,
history files inside `src/`, `localhost:3001` calls. v3 also fetches a pinned fork commit and its regex
no longer matches upstream, so it is stuck on an old formula without base damage or personal multipliers.

**Mode:** `appSettings.Mode` (`Tournament` default, `Ranked`). One mode at a time. The existing poller
task gains the mode as its work source; no second task, and it sleeps when the mode has nothing to do.

**Finding the room:** automatic with `GET /rooms?type_group=ranked-play&mode=participated&is_active=true`
every 30 s while Ranked is on, with a manual room ID as fallback. `GET /rooms/{id}/events` every 10 s
during a match. Needs only the `public` scope already granted. Before writing the parser, save a real
response as a fixture: the event payload may now include beatmap objects, making v3's per-beatmap fetch
unnecessary. Rating comes from `matchmaking_stats` on `GET /users/{id}`.

**Life points:** the official API never exposes life or damage, they exist only on the spectator
server's SignalR state, so the core recomputes them. `ranked.rs`, pure and unit tested. Current rule
(upstream `cbb4d38`, 2026-05-18), identical for every ruleset:

```
global(round)    = global_start + global_step * (round - 1)      every played round, ties included
personal(winner) = personal_start + personal_step * rounds_won_before_this_round
damage           = ceil((winner_score - loser_score) * (global + personal)) + base_damage
new_life         = max(old_life == max_life ? 1 : 0, old_life - damage)   loser only; a tie deals nothing
```

Values today: `max_life` 1,000,000, `base_damage` 50,000, all four multiplier values 0.5. Process rounds
in `played_at` order. A player with no score counts as 0.

**Staying current automatically.** Rules are data, parsed from the official repositories into a typed
`RankedRules`. Never evaluate downloaded text.
- Sources on `raw.githubusercontent.com`, branch `master`. `ppy/osu`, under
  `osu.Game/Online/Multiplayer/MatchTypes/RankedPlay/`: `RankedPlayUserInfo.cs` (`Life`, personal start),
  `RankedPlayRoomState.cs` (global start). `ppy/osu-server-spectator`, under
  `osu.Server.Spectator/Hubs/Multiplayer/Matchmaking/RankedPlay/`: `Stages/ResultsStage.cs` (`BaseDamage`,
  personal step), `Stages/RoundWarmupStage.cs` (global step), `RankedPlayMatchController.cs`.
- Each number comes from an anchored regex accepting numeric literals only, then a range check.
- Sentinels confirm the formula's shape: the normalized lines computing `attackMultiplier`,
  `totalDamage` (`Math.Ceiling`) and `NewLife` must be present.
- Changed numbers apply automatically. A missing sentinel, failed parse or out-of-range value keeps
  the last good rules and shows "ranked rules may be outdated" in the UI, never in the overlay.
  All sources must pass together: no partial updates.
- Embedded baseline plus `ranked-rules.json` in the data dir, atomic write. Fetched at most once per
  24 h and only when a ranked session starts, 15 s timeout, 1 MB cap per file. Failure never blocks play.
- Rules are frozen per match, so a mid-match update cannot change a running score.

**Known limits, shown as they are:** a forfeit (life set to 0) and the failed-download penalty
(100,000 x global multiplier, no base damage) are not visible through the API. A room that ends with
both players alive shows "match ended" and never invents a winner. `master` can briefly run ahead of
what is deployed.

**Output:** the oTMD_v3 overlay designs in plain JS on the embedded server and the existing `/ws`, one URL per
view so several can run as separate OBS sources: `/ranked` (health), `/ranked/maps`, `/ranked/ratio`,
`/visualizer/maps`, `escapeHtml` on every API string. Finished matches are saved once to the
existing `POST /api/rooms` from Rust, through the export retry path and only with a valid export key.

Room responses use the current API format: only `GET /matches` pins `x-api-version`.

**Accept:** tests cover first-hit survival at 1 life, ceiling, tie, personal multiplier growth,
unmultiplied base damage, malformed upstream files and a changed constant. A real ranked match matches
the in-game life bar round by round. Tray cost unchanged while a ranked match updates the overlay.

### Phase 9 - Tournament broadcast mode
For streamers of someone else's tournament. New `Broadcast` value for `Mode`.
- A list of up to 8 matches, added by MP link or ID; each row reuses the match config fields
  (type, stage, best of, warmups, reverse). The list survives restart; finished matches stay until removed.
- Reuses `Tracker` and `scoring.rs` per match inside the same poller task, one match per slice
  (10 s divided by the number of matches, minimum 1.25 s), so 8 matches stay under 60 requests a minute
  including player lookups. Back off on 429.
- With no logged-in player to anchor sides, red and blue follow the lobby name order.
- Overlay `/broadcast` (own card on the Overlay page): 1 match full size, 2 to 4 stacked, 5 to 8 compact grid, transparent background.
  `?matches=<id,id>` selects a subset so several OBS sources can show different matches.
- **Never exported:** other people's matches are not posted to the user's account or Discord.

**Accept:** 4 live or replayed lobbies update in a single OBS source; adding or removing a match needs
no restart; one failing lobby does not stall the others; no request bursts in the log; no tokens in
payloads; tray cost unchanged.

### Phase 10 - Home dashboard
New `/app/home`, first nav item and default route for logged-in users.

Do the website first, on a branch, and deploy before the app part. New `GET /api/match/stats`,
`Authorization: Bearer <export key>`: aggregates for the key's owner only, never accepts a user ID, rate
limited with `consumeRateLimit`, returns no webhook or key data.

| Section | Source |
|---|---|
| Saved matches: total, win rate, by type, top tournaments, average match cost, last 10 | `GET /api/match/stats` |
| Ranked: rating, wins and losses, recent rooms | osu! API, `/users/{id}`, `/rooms?type_group=ranked-play&mode=participated` |
| Live status: current mode, tracked match, overlay URL | local state |

Fetched by a Rust command only while the window is open, 60 s in-memory cache. Without an export key the
saved section shows how to connect one and the rest still works. Tournament matches that were tracked but
never exported do not exist anywhere, so they are not counted.

**Accept:** another user's data is unreachable with any key; site down or no key leaves a usable screen
with a sonner error at most once; numbers match a hand count on a known account; no dashboard work in tray.

### Phase 11 - Packaging + CI
`tauri.conf.json` bundles: NSIS (per-user), zip portable, AppImage + deb, macOS dmg.
GitHub Actions matrix (windows/ubuntu/macos) with `tauri-apps/tauri-action`, signed
updater artifacts (`TAURI_SIGNING_PRIVATE_KEY` secret), `latest.json` on releases.
The maintainer generates the signing key and keeps it; only the public key goes in `plugins.updater.pubkey`.
Portable mode checks GitHub releases and links to the zip.
**Accept:** tag push produces all artifacts; installed app auto-updates from a test release.

### Phase 12 - Hand-off from Electron
Last Electron 2.x release whose update screen links to the v3 download. README update.
Delete the legacy `public/electron` and `public/osu` sources.

## 5. Rules for Claude Code

- Read this file first every session. Work only on the current phase.
- Use plan mode before writing code; show the plan, then implement.
- Never reintroduce: admin rights, priority boosts, API keys in overlay payloads,
  `hide()` for tray, Node in the UI.
- Never evaluate downloaded text (`eval`, `new Function`, expression interpreters). Remote data
  becomes typed values and is validated.
- New network calls live in Rust; React receives finished views. New background work runs inside the
  single poller task and adds nothing while idle or in tray.
- Run `cargo clippy`, `cargo test`, `npm run build` before declaring a phase done.
- Commit at the end of each phase with a clear message. Update the checklist below.

## 6. Progress checklist

- [x] Phase 1 — Scaffold
- [x] Phase 2 — Scoring + tests (done after Phase 3: real fixtures need a login)
- [x] Phase 3 — Settings + commands
- [x] Phase 4 — Server + poller + overlay
- [x] Phase 5 — Tray, power, updater
- [x] Phase 6 - UI foundation
- [x] Phase 7 - Redesign, login, animations
- [x] Phase 8 - osu!lazer Ranked Play
- [ ] Phase 9 - Tournament broadcast mode
- [ ] Phase 10 - Home dashboard
- [ ] Phase 11 - Packaging + CI
- [ ] Phase 12 - Electron hand-off
