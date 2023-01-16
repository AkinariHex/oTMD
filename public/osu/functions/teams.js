const getNamesFromTitle = async (matchData) => {
  let patt = /\((.*?)\)/g;
  /* Get names into the parentesis */
  let teamnames = await matchData.match.name.match(patt);
  /* Remove parentesis from names */
  teamnames = await teamnames.map((team) => {
    return team.replace(/([()])/g, "");
  });
  return teamnames;
};

module.exports.getTeams = async (match) => {
  let teams = await getNamesFromTitle(match);
  return teams;
};
