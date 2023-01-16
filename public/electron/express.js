const { app } = require("electron");
const express = require("express");
const appExpress = express();
const path = require("path");

module.exports.startVisualizer = () => {
  let documentsFolder;
  if (process.platform === "win32") {
    documentsFolder = require("os").userInfo().homedir + "/AppData/Roaming";
  } else if (process.platform === "linux") {
    documentsFolder = require("os").userInfo().homedir + "/Documents";
  }

  appExpress.use(express.static(path.join(__dirname, "../visualizer")));
  appExpress.use(
    "/teams",
    express.static(path.join(documentsFolder, "/otmd/teams"))
  );

  appExpress.get("/visualizer", (req, res) => {
    res.sendFile(path.join(__dirname, "../visualizer/visualizer.html"));
  });

  appExpress.listen(app.isPackaged ? 21086 : 3001);
};
