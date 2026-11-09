import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type ButtonTone = "primary" | "secondary" | "danger";

const TONES: Record<ButtonTone, string> = {
  primary: "bg-accent text-on-accent hover:brightness-110",
  secondary: "bg-white/8 text-ink hover:bg-white/12",
  danger: "bg-loss/20 text-loss hover:bg-loss/30",
};

function Button({ tone = "secondary", type = "button", className, ...props }: ComponentProps<"button"> & { tone?: ButtonTone }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-[background-color,filter,transform] duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        TONES[tone],
        className
      )}
      {...props}
    />
  );
}

export { Button };
