# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately via [GitHub Security Advisories](https://github.com/stephschofield/mural-mcp/security/advisories/new).
Expect an initial response within 5 business days.

## Threat model

This server is a **read-only** client for the Mural public API. It runs locally
on a developer's machine as an MCP stdio server. It is not a network service and
does not listen on a port except transiently during the OAuth callback.

### What it holds

| Secret | Location | Protection |
|---|---|---|
| Client ID | Environment variable | Not secret, but identifies your app |
| Client secret | Environment variable | Never written to disk by this tool |
| Access token | `~/.mural-mcp/tokens.json` | File mode `0600`, dir mode `0700`, 15-min lifetime |
| Refresh token | `~/.mural-mcp/tokens.json` | File mode `0600`, dir mode `0700`, long-lived |

The refresh token is the most sensitive item. It can mint new access tokens
until revoked. Treat `~/.mural-mcp/tokens.json` like an SSH private key.

## Design guarantees

These are enforced in code, not by convention:

1. **No write path exists.** `MuralClient` exposes exactly one verb — `get()`.
   There is no `post`, `put`, `patch`, or `delete` method to call. Adding write
   capability requires editing `src/client.ts`.

2. **The action catalog is GET-only.** `src/actions.ts` contains no mutating
   endpoints. `execute_action` can only reach paths declared there, so it cannot
   be coaxed into a write by a crafted argument.

3. **Read-only scopes are requested.** The OAuth flow asks for `*:read` scopes
   exclusively (`src/config.ts` → `DEFAULT_SCOPES`). Even if the client were
   compromised, the token Mural issued cannot authorize a write.

4. **Secrets are never logged.** `src/auth.ts` deliberately surfaces Mural's
   error text on a failed token exchange but never echoes the request body,
   which carries the client secret.

5. **Tokens are written with restrictive permissions.** `saveTokens()` creates
   the parent directory `0700` and the file `0600`, then re-`chmod`s to cover
   the case where the file already existed (Node's `writeFile` mode applies only
   at creation).

6. **stdout is reserved for the MCP protocol.** All diagnostics go to stderr, so
   a stray log line cannot corrupt the transport or leak into a transcript.

## Operational guidance

**Do**

- Export credentials in your shell profile, or use your OS keychain.
- Use a dedicated Mural app for local development.
- Rotate the client secret (Mural app page → **Reset**) if it may have been
  exposed.
- Delete `~/.mural-mcp/tokens.json` when you finish working with a given account.

**Do not**

- Commit `.env`, `tokens.json`, or any file containing a client secret. The
  `.gitignore` blocks the common names, but it cannot catch a file you rename.
- Paste your client secret into an AI assistant prompt, an issue, or a PR.
- Store credentials in `claude_desktop_config.json` if that file is synced or
  backed up to a shared location — prefer environment variables.
- Widen scopes beyond what you need.

## Revoking access

1. Sign in to [app.mural.co](https://app.mural.co).
2. Avatar menu → **Create and manage apps**.
3. Select the app → **Reset** the client secret, or delete the app entirely.
4. Remove the local cache: `rm -f ~/.mural-mcp/tokens.json`.

Resetting the secret invalidates outstanding refresh tokens.

## Supported versions

| Version | Supported |
|---|---|
| 2.x | Yes |
| 1.x (`index.js` legacy prototype) | No — retained for reference only |
