let appNotConnected = document.getElementById("appNotConnected");
let appNoMatch = document.getElementById("appNoMatch");
let app = document.getElementById("app");
let match = document.getElementById("match");
let qualifiers = document.getElementById("qualifiers");
let winner = document.getElementById("winner");

let team1 = document.getElementById("team1");
let team2 = document.getElementById("team2");

let score1 = document.getElementById("team1_score");
let score2 = document.getElementById("team2_score");

let stageBO = document.getElementById("stageBO");
let tournamentName = document.getElementById("tournament");

let isFinished = false;
let isWinner = null;

/* Qualifiers */
let mapsPlayedOld = 0;
let userDiv = document.createElement("div");
userDiv.classList.add("user");
let infoDiv = document.createElement("div");
infoDiv.classList.add("info");
let scoresDiv = document.createElement("div");
scoresDiv.classList.add("scores");
scoresDiv.id = "scores";
qualifiers.appendChild(userDiv);
qualifiers.appendChild(infoDiv);
qualifiers.appendChild(scoresDiv);

var qualifiersScoresAlreadyDone = [];

/* WEBSOCKET */
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 10000;

var ws = null;
var reconnectDelay = RECONNECT_MIN_MS;

/* The app's preview: real displayer settings, placeholder match */
var showSample = new URLSearchParams(location.search).has("sample");
var SAMPLE_MATCH_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23373b46'/%3E%3Ccircle cx='20' cy='15' r='7' fill='%23a9afbc'/%3E%3Cellipse cx='20' cy='34' rx='13' ry='9' fill='%23a9afbc'/%3E%3C/svg%3E";

function avatarOf(player) {
  return showSample ? SAMPLE_MATCH_AVATAR : `http://s.ppy.sh/a/${player.userid}`;
}

function applySampleMatch(settings) {
  Object.assign(settings.matchSettings, {
    MatchID: "1",
    MatchType: "1vs1",
    Stage: "Quarterfinals",
    BestOF: "9",
    ScoreReverse: false,
  });
  settings.matchData = {
    tournament: { tournamentName: "Sample Cup", acronym: "SC" },
    players: [
      { userid: 0, username: "Red Player" },
      { userid: 0, username: "Blue Player" },
    ],
    scores: { player1: 3, player2: 2, isFinished: false, winner: null },
  };
}

window.addEventListener("load", initializeWebsocket);

function initializeWebsocket() {
  var preview = new URLSearchParams(location.search).has("preview");
  ws = new WebSocket(`ws://${location.host}/ws${preview ? "?preview=1" : ""}`);

  ws.onopen = function () {
    reconnectDelay = RECONNECT_MIN_MS;
    appNotConnected.style.display = "none";
    winner.style.display = "none";
    team1.innerHTML = "";
    team2.innerHTML = "";
    score1.innerHTML = 0;
    score2.innerHTML = 0;
    stageBO.innerHTML = "";
    tournamentName.innerHTML = "";
  };

  ws.onmessage = function (message) {
    var data = JSON.parse(message.data);
    if (data.type === "rankedState" || data.type === "broadcastState") return;
    if (showSample) applySampleMatch(data.settings);
    let isMatch = false;

    /* When the page is loaded */
    isMatch =
      data.settings?.matchSettings?.MatchID !== "" &&
      data.settings?.matchData !== undefined;

    if (!isMatch) {
      appNoMatch.style.display = "grid";
      app.style.display = "none";
    }

    if (isMatch) {
      appNoMatch.style.display = "none";
      app.style.display = "grid";
      app.style.backgroundImage = "url('img/redVSblue.png')";
      app.style.backgroundPosition = "bottom";
    }

    /* When the user changes the displayer settings */
    if (data.type === "displayerSettings" || data.type === "initLoad") {
      var displayer = data.settings.displayerSettings;
      for (var panel of [app, appNoMatch]) {
        panel.classList.toggle("small", displayer.SmallDisplayer);
        panel.style.borderRadius = displayer.VisualizerStyle;
      }
      appNoMatch.style.backgroundImage = displayer.TransparentBackground ? "none" : "";

      if (data.settings.displayerSettings.TransparentBackground) {
        app.style.backgroundImage = "none";
      } else {
        app.style.backgroundPosition = "bottom";
        if (isFinished && isWinner !== null) {
          app.style.backgroundImage =
            isWinner === 1
              ? "url('img/winnerRed.png')"
              : "url('img/winnerBlue.png')";
        } else {
          app.style.backgroundImage = "url('img/redVSblue.png')";
        }
      }
    }

    /* When the user changes the match settings */
    if (isMatch === true) {
      /* General Settings */
      stageBO.innerHTML =
        data.settings.matchSettings.MatchID !== ""
          ? `${escapeHtml(data.settings.matchSettings.Stage)} - BO${escapeHtml(data.settings.matchSettings.BestOF)}`
          : "";
      tournamentName.innerHTML =
        /* Check for match data and if the tournament is into the database */
        data.settings.matchData !== undefined &&
        !data.settings.matchData.tournament.error
          ? escapeHtml(
              data.settings.matchData.tournament.tournamentName.length >= 22
                ? data.settings.matchData.tournament.acronym
                : data.settings.matchData.tournament.tournamentName
            )
          : "";

      /* When the match is Qualifiers */
      if (data.settings.matchSettings.Stage === "Qualifiers") {
        match.style.display = "none";
        winner.style.display = "none";
        qualifiers.style.display = "grid";

        /* console.log(data.settings.matchData); */

        stageBO.innerHTML = escapeHtml(data.settings.matchSettings.Stage);

        let name =
          data.settings.matchData.player.username.length > 12
            ? `<span>${escapeHtml(data.settings.matchData.player.username)}</span>`
            : escapeHtml(data.settings.matchData.player.username);

        userDiv.innerHTML = `
        <img src="http://s.ppy.sh/a/${data.settings.matchData.player.userid}" alt="${escapeHtml(data.settings.matchData.player.username)}" />
        <div class="name">${name}</div>
        `;

        infoDiv.innerHTML = `
        <div class="item" id="counterMaps">
          <div class="title">Maps</div>
          <div class="number odometer">${data.settings.matchData.scores.mapsPlayed}/${data.settings.matchData.totalMaps}</div>
        </div>
        <div class="item" id="average">
          <div class="title">Average</div>
          <div class="number odometer">${formatNumber(data.settings.matchData.scores.average)}</div>
        </div>
        `;

        if (data.settings.matchData.scores.list.length > 0) {
          data.settings.matchData.scores.list.forEach((sc) => {
            if (
              !qualifiersScoresAlreadyDone.some(
                (score) => score.score === sc.score
              )
            ) {
              let item = document.createElement("div");
              item.classList.add("item");
              let mods = "";
              sc.mods.forEach((mod) => {
                mods += `<img src="./img/modsIcons/${escapeHtml(mod)}.svg" height="18" alt="" />`;
                return mods;
              });

              item.innerHTML =
                sc.mods.length > 2
                  ? `<div class="mods">
              <span>${mods}</span>
          </div>
            <div class="number">${formatNumber(sc.score)}</div>`
                  : `
              <div class="mods">
                  ${mods}
              </div>
                <div class="number">${formatNumber(sc.score)}</div>`;

              item.classList.add("show");
              scoresDiv.appendChild(item);
              qualifiersScoresAlreadyDone.push(sc);
            }

            /*  if (mapsPlayedOld !== data.settings.matchData.scores.mapsPlayed) {
              scoresDiv.innerHTML = "";
              if (i === data.settings.matchData.scores.list.length) {
                scoresDiv.appendChild(item);
                setTimeout(function () {
                  item.classList.add("show");
                }, 10);
              } else {
                item.classList.add("show");
                scoresDiv.appendChild(item);
              }
            } */
          });
        } else {
          scoresDiv.innerHTML = "";
        }
        mapsPlayedOld = data.settings.matchData.scores.mapsPlayed;
      }

      /* When the match is TeamVS */
      if (
        data.settings.matchSettings.MatchType === "teamVS" &&
        data.settings.matchSettings.Stage !== "Qualifiers"
      ) {
        qualifiers.style.display = "none";
        match.style.display = "grid";

        /* console.log(data.settings); */

        let team1ImageClass = "flag";
        let team2ImageClass = "flag";

        let team1Image = `https://raw.githubusercontent.com/ppy/osu-resources/master/osu.Game.Resources/Textures/Flags/__.png`;
        let team2Image = `https://raw.githubusercontent.com/ppy/osu-resources/master/osu.Game.Resources/Textures/Flags/__.png`;

        /* Check if team names are equal to images in the folder and grab their images */
        team1Image = isTeamImage(
          data.settings.matchData.teams[0],
          data.settings.matchData.teamImages[0]?.name
        )
          ? data.settings.matchData.teamImages[0].path
          : team1Image;
        team2Image = isTeamImage(
          data.settings.matchData.teams[1],
          data.settings.matchData.teamImages[1]?.name
        )
          ? data.settings.matchData.teamImages[1].path
          : team2Image;

        team1ImageClass = isTeamImage(
          data.settings.matchData.teams[0],
          data.settings.matchData.teamImages[0]?.name
        )
          ? "propic"
          : team1ImageClass;

        team2ImageClass = isTeamImage(
          data.settings.matchData.teams[1],
          data.settings.matchData.teamImages[1]?.name
        )
          ? "propic"
          : team2ImageClass;

        /* Check if team names are equal the Nations Names and grab their flag */
        let fcountry1 = isCountry(data.settings.matchData.teams[0]);
        let fcountry2 = isCountry(data.settings.matchData.teams[1]);

        team1Image =
          fcountry1 !== false
            ? `https://raw.githubusercontent.com/ppy/osu-resources/master/osu.Game.Resources/Textures/Flags/${fcountry1}.png`
            : team1Image;
        team2Image =
          fcountry2 !== false
            ? `https://raw.githubusercontent.com/ppy/osu-resources/master/osu.Game.Resources/Textures/Flags/${fcountry2}.png`
            : team2Image;

        let teamOne =
          data.settings.matchData.teams[0].length > 12
            ? `<div class="name" id="name1">
        <span>${escapeHtml(data.settings.matchData.teams[0])}</span>
      </div>`
            : `<div class="name" id="name1">${escapeHtml(data.settings.matchData.teams[0])}
    </div>`;
        let teamTwo =
          data.settings.matchData.teams[1].length > 12
            ? `<div class="name" id="name2">
        <span>${escapeHtml(data.settings.matchData.teams[1])}</span>
      </div>`
            : `<div class="name" id="name2">${escapeHtml(data.settings.matchData.teams[1])}
      </div>`;

        if (data.settings.matchSettings.ScoreReverse) {
          team1.innerHTML = `
        <img
          class="${team2ImageClass}"
          id="flag1"
          src="${team2Image}"
          alt=""
        />${teamTwo}`;

          team2.innerHTML = `
        <img
          class="${team1ImageClass}"
          id="flag2"
          src="${team1Image}"
          alt=""
        />${teamOne}
        `;
        } else {
          team1.innerHTML = `
        <img
          class="${team1ImageClass}"
          id="flag1"
          src="${team1Image}"
          alt=""
        />${teamOne}`;

          team2.innerHTML = `
        <img
          class="${team2ImageClass}"
          id="flag2"
          src="${team2Image}"
          alt=""
        />${teamTwo}
        `;
        }

        score1.innerHTML = data.settings.matchData.scores.team1;
        score2.innerHTML = data.settings.matchData.scores.team2;
      }

      /* When the match is 1VS1 */
      if (
        data.settings.matchSettings.MatchType === "1vs1" &&
        data.settings.matchSettings.Stage !== "Qualifiers"
      ) {
        qualifiers.style.display = "none";
        match.style.display = "grid";
        let playerOne =
          data.settings.matchData.players[0].username.length > 12
            ? `<div class="name" id="name1">
        <span>${escapeHtml(data.settings.matchData.players[0].username)}</span>
      </div>`
            : `<div class="name" id="name1">${escapeHtml(data.settings.matchData.players[0].username)}</div>`;

        let playerTwo =
          data.settings.matchData.players[1].username.length > 12
            ? `<div class="name" id="name2">
        <span>${escapeHtml(data.settings.matchData.players[1].username)}</span>
      </div>`
            : `<div class="name" id="name2">${escapeHtml(data.settings.matchData.players[1].username)}</div>`;

        team1.innerHTML = `
        <img class="propic" alt="" id="propic1" src="${avatarOf(data.settings.matchData.players[0])}" />
        ${playerOne}
        `;
        team2.innerHTML = `
        <img class="propic" alt="" id="propic2" src="${avatarOf(data.settings.matchData.players[1])}" />
        ${playerTwo}
        `;

        if (data.settings.matchSettings.ScoreReverse) {
          score1.innerHTML = data.settings.matchData.scores.player2;
          score2.innerHTML = data.settings.matchData.scores.player1;
        } else {
          score1.innerHTML = data.settings.matchData.scores.player1;
          score2.innerHTML = data.settings.matchData.scores.player2;
        }
      }
    }

    /* When the match is ended */
    if (data.settings.matchData && data.settings.matchSettings) {
      if (data.settings.matchData.scores.isFinished === true) {
        /* console.log("is finished: ", data.settings.matchData.scores.isFinished); */
        isFinished = true;
        /* If match is TeamVS or 1v1 */
        if (data.settings.matchSettings.Stage !== "Qualifiers") {
          winner.style.display = "flex";
          match.style.display = "none";

          if (!data.settings.displayerSettings.TransparentBackground) {
            app.style.backgroundImage =
              data.settings.matchData.scores.winner === 1
                ? "url('img/winnerRed.png')"
                : "url('img/winnerBlue.png')";
          }

          let dataHTML =
            data.settings.matchSettings.MatchType === "1vs1"
              ? `
          <span>${escapeHtml(
            data.settings.matchData.players[
              data.settings.matchData.scores.winner - 1
            ].username
          )}</span> won the match!
        `
              : `
            <span>${escapeHtml(
              data.settings.matchData.teams[
                data.settings.matchData.scores.winner - 1
              ]
            )}</span> won the match!
          `;
          winner.innerHTML = dataHTML;
        }

        return;
      }
      if (
        data.settings.matchData.scores.isFinished === false &&
        data.settings.matchSettings.Stage !== "Qualifiers"
      ) {
        isFinished = false;
        data.settings.displayerSettings.TransparentBackground
          ? (app.style.backgroundImage = "none")
          : (app.style.backgroundImage = "url('img/redVSblue.png')");
        app.style.backgroundPosition = "bottom";
        match.style.display = "grid";
        winner.style.display = "none";
        return;
      }
    }
  };

  ws.onclose = function () {
    setTimeout(initializeWebsocket, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  };
}

function escapeHtml(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value).replace(/[&<>"']/g, (character) => entities[character]);
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function isCountry(name) {
  const nationalities = {
    Africa: "ZA",
    Argentina: "AR",
    Australia: "AU",
    Austria: "AT",
    Belarus: "BY",
    Belgium: "BE",
    Brazil: "BR",
    Bulgaria: "BG",
    Canada: "CA",
    China: "CN",
    Chile: "CL",
    Croatia: "HR",
    Colombia: "CO",
    "Costa Rica": "CR",
    Cyprus: "CY",
    "Czech Republic": "CZ",
    Czech: "CZ",
    Denmark: "DK",
    Ecuador: "EC",
    Egypt: "EG",
    Estonia: "EE",
    Finland: "FI",
    France: "FR",
    Germany: "DE",
    Greece: "GR",
    "Hong Kong": "HK",
    Hungary: "HU",
    India: "IN",
    Indonesia: "ID",
    Ireland: "IE",
    Israel: "IL",
    Italy: "IT",
    Japan: "JP",
    Kazakhstan: "KZ",
    Latvia: "LV",
    Lithuania: "LT",
    Malaysia: "MY",
    Mexico: "MX",
    Moldova: "MD",
    Morocco: "MA",
    "New Zealand": "NZ",
    Netherlands: "NL",
    Norway: "NO",
    Peru: "PE",
    Philippines: "PH",
    Poland: "PL",
    Portugal: "PT",
    Romania: "RO",
    Russia: "RU",
    Singapore: "SG",
    Slovenia: "SI",
    "South Africa": "ZA",
    "South Korea": "KR",
    Korea: "KR",
    "Saudi Arabia": "SA",
    Serbia: "RS",
    Slovakia: "SK",
    Spain: "ES",
    Sweden: "SE",
    Switzerland: "CH",
    Thailand: "TH",
    Turkey: "TR",
    Taiwan: "TW",
    Ukraine: "UA",
    "United Arab Emirates": "AE",
    "United States": "US",
    "United Kingdom": "GB",
    Uruguay: "UY",
    Venezuela: "VE",
    Vietnam: "VN",
  };
  if (Object.keys(nationalities).includes(name)) {
    return nationalities[name];
  } else {
    return false;
  }
}

function isTeamImage(teamName, image) {
  return teamName === image;
}
