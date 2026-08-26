# GitHub Copilot setup

How this server runs natively in **GitHub Copilot CLI** and **VS Code Copilot Chat**.
Both hosts speak MCP over stdio. Claude-specific registration is not required.

- [What Copilot needs](#what-copilot-needs)
- [One-time server install](#one-time-server-install)
- [Copilot CLI](#copilot-cli)
- [VS Code Copilot Chat](#vs-code-copilot-chat)
- [Use it from another project](#use-it-from-another-project)
- [Workshop prompts](#workshop-prompts)
- [Verify](#verify)
- [Troubleshooting](#troubleshooting)

---

## What Copilot needs

| Host | Config file | Top-level key | Server `type` |
|---|---|---|---|
| Copilot CLI | `~/.copilot/mcp-config.json` (user) or `.mcp.json` / `.github/mcp.json` (repo) | `mcpServers` | `stdio` or `local` |
| VS Code Copilot Chat | `.vscode/mcp.json` (workspace) or user `mcp.json` | `servers` | `stdio` |
| Copilot Agent Host | workspace `.mcp.json` or `~/.copilot/mcp-config.json` | `mcpServers` | `stdio` |

This repo ships:

| File | Used by |
|---|---|
| `.mcp.json` | Copilot CLI and Agent Host when you start Copilot in this repo |
| `.github/mcp.json` | Shared Copilot CLI config (same contents as `.mcp.json`) |
| `.vscode/mcp.json` | VS Code Copilot Chat in this workspace |

Do not put `MURAL_CLIENT_ID` or `MURAL_CLIENT_SECRET` in committed files.

---

## One-time server install

Same as the [Installation Guide](INSTALLATION.md) through Step 4:

```bash
git clone https://github.com/stephschofield/mural-mcp.git
cd mural-mcp
npm install
npm run build
npm run auth
```

`npm run auth` caches tokens at `~/.mural-mcp/tokens.json`. The MCP process
can start from that cache alone. Client id and secret are only required when
the access token refreshes (every ~15 minutes).

---

## Copilot CLI

### Option A: user-level (available in every directory)

From this repo after `npm run build`:

```bash
copilot mcp add mural --env MURAL_CLIENT_ID=your_client_id --env MURAL_CLIENT_SECRET=your_client_secret -- node "$(pwd)/build/index.js"
```

On Windows PowerShell:

```powershell
copilot mcp add mural `
  --env MURAL_CLIENT_ID=$env:MURAL_CLIENT_ID `
  --env MURAL_CLIENT_SECRET=$env:MURAL_CLIENT_SECRET `
  -- node "$PWD\build\index.js"
```

Copilot CLI does **not** inherit arbitrary shell environment variables into MCP
servers. `PATH` is inherited. Everything else, including Mural credentials,
must be passed with `--env` or written under `env` in
`~/.copilot/mcp-config.json`.

Confirm:

```bash
copilot mcp list
copilot mcp get mural
```

You should see `mural` as a user server. Start Copilot and ask:

```
Check my Mural connection
```

### Option B: this repository only

Start Copilot CLI from the repo root. It loads `.mcp.json` automatically.

```bash
cd mural-mcp
copilot
```

If token refresh fails, add credentials to your **user** config (Option A).
Do not commit them.

### Interactive add

Inside Copilot CLI:

```
/mcp add
```

Choose **STDIO**, command `node /absolute/path/to/mural-mcp/build/index.js`,
tools `*`, and set the two `MURAL_*` environment variables.

---

## VS Code Copilot Chat

### This repository

1. `npm run build` so `build/index.js` exists.
2. Open this folder in VS Code.
3. Command Palette: **MCP: List Servers**. You should see `mural`.
4. Start it if prompted. Trust the server.
5. Open Copilot Chat in **Agent** mode.
6. Ask: `Check my Mural connection`.

`.vscode/mcp.json` is already in the repo:

```json
{
  "servers": {
    "mural": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/build/index.js"]
    }
  }
}
```

VS Code inherits your user environment, so `MURAL_CLIENT_ID` /
`MURAL_CLIENT_SECRET` set in Windows User environment variables are visible
to the server. Tokens in `~/.mural-mcp/tokens.json` are used either way.

### All workspaces (user profile)

Command Palette: **MCP: Open User Configuration**, then add a `mural` server
with an **absolute** path to `build/index.js`. Or from a terminal:

```bash
code --add-mcp "{\"name\":\"mural\",\"type\":\"stdio\",\"command\":\"node\",\"args\":[\"/absolute/path/to/mural-mcp/build/index.js\"]}"
```

### Agent mode

MCP tools are invoked from Copilot Chat **Agent** mode. Ask mode cannot call
them. Use the tools picker on the chat input to confirm `mural` tools are
enabled.

---

## Use it from another project

The workshop repo does not need to contain this source. Point Copilot at the
built server.

**Copilot CLI** (in the workshop repo, `.mcp.json`):

```json
{
  "mcpServers": {
    "mural": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/mural-mcp/build/index.js"],
      "tools": ["*"]
    }
  }
}
```

**VS Code Copilot Chat** (in the workshop repo, `.vscode/mcp.json`):

```json
{
  "servers": {
    "mural": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/mural-mcp/build/index.js"]
    }
  }
}
```

Replace the path with your clone. On Windows use forward slashes or escaped
backslashes: `C:/Users/you/repos/mural-mcp/build/index.js`.

Each teammate still runs `npm run auth` once on their machine so tokens land
in their own `~/.mural-mcp/tokens.json`.

---

## Workshop prompts

After the server is connected, in Copilot CLI or VS Code Agent chat:

```
List my Mural workspaces, then find the latest envisioning board
and summarize sticky notes grouped by color.
```

```
Read mural <id> with get_mural_structure. Report sticky notes,
text notes, images, and stickers, and how they sit inside areas.
```

```
Capture this workshop board as a decision record: themes,
counts, action items, and any images or stickers that mark votes.
```

Typical tool chain:

`list_workspaces` → `list_rooms` → `list_murals` → `get_mural_structure`
and/or `get_mural_text` (with `groupByColor: true`)

---

## Verify

No Mural credentials required for the protocol check:

```bash
npm test
```

That builds, runs widget fixture tests, and proves `initialize` + `tools/list`
over stdio.

With credentials and a cached token:

```
Check my Mural connection
List my Mural workspaces
```

`check_connection` should report your user, scopes, and `mode: "read-only"`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `chmod` fails on Windows | Use current `npm run build`. It skips chmod on win32. |
| Copilot CLI lists `mural` but tools never appear | Build is missing. Run `npm run build`. Path in config must point at `build/index.js`. |
| Token refresh error in Copilot CLI | CLI does not inherit shell env. Re-add the server with `--env MURAL_CLIENT_ID=... --env MURAL_CLIENT_SECRET=...`. |
| VS Code Chat does not call mural tools | Switch to Agent mode. Enable the mural tools in the tools picker. Reload the window after editing `mcp.json`. |
| `No cached tokens` | Run `npm run auth` in the mural-mcp directory. |
| Org policy blocks MCP | Copilot Business/Enterprise needs the **MCP servers in Copilot** policy enabled. |
| Relative `./build/index.js` fails | Start Copilot from the mural-mcp root, or use an absolute path (user-level add). |
