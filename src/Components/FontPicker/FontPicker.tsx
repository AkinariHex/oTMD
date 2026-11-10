import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover } from "radix-ui";
import { List, useListRef, type RowComponentProps } from "react-window";
import * as api from "@/lib/api";
import { useScrollThumb } from "@/lib/scrollThumb";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 32;
const LIST_HEIGHT = 288;
const BUILT_IN = [
  { family: "Nunito", value: "Nunito, Inter, sans-serif" },
  { family: "Inter", value: "Inter, sans-serif" },
  { family: "Poppins", value: "Poppins, sans-serif" },
  { family: "Roboto", value: "Roboto, sans-serif" },
  { family: "Figtree", value: "Figtree, sans-serif" },
];

interface FontOption {
  family: string;
  value: string;
}

type Row = { kind: "heading"; label: string } | ({ kind: "font" } & FontOption);

interface RowProps {
  rows: Row[];
  activeIndex: number;
  selected: string;
  listId: string;
  onHover: (index: number) => void;
  onChoose: (value: string) => void;
}

const toValue = (family: string): string => `"${family.replace(/"/g, "")}", sans-serif`;
const familyOf = (value: string): string => value.split(",")[0].trim().replace(/^["']|["']$/g, "");

let fontsRequest: Promise<{ installed: string[]; popular: string[] }> | null = null;

// One scan per window: the list does not change while it is open.
function loadFonts() {
  fontsRequest ??= Promise.all([api.getSystemFonts(), api.getPopularFonts().catch(() => [])]).then(([installed, popular]) => ({ installed, popular }));
  return fontsRequest;
}

function buildRows(installed: string[], popular: string[], query: string): Row[] {
  const fonts: FontOption[] = installed.map((family) => ({ family, value: toValue(family) }));
  const search = query.trim().toLowerCase();

  if (search) {
    const known = new Set(installed.map((family) => family.toLowerCase()));
    const everything = [...BUILT_IN.filter(({ family }) => !known.has(family.toLowerCase())), ...fonts];
    return everything.filter(({ family }) => family.toLowerCase().includes(search)).map((font) => ({ kind: "font", ...font }));
  }

  // Limited to fonts on this PC, so a name in the shared list can only appear if it is really installed.
  const installedNames = new Set(installed);
  const builtInNames = new Set(BUILT_IN.map(({ family }) => family));
  const suggested = [...BUILT_IN, ...popular.filter((family) => installedNames.has(family) && !builtInNames.has(family)).map((family) => ({ family, value: toValue(family) }))];

  return [
    { kind: "heading", label: "Suggested" },
    ...suggested.map((font): Row => ({ kind: "font", ...font })),
    ...(fonts.length ? ([{ kind: "heading", label: "All fonts" }, ...fonts.map((font) => ({ kind: "font", ...font }))] as Row[]) : []),
  ];
}

function FontRow({ index, style, rows, activeIndex, selected, listId, onHover, onChoose }: RowComponentProps<RowProps>) {
  const row = rows[index];

  if (row.kind === "heading") {
    return (
      <div style={style} className="flex items-end px-2 pb-1 text-caption font-medium text-ink-3">
        {row.label}
      </div>
    );
  }

  const isSelected = familyOf(selected) === row.family;
  return (
    <div
      id={`${listId}-${index}`}
      role="option"
      aria-selected={isSelected}
      style={style}
      onPointerMove={() => onHover(index)}
      onClick={() => onChoose(row.value)}
      className={cn("flex cursor-pointer items-center gap-2 rounded px-2 text-ui text-ink", index === activeIndex && "bg-white/10")}
    >
      <span className="min-w-0 flex-1 truncate" style={{ fontFamily: row.value }}>
        {row.family}
      </span>
      <Check size={14} strokeWidth={2} className={cn("shrink-0 text-accent", !isSelected && "invisible")} />
    </div>
  );
}

function firstFontIndex(rows: Row[]): number {
  return rows.findIndex((row) => row.kind === "font");
}

function FontPicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [installed, setInstalled] = useState<string[] | null>(null);
  const [popular, setPopular] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useListRef(null);
  const { thumb, showScrollThumb } = useScrollThumb();
  const listId = useId();

  useEffect(() => {
    if (!open || installed) return;
    let active = true;
    const load = async () => {
      try {
        const fonts = await loadFonts();
        if (!active) return;
        setInstalled(fonts.installed);
        setPopular(fonts.popular);
      } catch {
        if (active) setInstalled([]);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [open, installed]);

  const rows = useMemo(() => buildRows(installed ?? [], popular, query), [installed, popular, query]);

  // Search results start on the first match, so Enter picks what is shown on top.
  useEffect(() => {
    setActiveIndex(firstFontIndex(rows));
  }, [rows]);

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  const move = (direction: number) => {
    let next = activeIndex + direction;
    while (rows[next]?.kind === "heading") next += direction;
    if (!rows[next]) return;
    setActiveIndex(next);
    listRef.current?.scrollToRow({ index: next, align: "smart" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[activeIndex];
      if (row?.kind === "font") choose(row.value);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={label}
        className="flex h-8 w-full items-center justify-between gap-2 rounded-md bg-black/25 px-2.5 text-ui text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-accent/60"
      >
        <span className="min-w-0 truncate">{familyOf(value)}</span>
        <ChevronDown size={14} strokeWidth={1.75} className="shrink-0 text-ink-3" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={4} collisionPadding={8} className="z-50 w-72 rounded-md bg-raised p-1 shadow-xl ring-1 ring-line">
          <div className="flex h-8 items-center gap-2 rounded bg-black/25 px-2">
            <Search size={14} strokeWidth={1.75} className="shrink-0 text-ink-3" />
            <input
              role="combobox"
              aria-label="Search fonts"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
              value={query}
              placeholder="Search fonts"
              spellCheck={false}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              className="min-w-0 flex-1 bg-transparent text-ui text-ink outline-none placeholder:text-ink-3"
            />
          </div>
          <div id={listId} role="listbox" aria-label={label} className="relative mt-1">
            {rows.length > 0 ? (
              <List
                listRef={listRef}
                rowComponent={FontRow}
                rowCount={rows.length}
                rowHeight={ROW_HEIGHT}
                rowProps={{ rows, activeIndex, selected: value, listId, onHover: setActiveIndex, onChoose: choose }}
                overscanCount={4}
                onScroll={showScrollThumb}
                className="no-scrollbar"
                style={{ height: Math.min(LIST_HEIGHT, rows.length * ROW_HEIGHT) }}
              />
            ) : (
              <p className="px-2 py-3 text-center text-xs text-ink-3">No fonts match your search</p>
            )}
            <div ref={thumb} aria-hidden="true" className="pointer-events-none absolute top-0 right-0.5 w-1 rounded-full bg-white/35 opacity-0 transition-opacity duration-150" />
            {!installed && <p className="px-2 py-1 text-xs text-ink-3">Loading installed fonts</p>}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export default FontPicker;
