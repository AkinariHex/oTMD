import { useSyncExternalStore } from "react";
import type { AppSettings, Layout, PreviewBackground } from "@/lib/api";

const BASE_SCREEN_WIDTH = 1920;
const MIN_AUTO_SCALE = 0.85;
const MAX_AUTO_SCALE = 1.25;

// 0 means automatic: the text follows the screen, because the window itself has a fixed size.
function textScale(size: number): number {
  if (size > 0) return size / 100;
  return Math.min(MAX_AUTO_SCALE, Math.max(MIN_AUTO_SCALE, window.screen.width / BASE_SCREEN_WIDTH));
}

let animations = true;
let layout: Layout = "sidebar";
let previewBackground: PreviewBackground = "checker";
const listeners = new Set<() => void>();

// Applied before the first render too, so the window never opens on the wrong layout or with motion.
export function applyPreferences(settings: Pick<AppSettings, "Animations" | "Layout" | "PreviewBackground" | "TextSize">): void {
  animations = settings.Animations;
  layout = settings.Layout;
  previewBackground = settings.PreviewBackground;
  document.documentElement.dataset.animations = animations ? "on" : "off";
  document.documentElement.style.setProperty("--text-scale", String(textScale(settings.TextSize)));
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
