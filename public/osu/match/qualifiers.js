const fetch = require("node-fetch");
const { getTournament } = require("../functions/tournament");
const { scoresQualifiers } = require("../functions/score");

var oldTournament = null;
var tournamentData = null;

const getAcronym = async (matchData) => {
  let tournamentIndex = matchData.match.name.indexOf(":");
  let tournamentAcronym = matchData.match.name.substring(0, tournamentIndex);
  return tournamentAcronym;
};

const getPlayer = async (apikey, userID) => {
  let playerData = await fetch(
    `https://osu.ppy.sh/api/get_user?k=${apikey}&u=${userID}`
  ).then((res) => res.json());
  let data = {
    userid: await playerData[0].user_id,
    username: await playerData[0].username,
  };
  return data;
};

module.exports.qualifierMatch = async (user, matchID, nOFmaps) => {
  let osuMatch = await fetch(
    `https://osu.ppy.sh/api/get_match?k=${user.apikey}&mp=${matchID}`
  ).then((res) => res.json());

  /* Get tournament info only the first time */
  let newTournament = await getAcronym(osuMatch);
  if (oldTournament !== newTournament) {
    tournamentData = await getTournament(osuMatch);
  }

  let data = {
    matchJSON: osuMatch,
    tournament: tournamentData,
    player: await getPlayer(user.apikey, user.userID),
    scores: await scoresQualifiers(osuMatch, user.userID, nOFmaps),
    totalMaps: nOFmaps,
    tournamentStart: osuMatch.match.start_time,
  };

  return data;
};
