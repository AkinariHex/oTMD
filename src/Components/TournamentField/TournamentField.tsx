import { useEffect, useState } from "react";
import { toast } from "sonner";
import ProposeTournament from "@/Components/ProposeTournament/ProposeTournament";
import { Input } from "@/Components/ui/input";
import { Segmented } from "@/Components/ui/segmented";
import { Select } from "@/Components/ui/select";
import * as api from "@/lib/api";

type TournamentSettings = Pick<api.MatchSettings, "TournamentMode" | "TournamentAcronym" | "TournamentName">;

const MODES = [
  { value: "auto", label: "Auto detect" },
  { value: "pick", label: "From list" },
  { value: "custom", label: "Custom" },
];

interface TournamentFieldProps {
  value: TournamentSettings;
  onChange: (update: Partial<TournamentSettings>) => void;
}

function TournamentField({ value, onChange }: TournamentFieldProps) {
  const [tournaments, setTournaments] = useState<api.TournamentEntry[] | null>(null);
  const picking = value.TournamentMode === "pick";

  useEffect(() => {
    if (!picking || tournaments) return;
    const load = async () => {
      try {
        setTournaments(await api.getTournaments());
      } catch (error) {
        setTournaments([]);
        toast.error(typeof error === "string" ? error : "Could not load the tournaments.");
      }
    };
    void load();
  }, [picking, tournaments]);

  return (
    <div className="col-span-2 flex flex-col gap-1.5">
      <div className="flex h-6 items-center justify-between">
        <span className="text-xs font-medium text-ink-2">Tournament</span>
        <ProposeTournament />
      </div>
      <Segmented label="Tournament source" value={value.TournamentMode} onChange={(mode) => onChange({ TournamentMode: mode as TournamentSettings["TournamentMode"] })} options={MODES} />
      {value.TournamentMode === "auto" && <p className="text-xs text-ink-3">Read from the lobby name, e.g. "OWC: (Team A) vs (Team B)".</p>}
      {picking &&
        (tournaments === null ? (
          <p className="text-xs text-ink-3">Loading tournaments</p>
        ) : tournaments.length === 0 ? (
          <p className="text-xs text-ink-3">No tournaments listed yet. Propose one or use a custom name.</p>
        ) : (
          <Select
            label="Tournament"
            value={value.TournamentAcronym}
            onChange={(TournamentAcronym) => onChange({ TournamentAcronym })}
            options={tournaments.map(({ acronym, name }) => ({ value: acronym, label: `${name} (${acronym})` }))}
          />
        ))}
      {value.TournamentMode === "custom" && (
        <Input maxLength={60} aria-label="Custom tournament name" placeholder="Name shown on the overlay" value={value.TournamentName} onChange={(event) => onChange({ TournamentName: event.target.value })} />
      )}
    </div>
  );
}

export default TournamentField;
