const fetch = require("node-fetch");
const { getTournament } = require("../functions/tournament");
const { getTeams } = require("../functions/teams");
const { scoresTeamVS } = require("../functions/score");

var oldTournament = null;
var tournamentData = null;

const getAcronym = async (matchData) => {
  let tournamentIndex = matchData.match.name.indexOf(":");
  let tournamentAcronym = matchData.match.name.substring(0, tournamentIndex);
  return tournamentAcronym;
};

const getTeamImages = async (teamImages, teams) => {
  teamImages = await Promise.all(
    await teamImages.map(async (item) => {
      let name = await item.split(".")[0];
      let port = 3001;
      if (teams[0] === name) {
        return (item = {
          name: name,
          path: `http://localhost:${port}/teams/${item}`,
          teamNumber: 1,
        });
      }
      if (teams[1] === name) {
        return (item = {
          name: name,
          path: `http://localhost:${port}/teams/${item}`,
          teamNumber: 2,
        });
      }
      return;
    })
  );
  // Sort the array matching the team orders
  await teamImages.sort((a, b) => a.teamNumber < b.teamNumber);
  // Remove all the null values from the array
  await teamImages.filter((val) => val);
  return teamImages;
};

module.exports.teamVSmatch = async (
  user,
  matchID,
  warmups,
  bestOF,
  teamImages
) => {
  let osuMatch = await fetch(
    `https://osu.ppy.sh/api/get_match?k=${user.apikey}&mp=${matchID}`
  ).then((res) => res.json());

  /* Get tournament info only the first time */
  let newTournament = await getAcronym(osuMatch);
  if (oldTournament !== newTournament) {
    tournamentData = await getTournament(osuMatch);
  }

  let teams = await getTeams(osuMatch);
  let images = await getTeamImages(teamImages, teams);

  let data = {
    matchJSON: osuMatch,
    tournament: tournamentData,
    teams: teams,
    scores: await scoresTeamVS(osuMatch, warmups, bestOF, tournamentData),
    tournamentStart: osuMatch.match.start_time,
    teamImages: images,
  };

  return data;
};
