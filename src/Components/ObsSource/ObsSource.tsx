import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, MonitorUp, RefreshCw, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import CopyUrlButton from "@/Components/CopyUrlButton/CopyUrlButton";
import { Button } from "@/Components/ui/button";
import { Input } from "@/Components/ui/input";
import { Select } from "@/Components/ui/select";
import * as api from "@/lib/api";
import { listScenes, sendBrowserSource } from "@/lib/obs";

function ObsSource({ name, url, width, height }: { name: string; url: string; width: number; height: number }) {
  const navigate = useNavigate();
  const [obs, setObs] = useState<api.AppSettings["Obs"] | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenes, setScenes] = useState<string[]>([]);
  const [scene, setScene] = useState("");
  const [loadingScenes, setLoadingScenes] = useState(false);

  const loadScenes = useCallback(async (config: api.AppSettings["Obs"]) => {
    setLoadingScenes(true);
    try {
      const { scenes: names, current } = await listScenes(config);
      setScenes(names);
      setScene((picked) => (names.includes(picked) ? picked : current));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach OBS.");
    } finally {
      setLoadingScenes(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const { Obs: config } = await api.getAppSettings();
        setObs(config);
        if (config.host.trim() !== "") void loadScenes(config);
      } catch {
        toast.error("Could not load the OBS settings.");
      }
    };
    void load();
  }, [loadScenes]);

  const send = async () => {
    if (!obs) return;
    setSending(true);
    setError(null);
    try {
      const result = await sendBrowserSource(obs, scene, name, url, width, height);
      toast.success(result === "created" ? `Added "${name}" to "${scene}".` : `Updated "${name}" in "${scene}".`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not reach OBS.";
      setError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  // Until the settings load the button stays disabled, but the URL is already copyable.
  const missing = !obs || obs.host.trim() === "";

  return (
    <section aria-label="OBS" className="flex flex-col gap-2 rounded-lg bg-white/4 p-2.5 ring-1 ring-line">
      <h2 className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
        <MonitorUp size={13} strokeWidth={1.75} />
        OBS browser source
        <span className="ml-auto font-medium tabular-nums text-ink">
          {width} x {height}
        </span>
      </h2>
      <div className="flex gap-1.5">
        <Input readOnly value={url} aria-label="Overlay URL" className="text-xs" />
        <CopyUrlButton url={url} label="Copy" />
      </div>
      {!missing && (
        <div className="flex gap-1.5">
          <div className="min-w-0 flex-1">
            <Select label="OBS scene" value={scene} onChange={setScene} options={scenes.map((value) => ({ value, label: value }))} />
          </div>
          <Button aria-label="Reload OBS scenes" disabled={loadingScenes} onClick={() => obs && void loadScenes(obs)} className="px-2">
            <RefreshCw size={14} strokeWidth={1.75} className={loadingScenes ? "animate-spin" : undefined} />
          </Button>
        </div>
      )}
      <Button tone="primary" disabled={missing || sending || scene === ""} onClick={() => void send()}>
        {sending ? <LoaderCircle size={14} strokeWidth={1.75} className="animate-spin" /> : <MonitorUp size={14} strokeWidth={1.75} />}
        Send to OBS
      </Button>
      {obs && (missing || error) && (
        <div className="flex items-center justify-between gap-2 text-xs text-ink-3">
          <span className="min-w-0">{missing ? "Set the OBS address first." : error}</span>
          <Button onClick={() => navigate("/app/settings")}>
            <Settings size={14} strokeWidth={1.75} />
            OBS settings
          </Button>
        </div>
      )}
    </section>
  );
}

export default ObsSource;
