import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { NAV, NAV_GROUPS } from "@/Components/AppShell/nav";
import Avatar from "@/Components/Avatar/Avatar";
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
    <div className="flex h-full">
      <aside className="flex w-[188px] shrink-0 flex-col">
        <div data-tauri-drag-region className="flex h-10 shrink-0 items-center px-3 text-xs font-semibold text-ink">
          o!TMD
        </div>
        <nav aria-label="Main" className="flex-1 divide-y divide-line px-2">
          {NAV_GROUPS.map((group) => (
            <div key={group} className="py-2.5 first:pt-0">
              <div className="px-2 pb-1 text-[11px] font-medium text-ink-3">{group}</div>
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
          className="mx-2 mb-1 flex h-7 items-center gap-2 rounded-md px-2 text-xs text-ink-2 transition-colors duration-150 hover:bg-white/5 hover:text-ink"
        >
          <span className={cn("size-2 shrink-0 rounded-full", sources > 0 ? "bg-win" : "bg-ink-3")} />
          {sources} {sources === 1 ? "source" : "sources"} connected
        </button>
        <button
          type="button"
          onClick={() => navigate("/app/profile")}
          className="flex items-center gap-2 border-t border-line p-2.5 text-left transition-colors duration-150 hover:bg-white/5"
        >
          <Avatar userId={user?.id ?? 0} username={user?.username ?? ""} size={26} />
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium leading-tight text-ink">{user?.username}</span>
            <span className="block text-[11px] leading-tight text-ink-3">v{version}</span>
          </span>
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-panel">
        <div data-tauri-drag-region className="flex h-8 shrink-0 justify-end">
          <WindowControls />
        </div>
        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</main>
      </div>
    </div>
  );
}

export default SidebarLayout;
