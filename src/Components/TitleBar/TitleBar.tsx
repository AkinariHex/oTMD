import WindowControls from "@/Components/WindowControls/WindowControls";

function TitleBar() {
  return (
    <div data-tauri-drag-region className="flex h-8 shrink-0 items-center justify-between">
      <span data-tauri-drag-region className="pl-3 text-xs font-semibold text-ink-2">
        o!TMD
      </span>
      <WindowControls />
    </div>
  );
}

export default TitleBar;
