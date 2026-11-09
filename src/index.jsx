import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import App from "./App";
import AppBar from "./Components/AppBar/AppBar";
import * as api from "@/lib/api";

const start = async () => {
  try {
    // Set before the first render, so the window never passes through another screen.
    window.location.hash = await api.getStartRoute();
  } catch {
    window.location.hash = "/login";
  }

  ReactDOM.render(
    <React.StrictMode>
      <AppBar />
      <App />
    </React.StrictMode>,
    document.getElementById("root")
  );
};

start();
