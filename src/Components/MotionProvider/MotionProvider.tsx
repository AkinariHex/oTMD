import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { useAnimationsEnabled } from "@/lib/preferences";

function MotionProvider({ children }: { children: ReactNode }) {
  const enabled = useAnimationsEnabled();

  return (
    <MotionConfig reducedMotion={enabled ? "user" : "always"}>
      {children}
    </MotionConfig>
  );
}

export default MotionProvider;
