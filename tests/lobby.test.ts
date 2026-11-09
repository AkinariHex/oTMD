import assert from "node:assert/strict";
import test from "node:test";
import { isLobbyId, parseLobbyLink } from "../src/lib/lobby.ts";

test("official match links yield the ID", () => {
  assert.equal(parseLobbyLink("match", "https://osu.ppy.sh/community/matches/122134786"), "122134786");
  assert.equal(parseLobbyLink("match", "  osu.ppy.sh/mp/122134786#top "), "122134786");
  assert.equal(parseLobbyLink("match", "http://osu.ppy.sh/community/matches/122134786?x=1"), "122134786");
});

test("official room links yield the ID", () => {
  assert.equal(parseLobbyLink("room", "https://osu.ppy.sh/multiplayer/rooms/1129384"), "1129384");
});

test("other hosts and the wrong kind of link are rejected", () => {
  assert.equal(parseLobbyLink("match", "https://evil.test/community/matches/999999"), null);
  assert.equal(parseLobbyLink("match", "https://osu.ppy.sh.evil.test/mp/999999"), null);
  assert.equal(parseLobbyLink("match", "https://osu.ppy.sh/multiplayer/rooms/1129384"), null);
  assert.equal(parseLobbyLink("room", "https://osu.ppy.sh/community/matches/122134786"), null);
  assert.equal(parseLobbyLink("match", "122134786"), null);
});

test("IDs are digits only", () => {
  assert.ok(isLobbyId("122134786"));
  assert.ok(!isLobbyId(""));
  assert.ok(!isLobbyId("12a"));
  assert.ok(!isLobbyId("1234567890123"));
});
