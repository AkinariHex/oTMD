import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { toast } from "sonner";
import MatchCard from "@/Components/MatchCard/MatchCard";
import { Skeleton } from "@/Components/ui/skeleton";
import * as api from "@/lib/api";
import { buildFeed, KIND, kindOf, type FeedItem, type MatchKind } from "@/lib/matchFeed";
import { addRankedRooms, onOpenRoom } from "@/lib/rankedRooms";
import { useScrollThumb } from "@/lib/scrollThumb";
import { cn } from "@/lib/utils";

const FIRST_PAGE: api.FeedCursor = { saved: 0, ranked: 0 };
const PAGE_SIZE = 20;
const MAX_REQUESTS_PER_LOAD = 6;
const PLACEHOLDER_CARDS = [0, 1, 2, 3];
const OVERSCAN_PX = 300;
const TOP_FADE_PX = 24;
const MAX_PAGES_TO_FIND = 5;
// A filter that hides most rows keeps reading pages until it has this many to show, or the feed ends.
const MIN_FILTERED_ROWS = 8;
const MAX_FILTER_PAGES = 3;

type Filter = "all" | MatchKind;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ranked", label: KIND.ranked.label },
  { value: "friendly", label: KIND.friendly.label },
  { value: "saved", label: "Saved Matches" },
];
const EMPTY: Record<Filter, string> = {
  all: "Matches you export and ranked matches you play will appear here.",
  ranked: "Ranked Play matches you play will appear here.",
  friendly: "Friendly Ranked matches can't be told apart from Ranked Play yet.",
  saved: "Matches you export will appear here.",
};

const days = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const DAY_MS = 86_400_000;
const dayOf = (item: FeedItem): string => {
  const time = Date.parse(item.date);
  if (Number.isNaN(time)) return "";
  const day = new Date(time).toDateString();
  if (day === new Date().toDateString()) return "Today";
  if (day === new Date(Date.now() - DAY_MS).toDateString()) return "Yesterday";
  return days.format(time);
};

// Inset by the 4px ring, so the list edge never clips the node.
function Node({ item }: { item: FeedItem }) {
  const kind = KIND[kindOf(item)];
  const Icon = kind.icon;
  return (
    <span className={cn("absolute top-8 left-1 z-10 flex size-5 -translate-y-1/2 items-center justify-center rounded-full ring-4 ring-app", kind.bg)}>
      <Icon aria-label={kind.label} size={11} strokeWidth={2.25} className="text-on-accent" />
    </span>
  );
}

function FilterChips({ value, onChange }: { value: Filter; onChange: (value: Filter) => void }) {
  return (
    <div role="radiogroup" aria-label="Show matches" className="flex flex-wrap gap-1.5">
      {FILTERS.map((option) => {
        const Icon = option.value === "all" ? null : KIND[option.value].icon;
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium ring-1 transition-[color,background-color,transform] duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.97]",
              active ? "bg-white/12 text-ink ring-white/20" : "text-ink-3 ring-line hover:text-ink-2"
            )}
          >
            {Icon && <Icon aria-hidden="true" size={12} strokeWidth={2} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function MatchCardSkeleton() {
  return (
    <div className="mb-1.5 ml-8 flex h-16 flex-col justify-center gap-1.5 rounded-lg bg-white/4 px-3 ring-1 ring-line">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-3 w-36" />
    </div>
  );
}

function Footer({ context }: { context?: { loadingMore: boolean; reachedEnd: boolean } }) {
  return (
    <>
      {context?.loadingMore && (
        <div role="status" aria-label="Loading more matches" className="flex h-8 items-center justify-center text-ink-3">
          <LoaderCircle size={16} strokeWidth={1.75} className="animate-spin" />
        </div>
      )}
      {context?.reachedEnd && <p className="flex h-8 items-center justify-center text-xs text-ink-3">No more matches to show</p>}
      <div className="h-3" />
    </>
  );
}

const VIRTUOSO_COMPONENTS = { Footer };

function RecentMatches() {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [openMatch, setOpenMatch] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const cursor = useRef<api.FeedCursor | null>(FIRST_PAGE);
  const busy = useRef(false);
  const seen = useRef(new Set<string>());
  const loaded = useRef<FeedItem[]>([]);
  const list = useRef<VirtuosoHandle>(null);
  const { thumb, showScrollThumb } = useScrollThumb();

  const loadNextPage = useCallback(async () => {
    if (busy.current || !cursor.current) return;
    busy.current = true;
    setLoadingMore(true);
    try {
      // Repeated or unreadable rows shrink a page, so keep reading until there are enough new cards to show.
      const fresh: FeedItem[] = [];
      for (let requests = 0; requests < MAX_REQUESTS_PER_LOAD && fresh.length < PAGE_SIZE && cursor.current; requests++) {
        const page: api.FeedPage = await api.getMatchFeed(cursor.current);
        cursor.current = page.next;
        addRankedRooms(page.rankedMatches);
        for (const item of buildFeed(page.matches, page.rankedMatches)) {
          if (seen.current.has(item.id)) continue;
          seen.current.add(item.id);
          fresh.push(item);
        }
      }
      if (fresh.length === 0) cursor.current = null;
      setReachedEnd(cursor.current === null);
      loaded.current = [...loaded.current, ...fresh];
      setItems(loaded.current);
    } catch {
      toast.error("Could not load your recent matches.");
      setItems((current) => current ?? []);
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadNextPage();
  }, [loadNextPage]);

  // The fade grows with the first pixels of scroll, so the first card is whole when the list is at the top.
  const handleScroll = useCallback(
    (event: UIEvent<HTMLElement>) => {
      showScrollThumb(event);
      event.currentTarget.style.setProperty("--top-fade", `${Math.min(event.currentTarget.scrollTop, TOP_FADE_PX)}px`);
    },
    [showScrollThumb]
  );

  // The rating chart asks for a room; older ones may sit a few pages further down.
  useEffect(
    () =>
      onOpenRoom(async (roomId) => {
        const id = `room-${roomId}`;
        const indexOf = () => loaded.current.findIndex((item) => item.id === id);
        for (let pages = 0; indexOf() < 0 && pages < MAX_PAGES_TO_FIND; pages++) {
          // A load already running (the first page, or a scroll) must finish before asking for more.
          while (busy.current) await new Promise((resolve) => setTimeout(resolve, 100));
          if (indexOf() >= 0 || !cursor.current) break;
          await loadNextPage();
        }
        const index = indexOf();
        if (index < 0) {
          toast.error("Could not find this match in your recent matches.");
          return;
        }
        // The full list, so a filter can never hide the match asked for and the index matches.
        setFilter("all");
        setOpenMatch(id);
        // Next frame, so a page loaded just now is already in the list.
        requestAnimationFrame(() => list.current?.scrollToIndex({ index, align: "start", behavior: "smooth" }));
      }),
    [loadNextPage]
  );

  const toggleMatch = useCallback((id: string) => setOpenMatch((current) => (current === id ? null : id)), []);

  const shown = useMemo(() => (items === null || filter === "all" ? items : items.filter((item) => kindOf(item) === filter)), [items, filter]);

  // Bounded per filter change, so a filter with nothing to match never walks the whole feed.
  const filterPages = useRef(0);
  useEffect(() => {
    filterPages.current = 0;
  }, [filter]);
  useEffect(() => {
    if (shown === null || shown.length >= MIN_FILTERED_ROWS || !cursor.current || busy.current || filterPages.current >= MAX_FILTER_PAGES) return;
    filterPages.current++;
    void loadNextPage();
  }, [shown, loadNextPage]);

  // A timeline: a date heading starts each day, and the rail runs from node to node inside a day.
  const renderItem = useCallback(
    (index: number, item: FeedItem) => {
      const day = dayOf(item);
      const firstOfDay = index === 0 || dayOf(shown![index - 1]) !== day;
      const lastOfDay = index === shown!.length - 1 || dayOf(shown![index + 1]) !== day;
      return (
        <div className="px-px pt-px pb-1.5">
          {firstOfDay && day && <h3 className={cn("pb-1.5 text-caption font-semibold tracking-wide text-ink-3 uppercase", index > 0 && "pt-2")}>{day}</h3>}
          <div className="relative pl-8">
            {!(firstOfDay && lastOfDay) && (
              <span aria-hidden="true" className={cn("absolute left-3.5 w-px bg-line", firstOfDay ? "top-8" : "top-0", lastOfDay ? "h-8" : "-bottom-1.5")} />
            )}
            <Node item={item} />
            <MatchCard item={item} open={openMatch === item.id} onToggle={toggleMatch} />
          </div>
        </div>
      );
    },
    [openMatch, toggleMatch, shown]
  );

  return (
    <section className="flex min-h-0 min-w-0 flex-col gap-2">
      <div className="flex shrink-0 flex-col gap-2">
        <h2 className="text-xs font-medium text-ink-3">Recent matches</h2>
        <FilterChips value={filter} onChange={setFilter} />
      </div>
      {/* The negative margin cancels the page padding, so cards are cut by the edge of the app. */}
      <div className="relative -mb-5 min-h-0 flex-1">
        {items === null && PLACEHOLDER_CARDS.map((card) => <MatchCardSkeleton key={card} />)}
        {shown?.length === 0 && !loadingMore && <p className="py-2 text-xs text-ink-3">{EMPTY[filter]}</p>}
        {shown !== null && shown.length > 0 && (
          <Virtuoso
            ref={list}
            data={shown}
            context={{ loadingMore, reachedEnd }}
            components={VIRTUOSO_COMPONENTS}
            computeItemKey={(_index, item) => item.id}
            itemContent={renderItem}
            endReached={() => void loadNextPage()}
            increaseViewportBy={OVERSCAN_PX}
            onScroll={handleScroll}
            className="no-scrollbar h-full [mask-image:linear-gradient(to_bottom,transparent,black_var(--top-fade,0px))]"
          />
        )}
        <div ref={thumb} aria-hidden="true" className="pointer-events-none absolute top-0 -right-3 mb-5 w-1 rounded-full bg-white/35 opacity-0 transition-opacity duration-150" />
      </div>
    </section>
  );
}

export default RecentMatches;
