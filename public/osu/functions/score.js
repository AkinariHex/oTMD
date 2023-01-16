const scoremodification = require("../functions/scoremodification");
const fs = require("fs");
let documentsFolder;
if (process.platform === "win32") {
  documentsFolder = require("os").userInfo().homedir + "/AppData/Roaming";
} else if (process.platform === "linux") {
  documentsFolder = require("os").userInfo().homedir + "/Documents";
}

/* Write isFinished to settings file to tell the IPC module to clear the match Interval */
const saveIsFinished = async () => {
  let settings = await JSON.parse(
    fs.readFileSync(documentsFolder + "/otmd/settingsApp.json")
  );
  settings.matchSettings.isFinished = true;
  fs.writeFileSync(
    documentsFolder + "/otmd/settingsApp.json",
    JSON.stringify(settings)
  );
};

/* Format Numbers with Comma */
function getNumberWithCommas(number) {
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

module.exports.scoresQualifiers = async (matchData, userID, nOFmaps) => {
  var playerScores = [];
  var playerAverage = 0;
  var isFinished = false;

  var mapsPlayed = 0;

  var tournament_modifiers = {
    NM: { type: "*", value: "1.00" },
    HD: { type: "*", value: "1.00" },
    HR: { type: "*", value: "1.00" },
    EZ: { type: "*", value: "1.00" },
    FL: { type: "*", value: "1.00" },
  };

  if (matchData.games.length > 0) {
    for (var i = 0; i < matchData.games.length && isFinished === false; i++) {
      if (mapsPlayed < nOFmaps) {
        for (var x = 0; x < matchData.games[i].scores.length; x++) {
          var gameended = matchData.games[i].end_time == null;
          if (gameended == false) {
            if (matchData.games[i].scores[x].user_id == userID) {
              if (matchData.games[i].mods == 0) {
                // 0 = FREEMOD - !0 = MODLOCKED
                var scoreToAdd = scoremodification.modsModifiers(
                  matchData.games[i].scores[x].enabled_mods,
                  parseInt(matchData.games[i].scores[x].score),
                  tournament_modifiers
                );
                let modsToAdd = scoremodification.modsModifiersQualifiers(
                  matchData.games[i].scores[x].enabled_mods
                );
                playerScores.push({
                  score: getNumberWithCommas(scoreToAdd),
                  mods: modsToAdd,
                });
              } else {
                var scoreToAdd = scoremodification.modsModifiers(
                  matchData.games[i].mods,
                  parseInt(matchData.games[i].scores[x].score),
                  tournament_modifiers
                );
                let modsToAdd = scoremodification.modsModifiersQualifiers(
                  matchData.games[i].mods
                );
                playerScores.push({
                  score: getNumberWithCommas(scoreToAdd),
                  mods: modsToAdd,
                });
              }

              mapsPlayed++;
            }
          }
        }
      }

      if (mapsPlayed == nOFmaps) {
        isFinished = true;
        saveIsFinished();
      }

      let totalScore = 0;
      playerScores.forEach((sc) => {
        totalScore += parseFloat(sc.score.replace(",", ""));
      });
      playerAverage = (totalScore / playerScores.length).toFixed(0);
    }
  }

  return {
    list: playerScores,
    average: getNumberWithCommas(playerAverage),
    mapsPlayed: mapsPlayed,
    isFinished: isFinished,
  };
};

module.exports.scoresOneVone = async (
  matchData,
  me,
  warmups,
  bestOF,
  tournament
) => {
  var player1 = 0;
  var player2 = 0;
  var player1score = 0;
  var player2score = 0;

  var isFinished = false;
  var winner = null;

  /* This allow the app to get only the first two players and avoid any other scores from other players */
  var playerslot = ["0", "1"];

  var tournament_modifiers = {
    NM: { type: "*", value: "1.00" },
    HD: { type: "*", value: "1.00" },
    HR: { type: "*", value: "1.00" },
    EZ: { type: "*", value: "1.00" },
    FL: { type: "*", value: "1.00" },
  };

  if (!tournament.error) {
    tournament_modifiers = tournament.multipliers;
  }

  for (
    var i = warmups;
    i < matchData.games.length && isFinished === false;
    i++
  ) {
    /* Avoid to add additional points */
    if (
      player1 < parseInt(bestOF) / 2 + 0.5 &&
      player2 < parseInt(bestOF) / 2 + 0.5
    ) {
      for (var x = 0; x < matchData.games[i].scores.length; x++) {
        var gameended = matchData.games[i].end_time == null;
        if (gameended === false) {
          if (matchData.games[i].scores[x].user_id === me) {
            if (matchData.games[i].mods == 0) {
              // 0 = FREEMOD - !0 = MODLOCKED

              matchData.games[i].scores[x].slot == 0
                ? (player1score += await scoremodification.modsModifiers(
                    matchData.games[i].scores[x].enabled_mods,
                    parseInt(matchData.games[i].scores[x].score),
                    tournament_modifiers,
                    parseInt(matchData.games[i].scores[x].pass)
                  ))
                : (player2score += await scoremodification.modsModifiers(
                    matchData.games[i].scores[x].enabled_mods,
                    parseInt(matchData.games[i].scores[x].score),
                    tournament_modifiers,
                    parseInt(matchData.games[i].scores[x].pass)
                  ));
            } else {
              matchData.games[i].scores[x].slot == 0
                ? (player1score += await scoremodification.modsModifiers(
                    matchData.games[i].mods,
                    parseInt(matchData.games[i].scores[x].score),
                    tournament_modifiers,
                    parseInt(matchData.games[i].scores[x].pass)
                  ))
                : (player2score += await scoremodification.modsModifiers(
                    matchData.games[i].mods,
                    parseInt(matchData.games[i].scores[x].score),
                    tournament_modifiers,
                    parseInt(matchData.games[i].scores[x].pass)
                  ));
            }
          } else if (
            matchData.games[i].scores[x].user_id != me &&
            playerslot.includes(matchData.games[i].scores[x].slot)
          ) {
            if (matchData.games[i].mods == 0) {
              // 0 = FREEMOD - !0 = MODLOCKED
              matchData.games[i].scores[x].slot == 0
                ? (player1score += await scoremodification.modsModifiers(
                    matchData.games[i].scores[x].enabled_mods,
                    parseInt(matchData.games[i].scores[x].score),
                    tournament_modifiers,
                    parseInt(matchData.games[i].scores[x].pass)
                  ))
                : (player2score += await scoremodification.modsModifiers(
                    matchData.games[i].scores[x].enabled_mods,
                    parseInt(matchData.games[i].scores[x].score),
                    tournament_modifiers,
                    parseInt(matchData.games[i].scores[x].pass)
                  ));
            } else {
              matchData.games[i].scores[x].slot == 0
                ? (player1score += await scoremodification.modsModifiers(
                    matchData.games[i].mods,
                    parseInt(matchData.games[i].scores[x].score),
                    tournament_modifiers,
                    parseInt(matchData.games[i].scores[x].pass)
                  ))
                : (player2score += await scoremodification.modsModifiers(
                    matchData.games[i].mods,
                    parseInt(matchData.games[i].scores[x].score),
                    tournament_modifiers,
                    parseInt(matchData.games[i].scores[x].pass)
                  ));
            }
          }
        }
      }
      if (player1score - player2score === 0) {
        player1score = 0;
        player2score = 0;
      } else if (player1score - player2score > 0) {
        player1++;
        player1score = 0;
        player2score = 0;
      } else {
        player2++;
        player1score = 0;
        player2score = 0;
      }
    }
    if (player1 === parseInt(bestOF) / 2 + 0.5) {
      isFinished = true;
      winner = 1;
      saveIsFinished();
    }
    if (player2 === parseInt(bestOF) / 2 + 0.5) {
      isFinished = true;
      winner = 2;
      saveIsFinished();
    }
  }

  return {
    player1: player1,
    player2: player2,
    isFinished: isFinished,
    winner: winner,
  };
};

module.exports.scoresTeamVS = async (
  matchData,
  warmups,
  bestOF,
  tournament
) => {
  var team1 = 0;
  var team2 = 0;
  var team1score = 0;
  var team2score = 0;

  var isFinished = false;
  var winner = null;

  var tournament_modifiers = {
    NM: { type: "*", value: "1.00" },
    HD: { type: "*", value: "1.00" },
    HR: { type: "*", value: "1.00" },
    EZ: { type: "*", value: "1.00" },
    FL: { type: "*", value: "1.00" },
  };

  if (!tournament.error) {
    tournament_modifiers = tournament.multipliers;
  }

  for (
    var i = warmups;
    i < matchData.games.length && isFinished === false;
    i++
  ) {
    /* Avoid to add additional points */
    if (
      team1 < parseInt(bestOF) / 2 + 0.5 &&
      team2 < parseInt(bestOF) / 2 + 0.5
    ) {
      for (var x = 0; x < matchData.games[i].scores.length; x++) {
        var gameended = matchData.games[i].end_time == null;
        if (gameended === false) {
          if (matchData.games[i].scores[x].team == "2") {
            if (matchData.games[i].mods == 0) {
              // 0 = FREEMOD - !0 = MODLOCKED
              team1score += await scoremodification.modsModifiers(
                matchData.games[i].scores[x].enabled_mods,
                parseInt(matchData.games[i].scores[x].score),
                tournament_modifiers,
                parseInt(matchData.games[i].scores[x].pass)
              );
            } else {
              team1score += await scoremodification.modsModifiers(
                matchData.games[i].mods,
                parseInt(matchData.games[i].scores[x].score),
                tournament_modifiers,
                parseInt(matchData.games[i].scores[x].pass)
              );
            }
          } else if (matchData.games[i].scores[x].team == "1") {
            if (matchData.games[i].mods == 0) {
              // 0 = FREEMOD - !0 = MODLOCKED
              team2score += await scoremodification.modsModifiers(
                matchData.games[i].scores[x].enabled_mods,
                parseInt(matchData.games[i].scores[x].score),
                tournament_modifiers,
                parseInt(matchData.games[i].scores[x].pass)
              );
            } else {
              team2score += await scoremodification.modsModifiers(
                matchData.games[i].mods,
                parseInt(matchData.games[i].scores[x].score),
                tournament_modifiers,
                parseInt(matchData.games[i].scores[x].pass)
              );
            }
          }
        }
      }
      if (team1score - team2score === 0) {
        team1score = 0;
        team2score = 0;
      } else if (team1score - team2score > 0) {
        team1++;
        team1score = 0;
        team2score = 0;
      } else {
        team2++;
        team1score = 0;
        team2score = 0;
      }
    }

    if (team1 === parseInt(bestOF) / 2 + 0.5) {
      isFinished = true;
      winner = 1;
      saveIsFinished();
    }
    if (team2 === parseInt(bestOF) / 2 + 0.5) {
      isFinished = true;
      winner = 2;
      saveIsFinished();
    }
  }

  return {
    team1: team1,
    team2: team2,
    isFinished: isFinished,
    winner: winner,
  };
};
