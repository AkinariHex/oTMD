import { useSyncExternalStore } from "react";
import type { AppSettings, Layout, PreviewBackground } from "@/lib/api";

let animations = true;
let layout: Layout = "sidebar";
let previewBackground: PreviewBackground = "checker";
const listeners = new Set<() => void>();

// Applied before the first render too, so the window never opens on the wrong layout or with motion.
export function applyPreferences(settings: Pick<AppSettings, "Animations" | "Layout" | "PreviewBackground">): void {
  animations = settings.Animations;
  layout = settings.Layout;
  previewBackground = settings.PreviewBackground;
  document.documentElement.dataset.animations = animations ? "on" : "off";
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useAnimationsEnabled = (): boolean => useSyncExternalStore(subscribe, () => animations);

export const useLayout = (): Layout => useSyncExternalStore(subscribe, () => layout);

export const usePreviewBackground = (): PreviewBackground => useSyncExternalStore(subscribe, () => previewBackground);
