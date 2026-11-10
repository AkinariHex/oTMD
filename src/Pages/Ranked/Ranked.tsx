import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
import { toast } from "sonner";
import CopyUrlButton from "@/Components/CopyUrlButton/CopyUrlButton";
import OverlayPreview from "@/Components/OverlayPreview/OverlayPreview";
import PageHeader from "@/Components/PageHeader/PageHeader";
import { Button } from "@/Components/ui/button";
import { Input } from "@/Components/ui/input";
import * as api from "@/lib/api";
import { isLobbyId, parseLobbyLink } from "@/lib/lobby";
import { HEALTH_HEIGHT, withPadding } from "@/lib/overlays";
import { cn } from "@/lib/utils";

const RECENT_ROUNDS = 5;
const numbers = new Intl.NumberFormat("en-US");

function statusText(status: api.RankedStatus, roomId: string): string {
  if (!status.enabled) return "Tracking is off";
  const { view } = status;
  if (!view) return roomId ? `Waiting for room ${roomId}` : "Looking for your ranked room";
  if (view.status === "ended") return `Room ${view.roomId} has ended`;
  return `Room ${view.roomId}, round ${view.round}`;
}

function Ranked() {
  const [settings, setSettings] = useState<api.RankedSettings | null>(null);
  const [status, setStatus] = useState<api.RankedStatus | null>(null);
  const [roomInput, setRoomInput] = useState("");
  const [useManualRoom, setUseManualRoom] = useState(false);

  useEffect(() => {
    const refresh = async () => setStatus(await api.getRankedStatus());
    const load = async () => {
      const loaded = await api.getRankedSettings();
      setSettings(loaded);
      setRoomInput(loaded.RoomID);
      setUseManualRoom(loaded.RoomID !== "");
      await refresh();
    };
    void load();
    return api.onOverlayChanged(() => void refresh());
  }, []);

  if (!settings || !status) return null;

  const saveRoom = async (RoomID: string) => {
    const next = { ...settings, RoomID };
    setSettings(next);
    try {
      await api.saveRankedSettings(next);
    } catch {
      toast.error("Could not save the room.");
    }
  };

  const enterRoom = (text: string) => {
    const id = parseLobbyLink("room", text);
    if (id) toast.success("Room link recognized");
    const value = id ?? text;
    setRoomInput(value);
    if (isLobbyId(value)) void saveRoom(value);
  };

  const toggleManualRoom = () => {
    if (useManualRoom) {
      setRoomInput("");
      void saveRoom("");
    }
    setUseManualRoom(!useManualRoom);
  };

  const toggleTracking = async () => {
    try {
      const wasTrackingMatch = !status.enabled && (await api.getMatchSettings()).MatchID !== "";
      await api.setRankedEnabled(!status.enabled);
      setStatus(await api.getRankedStatus());
      if (wasTrackingMatch) toast.info("Match tracking stopped.");
    } catch {
      toast.error("Could not change ranked tracking.");
    }
  };

  const live = status.enabled && status.view?.status === "live";
  const rounds = status.view?.rounds.slice(-RECENT_ROUNDS).reverse() ?? [];
  const nameOf = (id: number) => status.view?.players.find((player) => player.id === id)?.username ?? "";
  const loserOf = (winner: number | null) => status.view?.players.find((player) => winner !== null && player.id !== winner)?.id;

  return (
    <div className="grid h-full grid-cols-[320px_1fr] gap-5">
      <div className="flex min-h-0 flex-col gap-3">
        <PageHeader title="Ranked Play" description="Life points for osu!lazer ranked" />
        <div className="flex min-h-10 items-center gap-2 rounded-lg bg-white/4 px-3 py-2 ring-1 ring-line">
          <span className={cn("size-2 shrink-0 rounded-full", live ? "bg-win" : "bg-ink-3")} />
          <span className="min-w-0 flex-1 truncate text-ink-2">{statusText(status, settings.RoomID)}</span>
          <Button onClick={toggleManualRoom} className="h-6 px-2 text-xs">
            {useManualRoom ? "Find my room" : "Use another room"}
          </Button>
        </div>
        {useManualRoom && (
          <Input value={roomInput} aria-label="Room ID" placeholder="Room link or ID" spellCheck={false} onChange={(event) => enterRoom(event.target.value)} />
        )}
        {status.rulesOutdated && (
          <p role="status" className="flex items-start gap-2 text-xs text-loss">
            <CircleAlert size={14} strokeWidth={1.75} className="mt-px shrink-0" />
            The official ranked rules changed. Life points may be inaccurate until o!TMD is updated.
          </p>
        )}
        {status.view && rounds.length > 0 && (
          <section className="flex min-h-0 flex-col gap-1">
            <h2 className="text-xs font-medium text-ink-3">Recent rounds</h2>
            <div className="divide-y divide-line">
              {rounds.map((round) => (
                <div key={round.round} className="flex h-9 items-center gap-2 text-xs">
                  <span className="w-4 shrink-0 tabular-nums text-ink-3">{round.round}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{round.title}</span>
                  <span className="shrink-0 tabular-nums text-ink-2">
                    {round.winner === null ? "Tie" : `${nameOf(loserOf(round.winner) ?? 0)} -${numbers.format(round.damage)}`}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
        <Button tone={status.enabled ? "danger" : "primary"} onClick={() => void toggleTracking()} className="mt-auto w-full">
          {status.enabled ? "Stop tracking" : "Start tracking"}
        </Button>
      </div>
      <OverlayPreview
        src={status.view ? api.RANKED_PREVIEW_URL : `${api.RANKED_PREVIEW_URL}&sample=1`}
        height={withPadding(HEALTH_HEIGHT, settings.Health.padding)}
        clearWindowControls
        label={status.view ? "Overlay preview" : "Overlay preview (sample data)"}
        status={<CopyUrlButton url={api.RANKED_OVERLAY_URL} label="Copy OBS URL" className="h-6 px-2 text-xs" />}
      />
    </div>
  );
}

export default Ranked;
