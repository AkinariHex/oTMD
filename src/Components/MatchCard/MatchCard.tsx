import { memo, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, Trophy } from "lucide-react";
import Avatar from "@/Components/Avatar/Avatar";
import RankedRounds from "@/Components/RankedRounds/RankedRounds";
import type { MatchSide } from "@/lib/api";
import { KIND, kindOf, type FeedItem, type SavedFeedItem } from "@/lib/matchFeed";
import { useRatingChange } from "@/lib/rankedRooms";
import { cn } from "@/lib/utils";

const time = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" });
const signed = new Intl.NumberFormat("en-US", { signDisplay: "exceptZero" });
const SLANT = 10;

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

const IMAGE = "size-full object-cover opacity-45 transition-opacity duration-150 ease-out group-hover:opacity-60";

// The maps (or the tournament banner) fill the whole card behind a scrim that keeps the text readable.
function Backdrop({ item }: { item: FeedItem }) {
  const covers = item.kind === "ranked" ? item.match.rounds.flatMap((round) => (round.cover ? [round.cover] : [])) : [];
  const banner = safeBanner(item.banner);

  return (
    <>
      <span aria-hidden="true" className="absolute inset-0">
        {covers.map((cover, index) => (
          <span key={index} className="absolute inset-y-0" style={sliceStyle(index, covers.length)}>
            <img src={cover} alt="" loading="lazy" draggable={false} className={IMAGE} />
          </span>
        ))}
        {covers.length === 0 && banner && <img src={banner} alt="" loading="lazy" draggable={false} referrerPolicy="no-referrer" className={IMAGE} />}
        {covers.length === 0 && !banner && (
          <span className="flex size-full items-center justify-end gap-1.5 bg-gradient-to-l from-(--tier-patron)/15 to-transparent pr-10 text-(--tier-patron)">
            <Trophy size={14} strokeWidth={1.75} />
            <span className="text-sm font-bold tracking-tight">{item.acronym}</span>
          </span>
        )}
      </span>
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-app/95 via-app/70 to-app/10" />
    </>
  );
}

function EntryText({ item }: { item: FeedItem }) {
  const kind = KIND[kindOf(item)];
  const ratingChange = useRatingChange(item.kind === "ranked" ? item.match.roomId : null);
  const result = item.won === null ? "none" : item.won ? "win" : "loss";
  const opponent = item.kind === "ranked" ? `vs ${item.match.players[1].username}` : `${item.sides[0].name} vs ${item.sides[1].name}`;
  const date = Date.parse(item.date);

  return (
    <span className="relative min-w-0 flex-1">
      <span className="flex items-baseline gap-2">
        <span className={cn("shrink-0 text-sm font-semibold", result === "win" ? "text-win" : result === "loss" ? "text-loss" : "text-ink-2")}>
          {result === "win" ? "Victory" : result === "loss" ? "Defeat" : "Finished"}
        </span>
        <span title={opponent} className="min-w-0 truncate text-sm text-ink">
          {opponent}
        </span>
        <span className="shrink-0 text-sm font-bold tabular-nums text-ink-2">
          {item.sides[0].score}-{item.sides[1].score}
        </span>
      </span>
      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-caption text-ink-3">
        <span className={cn("truncate", kind.text)}>{item.kind === "saved" ? item.title : kind.label}</span>
        {item.stage && <span className="shrink-0">{item.stage}</span>}
        {!Number.isNaN(date) && <span className="shrink-0">{time.format(date)}</span>}
        {ratingChange !== null && <span className={cn("shrink-0 font-semibold tabular-nums", ratingChange >= 0 ? "text-win" : "text-loss")}>{signed.format(ratingChange)}</span>}
      </span>
    </span>
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

// The header is h-16: the timeline node in RecentMatches sits on its middle.
const HEADER = "group relative flex h-16 w-full items-center gap-3 overflow-hidden px-3 text-left";

function MatchCard({ item, open, onToggle }: { item: FeedItem; open: boolean; onToggle: (id: string) => void }) {
  const expandable = canExpand(item);
  const panelId = `panel-${item.id}`;
  // The panel holds up to a dozen images, so it only exists once someone has asked to see it.
  const [panelRendered, setPanelRendered] = useState(open);
  if (open && !panelRendered) setPanelRendered(true);

  if (!expandable) {
    return (
      <article className="overflow-hidden rounded-lg bg-white/4 ring-1 ring-line">
        <div className={HEADER}>
          <Backdrop item={item} />
          <EntryText item={item} />
        </div>
      </article>
    );
  }

  return (
    <article className="overflow-hidden rounded-lg bg-white/4 ring-1 ring-line">
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => onToggle(item.id)} className={cn(HEADER, "outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-inset")}>
        <Backdrop item={item} />
        <EntryText item={item} />
        <ChevronDown aria-hidden="true" size={14} strokeWidth={1.75} className={cn("relative shrink-0 text-ink-2 transition-transform duration-200 ease-out", open && "rotate-180")} />
      </button>
      <Collapse open={open} id={panelId}>
        {panelRendered && <div className="border-t border-line">{item.kind === "ranked" ? <RankedRounds match={item.match} /> : <Rosters item={item} />}</div>}
      </Collapse>
    </article>
  );
}

export default memo(MatchCard);
