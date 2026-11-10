const board = document.getElementById("board");
const SAMPLE_COUNT = Math.min(Number(overlayParams.get("count")) || 4, 8);
const STACKED_UP_TO = 4;

const sampleMatch = (id, acronym, tournamentName, stage, bestOf, first, firstScore, second, secondScore, winner = null) => ({
  matchId: String(id),
  status: winner === null ? "live" : "finished",
  stage,
  bestOf,
  acronym,
  tournamentName,
  sides: [{ name: first, avatar: SAMPLE_AVATAR, score: firstScore }, { name: second, avatar: SAMPLE_AVATAR, score: secondScore }],
  winner,
});
const SAMPLE_MATCHES = [
  sampleMatch(1, "MC4", "Mediterranean Cup 4", "Quarterfinals", 9, "Red Player", 4, "Blue Player", 2),
  sampleMatch(2, "NTC", "Northern Team Cup", "Semifinals", 11, "Red Team", 3, "Blue Team", 5),
  sampleMatch(3, "ACL", "Autumn Clash", "Round of 16", 7, "First Player", 4, "Second Player", 1, 0),
  sampleMatch(4, "MC4", "Mediterranean Cup 4", "Quarterfinals", 9, "A very long player name", 0, "Short", 0),
  sampleMatch(5, "NTC", "Northern Team Cup", "Semifinals", 11, "Aurora United", 5, "Polar", 5),
  sampleMatch(6, "ACL", "Autumn Clash", "Round of 16", 7, "Third Player", 2, "Fourth Player", 3),
  sampleMatch(7, "MC4", "Mediterranean Cup 4", "Grandfinals", 13, "Fifth Player", 6, "Sixth Player", 4),
  sampleMatch(8, "ACL", "Autumn Clash", "Round of 32", 7, "Seventh Player", 3, "Eighth Player", 4, 1),
];
const STAGE_LABELS = { Grandfinals: "Grand Finals" };

// Digits only, so nothing else from the URL can ever match or reach the page.
const selectedMatches = overlayParams.has("matches") ? new Set(overlayParams.get("matches").split(",").filter((id) => /^\d{1,12}$/.test(id))) : null;

const rendered = new Map();
let layoutKey = "";
let heading = null;

const hueOf = (name) => [...name].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 360;
const firstTo = (match) => (match.bestOf + 1) / 2;
const isLost = (match, index) => match.status === "finished" && match.winner !== null && match.winner !== index;

function avatarOf(side) {
  if (side.avatar) {
    const image = make("img", "av");
    image.alt = "";
    image.src = side.avatar;
    return image;
  }
  const initial = make("span", "av", (side.name[0] ?? "?").toUpperCase());
  initial.style.setProperty("--h", hueOf(side.name));
  return initial;
}

function scoreNumber(match, index, previous, animation) {
  const value = match.sides[index].score;
  const before = previous?.sides[index].score;
  if (before === undefined || before === value) return make("span", "num", String(value));
  if (animation === "pop") return make("span", "num bump", String(value));

  const roll = make("span", "roll");
  roll.append(make("span", "roll-old", String(before)), make("span", "roll-new", String(value)));
  return roll;
}

function metaText(match, style) {
  const stage = `${STAGE_LABELS[match.stage] ?? match.stage} - BO${match.bestOf}`;
  return style.singleTitle || !match.acronym ? stage : `${match.acronym} - ${stage}`;
}

function stateOf(match) {
  return match.status === "finished" ? make("span", "", "Final") : make("span", "live-chip", "LIVE");
}

function metaRow(match, style, className) {
  const row = make("div", className);
  row.append(make("span", "", metaText(match, style)), stateOf(match));
  return row;
}

function tableCard(match, style, previous) {
  const card = make("section", "t-match");
  card.append(metaRow(match, style, "t-meta"));
  match.sides.forEach((side, index) => {
    const leading = side.score > match.sides[1 - index].score;
    const row = make("div", `t-row${leading ? " lead" : ""}${isLost(match, index) ? " lost" : ""}`);
    const score = make("span", "t-score");
    score.append(scoreNumber(match, index, previous, style.pointAnimation));
    row.append(make("span", `t-bar ${index === 0 ? "red" : "blue"}`), avatarOf(side), make("span", "name", side.name), score);
    card.append(row);
  });
  return card;
}

function pipsOf(match, side) {
  const pips = make("div", "d-pips");
  for (let pip = 0; pip < firstTo(match); pip++) pips.append(make("span", `d-pip${pip < side.score ? " on" : ""}`));
  return pips;
}

function duelSide(match, index) {
  const side = match.sides[index];
  const person = make("div", `d-side${index === 1 ? " right" : ""}`);
  const info = make("div", "d-info");
  info.append(make("span", "name", side.name), pipsOf(match, side));
  person.append(avatarOf(side), info);
  return person;
}

function duelCard(match, style, previous) {
  const card = make("section", `d-match${isLost(match, 0) ? " left-lost" : ""}${isLost(match, 1) ? " right-lost" : ""}`);
  const scores = make("div", "d-score");
  scores.append(make("span", "d-fade"), scoreNumber(match, 0, previous, style.pointAnimation), make("i", "", "-"), scoreNumber(match, 1, previous, style.pointAnimation));
  const body = make("div", "d-body");
  body.append(duelSide(match, 0), scores, duelSide(match, 1));
  card.append(
    make("span", "d-half red"),
    make("span", "d-half blue"),
    metaRow(match, style, "d-meta"),
    body
  );
  return card;
}

function titleOf(matches, style) {
  if (!style.singleTitle) return null;
  return style.title.trim() || matches[0].tournamentName || matches[0].acronym || null;
}

function render(matches, style) {
  board.hidden = matches.length === 0;
  if (matches.length === 0) {
    rendered.clear();
    layoutKey = "";
    return;
  }

  const tier = matches.length === 1 ? "full" : matches.length <= STACKED_UP_TO ? "stack" : "grid";
  const title = titleOf(matches, style);
  const key = [style.look, tier, title, style.singleTitle].join("|");
  if (key !== layoutKey) {
    layoutKey = key;
    rendered.clear();
    board.replaceChildren();
    board.className = style.look;
    board.dataset.tier = tier;
    heading = title ? make("header", style.look === "duel" ? "d-title" : "t-title", title) : null;
  }

  const buildCard = style.look === "duel" ? duelCard : tableCard;
  const keep = new Set(matches.map((match) => match.matchId));
  for (const id of rendered.keys()) if (!keep.has(id)) rendered.delete(id);

  const cards = matches.map((match, index) => {
    const hash = JSON.stringify(match);
    const existing = rendered.get(match.matchId);
    if (existing?.hash === hash) return existing.card;
    const card = buildCard(match, style, existing?.match);
    if (!existing) {
      card.classList.add("enter");
      card.style.setProperty("--i", index);
      card.addEventListener("animationend", () => card.classList.remove("enter"), { once: true });
    }
    rendered.set(match.matchId, { card, hash, match });
    return card;
  });

  // Only misplaced nodes move, because reinserting a card would restart its animations.
  const nodes = heading ? [heading, ...cards] : cards;
  nodes.forEach((node, index) => {
    if (board.children[index] !== node) board.insertBefore(node, board.children[index] ?? null);
  });
  while (board.children.length > nodes.length) board.lastChild.remove();
}

function visibleMatches(settings) {
  if (showSample) return SAMPLE_MATCHES.slice(0, SAMPLE_COUNT);
  // A match with no name yet has not been read from osu!.
  const known = (settings.broadcastData ?? []).filter((match) => match.sides[0].name !== "");
  return selectedMatches ? known.filter((match) => selectedMatches.has(match.matchId)) : known;
}

connectOverlay("broadcast", (settings) => render(visibleMatches(settings), settings.broadcastStyle));
