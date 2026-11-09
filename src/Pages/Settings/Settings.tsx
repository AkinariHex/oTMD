import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/Components/PageHeader/PageHeader";
import SettingRow from "@/Components/SettingRow/SettingRow";
import { Button } from "@/Components/ui/button";
import { Input } from "@/Components/ui/input";
import { Segmented } from "@/Components/ui/segmented";
import { SelectCard } from "@/Components/ui/select-card";
import { Switch } from "@/Components/ui/switch";
import * as api from "@/lib/api";
import { applyPreferences } from "@/lib/preferences";

const SITE_URL = "https://otmd.app";
// WKWebView offers no switch for GPU compositing.
const CAN_TOGGLE_HARDWARE_ACCELERATION = !navigator.userAgent.includes("Macintosh");
const TRAY_HINTS = {
  closeToTray: "X keeps o!TMD running in the tray",
  minimizeToTray: "Minimize sends o!TMD to the tray, X quits",
};
const TRAY_OPTIONS = [
  { value: "closeToTray", label: "Close to tray" },
  { value: "minimizeToTray", label: "Minimize to tray" },
];
const LAYOUTS: { id: api.Layout; name: string; hint: string }[] = [
  { id: "sidebar", name: "Sidebar", hint: "Grouped menu with connected sources" },
  { id: "tabs", name: "Tabs", hint: "Navigation in the title bar, more room for content" },
];

function LayoutThumbnail({ layout }: { layout: api.Layout }) {
  return (
    <svg viewBox="0 0 160 90" className="w-full rounded-md" aria-hidden="true">
      <rect width="160" height="90" fill="var(--app)" />
      {layout === "tabs" ? (
        <>
          {[0, 1, 2, 3].map((tab) => (
            <rect key={tab} x={8 + tab * 22} y="6" width="18" height="4" rx="2" fill={tab === 0 ? "var(--ink)" : "var(--ink-3)"} />
          ))}
          <rect y="16" width="160" height="74" fill="var(--panel)" />
          <rect x="10" y="26" width="52" height="7" rx="2" fill="var(--line)" />
          <rect x="10" y="38" width="52" height="7" rx="2" fill="var(--line)" />
          <rect x="10" y="50" width="52" height="7" rx="2" fill="var(--line)" />
          <rect x="10" y="72" width="52" height="8" rx="2" fill="var(--accent)" />
          <rect x="72" y="26" width="78" height="54" rx="3" fill="var(--app)" />
          <rect x="102" y="44" width="8" height="14" rx="1.5" fill="var(--loss)" />
          <rect x="113" y="44" width="8" height="14" rx="1.5" fill="var(--accent)" />
        </>
      ) : (
        <>
          <rect x="8" y="10" width="20" height="3" rx="1.5" fill="var(--ink)" />
          {[0, 1].map((item) => (
            <rect key={item} x="8" y={20 + item * 8} width={item === 0 ? 26 : 22} height="3" rx="1.5" fill={item === 0 ? "var(--ink)" : "var(--ink-3)"} />
          ))}
          <rect x="8" y="37" width="26" height="0.75" fill="var(--line)" />
          {[0, 1].map((item) => (
            <rect key={item} x="8" y={43 + item * 8} width="22" height="3" rx="1.5" fill="var(--ink-3)" />
          ))}
          <circle cx="10" cy="80" r="2" fill="var(--win)" />
          <rect x="15" y="78.5" width="20" height="3" rx="1.5" fill="var(--ink-3)" />
          <rect x="42" width="118" height="90" fill="var(--panel)" />
          <rect x="50" y="14" width="42" height="7" rx="2" fill="var(--line)" />
          <rect x="50" y="26" width="42" height="7" rx="2" fill="var(--line)" />
          <rect x="50" y="38" width="42" height="7" rx="2" fill="var(--line)" />
          <rect x="98" y="14" width="54" height="62" rx="3" fill="var(--app)" />
          <rect x="116" y="38" width="8" height="14" rx="1.5" fill="var(--loss)" />
          <rect x="127" y="38" width="8" height="14" rx="1.5" fill="var(--accent)" />
        </>
      )}
    </svg>
  );
}

function Settings() {
  const [settings, setSettings] = useState<api.AppSettings | null>(null);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const checkKey = async (apikey: string) => {
    setChecking(true);
    try {
      setKeyValid(await api.validateExportKey(apikey));
    } catch {
      setKeyValid(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      const loaded = await api.getAppSettings();
      setSettings(loaded);
      if (loaded.ExportMatches.apikey !== "") void checkKey(loaded.ExportMatches.apikey);
    };
    void load();
  }, []);

  if (!settings) return null;

  const change = async (update: Partial<api.AppSettings>) => {
    const next = { ...settings, ...update };
    setSettings(next);
    applyPreferences(next);
    try {
      await api.saveAppSettings(next);
    } catch {
      toast.error("Could not save the settings.");
    }
  };

  const { status, apikey } = settings.ExportMatches;

  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-3 pb-1">
      <PageHeader title="Settings" />
      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-medium text-ink-3">Layout</h2>
        <div role="radiogroup" aria-label="Layout" className="grid grid-cols-2 gap-2.5">
          {LAYOUTS.map((layout) => (
            <SelectCard key={layout.id} selected={settings.Layout === layout.id} onClick={() => void change({ Layout: layout.id })} className="flex items-center gap-3">
              <span className="block w-32 shrink-0">
                <LayoutThumbnail layout={layout.id} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-ink">{layout.name}</span>
                <span className="block text-xs text-ink-3">{layout.hint}</span>
              </span>
            </SelectCard>
          ))}
        </div>
      </section>
      <div className="divide-y divide-line">
        <SettingRow label="System tray" hint={TRAY_HINTS[settings.TrayBehavior]}>
          <Segmented
            label="System tray"
            value={settings.TrayBehavior}
            onChange={(value) => void change({ TrayBehavior: value as api.AppSettings["TrayBehavior"] })}
            options={TRAY_OPTIONS}
          />
        </SettingRow>
        <SettingRow label="Animations" hint="Motion in the interface">
          <Switch aria-label="Animations" checked={settings.Animations} onCheckedChange={(Animations) => void change({ Animations })} />
        </SettingRow>
        {CAN_TOGGLE_HARDWARE_ACCELERATION && (
          <SettingRow label="Hardware acceleration" hint="Takes effect the next time o!TMD starts">
            <Switch aria-label="Hardware acceleration" checked={settings.HardwareAcceleration} onCheckedChange={(HardwareAcceleration) => void change({ HardwareAcceleration })} />
          </SettingRow>
        )}
        <SettingRow label="Export matches" hint="Save finished matches to otmd.app">
          <Switch aria-label="Export matches" checked={status} onCheckedChange={(checked) => void change({ ExportMatches: { status: checked, apikey } })} />
        </SettingRow>
        <div className="flex flex-col gap-1.5 py-2">
          <div className="flex gap-1.5">
            <Input
              type="password"
              value={apikey}
              aria-label="o!TMD website API key"
              placeholder="o!TMD website API key"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setKeyValid(null);
                void change({ ExportMatches: { status, apikey: event.target.value } });
              }}
            />
            <Button disabled={checking || apikey === ""} onClick={() => void checkKey(apikey)} className="w-28">
              {checking ? <LoaderCircle size={14} strokeWidth={1.75} className="animate-spin" /> : "Check key"}
            </Button>
          </div>
          <p className="text-xs text-ink-3">
            {keyValid === true && <span className="text-win">The key is valid. </span>}
            {keyValid === false && <span className="text-loss">The key is not valid. </span>}
            Get it from the settings page on the{" "}
            <button type="button" className="font-medium text-accent" onClick={() => void api.openExternal(SITE_URL)}>
              website
            </button>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

export default Settings;
