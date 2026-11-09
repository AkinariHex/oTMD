const HIGH_LIFE = 500000;
const LOW_LIFE = 200000;
const SIDES = [
  { className: "red", angle: "270deg", end: "#ff6b9d", colors: ["#d63864", "#a02050", "#6b0020"] },
  { className: "blue", angle: "90deg", end: "#6ab0f5", colors: ["#3a7bd5", "#1a5aad", "#0a2a60"] },
];
const SAMPLE_VIEW = {
  winner: null,
  players: [
    { id: 0, username: "Red Player", life: 412345, maxLife: 1000000, overflow: 0 },
    { id: 0, username: "Blue Player", life: 894042, maxLife: 1000000, overflow: 0 },
  ],
};

const frame = document.getElementById("health");
const container = document.getElementById("players");

function buildPlayer(side) {
  const card = make("div", `player ${side.className}`);
  const identity = make("div", "identity");
  const avatar = make("img", "avatar");
  avatar.alt = "";
  const name = make("span", "name");
  identity.append(avatar, name);

  const bar = make("div", "bar");
  const fill = make("div", "fill");
  fill.append(make("div", "shimmer"));
  const life = make("div", "life");
  const points = make("span", "points");
  life.append(make("span", "heart", "♥"), points);
  bar.append(fill, life);

  const status = make("div", "status");
  const glow = make("div", "winner-glow");
  card.append(identity, bar, status, glow);
  return { card, avatar, name, fill, points, status, glow, side };
}

const cards = SIDES.map(buildPlayer);
container.prepend(cards[0].card, cards[1].card);

function fillColor(side, life) {
  if (life > HIGH_LIFE) return side.colors[0];
  return life > LOW_LIFE ? side.colors[1] : side.colors[2];
}

function renderPlayer(refs, player, isWinner) {
  const percent = Math.min(100, Math.max(0, (player.life / player.maxLife) * 100));
  setImage(refs.avatar, player.id ? `https://a.ppy.sh/${player.id}` : SAMPLE_AVATAR);
  refs.name.textContent = player.username;
  refs.fill.style.width = `${percent}%`;
  refs.fill.style.background = `linear-gradient(${refs.side.angle}, ${fillColor(refs.side, player.life)} 0%, ${refs.side.end} 100%)`;
  refs.points.textContent = numberFormat.format(player.life);
  refs.glow.hidden = !isWinner;
  refs.glow.style.display = isWinner ? "" : "none";

  const status = [];
  if (player.overflow < 0) status.push(make("span", "overflow", numberFormat.format(player.overflow)));
  if (isWinner) status.push(make("span", "winner", "WINNER"));
  refs.status.replaceChildren(...status);
}

function renderHealth(view, style) {
  frame.hidden = !view;
  if (!view) return;
  applyFrameStyle(frame, style);
  view.players.forEach((player, index) => renderPlayer(cards[index], player, view.winner !== null && view.winner === player.id));
}

connectOverlay("ranked", (settings) => renderHealth(showSample ? SAMPLE_VIEW : settings.rankedData, settings.rankedStyles.Health));
