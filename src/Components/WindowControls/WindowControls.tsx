import { Minus, X } from "lucide-react";
import * as api from "@/lib/api";

const CONTROL = "flex h-full w-11 items-center justify-center text-ink-3 transition-colors duration-150 hover:text-ink";

function WindowControls() {
  return (
    <div className="flex h-full">
      <button type="button" aria-label="Minimize" onClick={api.minimizeApp} className={`${CONTROL} hover:bg-white/8`}>
        <Minus size={13} strokeWidth={1.75} />
      </button>
      <button type="button" aria-label="Close" onClick={api.closeApp} className={`${CONTROL} hover:bg-loss hover:text-on-accent`}>
        <X size={15} strokeWidth={1.75} />
      </button>
    </div>
  );
}

export default WindowControls;
