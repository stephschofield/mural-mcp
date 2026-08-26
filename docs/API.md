# API Reference

Every tool this server exposes, with parameters, return shapes, and guidance on
when to reach for each one.

- [Tool index](#tool-index)
- [Diagnostics](#diagnostics)
- [Navigation](#navigation)
- [Board contents](#board-contents)
- [Search](#search)
- [Long-tail access](#long-tail-access)
- [Action catalog](#action-catalog)
- [Error handling](#error-handling)
- [Limits](#limits)

---

## Tool index

| Tool | Use it when |
|---|---|
| [`check_connection`](#check_connection) | Something failed and you need to know why |
| [`list_workspaces`](#list_workspaces) | Starting out — you need a workspace id |
| [`list_rooms`](#list_rooms) | Browsing a workspace's structure |
| [`list_murals`](#list_murals) | Finding boards in a room or workspace |
| [`get_mural`](#get_mural) | You need a board's metadata, not its contents |
| [`get_mural_text`](#get_mural_text) | **Most common** — reading what a board says |
| [`get_mural_structure`](#get_mural_structure) | Workshop capture: stickies, notes, images, stickers, areas |
| [`get_mural_summary`](#get_mural_summary) | Deciding whether a board is worth reading in full |
| [`get_mural_widgets`](#get_mural_widgets) | You need positions, colors, or raw fields |
| [`search_murals`](#search_murals) | The user named a board but you lack its id |
| [`search_actions`](#search_actions) | No dedicated tool covers what you need |
| [`execute_action`](#execute_action) | Running an action found via `search_actions` |

All tools are annotated `readOnlyHint: true`. None can modify Mural.

**Typical flow:** `list_workspaces` → `list_rooms` → `list_murals` → `get_mural_structure` or `get_mural_text`

---

## Diagnostics

### `check_connection`

Verify authentication and report connection health. Run this first when
anything fails.

**Parameters:** none

**Returns**

```jsonc
{
  "connected": true,
  "user": { "id": "...", "email": "...", "firstName": "...", "lastName": "..." },
  "grantedScopes": ["workspaces:read", "rooms:read", "murals:read", "..."],
  "accessTokenExpiresAt": "2026-07-28T12:34:56.000Z",
  "rateLimit": {
    "limit": 25,
    "remaining": 24,
    "resetAt": "2026-07-28T12:35:00.000Z",
    "appLimit": 10000,
    "appRemaining": 9998,
    "appResetAt": "2026-07-28T12:36:00.000Z"
  },
  "mode": "read-only"
}
```

Mural enforces two parallel limits — 25 req/user/sec and 10,000 req/app/min —
and reports each separately. The `app*` fields cover the application-wide quota
shared across all users of your Mural app.

Compare `grantedScopes` against what a failing tool requires — a `403` almost
always means a missing scope.

**Errors:** `No cached tokens` → run `npm run auth`.

---

## Navigation

### `list_workspaces`

List all workspaces the authenticated user belongs to. Most other tools need a
workspace id, so this is usually the first call.

**Parameters:** none

**Returns**

```jsonc
{
  "count": 3,
  "truncated": false,
  "workspaces": [{ "id": "...", "name": "Product Team" }]
}
```

---

### `list_rooms`

List rooms in a workspace. Rooms group related murals.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `workspaceId` | string | yes | From `list_workspaces` |

**Returns**

```jsonc
{
  "count": 12,
  "truncated": false,
  "rooms": [{ "id": "...", "name": "Q3 Planning", "type": "private", "muralCount": 8 }]
}
```

`muralCount` is `null` when Mural does not report it for that room type.

---

### `list_murals`

List murals in a room (preferred) or across an entire workspace.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `roomId` | string | one of | Lists murals in that room |
| `workspaceId` | string | one of | Lists all murals in the workspace |

Supply **exactly one**. Prefer `roomId` — a workspace-wide listing on a large
org will hit the pagination cap.

**Returns**

```jsonc
{
  "count": 8,
  "truncated": false,
  "murals": [{
    "id": "...", "title": "Sprint Retro",
    "createdOn": "...", "updatedOn": "...", "roomId": "..."
  }]
}
```

Untitled boards report `"(Untitled)"`.

**Errors:** `Provide either roomId or workspaceId.`

---

### `get_mural`

Metadata for one mural — title, dimensions, timestamps, sharing settings. This
does **not** return board contents; use `get_mural_text` for that.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `muralId` | string | yes | From `list_murals` or `search_murals` |

---

## Board contents

### `get_mural_text`

**The main tool.** Extracts all readable text from a board — sticky notes, text
boxes, shapes, titles, cards, comments — in visual reading order
(top-to-bottom, left-to-right).

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `muralId` | string | yes | From `list_murals` |
| `types` | string[] | no | Widget-type filter, e.g. `["sticky"]`. Matched as a substring, case-insensitive. Omit for all text-bearing widgets. |
| `groupByColor` | boolean | no | Group by sticky-note background color |

**Returns**

```jsonc
{
  "muralId": "...",
  "widgetsScanned": 868,
  "textItems": 287,
  "truncated": false,
  "items": [{
    "id": "...", "type": "Sticky Note", "text": "Ship the docs",
    "x": 120, "y": 340, "color": "#FFF2CC", "parentId": null
  }]
}
```

With `groupByColor: true`, `items` is replaced by `groupedByColor`:

```jsonc
{
  "groupedByColor": {
    "#FFF2CC": ["Ship the docs", "Fix onboarding"],
    "#D9EAD3": ["Went well: pairing"],
    "no color": ["Retro — Sprint 14"]
  }
}
```

> **Color encodes meaning.** Workshop boards routinely use sticky color as a
> category axis (went-well vs. needs-improvement, or one color per workstream).
> `groupByColor` recovers that structure, which plain text order loses.

**Reading order:** items are sorted by `y`, then `x`, with a 100-unit row
tolerance so stickies in a visual row stay together rather than scattering by a
few pixels of vertical drift.

---

### `get_mural_structure`

Workshop capture. Splits every widget into areas, sticky notes, other text
notes, images, and stickers/icons (Mural `icon` widgets). Use this for
envisioning boards where photos, logos, and vote stickers matter alongside
stickies.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `muralId` | string | yes | From `list_murals` |

**Returns**

```jsonc
{
  "muralId": "...",
  "widgetsScanned": 868,
  "truncated": false,
  "counts": {
    "areas": 6,
    "stickyNotes": 80,
    "notes": 40,
    "images": 12,
    "stickers": 28,
    "other": 70
  },
  "areas": [{ "id": "...", "type": "Area", "text": "Journey map", "x": 0, "y": 0 }],
  "stickyNotes": [{ "id": "...", "type": "Sticky Note", "text": "Need SSO", "color": "#FFF2CC" }],
  "notes": [{ "id": "...", "type": "Text", "text": "Pain points" }],
  "images": [{
    "id": "...", "type": "Image", "name": "current-state.png",
    "caption": "As-is process", "url": "https://..."
  }],
  "stickers": [{ "id": "...", "type": "Sticker", "name": "thumbs-up" }]
}
```

Image and sticker URLs are taken from the first populated field among `url`,
`src`, `thumbnailUrl`, `imageUrl`, `hyperlink`, and `href`, including nested
`properties`. Prefer `get_mural_text` when you only need words.

---

### `get_mural_summary`

Widget counts by type plus a text sample. Much cheaper than `get_mural_text` —
use it to decide whether a board is worth reading in full.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `muralId` | string | yes | From `list_murals` |

**Returns**

```jsonc
{
  "muralId": "...",
  "totalWidgets": 868,
  "truncated": false,
  "widgetTypes": { "Sticky Note": 80, "Text": 88, "Shape": 40 },
  "textItemCount": 287,
  "sampleText": ["Retro — Sprint 14", "Went well: pairing"]
}
```

`widgetTypes` is sorted by count descending. `sampleText` holds the first 15
items in reading order.

---

### `get_mural_widgets`

Raw widget objects including geometry and style. Use when you need positions,
colors, or fields the text extractor omits. Far more verbose than
`get_mural_text` — prefer that for reading content.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `muralId` | string | yes | From `list_murals` |
| `limit` | integer | no | Max widgets to return. Default 50, max 200. |

`truncated` is `true` if either the page walk stopped early **or** the result was
capped by `limit`.

---

## Search

### `search_murals`

Find murals by title or content across the user's workspaces.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `query` | string | yes | e.g. `"retrospective"` |
| `workspaceId` | string | no | Restrict to one workspace |

Search walks at most 5 pages (vs. 20 elsewhere). Narrow the query rather than
paging deeper.

---

## Long-tail access

Mural exposes roughly a hundred endpoints. Declaring each as its own tool would
flood the context window, so the 24 lower-traffic read operations live in a
catalog reached by search. See
[ARCHITECTURE.md](ARCHITECTURE.md#tool-design-why-hybrid) for the rationale.

### `search_actions`

Discover read-only operations not covered by a dedicated tool.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `query` | string | yes | Plain-English intent, e.g. `"voting results"` |

**Returns**

```jsonc
{
  "query": "voting results",
  "totalAvailable": 24,
  "matches": [{
    "actionId": "get_voting_results",
    "description": "Get the results of a voting session — useful for summarizing team decisions.",
    "requiredScope": "murals:read",
    "parameters": [
      { "name": "muralId", "required": true, "description": "The mural id." },
      { "name": "votingSessionId", "required": true, "description": "The voting session id." }
    ]
  }],
  "hint": "Call execute_action with actionId and a params object."
}
```

No match returns an empty list with a hint noting the server is read-only —
creating or modifying content is not supported.

---

### `execute_action`

Run an action discovered via `search_actions`. Always search first to get the
`actionId` and its parameters.

| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `actionId` | string | yes | From `search_actions` |
| `params` | object | no | String/number values, e.g. `{ "muralId": "abc123" }` |

**Returns** — paginated actions:

```jsonc
{ "actionId": "list_mural_tags", "count": 12, "truncated": false, "items": [ ... ] }
```

Non-paginated actions:

```jsonc
{ "actionId": "get_current_user", "result": { ... } }
```

**Errors**

| Message | Meaning |
|---|---|
| `Unknown actionId "x"` | Not in the catalog — call `search_actions` |
| `Missing required parameter "y" for action "x"` | Includes the parameter's description so you can supply it |
| `Parameter "z" was not supplied for action "x"` | A path placeholder went unfilled |

Validation happens before dispatch, so mistakes produce a correctable message
rather than a `404`.

---

## Action catalog

The 24 read-only operations reachable via `search_actions` / `execute_action`.

### Workspaces

| Action ID | Path | Scope |
|---|---|---|
| `get_workspace` | `/workspaces/{workspaceId}` | `workspaces:read` |

### Rooms

| Action ID | Path | Scope |
|---|---|---|
| `get_room` | `/rooms/{roomId}` | `rooms:read` |
| `list_open_rooms` | `/workspaces/{workspaceId}/rooms/open` | `rooms:read` |
| `list_room_folders` | `/rooms/{roomId}/folders` | `rooms:read` |

### Murals

| Action ID | Path | Scope |
|---|---|---|
| `get_mural` | `/murals/{muralId}` | `murals:read` |
| `list_recently_opened_murals` | `/workspaces/{workspaceId}/murals/recently-opened` | `murals:read` |
| `get_mural_export_url` | `/murals/{muralId}/export-url` | `murals:read` |

> `get_mural_export_url` retrieves the URL of an export that was already
> started elsewhere. It does not start one — that would be a write.

### Mural contents

| Action ID | Path | Scope |
|---|---|---|
| `get_widget` | `/widgets/{widgetId}` | `murals:read` |
| `list_mural_tags` | `/murals/{muralId}/tags` | `murals:read` |
| `get_tag` | `/tags/{tagId}` | `murals:read` |
| `list_mural_files` | `/murals/{muralId}/files` | `murals:read` |
| `list_voting_sessions` | `/murals/{muralId}/voting-sessions` | `murals:read` |
| `get_voting_session` | `/murals/{muralId}/voting-sessions/{votingSessionId}` | `murals:read` |
| `get_voting_results` | `/murals/{muralId}/voting-sessions/{votingSessionId}/results` | `murals:read` |
| `get_mural_timer` | `/murals/{muralId}/timer` | `murals:read` |

### Templates

| Action ID | Path | Scope |
|---|---|---|
| `list_default_templates` | `/templates/default` | `templates:read` |
| `list_workspace_templates` | `/workspaces/{workspaceId}/templates` | `templates:read` |
| `list_recent_templates` | `/templates/recent` | `templates:read` |

### Users

| Action ID | Path | Scope |
|---|---|---|
| `get_current_user` | `/users/me` | `identity:read` |
| `list_mural_users` | `/murals/{muralId}/users` | `users:read` |
| `list_room_users` | `/rooms/{roomId}/users` | `users:read` |

### Search

| Action ID | Path | Scope |
|---|---|---|
| `search_murals` | `/search/murals?q=` | `murals:read` |
| `search_rooms` | `/search/rooms?q=` | `rooms:read` |
| `search_templates` | `/search/templates?q=` | `templates:read` |

---

## Error handling

Errors return `isError: true` with a message that says what to do, not just what
broke.

| HTTP | Message shape | What to do |
|---|---|---|
| `401` | `Unauthorized on {path}. Refresh failed — re-run npm run auth.` | Refresh already retried once and failed. Re-authorize. |
| `403` | `Forbidden on {path}. The token lacks the required scope...` | Enable the scope on the Mural app, re-run `npm run auth`. |
| `404` | `Not found: {path}. Check the id is correct and still exists.` | Verify the id via a list tool. |
| `429` | `Rate limited on {path}...` | Already retried after `Retry-After`. Reduce request volume. |
| other | `Mural API error {status} on {path}: {detail}` | Response body included, truncated to 300 chars. |

A `401` is retried once automatically after a forced token refresh. You only see
the error if the retry also failed.

---

## Limits

### Mural's limits

Verified against Mural's published documentation:

| Limit | Value | Source |
|---|---|---|
| Access token lifetime | 15 minutes | [OAuth docs](https://developers.mural.co/public/docs/oauth) |
| Per-user rate limit | 25 requests/user/second | [Rate limiting docs](https://developers.mural.co/public/docs/rate-limiting) |
| Per-app rate limit | 10,000 requests/app/minute | [Rate limiting docs](https://developers.mural.co/public/docs/rate-limiting) |

Exceeding either returns `429`. Both are reported through `check_connection`.

### This server's limits

| Limit | Value | Notes |
|---|---|---|
| Token refresh margin | 60 seconds | Refreshes before expiry rather than reacting to failure |
| Client-side throttle | ~20 req/sec | Deliberate headroom under Mural's 25/sec cap |
| Page walk (most tools) | 20 pages | Reports `truncated: true` when hit |
| Page walk (search) | 5 pages | Narrow the query instead of paging deeper |
| `get_mural_widgets` limit | 200 max, 50 default | Keeps responses manageable |
| `search_actions` results | 8 | Ranked by relevance |
| `Retry-After` cap | 30 seconds | A hostile or buggy header cannot hang the client |
| Error detail | 300 chars | Response bodies are truncated |

**`truncated` always means something.** When it is `true`, the result is
incomplete — narrow your query rather than treating it as the full picture.
