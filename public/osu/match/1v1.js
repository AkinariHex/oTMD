const fetch = require("node-fetch");
const { getTournament } = require("../functions/tournament");
const { getPlayers } = require("../functions/players");
const { scoresOneVone } = require("../functions/score");

var oldNames = null;
var oldTournament = null;
var tournamentData = null;

var players = null;

const getAcronym = async (matchData) => {
  let tournamentIndex = matchData.match.name.indexOf(":");
  let tournamentAcronym = matchData.match.name.substring(0, tournamentIndex);
  return tournamentAcronym;
};

const getNames = async (matchData) => {
  let patt = /\((.*?)\)/g;
  /* Get names into the parentesis */
  let teamnames = await matchData.match.name.match(patt);
  /* Remove parentesis from names */
  teamnames = await teamnames.map((team) => {
    return team.replace(/([()])/g, "");
  });
  return teamnames;
};

module.exports.oneVoneMatch = async (user, matchID, warmups, bestOF) => {
  let osuMatch = await fetch(
    `https://osu.ppy.sh/api/get_match?k=${user.apikey}&mp=${matchID}`
  ).then((res) => res.json());

  /* Get tournament info only the first time */
  let newTournament = await getAcronym(osuMatch);
  if (oldTournament !== newTournament) {
    tournamentData = await getTournament(osuMatch);
  }

  /* Get players info only one time if the tournament is the same */
  let newNames = await getNames(osuMatch);
  if (oldNames !== newNames) {
    oldNames = newNames;
    players = await getPlayers(user.apikey, user.userID, osuMatch);
  }

  let data = {
    matchJSON: osuMatch,
    tournament: tournamentData,
    players: players,
    scores: await scoresOneVone(
      osuMatch,
      user.userID,
      warmups,
      bestOF,
      tournamentData
    ),
    tournamentStart: osuMatch.match.start_time,
  };

  return data;
};
