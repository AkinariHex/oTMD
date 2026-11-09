import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import CopyUrlButton from "@/Components/CopyUrlButton/CopyUrlButton";
import OverlayPreview from "@/Components/OverlayPreview/OverlayPreview";
import PageHeader from "@/Components/PageHeader/PageHeader";
import { Button } from "@/Components/ui/button";
import { Input } from "@/Components/ui/input";
import { Segmented } from "@/Components/ui/segmented";
import { Select } from "@/Components/ui/select";
import { Switch } from "@/Components/ui/switch";
import * as api from "@/lib/api";
import { isLobbyId, parseLobbyLink } from "@/lib/lobby";

const QUALIFIERS = "Qualifiers";
const STAGES = [
  ["Friendly", "Friendly"],
  [QUALIFIERS, QUALIFIERS],
  ["Round of 128", "Round of 128"],
  ["Round of 64", "Round of 64"],
  ["Round of 32", "Round of 32"],
  ["Round of 16", "Round of 16"],
  ["Quarterfinals", "Quarterfinals"],
  ["Semifinals", "Semifinals"],
  ["Finals", "Finals"],
  ["Grandfinals", "Grand Finals"],
].map(([value, label]) => ({ value, label }));
const BEST_OF = ["3", "5", "7", "9", "11", "13", "15", "17", "19", "21"].map((value) => ({ value, label: `BO${value}` }));
const MATCH_TYPES = [
  { value: "1vs1", label: "1vs1" },
  { value: "teamVS", label: "TeamVS" },
];
const SAVE_FAILED = "Could not save the match settings.";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-2">{label}</span>
      {children}
    </div>
  );
}

function StatusBadge({ tracking, finished }: { tracking: boolean; finished: boolean }) {
  const live = tracking && !finished;
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-white/8 px-2.5 text-xs font-medium text-ink-2">
      <span className={`size-2 rounded-full ${live ? "bg-win" : "bg-ink-3"}`} />
      {finished ? "Finished" : live ? "Live" : "Idle"}
    </span>
  );
}

function MatchSettings() {
  const [form, setForm] = useState<api.MatchSettings | null>(null);
  const [matchId, setMatchId] = useState("");
  const [tracking, setTracking] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const load = async () => {
      const settings = await api.getMatchSettings();
      setForm(settings);
      setMatchId(settings.MatchID);
      setTracking(settings.MatchID !== "");
      setFinished(settings.isFinished);
    };
    void load();

    return api.onOverlayChanged(() => {
      const refresh = async () => setFinished((await api.getMatchSettings()).isFinished);
      void refresh();
    });
  }, []);

  if (!form) return null;

  const isQualifiers = form.Stage === QUALIFIERS;

  // While tracking every field except the ID is live, so a match in progress can be corrected.
  const change = async (update: Partial<api.MatchSettings>) => {
    const next = { ...form, ...update };
    setForm(next);
    if (!tracking) return;
    try {
      await api.saveMatchSettings({ ...next, MatchID: matchId });
      setFinished(false);
    } catch {
      toast.error(SAVE_FAILED);
    }
  };

  const enterMatchId = (text: string) => {
    const id = parseLobbyLink("match", text);
    if (id) toast.success("Match link recognized");
    setMatchId(id ?? text);
  };

  const toggleTracking = async () => {
    if (!tracking && !isLobbyId(matchId)) {
      toast.error("Enter a valid match ID or link.");
      return;
    }
    try {
      const wasRanked = !tracking && (await api.getRankedStatus()).enabled;
      await api.saveMatchSettings({ ...form, MatchID: tracking ? "" : matchId, isFinished: false });
      setTracking(!tracking);
      setFinished(false);
      if (wasRanked) toast.info("Ranked tracking stopped.");
    } catch {
      toast.error(SAVE_FAILED);
    }
  };

  return (
    <div className="grid h-full grid-cols-[320px_1fr] gap-5">
      <div className="flex flex-col gap-4">
        <PageHeader title="Match" description="Set up the lobby to track" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Match ID">
            <Input value={matchId} disabled={tracking} aria-label="Match ID" placeholder="Match ID or link" spellCheck={false} onChange={(event) => enterMatchId(event.target.value)} />
          </Field>
          <Field label="Match type">
            <Segmented label="Match type" value={form.MatchType} onChange={(MatchType) => void change({ MatchType })} options={MATCH_TYPES} />
          </Field>
          <Field label="Stage">
            <Select label="Stage" value={form.Stage} onChange={(Stage) => void change({ Stage })} options={STAGES} />
          </Field>
          {isQualifiers ? (
            <Field label="N. of maps">
              <Input type="number" min={0} value={form.MapsNqualifiers} aria-label="Number of maps" onChange={(event) => void change({ MapsNqualifiers: event.target.value })} />
            </Field>
          ) : (
            <>
              <Field label="Best of">
                <Select label="Best of" value={form.BestOF} onChange={(BestOF) => void change({ BestOF })} options={BEST_OF} />
              </Field>
              <Field label="Warmups">
                <Input type="number" min={0} value={form.Warmups} aria-label="Warmups" onChange={(event) => void change({ Warmups: event.target.value })} />
              </Field>
              <div className="flex items-center justify-between gap-3 self-end pb-1.5">
                <span className="text-xs font-medium text-ink-2">Reverse sides</span>
                <Switch aria-label="Reverse sides" checked={form.ScoreReverse} onCheckedChange={(ScoreReverse) => void change({ ScoreReverse })} />
              </div>
            </>
          )}
        </div>
        <Button tone={tracking ? "danger" : "primary"} onClick={() => void toggleTracking()} className="mt-auto w-full">
          {tracking ? "Stop tracking" : "Start tracking"}
        </Button>
      </div>
      <OverlayPreview
        label="Overlay preview"
        status={
          <div className="flex items-center gap-1.5">
            <CopyUrlButton url={api.OVERLAY_URL} label="Copy OBS URL" className="h-6 px-2 text-xs" />
            <StatusBadge tracking={tracking} finished={finished} />
          </div>
        }
      />
    </div>
  );
}

export default MatchSettings;
