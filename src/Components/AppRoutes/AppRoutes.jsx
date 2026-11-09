import { useEffect } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import NavBar from "../NavBar/NavBar";
import Profile from "../../Pages/Profile/Profile";
import MatchSettings from "../../Pages/MatchSettings/MatchSettings";
import DisplayerSettings from "../../Pages/DisplayerSettings/DisplayerSettings";
import AppSettings from "../../Pages/AppSettings/AppSettings";
import Changelog from "../../Pages/Changelog/Changelog";
import * as api from "@/lib/api";

function AppRoutes() {
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      if (!(await api.getSession())) navigate("/login", { replace: true });
    };
    load();

    return api.onSessionExpired(() =>
      navigate("/login", {
        replace: true,
        state: { message: "Your session has expired. Please log in again." },
      })
    );
  }, []);

  return (
    <>
      <NavBar />
      <div className="content">
        <Routes>
          <Route path="/profile" element={<Profile />} />
          <Route path="/match" element={<MatchSettings />} />
          <Route path="/dsettings" element={<DisplayerSettings />} />
          <Route path="/appsettings" element={<AppSettings />} />
          <Route path="/changelog" element={<Changelog />} />
        </Routes>
      </div>
    </>
  );
}

export default AppRoutes;
