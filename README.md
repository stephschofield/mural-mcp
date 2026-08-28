<div align="center">

# Mural MCP Server

**Read Mural boards from GitHub Copilot CLI and VS Code Copilot Chat.**

Pull sticky notes, text, images, and stickers. Summarize workshop output.
Browse workspaces. All read-only.

[![CI](https://github.com/stephschofield/mural-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/stephschofield/mural-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](https://nodejs.org)
[![Read-only](https://img.shields.io/badge/access-read--only-blue.svg)](SECURITY.md#design-guarantees)

[Install](#install) · [Copilot](docs/COPILOT.md) · [Usage](docs/USAGE.md) · [API](docs/API.md) · [Security](SECURITY.md)

</div>

---

This is a local [Model Context Protocol](https://modelcontextprotocol.io/)
server. GitHub Copilot CLI, VS Code Copilot Chat, and other MCP clients start
it over stdio. It talks to the [Mural public API](https://developers.mural.co/public)
with **read scopes only**. It cannot create, edit, or delete boards.

**Do not put secrets in this repository.** Client IDs, client secrets, and
OAuth tokens stay in your environment or in `~/.mural-mcp/tokens.json` on your
machine. Those paths are gitignored.

---

## Install

Budget about ten minutes. Most of that is the Mural app form.

### 1. Prerequisites

| Need | Check |
|---|---|
| Node.js 18 or newer | `node --version` |
| npm | Ships with Node |
| A Mural account | You must be allowed to create an app |
| GitHub Copilot CLI and/or VS Code | CLI: `copilot --version`. VS Code: 1.99+ with Copilot Chat |

### 2. Clone and build

```bash
git clone https://github.com/stephschofield/mural-mcp.git
cd mural-mcp
npm install
npm run build
```

Confirm `build/index.js` exists. On Windows, `npm run build` does not need
`chmod`. If `prepare` already built during `npm install`, running `build`
again is safe.

### 3. Create a Mural app (no approval wait)

1. Sign in at [app.mural.co](https://app.mural.co).
2. Avatar menu (top right) → **Create and manage apps** → **New app**.
3. Set:

   | Field | Value |
   |---|---|
   | App name | `mural-mcp` (any name is fine) |
   | Redirect URL | `http://localhost:3000/callback` |

   The redirect URL must match exactly. No trailing slash.

4. Enable **only** these scopes:

   ```
   workspaces:read
   rooms:read
   murals:read
   templates:read
   users:read
   identity:read
   ```

5. Save. Copy the **Client ID** and **Client secret**.

The client secret is shown **once**. If you lose it, reset it on the app page
and run `npm run auth` again.

If **Create and manage apps** is missing, your workspace admin has disabled
app creation. Ask them to create the app and give you the client ID and
secret out of band. Do not commit those values.

### 4. Put credentials in your environment

Do not write them into any file in this repo.

**macOS / Linux:**

```bash
export MURAL_CLIENT_ID="your_client_id"
export MURAL_CLIENT_SECRET="your_client_secret"
```

Add the same two lines to your shell profile (`~/.bashrc`, `~/.zshrc`) if you
want them to persist.

**Windows PowerShell (current session):**

```powershell
$env:MURAL_CLIENT_ID = "your_client_id"
$env:MURAL_CLIENT_SECRET = "your_client_secret"
```

**Windows PowerShell (persist for your user account):**

```powershell
[Environment]::SetEnvironmentVariable("MURAL_CLIENT_ID", "your_client_id", "User")
[Environment]::SetEnvironmentVariable("MURAL_CLIENT_SECRET", "your_client_secret", "User")
```

Close and reopen the terminal after setting User environment variables.

Optional: copy `.env.example` to `.env` for a runner that loads it
(`node --env-file=.env`). `.env` is gitignored. The server does not read
`.env` by itself.

### 5. Authorize once

From the repo root, in a shell where the two variables are set:

```bash
npm run auth
```

A browser window opens. Approve the app. Tokens are cached at
`~/.mural-mcp/tokens.json` with mode `0600`. This is local to your machine.

If the browser does not open, the CLI prints a URL. Open it yourself. The
local listener on port 3000 must be reachable as `localhost`.

You should not need to run `auth` again unless you reset the secret or change
scopes.

### 6. Connect GitHub Copilot CLI

Copilot CLI does **not** pass your shell environment into MCP servers except
`PATH`. You must hand it the two variables.

**macOS / Linux** (run from the repo root):

```bash
copilot mcp add mural \
  --env MURAL_CLIENT_ID="$MURAL_CLIENT_ID" \
  --env MURAL_CLIENT_SECRET="$MURAL_CLIENT_SECRET" \
  -- node "$(pwd)/build/index.js"
```

**Windows PowerShell** (run from the repo root):

```powershell
copilot mcp add mural `
  --env MURAL_CLIENT_ID=$env:MURAL_CLIENT_ID `
  --env MURAL_CLIENT_SECRET=$env:MURAL_CLIENT_SECRET `
  -- node "$PWD\build\index.js"
```

Check:

```bash
copilot mcp list
copilot mcp get mural
```

You should see a user server named `mural`. Start Copilot and ask:

```
Check my Mural connection
```

This repo also ships `.mcp.json`. If you start `copilot` from the repo root,
that file is loaded automatically. Prefer `copilot mcp add` for use from any
directory.

### 7. Connect VS Code Copilot Chat

1. `npm run build` so `build/index.js` exists.
2. Open **this folder** in VS Code.
3. Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → **MCP: List Servers**.
   You should see `mural` from `.vscode/mcp.json`.
4. Start the server if prompted. Trust it.
5. Open Copilot Chat. Switch to **Agent** mode (Ask mode cannot call MCP tools).
6. Ask: `Check my Mural connection`.

To use the same server from every workspace, Command Palette →
**MCP: Open User Configuration** and add a server with an **absolute** path
to `build/index.js`. Do not paste your client secret into that file if it is
synced.

VS Code inherits your user environment, so User-level `MURAL_CLIENT_ID` and
`MURAL_CLIENT_SECRET` are visible to the server. Cached tokens in
`~/.mural-mcp/tokens.json` are used either way.

### 8. Confirm it works

No Mural credentials needed for this one:

```bash
npm test
```

That builds, runs widget fixture tests, and proves the process answers MCP
`initialize` and `tools/list`.

With auth completed, in Copilot CLI or VS Code Agent chat:

```
Check my Mural connection
List my Mural workspaces
```

`check_connection` should report your user, granted scopes, and
`mode: "read-only"`.

---

## Use it from another project

Your workshop repo does not need this source tree. Point Copilot at the
built file with an absolute path.

**Copilot CLI** (`.mcp.json` in the other repo):

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

**VS Code Copilot Chat** (`.vscode/mcp.json` in the other repo):

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

On Windows, use forward slashes:
`C:/Users/you/repos/mural-mcp/build/index.js`.

Each person still runs `npm run auth` once on their own machine.

More host detail: [docs/COPILOT.md](docs/COPILOT.md).
Claude Code and Claude Desktop: [docs/INSTALLATION.md](docs/INSTALLATION.md).

---

## What to ask

```
List my Mural workspaces, then find the latest envisioning board
and summarize sticky notes grouped by color.
```

```
Read mural <id> with get_mural_structure. Report sticky notes,
text notes, images, and stickers, and how they sit inside areas.
```

Typical chain: `list_workspaces` → `list_rooms` → `list_murals` →
`get_mural_structure` or `get_mural_text` (set `groupByColor: true` when
color is a category).

Recipes: [docs/USAGE.md](docs/USAGE.md).

For a comprehensive workshop assessment in Copilot CLI, install this repository
as a plugin and invoke the included skill:

```powershell
copilot plugin install stephschofield/mural-mcp
```

```text
/mural:assess <Mural board URL and assessment request>
```

The skill combines board text and visual structure with an optional workshop
date, transcript, and supporting files from the current project. See
[Copilot setup](docs/COPILOT.md#assessment-skill).

---

## Tools

| Tool | Purpose |
|---|---|
| `check_connection` | Verify auth; show user, scopes, rate-limit status |
| `list_workspaces` | List workspaces |
| `list_rooms` | List rooms in a workspace |
| `list_murals` | List murals in a room or workspace |
| `get_mural` | Metadata for one mural |
| **`get_mural_text`** | All text in reading order, optional color grouping |
| **`get_mural_structure`** | Workshop capture: sticky notes, text, images, stickers, areas |
| `get_mural_summary` | Widget counts by type plus a text sample |
| `get_mural_widgets` | Raw widgets with geometry and style |
| `search_murals` | Find murals by text query |
| `search_actions` | Discover 24 more read-only API operations |
| `execute_action` | Run a discovered action |

Twelve dedicated tools cover the common path. The remaining read endpoints
live in a catalog so every request is not paying for ~100 schemas. See
[ARCHITECTURE.md](docs/ARCHITECTURE.md#tool-design-why-hybrid).

---

## Read-only by design

This server cannot create, modify, or delete anything in Mural. Four layers:

1. **Scopes.** OAuth requests `*:read` only. Mural rejects writes.
2. **Client.** `MuralClient` exposes `get()` only. No post/put/patch/delete.
3. **Catalog.** `execute_action` can only call GET paths.
4. **Contract.** Every tool sets `readOnlyHint: true`.

Details: [SECURITY.md](SECURITY.md#design-guarantees).

---

## Documentation

| Document | Contents |
|---|---|
| [Copilot](docs/COPILOT.md) | CLI and VS Code Copilot Chat |
| [Installation](docs/INSTALLATION.md) | Claude hosts, WSL, troubleshooting |
| [Usage](docs/USAGE.md) | Recipes by role |
| [API Reference](docs/API.md) | Tools, parameters, return shapes |
| [Architecture](docs/ARCHITECTURE.md) | Module map and design decisions |
| [Mural API Alignment](docs/MURAL_API_ALIGNMENT.md) | What was checked against Mural's docs |
| [Security](SECURITY.md) | Threat model, credentials, revocation |
| [Contributing](CONTRIBUTING.md) | Development setup |

---

## Development

```bash
npm run dev        # tsc --watch
npm run typecheck  # no emit
npm run build      # compile (chmod on Unix only)
npm test           # build + widget fixtures + MCP handshake
```

CI typechecks and builds on Node 18/20/22, runs the MCP handshake, and scans
every push with gitleaks.

```
src/
├── config.ts     Endpoints, scopes, env loading
├── auth.ts       Token cache, refresh, code exchange
├── auth-cli.ts   `npm run auth` localhost OAuth flow
├── client.ts     GET-only HTTP
├── widgets.ts    Text and structure extraction
├── actions.ts    Long-tail action catalog
└── index.ts      MCP server and tool definitions

legacy/           archived v1 prototype. Do not install from here.
```

---

## License

[MIT](LICENSE)
