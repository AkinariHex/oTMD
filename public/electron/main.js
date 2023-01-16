const { app, BrowserWindow } = require("electron");
const open = require("open");

const { fileCheck } = require("./fileCheck");
const { createWindow } = require("./appWindow");

try {
  fileCheck();

  app.allowRendererProcessReuse = true;
  app.setAppUserModelId("osu! Tourney Match Displayer");
  app.disableHardwareAcceleration();
  app.setAsDefaultProtocolClient("otmd");

  app.on("ready", () => setTimeout(createWindow, 400));

  // Quit when all windows are closed.
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on("new-window", function (event, url) {
    event.preventDefault();
    open(url);
  });
} catch (e) {
  // Catch Error
  // throw e;
}
