# Installation Guide

A complete walkthrough from zero to a working Mural MCP server. Budget about
ten minutes; most of it is waiting on the Mural app form.

- [Prerequisites](#prerequisites)
- [Step 1 — Create a Mural app](#step-1--create-a-mural-app)
- [Step 2 — Install the server](#step-2--install-the-server)
- [Step 3 — Provide credentials](#step-3--provide-credentials)
- [Step 4 — Authorize](#step-4--authorize)
- [Step 5 — Register with your MCP client](#step-5--register-with-your-mcp-client)
- [Step 6 — Verify](#step-6--verify)
- [Upgrading](#upgrading)
- [Uninstalling](#uninstalling)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 18+** | `node --version`. Node 18 is the floor because the server uses the built-in `fetch`. |
| **npm** | Ships with Node. |
| **A Mural account** | Any plan. You need permission to create an app — on some enterprise workspaces this is restricted by an admin. |
| **An MCP client** | Claude Code, Claude Desktop, or any MCP-compatible host. |

> **Enterprise note.** If your avatar menu has no **Create and manage apps**
> entry, your workspace admin has disabled app creation. You will need them to
> either enable it or create the app and share the Client ID with you. The
> client secret should be handled by whoever creates the app.

---

## Step 1 — Create a Mural app

1. Sign in at **[app.mural.co](https://app.mural.co)**.
2. Open the **avatar menu** (top right) → **Create and manage apps**.
3. Click **New app** (or **Create app**).
4. Fill in the form:

   | Field | Value |
   |---|---|
   | **App name** | `mural-mcp` (anything you like) |
   | **Redirect URL** | `http://localhost:3000/callback` |

   The redirect URL must match **exactly** — including the scheme, port, and
   path, with no trailing slash. A mismatch is the single most common cause of
   a failed authorization.

5. Enable these **read** scopes:

   ```
   workspaces:read
   rooms:read
   murals:read
   templates:read
   users:read
   identity:read
   ```

   The server requests exactly this set. Enabling fewer causes `403` errors on
   the corresponding tools; enabling more grants access this server will never
   use.

6. Save, then copy the **Client ID** and **Client secret**.

   > **The client secret is displayed only once.** If you lose it, use
   > **Reset** on the app page to generate a new one. Resetting invalidates any
   > existing refresh tokens, so you will need to re-run `npm run auth`.

No approval process is required, and Mural accepts `localhost` redirect URLs for
development.

---

## Step 2 — Install the server

```bash
git clone https://github.com/stephschofield/mural-mcp.git
cd mural-mcp
npm install
npm run build
```

`npm install` triggers the `prepare` script, which builds automatically — the
explicit `npm run build` is belt-and-braces and safe to repeat.

Confirm the build produced output:

```bash
ls build/index.js build/auth-cli.js
```

---

## Step 3 — Provide credentials

Pick **one** of these. Environment variables are recommended.

### Option A — Shell profile (recommended)

Keeps secrets out of every file in the project directory.

```bash
# Add to ~/.bashrc, ~/.zshrc, or ~/.config/fish/config.fish
export MURAL_CLIENT_ID=your_client_id
export MURAL_CLIENT_SECRET=your_client_secret
```

Reload your shell (`source ~/.bashrc`) or open a new terminal.

### Option B — `.env` file

```bash
cp .env.example .env
# then edit .env
```

`.env` is gitignored. Note that the server itself does **not** parse `.env` —
this option is for use with a runner that loads it for you, such as
`node --env-file=.env`. If you are unsure, use Option A.

### Configuration reference

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MURAL_CLIENT_ID` | For auth & refresh | — | OAuth client identifier |
| `MURAL_CLIENT_SECRET` | For auth & refresh | — | OAuth client secret |
| `MURAL_REDIRECT_URI` | No | `http://localhost:3000/callback` | Must match the Mural app exactly |
| `MURAL_TOKEN_PATH` | No | `~/.mural-mcp/tokens.json` | Where the token cache is written |

**Why credentials are only needed "for auth & refresh":** the MCP server boots
from a cached token alone. Credentials are consulted when a token needs
refreshing. This is deliberate — an MCP host with an incomplete environment
still starts and serves reads, instead of failing at boot and taking down every
tool. See `loadConfig(false)` in `src/index.ts`.

---

## Step 4 — Authorize

```bash
npm run auth
```

This will:

1. Open your browser to Mural's authorization page.
2. Start a temporary local listener on port 3000 to catch the redirect.
3. Exchange the returned code for tokens.
4. Write them to `~/.mural-mcp/tokens.json` with mode `0600`.

Approve the request in the browser. On success:

```
Authenticated. Tokens cached at /home/you/.mural-mcp/tokens.json (mode 0600).
Granted scopes: workspaces:read, rooms:read, murals:read, ...
```

Compare the granted scopes against the list in Step 1. A missing scope here
means it was not enabled on the app — fix it in Mural, then re-run `npm run auth`.

This is a **one-time** step. Access tokens are short-lived, but the server
refreshes them automatically using the stored refresh token.

> **Headless or WSL?** If the browser does not open, the CLI prints the
> authorization URL. Copy it into any browser — including one on a different
> machine — complete the approval, and the local listener will still receive the
> callback as long as the browser can reach `localhost:3000` on the machine
> running the CLI. For a fully remote host, use SSH port forwarding:
> `ssh -L 3000:localhost:3000 user@host`.

---

## Step 5 — Register with your MCP client

### Claude Code

```bash
claude mcp add mural --scope user \
  -e MURAL_CLIENT_ID="$MURAL_CLIENT_ID" \
  -e MURAL_CLIENT_SECRET="$MURAL_CLIENT_SECRET" \
  -- node "$(pwd)/build/index.js"
```

Run this from the repository root so `$(pwd)` resolves correctly, and from a
shell where the two variables are exported (Step 3, Option A).

Passing the credentials with `-e` matters: the MCP server is spawned by Claude
Code, which may not inherit your interactive shell's environment. Without them
the server still starts and serves reads, but the first token refresh fails with
a clear error.

Restart Claude Code, then run `/mcp` to confirm `mural` is connected.

### Claude Desktop

Edit the config file:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "mural": {
      "command": "node",
      "args": ["/absolute/path/to/mural-mcp/build/index.js"],
      "env": {
        "MURAL_CLIENT_ID": "your_client_id",
        "MURAL_CLIENT_SECRET": "your_client_secret"
      }
    }
  }
}
```

Use an **absolute** path — `~` is not expanded here. Restart Claude Desktop.

> **Security note.** This writes your client secret into a plain-text config
> file. If that file is synced or backed up somewhere shared, prefer the Claude
> Code approach or a secret manager.

### Other MCP clients

The server speaks MCP over **stdio**. Any compliant host works:

- **Command:** `node`
- **Args:** `["/absolute/path/to/mural-mcp/build/index.js"]`
- **Env:** `MURAL_CLIENT_ID`, `MURAL_CLIENT_SECRET`

---

## Step 6 — Verify

Ask your MCP client:

```
Check my Mural connection
```

`check_connection` should report your user, granted scopes, token expiry, and
rate-limit status. Then try a real read:

```
List my Mural workspaces
```

To test outside an MCP client:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
  | node build/index.js
```

A JSON response containing `"serverInfo"` and `"mural-mcp"` means the server is
healthy. (This is exactly what CI asserts.)

---

## Upgrading

```bash
cd mural-mcp
git pull
npm install
npm run build
```

Restart your MCP client. Cached tokens survive an upgrade — you only need to
re-run `npm run auth` if the required scopes changed.

---

## Uninstalling

```bash
claude mcp remove mural --scope user   # or remove the entry from your client config
rm -rf ~/.mural-mcp                    # delete the cached tokens
```

Then delete the app in Mural (avatar menu → **Create and manage apps**) to
revoke access entirely.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Not authenticated with Mural` | No token cache | Run `npm run auth` |
| `MURAL_CLIENT_ID is not set` | Credentials missing from `npm run auth`'s environment | Export them (Step 3), then retry in the same shell |
| `invalid_client` during auth | Client ID/secret mismatch or a stale copy | Re-copy from the Mural app page; **Reset** the secret if unsure |
| Browser shows `redirect_uri_mismatch` | Redirect URL differs from the app registration | Must be byte-identical, including port and path |
| `EADDRINUSE` on port 3000 | Something already holds the port | Free it, or set `MURAL_REDIRECT_URI` to another port **and** update the Mural app to match |
| `403` on a specific tool | That scope was not enabled | Enable it on the app, then re-run `npm run auth` |
| Token expired, cannot refresh | Server has no credentials in its environment | Add `-e` flags (Claude Code) or `env` block (Desktop) and restart |
| Empty widget list | Wrong mural id, or your account cannot open that board | Verify with `list_murals`; open the board in Mural to confirm access |
| Server missing from `/mcp` | Registration or path problem | Check the path is absolute and `build/index.js` exists; check client logs |
| `truncated: true` in a response | Page-walk cap hit | Expected on very large boards — narrow the query or filter by widget type |

### Diagnostics

```bash
# Is the token cache present and correctly permissioned? (expect -rw-------)
ls -l ~/.mural-mcp/tokens.json

# Are credentials visible in this shell? (prints only whether they are set)
[ -n "$MURAL_CLIENT_ID" ] && echo "client id: set" || echo "client id: MISSING"
[ -n "$MURAL_CLIENT_SECRET" ] && echo "client secret: set" || echo "client secret: MISSING"

# Does the server start?
node build/index.js   # expect: "mural-mcp v2.0.0 ready (read-only)" on stderr; Ctrl-C to exit
```

> Never paste the output of `echo $MURAL_CLIENT_SECRET` into an issue, a PR, or
> a chat transcript.

Still stuck? [Open an issue](https://github.com/stephschofield/mural-mcp/issues)
— include your Node version, OS, and the error text, with any secrets redacted.
