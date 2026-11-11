import { useEffect, useState } from "react";
import { toast } from "sonner";
import * as api from "@/lib/api";

function VersionLabel({ version }: { version: string }) {
  const [update, setUpdate] = useState<api.PortableUpdate | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const found = await api.portableUpdate();
      if (active) setUpdate(found);
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  if (!update) {
    return <div className="px-4 pt-0.5 pb-2.5 text-caption text-ink-3">v{version}</div>;
  }

  const open = async () => {
    try {
      await api.openExternal(update.url);
    } catch {
      toast.error("Could not open the browser.");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void open()}
      className="mx-2 mb-1.5 rounded-md px-2 py-1 text-left text-caption text-ink-3 transition-colors duration-150 hover:bg-white/5 hover:text-ink"
    >
      v{version} - <span className="text-win">v{update.version} available</span>
    </button>
  );
}

export default VersionLabel;
