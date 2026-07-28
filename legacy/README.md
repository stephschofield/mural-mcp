# Mural MCP Server — legacy prototype (v1, March 2026)

> **Archived. Do not use this for new installations.**
>
> This is the original single-file prototype, kept for reference and for the
> field-probing behavior it discovered against the live API. It requires you to
> obtain a Bearer token by hand (via Postman or the API test UI) and loses it on
> every restart.
>
> **Use the v2 server instead** — it does real OAuth login, caches tokens on
> disk, refreshes them automatically, paginates, and rate-limits.
> See the [main README](../README.md) and
> [installation guide](../docs/INSTALLATION.md).
>
> **This code is not runnable as shipped.** It depends on `axios`, which is
> deliberately not a dependency of v2 (which uses the built-in `fetch`). To run
> it for comparison: `npm install axios && node legacy/index.js`.

Pull text content from your Mural boards directly into Claude.

## What it does

Exposes 5 tools to Claude:

| Tool | Description |
|------|-------------|
| `list_workspaces` | List your Mural workspaces |
| `list_rooms` | List rooms in a workspace |
| `list_murals` | List murals in a workspace or room |
| `get_text_content` | Extract all text (sticky notes, text boxes, shapes, cards) from a board |
| `get_mural_summary` | Overview of widget counts and types on a board |

## Setup

### 1. Get a Mural OAuth Token

1. Go to [Mural Developer Portal](https://developers.mural.co/public)
2. Log in and go to **My Apps** → **Create new app**
3. Set these scopes: `murals:read`, `rooms:read`, `workspaces:read`
4. Use the **API Reference** test UI or Postman to complete the OAuth flow and get a Bearer token
   - Authorization URL: `https://app.mural.co/api/public/v1/authorization/oauth2/`
   - Token URL: `https://app.mural.co/api/public/v1/authorization/oauth2/token`

> **Note:** Tokens expire after 15 minutes by default. For long-term use, store your `refresh_token` and use it to get new access tokens automatically.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure Claude Desktop

Add this to your `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mural": {
      "command": "node",
      "args": ["/absolute/path/to/mural-mcp/index.js"],
      "env": {
        "MURAL_TOKEN": "your_bearer_token_here"
      }
    }
  }
}
```

### 4. Restart Claude Desktop

The Mural tools will now appear in Claude.

## Example usage in Claude

```
"List my Mural workspaces"
"Show me the murals in room [room_id]"
"Pull all the sticky note text from mural [mural_id]"
"Give me a summary of what's on this board: [mural_id]"
```

## Token refresh (optional)

If you need long-lived access, refresh your token with:

```bash
curl -X POST 'https://app.mural.co/api/public/v1/authorization/oauth2/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'client_id=YOUR_CLIENT_ID' \
  -d 'client_secret=YOUR_CLIENT_SECRET' \
  -d 'refresh_token=YOUR_REFRESH_TOKEN' \
  -d 'grant_type=refresh_token'
```

Update `MURAL_TOKEN` in your config with the new `access_token`.
