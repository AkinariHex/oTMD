import FloatingTip, { useFloatingTip } from "@/Components/FloatingTip/FloatingTip";
import RankedResultCard, { RANKED_TIP_CLASS } from "@/Components/RankedResultCard/RankedResultCard";
import type { RankedResult } from "@/lib/api";
import { requestOpenRoom, useRankedRooms } from "@/lib/rankedRooms";
import { cn } from "@/lib/utils";

const LETTER = { win: "W", loss: "L", draw: "D" } as const;
const CHIP = { win: "bg-win", loss: "bg-loss", draw: "bg-ink-3" } as const;

// Recent results as W/L chips (oldest left) over the overall W/L split.
function RankedRecord({ history, wins, losses }: { history: RankedResult[]; wins: number; losses: number }) {
  const total = wins + losses;
  const rooms = useRankedRooms();
  const { tip, show, hide } = useFloatingTip<number>();
  const matches = [...history].reverse();

  return (
    <div className="flex w-fit flex-col gap-1.5">
      {history.length > 0 && (
        <div className="flex gap-0.5" onPointerLeave={hide}>
          {matches.map((match, index) => {
            const openable = rooms.has(match.roomId);
            return (
              <span
                key={match.roomId}
                tabIndex={0}
                role={openable ? "button" : undefined}
                onPointerEnter={(event) => show(event.currentTarget, index)}
                onFocus={(event) => show(event.currentTarget, index)}
                onBlur={hide}
                onClick={openable ? () => requestOpenRoom(match.roomId) : undefined}
                onKeyDown={(event) => openable && (event.key === "Enter" || event.key === " ") && requestOpenRoom(match.roomId)}
                className={cn(
                  "flex h-4 w-5 items-center justify-center rounded-sm text-[0.625rem] font-bold text-on-accent outline-none focus-visible:ring-2 focus-visible:ring-ink",
                  CHIP[match.result],
                  openable && "cursor-pointer"
                )}
              >
                {LETTER[match.result]}
              </span>
            );
          })}
          <FloatingTip anchor={tip?.anchor ?? null} className={RANKED_TIP_CLASS}>
            {tip && <RankedResultCard match={matches[tip.data]} previous={matches[tip.data - 1]?.ratingAfter} room={rooms.get(matches[tip.data].roomId)} />}
          </FloatingTip>
        </div>
      )}
      {total > 0 && (
        <div className="flex min-w-44 flex-col gap-1">
          <div className="flex items-baseline gap-1.5 text-caption tabular-nums">
            <span className="font-semibold text-ink">{Math.round((wins / total) * 100)}%</span>
            <span className="text-ink-3">W/L</span>
            <span className="ml-auto text-win">{wins}W</span>
            <span className="text-loss">{losses}L</span>
          </div>
          <div className="flex h-1 gap-0.5">
            <span className="grow-x rounded-full bg-win" style={{ flexGrow: wins }} />
            <span className="grow-x grow-x-end rounded-full bg-loss" style={{ flexGrow: losses }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default RankedRecord;
