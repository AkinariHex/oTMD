// Tauri does not expose WebView2's switches for its browser shortcuts and context menu, so release builds turn them off here.
// Devtools are already absent from release builds (no "devtools" feature) and zoom hotkeys are off by default.

const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select") !== null);

// Reload, print, find, save, view source, caret browsing, and history navigation.
function isBrowserShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  const control = event.ctrlKey || event.metaKey;
  if (["f5", "f7", "f3", "f12", "browserback", "browserforward", "browserrefresh"].includes(key)) return true;
  if (control && ["r", "p", "f", "g", "s", "u", "j", "h", "o"].includes(key)) return true;
  if (control && event.shiftKey && ["i", "c", "j"].includes(key)) return true;
  if (event.altKey && (key === "arrowleft" || key === "arrowright" || key === "home")) return true;
  return false;
}

export function lockDownWebview(): void {
  window.addEventListener(
    "keydown",
    (event) => {
      if (isBrowserShortcut(event)) event.preventDefault();
    },
    { capture: true }
  );

  // Text fields keep their menu for cut, copy and paste; everything else gets none.
  window.addEventListener("contextmenu", (event) => {
    if (!isEditable(event.target)) event.preventDefault();
  });

  // The mouse back and forward buttons would move through the app's history.
  window.addEventListener("mouseup", (event) => {
    if (event.button === 3 || event.button === 4) event.preventDefault();
  });
}
