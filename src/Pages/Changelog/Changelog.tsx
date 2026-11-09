import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import PageHeader from "@/Components/PageHeader/PageHeader";
import * as api from "@/lib/api";

const CHANGELOG_URL = "https://raw.githubusercontent.com/AkinariHex/oTMD/main/CHANGELOG.md";

function Changelog() {
  const [changelog, setChangelog] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(CHANGELOG_URL);
        if (!response.ok) throw new Error();
        setChangelog(await response.text());
      } catch {
        toast.error("Could not load the changelog.");
      }
    };
    void load();
  }, []);

  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-2">
      <PageHeader title="Changelog" />
      <div className="markdown">
        <ReactMarkdown
          components={{
            a: ({ href, children }) => (
              <button type="button" className="font-medium text-accent" onClick={() => href && void api.openExternal(href)}>
                {children}
              </button>
            ),
          }}
        >
          {changelog}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export default Changelog;
