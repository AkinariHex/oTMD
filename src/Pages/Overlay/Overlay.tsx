import { useEffect, useState } from "react";
import { toast } from "sonner";
import CopyUrlButton from "@/Components/CopyUrlButton/CopyUrlButton";
import FontPicker from "@/Components/FontPicker/FontPicker";
import OverlayPreview from "@/Components/OverlayPreview/OverlayPreview";
import PageHeader from "@/Components/PageHeader/PageHeader";
import SettingRow from "@/Components/SettingRow/SettingRow";
import { Input } from "@/Components/ui/input";
import { Segmented } from "@/Components/ui/segmented";
import { Select } from "@/Components/ui/select";
import { SelectCard } from "@/Components/ui/select-card";
import { Slider } from "@/Components/ui/slider";
import { Switch } from "@/Components/ui/switch";
import * as api from "@/lib/api";
import { BROADCAST_HEIGHT, BROADCAST_WIDTH, DRIFT_HEIGHT, HEALTH_HEIGHT, MAPS_HEIGHT, OVERLAY_WIDTH, RATIO_HEIGHT, SCORE_HEIGHT, SMALL_DRIFT_HEIGHT, SMALL_SCORE_HEIGHT, withPadding } from "@/lib/overlays";

type OverlayKind = "match" | "ranked" | "broadcast";

type ViewId = "score" | "health" | "maps" | "ratio" | "board";

interface OverlayView {
  id: ViewId;
  label: string;
  url: string;
  preview: string;
  height: number;
}

const BASE_URL = "http://localhost:21086";
const PREVIEW_BASE = "http://127.0.0.1:21086";
const view = (id: ViewId, label: string, path: string, height: number): OverlayView => ({
  id,
  label,
  url: `${BASE_URL}${path}`,
  preview: `${PREVIEW_BASE}${path}?preview=1`,
  height,
});
const VIEWS: Record<OverlayKind, OverlayView[]> = {
  match: [view("score", "Score", "/visualizer", SCORE_HEIGHT), view("maps", "Maps", "/visualizer/maps", MAPS_HEIGHT)],
  ranked: [view("health", "Health", "/ranked", HEALTH_HEIGHT), view("maps", "Maps", "/ranked/maps", MAPS_HEIGHT), view("ratio", "Overview", "/ranked/ratio", RATIO_HEIGHT)],
  broadcast: [view("board", "Broadcast", "/broadcast", BROADCAST_HEIGHT)],
};

const OVERLAYS: { id: OverlayKind; name: string }[] = [
  { id: "match", name: "Match" },
  { id: "ranked", name: "Ranked" },
  { id: "broadcast", name: "Broadcast" },
];
const BROADCAST_LOOKS = [
  { value: "table", label: "Table" },
  { value: "duel", label: "Duel" },
];
const MATCH_LAYOUTS = [
  { value: "aurora", label: "Aurora" },
  { value: "drift", label: "Drift" },
];
const POINT_ANIMATIONS = [
  { value: "pop", label: "Pop" },
  { value: "roll", label: "Roll up" },
];
const SAMPLE_COUNTS = ["1", "4", "8"].map((value) => ({ value, label: value }));
const CORNER_STYLES = [
  { value: "0px 0px 0px 0px", label: "Default" },
  { value: "15px 15px 15px 15px", label: "Rounded" },
  { value: "15px 15px 0px 0px", label: "Top-rounded" },
  { value: "0px 0px 15px 15px", label: "Bottom-rounded" },
];
const PREVIEW_DATA = [
  { value: "sample", label: "Sample data" },
  { value: "live", label: "Live" },
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

function toHex(rgb: string): string {
  return `#${rgb
    .split(",")
    .map((channel) => Number(channel.trim()).toString(16).padStart(2, "0"))
    .join("")}`;
}

function toRgb(hex: string): string {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)).join(", ");
}

function StyleControls({ style, onChange }: { style: api.OverlayStyle; onChange: (update: Partial<api.OverlayStyle>) => void }) {
  return (
    <>
      <SettingRow compact label="Background">
        <input
          type="color"
          aria-label="Background color"
          value={toHex(style.backgroundColor)}
          onChange={(event) => onChange({ backgroundColor: toRgb(event.target.value) })}
          className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
        />
      </SettingRow>
      <SettingRow compact label={`Opacity ${Math.round(style.backgroundOpacity * 100)}%`}>
        <Slider label="Background opacity" min={0} max={1} step={0.05} value={style.backgroundOpacity} onChange={(backgroundOpacity) => onChange({ backgroundOpacity })} />
      </SettingRow>
      <SettingRow compact label={`Radius ${style.borderRadius}px`}>
        <Slider label="Border radius" min={0} max={32} step={2} value={style.borderRadius} onChange={(borderRadius) => onChange({ borderRadius })} />
      </SettingRow>
      <SettingRow compact label={`Padding ${style.padding}px`}>
        <Slider label="Padding" min={0} max={32} step={4} value={style.padding} onChange={(padding) => onChange({ padding })} />
      </SettingRow>
      <SettingRow compact label="Font">
        <div className="w-full">
          <FontPicker label="Font" value={style.fontFamily} onChange={(fontFamily) => onChange({ fontFamily })} />
        </div>
      </SettingRow>
    </>
  );
}

function Overlay({ sources }: { sources: api.OverlaySources }) {
  const [kind, setKind] = useState<OverlayKind>("match");
  const [views, setViews] = useState<Record<OverlayKind, ViewId>>({ match: "score", ranked: "health", broadcast: "board" });
  const [previewData, setPreviewData] = useState("sample");
  const [sampleCount, setSampleCount] = useState("4");
  const [settings, setSettings] = useState<api.DisplayerSettings | null>(null);
  const [ranked, setRanked] = useState<api.RankedSettings | null>(null);
  const [broadcast, setBroadcast] = useState<api.BroadcastStyle | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [displayer, rankedSettings, broadcastStatus] = await Promise.all([api.getDisplayerSettings(), api.getRankedSettings(), api.getBroadcastStatus()]);
        if (!active) return;
        setSettings(displayer);
        setRanked(rankedSettings);
        setBroadcast(broadcastStatus.style);
      } catch {
        toast.error("Could not load the overlay settings.");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  if (!settings || !ranked || !broadcast) return null;

  const change = async (update: Partial<api.DisplayerSettings>) => {
    const next = { ...settings, ...update };
    setSettings(next);
    try {
      await api.saveDisplayerSettings(next);
    } catch {
      toast.error("Could not save the overlay settings.");
    }
  };

  const changeRanked = async (update: Partial<api.RankedSettings>) => {
    const next = { ...ranked, ...update };
    setRanked(next);
    try {
      await api.saveRankedSettings(next);
    } catch {
      toast.error("Could not save the overlay settings.");
    }
  };

  const saveBroadcast = async (next: api.BroadcastStyle) => {
    try {
      await api.saveBroadcastStyle(next);
    } catch {
      toast.error("Could not save the overlay settings.");
    }
  };

  const changeBroadcast = (update: Partial<api.BroadcastStyle>) => {
    const next = { ...broadcast, ...update };
    setBroadcast(next);
    void saveBroadcast(next);
  };

  const countOf = (id: OverlayKind) => {
    const count = sources[id];
    return `${count} ${count === 1 ? "source" : "sources"}`;
  };

  const selected = VIEWS[kind].find(({ id }) => id === views[kind]) ?? VIEWS[kind][0];
  const rankedStyle = selected.id === "health" ? "Health" : selected.id === "ratio" ? "Ratio" : "Maps";
  const isMatchScore = kind === "match" && selected.id === "score";
  const activePadding = kind === "ranked" ? ranked[rankedStyle].padding : 0;
  const scoreHeight = settings.MatchLayout === "drift" ? (settings.SmallDisplayer ? SMALL_DRIFT_HEIGHT : DRIFT_HEIGHT) : settings.SmallDisplayer ? SMALL_SCORE_HEIGHT : SCORE_HEIGHT;
  const sourceHeight = isMatchScore ? scoreHeight : selected.id === "maps" ? selected.height : withPadding(selected.height, activePadding);
  const sourceWidth = kind === "broadcast" ? BROADCAST_WIDTH : OVERLAY_WIDTH;
  const sampleQuery = previewData !== "sample" ? "" : kind === "broadcast" ? `&sample=1&count=${sampleCount}` : "&sample=1";

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader title="Overlay" description="Choose an overlay to configure for OBS" />
      <div role="radiogroup" aria-label="Overlay type" className="grid grid-cols-3 gap-2.5">
        {OVERLAYS.map(({ id, name }) => (
          <SelectCard key={id} selected={id === kind} onClick={() => setKind(id)} className="flex items-center gap-2.5">
            <OverlayThumbnail kind={id} />
            <span className="min-w-0">
              <span className="block text-ui font-semibold text-ink">{name}</span>
              <span className="block text-xs text-ink-3">{countOf(id)}</span>
            </span>
          </SelectCard>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr] gap-5">
        <div className="-m-1 flex min-h-0 flex-col gap-2 overflow-y-auto p-1">
          {VIEWS[kind].length > 1 && (
            <Segmented
              label="Overlay view"
              value={selected.id}
              onChange={(id) => setViews((current) => ({ ...current, [kind]: id as ViewId }))}
              options={VIEWS[kind].map(({ id, label }) => ({ value: id, label }))}
            />
          )}
          <div className="flex gap-1.5">
            <Input readOnly value={selected.url} aria-label="Overlay URL" className="text-xs" />
            <CopyUrlButton url={selected.url} label="Copy" />
          </div>
          <p className="flex items-center justify-between text-xs text-ink-3">
            OBS browser source
            <span className="font-medium tabular-nums text-ink-2">
              {sourceWidth} x {sourceHeight}
            </span>
          </p>
          <div className="divide-y divide-line">
            {isMatchScore && (
              <>
                <SettingRow compact label="Look">
                  <div className="w-full">
                    <Segmented small label="Look" value={settings.MatchLayout} onChange={(MatchLayout) => void change({ MatchLayout: MatchLayout as api.DisplayerSettings["MatchLayout"] })} options={MATCH_LAYOUTS} />
                  </div>
                </SettingRow>
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
              </>
            )}
            {kind === "match" && selected.id === "maps" && (
              <StyleControls style={settings.MapsStyle} onChange={(update) => void change({ MapsStyle: { ...settings.MapsStyle, ...update } })} />
            )}
            {kind === "ranked" && (
              <StyleControls style={ranked[rankedStyle]} onChange={(update) => void changeRanked({ [rankedStyle]: { ...ranked[rankedStyle], ...update } })} />
            )}
            {kind === "broadcast" && (
              <>
                <SettingRow compact label="Look">
                  <div className="w-full">
                    <Segmented small label="Look" value={broadcast.look} onChange={(look) => changeBroadcast({ look: look as api.BroadcastStyle["look"] })} options={BROADCAST_LOOKS} />
                  </div>
                </SettingRow>
                <SettingRow compact label="Point animation">
                  <div className="w-full">
                    <Segmented small label="Point animation" value={broadcast.pointAnimation} onChange={(pointAnimation) => changeBroadcast({ pointAnimation: pointAnimation as api.BroadcastStyle["pointAnimation"] })} options={POINT_ANIMATIONS} />
                  </div>
                </SettingRow>
                <SettingRow compact label="Single title" hint="One title above all matches">
                  <Switch aria-label="Single title" checked={broadcast.singleTitle} onCheckedChange={(singleTitle) => changeBroadcast({ singleTitle })} />
                </SettingRow>
                {broadcast.singleTitle && (
                  <SettingRow compact label="Title">
                    <Input
                      value={broadcast.title}
                      maxLength={80}
                      aria-label="Title"
                      placeholder="First match's tournament"
                      className="text-xs"
                      onChange={(event) => setBroadcast({ ...broadcast, title: event.target.value })}
                      onBlur={() => void saveBroadcast(broadcast)}
                    />
                  </SettingRow>
                )}
              </>
            )}
          </div>
        </div>
        <OverlayPreview
          src={`${selected.preview}${sampleQuery}`}
          width={sourceWidth}
          height={sourceHeight}
          label={
            <div className="flex gap-2">
              <div className="w-44">
                <Segmented small label="Preview data" value={previewData} onChange={setPreviewData} options={PREVIEW_DATA} />
              </div>
              {kind === "broadcast" && previewData === "sample" && (
                <div className="w-28">
                  <Segmented small label="Sample matches" value={sampleCount} onChange={setSampleCount} options={SAMPLE_COUNTS} />
                </div>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}

export default Overlay;
