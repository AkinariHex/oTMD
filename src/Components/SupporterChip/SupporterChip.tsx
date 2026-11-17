import { Tooltip } from "@/Components/ui/tooltip";
import Logo from "@/Images/otmd.ico";
import type { DashboardData } from "@/lib/api";

// Minimum total in EUR for each tier, highest first.
const TIERS = [
  { id: "legend", name: "Legend", from: 200 },
  { id: "champion", name: "Champion", from: 75 },
  { id: "patron", name: "Patron", from: 20 },
  { id: "supporter", name: "Supporter", from: 0 },
] as const;

const euros = new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" });

function SupporterChip({ supporter }: { supporter: NonNullable<DashboardData["supporter"]> }) {
  const tier = TIERS.find((tier) => supporter.total >= tier.from) ?? TIERS[TIERS.length - 1];
  const count = supporter.donations === 1 ? "1 donation" : `${supporter.donations} donations`;

  return (
    <Tooltip content={`Supporting o!TMD, the app. Thank you! ${count}, ${euros.format(supporter.total)} total.`}>
      <span
        tabIndex={0}
        data-tier={tier.id}
        className="supporter-chip inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full pr-2 pl-1 text-caption font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink-3"
      >
        {/* The app logo, not a heart, so it never reads as osu!supporter. */}
        <img src={Logo} alt="" width={14} height={14} className="supporter-chip-icon" />
        <span className="text-ink-3">o!TMD</span>
        {tier.name}
        {tier.id === "legend" && <span className="supporter-chip-sheen" />}
      </span>
    </Tooltip>
  );
}

export default SupporterChip;
