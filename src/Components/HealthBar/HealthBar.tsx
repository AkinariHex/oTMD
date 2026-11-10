import { Heart } from "lucide-react";
import type { SideIndex } from "@/lib/api";
import { cn } from "@/lib/utils";

const HIGH_LIFE_SHARE = 0.5;
const LOW_LIFE_SHARE = 0.2;
const SIDES = [
  { skew: 12, angle: "270deg", name: "red" },
  { skew: -12, angle: "90deg", name: "blue" },
];

const percentOf = (part: number, whole: number) => `${(part / whole) * 100}%`;

function LostHealth({ lost, maxLife, side }: { lost: number; maxLife: number; side: SideIndex }) {
  const { angle, name } = SIDES[side];
  return (
    <span className="relative block h-full overflow-hidden bg-black/50" style={{ width: percentOf(lost, maxLife) }}>
      <span className="absolute inset-0 opacity-10" style={{ background: `linear-gradient(${angle}, var(--health-${name}-high) 0%, var(--health-${name}-end) 100%)` }} />
      <span className="health-shimmer" data-side={side} />
    </span>
  );
}

// With `before`, the health lost in that round stays visible as a faint piece of the bar.
function HealthBar({ life, maxLife, side, height, before }: { life: number; maxLife: number; side: SideIndex; height: number; before?: number }) {
  const { skew, angle, name } = SIDES[side];
  const share = life / maxLife;
  const tier = share > HIGH_LIFE_SHARE ? "high" : share > LOW_LIFE_SHARE ? "mid" : "low";
  const counterSkew = { transform: `skewX(${-skew}deg)` };
  const lost = before === undefined ? 0 : Math.max(0, before - life);
  const lostPiece = lost > 0 && <LostHealth lost={lost} maxLife={maxLife} side={side} />;

  return (
    <span className={cn("relative flex w-full overflow-hidden bg-black/50", side === 0 && "justify-end")} style={{ height, transform: `skewX(${skew}deg)` }}>
      {side === 0 && lostPiece}
      <span className="block h-full" style={{ width: percentOf(life, maxLife), background: `linear-gradient(${angle}, var(--health-${name}-${tier}) 0%, var(--health-${name}-end) 100%)` }} />
      {side === 1 && lostPiece}
      <span className="absolute inset-0 flex items-center justify-center gap-1">
        <Heart aria-hidden="true" size={height - 4} className="fill-heart text-heart" style={counterSkew} />
        <span className="font-extrabold text-white tabular-nums [text-shadow:0_0_3px_rgb(0_0_0/0.9)]" style={{ ...counterSkew, fontSize: height - 3, lineHeight: 1 }}>
          {life.toLocaleString("en-US")}
        </span>
      </span>
    </span>
  );
}

export default HealthBar;
