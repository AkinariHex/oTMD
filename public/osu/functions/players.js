const fetch = require("node-fetch");

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

const getPlayersData = async (apikey, me, match) => {
  let players = await getNamesFromTitle(match);
  let playersData = await Promise.all(
    players.map(async (player) => {
      let playerData = await fetch(
        `https://osu.ppy.sh/api/get_user?k=${apikey}&u=${player}`
      ).then((res) => res.json());
      let data = {
        userid: playerData[0].user_id,
        username: playerData[0].username,
        isMe: playerData[0].user_id === me,
      };
      return data;
    })
  );
  return playersData;
};

module.exports.getPlayers = async (apikey, me, match) => {
  let players = await getPlayersData(apikey, me, match);
  return players;
};
