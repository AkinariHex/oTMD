import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import TitleBar from "@/Components/TitleBar/TitleBar";
import { Progress } from "@/Components/ui/progress";
import * as api from "@/lib/api";

function AppUpdate() {
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [progress, setProgress] = useState(0);

  const navigate = useNavigate();

  useEffect(() => {
    const stopProgress = api.onDownloadProgress((update) => {
      setDownloadSpeed(update.speed);
      setProgress(update.percent);
    });
    const stopFailed = api.onUpdateFailed(() => {
      toast.error("The update could not be installed. Try again later.");
      navigate(-1);
    });
    return () => {
      stopProgress();
      stopFailed();
    };
  }, [navigate]);

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-24">
        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-tight text-ink">Updating o!TMD</h1>
          <p className="mt-0.5 text-ui text-ink-3">The app restarts when the download is complete</p>
        </div>
        <Progress value={progress} aria-label="Download progress" />
        <div className="text-xs tabular-nums text-ink-2">
          {downloadSpeed} MB/s - {progress}%
        </div>
      </div>
    </div>
  );
}

export default AppUpdate;
