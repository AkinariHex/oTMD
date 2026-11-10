import { Plus, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import CopyUrlButton from "@/Components/CopyUrlButton/CopyUrlButton";
import PageHeader from "@/Components/PageHeader/PageHeader";
import { Button } from "@/Components/ui/button";
import { Input } from "@/Components/ui/input";
import { Segmented } from "@/Components/ui/segmented";
import { Select } from "@/Components/ui/select";
import { Switch } from "@/Components/ui/switch";
import * as api from "@/lib/api";
import { isLobbyId, parseLobbyLink } from "@/lib/lobby";

const MAX_MATCHES = 8;
const SAVE_FAILED = "Could not save the broadcast list.";
const STAGES = [
  ["Friendly", "Friendly"],
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
const STATUS_LABEL = { loading: "Loading", live: "Live", finished: "Finished", error: "Lobby unavailable" };
const STATUS_DOT = { loading: "bg-ink-3", live: "bg-win", finished: "bg-ink-3", error: "bg-loss" };

const newMatch = (MatchID: string): api.BroadcastMatch => ({ MatchID, MatchType: "1vs1", Stage: "Friendly", BestOF: "9", Warmups: "0", ScoreReverse: false });

function MatchRow({ match, card, onChange, onRemove }: { match: api.BroadcastMatch; card?: api.BroadcastCard; onChange: (update: Partial<api.BroadcastMatch>) => void; onRemove: () => void }) {
  const status = card?.status ?? "loading";
  const hasNames = card && card.sides[0].name !== "";

  return (
    <li className="flex flex-col gap-2 rounded-lg bg-black/20 p-3 ring-1 ring-line">
      <div className="flex items-center gap-3">
        <span className="flex w-32 shrink-0 items-center gap-1.5 text-xs font-medium text-ink-2">
          <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
          {STATUS_LABEL[status]}
        </span>
        <span className="min-w-0 flex-1 truncate text-ui font-semibold text-ink tabular-nums">
          {hasNames ? `${card.sides[0].name} ${card.sides[0].score} - ${card.sides[1].score} ${card.sides[1].name}` : `Match ${match.MatchID}`}
        </span>
        <CopyUrlButton url={`${api.BROADCAST_URL}?matches=${match.MatchID}`} label="Copy URL" className="h-6 px-2 text-xs" />
        <button
          type="button"
          aria-label={`Remove match ${match.MatchID}`}
          onClick={onRemove}
          className="grid size-6 place-items-center rounded text-ink-3 outline-none transition-colors duration-150 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
      <div className="grid grid-cols-[9.5rem_minmax(0,1fr)_6.5rem_5rem_auto] items-center gap-2">
        <Segmented small label="Match type" value={match.MatchType} onChange={(MatchType) => onChange({ MatchType })} options={MATCH_TYPES} />
        <Select label="Stage" value={match.Stage} onChange={(Stage) => onChange({ Stage })} options={STAGES} />
        <Select label="Best of" value={match.BestOF} onChange={(BestOF) => onChange({ BestOF })} options={BEST_OF} />
        <Input type="number" min={0} max={20} value={match.Warmups} aria-label="Warmups" title="Warmups" onChange={(event) => onChange({ Warmups: event.target.value })} />
        <label className="flex items-center gap-2 text-xs font-medium text-ink-2">
          Reverse
          <Switch aria-label="Reverse sides" checked={match.ScoreReverse} onCheckedChange={(ScoreReverse) => onChange({ ScoreReverse })} />
        </label>
      </div>
    </li>
  );
}

function Broadcast() {
  const [status, setStatus] = useState<api.BroadcastStatus | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const next = await api.getBroadcastStatus();
        if (active) setStatus(next);
      } catch {
        toast.error("Could not load the broadcast list.");
      }
    };
    void load();
    const stop = api.onOverlayChanged(() => void load());
    return () => {
      active = false;
      stop();
    };
  }, []);

  if (!status) return null;

  const save = async (matches: api.BroadcastMatch[]) => {
    setStatus({ ...status, matches });
    // An unfinished number stays on screen and is saved once it is valid again.
    if (matches.some(({ Warmups }) => !/^\d+$/.test(Warmups) || Number(Warmups) > 20)) return;
    try {
      await api.saveBroadcastMatches(matches);
    } catch {
      toast.error(SAVE_FAILED);
    }
  };

  const add = (event: FormEvent) => {
    event.preventDefault();
    const id = parseLobbyLink("match", draft) ?? draft.trim();
    if (!isLobbyId(id)) {
      toast.error("Enter a valid match ID or link.");
      return;
    }
    if (status.matches.some(({ MatchID }) => MatchID === id)) {
      toast.error("That match is already in the list.");
      return;
    }
    setDraft("");
    void save([...status.matches, newMatch(id)]);
  };

  const toggle = async () => {
    try {
      const ownTracking = !status.enabled && ((await api.getRankedStatus()).enabled || (await api.getMatchSettings()).MatchID !== "");
      await api.setBroadcastEnabled(!status.enabled);
      setStatus({ ...status, enabled: !status.enabled });
      if (ownTracking) toast.info("Your own match tracking stopped.");
    } catch {
      toast.error(SAVE_FAILED);
    }
  };

  const cardOf = (id: string) => status.view?.find(({ matchId }) => matchId === id);
  const full = status.matches.length >= MAX_MATCHES;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PageHeader title="Broadcast" description="Show live results of up to 8 matches you are streaming" />
      <div className="flex items-center gap-2">
        <form onSubmit={add} className="flex min-w-0 flex-1 gap-2">
          <Input value={draft} disabled={full} aria-label="Match ID or link" placeholder={full ? "The list is full" : "Match ID or link"} spellCheck={false} onChange={(event) => setDraft(event.target.value)} />
          <Button type="submit" disabled={full} className="shrink-0 gap-1.5">
            <Plus size={14} strokeWidth={1.75} />
            Add
          </Button>
        </form>
        <Button tone={status.enabled ? "danger" : "primary"} disabled={!status.enabled && status.matches.length === 0} onClick={() => void toggle()} className="w-36 shrink-0">
          {status.enabled ? "Stop broadcast" : "Start broadcast"}
        </Button>
      </div>
      {status.matches.length === 0 ? (
        <p className="py-2 text-xs text-ink-3">Add the matches you want on stream. They are never exported to your account.</p>
      ) : (
        <ul className="-m-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1">
          {status.matches.map((match, index) => (
            <MatchRow
              key={match.MatchID}
              match={match}
              card={status.enabled ? cardOf(match.MatchID) : undefined}
              onChange={(update) => void save(status.matches.map((other, position) => (position === index ? { ...other, ...update } : other)))}
              onRemove={() => void save(status.matches.filter((_, position) => position !== index))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default Broadcast;
