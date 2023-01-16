const { Tray, Menu } = require("electron");
const fs = require("fs");

let documentsFolder;
if (process.platform === "win32") {
  documentsFolder = require("os").userInfo().homedir + "/AppData/Roaming";
} else if (process.platform === "linux") {
  documentsFolder = require("os").userInfo().homedir + "/Documents";
}

/* Create Tray */
function createTray(iconPath, mainWindow, app) {
  let appIcon = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open",
      click: function () {
        mainWindow.show();
      },
    },
    {
      label: "Close",
      click: function () {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);

  appIcon.on("double-click", function (event) {
    mainWindow.show();
  });
  appIcon.setToolTip("o!TMD");
  appIcon.setContextMenu(contextMenu);
  return appIcon;
}

module.exports.initializeTray = (mainWindow, iconPath, app) => {
  /* Initialize Tray */
  let tray = null;
  mainWindow.on("minimize", function (event) {
    event.preventDefault();
    let data = JSON.parse(
      fs.readFileSync(documentsFolder + "/otmd/settingsApp.json")
    );
    if (data.appSettings.SystemTray === true) {
      mainWindow.hide();
      tray = createTray(iconPath, mainWindow, app);
      return;
    }
  });

  mainWindow.on("restore", function (event) {
    mainWindow.show();
    if (tray !== null) tray.destroy();
  });
};
