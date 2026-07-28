# Mural MCP Server

Read-only access to Mural boards from Claude. Pull sticky-note text, summarize
workshop boards, browse workspaces, and reach the wider Mural API through a
search/execute pair.

**v2** replaces the March prototype: real OAuth login, on-disk token cache,
pagination, rate limiting, and TypeScript. The original is preserved as
`index.js` (`npm run legacy`) and in git history.

## Why read-only

The server requests read scopes only and its HTTP client issues `GET`
exclusively. No tool call can create, modify, or delete a mural, widget, or
room. To add write capability you would have to widen the scopes, add the
endpoints to the action catalog, and add mutating verbs to the client — three
deliberate steps, not an accident.

## Tools

| Tool | Purpose |
|---|---|
| `check_connection` | Verify auth; show user, scopes, rate-limit status |
| `list_workspaces` | List your workspaces |
| `list_rooms` | List rooms in a workspace |
| `list_murals` | List murals in a room or workspace |
| `get_mural` | Metadata for one mural |
| `get_mural_text` | **Main tool** — all text in reading order, optional color grouping |
| `get_mural_summary` | Widget counts by type + text sample |
| `get_mural_widgets` | Raw widgets with geometry and style |
| `search_murals` | Find murals by text query |
| `search_actions` | Discover ~25 more read-only API operations |
| `execute_action` | Run a discovered action |

`search_actions` + `execute_action` cover tags, voting sessions and results,
timers, templates, folders, room/mural members, and current-user — without
putting a hundred tool schemas in the context window.

## Setup

### 1. Create a Mural app

1. Sign in at [app.mural.co](https://app.mural.co)
2. Avatar menu → **Create and manage apps** → **New app**
3. Set **Redirect URL** to exactly `http://localhost:3000/callback`
4. Copy the **Client ID** and **Client secret**
   — the secret is shown **once**; use **Reset** if lost
5. Enable these scopes:
   `workspaces:read`, `rooms:read`, `murals:read`, `templates:read`,
   `users:read`, `identity:read`

No approval is needed and `localhost` redirects are accepted.

### 2. Set credentials

Export in your shell profile (keeps secrets out of config files):

```bash
export MURAL_CLIENT_ID=your_client_id
export MURAL_CLIENT_SECRET=your_client_secret
```

Or copy `.env.example` to `.env` — both are gitignored.

### 3. Build and authorize

```bash
npm install
npm run build
npm run auth      # opens the browser, captures the code, caches tokens
```

Tokens are written to `~/.mural-mcp/tokens.json` (mode 0600). Access tokens
expire after 15 minutes; the server refreshes them automatically, so this is a
one-time step.

### 4. Register with Claude Code

```bash
claude mcp add mural --scope user \
  -e MURAL_CLIENT_ID="$MURAL_CLIENT_ID" \
  -e MURAL_CLIENT_SECRET="$MURAL_CLIENT_SECRET" \
  -- node ~/repos/mural-mcp/build/index.js
```

Then restart Claude Code and run `/mcp` to confirm it connected.

## Usage

```
"List my Mural workspaces"
"What's on mural <id>?"
"Pull the sticky notes from <id> grouped by color"
"Summarize the retro board in room <id>"
"Show the voting results from mural <id>"
```

Typical flow: `list_workspaces` → `list_rooms` → `list_murals` →
`get_mural_text`.

## Design notes

**15-minute tokens.** The dominant constraint. Tokens are cached on disk so a
refresh survives restarts, refreshed 60s before expiry, and retried once on an
unexpected 401.

**Rate limits.** Mural allows 25 req/user/sec and 10,000 req/app/min. Requests
are serialized and spaced to ~20/sec, with `Retry-After` honored on 429.

**Inconsistent envelopes.** `value` may arrive as an array, `{widgets:[...]}`,
or a numeric-keyed object depending on endpoint. `normalizeItems` handles all
three — behavior carried over from the March server, which found these the hard
way against the live API.

**Pagination caps.** Page walks stop at 20 pages (5 for search) and responses
report `truncated: true` rather than silently returning partial data.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Not authenticated" | `npm run auth` |
| 403 on a tool | Scope not enabled on the Mural app; enable it, then re-run `npm run auth` |
| `EADDRINUSE` during auth | Free port 3000, or change `MURAL_REDIRECT_URI` **and** the app's redirect URL |
| Auth browser never opens | Paste the printed URL manually (common in WSL) |
| Empty widget list | Confirm the mural id and that your account can open the board |

## Layout

```
src/
├── config.ts     Endpoints, scopes, env loading
├── auth.ts       Token cache, refresh, code exchange
├── auth-cli.ts   `npm run auth` — localhost OAuth flow
├── client.ts     GET-only HTTP: throttle, retry, pagination, normalization
├── widgets.ts    Text extraction and summarization
├── actions.ts    Long-tail action catalog + search
└── index.ts      MCP server and tool definitions
```
