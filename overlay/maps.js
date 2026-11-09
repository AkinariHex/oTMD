const isRanked = location.pathname.startsWith("/ranked");
const MOVE_MS = 300;
const MOVE_EASING = "cubic-bezier(0.23, 1, 0.32, 1)";
const SVG_NS = "http://www.w3.org/2000/svg";
const GRADE_COLORS = { XH: "#b0bec5", X: "#ffd700", SH: "#b0bec5", S: "#ffd700", A: "#69f0ae", B: "#40c4ff", C: "#ffab40", D: "#ff5252", F: "#9e9e9e" };
const ICONS = {
  star: { fill: "#fbbf24", shapes: [["path", { d: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" }]] },
  clock: { stroke: "#9ca3af", shapes: [["circle", { cx: 12, cy: 12, r: 10 }], ["polyline", { points: "12 6 12 12 16 14" }]] },
  bpm: { stroke: "#06b6d4", shapes: [["path", { d: "M9 18V5l12-2v13" }], ["circle", { cx: 6, cy: 18, r: 3 }], ["circle", { cx: 18, cy: 16, r: 3 }]] },
};
const sampleSide = (name, score, grade, won) => ({ userId: 0, avatar: SAMPLE_AVATAR, name, score, grade, won });
const sampleMap = (round, title, version, multiplier, sides, live) => ({
  key: round, round, title, version, beatmapId: round, cover: null, multiplier: isRanked ? multiplier : null,
  stars: 6.42, length: 154, bpm: 180, ar: 9.5, od: 9, cs: 4, hp: 5.5, live, sides,
});
const SAMPLE_MAPS = [
  sampleMap(1, "First Sample Map", "Insane", 1, [sampleSide("Red Player", 845123, "A", true), sampleSide("Blue Player", 612345, "B", false)], false),
  sampleMap(2, "Second Sample Map", "Expert", 1.5, [sampleSide("Red Player", 512000, "B", false), sampleSide("Blue Player", 901234, "S", true)], false),
  sampleMap(3, "Third Sample Map", "Extra", 2, [sampleSide("", 0, null, false), sampleSide("", 0, null, false)], true),
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

function buildSide(side, position, scored) {
  const root = make("div", `map-side ${position}`);
  const parts = [];

  if (side.avatar) {
    const avatar = make("img", "map-avatar");
    avatar.alt = "";
    avatar.src = side.avatar;
    parts.push(avatar);
  }

  const name = make("span", "map-name", side.name);
  name.style.color = side.won && scored ? "#69f0ae" : "#ccc";
  parts.push(name);

  if (side.grade && scored) {
    const grade = make("span", "map-grade", side.grade);
    grade.style.color = GRADE_COLORS[side.grade] ?? "#9e9e9e";
    parts.push(grade);
  }
  if (scored) parts.push(make("span", "map-score", numberFormat.format(side.score)));

  root.append(...(position === "left" ? parts : parts.reverse()));
  return root;
}

function statPair(label, value) {
  const pair = make("span", "map-pair");
  pair.append(make("span", "label", label), make("span", "value", value.toFixed(1)));
  return pair;
}

function stat(className, iconName, text) {
  const node = make("span", `map-stat ${className}`);
  node.append(icon(iconName), text);
  return node;
}

function buildCard(map) {
  const scored = !map.live;
  const card = make("div", `map-card${map.live ? " live" : ""}`);
  card.style.background = map.cover
    ? `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.9) 80%), url("${encodeURI(map.cover)}")`
    : "rgba(255,255,255,0.04)";

  const head = make("div", "map-head");
  head.append(make("div", "map-title", map.title ? `${map.title} [${map.version}]` : `#${map.beatmapId}`));
  if (map.live) head.append(make("span", "map-live", "LIVE"));

  const versus = make("div", "map-versus");
  versus.append(buildSide(map.sides[0], "left", scored), make("span", "map-vs", "vs"), buildSide(map.sides[1], "right", scored));

  const roundInfo = make("div", "map-round-info");
  roundInfo.append(make("span", "map-round", `#${map.round}`));
  if (map.multiplier !== null) roundInfo.append(make("span", "map-damage", `Damage x${map.multiplier}`));

  const stats = make("div", "map-stats");
  stats.append(stat("star", "star", map.stars.toFixed(1)));
  if (map.length > 0) stats.append(stat("clock", "clock", formatLength(map.length)));
  if (map.bpm > 0) stats.append(stat("bpm", "bpm", String(Math.round(map.bpm))));
  const difficulty = make("span", "map-difficulty");
  difficulty.append(statPair("AR", map.ar), statPair("OD", map.od), statPair("CS", map.cs), statPair("HP", map.hp));
  stats.append(difficulty);

  const foot = make("div", "map-foot");
  foot.append(roundInfo, stats);
  card.append(head, versus, foot);
  return card;
}

function renderMaps(maps, style) {
  frame.hidden = !maps?.length;
  if (!maps?.length) return;
  applyFrameStyle(frame, style);

  // Cards slide to their new place when a map is added, as in the original overlay.
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
