import { HashRouter, Route, Routes, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { toast } from "sonner";
import AppLogin from "@/Pages/AppLogin/AppLogin";
import AppUpdate from "@/Pages/AppUpdate/AppUpdate";
import UpdateToast from "@/Components/UpdateToast/UpdateToast";
import AppShell from "@/Components/AppShell/AppShell";
import * as api from "@/lib/api";

function App() {
  useEffect(() => {
    const notifyUpdate = async () => {
      const update = await api.availableUpdate();
      if (update) {
        toast.custom((id) => <UpdateToast id={id} update={update} />, { id: "app-update", duration: 10000 });
      }
    };
    notifyUpdate();
    api.showWindowWhenReady();
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<AppLogin />} />
        <Route path="/update" element={<AppUpdate />} />
        <Route path="/app/*" element={<AppShell />} />
        <Route path="/" element={<Navigate to="/login" />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
