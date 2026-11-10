import { useRef, type ChangeEvent } from "react";
import { ImagePlus } from "lucide-react";
import { Popover } from "radix-ui";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { applyPreferences, usePreviewBackground } from "@/lib/preferences";
import { BACKGROUND_OPTIONS, customBackground, storePreviewImage, usePreviewImage } from "@/lib/previewBackgrounds";
import { cn } from "@/lib/utils";

const SWATCH = "h-9 w-full rounded ring-1 ring-line";

async function saveBackground(PreviewBackground: api.PreviewBackground): Promise<void> {
  try {
    const next = { ...(await api.getAppSettings()), PreviewBackground };
    applyPreferences(next);
    await api.saveAppSettings(next);
  } catch {
    toast.error("Could not save the preview background.");
  }
}

function BackgroundPicker() {
  const selected = usePreviewBackground();
  const image = usePreviewImage();
  const fileInput = useRef<HTMLInputElement>(null);
  const current = BACKGROUND_OPTIONS.find(({ id }) => id === selected);
  const currentBackground = selected === "custom" && image ? customBackground(image) : (current?.background ?? BACKGROUND_OPTIONS[0].background);

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      await storePreviewImage(file);
      await saveBackground("custom");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That image could not be used.");
    }
  };

  const tile = (id: api.PreviewBackground, label: string, background: string) => (
    <button
      key={id}
      type="button"
      role="radio"
      aria-checked={selected === id}
      onClick={() => void saveBackground(id)}
      className={cn("rounded-md p-1 text-left outline-none transition-colors duration-150 hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-accent/60", selected === id && "bg-accent/15 ring-1 ring-accent")}
    >
      <span className={cn(SWATCH, "block")} style={{ background }} />
      <span className="mt-1 block truncate text-caption font-medium text-ink-2">{label}</span>
    </button>
  );

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="Preview background"
        className="flex h-7 items-center gap-1.5 rounded-md bg-black/55 p-1 pr-2 text-xs font-medium text-ink outline-none backdrop-blur-sm transition-colors duration-150 hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <span className="size-5 rounded-sm ring-1 ring-white/20" style={{ background: currentBackground }} />
        Background
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-50 w-64 rounded-lg bg-raised p-2 shadow-xl ring-1 ring-line">
          <div role="radiogroup" aria-label="Preview background" className="grid grid-cols-3 gap-1">
            {BACKGROUND_OPTIONS.map(({ id, label, background }) => tile(id, label, background))}
            {image && tile("custom", "Custom", customBackground(image))}
          </div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-white/8 text-xs font-medium text-ink transition-colors duration-150 outline-none hover:bg-white/12 focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <ImagePlus size={14} strokeWidth={1.75} />
            {image ? "Choose another image" : "Choose an image"}
          </button>
          <input ref={fileInput} type="file" accept="image/*" aria-label="Background image file" className="hidden" onChange={(event) => void chooseFile(event)} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export default BackgroundPicker;
