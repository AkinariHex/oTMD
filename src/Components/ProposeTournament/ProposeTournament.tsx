import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Popover } from "radix-ui";
import { toast } from "sonner";
import { Button } from "@/Components/ui/button";
import { Input } from "@/Components/ui/input";
import * as api from "@/lib/api";

const EMPTY = { acronym: "", name: "", link: "" };

function ProposeTournament() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [sending, setSending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    try {
      await api.proposeTournament({ acronym: draft.acronym.trim(), name: draft.name.trim(), link: draft.link.trim() });
      toast.success("Tournament proposed, a moderator will review it.");
      setDraft(EMPTY);
      setOpen(false);
    } catch (error) {
      toast.error(typeof error === "string" ? error : "Could not send the proposal.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-xs font-medium text-ink-2 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60">
        <Plus size={12} strokeWidth={2} />
        Propose
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={4} collisionPadding={8} className="z-50 w-72 rounded-md bg-raised p-3 shadow-xl ring-1 ring-line">
          <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
            <p className="text-xs text-ink-2">Missing tournament? Propose it and a moderator will add its mod multipliers.</p>
            <Input required maxLength={16} aria-label="Acronym" placeholder="Acronym, as in the lobby name" spellCheck={false} value={draft.acronym} onChange={(event) => setDraft({ ...draft, acronym: event.target.value })} />
            <Input required maxLength={80} aria-label="Tournament name" placeholder="Tournament name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            <Input type="url" maxLength={300} aria-label="Forum or website link" placeholder="Forum or website link (optional)" spellCheck={false} value={draft.link} onChange={(event) => setDraft({ ...draft, link: event.target.value })} />
            <Button type="submit" tone="primary" disabled={sending}>
              {sending ? "Sending" : "Send proposal"}
            </Button>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export default ProposeTournament;
