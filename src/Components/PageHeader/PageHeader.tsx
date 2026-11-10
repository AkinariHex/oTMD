import type { ReactNode } from "react";

function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header data-tauri-drag-region className="flex items-start justify-between gap-4 pr-(--window-controls-inset)">
      <div data-tauri-drag-region className="min-w-0">
        <h1 data-tauri-drag-region className="text-lg font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-0.5 text-ui text-ink-3">{description}</p>}
      </div>
      {action}
    </header>
  );
}

export default PageHeader;
