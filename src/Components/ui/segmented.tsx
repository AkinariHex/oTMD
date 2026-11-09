import { useId } from "react";
import { motion } from "motion/react";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface SegmentedProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  small?: boolean;
}

function Segmented({ label, value, onChange, options, small = false }: SegmentedProps) {
  const id = useId();

  return (
    <div role="radiogroup" aria-label={label} className={cn("flex w-full rounded-md bg-black/25 p-0.5 ring-1 ring-line", small ? "h-6" : "h-8")}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "relative flex-1 rounded font-medium whitespace-nowrap transition-colors duration-150",
            small ? "px-2 text-xs" : "px-3 text-[13px]",
            value === option.value ? "text-ink" : "text-ink-3 hover:text-ink-2"
          )}
        >
          {value === option.value && (
            <motion.span layoutId={id} transition={{ duration: 0.2, ease: EASE_OUT }} className="absolute inset-0 rounded bg-white/12" />
          )}
          <span className="relative">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

export { Segmented };
