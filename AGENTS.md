# mural-mcp

Read-only MCP server for the Mural public API. Use it from GitHub Copilot CLI
and VS Code Copilot Chat Agent mode to capture workshop boards.

## How to work here

- Never add write APIs. The HTTP client is GET-only on purpose.
- Never commit `.env`, tokens, client secrets, or live board contents.
- `npm run build` must work on Windows (no Unix-only `chmod`).
- `npm test` must pass: widget fixtures plus an MCP `initialize`/`tools/list` handshake.

## Workshop capture

When the user asks to read a Mural board:

1. `list_workspaces` → `list_rooms` → `list_murals` (or `search_murals`).
2. `get_mural_structure` for sticky notes, text notes, images, stickers, and areas.
3. `get_mural_text` with `groupByColor: true` when color encodes categories.
4. `get_mural_summary` first on huge boards.

Do not use `get_mural_widgets` unless geometry or raw fields are required.

## Copilot hosts

See [docs/COPILOT.md](docs/COPILOT.md). Repo configs:

- Copilot CLI / Agent Host: `.mcp.json` and `.github/mcp.json`
- VS Code Copilot Chat: `.vscode/mcp.json`
