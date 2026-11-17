import { Tooltip } from "@/Components/ui/tooltip";
import type { RankedResult } from "@/lib/api";
import { cn } from "@/lib/utils";

const LETTER = { win: "W", loss: "L", draw: "D" } as const;
const CHIP = { win: "bg-win", loss: "bg-loss", draw: "bg-ink-3" } as const;
const RESULT = { win: "Won", loss: "Lost", draw: "Draw" } as const;
const numbers = new Intl.NumberFormat("en-US");

// Recent results as W/L chips (oldest left) over the overall W/L split.
function RankedRecord({ history, wins, losses }: { history: RankedResult[]; wins: number; losses: number }) {
  const total = wins + losses;

  return (
    <div className="flex w-fit flex-col gap-1.5">
      {history.length > 0 && (
        <div className="flex gap-0.5">
          {[...history].reverse().map((match) => (
            <Tooltip key={match.roomId} content={`${RESULT[match.result]}, rating ${numbers.format(match.ratingAfter)}`}>
              <span
                tabIndex={0}
                className={cn("flex h-4 w-5 items-center justify-center rounded-sm text-[0.625rem] font-bold text-on-accent outline-none focus-visible:ring-2 focus-visible:ring-ink", CHIP[match.result])}
              >
                {LETTER[match.result]}
              </span>
            </Tooltip>
          ))}
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
