// Single boundary between the React UI and the Rust core.
// Calls still stubbed name their phase beside them (docs/TAURI_MIGRATION.md).
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";

export interface User {
  id: number;
  username: string;
  country: string;
}

export interface Account {
  userID: string;
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

export interface AppSettings {
  CompactUI: boolean;
  SystemTray: boolean;
  ExportMatches: { status: boolean; apikey: string };
}

export interface NavBarData {
  account: Account;
  navbar: boolean;
  appInfo: { version: string; copyright: string };
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

const navBarListeners = new Set<(data: NavBarData) => void>();

export const getSession = (): Promise<User | null> => invoke("get_session");

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

export const getNavBarData = async (): Promise<NavBarData> => {
  const [user, appSettings, { version }] = await Promise.all([
    getSession(),
    getAppSettings(),
    invoke<{ version: string }>("get_app_info"),
  ]);

  return {
    account: {
      userID: user ? String(user.id) : "",
      username: user?.username ?? "",
      country: user?.country ?? "",
    },
    navbar: appSettings.CompactUI,
    appInfo: { version, copyright: `© ${new Date().getFullYear()} Akinari` },
  };
};

export const getAccountData = getNavBarData;

export const saveAppSettings = async (settings: AppSettings): Promise<void> => {
  await invoke("save_app_settings", { settings });
  const data = await getNavBarData();
  navBarListeners.forEach((listener) => listener(data));
};

export const onNavBarData = (
  listener: (data: NavBarData) => void
): (() => void) => {
  navBarListeners.add(listener);
  return () => {
    navBarListeners.delete(listener);
  };
};

// Phase 5: updater plugin
export const isUpdateAvailable = async (): Promise<boolean> => false;

export const onDownloadProgress = (
  _listener: (progress: DownloadProgress) => void
): (() => void) => {
  return () => {};
};

export const minimizeApp = async (): Promise<void> => {
  await getCurrentWindow().minimize();
};

export const maximizeApp = async (): Promise<void> => {
  await getCurrentWindow().toggleMaximize();
};

export const closeApp = (): Promise<void> => invoke("close_app");

export const openExternal = async (url: string): Promise<void> => {
  await openUrl(url);
};
