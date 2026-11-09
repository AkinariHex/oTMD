const RECENT_RESULTS = 10;
const SAMPLE_USER = { id: 0, username: "Red Player", rank: 640, rating: 1622, plays: 27, firstPlacements: 14, ratingChange: 18 };
const SAMPLE_RESULTS = [true, false, true, true];

const element = (id) => document.getElementById(id);

// A map counts for the player only when it has been scored.
function resultsFrom(view, userId) {
  const results = [];
  for (const map of view?.maps ?? []) {
    if (map.live) continue;
    const mine = map.sides.find((side) => side.userId === userId);
    if (mine) results.push(mine.won);
  }
  return results;
}

function renderRatio(user, results, style) {
  const frame = element("ratio");
  frame.hidden = !user;
  if (!user) return;
  applyFrameStyle(frame, style);

  setImage(element("avatar"), user.id ? `https://a.ppy.sh/${user.id}` : SAMPLE_AVATAR);
  element("username").textContent = user.username;

  const ranked = user.rank !== null && user.rating !== null;
  element("rankRow").hidden = !ranked;
  element("rankRow").style.display = ranked ? "" : "none";
  if (ranked) element("rank").textContent = `#${numberFormat.format(user.rank)} (${Math.round(user.rating)})`;

  const change = element("change");
  const hasChange = Boolean(user.ratingChange);
  change.style.display = hasChange ? "" : "none";
  if (hasChange) {
    change.className = `ratio-change ${user.ratingChange > 0 ? "up" : "down"}`;
    change.textContent = `${user.ratingChange > 0 ? "+" : ""}${user.ratingChange}`;
  }

  const wins = results.filter(Boolean).length;
  const losses = results.length - wins;
  element("percent").textContent = `${results.length ? Math.round((wins / results.length) * 100) : 0}%`;
  element("wins").textContent = `W: ${wins}`;
  element("losses").textContent = `L: ${losses}`;

  const recent = results.slice(-RECENT_RESULTS).reverse();
  element("recent").replaceChildren(
    ...(recent.length
      ? recent.map((won) => make("div", `ratio-square ${won ? "win" : "loss"}`, won ? "W" : "L"))
      : [make("span", "ratio-empty", "No matches yet")])
  );

  const total = user.plays ?? 0;
  element("history").hidden = total === 0;
  if (total > 0) {
    const first = user.firstPlacements ?? 0;
    const percent = make("span", "", ` (${Math.round((first / total) * 100)}%)`);
    element("record").replaceChildren(`${first}W – ${total - first}L`, percent);
  }
}

connectOverlay("ranked", (settings) => {
  const style = settings.rankedStyles.Ratio;
  if (showSample) renderRatio(SAMPLE_USER, SAMPLE_RESULTS, style);
  else renderRatio(settings.rankedUser, resultsFrom(settings.rankedData, settings.rankedUser?.id), style);
});
