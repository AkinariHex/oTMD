import { CircleDot, FileText, type LucideIcon, RadioTower, Settings, SlidersHorizontal, Swords } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  group: string;
}

export const NAV: NavItem[] = [
  { to: "/app/match", label: "Match", icon: CircleDot, group: "Play" },
  { to: "/app/ranked", label: "Ranked", icon: Swords, group: "Play" },
  { to: "/app/broadcast", label: "Broadcast", icon: RadioTower, group: "Play" },
  { to: "/app/overlay", label: "Overlay", icon: SlidersHorizontal, group: "Stream" },
  { to: "/app/settings", label: "Settings", icon: Settings, group: "App" },
  { to: "/app/changelog", label: "Changelog", icon: FileText, group: "App" },
];

export const NAV_GROUPS = [...new Set(NAV.map((item) => item.group))];
