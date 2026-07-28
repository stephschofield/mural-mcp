/**
 * OAuth 2.0 token storage and refresh.
 *
 * Mural access tokens expire after 15 minutes, so refresh is not optional —
 * it is the core of making this server usable. Tokens are cached on disk
 * (mode 0600) so a refresh survives process restarts; the March version kept
 * them in memory and lost them on every exit.
 */

import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import {
  MURAL_TOKEN_URL,
  TOKEN_REFRESH_MARGIN_MS,
  type MuralConfig,
} from "./config.js";

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
  scopes?: string[];
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

/** Read the cached token set, or null if absent/unreadable. */
export async function loadTokens(path: string): Promise<TokenSet | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as TokenSet;
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persist tokens with owner-only permissions. */
export async function saveTokens(
  path: string,
  tokens: TokenSet,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  // writeFile's mode only applies on creation; enforce it for existing files.
  await chmod(path, 0o600);
}

function toTokenSet(data: TokenResponse, previousRefresh?: string): TokenSet {
  const refreshToken = data.refresh_token ?? previousRefresh;
  if (!refreshToken) {
    throw new Error(
      "Mural returned no refresh_token and none was cached. Re-run `npm run auth`.",
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    scopes: data.scope?.split(/[\s,]+/).filter(Boolean),
  };
}

async function postToken(
  body: Record<string, string>,
): Promise<TokenResponse> {
  const res = await fetch(MURAL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    // Surface Mural's error but never echo the request body — it holds the secret.
    throw new Error(
      `Mural token request failed (HTTP ${res.status}): ${text.slice(0, 400)}`,
    );
  }
  return JSON.parse(text) as TokenResponse;
}

/** Exchange an authorization code for the initial token set. */
export async function exchangeCode(
  config: MuralConfig,
  code: string,
): Promise<TokenSet> {
  const data = await postToken({
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code,
  });
  return toTokenSet(data);
}

/** Trade a refresh token for a fresh access token. */
export async function refreshTokens(
  config: MuralConfig,
  tokens: TokenSet,
): Promise<TokenSet> {
  // The server boots without credentials so cached tokens still serve reads.
  // Refresh genuinely needs them, so fail here with a fix rather than sending
  // empty strings to Mural and surfacing an opaque invalid_client error.
  if (!config.clientId || !config.clientSecret) {
    throw new Error(
      "The Mural access token expired and cannot be refreshed: MURAL_CLIENT_ID " +
        "and MURAL_CLIENT_SECRET are not set in this process's environment. Add " +
        "them to the MCP server's env config (or your shell profile) and restart.",
    );
  }

  const data = await postToken({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: tokens.refreshToken,
  });
  return toTokenSet(data, tokens.refreshToken);
}

/**
 * Return a valid access token, refreshing and re-persisting when it is
 * expired or within the refresh margin.
 */
export async function getValidAccessToken(
  config: MuralConfig,
): Promise<string> {
  const tokens = await loadTokens(config.tokenPath);
  if (!tokens) {
    throw new Error(
      "Not authenticated with Mural. Run `npm run auth` in the mural-mcp " +
        "directory to complete the OAuth flow, then retry.",
    );
  }

  if (Date.now() < tokens.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
    return tokens.accessToken;
  }

  const refreshed = await refreshTokens(config, tokens);
  await saveTokens(config.tokenPath, refreshed);
  return refreshed.accessToken;
}

/** Force a refresh regardless of expiry — used after an unexpected 401. */
export async function forceRefresh(config: MuralConfig): Promise<string> {
  const tokens = await loadTokens(config.tokenPath);
  if (!tokens) {
    throw new Error("Not authenticated with Mural. Run `npm run auth`.");
  }
  const refreshed = await refreshTokens(config, tokens);
  await saveTokens(config.tokenPath, refreshed);
  return refreshed.accessToken;
}
