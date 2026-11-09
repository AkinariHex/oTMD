// Single boundary between the React UI and the Rust core.
// Calls still stubbed name their phase beside them (docs/TAURI_MIGRATION.md).
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";

export const OVERLAY_URL = "http://localhost:21086/visualizer";

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
}

export type Layout = "sidebar" | "tabs";

export interface AppSettings {
  Layout: Layout;
  TrayBehavior: "closeToTray" | "minimizeToTray";
  ExportMatches: { status: boolean; apikey: string };
  Animations: boolean;
  HardwareAcceleration: boolean;
}

export interface DownloadProgress {
  speed: number;
  percent: number;
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

export const rememberRoute = (route: string): Promise<void> =>
  invoke("remember_route", { route });

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

export const getOverlaySources = (): Promise<number> => invoke("get_overlay_sources");

export const onOverlayChanged = (listener: (sources: number) => void): (() => void) =>
  subscribe("overlay-changed", listener);

export const isUpdateAvailable = (): Promise<boolean> => invoke("check_update");

export const onDownloadProgress = (
  listener: (progress: DownloadProgress) => void
): (() => void) => subscribe("download-progress", listener);

export const onUpdateFailed = (listener: () => void): (() => void) =>
  subscribe("update-failed", listener);

export const minimizeApp = async (): Promise<void> => {
  await getCurrentWindow().minimize();
};

export const closeApp = (): Promise<void> => invoke("close_app");

export const openExternal = async (url: string): Promise<void> => {
  await openUrl(url);
};
