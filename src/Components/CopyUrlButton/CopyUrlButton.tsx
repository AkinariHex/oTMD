import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/Components/ui/button";

const COPIED_MS = 1500;

function CopyUrlButton({ url, label, className }: { url: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      toast.error("Could not copy the URL");
    }
  };

  return (
    <Button onClick={copy} className={className}>
      {copied ? <Check size={14} strokeWidth={1.75} /> : <Copy size={14} strokeWidth={1.75} />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export default CopyUrlButton;
