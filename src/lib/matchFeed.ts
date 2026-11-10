import type { MatchSide, RankedMatch, SavedMatch, SideIndex } from "@/lib/api";

interface FeedEntry {
  id: string;
  title: string;
  acronym: string;
  stage: string;
  date: string;
  banner: string | null;
  won: boolean | null;
  winner: SideIndex | null;
  sides: [MatchSide, MatchSide];
}

export type SavedFeedItem = FeedEntry & { kind: "saved" };
export type RankedFeedItem = FeedEntry & { kind: "ranked"; match: RankedMatch };
export type FeedItem = SavedFeedItem | RankedFeedItem;

function savedItem(match: SavedMatch): SavedFeedItem {
  const { acronym, name } = match.tournament;
  const title = name || acronym || "Friendly";
  return {
    kind: "saved",
    id: `match-${match.matchID}`,
    title,
    acronym: acronym || title,
    stage: match.stage,
    date: match.startTime ?? "",
    banner: match.banner,
    won: match.won,
    winner: match.winner,
    sides: match.sides,
  };
}

function rankedItem(match: RankedMatch): RankedFeedItem {
  const [me, opponent] = match.players;
  const side = (player: typeof me): MatchSide => ({ name: player.username, score: player.roundsWon, players: [] });
  return {
    kind: "ranked",
    id: `room-${match.roomId}`,
    title: "Ranked Play",
    acronym: "Ranked",
    stage: `${match.rounds.length} ${match.rounds.length === 1 ? "map" : "maps"}`,
    date: match.date,
    banner: null,
    won: match.winner === null ? null : match.winner === 0,
    winner: match.winner,
    sides: [side(me), side(opponent)],
    match,
  };
}

const timeOf = (item: FeedItem): number => Date.parse(item.date) || 0;

// Rows the site could not read arrive with `sides: null` and can't be drawn.
export function buildFeed(saved: SavedMatch[], ranked: RankedMatch[]): FeedItem[] {
  const items = [...saved.filter((match) => Array.isArray(match.sides)).map(savedItem), ...ranked.map(rankedItem)];
  return items.sort((first, second) => timeOf(second) - timeOf(first));
}
