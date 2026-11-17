import { ArrowRight } from "lucide-react";
import Avatar from "@/Components/Avatar/Avatar";
import type { RankedMatch, RankedResult } from "@/lib/api";
import { cn } from "@/lib/utils";

const numbers = new Intl.NumberFormat("en-US");
const signed = new Intl.NumberFormat("en-US", { signDisplay: "exceptZero" });
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const LABEL = { win: "Victory", loss: "Defeat", draw: "Draw" } as const;
const BAR = { win: "bg-win", loss: "bg-loss", draw: "bg-ink-3" } as const;
const TEXT = { win: "text-win", loss: "text-loss", draw: "text-ink-3" } as const;

// Opaque and lifted, so it stays readable over the match list and the header.
export const RANKED_TIP_CLASS = "rounded-md border border-white/12 bg-raised p-2.5 text-caption text-ink shadow-xl shadow-black/50";

function ago(date: Date): string {
  const hours = Math.round((date.getTime() - Date.now()) / 3_600_000);
  return Math.abs(hours) < 24 ? relative.format(hours, "hour") : relative.format(Math.round(hours / 24), "day");
}

// Tooltip body for one ranked match. room comes from the match feed, when the app tracked it.
function RankedResultCard({ match, previous, room }: { match: RankedResult; previous?: number; room?: RankedMatch }) {
  const date = new Date(match.date);
  const delta = previous != null ? match.ratingAfter - previous : null;
  const [me, opponent] = room?.players ?? [];

  return (
    <div className="flex w-52 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className={cn("w-0.5 self-stretch rounded-full", BAR[match.result])} />
        {opponent && <Avatar userId={opponent.id} username={opponent.username} size={24} />}
        <div className="min-w-0 flex-1">
          <div className={cn("text-xs font-semibold", TEXT[match.result])}>{LABEL[match.result]}</div>
          <div className="truncate text-ink-3">{opponent ? `vs ${opponent.username}` : "Match details unavailable"}</div>
        </div>
        {me && opponent && (
          <span className="text-sm font-bold tabular-nums text-ink">
            {me.roundsWon}-{opponent.roundsWon}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1.5 tabular-nums">
        <span className="text-ink-3">{previous != null ? numbers.format(previous) : "-"}</span>
        <ArrowRight size={12} strokeWidth={1.75} className="text-ink-3" />
        <span className="font-semibold text-ink">{numbers.format(match.ratingAfter)}</span>
        {delta != null && <span className={cn("ml-auto font-semibold", TEXT[match.result])}>{signed.format(delta)}</span>}
      </div>
      <div className="flex justify-between text-ink-3">
        <span>{ago(date)}</span>
        <span>{dateTime.format(date)}</span>
      </div>
      {room && <div className="border-t border-line pt-1.5 text-center text-ink-3">Click to open the match</div>}
    </div>
  );
}

export default RankedResultCard;
