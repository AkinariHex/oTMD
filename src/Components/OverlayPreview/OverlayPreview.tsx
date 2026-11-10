import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import BackgroundPicker from "@/Components/BackgroundPicker/BackgroundPicker";
import { MATCH_PREVIEW_URL } from "@/lib/api";
import { usePreviewBackground } from "@/lib/preferences";
import { BACKGROUND_OPTIONS, customBackground, usePreviewImage } from "@/lib/previewBackgrounds";
import { cn } from "@/lib/utils";

const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 130;
const SMALL_HEIGHT = 90;
const MAX_SCALE = 1.25;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.1;
const MIDDLE_BUTTON = 1;

interface OverlayPreviewProps {
  src?: string;
  label: ReactNode;
  small?: boolean;
  width?: number;
  height?: number;
  status?: ReactNode;
  clearWindowControls?: boolean;
}

interface Point {
  x: number;
  y: number;
}

interface View {
  zoom: number;
  overlay: Point;
  background: Point;
}

interface Drag {
  target: "overlay" | "background";
  startX: number;
  startY: number;
  origin: Point;
}

const INITIAL_VIEW: View = { zoom: 1, overlay: { x: 0, y: 0 }, background: { x: 0, y: 0 } };

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const translated = ({ x, y }: Point, zoom: number) => `translate(${x}px, ${y}px) scale(${zoom})`;
const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(target.tagName);
// Keeps the point under the cursor in place while the zoom changes.
const zoomAround = (point: Point, cursor: Point, ratio: number): Point => ({
  x: cursor.x - (cursor.x - point.x) * ratio,
  y: cursor.y - (cursor.y - point.y) * ratio,
});

// The real overlay in a frame, so what is shown here is exactly what OBS shows.
function OverlayPreview({ src = MATCH_PREVIEW_URL, label, small = false, width = DEFAULT_WIDTH, height: fullHeight = DEFAULT_HEIGHT, status, clearWindowControls = false }: OverlayPreviewProps) {
  const selectedBackground = usePreviewBackground();
  const image = usePreviewImage();
  const stage = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const hovering = useRef(false);
  const [available, setAvailable] = useState<{ width: number; height: number } | null>(null);
  const [view, setView] = useState(INITIAL_VIEW);
  const [dragging, setDragging] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const height = small ? SMALL_HEIGHT : fullHeight;

  // Switching overlay starts from a clean view; Sample and Live show the same overlay, so they keep it.
  const overlayKey = src.replace("&sample=1", "");
  const [viewKey, setViewKey] = useState(overlayKey);
  if (overlayKey !== viewKey) {
    setViewKey(overlayKey);
    setView(INITIAL_VIEW);
  }

  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => setAvailable({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // React registers wheel listeners as passive, and zooming has to stop the page from scrolling.
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      const cursor = { x: event.clientX - box.left - box.width / 2, y: event.clientY - box.top - box.height / 2 };
      setView((current) => {
        const zoom = clamp(current.zoom * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), MIN_ZOOM, MAX_ZOOM);
        const ratio = zoom / current.zoom;
        return { zoom, overlay: zoomAround(current.overlay, cursor, ratio), background: zoomAround(current.background, cursor, ratio) };
      });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !hovering.current || isTyping(event.target)) return;
      event.preventDefault();
      setSpaceHeld(true);
    };
    const release = () => setSpaceHeld(false);
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") release();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
    };
  }, []);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== MIDDLE_BUTTON) return;
    const pressed = event.target as HTMLElement;
    // React also bubbles events up from portals, so a press in the picker's popover arrives here too.
    if (!event.currentTarget.contains(pressed) || pressed.closest("[data-preview-control]")) return;
    const target = event.button === MIDDLE_BUTTON || spaceHeld ? "overlay" : "background";
    drag.current = { target, startX: event.clientX, startY: event.clientY, origin: view[target] };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active) return;
    const moved = { x: active.origin.x + event.clientX - active.startX, y: active.origin.y + event.clientY - active.startY };
    setView((current) => ({ ...current, [active.target]: moved }));
  };

  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  // Without this the browser would start its own middle-button autoscroll.
  const blockAutoscroll = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button === MIDDLE_BUTTON) event.preventDefault();
  };

  const option = BACKGROUND_OPTIONS.find(({ id }) => id === selectedBackground);
  const isCustom = selectedBackground === "custom" && image !== null;
  const background = isCustom ? customBackground(image) : (option ?? BACKGROUND_OPTIONS[0]).background;
  const endless = !isCustom && (option ?? BACKGROUND_OPTIONS[0]).endless;
  // Worked out while rendering: a stored scale would pair the previous overlay's zoom with the new size for a frame.
  const scale = available ? Math.min(available.width / width, available.height / height, MAX_SCALE) : 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <div className={cn("flex h-6 items-center justify-between", clearWindowControls && "pr-(--window-controls-inset)")}>
        {typeof label === "string" ? <h2 className="text-xs font-medium text-ink-3">{label}</h2> : label}
        {status}
      </div>
      <div
        ref={surface}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onMouseDown={blockAutoscroll}
        onPointerEnter={() => {
          hovering.current = true;
        }}
        onPointerLeave={() => {
          hovering.current = false;
        }}
        className={cn("relative min-h-0 flex-1 touch-none overflow-hidden rounded-lg bg-black/30 ring-1 ring-line", dragging ? "cursor-grabbing" : "cursor-grab")}
      >
        <div data-preview-background className={cn("absolute", endless ? "-inset-[400%]" : "inset-0")} style={{ background, transform: translated(view.background, view.zoom) }} />
        <div ref={stage} className="absolute inset-4 flex items-center justify-center">
          <div data-preview-overlay style={{ width: width * scale, height: height * scale, transform: translated(view.overlay, view.zoom) }}>
            <iframe
              key={src}
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
        <div data-preview-control className="absolute top-2 right-2">
          <BackgroundPicker />
        </div>
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/55 px-1.5 py-0.5 text-caption text-ink-2">
          {spaceHeld ? "Drag to move the overlay" : "Scroll to zoom, drag the background, Space or middle-drag moves the overlay"}
        </div>
        <button
          type="button"
          data-preview-control
          aria-label="Reset preview view"
          onClick={() => setView(INITIAL_VIEW)}
          className="absolute right-2 bottom-2 rounded bg-black/55 px-1.5 py-0.5 text-caption font-medium tabular-nums text-ink-2 outline-none transition-colors duration-150 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          {Math.round(view.zoom * 100)}%
        </button>
      </div>
    </section>
  );
}

export default OverlayPreview;
