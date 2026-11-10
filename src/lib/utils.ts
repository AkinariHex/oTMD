import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Without this, the custom text sizes would count as colors and be dropped next to text-ink.
const twMerge = extendTailwindMerge({ extend: { theme: { text: ["ui", "caption"] } } });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
