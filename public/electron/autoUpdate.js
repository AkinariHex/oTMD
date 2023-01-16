var { autoUpdater } = require("electron-updater");
const { ipcMain } = require("electron");

autoUpdater.logger = require("electron-log");
autoUpdater.logger.transports.file.level = "info";

module.exports.autoUpdate = (mainWindow) => {
  ipcMain.on("isUpdateAvailable", (event) => {
    autoUpdater.checkForUpdatesAndNotify();
  });
  autoUpdater.on("update-available", () => {
    mainWindow.webContents.send("updateAvailable");
  });

  autoUpdater.on("download-progress", (progressObj) => {
    let data = {
      speed: (progressObj.bytesPerSecond / 1000000).toFixed(2),
      percent: Math.round(progressObj.percent),
    };
    mainWindow.webContents.send("downloadProgress", data);
  });

  autoUpdater.on("update-downloaded", () => {
    autoUpdater.quitAndInstall();
  });
};
