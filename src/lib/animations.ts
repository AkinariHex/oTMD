import { useSyncExternalStore } from "react";

let enabled = true;
const listeners = new Set<() => void>();

export function setAnimationsEnabled(value: boolean): void {
  enabled = value;
  document.documentElement.dataset.animations = value ? "on" : "off";
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useAnimationsEnabled = (): boolean =>
  useSyncExternalStore(subscribe, () => enabled);
