import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Avatar from "@/Components/Avatar/Avatar";
import { Button } from "@/Components/ui/button";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";

const FLAGS_URL = "https://raw.githubusercontent.com/ppy/osu-resources/master/osu.Game.Resources/Textures/Flags";
const numbers = new Intl.NumberFormat("en-US");
const dates = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

const SITE_MESSAGES: Record<Exclude<api.DashboardData["siteStatus"], "ok">, string> = {
  noKey: "Add your o!TMD website API key in Settings to see your saved matches.",
  invalidKey: "Your o!TMD website API key is not valid. Check it in Settings.",
  unavailable: "Saved matches are unavailable right now. Try again in a moment.",
};

const percentOf = (part: number, total: number): string => (total > 0 ? `${Math.round((part / total) * 100)}%` : "-");

function formatDate(value: string | null): string {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? dates.format(date) : "";
}

function StatTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg bg-white/4 p-3 ring-1 ring-line">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</div>
      <div className="truncate text-xs text-ink-3">{detail}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col gap-1">
      <h2 className="text-xs font-medium text-ink-3">{title}</h2>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

function Outcome({ won }: { won: boolean | null }) {
  return <span className={cn("size-1.5 shrink-0 rounded-full", won === null ? "bg-ink-3" : won ? "bg-win" : "bg-loss")} />;
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-2 text-xs text-ink-3">{children}</p>;
}

function Profile({ user }: { user: api.User | null }) {
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [data, setData] = useState<api.DashboardData | null>(null);
  const [status, setStatus] = useState<api.RankedStatus | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [dashboard, ranked] = await Promise.all([api.getDashboard(), api.getRankedStatus()]);
        setData(dashboard);
        setStatus(ranked);
      } catch {
        toast.error("Could not load the dashboard.");
      }
    };
    void load();
  }, []);

  const logout = async () => {
    setIsLoggingOut(true);
    try {
      await api.logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  if (!user) return null;

  const stats = data?.stats ?? null;
  const ranked = data?.ranked ?? null;
  const duels = stats ? stats.oneVsOne.wins + stats.oneVsOne.losses : 0;
  const siteMessage = data && data.siteStatus !== "ok" ? SITE_MESSAGES[data.siteStatus] : null;

  return (
    <div className="flex flex-col gap-4">
      <header data-tauri-drag-region className="flex items-center gap-4 pr-(--window-controls-inset)">
        <Avatar userId={user.id} username={user.username} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-semibold tracking-tight text-ink">{user.username}</h1>
            <img src={`${FLAGS_URL}/${user.country}.png`} alt={user.country} className="h-3.5 w-auto" />
          </div>
          <p className="text-xs text-ink-3">{status?.enabled ? "Tracking ranked play" : "Your matches at a glance"}</p>
        </div>
        <Button tone="danger" disabled={isLoggingOut} onClick={() => void logout()}>
          Log out
        </Button>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <StatTile label="Saved matches" value={stats ? numbers.format(stats.totals.all) : "-"} detail={stats ? `${stats.totals.teamVS} team, ${stats.totals.qualifiers} qualifiers` : "On otmd.app"} />
        <StatTile label="1vs1 win rate" value={stats ? percentOf(stats.oneVsOne.wins, duels) : "-"} detail={stats ? `${stats.oneVsOne.wins} wins, ${stats.oneVsOne.losses} losses` : "Saved 1vs1 matches"} />
        <StatTile label="Ranked rating" value={ranked?.rating != null ? numbers.format(ranked.rating) : "-"} detail={ranked?.rank != null ? `#${numbers.format(ranked.rank)}` : "Ranked Play"} />
        <StatTile label="Ranked win rate" value={ranked ? percentOf(ranked.firstPlacements, ranked.plays) : "-"} detail={ranked ? `${ranked.firstPlacements} wins in ${ranked.plays} plays` : "Ranked Play"} />
      </div>

      {siteMessage && (
        <p role="status" className="flex items-center justify-between gap-3 rounded-lg bg-white/4 px-3 py-2 text-xs text-ink-2 ring-1 ring-line">
          {siteMessage}
          <Button onClick={() => navigate("/app/settings")} className="h-6 px-2 text-xs">
            Open Settings
          </Button>
        </p>
      )}

      <div className="grid grid-cols-[1fr_320px] gap-6">
        <Section title="Recent matches">
          {stats?.recentMatches.map((match) => (
            <div key={match.matchID} className="flex h-10 items-center gap-3">
              <Outcome won={match.won} />
              <span className="w-24 shrink-0 truncate font-medium text-ink">{match.tournament || "Friendly"}</span>
              <span className="w-24 shrink-0 truncate text-ink-3">{match.stage}</span>
              <span className="min-w-0 flex-1 truncate text-ink-2">{match.opponent ?? ""}</span>
              <span className="shrink-0 font-medium tabular-nums text-ink-2">{match.score ?? ""}</span>
              <span className="w-14 shrink-0 text-right text-xs text-ink-3">{formatDate(match.startTime)}</span>
            </div>
          ))}
          {stats?.recentMatches.length === 0 && <EmptyLine>Finished matches you export will appear here.</EmptyLine>}
          {!stats && <EmptyLine>No saved matches to show.</EmptyLine>}
        </Section>

        <div className="flex flex-col gap-4">
          <Section title="Recent ranked">
            {stats?.recentRooms.map((room) => (
              <div key={room.roomId} className="flex h-9 items-center gap-2 text-xs">
                <Outcome won={room.won} />
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{room.opponent ?? `Room ${room.roomId}`}</span>
                <span className="shrink-0 tabular-nums text-ink-3">{room.rounds} maps</span>
                <span className="w-14 shrink-0 text-right text-ink-3">{formatDate(room.endedAt)}</span>
              </div>
            ))}
            {(!stats || stats.recentRooms.length === 0) && <EmptyLine>Saved ranked matches will appear here.</EmptyLine>}
          </Section>

          <Section title="Top tournaments">
            {stats?.topTournaments.map((tournament) => (
              <div key={tournament.acronym} className="flex h-9 items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate font-medium text-ink">{tournament.name || tournament.acronym}</span>
                <span className="shrink-0 tabular-nums text-ink-3">{tournament.count}</span>
              </div>
            ))}
            {(!stats || stats.topTournaments.length === 0) && <EmptyLine>No tournaments yet.</EmptyLine>}
          </Section>
        </div>
      </div>
    </div>
  );
}

export default Profile;
