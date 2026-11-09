import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./AppLogin.css";
import Logo from "../../Images/otmd.ico";
import * as api from "@/lib/api";

const LOGIN_FAILURES = {
  denied: "Login cancelled.",
  failed: "Login failed. Please try again.",
};

function AppLogin() {
  const navigate = useNavigate();
  const { state: routeState } = useLocation();
  const [isWaiting, setIsWaiting] = useState(false);
  const [error, setError] = useState(routeState?.message ?? "");

  const startLogin = async () => {
    setError("");
    setIsWaiting(true);
    try {
      await api.login();
    } catch (message) {
      setIsWaiting(false);
      setError(String(message));
    }
  };

  useEffect(() => {
    const openApp = () => navigate("/app/match", { replace: true });
    const load = async () => {
      if (await api.getSession()) openApp();
    };
    load();

    const stopSession = api.onSessionChanged(openApp);
    const stopFailure = api.onLoginFailed((reason) => {
      setIsWaiting(false);
      setError(LOGIN_FAILURES[reason]);
    });
    return () => {
      stopSession();
      stopFailure();
    };
  }, []);

  return (
    <div className="containerLogin">
      <div className="logoContainer">
        <img src={Logo} alt="Logo" className="logo" />
        <div className="title">Welcome to o!TMD</div>
        <div className="subtext">
          <span>Log in</span> with your osu! account to continue!
        </div>
      </div>
      <div className="loginActions">
        <button type="button" className="loginButton" onClick={startLogin}>
          {isWaiting ? "Open browser again" : "Login with osu!"}
        </button>
        {isWaiting && (
          <div className="loginStatus">
            <div className="buttonLoader"></div>
            Complete the login in your browser
          </div>
        )}
        {error && (
          <div className="loginError" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export default AppLogin;
