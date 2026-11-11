let panel = document.getElementById("panel");
let amb = document.getElementById("amb");
let metaTop = document.getElementById("metaTop");
let metaBottom = document.getElementById("metaBottom");
let message = document.getElementById("message");
let match = document.getElementById("match");
let qualifiers = document.getElementById("qualifiers");

const FLAGS = "https://raw.githubusercontent.com/ppy/osu-resources/master/osu.Game.Resources/Textures/Flags";
const AMBIENT = {
  aurora: '<div class="bw r"><div class="blob"></div></div><div class="bw b"><div class="blob"></div></div><div class="film"></div>',
  drift: '<div class="field"></div><div class="orb"></div><div class="film"></div>',
};

let layout = null;
let lastRender = "";
let lastScores = [0, 0];

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
    lastRender = "";
  };

  ws.onmessage = function (event) {
    var data = JSON.parse(event.data);
    if (data.type === "rankedState" || data.type === "broadcastState") return;
    var settings = data.settings;
    if (showSample) applySampleMatch(settings);
    applyDisplayer(settings.displayerSettings);

    var matchSettings = settings.matchSettings;
    var matchData = settings.matchData;
    if (!matchSettings || matchSettings.MatchID === "" || matchData === undefined) {
      showMessage("Waiting a Match");
      return;
    }
    if (matchSettings.Stage === "Qualifiers") {
      renderQualifiers(matchSettings, matchData);
      return;
    }
    renderMatch(matchSettings, matchData);
  };

  ws.onclose = function () {
    setTimeout(initializeWebsocket, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  };
}

function applyDisplayer(displayer) {
  var next = displayer.MatchLayout === "drift" ? "drift" : "aurora";
  if (next !== layout) {
    layout = next;
    panel.classList.remove("aurora", "drift");
    panel.classList.add(next);
    amb.innerHTML = AMBIENT[next];
    lastRender = "";
  }
  panel.classList.toggle("small", displayer.SmallDisplayer);
  panel.classList.toggle("transparent", displayer.TransparentBackground);
  panel.style.borderRadius = displayer.VisualizerStyle;
}

function show(view) {
  message.hidden = view !== message;
  match.hidden = view !== match;
  qualifiers.hidden = view !== qualifiers;
}

function setLights(left, right, won, firstTo) {
  // Each light reaches further in with its lead (as a share of first-to) and floods the box on a win.
  var lead = (left - right) / firstTo;
  var sr = won === 1 ? 3.6 : won === 2 ? 0.6 : 1 + Math.max(lead, 0) * 0.7 - Math.max(-lead, 0) * 0.35;
  var sb = won === 2 ? 3.6 : won === 1 ? 0.6 : 1 + Math.max(-lead, 0) * 0.7 - Math.max(lead, 0) * 0.35;
  panel.style.setProperty("--sr", sr.toFixed(3));
  panel.style.setProperty("--sb", sb.toFixed(3));
  panel.dataset.state = won ? `won-${won}` : left > right ? "lead-1" : right > left ? "lead-2" : "tie";
}

function showMessage(text) {
  if (lastRender === text) return;
  lastRender = text;
  metaTop.innerHTML = "";
  metaBottom.innerHTML = "";
  message.textContent = text;
  setLights(0, 0, 0, 1);
  show(message);
}

function tournamentNameOf(matchData) {
  var tournament = matchData.tournament;
  if (!tournament || tournament.error) return "";
  return tournament.tournamentName.length >= 22 ? tournament.acronym : tournament.tournamentName;
}

function teamPicture(matchData, index) {
  var name = matchData.teams[index];
  var country = isCountry(name);
  if (country) return `<img class="flag" src="${FLAGS}/${country}.png" alt="" />`;
  var image = matchData.teamImages?.[index];
  if (isTeamImage(name, image?.name)) return `<img class="av" src="${escapeHtml(image.path)}" alt="" />`;
  return `<img class="flag" src="${FLAGS}/__.png" alt="" />`;
}

/* Left side is always red, right side always blue. */
function sidesOf(matchSettings, matchData) {
  var scores = matchData.scores;
  var reverse = matchSettings.ScoreReverse;
  if (matchSettings.MatchType === "teamVS") {
    var teams = [0, 1].map((i) => ({ name: matchData.teams[i], picture: teamPicture(matchData, i) }));
    return {
      left: reverse ? teams[1] : teams[0],
      right: reverse ? teams[0] : teams[1],
      leftScore: scores.team1,
      rightScore: scores.team2,
      winnerSide: reverse && scores.winner ? 3 - scores.winner : scores.winner,
    };
  }
  var players = matchData.players.map((player) => ({
    name: player.username,
    picture: `<img class="av" src="${avatarOf(player)}" alt="" />`,
  }));
  return {
    left: players[0],
    right: players[1],
    leftScore: reverse ? scores.player2 : scores.player1,
    rightScore: reverse ? scores.player1 : scores.player2,
    winnerSide: scores.winner,
  };
}

function renderMatch(matchSettings, matchData) {
  var sides = sidesOf(matchSettings, matchData);
  var won = matchData.scores.isFinished === true ? sides.winnerSide || 0 : 0;
  var key = JSON.stringify([layout, matchSettings.MatchType, matchSettings.Stage, matchSettings.BestOF, tournamentNameOf(matchData), sides, won]);
  if (key === lastRender) return;
  lastRender = key;

  var left = Number(sides.leftScore) || 0;
  var right = Number(sides.rightScore) || 0;
  var bumpLeft = left > lastScores[0] ? "bump" : "";
  var bumpRight = right > lastScores[1] ? "bump" : "";
  lastScores = [left, right];

  var bestOf = Number(matchSettings.BestOF) || 1;
  var firstTo = Math.ceil(bestOf / 2);
  setLights(left, right, won, firstTo);

  var stage = escapeHtml(matchSettings.Stage);
  var tournament = escapeHtml(tournamentNameOf(matchData));
  var winnerName = won ? escapeHtml((won === 1 ? sides.left : sides.right).name) : "";

  if (layout === "drift") {
    metaTop.innerHTML = `<span class="ell">${tournament}</span><span>${stage}</span>`;
    metaBottom.innerHTML = `<span class="ell">${won ? `${winnerName} advances` : `First to ${firstTo}`}</span><span>Best of ${bestOf}</span>`;
    var row = (side, score, other, index, bump) => {
      var state = won ? (won === index ? "" : "lose") : score < other ? "trail" : "";
      return `<div class="row ${state}">${side.picture}<span class="name ell">${escapeHtml(side.name)}</span><span class="n"><span class="num ${bump}">${score}</span></span></div>`;
    };
    match.className = "match";
    match.innerHTML = row(sides.left, left, right, 1, bumpLeft) + row(sides.right, right, left, 2, bumpRight);
  } else {
    metaTop.innerHTML = `<span>${stage}</span><span>Best of ${bestOf}</span>`;
    metaBottom.innerHTML = `<span class="ell">${tournament}</span>`;
    if (won) {
      match.className = "match won";
      match.innerHTML = `<b class="ell">${winnerName}</b><span>wins</span><span class="final">${Math.max(left, right)} - ${Math.min(left, right)}</span>`;
    } else {
      match.className = "match";
      match.innerHTML = `
        <div class="side left">${sides.left.picture}<span class="name ell">${escapeHtml(sides.left.name)}</span></div>
        <div class="score">
          <span class="${left < right ? "trail" : ""}"><span class="num ${bumpLeft}">${left}</span></span>
          <span class="sep">-</span>
          <span class="${right < left ? "trail" : ""}"><span class="num ${bumpRight}">${right}</span></span>
        </div>
        <div class="side right">${sides.right.picture}<span class="name ell">${escapeHtml(sides.right.name)}</span></div>`;
    }
  }
  show(match);
}

function renderQualifiers(matchSettings, matchData) {
  lastRender = "";
  setLights(0, 0, 0, 1);
  show(qualifiers);
  metaTop.innerHTML = `<span>${escapeHtml(matchSettings.Stage)}</span>`;
  metaBottom.innerHTML = `<span class="ell">${escapeHtml(tournamentNameOf(matchData))}</span>`;

  let name =
    matchData.player.username.length > 12
      ? `<span>${escapeHtml(matchData.player.username)}</span>`
      : escapeHtml(matchData.player.username);

  userDiv.innerHTML = `
  <img src="http://s.ppy.sh/a/${matchData.player.userid}" alt="${escapeHtml(matchData.player.username)}" />
  <div class="name">${name}</div>
  `;

  infoDiv.innerHTML = `
  <div class="item" id="counterMaps">
    <div class="title">Maps</div>
    <div class="number odometer">${matchData.scores.mapsPlayed}/${matchData.totalMaps}</div>
  </div>
  <div class="item" id="average">
    <div class="title">Average</div>
    <div class="number odometer">${formatNumber(matchData.scores.average)}</div>
  </div>
  `;

  if (matchData.scores.list.length > 0) {
    matchData.scores.list.forEach((sc) => {
      if (!qualifiersScoresAlreadyDone.some((score) => score.score === sc.score)) {
        let item = document.createElement("div");
        item.classList.add("item");
        let mods = "";
        sc.mods.forEach((mod) => {
          mods += `<img src="./img/modsIcons/${escapeHtml(mod)}.svg" height="18" alt="" />`;
        });

        item.innerHTML =
          sc.mods.length > 2
            ? `<div class="mods"><span>${mods}</span></div><div class="number">${formatNumber(sc.score)}</div>`
            : `<div class="mods">${mods}</div><div class="number">${formatNumber(sc.score)}</div>`;

        item.classList.add("show");
        scoresDiv.appendChild(item);
        qualifiersScoresAlreadyDone.push(sc);
      }
    });
  } else {
    scoresDiv.innerHTML = "";
  }
  mapsPlayedOld = matchData.scores.mapsPlayed;
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
  return Object.hasOwn(nationalities, name) ? nationalities[name] : false;
}

function isTeamImage(teamName, image) {
  return teamName === image;
}
