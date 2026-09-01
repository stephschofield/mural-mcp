# Copilot instructions for mural-mcp

This repository is a read-only Model Context Protocol server for the Mural
public API. GitHub Copilot CLI and VS Code Copilot Chat consume it over stdio.

## Do

- Keep the server GET-only.
- Use `get_mural_structure` when capturing workshop boards (sticky notes, text,
  images, stickers, areas).
- Use `get_mural_text` with `groupByColor` for themed sticky walls.
- Point Copilot hosts at `build/index.js`. See `docs/COPILOT.md`.

## Do not

- Add create/update/delete Mural endpoints.
- Commit credentials, `.env`, or `tokens.json`.
- Put secrets in `.mcp.json`, `.github/mcp.json`, or `.vscode/mcp.json`.
