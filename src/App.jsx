import { HashRouter, Route, Routes, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import AppLogin from "@/Pages/AppLogin/AppLogin";
import AppUpdate from "@/Pages/AppUpdate/AppUpdate";
import AppShell from "@/Components/AppShell/AppShell";
import * as api from "@/lib/api";

function App() {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(null);

  useEffect(() => {
    const load = async () => {
      setIsUpdateAvailable(await api.isUpdateAvailable());
    };
    const notifyPortableUpdate = async () => {
      const update = await api.portableUpdate();
      if (update) {
        toast(`v${update.version} is available`, {
          id: "portable-update",
          description: "Download the new portable zip from GitHub.",
          action: { label: "Download", onClick: () => void api.openExternal(update.url).catch(() => toast.error("Could not open the browser.")) },
        });
      }
    };
    load();
    notifyPortableUpdate();
    api.showWindowWhenReady();
    return api.onUpdateFailed(() => setIsUpdateAvailable(false));
  }, []);

  return (
    <HashRouter>
      {isUpdateAvailable ? (
        <AppUpdate />
      ) : (
        <Routes>
          <Route path="/login" element={<AppLogin />} />
          <Route path="/update" element={<AppUpdate />} />
          <Route path="/app/*" element={<AppShell />} />
          <Route path="/" element={<Navigate to="/login" />} />
        </Routes>
      )}
    </HashRouter>
  );
}

export default App;
