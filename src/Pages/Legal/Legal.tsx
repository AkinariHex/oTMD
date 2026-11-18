import ReactMarkdown from "react-markdown";
import PageHeader from "@/Components/PageHeader/PageHeader";
import * as api from "@/lib/api";

const NOTICE = `
### Not affiliated with osu!

osu! Tourney Match Displayer is an unofficial, community-made tool. It is not affiliated with, endorsed, sponsored or approved by ppy Pty Ltd or the osu! team.

"osu!" and "ppy" are trademarks of ppy Pty Ltd. They are used here only to describe what this tool works with.

### Third-party assets

- **Ranked Play tier icons** are © ppy Pty Ltd, from [osu-web](https://github.com/ppy/osu-web), licensed under [AGPL-3.0](https://github.com/ppy/osu-web/blob/master/LICENCE). They keep their original licence and are not covered by this project's licence.
- Beatmap, player and match data come from the [osu! API](https://osu.ppy.sh/docs/) and stay subject to the [osu! terms of service](https://osu.ppy.sh/legal/Terms).

### This project

The source code of osu! Tourney Match Displayer is released under [GPL-3.0](https://github.com/AkinariHex/oTMD/blob/master/LICENSE) and is available on [GitHub](https://github.com/AkinariHex/oTMD). Donations are voluntary and do not unlock any feature.
`;

function Legal() {
  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-2">
      <PageHeader title="Legal" />
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
          {NOTICE}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export default Legal;
