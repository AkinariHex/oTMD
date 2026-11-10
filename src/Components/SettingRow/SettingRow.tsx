import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function SettingRow({ label, hint, compact = false, children }: { label: string; hint?: string; compact?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-6 py-2">
      <div className="min-w-0">
        <div className="text-ui font-medium text-ink">{label}</div>
        {hint && <div className="text-xs text-ink-3">{hint}</div>}
      </div>
      <div className={cn("flex shrink-0 justify-end", compact ? "w-36" : "w-64")}>{children}</div>
    </div>
  );
}

export default SettingRow;
