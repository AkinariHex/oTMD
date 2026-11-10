import { useLayoutEffect, useRef, useState } from "react";

const CHIP_PADDING = 12;

// Shows the full name when it fits on one line, otherwise the acronym.
function TournamentChip({ full, short }: { full: string; short: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const [fits, setFits] = useState(true);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const check = () => setFits((measure.current?.offsetWidth ?? 0) + CHIP_PADDING <= element.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => observer.disconnect();
  }, [full]);

  return (
    <span ref={box} className="relative min-w-0 flex-1 text-left">
      <span ref={measure} aria-hidden="true" className="invisible absolute font-semibold whitespace-nowrap">
        {full}
      </span>
      <span title={full} className="inline-block max-w-full truncate rounded bg-black/55 px-1.5 py-0.5 align-bottom font-semibold whitespace-nowrap text-ink backdrop-blur-sm">
        {fits ? full : short}
      </span>
    </span>
  );
}

export default TournamentChip;
