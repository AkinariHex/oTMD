const { WebSocketServer } = require("ws");
const { ipcMain } = require("electron");
const fs = require("fs");

let documentsFolder;
if (process.platform === "win32") {
  documentsFolder = require("os").userInfo().homedir + "/AppData/Roaming";
} else if (process.platform === "linux") {
  documentsFolder = require("os").userInfo().homedir + "/Documents";
}

const { matchData } = require("../osu/main");

var isInterval = null;

const toSendForInterval = (ws) => {
  return setInterval(async () => {
    if (getMatchSettings().isFinished === true) {
      clearInterval(isInterval);
    } else {
      ws.send(
        JSON.stringify({
          type: "matchSettings",
          settings: {
            webapikey: await getWebApi(),
            matchSettings: await getMatchSettings() /* arg */,
            displayerSettings: await getDisplayerSettings(),
            matchData: await matchData(),
          },
        })
      );
    }
  }, 10000);
};

module.exports.initializeWebSocket = () => {
  const wss = new WebSocketServer({ port: 9052 });
  wss.on("connection", async function connection(ws) {
    ws.on("message", function (message) {
      console.log(message.toString());
    });

    /* On connection */
    if (getMatchSettings().MatchID === "") {
      ws.send(
        JSON.stringify({
          type: "initLoad",
          settings: readFile(),
        })
      );
    } else {
      isInterval !== null && clearInterval(isInterval);
      ws.send(
        JSON.stringify({
          type: "initLoad",
          settings: {
            webapikey: await getWebApi(),
            matchSettings: await getMatchSettings() /* arg */,
            displayerSettings: await getDisplayerSettings(),
            matchData: await matchData(),
          },
        })
      );
      isInterval = toSendForInterval(ws);
    }

    /* Visualizer get displayer data when changed */
    ipcMain.on("saveDisplayerSettings", (event, arg) => {
      ws.send(
        JSON.stringify({
          type: "displayerSettings",
          settings: { displayerSettings: getDisplayerSettings() /* arg */ },
        })
      );
    });

    /* Visualizer get data only when saving the match settings */
    ipcMain.on("saveMatchSettings", async (event, arg) => {
      let settings = JSON.parse(
        fs.readFileSync(documentsFolder + "/otmd/settingsApp.json")
      );
      settings.matchSettings.isFinished = false;
      fs.writeFileSync(
        documentsFolder + "/otmd/settingsApp.json",
        JSON.stringify(settings)
      );
      isInterval !== null && clearInterval(isInterval);
      ws.send(
        JSON.stringify({
          type: "matchSettings",
          settings: {
            webapikey: await getWebApi(),
            matchSettings: await getMatchSettings() /* arg */,
            displayerSettings: await getDisplayerSettings(),
            matchData: await matchData(),
          },
        })
      );
      isInterval = toSendForInterval(ws);
    });
  });
};

const readFile = () => {
  let settings = JSON.parse(
    fs.readFileSync(documentsFolder + "/otmd/settingsApp.json")
  );
  return settings;
};

const getMatchSettings = () => {
  let settings = JSON.parse(
    fs.readFileSync(documentsFolder + "/otmd/settingsApp.json")
  );
  let { matchSettings } = settings;
  return matchSettings;
};

const getDisplayerSettings = () => {
  let settings = JSON.parse(
    fs.readFileSync(documentsFolder + "/otmd/settingsApp.json")
  );
  let { displayerSettings } = settings;
  return displayerSettings;
};

const getWebApi = () => {
  let settings = JSON.parse(
    fs.readFileSync(documentsFolder + "/otmd/settingsApp.json")
  );
  let { appSettings } = settings;
  return appSettings.ExportMatches;
};
