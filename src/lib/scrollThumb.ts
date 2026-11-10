import { useCallback, useRef, type UIEvent } from "react";

const HIDE_AFTER_MS = 700;
const MIN_THUMB_HEIGHT = 24;

// Drawn over the list and only while moving, so the list keeps its full width.
export function useScrollThumb() {
  const thumb = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showScrollThumb = useCallback((event: UIEvent<HTMLElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    const element = thumb.current;
    if (!element || scrollHeight <= clientHeight) return;

    // A bottom margin on the thumb shortens its track, for lists that run under the edge of the app.
    const track = clientHeight - parseFloat(getComputedStyle(element).marginBottom);
    const height = Math.max(MIN_THUMB_HEIGHT, (clientHeight / scrollHeight) * track);
    const travel = (scrollTop / (scrollHeight - clientHeight)) * (track - height);
    element.style.height = `${height}px`;
    element.style.transform = `translateY(${travel}px)`;
    element.style.opacity = "1";

    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      element.style.opacity = "0";
    }, HIDE_AFTER_MS);
  }, []);

  return { thumb, showScrollThumb };
}
