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
  element("rank").textContent = user.rank !== null && user.rating !== null ? `#${numberFormat.format(user.rank)} - ${Math.round(user.rating)} rating` : "Unranked";

  const change = element("change");
  const hasChange = Boolean(user.ratingChange);
  change.style.display = hasChange ? "" : "none";
  if (hasChange) {
    change.className = `ratio-change ${user.ratingChange > 0 ? "up" : "down"}`;
    change.textContent = `${user.ratingChange > 0 ? "+" : ""}${user.ratingChange}`;
  }

  const wins = results.filter(Boolean).length;
  element("wins").textContent = wins;
  element("losses").textContent = results.length - wins;
  element("recent").replaceChildren(
    ...(results.length
      ? results.slice(-RECENT_RESULTS).map((won) => make("div", `ratio-square ${won ? "win" : "loss"}`, won ? "W" : "L"))
      : [make("span", "ratio-empty", "No maps yet")])
  );

  const total = user.plays ?? 0;
  const first = user.firstPlacements ?? 0;
  const percent = total > 0 ? Math.round((first / total) * 100) : 0;
  element("seasonPercent").textContent = `${percent}%`;
  element("seasonRecord").textContent = `${first} wins - ${total - first} losses`;
  element("seasonFill").style.width = `${percent}%`;
}

connectOverlay("ranked", (settings) => {
  const style = settings.rankedStyles.Ratio;
  if (showSample) renderRatio(SAMPLE_USER, SAMPLE_RESULTS, style);
  else renderRatio(settings.rankedUser, resultsFrom(settings.rankedData, settings.rankedUser?.id), style);
});
