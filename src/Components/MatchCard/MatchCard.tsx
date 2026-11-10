import { memo, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import Avatar from "@/Components/Avatar/Avatar";
import HealthBar from "@/Components/HealthBar/HealthBar";
import RankedRounds from "@/Components/RankedRounds/RankedRounds";
import TournamentChip from "@/Components/TournamentChip/TournamentChip";
import type { MatchSide, SideIndex } from "@/lib/api";
import type { FeedItem, RankedFeedItem, SavedFeedItem } from "@/lib/matchFeed";
import { cn } from "@/lib/utils";

const dates = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });
const FADE_TO_BOTTOM = "[mask-image:linear-gradient(to_bottom,black_20%,transparent)]";
const SLANT = 12;

function formatDate(value: string): string {
  const time = Date.parse(value);
  return Number.isNaN(time) ? "" : dates.format(time);
}

// Banners are URLs typed by tournament hosts, so anything that could reach the local network is refused.
function safeBanner(value: string | null): string | null {
  if (!value) return null;
  try {
    const { protocol, username, password, hostname, href } = new URL(value);
    const isPublicName = hostname.includes(".") && !hostname.startsWith("[") && !/^[\d.]+$/.test(hostname);
    return protocol === "https:" && !username && !password && isPublicName ? href : null;
  } catch {
    return null;
  }
}

// Every map gets the same width, measured at mid height, and neighbours meet on a / cut.
function sliceStyle(index: number, count: number): CSSProperties {
  const share = 100 / count;
  const topLeft = index === 0 ? "0" : `${SLANT * 2}px`;
  const bottomRight = index === count - 1 ? "100%" : `calc(100% - ${SLANT * 2}px)`;
  return {
    left: `calc(${index * share}% - ${SLANT}px)`,
    width: `calc(${share}% + ${SLANT * 2}px)`,
    clipPath: `polygon(${topLeft} 0, 100% 0, ${bottomRight} 100%, 0 100%)`,
  };
}

function MapSlices({ covers }: { covers: string[] }) {
  return (
    <span aria-hidden="true" className={cn("absolute inset-0 opacity-70", FADE_TO_BOTTOM)}>
      {covers.map((cover, index) => (
        <span key={index} data-map-slice className="absolute inset-y-0" style={sliceStyle(index, covers.length)}>
          <img src={cover} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
        </span>
      ))}
    </span>
  );
}

function nameTone(winner: boolean): string {
  return winner ? "font-semibold text-ink" : "font-medium text-ink-2";
}

function scoreTone(item: FeedItem, index: SideIndex): string {
  if (item.winner !== index) return "text-ink-2";
  if (item.won === null) return "text-ink";
  return item.won ? "text-win" : "text-loss";
}

function Score({ item, size, dash }: { item: FeedItem; size: string; dash: string }) {
  return (
    <span className={cn("flex items-center gap-1.5 leading-none font-bold tabular-nums", size)}>
      <span className={scoreTone(item, 0)}>{item.sides[0].score}</span>
      <span className={cn("font-medium text-ink-3", dash)}>-</span>
      <span className={scoreTone(item, 1)}>{item.sides[1].score}</span>
    </span>
  );
}

function RankedHeadSide({ item, index }: { item: RankedFeedItem; index: SideIndex }) {
  const { match } = item;
  const player = match.players[index];
  const final = match.rounds[match.rounds.length - 1];

  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className={cn("flex min-w-0 items-center gap-1.5 text-sm", nameTone(item.winner === index), index === 1 && "flex-row-reverse")}>
        <Avatar userId={player.id} username={player.username} size={22} />
        <span title={player.username} className="min-w-0 truncate">
          {player.username}
        </span>
      </span>
      <span className="px-1">
        <HealthBar life={final.life[index]} maxLife={match.maxLife} side={index} height={14} />
      </span>
    </span>
  );
}

function SavedSideName({ side, winner, align }: { side: MatchSide; winner: boolean; align: "left" | "right" }) {
  return (
    <span title={side.name} className={cn("block min-w-0 truncate text-sm", nameTone(winner), align === "right" ? "text-right" : "text-left")}>
      {side.name}
    </span>
  );
}

function CardHead({ item, open, expandable }: { item: FeedItem; open: boolean; expandable: boolean }) {
  const banner = safeBanner(item.banner);
  const details = [item.stage, formatDate(item.date)].filter(Boolean).join(" - ");

  return (
    <>
      {item.kind === "ranked" && <MapSlices covers={item.match.rounds.flatMap((round) => (round.cover ? [round.cover] : []))} />}
      {banner && <img src={banner} alt="" loading="lazy" draggable={false} referrerPolicy="no-referrer" className={cn("absolute inset-0 size-full object-cover opacity-70", FADE_TO_BOTTOM)} />}
      <span className="relative flex items-center gap-2 px-3 pt-2 text-xs">
        <TournamentChip full={item.title} short={item.acronym} />
        <span className="shrink-0 rounded bg-black/55 px-1.5 py-0.5 whitespace-nowrap text-ink-2 backdrop-blur-sm">{details}</span>
      </span>
      <span className="relative flex items-center gap-2 px-3 pt-5 pb-2.5">
        {item.kind === "ranked" ? (
          <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
            <RankedHeadSide item={item} index={0} />
            <Score item={item} size="text-2xl" dash="text-base" />
            <RankedHeadSide item={item} index={1} />
          </span>
        ) : (
          <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
            <SavedSideName side={item.sides[0]} winner={item.winner === 0} align="right" />
            <Score item={item} size="text-3xl" dash="text-lg" />
            <SavedSideName side={item.sides[1]} winner={item.winner === 1} align="left" />
          </span>
        )}
        <ChevronDown aria-hidden="true" size={14} strokeWidth={1.75} className={cn("shrink-0 text-ink-2 transition-transform duration-200 ease-out", open && "rotate-180", !expandable && "invisible")} />
      </span>
    </>
  );
}

function Roster({ side, best }: { side: MatchSide; best: number }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-right text-xs font-medium text-ink-3">Cost</div>
      {side.players.map((player) => (
        <div key={player.id} className="relative flex h-7 items-center gap-2 text-xs">
          <span aria-hidden="true" className="absolute inset-y-1 left-0 w-full origin-left rounded-sm bg-white/6" style={{ transform: `scaleX(${best > 0 ? player.cost / best : 0})` }} />
          <span className="relative pl-1">
            <Avatar userId={player.id} username={player.username} size={18} />
          </span>
          <span title={player.username} className="relative min-w-0 flex-1 truncate font-medium text-ink">
            {player.username}
          </span>
          <span className={cn("relative pr-1.5 tabular-nums", player.cost === best ? "font-semibold text-accent" : "text-ink-2")}>{player.cost.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function Rosters({ item }: { item: SavedFeedItem }) {
  const best = Math.max(...item.sides.flatMap((side) => side.players.map((player) => player.cost)));
  return (
    <div className="grid grid-cols-2 gap-5 px-3 py-2.5">
      <Roster side={item.sides[0]} best={best} />
      <Roster side={item.sides[1]} best={best} />
    </div>
  );
}

function Collapse({ open, id, children }: { open: boolean; id: string; children: ReactNode }) {
  return (
    <div id={id} data-open={open} className={cn("grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

const canExpand = (item: FeedItem): boolean => item.kind === "ranked" || item.sides.some((side) => side.players.length > 0);

function MatchCard({ item, open, onToggle }: { item: FeedItem; open: boolean; onToggle: (id: string) => void }) {
  const expandable = canExpand(item);
  const panelId = `panel-${item.id}`;
  // The panel holds up to a dozen images, so it only exists once someone has asked to see it.
  const [panelRendered, setPanelRendered] = useState(open);
  if (open && !panelRendered) setPanelRendered(true);

  if (!expandable) {
    return (
      <article className="relative overflow-hidden rounded-lg bg-black/20 ring-1 ring-line">
        <CardHead item={item} open={false} expandable={false} />
      </article>
    );
  }

  return (
    <article className="overflow-hidden rounded-lg bg-black/20 ring-1 ring-line">
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => onToggle(item.id)} className="relative block w-full outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-inset">
        <CardHead item={item} open={open} expandable />
      </button>
      <Collapse open={open} id={panelId}>
        {panelRendered && <div className="border-t border-line">{item.kind === "ranked" ? <RankedRounds match={item.match} /> : <Rosters item={item} />}</div>}
      </Collapse>
    </article>
  );
}

export default memo(MatchCard);
