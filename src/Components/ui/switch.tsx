import type { ComponentProps } from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full bg-white/12 outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-accent/60 data-[state=checked]:bg-accent",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="block size-4 translate-x-0.5 rounded-full bg-ink transition-transform duration-150 ease-out data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-on-accent"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
