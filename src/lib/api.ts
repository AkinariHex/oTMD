// Single boundary between the React UI and the Rust core.
// Calls still stubbed name their phase beside them (docs/TAURI_MIGRATION.md).
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";

export const OVERLAY_URL = "http://localhost:21086/visualizer";
export const RANKED_OVERLAY_URL = "http://localhost:21086/ranked";
export const MATCH_PREVIEW_URL = "http://127.0.0.1:21086/visualizer?preview=1";
export const RANKED_PREVIEW_URL = "http://127.0.0.1:21086/ranked?preview=1";
export const BROADCAST_URL = "http://localhost:21086/broadcast";

export interface User {
  id: number;
  username: string;
  country: string;
}

export interface MatchSettings {
  MatchID: string;
  MatchType: string;
  Stage: string;
  BestOF: string;
  MapsNqualifiers: string;
  Warmups: string;
  ScoreReverse: boolean;
  isFinished: boolean;
}

export interface DisplayerSettings {
  VisualizerStyle: string;
  SmallDisplayer: boolean;
  TransparentBackground: boolean;
  MatchLayout: "aurora" | "drift";
  MapsStyle: OverlayStyle;
}

export interface OverlaySources {
  match: number;
  ranked: number;
  broadcast: number;
}

export interface OverlayStyle {
  backgroundColor: string;
  backgroundOpacity: number;
  borderRadius: number;
  padding: number;
  fontFamily: string;
}

export interface RankedSettings {
  RoomID: string;
  Health: OverlayStyle;
  Maps: OverlayStyle;
  Ratio: OverlayStyle;
}

export interface RankedPlayer {
  id: number;
  username: string;
  life: number;
  maxLife: number;
  roundsWon: number;
  overflow: number;
}

export interface RankedRound {
  round: number;
  title: string;
  winner: number | null;
  damage: number;
}

export interface RankedView {
  roomId: number;
  status: "live" | "ended";
  round: number;
  players: RankedPlayer[];
  rounds: RankedRound[];
  winner: number | null;
}

export interface RankedStatus {
  enabled: boolean;
  view: RankedView | null;
  rulesOutdated: boolean;
}

export type Layout = "sidebar" | "tabs";
export type PreviewBackground = "checker" | "black" | "dark" | "gray" | "light" | "white" | "darkScene" | "lightScene" | "custom";

export interface AppSettings {
  Mode: "tournament" | "ranked" | "broadcast";
  Layout: Layout;
  PreviewBackground: PreviewBackground;
  TextSize: number;
  TrayBehavior: "closeToTray" | "minimizeToTray";
  ExportMatches: { status: boolean; apikey: string };
  Animations: boolean;
  HardwareAcceleration: boolean;
}

interface DownloadProgress {
  speed: number;
  percent: number;
  downloaded: number;
  total: number | null;
}

export type UpdatePhase = "download" | "install" | "restart";

export interface UpdateProgress extends DownloadProgress {
  phase: UpdatePhase;
}

export type LoginFailure = "denied" | "failed";

function subscribe<T>(event: string, listener: (payload: T) => void): () => void {
  const unlisten = listen<T>(event, ({ payload }) => listener(payload));
  return () => {
    void (async () => (await unlisten)())();
  };
}

export const getSession = (): Promise<User | null> => invoke("get_session");

export const getStartRoute = (): Promise<string> => invoke("get_start_route");

// The extra round trip lets the data requests of the first screen finish before it is shown.
export const showWindowWhenReady = async (): Promise<void> => {
  await getSession();
  await invoke("window_ready");
};

export const login = (): Promise<void> => invoke("login");

export const logout = (): Promise<void> => invoke("logout");

export const onSessionChanged = (listener: (user: User) => void): (() => void) =>
  subscribe("session-changed", listener);

export const onSessionExpired = (listener: () => void): (() => void) =>
  subscribe("session-expired", listener);

export const onLoginFailed = (
  listener: (reason: LoginFailure) => void
): (() => void) => subscribe("login-failed", listener);

export const getMatchSettings = (): Promise<MatchSettings> =>
  invoke("get_match_settings");

export const getDisplayerSettings = (): Promise<DisplayerSettings> =>
  invoke("get_displayer_settings");

export const getAppSettings = (): Promise<AppSettings> =>
  invoke("get_app_settings");

export const saveMatchSettings = (settings: MatchSettings): Promise<void> =>
  invoke("save_match_settings", { settings });

export const saveDisplayerSettings = (
  settings: DisplayerSettings
): Promise<void> => invoke("save_displayer_settings", { settings });

export const validateExportKey = (apikey: string): Promise<boolean> =>
  invoke("validate_export_key", { apikey });

export const saveAppSettings = (settings: AppSettings): Promise<void> =>
  invoke("save_app_settings", { settings });

export const getAppVersion = async (): Promise<string> =>
  (await invoke<{ version: string }>("get_app_info")).version;

export const getOverlaySources = (): Promise<OverlaySources> => invoke("get_overlay_sources");

export const onOverlayChanged = (listener: (sources: OverlaySources) => void): (() => void) =>
  subscribe("overlay-changed", listener);

export interface DashboardStats {
  totals: { all: number; oneVsOne: number; teamVS: number; qualifiers: number };
  oneVsOne: { wins: number; losses: number };
  topTournaments: { acronym: string; name: string; count: number }[];
}

export type SideIndex = 0 | 1;

export interface MatchSide {
  name: string;
  score: number;
  players: { id: number; username: string; cost: number }[];
}

export interface SavedMatch {
  matchID: string;
  type: string;
  stage: string;
  tournament: { acronym: string; name: string };
  banner: string | null;
  startTime: string | null;
  sides: [MatchSide, MatchSide];
  won: boolean | null;
  winner: SideIndex | null;
}

export interface RankedMatchRound {
  round: number;
  title: string;
  version: string;
  stars: number;
  cover: string | null;
  scores: [number, number];
  winner: SideIndex | null;
  damage: number;
  multiplier: number;
  life: [number, number];
}

export interface RankedMatchPlayer {
  id: number;
  username: string;
  roundsWon: number;
}

export interface RankedMatch {
  roomId: number;
  date: string;
  winner: SideIndex | null;
  maxLife: number;
  players: [RankedMatchPlayer, RankedMatchPlayer];
  rounds: RankedMatchRound[];
}

export interface DashboardData {
  siteStatus: "ok" | "noKey" | "invalidKey" | "unavailable";
  stats: DashboardStats | null;
  ranked: { rank: number | null; rating: number | null; plays: number; firstPlacements: number } | null;
}

export interface FeedCursor {
  saved: number | null;
  ranked: number;
}

export interface FeedPage {
  matches: SavedMatch[];
  rankedMatches: RankedMatch[];
  next: FeedCursor | null;
}

export const getMatchFeed = (cursor: FeedCursor): Promise<FeedPage> => invoke("get_match_feed", { cursor });

export const getSystemFonts = (): Promise<string[]> => invoke("get_system_fonts");

export const getPopularFonts = (): Promise<string[]> => invoke("get_popular_fonts");

export const onSettingsReplaced = (listener: () => void): (() => void) => subscribe("settings-replaced", listener);

export const getDashboard = (): Promise<DashboardData> => invoke("get_dashboard");

export const getRankedStatus = (): Promise<RankedStatus> => invoke("get_ranked_status");

export const setRankedEnabled = (enabled: boolean): Promise<void> => invoke("set_ranked_enabled", { enabled });

export const getRankedSettings = (): Promise<RankedSettings> => invoke("get_ranked_settings");

export const saveRankedSettings = (settings: RankedSettings): Promise<void> =>
  invoke("save_ranked_settings", { settings });

export interface BroadcastMatch {
  MatchID: string;
  MatchType: string;
  Stage: string;
  BestOF: string;
  Warmups: string;
  ScoreReverse: boolean;
}

export interface BroadcastStyle {
  look: "table" | "duel";
  pointAnimation: "pop" | "roll";
  singleTitle: boolean;
  title: string;
}

export interface BroadcastCard {
  matchId: string;
  status: "loading" | "live" | "finished" | "error";
  stage: string;
  bestOf: number;
  acronym: string;
  tournamentName: string;
  sides: [{ name: string; avatar: string | null; score: number }, { name: string; avatar: string | null; score: number }];
  winner: SideIndex | null;
}

export interface BroadcastStatus {
  enabled: boolean;
  matches: BroadcastMatch[];
  style: BroadcastStyle;
  view: BroadcastCard[] | null;
}

export const getBroadcastStatus = (): Promise<BroadcastStatus> => invoke("get_broadcast_status");

export const saveBroadcastMatches = (matches: BroadcastMatch[]): Promise<void> => invoke("save_broadcast_matches", { matches });

export const saveBroadcastStyle = (style: BroadcastStyle): Promise<void> => invoke("save_broadcast_style", { style });

export const setBroadcastEnabled = (enabled: boolean): Promise<void> => invoke("set_broadcast_enabled", { enabled });

// Dev-only preview of the update UI: VITE_PREVIEW_UPDATE=installed|portable. Stripped from release builds.
const PREVIEW_UPDATE = import.meta.env.DEV ? import.meta.env.VITE_PREVIEW_UPDATE : undefined;

export interface AvailableUpdate {
  version: string;
  url: string;
  portable: boolean;
}

// One check per launch, shared by the launch toast and the sidebar button. Nothing installs until the user asks.
let updateCheck: Promise<AvailableUpdate | null> | undefined;
export const availableUpdate = (): Promise<AvailableUpdate | null> => {
  updateCheck ??= PREVIEW_UPDATE
    ? Promise.resolve({ version: "3.0.0-beta.2", url: "https://github.com/AkinariHex/oTMD/releases", portable: PREVIEW_UPDATE === "portable" })
    : invoke<AvailableUpdate | null>("check_update").catch(() => null);
  return updateCheck;
};

// Installed copies download in place and restart; portable copies open the release page.
export const applyUpdate = async (update: AvailableUpdate): Promise<void> => {
  if (update.portable) {
    await openUrl(update.url);
    return;
  }
  window.location.hash = "/update";
  if (PREVIEW_UPDATE) return;
  try {
    await invoke("install_update");
  } catch (error) {
    window.history.back();
    throw error;
  }
};

// Folds the updater's three events into one running state for the update page.
export const watchUpdate = (listener: (progress: UpdateProgress) => void): (() => void) => {
  let state: UpdateProgress = { phase: "download", percent: 0, speed: 0, downloaded: 0, total: null };
  const emit = (next: Partial<UpdateProgress>) => {
    state = { ...state, ...next };
    listener(state);
  };

  if (PREVIEW_UPDATE === "installed") {
    const total = 4_680_000;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const tick = setInterval(() => {
      const downloaded = Math.min(total, state.downloaded + 190_000);
      emit({ downloaded, total, percent: Math.floor((downloaded / total) * 100), speed: 0.76 });
      if (downloaded < total) return;
      clearInterval(tick);
      timers.push(setTimeout(() => emit({ phase: "install" }), 300), setTimeout(() => emit({ phase: "restart" }), 2900));
    }, 250);
    return () => {
      clearInterval(tick);
      timers.forEach(clearTimeout);
    };
  }

  const stops = [
    subscribe<DownloadProgress>("download-progress", (progress) => emit(progress)),
    subscribe("update-installing", () => emit({ phase: "install" })),
    subscribe("update-restarting", () => emit({ phase: "restart" })),
  ];
  return () => stops.forEach((stop) => stop());
};

export const onUpdateFailed = (listener: () => void): (() => void) =>
  subscribe("update-failed", listener);

export const minimizeApp = async (): Promise<void> => {
  await getCurrentWindow().minimize();
};

export const closeApp = (): Promise<void> => invoke("close_app");

export const openExternal = async (url: string): Promise<void> => {
  await openUrl(url);
};
