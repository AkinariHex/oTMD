import { useEffect, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import SidebarLayout from "@/Components/SidebarLayout/SidebarLayout";
import TabsLayout from "@/Components/TabsLayout/TabsLayout";
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
  const [sources, setSources] = useState<api.OverlaySources>({ match: 0, ranked: 0 });
  const [settingsVersion, setSettingsVersion] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [session, appVersion, connected] = await Promise.all([api.getSession(), api.getAppVersion(), api.getOverlaySources()]);
      if (!session) {
        navigate("/login", { replace: true });
        return;
      }
      setUser(session);
      setVersion(appVersion);
      setSources(connected);
    };
    void load();

    const stopSettings = api.onSettingsReplaced(() => {
      const refresh = async () => {
        applyPreferences(await api.getAppSettings());
        setSettingsVersion((version) => version + 1);
      };
      void refresh();
    });
    const stopSources = api.onOverlayChanged(setSources);
    const stopSession = api.onSessionExpired(() =>
      navigate("/login", { replace: true, state: { message: "Your session has expired. Please log in again." } })
    );
    return () => {
      stopSettings();
      stopSources();
      stopSession();
    };
  }, [navigate]);

  const Layout = layout === "tabs" ? TabsLayout : SidebarLayout;

  return (
    <Layout user={user} version={version} sources={sources.match + sources.ranked}>
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
