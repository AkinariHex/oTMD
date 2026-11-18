import { useEffect, useState } from "react";
import { toast } from "sonner";
import Markdown from "@/Components/Markdown/Markdown";
import PageHeader from "@/Components/PageHeader/PageHeader";
import ScrollPage from "@/Components/ScrollPage/ScrollPage";
import * as api from "@/lib/api";

const RELEASES_PAGE = "https://github.com/AkinariHex/oTMD/releases";
const RELEASE_URL = "https://api.github.com/repos/AkinariHex/oTMD/releases/tags/";

type Release = { tag_name: string; published_at: string; body: string | null };

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "long" });

// Release notes are written for GitHub, so drop what only makes sense there.
function toAppMarkdown({ tag_name, published_at, body }: Release) {
  const lines = (body ?? "").replace(/\r\n/g, "\n").trim().split("\n");
  // Older releases repeat their own version as the first heading.
  if (/^#{1,3} /.test(lines[0] ?? "") && lines[0].includes(tag_name)) lines.shift();
  const notes = lines
    .filter((line) => !/^> \[!\w+\]$/.test(line))
    .join("\n")
    .split(/^(?=## )/m)
    .filter((section) => !section.startsWith("## Download"))
    .join("");
  return `# ${tag_name}\n\n*${dateFormat.format(new Date(published_at))}*\n\n${notes}\n\n[See every release on GitHub](${RELEASES_PAGE})`;
}

function Changelog() {
  const [changelog, setChangelog] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const version = await api.getAppVersion();
        const response = await fetch(`${RELEASE_URL}v${version}`, { headers: { Accept: "application/vnd.github+json" } });
        // 404 means this version has no published release yet, which is not worth an error toast.
        if (response.status === 404) {
          setFailed(true);
          return;
        }
        if (!response.ok) throw new Error();
        setChangelog(toAppMarkdown((await response.json()) as Release));
      } catch {
        setFailed(true);
        toast.error("Could not load the changelog.");
      }
    };
    void load();
  }, []);

  return (
    <ScrollPage>
      <div className="mx-auto flex max-w-[680px] flex-col gap-2">
        <PageHeader title="Changelog" />
        {changelog !== null ? (
          <Markdown>{changelog}</Markdown>
        ) : failed ? (
          <Markdown>{`The changelog for this version is not available right now. [See every release on GitHub](${RELEASES_PAGE})`}</Markdown>
        ) : (
          <p className="text-xs text-ink-3">Loading changelog</p>
        )}
      </div>
    </ScrollPage>
  );
}

export default Changelog;
