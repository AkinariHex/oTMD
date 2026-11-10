import { useSyncExternalStore } from "react";
import type { PreviewBackground } from "@/lib/api";

interface BackgroundOption {
  id: PreviewBackground;
  label: string;
  background: string;
  // Solid colors and patterns have no edges, so they can be dragged anywhere.
  endless: boolean;
}

const CHECKER = "repeating-conic-gradient(oklch(1 0 0 / 0.07) 0 25%, oklch(1 0 0 / 0.02) 0 50%) 0 0 / 24px 24px";
const DARK_SCENE =
  "radial-gradient(circle at 20% 30%, oklch(0.45 0.13 280) 0, transparent 45%), radial-gradient(circle at 80% 70%, oklch(0.42 0.12 20) 0, transparent 45%), linear-gradient(160deg, oklch(0.2 0.03 265), oklch(0.13 0.02 265))";
const LIGHT_SCENE =
  "radial-gradient(circle at 25% 25%, oklch(0.92 0.08 210) 0, transparent 50%), radial-gradient(circle at 80% 75%, oklch(0.9 0.09 60) 0, transparent 50%), linear-gradient(160deg, oklch(0.97 0.01 240), oklch(0.86 0.02 240))";

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { id: "checker", label: "Transparent", background: CHECKER, endless: true },
  { id: "black", label: "Black", background: "oklch(0 0 0)", endless: true },
  { id: "dark", label: "Dark", background: "oklch(0.26 0.014 262)", endless: true },
  { id: "gray", label: "Gray", background: "oklch(0.56 0 0)", endless: true },
  { id: "light", label: "Light", background: "oklch(0.9 0 0)", endless: true },
  { id: "white", label: "White", background: "oklch(1 0 0)", endless: true },
  { id: "darkScene", label: "Dark scene", background: DARK_SCENE, endless: false },
  { id: "lightScene", label: "Light scene", background: LIGHT_SCENE, endless: false },
];

const STORAGE_KEY = "otmd.previewImage";
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_SIDE = 1920;
const JPEG_QUALITY = 0.85;

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let image = readStored();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const usePreviewImage = (): string | null => useSyncExternalStore(subscribe, () => image);

export const customBackground = (source: string): string => `url("${source}") center / cover no-repeat`;

// Re-encoding keeps the stored copy small and means only decoded pixels are ever kept. Throws a message for the user.
export async function storePreviewImage(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) throw new Error("That file is not an image.");
  if (file.size > MAX_FILE_BYTES) throw new Error("That image is larger than 25 MB.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That image could not be read.");
  }

  const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const encoded = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  try {
    localStorage.setItem(STORAGE_KEY, encoded);
  } catch {
    throw new Error("That image is too large to keep.");
  }

  image = encoded;
  listeners.forEach((listener) => listener());
}
