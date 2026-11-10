const isRanked = location.pathname.startsWith("/ranked");
const MOVE_MS = 300;
const MOVE_EASING = "cubic-bezier(0.23, 1, 0.32, 1)";
const SVG_NS = "http://www.w3.org/2000/svg";
const GRADE_COLORS = { XH: "#b0bec5", X: "#ffd700", SH: "#b0bec5", S: "#ffd700", A: "#69f0ae", B: "#40c4ff", C: "#ffab40", D: "#ff5252", F: "#9e9e9e" };
const ICONS = {
  star: { fill: "#fbbf24", shapes: [["path", { d: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" }]] },
  clock: { stroke: "currentColor", shapes: [["circle", { cx: 12, cy: 12, r: 10 }], ["polyline", { points: "12 6 12 12 16 14" }]] },
};
const sampleSide = (name, score, grade, won) => ({ userId: 0, avatar: SAMPLE_AVATAR, name, score, grade, won });
const sampleMap = (round, title, version, multiplier, damage, sides, live) => ({
  key: round, round, title, version, beatmapId: round, cover: null, multiplier: isRanked ? multiplier : null, damage: isRanked ? damage : null,
  stars: 6.42, length: 154, bpm: 180, ar: 9.5, od: 9, cs: 4, hp: 5.5, live, sides,
});
const SAMPLE_MAPS = [
  sampleMap(1, "First Sample Map", "Insane", 1, 282778, [sampleSide("Red Player", 845123, "A", true), sampleSide("Blue Player", 612345, "B", false)], false),
  sampleMap(2, "Second Sample Map", "Expert", 1.5, 633851, [sampleSide("Red Player", 512000, "B", false), sampleSide("Blue Player", 901234, "S", true)], false),
  sampleMap(3, "Third Sample Map", "Extra", 1.5, null, [sampleSide("Red Player", 0, null, false), sampleSide("Blue Player", 0, null, false)], true),
];

const frame = document.getElementById("maps");
const list = document.getElementById("list");
const rendered = new Map();

function icon(name) {
  const definition = ICONS[name];
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "10");
  svg.setAttribute("height", "10");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", definition.fill ?? "none");
  if (definition.stroke) {
    svg.setAttribute("stroke", definition.stroke);
    svg.setAttribute("stroke-width", "2");
  }
  for (const [tag, attributes] of definition.shapes) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, value);
    svg.append(shape);
  }
  return svg;
}

function formatLength(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function outcomeOf(map, side) {
  if (map.live) return make("span", "map-outcome");
  if (side.won) return make("span", "map-outcome win", "WIN");
  if (map.damage !== null && map.sides.some((other) => other.won)) return make("span", "map-outcome damage", `-${numberFormat.format(map.damage)}`);
  return make("span", "map-outcome");
}

function buildRow(map, side, color) {
  const row = make("div", `map-row${side.won && !map.live ? " won" : ""}`);
  const avatar = make("img", `map-avatar${side.avatar ? "" : " empty"}`);
  avatar.alt = "";
  if (side.avatar) avatar.src = side.avatar;

  const grade = make("span", "map-grade", map.live ? "" : (side.grade ?? ""));
  if (side.grade) grade.style.color = GRADE_COLORS[side.grade] ?? "#9e9e9e";

  row.append(
    make("span", `map-side-bar ${color}`),
    avatar,
    make("span", "map-name", side.name),
    grade,
    make("span", "map-score", map.live ? "-" : numberFormat.format(side.score)),
    outcomeOf(map, side)
  );
  return row;
}

function statText(className, iconName, text) {
  const node = make("span", `map-stat ${className}`);
  if (iconName) node.append(icon(iconName));
  node.append(text);
  return node;
}

function statPair(label, value) {
  const pair = make("span", "map-pair");
  pair.append(make("span", "label", label), value.toFixed(1));
  return pair;
}

function buildCard(map) {
  const card = make("div", `map-card${map.live ? " live" : ""}`);
  if (map.cover) {
    const cover = make("div", "map-cover");
    cover.style.backgroundImage = `url("${encodeURI(map.cover)}")`;
    card.append(cover);
  }

  const title = make("div", "map-title", map.title ?? `#${map.beatmapId}`);
  if (map.version) title.append(" ", make("span", "map-version", `[${map.version}]`));
  const head = make("div", "map-head");
  head.append(make("span", "map-round", `#${map.round}`), title);
  if (map.multiplier !== null) head.append(make("span", "map-chip", `x${map.multiplier} damage`));
  if (map.live) head.append(make("span", "map-chip live", "LIVE"));

  const players = make("div", "map-players");
  players.append(buildRow(map, map.sides[0], "red"), buildRow(map, map.sides[1], "blue"));

  const foot = make("div", "map-foot");
  foot.append(statText("star", "star", map.stars.toFixed(2)));
  if (map.length > 0) foot.append(statText("", "clock", formatLength(map.length)));
  if (map.bpm > 0) foot.append(statText("", null, `${Math.round(map.bpm)} BPM`));
  const difficulty = make("span", "map-difficulty");
  difficulty.append(statPair("AR", map.ar), statPair("OD", map.od), statPair("CS", map.cs), statPair("HP", map.hp));
  foot.append(difficulty);

  card.append(head, players, foot);
  return card;
}

function renderMaps(maps, style) {
  frame.hidden = !maps?.length;
  if (!maps?.length) return;
  applyFrameStyle(frame, style);

  // Cards slide to their new place when a map is added.
  const before = new Map([...rendered].map(([key, entry]) => [key, entry.card.getBoundingClientRect().top]));
  const keep = new Set(maps.map((map) => String(map.key)));
  for (const [key, entry] of rendered) {
    if (!keep.has(key)) {
      entry.card.remove();
      rendered.delete(key);
    }
  }

  const ordered = maps.map((map) => {
    const key = String(map.key);
    const hash = JSON.stringify(map);
    const existing = rendered.get(key);
    if (existing?.hash === hash) return existing.card;
    const card = buildCard(map);
    if (existing) {
      card.style.animation = "none";
      existing.card.replaceWith(card);
    }
    rendered.set(key, { card, hash });
    return card;
  });
  list.replaceChildren(...ordered);
  // Layout sizes, because the entrance animation would inflate scrollHeight.
  list.classList.toggle("overflowing", frame.offsetHeight >= document.documentElement.clientHeight);

  for (const [key, top] of before) {
    const entry = rendered.get(key);
    if (!entry) continue;
    const distance = top - entry.card.getBoundingClientRect().top;
    if (distance) entry.card.animate([{ transform: `translateY(${distance}px)` }, { transform: "none" }], { duration: MOVE_MS, easing: MOVE_EASING });
  }
}

connectOverlay(isRanked ? "ranked" : "", (settings) => {
  const style = isRanked ? settings.rankedStyles.Maps : settings.displayerSettings.MapsStyle;
  const live = isRanked ? settings.rankedData?.maps : settings.matchSettings.MatchID === "" ? undefined : settings.matchData?.maps;
  renderMaps(showSample ? SAMPLE_MAPS : live, style);
});
