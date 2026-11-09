const LOBBY_LINKS = {
  match: /^(?:https?:\/\/)?osu\.ppy\.sh\/(?:community\/matches|mp)\/(\d{1,12})(?:[/?#].*)?$/i,
  room: /^(?:https?:\/\/)?osu\.ppy\.sh\/multiplayer\/rooms\/(\d{1,12})(?:[/?#].*)?$/i,
};

// Only links on the official host yield an ID, so digits from another site are never picked up.
export function parseLobbyLink(kind: keyof typeof LOBBY_LINKS, text: string): string | null {
  return LOBBY_LINKS[kind].exec(text.trim())?.[1] ?? null;
}

export const isLobbyId = (text: string): boolean => /^\d{1,12}$/.test(text);
