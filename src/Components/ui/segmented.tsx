import { useId } from "react";
import { motion } from "motion/react";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface SegmentedProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

function Segmented({ label, value, onChange, options }: SegmentedProps) {
  const id = useId();

  return (
    <div role="radiogroup" aria-label={label} className="flex h-8 w-full rounded-md bg-black/25 p-0.5 ring-1 ring-line">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "relative flex-1 rounded px-3 text-[13px] font-medium whitespace-nowrap transition-colors duration-150",
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
