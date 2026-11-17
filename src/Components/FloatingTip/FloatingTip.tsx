import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const OPEN_DELAY_MS = 250;
const GAP_PX = 8;

// One tooltip for a group of targets: the first open waits a beat, moving between targets is instant.
export function useFloatingTip<T>() {
  const [tip, setTip] = useState<{ anchor: HTMLElement; data: T } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const open = useRef(false);

  const show = useCallback((anchor: HTMLElement, data: T) => {
    window.clearTimeout(timer.current);
    if (open.current) {
      setTip({ anchor, data });
      return;
    }
    timer.current = window.setTimeout(() => {
      open.current = true;
      setTip({ anchor, data });
    }, OPEN_DELAY_MS);
  }, []);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    open.current = false;
    setTip(null);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { tip, show, hide };
}

// Fixed to the viewport so card overflow never clips it.
function FloatingTip({ anchor, className, children }: { anchor: HTMLElement | null; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const tip = ref.current;
    if (!tip || !anchor) return;
    const target = anchor.getBoundingClientRect();
    const own = tip.getBoundingClientRect();
    // Below the anchor first, like the Radix tooltips it replaced; above only when the window has no room.
    const below = target.bottom + GAP_PX + own.height <= window.innerHeight - GAP_PX;
    const top = below ? target.bottom + GAP_PX : target.top - own.height - GAP_PX;
    // Never past the right edge of the surrounding card, so the last points line up with it.
    const boundary = anchor.closest("[data-tip-boundary]")?.getBoundingClientRect();
    const centred = target.left + target.width / 2 - own.width / 2;
    const left = Math.min(Math.max(boundary ? Math.min(centred, boundary.right - own.width) : centred, GAP_PX), window.innerWidth - own.width - GAP_PX);
    tip.style.transform = `translate(${left}px, ${top}px)`;
    tip.dataset.side = below ? "bottom" : "top";
  }, [anchor, children]);

  if (!anchor) return null;
  return createPortal(
    <div ref={ref} role="tooltip" className="floating-tip pointer-events-none fixed top-0 left-0 z-50">
      <div className={className}>{children}</div>
    </div>,
    document.body
  );
}

export default FloatingTip;
