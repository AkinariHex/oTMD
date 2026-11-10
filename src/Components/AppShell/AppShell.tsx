import { useEffect, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { toast } from "sonner";
import SidebarLayout from "@/Components/SidebarLayout/SidebarLayout";
import TabsLayout from "@/Components/TabsLayout/TabsLayout";
import Broadcast from "@/Pages/Broadcast/Broadcast";
import MatchSettings from "@/Pages/MatchSettings/MatchSettings";
import Overlay from "@/Pages/Overlay/Overlay";
import Ranked from "@/Pages/Ranked/Ranked";
import Settings from "@/Pages/Settings/Settings";
import Profile from "@/Pages/Profile/Profile";
import Changelog from "@/Pages/Changelog/Changelog";
import * as api from "@/lib/api";
import { EASE_OUT } from "@/lib/motion";
import { applyPreferences, useLayout } from "@/lib/preferences";

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const layout = useLayout();
  const [user, setUser] = useState<api.User | null>(null);
  const [version, setVersion] = useState("");
  const [sources, setSources] = useState<api.OverlaySources>({ match: 0, ranked: 0, broadcast: 0 });
  const [settingsVersion, setSettingsVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [session, appVersion, connected] = await Promise.all([api.getSession(), api.getAppVersion(), api.getOverlaySources()]);
        if (!active) return;
        if (!session) {
          navigate("/login", { replace: true });
          return;
        }
        setUser(session);
        setVersion(appVersion);
        setSources(connected);
      } catch {
        toast.error("Could not load your session.");
      }
    };
    void load();

    const stopSettings = api.onSettingsReplaced(() => {
      const refresh = async () => {
        try {
          const settings = await api.getAppSettings();
          if (!active) return;
          applyPreferences(settings);
          setSettingsVersion((version) => version + 1);
        } catch {
          toast.error("Could not apply your synced settings.");
        }
      };
      void refresh();
    });
    const stopSources = api.onOverlayChanged(setSources);
    const stopSession = api.onSessionExpired(() =>
      navigate("/login", { replace: true, state: { message: "Your session has expired. Please log in again." } })
    );
    return () => {
      active = false;
      stopSettings();
      stopSources();
      stopSession();
    };
  }, [navigate]);

  const Layout = layout === "tabs" ? TabsLayout : SidebarLayout;

  return (
    <Layout user={user} version={version} sources={sources.match + sources.ranked + sources.broadcast}>
      <motion.div
        key={`${location.pathname}-${settingsVersion}`}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: EASE_OUT }}
        className="h-full"
      >
        <Routes location={location}>
          <Route path="match" element={<MatchSettings />} />
          <Route path="ranked" element={<Ranked />} />
          <Route path="broadcast" element={<Broadcast />} />
          <Route path="overlay" element={<Overlay sources={sources} />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<Profile user={user} />} />
          <Route path="changelog" element={<Changelog />} />
        </Routes>
      </motion.div>
    </Layout>
  );
}

export default AppShell;
