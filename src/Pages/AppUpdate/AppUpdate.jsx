import { useState, useEffect } from "react";
import "./AppUpdate.css";
import { Progress } from "react-sweet-progress";
import "react-sweet-progress/lib/style.css";
const { ipcRenderer } = window.require("electron");

function AppUpdate() {
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    ipcRenderer.on("downloadProgress", (event, arg) => {
      setDownloadSpeed(arg.speed);
      setProgress(arg.percent);
    });
  }, []);

  return (
    <div className="updateContainer">
      <div className="header">
        <div className="title">New Update Found!</div>
        <div className="subtitle">Status: Downloading</div>
      </div>
      <div className="download">
        <div className="text">
          {downloadSpeed}MB/s - {progress}%
        </div>
        <div className="bar" id="bar">
          <Progress
            percent={progress}
            theme={{
              success: {
                symbol: "",
                color: "hsla(225, 13%, 35%, 1)",
                background: "hsla(225, 13%, 16%, 1)",
              },
              active: {
                symbol: "",
                color: "hsla(225, 13%, 35%, 1)",
                background: "hsla(225, 13%, 16%, 1)",
              },
              default: {
                symbol: "",
                color: "hsla(225, 13%, 35%, 1)",
                background: "hsla(225, 13%, 16%, 1)",
              },
            }}
          ></Progress>
        </div>
      </div>
    </div>
  );
}

export default AppUpdate;
