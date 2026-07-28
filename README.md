<div align="center">

# Mural MCP Server

**Read your Mural boards from Claude.**

Pull sticky-note text, summarize workshop output, browse workspaces, and reach
the wider Mural API — all without leaving your assistant.

[![CI](https://github.com/stephschofield/mural-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/stephschofield/mural-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](https://nodejs.org)
[![Read-only](https://img.shields.io/badge/access-read--only-blue.svg)](SECURITY.md#design-guarantees)

[Install](#quickstart) · [Usage](docs/USAGE.md) · [API](docs/API.md) · [Architecture](docs/ARCHITECTURE.md) · [Security](SECURITY.md)

</div>

---

## The problem

A workshop ends. Ninety sticky notes sit on a Mural board, color-coded, grouped
into columns that meant something in the room. Turning that into a summary, a
backlog, or a decision record is manual transcription — so mostly it does not
happen, and the board becomes a screenshot nobody reads again.

Mural has a capable public API, but reaching it means OAuth plumbing,
15-minute token expiry, pagination, rate limits, and response envelopes that
change shape by endpoint. That is a day of work before you read your first
sticky note.

**This server closes that gap.** Point Claude at a board and ask for what you
need.

```
You:    Read our Sprint Retro board grouped by color and give me the
        top themes with counts, plus every action item.

Claude: (list_workspaces → list_rooms → list_murals → get_mural_text)

        Scanned 240 widgets, 90 text items across 3 color categories.

        Went well (green, 31)     — pairing cadence, faster reviews
        Needs work (yellow, 44)   — flaky CI, unclear ownership
        Blockers (red, 12)        — staging parity, on-call load

        Action items: 8 → [table]
```

## Who it is for

| | |
|---|---|
| **Product managers** | Turn workshop boards into written summaries, themes, and action items. Recover the category structure encoded in sticky colors. |
| **Engineers** | Pull board data into files and pipelines. Audit access. Inspect raw widget geometry. Reach ~100 endpoints without writing OAuth code. |
| **Facilitators** | Draft post-session recaps, surface unanswered questions, retrieve voting results and decisions. |

Recipes for each in the **[Usage Guide](docs/USAGE.md)**.

## Read-only by design

This server **cannot create, modify, or delete anything** in Mural. That is
structural, not a policy note — four independent layers enforce it:

1. **Scopes.** OAuth requests `*:read` only. Mural itself rejects writes.
2. **Client surface.** `MuralClient` exposes exactly one verb: `get()`. No
   `post`/`put`/`patch`/`delete` method exists to call.
3. **Catalog.** The action catalog contains only GET paths, so no crafted
   argument turns `execute_action` into a write.
4. **Declared contract.** Every tool sets `readOnlyHint: true`.

Adding write support would require deliberately editing three files. See
[SECURITY.md](SECURITY.md#design-guarantees).

## Quickstart

**Prerequisites:** Node 18+, a Mural account, an MCP client.

```bash
# 1. Install
git clone https://github.com/stephschofield/mural-mcp.git
cd mural-mcp && npm install && npm run build

# 2. Credentials (from app.mural.co → avatar menu → "Create and manage apps")
export MURAL_CLIENT_ID=your_client_id
export MURAL_CLIENT_SECRET=your_client_secret

# 3. Authorize — opens a browser, caches tokens at ~/.mural-mcp/tokens.json (0600)
npm run auth

# 4. Register with Claude Code
claude mcp add mural --scope user \
  -e MURAL_CLIENT_ID="$MURAL_CLIENT_ID" \
  -e MURAL_CLIENT_SECRET="$MURAL_CLIENT_SECRET" \
  -- node "$(pwd)/build/index.js"
```

Restart Claude Code, run `/mcp` to confirm, then ask: *"Check my Mural connection."*

> When creating the Mural app, set the **Redirect URL** to exactly
> `http://localhost:3000/callback` and enable these scopes:
> `workspaces:read`, `rooms:read`, `murals:read`, `templates:read`,
> `users:read`, `identity:read`.
>
> The client secret is shown **once**.

Claude Desktop, WSL, headless hosts, and troubleshooting are covered in the
**[Installation Guide](docs/INSTALLATION.md)**.

## Tools

| Tool | Purpose |
|---|---|
| `check_connection` | Verify auth; show user, scopes, rate-limit status |
| `list_workspaces` | List your workspaces |
| `list_rooms` | List rooms in a workspace |
| `list_murals` | List murals in a room or workspace |
| `get_mural` | Metadata for one mural |
| **`get_mural_text`** | **Main tool** — all text in reading order, optional color grouping |
| `get_mural_summary` | Widget counts by type + text sample |
| `get_mural_widgets` | Raw widgets with geometry and style |
| `search_murals` | Find murals by text query |
| `search_actions` | Discover 24 more read-only API operations |
| `execute_action` | Run a discovered action |

Typical flow: `list_workspaces` → `list_rooms` → `list_murals` → `get_mural_text`

**Why 11 tools and not 100.** Mural exposes roughly a hundred endpoints.
Declaring each as its own tool would put a hundred schemas in the context window
on *every* request, degrading tool selection and raising cost. Instead, the
high-traffic paths get dedicated tools with typed schemas, and the remaining 24
read operations — tags, voting results, timers, templates, folders,
membership — live in a catalog reached via `search_actions` / `execute_action`.
Those cost nothing until searched. Full rationale in
[ARCHITECTURE.md](docs/ARCHITECTURE.md#tool-design-why-hybrid).

## Design notes

**15-minute access tokens.** The dominant constraint. Tokens are cached on disk
(mode `0600`) so a refresh survives restarts, refreshed 60 s before expiry, and
retried once after an unexpected `401`.

**Rate limits.** Requests are serialized through a promise chain and spaced to
~20/sec — deliberately under Mural's per-user cap. `429` responses honour
`Retry-After`, capped at 30 s so a bad header cannot hang the client.

**Inconsistent envelopes.** Mural's `value` field arrives as an array, as
`{widgets:[...]}`, or as a numeric-keyed object depending on the endpoint.
`normalizeItems` handles all three — behavior carried over from the v1
prototype, which found these the hard way against the live API.

**Big boards.** Page walks stop at 20 pages (5 for search) and responses report
`truncated: true` rather than silently returning partial data — the model can
tell "that's everything" from "there's more."

**Reading order.** Extracted text is sorted top-to-bottom, left-to-right with a
row tolerance, so a board's visual structure survives into the model's
interpretation instead of arriving as a shuffled deck.

## Documentation

| Document | Contents |
|---|---|
| [Installation](docs/INSTALLATION.md) | Full setup, all clients, config reference, troubleshooting |
| [Usage](docs/USAGE.md) | Recipes by role; working with large boards; prompting tips |
| [API Reference](docs/API.md) | Every tool and action, parameters, return shapes, limits |
| [Architecture](docs/ARCHITECTURE.md) | Module map, design decisions, how to extend |
| [Mural API Alignment](docs/MURAL_API_ALIGNMENT.md) | What was verified against Mural's docs, and one place they diverge |
| [Security](SECURITY.md) | Threat model, guarantees, credential handling, revocation |
| [Contributing](CONTRIBUTING.md) | Development setup, PR guidance, style |

## Project layout

```
src/
├── config.ts     Endpoints, scopes, env loading
├── auth.ts       Token cache, refresh, code exchange
├── auth-cli.ts   `npm run auth` — localhost OAuth flow
├── client.ts     GET-only HTTP: throttle, retry, pagination, normalization
├── widgets.ts    Text extraction, type labelling, reading order
├── actions.ts    Long-tail action catalog + search
└── index.ts      MCP server and tool definitions

legacy/           v1 prototype (March 2026), archived — see legacy/README.md
```

## Development

```bash
npm run dev        # tsc --watch
npm run typecheck  # no emit
npm run build      # compile + chmod
```

CI runs typecheck and build on Node 18/20/22, boots the server to verify it
speaks MCP, and gates every push on a secret scan.

## License

[MIT](LICENSE)
