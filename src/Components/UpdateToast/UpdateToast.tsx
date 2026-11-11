import { ArrowDownToLine, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/Components/ui/button";
import * as api from "@/lib/api";

function UpdateToast({ id, update }: { id: string | number; update: api.AvailableUpdate }) {
  const apply = async () => {
    toast.dismiss(id);
    try {
      await api.applyUpdate(update);
    } catch {
      toast.error(update.portable ? "Could not open the browser." : "The update could not be started. Try again later.");
    }
  };

  return (
    <div className="relative flex w-[356px] gap-3 rounded-lg border border-line bg-raised p-3 pr-9 shadow-xl shadow-black/40">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
        <ArrowDownToLine size={15} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ui font-medium text-ink">Update available</p>
        <p className="mt-0.5 text-caption text-ink-3">
          o!TMD <span className="tabular-nums text-ink-2">v{update.version}</span> is ready.{" "}
          {update.portable ? "Download the new portable zip." : "o!TMD restarts once it is installed."}
        </p>
        <Button tone="primary" onClick={() => void apply()} className="mt-2.5 h-7 px-2.5 text-caption">
          {update.portable ? "Download" : "Update now"}
        </Button>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => toast.dismiss(id)}
        className="absolute top-2 right-2 grid size-6 place-items-center rounded-md text-ink-3 outline-none transition-[background-color,color,transform] duration-150 ease-out hover:bg-white/8 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.94]"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

export default UpdateToast;
