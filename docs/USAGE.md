# Usage Guide

Practical recipes for getting value out of Mural boards. Written for the three
audiences this server exists to serve: **product managers** who need workshop
output as text, **engineers** who need board data in a pipeline, and
**facilitators** who need to summarize what a session produced.

- [The basic loop](#the-basic-loop)
- [For product managers](#for-product-managers)
- [For engineers](#for-engineers)
- [For facilitators](#for-facilitators)
- [Working with large boards](#working-with-large-boards)
- [Reaching the long tail](#reaching-the-long-tail)
- [Prompting tips](#prompting-tips)

---

## The basic loop

Almost everything starts here:

```
list_workspaces  →  list_rooms  →  list_murals  →  get_mural_structure
                                                     or get_mural_text
```

In practice you just ask, and the model walks the chain:

> **You:** What's on my Sprint Retro board?
>
> **Claude:** *(list_workspaces → list_rooms → list_murals → get_mural_text)*
> The Sprint Retro board has 90 text items across 240 widgets…

If you already know the board name, skip the walk:

> Search my murals for "retrospective" and summarize the most recent one.

---

## For product managers

### Capture stickies, images, and stickers together

> Read mural `<id>` with get_mural_structure and tell me how the board is
> laid out: areas, sticky themes, what the images show, and which stickers
> look like votes.

`get_mural_structure` is the workshop tool. `get_mural_text` only returns
words, so photos and vote icons would be dropped.

### Turn a workshop board into a written summary

> Read mural `<id>` and write a one-page summary: the top themes, how many
> stickies support each, and any explicit decisions or action items.

`get_mural_text` returns items in reading order, so the board's visual structure
— columns, rows, groupings — survives into the model's interpretation.

### Recover the category structure

Workshop boards encode meaning in sticky **color**: went-well vs.
needs-improvement, one color per workstream, red for blockers. Plain text order
loses that. Ask for it explicitly:

> Pull the stickies from mural `<id>` grouped by color, and tell me what
> category each color seems to represent.

This uses `groupByColor: true`. It is the single highest-leverage option in the
whole server for workshop output.

### Extract action items across several boards

> List the murals in room `<id>`, then for each one pull the stickies and
> collect anything that reads like an action item into a single table with the
> board it came from.

### Compare two sessions

> Summarize mural `<id-1>` and mural `<id-2>`, then tell me what changed between
> them — themes that appeared, disappeared, or grew.

### Get decisions out of a vote

Voting sessions are where a workshop actually decided something.

> Find the voting results on mural `<id>` and tell me what the group picked.

This routes through `search_actions` → `get_voting_results`.

### Triage before reading

On a large board, summarize first:

> Give me a summary of mural `<id>` — how big is it and what's on it? Then read
> it in full only if it looks like it covers pricing.

`get_mural_summary` is much cheaper than a full text pull.

---

## For engineers

### Check your connection

Always the first debugging step:

> Check my Mural connection.

Returns your user, granted scopes, token expiry, and live rate-limit headers.
A `403` on some other tool is nearly always a scope missing from this list.

### Inspect raw widget data

When you need geometry, style, or fields the text extractor drops:

> Get the raw widgets from mural `<id>`, limit 20, and show me the full
> structure of the first sticky note.

Use this to discover fields worth adding to `TEXT_FIELDS` in `src/widgets.ts`.

### Pull board content into a file

> Read mural `<id>` and write the stickies to `retro.json`, one object per
> sticky with its text, color, and x/y position.

The MCP server itself is read-only against Mural, but Claude can write the
result locally.

### Audit board access

> Who has access to mural `<id>`, and what permission level does each person
> have?

Routes to `list_mural_users`.

### Map a workspace's structure

> Map out workspace `<id>`: every room, how many murals in each, and which were
> updated most recently.

### Understand rate limits before a bulk read

> Check my connection and tell me my remaining rate limit, then read every mural
> in room `<id>` one at a time.

The client serializes and throttles requests automatically, so a bulk read is
safe — it will just take proportionally longer.

---

## For facilitators

### Post-session recap

> Read mural `<id>` grouped by color and draft a recap email: what we covered,
> what each color category contained, what we decided, and what's outstanding.

### Check for unaddressed items

> Read mural `<id>` and list any sticky that looks like a question or a concern
> that has no visible response near it.

Because items carry `x`/`y`, the model can reason about proximity.

### Find a board you have lost

> Search my murals for "onboarding" and show me the five most recently updated.

### Check the timer state

> What's the timer state on mural `<id>`?

Routes to `get_mural_timer` — useful when facilitating remotely.

---

## Working with large boards

Real workshop boards run to thousands of widgets. The server caps page walks and
reports the fact rather than silently truncating.

**Watch for `truncated: true`.** It means the result is incomplete. Do not treat
it as the full picture.

Strategies, in order of preference:

1. **Summarize first.** `get_mural_summary` tells you the size and shape before
   you commit context to a full read.
2. **Filter by type.** If you only need stickies:

   > Pull only the sticky notes from mural `<id>` — skip shapes and text boxes.

   Uses the `types` parameter.
3. **Group by color.** Returns categorized text rather than a flat list — often
   a large reduction on a well-organized board.
4. **Narrow the search.** For `search_murals`, a more specific query beats
   paging deeper; search stops at 5 pages by design.

---

## Reaching the long tail

The eleven dedicated tools cover common paths. 24 further read-only
operations — tags, voting, timers, templates, folders, membership — are reached
by search:

> What Mural API operations are available for voting?

runs `search_actions`, which returns matching action IDs and their parameters.
The model then calls `execute_action`. You do not normally need to name either
tool; just describe what you want.

Available areas:

| Area | Examples |
|---|---|
| Tags | List a mural's tags; get one tag |
| Voting | Sessions, session details, results |
| Timers | Current timer state |
| Templates | Default, workspace, recent |
| Folders | Folders within a room |
| Membership | Users on a mural or room |
| Files | File widgets attached to a mural |
| Recent | Recently opened murals |

Full list in [API.md](API.md#action-catalog).

---

## Prompting tips

**Give an id when you have one.** `"Read mural abc123"` skips three navigation
calls versus `"read my retro board"`.

**Say what you want done with the text.** `"Read mural <id>"` returns a wall of
stickies. `"Read mural <id> and group the feedback into themes with counts"`
returns something you can use.

**Mention color for workshop boards.** It is the most commonly missed structure.

**Ask for a summary first on unfamiliar boards.** Cheaper, and it tells you
whether the full read is worth it.

**Do not ask it to write.** The server cannot create, modify, or delete anything
in Mural — no scope, no code path, no catalog entry. Asking Claude to "add a
sticky note" will fail. Have Claude write the content locally and paste it
yourself.

---

## What this server cannot do

Being explicit, since it shapes what to ask for:

| Not supported | Why |
|---|---|
| Creating or editing widgets | Read-only by design — see [SECURITY.md](../SECURITY.md#design-guarantees) |
| Creating murals or rooms | Same |
| Starting an export | That is a write. You can *read* the URL of an export started elsewhere. |
| Uploading files | Same |
| Real-time collaboration | The public API is request/response; there is no subscription |
| Rendering a board as an image | The API returns structured data, not pixels |
