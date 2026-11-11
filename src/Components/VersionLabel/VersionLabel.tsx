import { useEffect, useState } from "react";
import { ArrowDownToLine } from "lucide-react";
import { toast } from "sonner";
import { Tooltip } from "@/Components/ui/tooltip";
import * as api from "@/lib/api";

function VersionLabel({ version }: { version: string }) {
  const [update, setUpdate] = useState<api.AvailableUpdate | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const found = await api.availableUpdate();
      if (active) setUpdate(found);
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const apply = async (found: api.AvailableUpdate) => {
    try {
      await api.applyUpdate(found);
    } catch {
      toast.error(found.portable ? "Could not open the browser." : "The update could not be started. Try again later.");
    }
  };

  return (
    <div className="px-2 pb-2.5">
      {update && (
        <Tooltip content={update.portable ? "Opens the GitHub release page to download the new portable zip." : "Downloads and installs the update, then restarts o!TMD."}>
          <button
            type="button"
            onClick={() => void apply(update)}
            className="update-button relative mb-1.5 flex h-7 w-full items-center justify-center gap-1.5 rounded-md text-caption font-medium text-accent outline-none transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.97]"
          >
            <span aria-hidden className="update-border" />
            <ArrowDownToLine size={12} strokeWidth={2.25} className="relative" />
            <span className="relative tabular-nums">Update to v{update.version}</span>
          </button>
        </Tooltip>
      )}
      <div className="px-2 pt-0.5 text-caption text-ink-3 tabular-nums">v{version}</div>
    </div>
  );
}

export default VersionLabel;
