import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MATCH_PREVIEW_URL } from "@/lib/api";
import { usePreviewBackground } from "@/lib/preferences";
import { cn } from "@/lib/utils";

const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 130;
const SMALL_HEIGHT = 90;
const MAX_SCALE = 1.25;

interface OverlayPreviewProps {
  src?: string;
  label: ReactNode;
  small?: boolean;
  width?: number;
  height?: number;
  status?: ReactNode;
}

// The real overlay in a frame, so what is shown here is exactly what OBS shows.
function OverlayPreview({ src = MATCH_PREVIEW_URL, label, small = false, width = DEFAULT_WIDTH, height: fullHeight = DEFAULT_HEIGHT, status }: OverlayPreviewProps) {
  const background = usePreviewBackground();
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const height = small ? SMALL_HEIGHT : fullHeight;

  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(entry.contentRect.width / width, entry.contentRect.height / height, MAX_SCALE));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [width, height]);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex h-6 items-center justify-between">
        {typeof label === "string" ? <h2 className="text-xs font-medium text-ink-3">{label}</h2> : label}
        {status}
      </div>
      <div
        className={cn(
          "relative min-h-0 flex-1 rounded-lg ring-1 ring-line",
          background === "checker" ? "bg-[repeating-conic-gradient(oklch(1_0_0/0.03)_0_25%,transparent_0_50%)] bg-size-[24px_24px]" : "bg-black"
        )}
      >
        <div ref={stage} className="absolute inset-4 flex items-center justify-center">
          <div style={{ width: width * scale, height: height * scale }}>
            <iframe
              title="Overlay preview"
              src={src}
              width={width}
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
