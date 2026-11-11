import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { NAV, NAV_GROUPS } from "@/Components/AppShell/nav";
import Avatar from "@/Components/Avatar/Avatar";
import VersionLabel from "@/Components/VersionLabel/VersionLabel";
import WindowControls from "@/Components/WindowControls/WindowControls";
import type { User } from "@/lib/api";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface SidebarLayoutProps {
  user: User | null;
  version: string;
  sources: number;
  children: ReactNode;
}

function SidebarLayout({ user, version, sources, children }: SidebarLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="flex h-full [--window-controls-inset:96px]">
      <aside className="flex w-[188px] shrink-0 flex-col">
        <div data-tauri-drag-region className="flex h-10 shrink-0 items-center px-3 text-xs font-semibold text-ink">
          o!TMD
        </div>
        <div className="border-b border-line px-2 pb-2">
          <NavLink
            to="/app/profile"
            className={({ isActive }) => cn("relative flex items-center gap-2 rounded-md p-1.5 transition-colors duration-150", !isActive && "hover:bg-white/5")}
          >
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="sidebar-active" transition={{ duration: 0.2, ease: EASE_OUT }} className="absolute inset-0 rounded-md bg-white/9" />}
                <span className="relative">
                  <Avatar userId={user?.id ?? 0} username={user?.username ?? ""} size={26} />
                </span>
                <span className="relative min-w-0">
                  <span className="block truncate text-xs font-medium leading-tight text-ink">{user?.username}</span>
                  <span className="block text-caption leading-tight text-ink-3">Dashboard</span>
                </span>
              </>
            )}
          </NavLink>
        </div>
        <nav aria-label="Main" className="flex-1 divide-y divide-line px-2 pt-2">
          {NAV_GROUPS.map((group) => (
            <div key={group} className="py-2.5 first:pt-0">
              <div className="px-2 pb-1 text-caption font-medium text-ink-3">{group}</div>
              {NAV.filter((item) => item.group === group).map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "relative flex h-7 items-center gap-2 rounded-md px-2 text-xs font-medium transition-colors duration-150",
                      isActive ? "text-ink" : "text-ink-2 hover:bg-white/5 hover:text-ink"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span layoutId="sidebar-active" transition={{ duration: 0.2, ease: EASE_OUT }} className="absolute inset-0 rounded-md bg-white/9" />
                      )}
                      <Icon size={14} strokeWidth={1.75} className="relative" />
                      <span className="relative">{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => navigate("/app/overlay")}
          className="mx-2 flex h-7 items-center gap-2 rounded-md px-2 text-xs text-ink-2 transition-colors duration-150 hover:bg-white/5 hover:text-ink"
        >
          <span className={cn("size-2 shrink-0 rounded-full", sources > 0 ? "bg-win" : "bg-ink-3")} />
          {sources} {sources === 1 ? "source" : "sources"} connected
        </button>
        <VersionLabel version={version} />
      </aside>
      <div className="relative min-w-0 flex-1 bg-panel">
        <div className="absolute top-0 right-0 z-20 h-8">
          <WindowControls />
        </div>
        <main data-tauri-drag-region className="h-full overflow-y-auto p-5 has-[[data-fills-page]]:overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}

export default SidebarLayout;
