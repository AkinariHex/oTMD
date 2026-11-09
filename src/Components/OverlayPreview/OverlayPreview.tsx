import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const OVERLAY_WIDTH = 400;
const OVERLAY_HEIGHT = 130;
const SMALL_OVERLAY_HEIGHT = 90;
const MAX_SCALE = 1.25;
const PREVIEW_URL = "http://127.0.0.1:21086/visualizer?preview=1";

interface OverlayPreviewProps {
  label: string;
  transparent: boolean;
  small?: boolean;
  status?: ReactNode;
}

// The real overlay in a frame, so what is shown here is exactly what OBS shows.
function OverlayPreview({ label, transparent, small = false, status }: OverlayPreviewProps) {
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const height = small ? SMALL_OVERLAY_HEIGHT : OVERLAY_HEIGHT;

  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(entry.contentRect.width / OVERLAY_WIDTH, MAX_SCALE));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex h-6 items-center justify-between">
        <h2 className="text-xs font-medium text-ink-3">{label}</h2>
        {status}
      </div>
      <div
        className={cn(
          "flex flex-1 flex-col justify-center rounded-lg p-4 ring-1 ring-line",
          transparent ? "bg-[repeating-conic-gradient(oklch(1_0_0/0.03)_0_25%,transparent_0_50%)] bg-size-[24px_24px]" : "bg-black"
        )}
      >
        <div ref={stage} className="flex justify-center">
          <div style={{ width: OVERLAY_WIDTH * scale, height: height * scale }}>
            <iframe
              title="Overlay preview"
              src={PREVIEW_URL}
              width={OVERLAY_WIDTH}
              height={height}
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
              className="pointer-events-none origin-top-left border-0"
              style={{ transform: `scale(${scale})` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export default OverlayPreview;
