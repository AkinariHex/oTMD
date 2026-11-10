import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "motion/react";
import { NAV } from "@/Components/AppShell/nav";
import Avatar from "@/Components/Avatar/Avatar";
import WindowControls from "@/Components/WindowControls/WindowControls";
import type { User } from "@/lib/api";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface TabsLayoutProps {
  user: User | null;
  version: string;
  sources: number;
  children: ReactNode;
}

function TabsLayout({ user, children }: TabsLayoutProps) {
  return (
    <div className="flex h-full flex-col">
      <div data-tauri-drag-region className="flex h-11 shrink-0 items-center gap-3 pl-3">
        <span data-tauri-drag-region className="text-ui font-semibold text-ink">
          o!TMD
        </span>
        <nav data-tauri-drag-region aria-label="Main" className="flex h-full flex-1 items-center gap-0.5">
          <NavLink
            to="/app/profile"
            className={({ isActive }) =>
              cn("relative flex h-8 items-center gap-1.5 rounded-md px-2.5 text-ui font-medium transition-colors duration-150", isActive ? "text-ink" : "text-ink-3 hover:text-ink")
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="tabs-active" transition={{ duration: 0.2, ease: EASE_OUT }} className="absolute inset-0 rounded-md bg-panel" />}
                <span className="relative">
                  <Avatar userId={user?.id ?? 0} username={user?.username ?? ""} size={18} />
                </span>
                <span className="relative">Dashboard</span>
              </>
            )}
          </NavLink>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "relative flex h-8 items-center gap-1.5 rounded-md px-2.5 text-ui font-medium transition-colors duration-150",
                  isActive ? "text-ink" : "text-ink-3 hover:text-ink"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="tabs-active" transition={{ duration: 0.2, ease: EASE_OUT }} className="absolute inset-0 rounded-md bg-panel" />}
                  <Icon size={14} strokeWidth={1.75} className="relative" />
                  <span className="relative">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="h-full">
          <WindowControls />
        </div>
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto bg-panel p-5">{children}</main>
    </div>
  );
}

export default TabsLayout;
