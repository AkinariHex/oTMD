const fs = require("fs");
require("v8-compile-cache");

let documentsFolder;
if (process.platform === "win32") {
  const os = require("os");
  os.setPriority(-20);
  documentsFolder = os.userInfo().homedir + "/AppData/Roaming";
} else if (process.platform === "linux") {
  documentsFolder = require("os").userInfo().homedir + "/Documents";
}
module.exports.fileCheck = () => {
  //create otmd folder in documents if not exist already
  if (!fs.existsSync(documentsFolder + "/otmd")) {
    fs.mkdir(documentsFolder + "/otmd", (err) => {
      if (err) {
        return console.error(err);
      }
    });
  }

  //create exports folder at first run
  if (!fs.existsSync(documentsFolder + "/otmd/exports")) {
    fs.mkdir(documentsFolder + "/otmd/exports", (err) => {
      if (err) {
        return console.error(err);
      }
    });
  }

  //create teams folder at first run
  if (!fs.existsSync(documentsFolder + "/otmd/teams")) {
    fs.mkdir(documentsFolder + "/otmd/teams", (err) => {
      if (err) {
        return console.error(err);
      }
    });
  }

  //create settings file at first run
  if (!fs.existsSync(documentsFolder + "/otmd/settingsApp.json")) {
    let data = {
      accounts: [],
      matchSettings: {
        ActiveAccount: "",
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
    fs.writeFileSync(
      documentsFolder + "/otmd/settingsApp.json",
      JSON.stringify(data)
    );
  }
};
