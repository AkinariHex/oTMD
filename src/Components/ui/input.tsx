import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-8 w-full rounded-md bg-black/25 px-2.5 text-[13px] text-ink ring-1 ring-line outline-none transition-shadow duration-150 placeholder:text-ink-3 focus:ring-2 focus:ring-accent/60 disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
}

export { Input };
