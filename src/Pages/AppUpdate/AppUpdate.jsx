import { useState, useEffect } from "react";
import "./AppUpdate.css";
import { Progress } from "@/Components/ui/progress";
import * as api from "@/lib/api";

function AppUpdate() {
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    return api.onDownloadProgress((arg) => {
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
          <Progress value={progress} aria-label="Download progress" />
        </div>
      </div>
    </div>
  );
}

export default AppUpdate;
