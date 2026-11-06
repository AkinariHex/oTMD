// Single boundary between the React UI and the Rust core.
// Data calls are in-memory stubs until the phase named beside them (docs/TAURI_MIGRATION.md).
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";

export interface Account {
  userID: string;
  username: string;
  country: string;
  apikey: string;
  id: number;
}

export interface MatchSettings {
  ActiveAccount: string;
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

export interface Settings {
  accounts: Account[];
  matchSettings: MatchSettings;
  displayerSettings: DisplayerSettings;
  appSettings: AppSettings;
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

const PLACEHOLDER_ACCOUNT: Account = {
  userID: "2",
  username: "Stub Account",
  country: "AU",
  apikey: "",
  id: 1,
};

// Defaults from the former public/electron/fileCheck.js, plus one account so /app/* renders.
const settings: Settings = {
  accounts: [PLACEHOLDER_ACCOUNT],
  matchSettings: {
    ActiveAccount: PLACEHOLDER_ACCOUNT.userID,
    MatchID: "",
    MatchType: "1vs1",
    Stage: "Friendly",
    BestOF: "9",
    MapsNqualifiers: "0",
    Warmups: "0",
    ScoreReverse: false,
    isFinished: false,
  },
  displayerSettings: {
    VisualizerStyle: "0px 0px 0px 0px",
    SmallDisplayer: false,
    TransparentBackground: false,
  },
  appSettings: {
    CompactUI: false,
    SystemTray: false,
    ExportMatches: { status: false, apikey: "" },
  },
};

const navBarListeners = new Set<(data: NavBarData) => void>();

function buildNavBarData(): NavBarData {
  const active = settings.accounts.find(
    (account) => account.userID === settings.matchSettings.ActiveAccount
  );
  return {
    account: active ?? PLACEHOLDER_ACCOUNT,
    navbar: settings.appSettings.CompactUI,
    appInfo: {
      version: "2.0.0",
      copyright: `© ${new Date().getFullYear()} Akinari`,
    },
  };
}

// Phase 5: obs.rs
export const isObsActive = async (): Promise<boolean> => false;

// Phase 3: commands.rs + settings.rs, everything down to saveAppSettings
export const getLoginAccounts = async (): Promise<Account[]> => [
  ...settings.accounts,
];

export const getAccountData = async (): Promise<NavBarData> =>
  buildNavBarData();

export const getNavBarData = async (): Promise<NavBarData> => buildNavBarData();

export const getMatchSettings = async (): Promise<MatchSettings> => ({
  ...settings.matchSettings,
});

export const getDisplayerSettings = async (): Promise<DisplayerSettings> => ({
  ...settings.displayerSettings,
});

export const getAppSettings = async (): Promise<AppSettings> => ({
  ...settings.appSettings,
});

export const createNewAccount = async (account: Account): Promise<void> => {
  settings.accounts.push(account);
};

export const changeActiveAccount = async (userID: string): Promise<void> => {
  settings.matchSettings.ActiveAccount = userID;
};

export const saveAccountSettings = async (arg: {
  apikey: string;
  number: number;
}): Promise<void> => {
  settings.accounts[arg.number].apikey = arg.apikey;
};

export const saveMatchSettings = async (
  next: MatchSettings
): Promise<void> => {
  settings.matchSettings = next;
};

export const saveDisplayerSettings = async (
  next: DisplayerSettings
): Promise<void> => {
  settings.displayerSettings = next;
};

export const saveAppSettings = async (next: AppSettings): Promise<void> => {
  settings.appSettings = next;
  const data = buildNavBarData();
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

// Phase 3: also clear MatchID and isFinished before closing, as Electron's closeApp did.
export const closeApp = async (): Promise<void> => {
  await getCurrentWindow().close();
};

export const openExternal = async (url: string): Promise<void> => {
  await openUrl(url);
};
