import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { toast } from "sonner";
import TitleBar from "@/Components/TitleBar/TitleBar";
import Logo from "@/Images/otmd.ico";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";

const SIZE = 184;
const STROKE = 5;
const RADIUS = (SIZE - STROKE) / 2 - 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const STEPS: { phase: api.UpdatePhase; label: string }[] = [
  { phase: "download", label: "Download" },
  { phase: "install", label: "Install" },
  { phase: "restart", label: "Restart" },
];

const TITLES: Record<api.UpdatePhase, string> = { download: "Updating to", install: "Installing", restart: "Restarting into" };

const megabytes = (bytes: number): string => (bytes / 1_000_000).toFixed(1);

function details(progress: api.UpdateProgress): string {
  if (progress.phase === "install") return "Replacing files, this takes a few seconds";
  if (progress.phase === "restart") return "o!TMD will open again in a moment";
  if (!progress.total) return progress.speed > 0 ? `${progress.speed.toFixed(1)} MB/s` : "Connecting";
  const seconds = progress.speed > 0 ? Math.max(1, Math.ceil((progress.total - progress.downloaded) / (progress.speed * 1_000_000))) : 0;
  return `${progress.speed.toFixed(1)} MB/s · ${megabytes(progress.downloaded)} / ${megabytes(progress.total)} MB${seconds ? ` · ${seconds}s left` : ""}`;
}

function AppUpdate() {
  const navigate = useNavigate();
  const [version, setVersion] = useState("");
  const [progress, setProgress] = useState<api.UpdateProgress>({ phase: "download", percent: 0, speed: 0, downloaded: 0, total: null });

  useEffect(() => {
    let active = true;
    const load = async () => {
      const update = await api.availableUpdate();
      if (active && update) setVersion(update.version);
    };
    void load();

    const stopProgress = api.watchUpdate(setProgress);
    const stopFailed = api.onUpdateFailed(() => {
      toast.error("The update could not be installed. Try again later.");
      navigate(-1);
    });
    return () => {
      active = false;
      stopProgress();
      stopFailed();
    };
  }, [navigate]);

  const fraction = progress.phase === "download" ? progress.percent / 100 : 1;
  const step = STEPS.findIndex((item) => item.phase === progress.phase);

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <main data-phase={progress.phase} className="update-page flex flex-1 flex-col items-center justify-center pb-10">
        <div className="update-enter relative grid size-[184px] place-items-center">
          <svg width={SIZE} height={SIZE} className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="currentColor" strokeWidth={STROKE} className="text-white/7" />
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
              className="transition-[stroke-dashoffset] duration-300 ease-out"
            />
          </svg>
          <img src={Logo} alt="o!TMD" width={84} height={84} className="update-logo relative size-[84px]" />
        </div>

        <div
          role="progressbar"
          aria-label="Update progress"
          aria-valuenow={Math.round(fraction * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="update-enter mt-6 text-4xl font-semibold tracking-tight text-ink tabular-nums [animation-delay:60ms]"
        >
          {Math.round(fraction * 100)}%
        </div>
        <p className="update-enter mt-1 h-5 text-ui text-ink-2 [animation-delay:100ms]">
          {TITLES[progress.phase]} {version && <span className="font-medium text-ink tabular-nums">v{version}</span>}
        </p>
        <p className="update-enter mt-1 h-4 text-caption text-ink-3 tabular-nums [animation-delay:140ms]">{details(progress)}</p>

        <ol className="update-enter mt-8 flex items-center gap-3 [animation-delay:180ms]">
          {STEPS.map((item, index) => (
            <li key={item.phase} className="flex items-center gap-3">
              {index > 0 && (
                <span className="relative h-px w-10 overflow-hidden bg-white/10">
                  <span className={cn("absolute inset-0 origin-left bg-accent transition-transform duration-300 ease-out", index <= step ? "scale-x-100" : "scale-x-0")} />
                </span>
              )}
              <span className={cn("flex items-center gap-1.5 text-caption transition-colors duration-200", index <= step ? "text-ink" : "text-ink-3")}>
                <span
                  className={cn(
                    "grid size-4 place-items-center rounded-full border transition-colors duration-200",
                    index < step ? "border-accent bg-accent text-on-accent" : index === step ? "update-step-active border-accent" : "border-white/15"
                  )}
                >
                  {index < step && <Check size={10} strokeWidth={3} />}
                </span>
                {item.label}
              </span>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}

export default AppUpdate;
