import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import * as api from "@/lib/api";

const components = {
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <button type="button" className="font-medium text-accent" onClick={() => href && void api.openExternal(href)}>
      {children}
    </button>
  ),
};

function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}

export default Markdown;
