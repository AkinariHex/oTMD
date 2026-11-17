import { useSyncExternalStore } from "react";
import type { RankedMatch } from "@/lib/api";

// Ranked rooms the match feed has loaded, so the rating chart can name the opponent and open the card.
const rooms = new Map<number, RankedMatch>();
const listeners = new Set<() => void>();
let snapshot = new Map(rooms);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function addRankedRooms(matches: RankedMatch[]): void {
  if (matches.length === 0) return;
  for (const match of matches) rooms.set(match.roomId, match);
  snapshot = new Map(rooms);
  listeners.forEach((listener) => listener());
}

export const useRankedRooms = (): ReadonlyMap<number, RankedMatch> => useSyncExternalStore(subscribe, () => snapshot);

const openListeners = new Set<(roomId: number) => void>();

export function requestOpenRoom(roomId: number): void {
  openListeners.forEach((listener) => listener(roomId));
}

export function onOpenRoom(listener: (roomId: number) => void): () => void {
  openListeners.add(listener);
  return () => openListeners.delete(listener);
}
