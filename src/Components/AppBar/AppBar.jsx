import React from "react";
import "./AppBar.css";
const { ipcRenderer } = window.require("electron");

function AppBar() {
  return (
    <div className="headerappbar">
      <div id="applicationName">osu! Tourney Match Displayer</div>
      <div id="applicationButtons">
        <button
          className="ui icon button headerappbarbutton"
          id="minimizebutton"
          onClick={() => ipcRenderer.send("minimizeApp", "")}
        >
          <svg
            viewBox="-12 -12 48 48"
            width="22"
            height="22"
            xmlns="http://www.w3.org/2000/svg"
            fillRule="evenodd"
            clipRule="evenodd"
          >
            <path d="M0 12v1h23v-1h-23z" />
          </svg>
        </button>
        <button
          className="ui icon button headerappbarbutton"
          id="maximizebutton"
          onClick={() => ipcRenderer.send("maximizeApp", "")}
        >
          <svg
            viewBox="-12 -12 48 48"
            width="22"
            height="22"
            xmlns="http://www.w3.org/2000/svg"
            fillRule="evenodd"
            clipRule="evenodd"
          >
            <path d="M24 23h-24v-22h24v22zm-23-16v15h22v-15h-22zm22-1v-4h-22v4h22z" />
          </svg>
        </button>
        <button
          className="ui icon button headerappbarbutton closewinbutton"
          id="closewinbutton"
          onClick={() => ipcRenderer.send("closeApp", "")}
        >
          <svg
            viewBox="-12 -12 48 48"
            width="22"
            height="22"
            xmlns="http://www.w3.org/2000/svg"
            fillRule="evenodd"
            clipRule="evenodd"
          >
            <path d="M12 11.293l10.293-10.293.707.707-10.293 10.293 10.293 10.293-.707.707-10.293-10.293-10.293 10.293-.707-.707 10.293-10.293-10.293-10.293.707-.707 10.293 10.293z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default AppBar;
