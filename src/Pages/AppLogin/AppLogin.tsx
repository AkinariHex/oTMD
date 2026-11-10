import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { motion } from "motion/react";
import TitleBar from "@/Components/TitleBar/TitleBar";
import { Button } from "@/Components/ui/button";
import * as api from "@/lib/api";
import { EASE_OUT } from "@/lib/motion";
import Logo from "@/Images/otmd.ico";

const LOGIN_FAILURES: Record<api.LoginFailure, string> = {
  denied: "Login cancelled.",
  failed: "Login failed. Please try again.",
};

function AppLogin() {
  const navigate = useNavigate();
  const { state: routeState } = useLocation();
  const [isWaiting, setIsWaiting] = useState(false);
  const [error, setError] = useState<string>(routeState?.message ?? "");

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
    const openApp = () => navigate("/app/profile", { replace: true });
    const load = async () => {
      if (await api.getSession()) openApp();
    };
    void load();

    const stopSession = api.onSessionChanged(openApp);
    const stopFailure = api.onLoginFailed((reason) => {
      setIsWaiting(false);
      setError(LOGIN_FAILURES[reason]);
    });
    return () => {
      stopSession();
      stopFailure();
    };
  }, [navigate]);

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <motion.main
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
        className="flex flex-1 flex-col items-center justify-center gap-6 pb-10"
      >
        <div className="flex flex-col items-center gap-3">
          <img src={Logo} alt="" width={64} height={64} className="size-16" />
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight text-ink">Welcome to o!TMD</h1>
            <p className="mt-1 text-ui text-ink-3">Log in with your osu! account to continue</p>
          </div>
        </div>
        <div className="flex w-64 flex-col gap-2">
          <Button tone="primary" onClick={() => void startLogin()} className="h-9 w-full">
            {isWaiting ? "Open browser again" : "Log in with osu!"}
          </Button>
          {isWaiting && (
            <Button onClick={() => setIsWaiting(false)} className="h-9 w-full">
              Cancel
            </Button>
          )}
        </div>
        <div className="flex h-5 items-center">
          {isWaiting && (
            <p role="status" className="flex items-center gap-2 text-xs text-ink-2">
              <LoaderCircle size={14} strokeWidth={1.75} className="animate-spin" />
              Complete the login in your browser
            </p>
          )}
          {error && (
            <p role="alert" className="flex items-center gap-2 text-xs text-loss">
              <CircleAlert size={14} strokeWidth={1.75} />
              {error}
            </p>
          )}
        </div>
      </motion.main>
    </div>
  );
}

export default AppLogin;
