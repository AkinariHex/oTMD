import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type UIEvent } from "react";
import { Virtuoso } from "react-virtuoso";
import { toast } from "sonner";
import MatchCard from "@/Components/MatchCard/MatchCard";
import { Skeleton } from "@/Components/ui/skeleton";
import * as api from "@/lib/api";
import { buildFeed, type FeedItem } from "@/lib/matchFeed";
import { useScrollThumb } from "@/lib/scrollThumb";

const FIRST_PAGE: api.FeedCursor = { saved: 0, ranked: 0 };
const PAGE_SIZE = 20;
const MAX_REQUESTS_PER_LOAD = 6;
const PLACEHOLDER_CARDS = [0, 1, 2, 3];
const OVERSCAN_PX = 300;
const TOP_FADE_PX = 24;

function MatchCardSkeleton() {
  return (
    <div className="mx-px mb-2 rounded-lg bg-black/20 p-3 ring-1 ring-line">
      <div className="flex justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-36" />
      </div>
      <div className="mt-5 flex items-center justify-center gap-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-5 w-32" />
      </div>
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
  const cursor = useRef<api.FeedCursor | null>(FIRST_PAGE);
  const busy = useRef(false);
  const seen = useRef(new Set<string>());
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
        for (const item of buildFeed(page.matches, page.rankedMatches)) {
          if (seen.current.has(item.id)) continue;
          seen.current.add(item.id);
          fresh.push(item);
        }
      }
      if (fresh.length === 0) cursor.current = null;
      setReachedEnd(cursor.current === null);
      setItems((current) => [...(current ?? []), ...fresh]);
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

  const toggleMatch = useCallback((id: string) => setOpenMatch((current) => (current === id ? null : id)), []);

  const renderItem = useCallback(
    (_index: number, item: FeedItem) => (
      <div className="px-px pt-px pb-2">
        <MatchCard item={item} open={openMatch === item.id} onToggle={toggleMatch} />
      </div>
    ),
    [openMatch, toggleMatch]
  );

  return (
    <section className="flex min-h-0 min-w-0 flex-col gap-2">
      <h2 className="shrink-0 text-xs font-medium text-ink-3">Recent matches</h2>
      {/* The negative margin cancels the page padding, so cards are cut by the edge of the app. */}
      <div className="relative -mb-5 min-h-0 flex-1">
        {items === null && PLACEHOLDER_CARDS.map((card) => <MatchCardSkeleton key={card} />)}
        {items?.length === 0 && <p className="py-2 text-xs text-ink-3">Matches you export and ranked matches you play will appear here.</p>}
        {items !== null && items.length > 0 && (
          <Virtuoso
            data={items}
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
