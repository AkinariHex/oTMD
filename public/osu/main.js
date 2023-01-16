const fs = require("fs");

let documentsFolder;
if (process.platform === "win32") {
  documentsFolder = require("os").userInfo().homedir + "/AppData/Roaming";
} else if (process.platform === "linux") {
  documentsFolder = require("os").userInfo().homedir + "/Documents";
}

const { qualifierMatch } = require("./match/qualifiers");
const { oneVoneMatch } = require("./match/1v1");
const { teamVSmatch } = require("./match/teamVS");

const getCurrentAccount = async (accounts, matchSettings) => {
  let searchObject = accounts.find(
    (account) => account.userID === matchSettings.ActiveAccount
  );
  return searchObject;
};

module.exports.matchData = async () => {
  let data = JSON.parse(
    fs.readFileSync(documentsFolder + "/otmd/settingsApp.json")
  );
  const { accounts, matchSettings } = data;

  /* Get the current account */
  let currentAccount = await getCurrentAccount(accounts, matchSettings);

  /* Return Qualifiers match Data */
  if (matchSettings.Stage === "Qualifiers") {
    return await qualifierMatch(
      currentAccount,
      matchSettings.MatchID,
      matchSettings.MapsNqualifiers
    );
  }

  /* Return 1vs1 match Data */
  if (
    matchSettings.MatchType === "1vs1" &&
    matchSettings.Stage !== "Qualifiers"
  ) {
    return await oneVoneMatch(
      currentAccount,
      matchSettings.MatchID,
      matchSettings.Warmups,
      matchSettings.BestOF
    );
  }

  /* Return TeamVS match Data */
  if (
    matchSettings.MatchType === "teamVS" &&
    matchSettings.Stage !== "Qualifiers"
  ) {
    // detection for team images
    let teamImages = fs.readdirSync(documentsFolder + "/otmd/teams");
    return await teamVSmatch(
      currentAccount,
      matchSettings.MatchID,
      matchSettings.Warmups,
      matchSettings.BestOF,
      teamImages
    );
  }
};
