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

async function sendMatchToWebsite(data) {
  var settings = {
    webapikey: data.webapikey.apikey,
    me: data.matchSettings.ActiveAccount,
    matchID: data.matchSettings.MatchID,
    matchType: data.matchSettings.MatchType,
    stage: data.matchSettings.Stage || "",
    bestOF: data.matchSettings.BestOF || "",
    warmups: data.matchSettings.Warmups || "",
    tournament: !data.matchData.tournament.error
      ? {
          name: data.matchData.tournament.tournamentName,
          acronym: data.matchData.tournament.acronym,
        }
      : { name: "", acronym: data.matchData.tournament.acronym },
    players:
      data.matchSettings.ScoreReverse && data.matchData.players
        ? [data.matchData?.players[1], data.matchData?.players[0]]
        : data.matchData.players || "",
    player: data.matchData.player || "",
    teams:
      data.matchSettings.ScoreReverse && data.matchData.teams
        ? [data.matchData?.teams[1], data.matchData?.teams[0]]
        : data.matchData.teams || "",
    scores: data.matchData.scores || "",
    totalMaps: data.matchData.totalMaps || "",
    matchStart: data.matchData.tournamentStart || "",
    matchJSON: JSON.stringify(data.matchData.matchJSON),
  };

  /* https://otmd.app */ /* http://localhost:4000 */
  let response = await fetch("https://otmd.app/api/match?m=db", {
    method: "POST",
    body: JSON.stringify(settings),
  }).then((res) => res.json());
  if (response.message === "saved in DB") {
    let res = await fetch("https://otmd.app/api/match?m=discordWebhook", {
      method: "POST",
      body: JSON.stringify(settings),
    });
    res = await res.json();
  }
  return;
}

/* WEBSOCKET */
var ws = null;

function checkWebsocket() {
  if (!ws || ws.readyState === WebSocket.CLOSED) initializeWebsocket();
}

window.addEventListener("load", function () {
  checkWebsocket();
});

setInterval(checkWebsocket, 1000);

function initializeWebsocket() {
  ws = new WebSocket("ws://127.0.0.1:9052/");

  ws.onopen = function () {
    ws.send("Visualizer Connected");
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
    let isMatch = false;

    /* When the page is loaded */
    isMatch = data.settings?.matchSettings?.MatchID !== "";

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
      if (data.settings.displayerSettings.SmallDisplayer) {
        app.classList.add("small");
      } else {
        app.classList.remove("small");
      }

      if (data.settings.displayerSettings.TransparentBackground) {
        app.style.background = "transparent";
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
      app.style.borderRadius = data.settings.displayerSettings.VisualizerStyle;
    }

    /* When the user changes the match settings */
    if (data.type === "matchSettings" || isMatch === true) {
      /* General Settings */
      stageBO.innerHTML =
        data.settings.matchSettings.MatchID !== ""
          ? `${data.settings.matchSettings.Stage} - BO${data.settings.matchSettings.BestOF}`
          : "";
      tournamentName.innerHTML =
        /* Check for match data and if the tournament is into the database */
        data.settings.matchData !== undefined &&
        !data.settings.matchData.tournament.error
          ? data.settings.matchData.tournament.tournamentName.length >= 22
            ? data.settings.matchData.tournament.acronym
            : data.settings.matchData.tournament.tournamentName
          : "";

      /* When the match is Qualifiers */
      if (data.settings.matchSettings.Stage === "Qualifiers") {
        match.style.display = "none";
        winner.style.display = "none";
        qualifiers.style.display = "grid";

        /* console.log(data.settings.matchData); */

        stageBO.innerHTML = data.settings.matchSettings.Stage;

        let name =
          data.settings.matchData.player.username.length > 12
            ? `<span>${data.settings.matchData.player.username}</span>`
            : data.settings.matchData.player.username;

        userDiv.innerHTML = `
        <img src="http://s.ppy.sh/a/${data.settings.matchData.player.userid}" alt="${data.settings.matchData.player.username}" />
        <div class="name">${name}</div>
        `;

        infoDiv.innerHTML = `
        <div class="item" id="counterMaps">
          <div class="title">Maps</div>
          <div class="number odometer">${data.settings.matchData.scores.mapsPlayed}/${data.settings.matchData.totalMaps}</div>
        </div>
        <div class="item" id="average">
          <div class="title">Average</div>
          <div class="number odometer">${data.settings.matchData.scores.average}</div>
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
                mods += `<object data="./img/modsIcons/${mod}.svg" height="18"></object>`;
                return mods;
              });

              item.innerHTML =
                sc.mods.length > 2
                  ? `<div class="mods">
              <span>${mods}</span>
          </div>
            <div class="number">${sc.score}</div>`
                  : `
              <div class="mods">
                  ${mods}
              </div>
                <div class="number">${sc.score}</div>`;

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
        <span>${data.settings.matchData.teams[0]}</span>
      </div>`
            : `<div class="name" id="name1">${data.settings.matchData.teams[0]}
    </div>`;
        let teamTwo =
          data.settings.matchData.teams[1].length > 12
            ? `<div class="name" id="name2">
        <span>${data.settings.matchData.teams[1]}</span>
      </div>`
            : `<div class="name" id="name2">${data.settings.matchData.teams[1]}
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
        <span>${data.settings.matchData.players[0].username}</span>
      </div>`
            : `<div class="name" id="name1">${data.settings.matchData.players[0].username}</div>`;

        let playerTwo =
          data.settings.matchData.players[1].username.length > 12
            ? `<div class="name" id="name2">
        <span>${data.settings.matchData.players[1].username}</span>
      </div>`
            : `<div class="name" id="name2">${data.settings.matchData.players[1].username}</div>`;

        team1.innerHTML = `
        <img class="propic" alt="" id="propic1" src="http://s.ppy.sh/a/${data.settings.matchData.players[0].userid}" />
        ${playerOne}
        `;
        team2.innerHTML = `
        <img class="propic" alt="" id="propic2" src="http://s.ppy.sh/a/${data.settings.matchData.players[1].userid}" />
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
          <span>${
            data.settings.matchData.players[
              data.settings.matchData.scores.winner - 1
            ].username
          }</span> won the match!
        `
              : `
            <span>${
              data.settings.matchData.teams[
                data.settings.matchData.scores.winner - 1
              ]
            }</span> won the match!
          `;
          winner.innerHTML = dataHTML;
        }

        /* Send Match to website */
        if (data.settings.webapikey.status === true) {
          sendMatchToWebsite(data.settings);
        }
        return;
      }
      if (
        data.settings.matchData.scores.isFinished === false &&
        data.settings.matchSettings.Stage !== "Qualifiers"
      ) {
        isFinished = false;
        data.settings.displayerSettings.TransparentBackground
          ? (app.style.background = "transparent")
          : (app.style.backgroundImage = "url('img/redVSblue.png')");
        app.style.backgroundPosition = "bottom";
        match.style.display = "grid";
        winner.style.display = "none";
        return;
      }
    }
  };

  ws.onclose = function () {};
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
