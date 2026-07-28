# Mural API Alignment

This server is a client for the [Mural public API](https://developers.mural.co/public).
This document records what was verified against Mural's official documentation,
what was corrected against the live API, and where the two disagree.

Last verified: **2026-07-28**

---

## Verified correct

Checked against Mural's published documentation and matching this codebase
exactly.

### OAuth endpoints

| Item | Value | Source |
|---|---|---|
| Authorization URL | `https://app.mural.co/api/public/v1/authorization/oauth2/` | [OAuth docs](https://developers.mural.co/public/docs/oauth) |
| Token URL | `https://app.mural.co/api/public/v1/authorization/oauth2/token` | [OAuth docs](https://developers.mural.co/public/docs/oauth) |
| Refresh URL | Same as token URL | [OAuth docs](https://developers.mural.co/public/docs/oauth) |
| Grant type | Authorization Code | [OAuth docs](https://developers.mural.co/public/docs/oauth) |
| Access token lifetime | 15 minutes | [OAuth docs](https://developers.mural.co/public/docs/oauth) |

Defined in `src/config.ts` as `MURAL_AUTH_URL` and `MURAL_TOKEN_URL`.

### Scopes

Mural publishes nine scopes — six read, three write. This server requests
**all six read scopes and none of the write scopes**:

| Scope | Requested | Grants |
|---|:---:|---|
| `workspaces:read` | Yes | View workspace settings and properties |
| `rooms:read` | Yes | Access room information and settings |
| `murals:read` | Yes | Fetch mural data from rooms or workspaces |
| `templates:read` | Yes | View template names, descriptions, categories |
| `users:read` | Yes | Retrieve user permission levels and details |
| `identity:read` | Yes | Access user name, avatar, company |
| `rooms:write` | **No** | *Create, modify, remove rooms* |
| `murals:write` | **No** | *Create murals, manage widgets and settings* |
| `templates:write` | **No** | *Generate or delete templates* |

Source: [Scopes documentation](https://developers.mural.co/public/docs/scopes).
Defined as `DEFAULT_SCOPES` in `src/config.ts`.

The write scopes are omitted deliberately. Mural returns `403` for a request
whose scope does not cover the resource, so the token this server holds is
incapable of mutation regardless of client behavior. This is the outermost of
the four read-only layers described in
[SECURITY.md](../SECURITY.md#design-guarantees).

### Rate limits

| Limit | Value |
|---|---|
| Per user | 25 requests/user/second, across all apps acting for that user |
| Per app | 10,000 requests/app/minute, across all users of the app |

Exceeding either returns `429 Too Many Requests`.
Source: [Rate limiting documentation](https://developers.mural.co/public/docs/rate-limiting).

This server throttles to ~20 req/sec (`MAX_REQUESTS_PER_SECOND` in
`src/config.ts`) — deliberate headroom, since the per-user limit is shared with
every other application acting on the same user's behalf.

### Rate-limit headers

All six documented headers are captured and surfaced through `check_connection`:

| Header | Field in `check_connection` |
|---|---|
| `X-RateLimit-Limit` | `rateLimit.limit` |
| `X-RateLimit-Remaining` | `rateLimit.remaining` |
| `X-RateLimit-Reset` | `rateLimit.resetAt` |
| `X-RateLimit-App-Limit` | `rateLimit.appLimit` |
| `X-RateLimit-App-Remaining` | `rateLimit.appRemaining` |
| `X-RateLimit-App-Reset` | `rateLimit.appResetAt` |

`*-Reset` headers carry epoch seconds and are converted to ISO-8601 timestamps.

---

## Known divergence from the docs

### `/users/me`, not `/current-user`

Mural's documentation refers to a current-user endpoint at `/current-user`.
**That path returns `404` against the live API.** The working path is
`/users/me`.

This was found empirically while testing against a real workspace and is
corrected in two places, each carrying a comment explaining why:

- `src/index.ts` — the `check_connection` tool
- `src/actions.ts` — the `get_current_user` action

If Mural later fixes the documented path or changes this one, both sites need
updating together.

> **Contributors:** when adding a catalog entry, verify the path against the
> live API rather than trusting the reference alone. Where they disagree, follow
> the live API and leave a comment saying so.

---

## Endpoints used

Every endpoint this server calls. All are `GET`; the catalog contains no
mutating endpoint, and `MuralClient` exposes no mutating verb.

### Dedicated tools

| Endpoint | Tool | Scope |
|---|---|---|
| `/users/me` | `check_connection` | `identity:read` |
| `/workspaces` | `list_workspaces` | `workspaces:read` |
| `/workspaces/{workspaceId}/rooms` | `list_rooms` | `rooms:read` |
| `/rooms/{roomId}/murals` | `list_murals` | `murals:read` |
| `/workspaces/{workspaceId}/murals` | `list_murals` | `murals:read` |
| `/murals/{muralId}` | `get_mural` | `murals:read` |
| `/murals/{muralId}/widgets` | `get_mural_text`, `get_mural_summary`, `get_mural_widgets` | `murals:read` |
| `/search/murals` | `search_murals` | `murals:read` |

### Action catalog

24 further endpoints reached via `search_actions` / `execute_action`. Full table
in [API.md](API.md#action-catalog).

---

## Response handling

### Envelope normalization

Mural's `value` field is not consistently shaped. Three forms observed against
the live API:

```jsonc
{ "value": [ ... ] }                        // most list endpoints
{ "value": { "widgets": [ ... ] } }         // some widget responses
{ "value": { "0": {...}, "1": {...} } }     // numeric-keyed object
```

`normalizeItems()` in `src/client.ts` handles all three and returns `[]` rather
than throwing on an unrecognized shape — a change in one endpoint's envelope
should degrade one tool, not crash the server.

### Pagination

Cursors are equally inconsistent. `extractNext()` checks, in order:

1. `body.next`
2. `body.value.next`
3. `body.value.nextToken`

Page walks are capped (20 pages; 5 for search) and report `truncated: true`
rather than silently returning partial results.

---

## Re-verifying

The Mural API evolves. To re-check this document:

1. Compare `DEFAULT_SCOPES` in `src/config.ts` against the
   [scopes page](https://developers.mural.co/public/docs/scopes).
2. Compare `MAX_REQUESTS_PER_SECOND` against the
   [rate limiting page](https://developers.mural.co/public/docs/rate-limiting).
3. Confirm the OAuth URLs on the
   [OAuth page](https://developers.mural.co/public/docs/oauth).
4. Test catalog paths against a live workspace — `search_actions` then
   `execute_action` for each — since the reference and the live API have
   disagreed before.
5. Update the "Last verified" date above.
