const { app, BrowserWindow, globalShortcut } = require("electron");
const path = require("path");
const url = require("url");

const { startVisualizer } = require("./express");

const { autoUpdate } = require("./autoUpdate");
const { initializeTray } = require("./systemTray");
const { initializeIPC } = require("./ipc");

module.exports.createWindow = () => {
  let iconPath = path.join(__dirname, "../icons/otmd.ico");

  // Create the browser window.
  var mainWindow = new BrowserWindow({
    width: 1000,
    height: 600,
    resizable: false,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      contextIsolation: false,
    },
    titleBarStyle: "hidden",
    show: false,
    name: "osu! Tourney Match Displayer",
    icon: iconPath,
  });

  //load the index.html from a url
  const appURL = app.isPackaged
    ? url.format({
        pathname: path.join(__dirname, "/../../build/index.html"),
        protocol: "file:",
        slashes: true,
      })
    : "http://localhost:3000";
  mainWindow.loadURL(appURL);

  // Allows the DevTools only in development
  if (app.isPackaged) {
    globalShortcut.unregister("Control+Shift+I");
    globalShortcut.unregister("Control+R");
    mainWindow.setMenu(null);
  } else {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.on("dom-ready", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on("closed", () => {
    // Dereference the window object, usually you would store window
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });

  mainWindow.webContents.on("new-window", function (e, url) {
    e.preventDefault();
    require("electron").shell.openExternal(url);
  });

  /* VISUALIZER */
  startVisualizer();

  /* SYSTEM TRAY */
  initializeTray(mainWindow, iconPath, app);

  /* Initialize AutoUpdater */
  autoUpdate(mainWindow);

  /* Initialize IPC */
  initializeIPC(app, mainWindow);
};
