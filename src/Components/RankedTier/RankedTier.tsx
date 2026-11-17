import { useState } from "react";
import { Skeleton } from "@/Components/ui/skeleton";
import type { DashboardData } from "@/lib/api";

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

// Dev only: clicking the card cycles every tier, then placements, then the real data.
const PREVIEW: Ranked[] = [...Array.from({ length: 19 }, (_, step) => 600 + step * 100), 2400].map((rating, index) => ({
  rating,
  rank: 1000 - index * 50,
  plays: 0,
  firstPlacements: 0,
  provisional: false,
}));
PREVIEW.push({ rating: 1000, rank: -1, plays: 0, firstPlacements: 0, provisional: true });

export default function RankedTier({ ranked: real, loading }: { ranked: Ranked | null; loading: boolean }) {
  const [preview, setPreview] = useState(-1);
  const ranked = preview >= 0 ? PREVIEW[preview] : real;
  const placed = ranked?.rating != null && !ranked.provisional && ranked.rank != null && ranked.rank !== -1;
  const tier = placed ? tierOf(ranked.rating!) : null;

  return (
    <div
      className="relative rounded-lg bg-white/4 p-3 ring-1 ring-line"
      onClick={import.meta.env.DEV ? () => setPreview((index) => (index + 1 < PREVIEW.length ? index + 1 : -1)) : undefined}
    >
      <div className="text-xs text-ink-3">Ranked rating</div>
      {loading ? (
        <>
          <Skeleton className="mt-1.5 h-6 w-16" />
          <Skeleton className="mt-2 h-3 w-24" />
        </>
      ) : (
        <>
          <div className="mt-1 text-xl font-semibold tabular-nums text-ink">
            {ranked?.rating != null ? numbers.format(ranked.rating) : "-"}
            {ranked?.provisional && <span title="Provisional rating">*</span>}
          </div>
          <div className="flex items-center gap-1.5 truncate text-xs text-ink-3 pr-14">
            {tier ? (
              <>
                <span className="text-ink-2">{tier.title}</span>
                <span data-tier={tier.id} className="ranked-rank font-bold tabular-nums">
                  #{numbers.format(ranked!.rank!)}
                </span>
              </>
            ) : (
              <span>{ranked ? "Placement matches" : "Ranked Play"}</span>
            )}
          </div>
          <img
            src={tier?.image ?? badge("Placeholder")}
            alt={tier?.title ?? "Unranked"}
            width={160}
            height={134}
            className="absolute top-1/2 right-3 h-14 w-auto -translate-y-1/2"
          />
        </>
      )}
    </div>
  );
}
