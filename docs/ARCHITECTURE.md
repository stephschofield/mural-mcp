# Architecture

How the server is built and why. Read this before making changes.

- [Overview](#overview)
- [Module map](#module-map)
- [The four hard problems](#the-four-hard-problems)
- [Tool design: why hybrid](#tool-design-why-hybrid)
- [Read-only enforcement](#read-only-enforcement)
- [Request lifecycle](#request-lifecycle)
- [Extending the server](#extending-the-server)

---

## Overview

`mural-mcp` is a stdio MCP server that exposes the Mural public API to an LLM
client. It is deliberately **read-only**: it can describe what is on a board but
cannot change it.

```
┌─────────────┐   MCP over stdio   ┌──────────────┐   HTTPS GET   ┌───────────┐
│ Copilot/Claude │ ◄────────────────► │  mural-mcp   │ ◄───────────► │ Mural API │
│ CLI / VS Code │   JSON-RPC 2.0     │  (this repo) │   Bearer      │  public/v1│
└─────────────┘                    └──────┬───────┘               └───────────┘
                                          │
                                          ▼
                                 ~/.mural-mcp/tokens.json
                                        (0600)
```

stdout carries the MCP protocol exclusively. Every diagnostic goes to stderr —
a single stray `console.log` would corrupt the transport.

---

## Module map

| File | Lines | Responsibility |
|---|---:|---|
| `src/index.ts` | ~490 | MCP server; the 11 tool definitions |
| `src/actions.ts` | ~360 | Long-tail action catalog, search, request builder |
| `src/client.ts` | ~210 | GET-only HTTP: throttle, retry, paginate, normalize |
| `src/widgets.ts` | ~165 | Text extraction, type labelling, reading order |
| `src/auth.ts` | ~160 | Token cache, refresh, code exchange |
| `src/auth-cli.ts` | ~135 | `npm run auth` — local OAuth callback flow |
| `src/config.ts` | ~78 | Endpoints, scopes, environment loading |

Dependency direction is strictly one-way; there are no cycles:

```
index.ts ──► actions.ts
    │  └───► widgets.ts
    └──────► client.ts ──► auth.ts ──► config.ts
```

`config.ts` depends on nothing. `widgets.ts` and `actions.ts` are pure — no I/O,
no network — which makes them the easiest units to test.

---

## The four hard problems

Everything non-obvious in this codebase traces to one of these.

### 1. Access tokens expire in 15 minutes

Short enough that a user will hit expiry mid-session, every session. Naive
handling makes the server feel broken.

The response is layered:

- Tokens persist to disk, so a refresh survives a process restart. (The March
  prototype held them in memory and lost them on every exit.)
- `getValidAccessToken()` refreshes proactively, 60 s before expiry
  (`TOKEN_REFRESH_MARGIN_MS`), rather than waiting for a failure.
- An unexpected `401` triggers one forced refresh and a single retry — clock
  skew and server-side revocation both land here.
- The retry is guarded by an `isRetry` flag, so a genuinely bad token produces
  one clear error instead of an infinite loop.

### 2. Rate limits

Mural enforces a per-user per-second cap. Exceeding it returns `429` and, under
load, degrades the experience for everything else using that token.

- Requests are **serialized** through a promise chain (`this.queue`) so
  concurrent tool calls cannot burst.
- They are **spaced** to stay under the cap with headroom
  (`MAX_REQUESTS_PER_SECOND = 20` against a documented 25).
- `429` responses honour `Retry-After`, capped at 30 s so a hostile or buggy
  header cannot hang the client indefinitely.
- Rate-limit headers are captured on every response and surfaced through
  `check_connection`, so a user can see how close they are.

### 3. Response envelopes are inconsistent

This was discovered empirically against the live API. Mural's `value` field
arrives in at least three shapes depending on the endpoint:

```jsonc
{ "value": [ ... ] }                        // most list endpoints
{ "value": { "widgets": [ ... ] } }         // some widget responses
{ "value": { "0": {...}, "1": {...} } }     // numeric-keyed object
```

`normalizeItems()` handles all three, in that order of preference, and returns
`[]` rather than throwing when it recognizes nothing. Defensive parsing is the
right call here: a shape change should degrade a single tool, not crash the
server.

Pagination cursors are equally inconsistent — `extractNext()` checks both
`body.next` and `body.value.next` / `body.value.nextToken`.

### 4. Boards can be enormous

A real workshop board can hold thousands of widgets. Returning all of them would
blow the context window and burn the rate limit.

- `getAllPages()` caps the walk at 20 pages (5 for search).
- Responses report `truncated: true` rather than silently returning partial
  data — the model can tell the difference between "that's everything" and
  "there's more."
- `get_mural_summary` exists so a model can cheaply decide whether a board is
  worth reading in full.
- `get_mural_text` returns extracted text only, not raw widget geometry — an
  order of magnitude smaller.

---

## Tool design: why hybrid

Mural exposes roughly a hundred endpoints. Two obvious designs both fail:

| Approach | Failure |
|---|---|
| One MCP tool per endpoint | ~100 schemas in the context window on *every* request. Tool selection degrades; cost rises for everyone. |
| One generic `call_api(path)` tool | The model must know Mural's URL structure. Hallucinated paths, no parameter validation, no discoverability. |

This server does both, split by traffic:

- **10 dedicated tools** cover the high-traffic paths (navigation, board
  contents including workshop structure, search). These carry rich descriptions
  and typed Zod schemas, so the model uses them correctly without guessing.
- **`search_actions` + `execute_action`** reach the long tail. The model
  describes intent in plain English, gets back matching action IDs with their
  parameters, then executes one. The 24 catalog entries cost nothing until
  searched.

`searchActions()` uses simple weighted term matching — exact ID match scores
highest, then exact keyword, then partial keyword, then any text. It is not
semantic search, and it does not need to be: the catalog is small and
hand-curated with deliberately generous keyword lists.

`buildRequest()` validates before dispatch. A missing required parameter raises
a message naming the parameter and describing it, so the model can self-correct
— far better than a `404` from a malformed URL.

---

## Read-only enforcement

Read-only is a structural property here, not a policy note. Four independent
layers:

1. **Scope.** The OAuth flow requests `*:read` scopes only. Mural itself will
   reject a write, whatever the client attempts.
2. **Client surface.** `MuralClient` has exactly one public verb: `get()`. There
   is no `post`/`put`/`patch`/`delete` method in the class to call.
3. **Catalog.** `ACTIONS` contains only GET paths. `execute_action` can reach
   nothing outside it, so no crafted argument turns it into a write.
4. **Declared contract.** Every tool sets `readOnlyHint: true`, and the server
   instructions state the limitation, so the model does not attempt writes and
   waste a turn.

Adding write support would require deliberately editing three files. That is the
intent — it should never happen by accident.

---

## Request lifecycle

Tracing `get_mural_text`:

```
1. Model calls get_mural_text { muralId }
2. handler() wraps execution so a throw becomes a tool error, not a crash
3. fetchWidgets() → client.getAllPages("/murals/{id}/widgets")
4.   ├─ queue: wait for any in-flight request
5.   ├─ throttle: sleep until the per-request interval has elapsed
6.   ├─ getValidAccessToken(): refresh if within 60 s of expiry
7.   ├─ fetch() with Bearer token
8.   ├─ captureRateLimit() from response headers
9.   ├─ on 401 → forceRefresh() + one retry
10.  ├─ on 429 → sleep Retry-After (≤30 s) + one retry
11.  ├─ on other error → MuralApiError with actionable guidance
12.  ├─ normalizeItems() flattens whichever envelope arrived
13.  └─ loop on `next` cursor, up to maxPages
14. extractTexts() probes each widget's text fields, strips HTML
15. inReadingOrder() sorts top-to-bottom, left-to-right
16. ok() serializes to JSON text content
```

Steps 4–13 are shared by every tool. Steps 14–15 are specific to text
extraction.

### Text extraction, specifically

Mural stores widget text in different fields by widget type, sometimes as HTML.
`extractTextFromWidget()` probes a field list in priority order —
`text`, `title`, `htmlText`, `content`, `plainText` — takes the first non-empty
one, strips tags, decodes entities, and collapses whitespace.

`inReadingOrder()` sorts by `y` then `x` with a 100-unit row tolerance. Without
the tolerance, stickies nudged a few pixels apart would sort into different
rows and scramble the reading order. With it, a visual row stays a row.

This matters more than it sounds: a workshop board's meaning is partly
positional. Returning API order would hand the model a shuffled deck.

---

## Extending the server

### Add a long-tail read endpoint

Append to `ACTIONS` in `src/actions.ts`:

```ts
{
  id: "list_mural_chat",
  description: "List chat messages posted on a mural.",
  path: "/murals/{muralId}/chat",
  params: [pathParam("muralId", "The mural id.")],
  scope: "murals:read",
  keywords: ["chat", "message", "discussion", "comment"],
  paginated: true,
}
```

No other file changes. Be generous with `keywords` — that is the only thing
making the action discoverable.

### Promote an action to a dedicated tool

Justified when a call is high-traffic, needs response shaping, or needs
parameter validation richer than the catalog expresses. Register it in
`src/index.ts` with a Zod schema and `readOnlyHint: true`, and describe *when*
to use it, not just what it does — descriptions are the model's only routing
signal.

### Support a new widget type

Add its raw type string to `TEXT_BEARING_TYPES` and a display name to
`TYPE_LABELS` in `src/widgets.ts`. If it stores text in an unusual field, add
that field to `TEXT_FIELDS`.

### Local development

```bash
npm run dev        # tsc --watch
npm run typecheck  # no emit
npm run build      # compile + chmod
```

Test the server directly over stdio:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
  | node build/index.js
```

Because `widgets.ts` and `actions.ts` are pure, they can be exercised without
network access or credentials — start there when adding tests.
