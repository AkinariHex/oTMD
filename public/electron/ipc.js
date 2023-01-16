const { ipcMain } = require("electron");
const fs = require("fs");

const { obsFinder } = require("./obsFinder");
const { initializeWebSocket } = require("./websocket");

let documentsFolder;
if (process.platform === "win32") {
  documentsFolder = require("os").userInfo().homedir + "/AppData/Roaming";
} else if (process.platform === "linux") {
  documentsFolder = require("os").userInfo().homedir + "/Documents";
}

/* Read the app settings JSON */
const readSettings = () => {
  let data = JSON.parse(
    fs.readFileSync(documentsFolder + "/otmd/settingsApp.json")
  );
  return data;
};

/* Let the navbar know the selected Account */
const selectAccount = (app) => {
  const searchObject = readSettings().accounts.find(
    (account) => account.userID === readSettings().matchSettings.ActiveAccount
  );
  let year = new Date().getFullYear();
  let dataSend = {
    account: searchObject,
    navbar: readSettings().appSettings.CompactUI,
    appInfo: {
      version: app.getVersion(),
      copyright: `© ${year} Akinari`,
    },
  };
  return dataSend;
};

module.exports.initializeIPC = (app, mainWindow) => {
  /* IPC DATA */

  /* Get OBS info */
  ipcMain.on("obs_active", (event) => {
    obsFinder().then((data) => {
      event.reply("obs_active_return", data);
    });
  });

  /* Load all the accounts at load screen */
  ipcMain.on("getLoginAccounts", (event, arg) => {
    event.reply("loginAccountDataReturn", readSettings().accounts);
  });

  /* Load settings when app loaded */
  ipcMain.on("getAccountData", (event, arg) => {
    event.reply("accountDataReturn", selectAccount(app));
  });

  /* Request from app to get the settings of itself */
  ipcMain.on("getNavBarData", (event, arg) => {
    event.reply("navbarDataReturn", selectAccount(app));
  });

  /* Request from app to get the settings of the match */
  ipcMain.on("getMatchSettings", (event, arg) => {
    event.reply("matchSettingsReturn", readSettings().matchSettings);
  });

  /* Request from app to get the settings of the displayer */
  ipcMain.on("getDisplayerSettings", (event, arg) => {
    event.reply("displayerSettingsReturn", readSettings().displayerSettings);
  });

  /* Request from app to get the settings of itself */
  ipcMain.on("getAppSettings", (event, arg) => {
    event.reply("appSettingsReturn", readSettings().appSettings);
  });

  /* When the user login change active user with the one he selected */
  ipcMain.on("createNewAccount", (event, arg) => {
    let data = readSettings();
    data.accounts.push(arg);
    fs.writeFileSync(
      documentsFolder + "/otmd/settingsApp.json",
      JSON.stringify(data)
    );
  });

  /* When the user login change active user with the one he selected */
  ipcMain.on("changeActiveAccount", (event, arg) => {
    let data = readSettings();
    data.matchSettings.ActiveAccount = arg;
    fs.writeFileSync(
      documentsFolder + "/otmd/settingsApp.json",
      JSON.stringify(data)
    );

    /* Start of the WS */
    initializeWebSocket();
  });

  /* When the apikey is changed by the user */
  ipcMain.on("saveAccountSettings", (event, arg) => {
    let data = readSettings();
    data.accounts[arg.number].apikey = arg.apikey;
    fs.writeFileSync(
      documentsFolder + "/otmd/settingsApp.json",
      JSON.stringify(data)
    );
  });

  /* When the match settings are changed by the user */
  ipcMain.on("saveMatchSettings", (event, arg) => {
    let data = readSettings();
    data.matchSettings = arg;
    fs.writeFileSync(
      documentsFolder + "/otmd/settingsApp.json",
      JSON.stringify(data)
    );
  });

  /* When the displayer settings are changed by the user */
  ipcMain.on("saveDisplayerSettings", (event, arg) => {
    let data = readSettings();
    data.displayerSettings = arg;
    fs.writeFileSync(
      documentsFolder + "/otmd/settingsApp.json",
      JSON.stringify(data)
    );
  });

  /* When the app settings are changed by the user */
  ipcMain.on("saveAppSettings", (event, arg) => {
    let data = readSettings();
    data.appSettings = arg;
    fs.writeFileSync(
      documentsFolder + "/otmd/settingsApp.json",
      JSON.stringify(data)
    );

    /* Send status to navbar */
    event.reply("navbarDataReturn", selectAccount(app));
  });

  /* AppBar Reactions to the app */
  ipcMain.on("minimizeApp", (event, arg) => {
    if (!mainWindow.isMinimized()) mainWindow.minimize();
  });

  ipcMain.on("maximizeApp", (event, arg) => {
    !mainWindow.isMaximized() ? mainWindow.maximize() : mainWindow.unmaximize();
  });

  ipcMain.on("closeApp", (event, arg) => {
    let data = readSettings();
    data.matchSettings.MatchID = "";
    data.matchSettings.isFinished = false;
    fs.writeFileSync(
      documentsFolder + "/otmd/settingsApp.json",
      JSON.stringify(data)
    );
    app.exit();
  });
};
