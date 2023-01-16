import { HashRouter, Route, Routes, Navigate } from "react-router-dom";
import "./App.css";
import AppLogin from "./Pages/AppLogin/AppLogin";
import AppUpdate from "./Pages/AppUpdate/AppUpdate";
import AppRoutes from "./Components/AppRoutes/AppRoutes";
import { useEffect, useState } from "react";

const { ipcRenderer } = window.require("electron");

function App() {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(null);

  useEffect(() => {
    ipcRenderer.send("isUpdateAvailable");
    ipcRenderer.once("updateAvailable", (event, arg) => {
      setIsUpdateAvailable(true);
    });
  }, []);

  return (
    <HashRouter>
      <div className="App">
        {isUpdateAvailable ? (
          <AppUpdate />
        ) : (
          <Routes>
            <Route path="/login" element={<AppLogin />} />
            <Route path="/update" element={<AppUpdate />} />
            <Route path="/app/*" element={<AppRoutes />} />
            <Route path="/" element={<Navigate to="/login" />} />
          </Routes>
        )}
      </div>
    </HashRouter>
  );
}

export default App;
