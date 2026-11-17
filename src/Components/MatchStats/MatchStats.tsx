import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import Avatar from "@/Components/Avatar/Avatar";
import { Skeleton } from "@/Components/ui/skeleton";
import * as api from "@/lib/api";
import { KIND } from "@/lib/matchFeed";
import { useScrollThumb } from "@/lib/scrollThumb";
import { cn } from "@/lib/utils";

const numbers = new Intl.NumberFormat("en-US");

function Record({ wins, losses }: { wins: number; losses: number }) {
  return (
    <span className="shrink-0 text-caption tabular-nums">
      <span className="text-win">{wins}W</span>
      <span className="mx-1 text-ink-3">/</span>
      <span className="text-loss">{losses}L</span>
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-xs font-medium text-ink-3">{title}</h2>
      {children}
    </section>
  );
}

function Row({ lead, title, detail, trail }: { lead: ReactNode; title: string; detail: string; trail?: ReactNode }) {
  return (
    <div className="flex h-10 items-center gap-2.5">
      {lead}
      <span className="min-w-0 flex-1">
        <span title={title} className="block truncate text-xs font-medium text-ink">
          {title}
        </span>
        <span className="block text-caption tabular-nums text-ink-3">{detail}</span>
      </span>
      {trail}
    </div>
  );
}

const plural = (count: number) => `${numbers.format(count)} ${count === 1 ? "match" : "matches"}`;
const SKELETON_ROWS = [0, 1, 2];

// Right column of the Dashboard: how matches split by mode, who you play most, and your tournaments.
function MatchStats({ stats, ranked, loading }: { stats: api.DashboardStats | null; ranked: api.DashboardData["ranked"]; loading: boolean }) {
  const [opponents, setOpponents] = useState<api.Opponent[] | null>(null);
  const { thumb, showScrollThumb } = useScrollThumb();

  useEffect(() => {
    const load = async () => {
      try {
        setOpponents(await api.getOpponents());
      } catch {
        toast.error("Could not load your Ranked Play opponents.");
        setOpponents([]);
      }
    };
    void load();
  }, []);

  // Friendly Ranked has no count until osu! lets the app tell it apart from Ranked Play.
  const split = [
    { kind: "ranked" as const, count: ranked?.plays ?? 0 },
    { kind: "saved" as const, count: stats?.totals.all ?? 0 },
  ];
  const total = split.reduce((sum, part) => sum + part.count, 0);

  return (
    <div className="relative -mb-5 min-h-0">
      <aside onScroll={showScrollThumb} className="no-scrollbar flex h-full flex-col gap-5 overflow-y-auto pb-5">
        <Section title="Your matches">
          {loading ? (
            <Skeleton className="mt-1 h-16" />
          ) : (
            <div className="flex flex-col gap-2 pt-1">
              {total > 0 && (
                <div className="flex h-1.5 gap-0.5">
                  {split.map((part) => part.count > 0 && <span key={part.kind} className={cn("rounded-full", KIND[part.kind].bg)} style={{ flexGrow: part.count }} />)}
                </div>
              )}
              {split.map((part) => {
                const Icon = KIND[part.kind].icon;
                return (
                  <div key={part.kind} className="flex items-center gap-2 text-xs">
                    <Icon aria-hidden="true" size={12} strokeWidth={2} className={KIND[part.kind].text} />
                    <span className="flex-1 text-ink-2">{part.kind === "saved" ? "Saved Matches" : KIND[part.kind].label}</span>
                    <span className="tabular-nums text-ink">{numbers.format(part.count)}</span>
                    <span className="w-9 text-right tabular-nums text-ink-3">{total > 0 ? `${Math.round((part.count / total) * 100)}%` : "-"}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Most played against">
          <div className="divide-y divide-line">
            {opponents?.map((opponent) => (
              <Row
                key={opponent.id}
                lead={<Avatar userId={opponent.id} username={opponent.username} size={24} />}
                title={opponent.username}
                detail={plural(opponent.matches)}
                trail={<Record wins={opponent.wins} losses={opponent.losses} />}
              />
            ))}
            {opponents === null && SKELETON_ROWS.map((row) => <Skeleton key={row} className="my-2.5 h-5" />)}
          </div>
          {opponents?.length === 0 && <p className="py-2 text-xs text-ink-3">Ranked Play opponents will appear here.</p>}
        </Section>

        <Section title="Tournaments">
          <div className="divide-y divide-line">
            {stats?.topTournaments.map((tournament) => (
              <Row
                key={tournament.acronym}
                lead={
                  <span className="flex size-6 shrink-0 items-center justify-center rounded bg-(--tier-patron)/12 text-[0.5625rem] font-bold text-(--tier-patron)">
                    {tournament.acronym.slice(0, 4)}
                  </span>
                }
                title={tournament.name || tournament.acronym}
                detail={plural(tournament.count)}
                trail={tournament.wins != null && tournament.losses != null ? <Record wins={tournament.wins} losses={tournament.losses} /> : undefined}
              />
            ))}
            {loading && SKELETON_ROWS.map((row) => <Skeleton key={row} className="my-2.5 h-5" />)}
          </div>
          {!loading && (!stats || stats.topTournaments.length === 0) && <p className="py-2 text-xs text-ink-3">No tournaments yet.</p>}
        </Section>
      </aside>
      <div ref={thumb} aria-hidden="true" className="pointer-events-none absolute top-0 -right-3 mb-5 w-1 rounded-full bg-white/35 opacity-0 transition-opacity duration-150" />
    </div>
  );
}

export default MatchStats;
