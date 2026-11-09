import * as React from "react"
import { cn } from "@/lib/utils"
import { Switch as SwitchPrimitive } from "radix-ui"

// Same size and colors as the legacy .switch, so both look identical until Phase 7 replaces it.
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex h-[22.4px] w-10 shrink-0 cursor-pointer items-center rounded-full border-0 p-0 outline-none transition-colors duration-[400ms] focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-(--primary-color) data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-[15px] rounded-full transition duration-[400ms] data-[state=checked]:translate-x-[21.5px] data-[state=checked]:bg-(--switch-thumb-checked) data-[state=unchecked]:translate-x-[3.5px] data-[state=unchecked]:bg-(--secondary-color)"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
