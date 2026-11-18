import { type ReactNode, type UIEvent, useRef } from "react";

const SCROLLBAR_HIDE_MS = 800;

// Owns the page scroll so the thumb shows only while scrolling and its track starts below the window controls.
function ScrollPage({ children }: { children: ReactNode }) {
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showScrollbar = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    element.dataset.scrolling = "";
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => delete element.dataset.scrolling, SCROLLBAR_HIDE_MS);
  };

  return (
    <div data-fills-page onScroll={showScrollbar} className="auto-scrollbar -m-5 h-[calc(100%+2.5rem)] overflow-y-auto p-5">
      {children}
    </div>
  );
}

export default ScrollPage;
