# SideStream Hack 2026

A static explorer for the SideStream Hack 2026 waste-stream × use-case matrix (Technion, 26–27 November 2026). It loads the exported tables in the browser: search, filter, and sort streams, products, and routes; open the ranked views from the database; build a context basket; and ask questions with your own OpenAI API key.

Published site: https://beny-karachun.github.io/hackathon2026/

The key stays in `localStorage` in your browser and is sent only to `api.openai.com`. The default model is **GPT 6.1 Sol** (`gpt-6.1-sol`) at reasoning effort **medium**. The model menu also lists **GPT 6 Luna** (`gpt-6-luna`). A slider sets the effort (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`). If the chosen model does not accept that effort, the request uses the closest level it does accept and the settings say so.

Model ids are from OpenAI’s docs:

- [GPT 6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) accepts `low`, `medium` (default), `high`, `xhigh`, and `max`.
- [GPT 6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) also accepts `none`.
- The effort list is the [reasoning guide](https://developers.openai.com/api/docs/guides/reasoning) / Responses API enum.

Calls use `POST https://api.openai.com/v1/responses` with `reasoning.effort`, `stream: true`, and `store: false`. Temperature is not sent.

## Develop

```bash
npm install
npm run dev
```

Open the URL Vite prints (the base path is `/hackathon2026/`). `npm test` checks the request shape, filters, and that the exported numbers still match the database identities. `npm run build` writes `dist/`.

## Update the data

The site does not ship the SQLite file. Table JSON under `data/` is the source the browser loads. Values are copied from the database; blanks stay blank.

1. Place `sidestream.db` somewhere local.
2. Run `python3 scripts/export_data.py path/to/sidestream.db data`.
3. The script checks gross, net, annual value, market cap, hackathon fit, and TRL fit. If a check fails, it stops rather than publishing a wrong legend.
4. Commit the updated `data/` files. Column meanings live in `data/meta.json` (from `docs/SPEC.md` and `docs/ROUTE_SPEC.md`).

`docs/` holds the original spec, sponsor notes, and build summary that came with the database.

## GitHub Pages

`.github/workflows/pages.yml` builds the site and deploys it with GitHub Actions. In the repository settings, **Pages → Build and deployment → Source** must be **GitHub Actions**. A branch-based Pages source will not run this workflow’s deploy job.
