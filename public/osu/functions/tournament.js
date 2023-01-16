const fetch = require("node-fetch");

const getAcronym = async (matchData) => {
  let tournamentIndex = matchData.match.name.indexOf(":");
  let tournamentAcronym = matchData.match.name.substring(0, tournamentIndex);
  return tournamentAcronym;
};

const getTournamentData = async (id) => {
  let data = await fetch(`https://otmd.app/api/tournaments/app?t=${id}`);
  data = await data.json();
  return data;
};

module.exports.getTournament = async (match) => {
  let acronym = await getAcronym(match);
  let data = await getTournamentData(acronym);
  data.acronym = await acronym;
  return data;
};
