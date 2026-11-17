import { useSyncExternalStore } from "react";
import type { RankedMatch, RankedResult } from "@/lib/api";

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

// Rating change per room, from osu!'s recent rating history. The oldest entry has no earlier rating to compare with.
let ratingChanges: ReadonlyMap<number, number> = new Map();
const changeListeners = new Set<() => void>();

export function setRatingHistory(history: RankedResult[]): void {
  const changes = new Map<number, number>();
  history.forEach((entry, index) => {
    const before = history[index + 1];
    if (before) changes.set(entry.roomId, entry.ratingAfter - before.ratingAfter);
  });
  ratingChanges = changes;
  changeListeners.forEach((listener) => listener());
}

const subscribeChanges = (listener: () => void) => {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
};

export const useRatingChange = (roomId: number | null): number | null =>
  useSyncExternalStore(subscribeChanges, () => (roomId === null ? null : (ratingChanges.get(roomId) ?? null)));
