import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import "./index.css";
import App from "./App";
import AppBar from "./Components/AppBar/AppBar";
import MotionProvider from "./Components/MotionProvider/MotionProvider";
import * as api from "@/lib/api";
import { setAnimationsEnabled } from "@/lib/animations";

const start = async () => {
  try {
    // Set before the first render, so the window never passes through another screen.
    window.location.hash = await api.getStartRoute();
  } catch {
    window.location.hash = "/login";
  }

  try {
    const { Animations } = await api.getAppSettings();
    setAnimationsEnabled(Animations);
  } catch {
    setAnimationsEnabled(true);
  }

  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <MotionProvider>
        <AppBar />
        <App />
        <Toaster richColors position="bottom-right" theme="dark" />
      </MotionProvider>
    </React.StrictMode>
  );
};

start();
