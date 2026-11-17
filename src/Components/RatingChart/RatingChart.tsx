import { useId } from "react";
import { Tooltip } from "@/Components/ui/tooltip";
import type { RankedResult } from "@/lib/api";
import { cn } from "@/lib/utils";

const numbers = new Intl.NumberFormat("en-US");
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const RESULT = { win: "Won", loss: "Lost", draw: "Draw" } as const;
const DOT = { win: "bg-win", loss: "bg-loss", draw: "bg-ink-3" } as const;

function ago(date: string): string {
  const hours = Math.round((new Date(date).getTime() - Date.now()) / 3_600_000);
  return Math.abs(hours) < 24 ? relative.format(hours, "hour") : relative.format(Math.round(hours / 24), "day");
}

interface RatingChartProps {
  history: RankedResult[];
  colour: string;
  className?: string;
  // Dots stay inside this box (percent), so the fill can still bleed to the card edges.
  pointsRight?: number;
  pointsBottom?: number;
  // Dots left of this (percent) sit under other content and take no hover.
  hoverFrom?: number;
}

// Rating after each recent match, oldest on the left. Dots carry the result colour.
function RatingChart({ history, colour, className, pointsRight = 100, pointsBottom = 100, hoverFrom = 0 }: RatingChartProps) {
  const fillId = `rating-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const matches = [...history].reverse();
  if (matches.length < 2) return null;

  const ratings = matches.map((match) => match.ratingAfter);
  const low = Math.min(...ratings);
  const span = Math.max(...ratings) - low || 1;
  const xOf = (index: number) => (index / (matches.length - 1)) * pointsRight;
  const yOf = (rating: number) => 6 + ((Math.max(...ratings) - rating) / span) * (pointsBottom - 6);
  const line = `${ratings.map((rating, index) => `${index ? "L" : "M"}${xOf(index)},${yOf(rating)}`).join(" ")} L100,${yOf(ratings[ratings.length - 1])}`;
  const column = pointsRight / (matches.length - 1);

  return (
    <div className={cn("relative", className)}>
      <div className="chart-reveal absolute inset-0">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={colour} stopOpacity="0.28" />
              <stop offset="1" stopColor={colour} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L100,100 L0,100 Z`} fill={`url(#${fillId})`} />
          <path d={line} fill="none" stroke={colour} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        {matches.map((match, index) => (
          <span
            key={match.roomId}
            className={cn("absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-app", DOT[match.result])}
            style={{ left: `${xOf(index)}%`, top: `${yOf(match.ratingAfter)}%` }}
          />
        ))}
      </div>
      {matches.map(
        (match, index) =>
          xOf(index) >= hoverFrom && (
            <Tooltip key={match.roomId} content={`${RESULT[match.result]}, ${ago(match.date)}, rating ${numbers.format(match.ratingAfter)}`}>
              <span tabIndex={0} className="group absolute inset-y-0 -translate-x-1/2 outline-none" style={{ left: `${xOf(index)}%`, width: `${column}%` }}>
                <span className="absolute inset-y-0 left-1/2 w-px bg-ink-3/40 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-visible:opacity-100" />
                <span
                  className={cn(
                    "absolute left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 scale-50 rounded-full opacity-0 ring-2 ring-ink transition-[opacity,transform] duration-150 ease-out group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100",
                    DOT[match.result]
                  )}
                  style={{ top: `${yOf(match.ratingAfter)}%` }}
                />
              </span>
            </Tooltip>
          )
      )}
    </div>
  );
}

export default RatingChart;
