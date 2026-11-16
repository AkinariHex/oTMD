import { Heart } from "lucide-react";
import { Tooltip } from "@/Components/ui/tooltip";
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
    <Tooltip content={`Thank you! ${count}, ${euros.format(supporter.total)} total.`}>
      <span
        tabIndex={0}
        data-tier={tier.id}
        className="supporter-chip inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full pr-2 pl-1.5 text-caption font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink-3"
      >
        <Heart size={11} strokeWidth={2} className="supporter-chip-icon" />
        {tier.name}
        {tier.id === "legend" && <span className="supporter-chip-sheen" />}
      </span>
    </Tooltip>
  );
}

export default SupporterChip;
