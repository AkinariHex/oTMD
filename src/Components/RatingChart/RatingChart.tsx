import { useId } from "react";
import FloatingTip, { useFloatingTip } from "@/Components/FloatingTip/FloatingTip";
import RankedResultCard, { RANKED_TIP_CLASS } from "@/Components/RankedResultCard/RankedResultCard";
import type { RankedResult } from "@/lib/api";
import { requestOpenRoom, useRankedRooms } from "@/lib/rankedRooms";
import { cn } from "@/lib/utils";

const DOT = { win: "bg-win", loss: "bg-loss", draw: "bg-ink-3" } as const;

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
  const rooms = useRankedRooms();
  const { tip, show, hide } = useFloatingTip<number>();
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
    <div className={cn("relative", className)} onPointerLeave={hide}>
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
      {matches.map((match, index) => {
        if (xOf(index) < hoverFrom) return null;
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
            className={cn("group absolute inset-y-0 -translate-x-1/2 outline-none", openable && "cursor-pointer")}
            style={{ left: `${xOf(index)}%`, width: `${column}%` }}
          >
            <span className="absolute inset-y-0 left-1/2 w-px bg-ink-3/40 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-visible:opacity-100" />
            <span
              className={cn(
                "absolute left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 scale-50 rounded-full opacity-0 ring-2 ring-ink transition-[opacity,transform] duration-150 ease-out group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100",
                DOT[match.result]
              )}
              style={{ top: `${yOf(match.ratingAfter)}%` }}
            />
          </span>
        );
      })}
      <FloatingTip anchor={tip?.anchor ?? null} className={RANKED_TIP_CLASS}>
        {tip && <RankedResultCard match={matches[tip.data]} previous={matches[tip.data - 1]?.ratingAfter} room={rooms.get(matches[tip.data].roomId)} />}
      </FloatingTip>
    </div>
  );
}

export default RatingChart;
