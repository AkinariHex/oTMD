import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import "./index.css";
import App from "./App";
import MotionProvider from "./Components/MotionProvider/MotionProvider";
import * as api from "@/lib/api";
import { applyPreferences } from "@/lib/preferences";

const start = async () => {
  try {
    // Set before the first render, so the window never passes through another screen.
    window.location.hash = await api.getStartRoute();
  } catch {
    window.location.hash = "/login";
  }

  try {
    applyPreferences(await api.getAppSettings());
  } catch {
    applyPreferences({ Animations: true, Layout: "sidebar" });
  }

  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <MotionProvider>
        <App />
        <Toaster richColors position="bottom-right" theme="dark" />
      </MotionProvider>
    </React.StrictMode>
  );
};

start();
