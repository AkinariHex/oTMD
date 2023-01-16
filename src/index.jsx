import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import App from "./App";
import AppBar from "./Components/AppBar/AppBar";

ReactDOM.render(
  <React.StrictMode>
    <AppBar />
    <App />
  </React.StrictMode>,
  document.getElementById("root")
);
