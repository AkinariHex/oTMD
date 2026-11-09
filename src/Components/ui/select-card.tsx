import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SelectCardProps {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}

function SelectCard({ selected, disabled = false, onClick, className, children }: SelectCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative rounded-lg p-2 text-left ring-1 transition-[background-color,box-shadow,transform] duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        selected ? "bg-accent/10 ring-2 ring-accent" : "bg-white/4 ring-line hover:bg-white/7",
        className
      )}
    >
      {children}
    </button>
  );
}

export { SelectCard };
