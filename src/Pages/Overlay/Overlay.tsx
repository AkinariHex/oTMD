import { useEffect, useState } from "react";
import { toast } from "sonner";
import CopyUrlButton from "@/Components/CopyUrlButton/CopyUrlButton";
import OverlayPreview from "@/Components/OverlayPreview/OverlayPreview";
import PageHeader from "@/Components/PageHeader/PageHeader";
import SettingRow from "@/Components/SettingRow/SettingRow";
import { Input } from "@/Components/ui/input";
import { Segmented } from "@/Components/ui/segmented";
import { Select } from "@/Components/ui/select";
import { SelectCard } from "@/Components/ui/select-card";
import { Switch } from "@/Components/ui/switch";
import * as api from "@/lib/api";
import { applyPreferences, usePreviewBackground } from "@/lib/preferences";

type OverlayKind = "match" | "ranked" | "broadcast";

const OVERLAYS: { id: OverlayKind; name: string; available: boolean }[] = [
  { id: "match", name: "Match", available: true },
  { id: "ranked", name: "Ranked", available: false },
  { id: "broadcast", name: "Broadcast", available: false },
];
const CORNER_STYLES = [
  { value: "0px 0px 0px 0px", label: "Default" },
  { value: "15px 15px 15px 15px", label: "Rounded" },
  { value: "15px 15px 0px 0px", label: "Top-rounded" },
  { value: "0px 0px 15px 15px", label: "Bottom-rounded" },
];
const PREVIEW_BACKGROUNDS = [
  { value: "checker", label: "Checker" },
  { value: "black", label: "Black" },
];

function OverlayThumbnail({ kind }: { kind: OverlayKind }) {
  return (
    <svg viewBox="0 0 96 56" className="h-14 w-24 shrink-0 rounded-md bg-black/30" aria-hidden="true">
      {kind === "match" && (
        <>
          <rect x="10" y="17" width="20" height="4" rx="2" fill="var(--ink-3)" />
          <rect x="66" y="17" width="20" height="4" rx="2" fill="var(--ink-3)" />
          <rect x="35" y="12" width="11" height="17" rx="2" fill="var(--loss)" />
          <rect x="50" y="12" width="11" height="17" rx="2" fill="var(--accent)" />
          {[0, 1, 2, 3, 4].map((pip) => (
            <rect key={`red-${pip}`} x={10 + pip * 16} y="36" width="13" height="2.5" rx="1.25" fill={pip < 3 ? "var(--loss)" : "var(--line)"} />
          ))}
          {[0, 1, 2, 3, 4].map((pip) => (
            <rect key={`blue-${pip}`} x={10 + pip * 16} y="41" width="13" height="2.5" rx="1.25" fill={pip < 2 ? "var(--accent)" : "var(--line)"} />
          ))}
        </>
      )}
      {kind === "ranked" && (
        <>
          <rect x="10" y="12" width="26" height="4" rx="2" fill="var(--ink-3)" />
          <rect x="10" y="19" width="76" height="6" rx="3" fill="var(--line)" />
          <rect x="10" y="19" width="52" height="6" rx="3" fill="var(--loss)" />
          <rect x="10" y="31" width="26" height="4" rx="2" fill="var(--ink-3)" />
          <rect x="10" y="38" width="76" height="6" rx="3" fill="var(--line)" />
          <rect x="10" y="38" width="30" height="6" rx="3" fill="var(--accent)" />
        </>
      )}
      {kind === "broadcast" &&
        [0, 1].flatMap((row) =>
          [0, 1].map((column) => (
            <g key={`${row}-${column}`} transform={`translate(${8 + column * 42} ${9 + row * 21})`}>
              <rect width="38" height="17" rx="3" fill="var(--panel)" />
              <rect x="5" y="7" width="12" height="3" rx="1.5" fill="var(--ink-3)" />
              <rect x="22" y="5" width="5" height="7" rx="1" fill="var(--loss)" />
              <rect x="29" y="5" width="5" height="7" rx="1" fill="var(--accent)" />
            </g>
          ))
        )}
    </svg>
  );
}

function Overlay({ sources }: { sources: number }) {
  const [settings, setSettings] = useState<api.DisplayerSettings | null>(null);
  const previewBackground = usePreviewBackground();

  useEffect(() => {
    const load = async () => setSettings(await api.getDisplayerSettings());
    void load();
  }, []);

  if (!settings) return null;

  // The overlay reacts as soon as the core publishes the change, so the preview needs no extra wiring.
  const change = async (update: Partial<api.DisplayerSettings>) => {
    const next = { ...settings, ...update };
    setSettings(next);
    try {
      await api.saveDisplayerSettings(next);
    } catch {
      toast.error("Could not save the overlay settings.");
    }
  };

  const changePreviewBackground = async (PreviewBackground: api.PreviewBackground) => {
    try {
      const next = { ...(await api.getAppSettings()), PreviewBackground };
      applyPreferences(next);
      await api.saveAppSettings(next);
    } catch {
      toast.error("Could not save the preview background.");
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader title="Overlay" description="Choose an overlay to configure for OBS" />
      <div role="radiogroup" aria-label="Overlay type" className="grid grid-cols-3 gap-2.5">
        {OVERLAYS.map(({ id, name, available }) => (
          <SelectCard key={id} selected={id === "match"} disabled={!available} onClick={() => undefined} className="flex items-center gap-2.5">
            <OverlayThumbnail kind={id} />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-ink">{name}</span>
              <span className="block text-xs text-ink-3">{available ? `${sources} ${sources === 1 ? "source" : "sources"}` : "Soon"}</span>
            </span>
          </SelectCard>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr] gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5">
            <Input readOnly value={api.OVERLAY_URL} aria-label="Match overlay URL" className="text-xs" />
            <CopyUrlButton url={api.OVERLAY_URL} label="Copy" />
          </div>
          <div className="divide-y divide-line">
            <SettingRow compact label="Corners">
              <div className="w-full">
                <Select label="Corners" value={settings.VisualizerStyle} onChange={(VisualizerStyle) => void change({ VisualizerStyle })} options={CORNER_STYLES} />
              </div>
            </SettingRow>
            <SettingRow compact label="Small overlay" hint="Shows the acronym">
              <Switch aria-label="Small overlay" checked={settings.SmallDisplayer} onCheckedChange={(SmallDisplayer) => void change({ SmallDisplayer })} />
            </SettingRow>
            <SettingRow compact label="Transparent">
              <Switch aria-label="Transparent background" checked={settings.TransparentBackground} onCheckedChange={(TransparentBackground) => void change({ TransparentBackground })} />
            </SettingRow>
            <SettingRow compact label="Preview background" hint="Only in this app">
              <Segmented
                label="Preview background"
                value={previewBackground}
                onChange={(value) => void changePreviewBackground(value as api.PreviewBackground)}
                options={PREVIEW_BACKGROUNDS}
              />
            </SettingRow>
          </div>
        </div>
        <OverlayPreview label="Live preview" small={settings.SmallDisplayer} />
      </div>
    </div>
  );
}

export default Overlay;
