# Mural MCP Server — verified evidence

## Live MCP handshake
- Server identifies as `mural-mcp` v2.0.0, protocol 2024-11-05
- Boots with NO credentials present (cached-token-only path)
- 11 tools advertised, ALL with readOnlyHint: true

## Read-only, proven four ways
1. Scopes: 6 read scopes requested, 0 write scopes
2. Client: MuralClient exposes exactly one verb, get()
3. Catalog: 24 actions, all GET
4. Contract: 11/11 tools annotated readOnlyHint: true

## Verified against developers.mural.co (2026-07-28)
- OAuth authorize + token URLs: exact match
- Access token lifetime 15 min: match
- All 6 read scope strings: exact match
- Rate limits 25/user/sec + 10,000/app/min: match
- All 6 rate-limit headers now captured (added X-RateLimit-App-Reset)

## Divergence found and handled
- Docs list /current-user -> 404s live. Working path is /users/me.

## Security
- gitleaks 8.24.3: 4 commits / ~196KB history + ~233KB tree -> NO LEAKS
- No credential files tracked, no secret literals, no PII
- CI gates every push on gitleaks + tracked-file scan

## Scale proven on real data
- Large boards (hundreds of widgets) were used to verify page walks and parsing. Examples in the docs use invented counts, not a named workshop.
