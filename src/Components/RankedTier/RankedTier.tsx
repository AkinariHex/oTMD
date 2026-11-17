import { useEffect, useState, type CSSProperties } from "react";
import RankedRecord from "@/Components/RankedRecord/RankedRecord";
import RatingChart from "@/Components/RatingChart/RatingChart";
import { Skeleton } from "@/Components/ui/skeleton";
import type { DashboardData } from "@/lib/api";
import { addRankedRooms } from "@/lib/rankedRooms";

const BADGES = Object.fromEntries(
  Object.entries(import.meta.glob<string>("@/Images/ranked-tiers/*.png", { eager: true, import: "default" })).map(([path, url]) => [path.split("/").pop()!.replace(".png", ""), url]),
);
const badge = (name: string) => BADGES[name];

const TIERS = ["Bronze", "Silver", "Gold", "Platinum", "Rhodium", "Radiant"] as const;
const DIVISIONS = ["I", "II", "III"] as const;
const numbers = new Intl.NumberFormat("en-US");

type Ranked = NonNullable<DashboardData["ranked"]>;

// Same bands as osu-web: 100 rating per division from 600, Lustrous from 2400.
export function tierOf(rating: number): { id: string; title: string; image: string } {
  if (rating >= 2400) return { id: "lustrous", title: "Lustrous", image: badge("Lustrous") };
  const step = Math.floor(Math.min(Math.max(rating, 600), 2399) / 100) - 6;
  const tier = TIERS[Math.floor(step / 3)];
  const division = DIVISIONS[step % 3];
  return { id: tier.toLowerCase(), title: `${tier} ${division}`, image: badge(`${tier}-${division}`) };
}

// Platinum and up: rising specks. Radiant and Lustrous: a glint across the badge.
const MOTE_COUNT: Record<string, number> = { platinum: 3, rhodium: 4, radiant: 6, lustrous: 12 };
const GLINT = new Set(["radiant", "lustrous"]);
// Fixed spread so the specks never clump.
const MOTES = Array.from({ length: 12 }, (_, index) => ({
  left: `${12 + ((index * 37) % 76)}%`,
  delay: `${(index * 0.61) % 3.6}s`,
  drift: `${((index * 13) % 17) - 8}px`,
}));

// Dev only: clicking the badge cycles every tier, then placements, then the real data.
const PREVIEW = [...Array.from({ length: 19 }, (_, step) => 600 + step * 100), 2400].map((rating, index) => ({
  rating,
  rank: 1000 - index * 50,
  provisional: false,
}));
PREVIEW.push({ rating: 1000, rank: -1, provisional: true });

export default function RankedTier({ ranked, loading }: { ranked: Ranked | null; loading: boolean }) {
  const [preview, setPreview] = useState(-1);
  useEffect(() => addRankedRooms(ranked?.rooms ?? []), [ranked]);
  const shown = preview >= 0 ? { ...ranked, ...PREVIEW[preview] } : ranked;
  const placed = shown?.rating != null && !shown.provisional && shown.rank != null && shown.rank !== -1;
  const tier = placed ? tierOf(shown.rating!) : null;
  const history = ranked?.history ?? [];
  const wins = ranked?.firstPlacements ?? 0;

  if (loading) {
    return (
      <div className="col-span-3 flex items-center gap-4 rounded-lg bg-white/4 p-4 ring-1 ring-line">
        <Skeleton className="h-20 w-24" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    );
  }

  return (
    <section data-rank={tier?.id} data-tip-boundary className="ranked-card relative col-span-3 overflow-hidden rounded-lg ring-1 ring-line">
      <RatingChart
        history={history}
        colour={tier ? "var(--rk-b)" : "var(--accent)"}
        pointsRight={95}
        pointsBottom={55}
        hoverFrom={15}
        className="absolute top-3 right-0 bottom-0 left-[30%] [mask-image:linear-gradient(to_right,transparent,black_55%)]"
      />

      <div className="pointer-events-none relative flex h-full items-center p-4">
        <div className="flex items-center gap-4">
          {/* Fixed box, as tall as the three text lines beside it (4.5rem of type plus the 2px gap):
              the image is absolute, so no badge or placeholder can change its size and push the text. */}
          <div
            className="pointer-events-auto relative aspect-[160/134] h-[calc(4.5rem*var(--text-scale)+2px)] shrink-0"
            onClick={import.meta.env.DEV ? () => setPreview((index) => (index + 1 < PREVIEW.length ? index + 1 : -1)) : undefined}
          >
            {tier &&
              MOTES.slice(0, MOTE_COUNT[tier.id] ?? 0).map((mote, index) => (
                <span key={index} aria-hidden="true" className="ranked-mote" style={{ left: mote.left, animationDelay: mote.delay, "--drift": mote.drift } as CSSProperties} />
              ))}
            <img src={tier?.image ?? badge("Placeholder")} alt={tier?.title ?? "Unranked"} width={160} height={134} className="absolute inset-0 size-full object-contain" />
            {tier && GLINT.has(tier.id) && (
              // The badge itself is the mask, so the light only crosses the medal.
              <span className="ranked-glint" aria-hidden="true" style={{ maskImage: `url(${tier.image})` }}>
                <span />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs text-ink-3">Ranked Play</div>
            {tier ? (
              <div data-tier={tier.id} className="ranked-rank text-3xl font-bold tracking-tight">
                {tier.title}
              </div>
            ) : (
              <div className="text-3xl font-bold tracking-tight text-ink-2">{shown ? "Placements" : "Unranked"}</div>
            )}
            <div className="mt-0.5 flex items-baseline gap-2 text-sm text-ink-3">
              <span className="tabular-nums text-ink-2">
                {shown?.rating != null ? numbers.format(shown.rating) : "-"}
                {shown?.provisional && <span title="Provisional rating">*</span>}
              </span>
              {tier && (
                <span data-tier={tier.id} className="ranked-rank font-bold tabular-nums">
                  #{numbers.format(shown!.rank!)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {ranked && (
        <div className="absolute right-3 bottom-3">
          <RankedRecord history={history} wins={wins} losses={ranked.plays - wins} />
        </div>
      )}
    </section>
  );
}
