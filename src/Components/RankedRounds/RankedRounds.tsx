import { ChevronLeft, ChevronRight } from "lucide-react";
import Avatar from "@/Components/Avatar/Avatar";
import HealthBar from "@/Components/HealthBar/HealthBar";
import type { RankedMatch, RankedMatchRound, SideIndex } from "@/lib/api";
import { cn } from "@/lib/utils";

const SHADOW = "[text-shadow:0_1px_3px_rgb(0_0_0/0.8)]";
const numbers = new Intl.NumberFormat("en-US");

const lifeBefore = (match: RankedMatch, round: RankedMatchRound, side: SideIndex) => (round.round === 1 ? match.maxLife : match.rounds[round.round - 2].life[side]);

function RoundSide({ match, round, index }: { match: RankedMatch; round: RankedMatchRound; index: SideIndex }) {
  const won = round.winner === index;
  const player = match.players[index];

  return (
    <span className={cn("relative flex min-w-0 flex-col gap-0.5 text-xs", SHADOW)}>
      <span className={cn("flex items-center justify-between gap-2", won ? "text-ink" : "text-ink-2", index === 1 && "flex-row-reverse")}>
        <span className={cn("flex min-w-0 items-center gap-1", won ? "font-semibold" : "font-medium", index === 1 && "flex-row-reverse")}>
          <Avatar userId={player.id} username={player.username} size={16} />
          <span title={player.username} className="min-w-0 truncate">
            {player.username}
          </span>
        </span>
        <span className={cn("shrink-0 tabular-nums", won && "font-semibold")}>{numbers.format(round.scores[index])}</span>
      </span>
      <span className="px-1">
        <HealthBar life={round.life[index]} maxLife={match.maxLife} side={index} height={12} before={lifeBefore(match, round, index)} />
      </span>
    </span>
  );
}

// The chevron points at the player who lost the health. It is out of flow so the multiplier stays centered.
function RoundDamage({ round }: { round: RankedMatchRound }) {
  if (round.winner === null) return <span className={cn("relative text-center text-xs text-ink-2", SHADOW)}>Tie</span>;
  const pointsLeft = round.winner === 1;
  const Chevron = pointsLeft ? ChevronLeft : ChevronRight;

  return (
    <span className={cn("relative flex flex-col items-center text-xs tabular-nums", SHADOW)}>
      <span className="font-bold text-damage">-{numbers.format(round.damage)}</span>
      <span className="relative text-caption text-ink-2">
        x{round.multiplier}
        <Chevron aria-hidden="true" size={14} strokeWidth={2} className={cn("absolute top-1/2 -translate-y-1/2", pointsLeft ? "right-full mr-1" : "left-full ml-1")} />
      </span>
    </span>
  );
}

function RoundRow({ match, round }: { match: RankedMatch; round: RankedMatchRound }) {
  return (
    <div className="relative grid grid-cols-[minmax(0,1fr)_9.5rem_5.75rem_9.5rem] items-center gap-x-3 overflow-hidden px-3 py-2.5">
      {round.cover && <img src={round.cover} alt="" loading="lazy" draggable={false} className="absolute inset-y-0 left-0 h-full w-[62%] object-cover opacity-25 [mask-image:linear-gradient(to_right,black_25%,transparent)]" />}
      <span className={cn("relative block min-w-0", SHADOW)}>
        <span className="block truncate text-xs font-semibold text-ink">
          <span className="mr-1.5 text-ink-2 tabular-nums">{round.round}</span>
          {round.title}
        </span>
        <span className="block truncate text-caption text-ink">
          {round.version} - {round.stars.toFixed(2)} stars
        </span>
      </span>
      <RoundSide match={match} round={round} index={0} />
      <RoundDamage round={round} />
      <RoundSide match={match} round={round} index={1} />
    </div>
  );
}

function RankedRounds({ match }: { match: RankedMatch }) {
  return (
    <div className="divide-y divide-line">
      {match.rounds.map((round) => (
        <RoundRow key={round.round} match={match} round={round} />
      ))}
    </div>
  );
}

export default RankedRounds;
